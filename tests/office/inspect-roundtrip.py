from pathlib import Path
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

path = Path(sys.argv[1])
kind = sys.argv[2]
with zipfile.ZipFile(path, "r") as archive:
    names = set(archive.namelist())
    bad = archive.testzip()
    assert bad is None, f"ZIP CRC failure in {bad}"
    if kind == "docx":
        required = {"[Content_Types].xml", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"}
        assert required <= names, f"missing DOCX parts: {required - names}"
        document = archive.read("word/document.xml").decode("utf-8")
        rels = archive.read("word/_rels/document.xml.rels").decode("utf-8")
        assert "PAPERPILOT EDITED" in document, "edited DOCX text did not persist"
        assert "TABLE CELL PRESERVE" in document, "DOCX table content was lost"
        assert "PAPERPILOT DOCX HEADER KEEP" in archive.read("word/header1.xml").decode("utf-8")
        assert "PAPERPILOT DOCX FOOTER KEEP" in archive.read("word/footer1.xml").decode("utf-8")
        assert any(n.startswith("word/media/") for n in names), "DOCX embedded image was lost"
        assert "image" in rels, "DOCX image relationship was lost"
        print(json.dumps({"kind": kind, "entries": len(names), "tables": 1, "images": len([n for n in names if n.startswith("word/media/")]), "headers": True, "footers": True}))
    elif kind == "pptx":
        required = {"[Content_Types].xml", "ppt/presentation.xml", "ppt/slideMasters/slideMaster1.xml", "ppt/slides/slide1.xml", "ppt/notesSlides/notesSlide1.xml"}
        assert required <= names, f"missing PPTX parts: {required - names}"
        slide = archive.read("ppt/slides/slide1.xml").decode("utf-8")
        master = archive.read("ppt/slideMasters/slideMaster1.xml").decode("utf-8")
        notes = archive.read("ppt/notesSlides/notesSlide1.xml").decode("utf-8")
        assert "PAPERPILOT PPTX EDITED" in slide, "edited PPTX text did not persist"
        assert "SLIDE CELL KEEP" in slide, "PPTX table content was lost"
        assert "PAPERPILOT MASTER KEEP" in master, "PPTX slide master content was lost"
        assert "PAPERPILOT SPEAKER NOTES KEEP" in notes, "PPTX speaker notes were lost"
        assert any(n.startswith("ppt/media/") for n in names), "PPTX embedded image was lost"
        print(json.dumps({"kind": kind, "entries": len(names), "slideMasters": True, "speakerNotes": True, "images": len([n for n in names if n.startswith("ppt/media/")])}))
    else:
        raise SystemExit("kind must be docx or pptx")
