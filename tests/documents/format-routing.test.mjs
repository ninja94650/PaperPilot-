import test from "node:test";
import assert from "node:assert/strict";
import { detectDocumentFormat, editorLabel } from "../../lib/document-format.mjs";

const bytes=(...values)=>new Uint8Array(values);
function zipFixture(entries) {
 const chunks=[]; const central=[]; let offset=0;
 for(const [name,value] of entries) {
  const n=new TextEncoder().encode(name), data=new TextEncoder().encode(value);
  const local=new Uint8Array(30+n.length+data.length), lv=new DataView(local.buffer);
  lv.setUint32(0,0x04034b50,true); lv.setUint16(4,20,true); lv.setUint32(18,data.length,true);
  lv.setUint32(22,data.length,true); lv.setUint16(26,n.length,true);
  local.set(n,30); local.set(data,30+n.length); chunks.push(local);
  const c=new Uint8Array(46+n.length), cv=new DataView(c.buffer);
  cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
  cv.setUint32(20,data.length,true); cv.setUint32(24,data.length,true); cv.setUint16(28,n.length,true);
  cv.setUint32(42,offset,true); c.set(n,46); central.push(c); offset+=local.length;
 }
 const centralSize=central.reduce((sum,c)=>sum+c.length,0), end=new Uint8Array(22), ev=new DataView(end.buffer);
 ev.setUint32(0,0x06054b50,true); ev.setUint16(8,entries.length,true); ev.setUint16(10,entries.length,true);
 ev.setUint32(12,centralSize,true); ev.setUint32(16,offset,true);
 return new Uint8Array([...chunks,...central,end].flatMap(c=>Array.from(c)));
}
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

test("routes DOCX and PPTX from package contents",()=>{
 const docx=zipFixture([["[Content_Types].xml","types"],["word/document.xml","document"]]);
 const pptx=zipFixture([["[Content_Types].xml","types"],["ppt/presentation.xml","presentation"]]);
 assert.equal(detectDocumentFormat(docx,"renamed.zip").editor,"word");
 assert.equal(detectDocumentFormat(pptx,"renamed.zip").editor,"presentation");
});
test("routes ODT and ODP using the stored mimetype entry",()=>{
 const odt=zipFixture([["mimetype","application/vnd.oasis.opendocument.text"],["content.xml","text"]]);
 const odp=zipFixture([["mimetype","application/vnd.oasis.opendocument.presentation"],["content.xml","slides"]]);
 assert.equal(detectDocumentFormat(odt,"a.zip").format,"odt");
 assert.equal(detectDocumentFormat(odp,"a.zip").format,"odp");
});
