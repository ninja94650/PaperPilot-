# PaperPilot 0.3 — Unified Document Studio

Status: approved product scope; implementation must be incremental on `feature/paperpilot-0.2-advanced-workspace`. This specification extends the current PDF workspace and does not authorize replacing existing engines, merging PR #3, or promoting a production deployment.

## Non-negotiable compatibility rules

1. Preserve all existing PDF tools and their behavior: merge, split, extract, rotate, annotate, typed signature, page thumbnails/reorder/delete, OCR transcript/searchable-PDF export, image conversion, PDF-to-PNG, cloud library and secure Office conversion queue.
2. Route every imported/created file by detected format to its matching editor: PDF → PDF Studio; DOC/DOCX/ODT/RTF → Word Studio; PPT/PPTX/ODP → Presentation Studio; supported raster images → Image Studio. Never open a PowerPoint or Word file in the PDF editor by default.
3. A completed operation updates the active document in the same editor and keeps that editor open. Operations that create multiple outputs add tabs and select the relevant result.
4. Maintain independent in-memory working copies per tab. Switching tabs must not discard dirty state; closing a dirty tab requires save/discard/cancel confirmation.
5. Originals are immutable. Each accepted save/export creates a new local or cloud revision; never overwrite the source object. Preserve revision lineage and allow restore/download.
6. No credits, usage tokens, paid APIs, paid editing SDKs, subscriptions, paid trials or billable dependencies. Core editing is local-first. Cloud processing is optional and remains within verified free-tier quotas.
7. Do not expose an editor control as available unless the operation is implemented and tested for that format. Unsupported capabilities must explain the limitation instead of silently converting or flattening the source.

## Format detection and editor routing

- Determine format using extension, declared MIME type and file signature. Treat the extension/MIME as hints, not proof. Reject contradictory or unsupported signatures before processing.
- Canonical types: PDF; DOC/DOCX/ODT/RTF; PPT/PPTX/ODP; PNG/JPEG/WebP (additional image formats only after decoder/export tests).
- Route on import, file-tab activation, operation result creation and cloud-library open.
- Each editor exposes format-specific operations and export choices. Shared workspace chrome (tabs, undo/redo, save status, revision history, import) is reusable.
- PDF operations remain backed by the existing PDF.js/pdf-lib path. Office editing must preserve editable objects; do not use PDF round-tripping as a substitute for native Word/PowerPoint editing.
- Save an operation result back into the originating editor. For explicit cross-format conversion, open the converted result in the target editor and retain the source tab.

## PDF Studio

Retain the existing PDF.js viewer, thumbnails, page order/delete, merge, split, extract, rotate, annotation, typed signature, OCR and image conversion. Keep the current PDF compressor warning that rasterization flattens searchable text, links, forms and vector content. Add a structural/lossless optimization option only when tests show it preserves page content and is beneficial. Merge/split/extract results remain in PDF Studio as new tabs.

## Word Studio

- Open and edit DOC/DOCX/ODT/RTF in a dedicated Word-style editor.
- Initial native editing scope: paragraphs, headings, inline emphasis, lists, tables, links, images, page breaks, page setup and find/replace.
- Import DOCX while retaining structure/styles; preserve unsupported features and warn before any lossy export.
- DOC/PPT legacy formats may be converted through the existing isolated LibreOffice worker, but retain the original and clearly label the converted working copy.
- Save/export DOCX and PDF; revision history must identify source format and export format.

## Presentation Studio

- Open PPT/PPTX/ODP in a dedicated slide editor with slide thumbnails, reorder/duplicate/delete, text editing, shape/image positioning, theme/background controls, notes and slide show preview.
- Preserve editable slide objects and theme/layout information. Import/export PPTX; PDF export is a separate derivative.
- Keep all presentation edits in Presentation Studio after operations and maintain per-tab dirty state.
- Never use screenshot-only slide reconstruction as the default import path.

## Image Studio

- Open PNG/JPEG/WebP in an image workspace with crop, resize, rotate, flip, quality, metadata options where safe, and export to supported raster formats.
- Keep the source immutable; edits create a new image revision.
- Avoid unsupported claims about lossless JPEG recompression or metadata stripping.

## Universal Size Compressor

Expose one **Compress document** action for all supported formats, with a format-aware workflow:
- PDF: lossless/structural optimization when safe; optional rasterized image compression with explicit warning that selectable text, links, forms, accessibility structure and vector content may be flattened. Preserve the existing implementation and warning.
- DOCX/PPTX/ODT/ODP: optimize embedded images and remove only verified redundant package data; preserve XML relationships, styles, fonts, notes, comments, charts, media references and editable structure. Repack archives with safe ZIP limits. Do not claim savings if output is larger.
- Legacy DOC/PPT/RTF: use a tested document worker or convert a copy to a modern format; never silently replace the source or claim a native-format compression path that does not exist.
- PNG: lossless optimization first; optional palette reduction only with user approval.
- JPEG/WebP: configurable quality and optional resize; clearly disclose lossy re-encoding and dimensions.
- Provide presets: **Best quality**, **Balanced**, **Smallest file**, plus advanced controls only where the format supports them.
- Show source size, output size, bytes saved, percentage saved and any quality/feature trade-offs. If the output is larger, say so and let the user keep or discard it.
- Run validation after compression: signature/container integrity, successful reopen, page/slide count, OOXML relationship checks, image dimensions, and format-specific smoke tests. Keep source and output separate.
- All compression runs without credits or paid APIs. Browser-side processing is preferred. Any worker path must reuse the existing authenticated queue, scanner gate, owner checks, quotas and immutable revision publication; never create a bypass endpoint.

## Workspace state, autosave and revisions

- Maintain a document session per tab: source file, working copy, detected format, editor kind, dirty flag, operation history, undo/redo state, last autosave timestamp and revision lineage.
- Autosave locally to IndexedDB only after explicit implementation of quota handling and recovery tests; cloud autosave is opt-in and authenticated.
- Recover drafts after reload and offer restore/discard. Never autosave over the original object.
- Use immutable revision IDs and per-owner access control for cloud history. A revision download must be scoped to its owner and short-lived.
- Switching editors or tabs must not reset another document's working state.

### Implementation status (25 November 2026)

- **Implemented on the feature branch:** Office Studio uses the editor's save callback for 2.5-second idle autosave to IndexedDB. The original source Blob is retained separately from immutable local revisions. Dashboard startup restores the latest saved revision after refresh.
- **Implemented on the feature branch:** cloud history is opt-in. The original is uploaded to the existing private Supabase `documents` bucket; future revisions use unique immutable object paths and owner-scoped metadata rows.
- **Implemented and applied:** `public.editor_revisions` migration with RLS, read-only authenticated access and a service-role-only atomic publisher. Per-document version allocation is serialized and parent lineage is validated.
- **Implemented:** private revision downloads are owner-checked and use short-lived signed URLs. Cloud history exposes metadata, not storage paths.
- **Added tests:** rich DOCX/PPTX fixtures, malformed OOXML package fixtures, browser edit-save-reopen checks, IndexedDB refresh recovery and disposable Postgres RLS/lineage checks. CI results are pending; these tests are not yet a passing release gate.
- **Security gate still open:** browser-published cloud revisions receive hardened ZIP/OOXML structural validation but are not yet ClamAV-scanned. Do not enable cloud Office autosave broadly or claim malware scanning until revision publication is routed through the existing isolated scanner and a clean result is required before publication/download.
- **Other release gates:** route-level HTTP authorization/failure tests, manual Chrome/Edge verification, concurrent-tab conflict handling and quota exhaustion testing remain outstanding.

## Delivery phases and acceptance gates

### Phase A — routing foundation (first)
- Add tested signature-aware format detection and central editor router.
- Preserve existing PDF modal/editor and map all existing PDF tools to it.
- Add per-tab document session model and unsaved-work confirmation.
- Verify merge/split/extract/rotate/annotate/sign/OCR/compress outputs remain in PDF Studio.
- Verify PPTX and DOCX imports select their own editor route (editor surfaces may be gated until their feature phase is ready).

### Phase B — Word and Presentation
- Build Word Studio and Presentation Studio with native editable model round-trips.
- Add format-specific regression fixtures and import/edit/save/reopen tests.
- Retain secure worker conversion as an explicit conversion path only.

### Phase C — Image and universal compression
- Build Image Studio.
- Add format-aware compressor adapters and validation.
- Add size/quality comparison UI and batch compression where supported.

### Phase D — autosave, history and exports
- Add local recovery, optional cloud autosave, immutable revisions, restore and export.
- Run cross-editor tab-switch, crash/reload recovery, authorization and revision-integrity tests.

## ₹0 and release policy

- Prefer already-installed, audited permissive open-source libraries; record every dependency and licence in `docs/licensing-register.md` / `docs/LICENSING-0.2.1.md`.
- Do not provision services or enable features that could incur charges. Stop if a free-tier quota or commercial-use licence is unclear.
- CI must cover routing, preservation of existing PDF workflows, compressor integrity/size reporting, Office package round-trips, tab state and revision ownership.
- Work only on the feature branch and keep PR #3 open. No merge or production deployment without explicit user approval.
