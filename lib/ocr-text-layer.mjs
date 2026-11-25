import { rgb } from "pdf-lib";

/**
 * Add OCR words as transparent, selectable PDF text.
 * Coordinates are already converted from the PDF.js viewport into PDF page space.
 */
export function addInvisibleOcrTextLayer(page, font, words) {
  let inserted = 0;
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  for (const word of words) {
    const text = String(word?.text ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
    const x = Number(word?.x);
    const y = Number(word?.y);
    const width = Number(word?.width);
    const height = Number(word?.height);
    if (!text || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;

    const safeX = Math.max(0, Math.min(x, pageWidth - 1));
    const safeY = Math.max(0, Math.min(y, pageHeight - 1));
    const fontSize = Math.max(3, Math.min(48, height));

    try {
      // Standard-14 fonts are WinAnsi; unsupported scripts stay in the transcript.
      font.encodeText(text);
      page.drawText(text, {
        x: safeX,
        y: safeY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        opacity: 0,
        maxWidth: Math.max(1, Math.min(width * 1.25, pageWidth - safeX)),
        lineHeight: fontSize
      });
      inserted += 1;
    } catch {
      // Keep OCR resilient: an unencodable glyph must not abort the entire document.
    }
  }

  return inserted;
}
