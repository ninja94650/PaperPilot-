export const OOXML_ARCHIVE_LIMITS: Readonly<{
  maxEntries: number;
  maxEntryBytes: number;
  maxExpandedBytes: number;
  maxCompressionRatio: number;
  maxPathBytes: number;
}>;
export function validateOOXMLArchive(
  buffer: Buffer,
  expectedMainPart: string
): { entries: number; expandedBytes: number };
