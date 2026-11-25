export type DocumentFormat = "pdf" | "docx" | "pptx" | "odt" | "odp" | "rtf" | "doc" | "ppt" | "png" | "jpeg" | "webp" | "unknown";
export type EditorKind = "pdf" | "word" | "presentation" | "image" | "unsupported";
export type FormatDetection = { format: DocumentFormat; editor: EditorKind; confidence: "signature" | "container" | "text" | "extension"; warning?: string };
export function detectDocumentFormat(bytes: Uint8Array, filename?: string, mimeType?: string): FormatDetection;
export function editorLabel(editor: EditorKind): string;
