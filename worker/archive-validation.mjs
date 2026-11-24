const ZIP_SIGNATURES = {
  endOfCentralDirectory: 0x06054b50,
  centralDirectoryEntry: 0x02014b50,
  localFileHeader: 0x04034b50
};

export const OOXML_ARCHIVE_LIMITS = Object.freeze({
  maxEntries: 1_000,
  maxEntryBytes: 32 * 1024 * 1024,
  maxExpandedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxPathBytes: 512
});

function fail(message) {
  throw new Error("The Office package is invalid or unsafe: " + message);
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_SIGNATURES.endOfCentralDirectory) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  fail("ZIP directory record is missing or truncated.");
}

function decodeEntryName(bytes, utf8) {
  try {
    const decoder = new TextDecoder(utf8 ? "utf-8" : "windows-1252", { fatal: true });
    return decoder.decode(bytes);
  } catch {
    fail("An archive entry has an invalid filename encoding.");
  }
}

function validateEntryPath(name) {
  if (!name || name.length > OOXML_ARCHIVE_LIMITS.maxPathBytes) fail("An archive entry path is empty or too long.");
  if (name.includes("\\") || name.startsWith("/") || /^[a-z]:/i.test(name) || name.includes("\0")) {
    fail("An archive entry uses an absolute or platform-specific path.");
  }
  const segments = name.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    fail("An archive entry attempts path traversal.");
  }
  if (segments.some((segment) => segment.length === 0) && !name.endsWith("/")) {
    fail("An archive entry contains an empty path segment.");
  }
  if (/\bvbaproject\.bin$/i.test(name)) fail("Macro-enabled Office packages are not accepted.");
}

export function validateOOXMLArchive(buffer, expectedMainPart) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) fail("The ZIP package is too small.");
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    fail("Multi-disk ZIP packages are not supported.");
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    fail("ZIP64 packages are not supported by the bounded validator.");
  }
  if (entryCount < 1 || entryCount > OOXML_ARCHIVE_LIMITS.maxEntries) {
    fail("The package contains too many entries.");
  }
  if (centralOffset + centralSize !== eocdOffset || centralOffset > eocdOffset) {
    fail("The ZIP central directory bounds are inconsistent.");
  }

  const names = new Set();
  const localRanges = [];
  let expandedBytes = 0;
  let cursor = centralOffset;
  const centralEnd = centralOffset + centralSize;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralEnd || buffer.readUInt32LE(cursor) !== ZIP_SIGNATURES.centralDirectoryEntry) {
      fail("A central directory entry is truncated or malformed.");
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const startDisk = buffer.readUInt16LE(cursor + 34);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;

    if (cursor + recordLength > centralEnd || nameLength < 1) fail("A central directory entry has invalid lengths.");
    if (startDisk !== 0) fail("Split archives are not supported.");
    if ((flags & 0x0001) !== 0) fail("Encrypted Office packages are not supported.");
    if (method !== 0 && method !== 8) fail("An archive entry uses an unsupported compression method.");
    if (compressedBytes === 0xffffffff || uncompressedBytes === 0xffffffff || localOffset === 0xffffffff) {
      fail("ZIP64 entry metadata is not supported.");
    }

    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeEntryName(nameBytes, (flags & 0x0800) !== 0);
    validateEntryPath(name);
    const normalizedName = name.toLocaleLowerCase("en-US");
    if (names.has(normalizedName)) fail("The package contains duplicate entry paths.");
    names.add(normalizedName);

    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) fail("Symbolic links are not accepted in Office packages.");

    if (uncompressedBytes > OOXML_ARCHIVE_LIMITS.maxEntryBytes) {
      fail("An archive entry exceeds the expanded-size limit.");
    }
    expandedBytes += uncompressedBytes;
    if (expandedBytes > OOXML_ARCHIVE_LIMITS.maxExpandedBytes) {
      fail("The package exceeds the total expanded-size limit.");
    }
    if (uncompressedBytes > 0) {
      if (compressedBytes === 0 || uncompressedBytes / compressedBytes > OOXML_ARCHIVE_LIMITS.maxCompressionRatio) {
        fail("An archive entry exceeds the compression-ratio limit.");
      }
    }

    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== ZIP_SIGNATURES.localFileHeader) {
      fail("A local file header is missing or outside the data region.");
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedBytes;
    if (dataStart > centralOffset || dataEnd > centralOffset) fail("An entry's compressed data overlaps the central directory.");
    const localName = decodeEntryName(
      buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength),
      (flags & 0x0800) !== 0
    );
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    if (localName !== name || localFlags !== flags || localMethod !== method) {
      fail("Local and central directory metadata do not match.");
    }
    localRanges.push([localOffset, dataEnd]);
    cursor += recordLength;
  }

  if (cursor !== centralEnd) fail("The central directory contains unexpected trailing data.");
  localRanges.sort((a, b) => a[0] - b[0]);
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index][0] < localRanges[index - 1][1]) {
      fail("Archive entries overlap in the data region.");
    }
  }

  if (!names.has("[content_types].xml".toLocaleLowerCase("en-US")) || !names.has(expectedMainPart.toLocaleLowerCase("en-US"))) {
    fail("The package is missing required Office document parts.");
  }
  return { entries: entryCount, expandedBytes };
}
