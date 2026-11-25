import test from "node:test";
import assert from "node:assert/strict";
import { detectDocumentFormat, editorLabel } from "../../lib/document-format.mjs";

const bytes=(...values)=>new Uint8Array(values);
test("routes PDF and image files from signatures, not names",()=>{
 assert.equal(detectDocumentFormat(bytes(0x25,0x50,0x44,0x46,0x2d),"renamed.bin").editor,"pdf");
 assert.equal(detectDocumentFormat(bytes(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a),"image.dat").editor,"image");
 assert.equal(detectDocumentFormat(bytes(0xff,0xd8,0xff),"photo").format,"jpeg");
 assert.equal(detectDocumentFormat(bytes(0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50),"x").format,"webp");
});
test("rejects extension/signature mismatch instead of routing to a wrong editor",()=>{
 const result=detectDocumentFormat(bytes(0x25,0x50,0x44,0x46,0x2d),"fake.docx");
 assert.equal(result.editor,"pdf");
 const invalid=detectDocumentFormat(bytes(1,2,3,4),"fake.pptx");
 assert.equal(invalid.editor,"unsupported");
});
test("recognizes RTF and handles ambiguous legacy OLE safely",()=>{
 assert.equal(detectDocumentFormat(new TextEncoder().encode("{\\rtf1 hello}"),"a.rtf").editor,"word");
 assert.equal(detectDocumentFormat(bytes(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1),"legacy.doc").format,"doc");
 assert.equal(detectDocumentFormat(bytes(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1),"legacy.bin").editor,"unsupported");
});
test("labels each editor consistently",()=>{
 assert.equal(editorLabel("presentation"),"Presentation Studio");
 assert.equal(editorLabel("unsupported"),"Unsupported file");
});
