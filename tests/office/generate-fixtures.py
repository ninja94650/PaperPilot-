from pathlib import Path
from io import BytesIO
import base64
import os
import zipfile
import warnings

from docx import Document
from docx.shared import Inches as DocxInches
from pptx import Presentation
from pptx.util import Inches

ROOT = Path(__file__).parent / "e2e" / "public"
ROOT.mkdir(parents=True, exist_ok=True)
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==")

# DOCX: styled paragraphs, a real table, embedded image, header and footer.
doc = Document()
doc.add_heading("PaperPilot Office round-trip fixture", level=1)
doc.add_paragraph("PAPERPILOT EDIT TARGET", style="Subtitle")
doc.add_paragraph("Preservation sentinel: DOCX paragraphs and styles remain editable.")
table = doc.add_table(rows=2, cols=2)
table.style = "Table Grid"
table.cell(0, 0).text = "TABLE HEADER A"
table.cell(0, 1).text = "TABLE HEADER B"
table.cell(1, 0).text = "TABLE CELL PRESERVE"
table.cell(1, 1).text = "42"
doc.add_picture(BytesIO(PNG), width=DocxInches(0.35))
doc.sections[0].header.paragraphs[0].text = "PAPERPILOT DOCX HEADER KEEP"
doc.sections[0].footer.paragraphs[0].text = "PAPERPILOT DOCX FOOTER KEEP"
docx_path = ROOT / "complex.docx"
doc.save(docx_path)

# PPTX: real master shape, slide text/table/image and speaker notes.
prs = Presentation()
master = prs.slide_masters[0]
master_shape = master.shapes.add_textbox(Inches(0.4), Inches(0.15), Inches(8), Inches(0.35))
master_shape.text = "PAPERPILOT MASTER KEEP"
slide = prs.slides.add_slide(prs.slide_layouts[6])
title = slide.shapes.add_textbox(Inches(0.6), Inches(0.6), Inches(8), Inches(0.8))
title.text = "PAPERPILOT PPTX EDIT TARGET"
body = slide.shapes.add_textbox(Inches(0.6), Inches(1.5), Inches(8), Inches(0.5))
body.text = "PPTX BODY PRESERVATION SENTINEL"
table_shape = slide.shapes.add_table(2, 2, Inches(0.6), Inches(2.2), Inches(5), Inches(1.2))
table_shape.table.cell(0, 0).text = "SLIDE TABLE A"
table_shape.table.cell(0, 1).text = "SLIDE TABLE B"
table_shape.table.cell(1, 0).text = "SLIDE CELL KEEP"
table_shape.table.cell(1, 1).text = "84"
slide.shapes.add_picture(BytesIO(PNG), Inches(6), Inches(2.2), width=Inches(0.4))
slide.notes_slide.notes_text_frame.text = "PAPERPILOT SPEAKER NOTES KEEP"
pptx_path = ROOT / "complex.pptx"
prs.save(pptx_path)

# Adversarial package fixtures, derived from a valid DOCX container.
def rewrite_zip(source: Path, target: Path, extra=None, duplicate=None):
    with zipfile.ZipFile(source, "r") as src, zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as out:
        for name in src.namelist():
            out.writestr(name, src.read(name))
        if extra:
            for name, data in extra:
                out.writestr(name, data)
        if duplicate:
            # Deliberately write the same path twice; validator must reject it.
            out.writestr(duplicate, src.read(duplicate))

rewrite_zip(docx_path, ROOT / "malformed-traversal.docx", [("../outside.txt", b"escape")])
rewrite_zip(docx_path, ROOT / "malformed-duplicate.docx", duplicate="word/document.xml")
rewrite_zip(docx_path, ROOT / "malformed-macro.docx", [("word/vbaProject.bin", b"macro-payload")])
rewrite_zip(docx_path, ROOT / "malformed-bomb.docx", [("word/oversized.txt", b"0" * (1024 * 1024))])

broken = bytearray(docx_path.read_bytes())
# Corrupt the end-of-central-directory signature.
eocd = broken.rfind(b"PK\x05\x06")
if eocd < 0:
    raise RuntimeError("Fixture generator could not find ZIP EOCD")
broken[eocd:eocd + 4] = b"NOPE"
(ROOT / "malformed-eocd.docx").write_bytes(broken)

print("Generated rich DOCX/PPTX and five malformed Office fixtures in", ROOT)
