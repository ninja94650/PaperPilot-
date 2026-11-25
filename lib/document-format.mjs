export type DocumentFormat = "pdf" | "docx" | "pptx" | "odt" | "odp" | "rtf" | "doc" | "ppt" | "png" | "jpeg" | "webp" | "unknown";
export type EditorKind = "pdf" | "word" | "presentation" | "image" | "unsupported";
export type FormatDetection = { format: DocumentFormat; editor: EditorKind; confidence: "signature" | "container" | "text" | "extension"; warning?: string };

const signatures = {
  pdf: [0x25,0x50,0x44,0x46,0x2d],
  png: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],
  jpeg: [0xff,0xd8,0xff],
  ole: [0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]
} as const;

function starts(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}
function ascii(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder("latin1").decode(bytes.subarray(start, start + length));
}
function zipEntries(bytes: Uint8Array): Set<string> {
  const entries = new Set<string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const count = view.getUint16(offset + 10, true);
    const centralOffset = view.getUint32(offset + 16, true);
    let cursor = centralOffset;
    for (let i = 0; i < count && cursor + 46 <= bytes.length; i += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      if (cursor + 46 + nameLength > bytes.length) break;
      entries.add(ascii(bytes, cursor + 46, nameLength));
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    break;
  }
  return entries;
}
function zipMimetype(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cursor = 0;
  while (cursor + 30 <= bytes.length && view.getUint32(cursor, true) === 0x04034b50) {
    const method = view.getUint16(cursor + 8, true);
    const compressedSize = view.getUint32(cursor + 18, true);
    const nameLength = view.getUint16(cursor + 26, true);
    const extraLength = view.getUint16(cursor + 28, true);
    const name = ascii(bytes, cursor + 30, nameLength);
    const dataStart = cursor + 30 + nameLength + extraLength;
    if (dataStart + compressedSize > bytes.length) return null;
    if (name === "mimetype" && method === 0) return ascii(bytes, dataStart, compressedSize);
    if (compressedSize === 0) return null;
    cursor = dataStart + compressedSize;
  }
  return null;
}
function editorFor(format: DocumentFormat): EditorKind {
  if (format === "pdf") return "pdf";
  if (format === "doc" || format === "docx" || format === "odt" || format === "rtf") return "word";
  if (format === "ppt" || format === "pptx" || format === "odp") return "presentation";
  if (format === "png" || format === "jpeg" || format === "webp") return "image";
  return "unsupported";
}
function extensionFormat(name: string): DocumentFormat {
  const ext = name.split(".").pop()?.toLowerCase();
  const formats: Record<string, DocumentFormat> = { pdf:"pdf",doc:"doc",docx:"docx",ppt:"ppt",pptx:"pptx",odt:"odt",odp:"odp",rtf:"rtf",png:"png",jpg:"jpeg",jpeg:"jpeg",webp:"webp" };
  return formats[ext ?? ""] ?? "unknown";
}

/** Detect using file bytes first. Extensions are only a fallback for formats whose signature is ambiguous. */
export function detectDocumentFormat(bytes: Uint8Array, filename = "", mimeType = ""): FormatDetection {
  if (starts(bytes, signatures.pdf)) return { format:"pdf", editor:"pdf", confidence:"signature" };
  if (starts(bytes, signatures.png)) return { format:"png", editor:"image", confidence:"signature" };
  if (starts(bytes, signatures.jpeg)) return { format:"jpeg", editor:"image", confidence:"signature" };
  if (bytes.length >= 12 && ascii(bytes,0,4) === "RIFF" && ascii(bytes,8,4) === "WEBP") return { format:"webp", editor:"image", confidence:"signature" };
  if (ascii(bytes,0,5) === "{\\rtf") return { format:"rtf", editor:"word", confidence:"text" };
  if (starts(bytes, signatures.ole)) {
    const hint = extensionFormat(filename);
    if (hint === "doc" || hint === "ppt") return { format:hint, editor:editorFor(hint), confidence:"extension", warning:"Legacy OLE container detected; the extension is used to distinguish DOC from PPT." };
    return { format:"unknown", editor:"unsupported", confidence:"signature", warning:"Legacy Office container detected, but DOC versus PPT could not be established safely." };
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = zipEntries(bytes);
    const has = (entry: string) => entries.has(entry);
    if (has("word/document.xml") && has("[Content_Types].xml")) return { format:"docx", editor:"word", confidence:"container" };
    if (has("ppt/presentation.xml") && has("[Content_Types].xml")) return { format:"pptx", editor:"presentation", confidence:"container" };
    if (has("mimetype")) {
      const mime = zipMimetype(bytes);
      if (mime === "application/vnd.oasis.opendocument.text") return { format:"odt", editor:"word", confidence:"container" };
      if (mime === "application/vnd.oasis.opendocument.presentation") return { format:"odp", editor:"presentation", confidence:"container" };
    }
  }
  const hinted = extensionFormat(filename);
  if (hinted !== "unknown" && (hinted === "doc" || hinted === "ppt")) return { format:hinted, editor:editorFor(hinted), confidence:"extension", warning:"Legacy Office file signature is not verifiable; validate again in the isolated conversion worker." };
  if (hinted !== "unknown") return { format:"unknown", editor:"unsupported", confidence:"extension", warning:"The file extension does not match a recognized file signature. The file was not routed to an editor." };
  const mimeHint = mimeType.toLowerCase();
  if (mimeHint === "application/rtf") return { format:"unknown", editor:"unsupported", confidence:"extension", warning:"RTF MIME type was provided, but the file signature is invalid." };
  return { format:"unknown", editor:"unsupported", confidence:"signature", warning:"Unsupported or unrecognized file signature." };
}

export function editorLabel(editor: EditorKind): string {
  return editor === "pdf" ? "PDF Studio" : editor === "word" ? "Word Studio" : editor === "presentation" ? "Presentation Studio" : editor === "image" ? "Image Studio" : "Unsupported file";
}
