# Word Studio and Presentation Studio — implementation gate

Date: 25 November 2026

## Current verified foundation

- Format detection routes DOC/DOCX/ODT/RTF to Word Studio and PPT/PPTX/ODP to Presentation Studio.
- The existing isolated LibreOffice worker converts supported legacy and OOXML Office files to PDF. It does not provide an editable round-trip.
- The current Vercel project is on the Hobby plan and is a preview deployment, not a production worker host. The existing worker stack expects a long-running Docker host with LibreOffice and ClamAV.
- No Office editing engine is currently installed in the web app.

## Why a fake editor is not being shipped

A PDF preview, extracted plain text, or a contentEditable HTML field is not a native Word/PowerPoint editor. Saving such a view back to DOCX/PPTX would discard layout, styles, tables, comments, embedded objects, slide masters, animations, charts and other document structures. That would violate the preservation requirement and risk corrupting originals.

A real editor needs a verified engine that can open and save existing Office files, plus an execution host and an explicit licence review. Candidate self-hosted engines such as ONLYOFFICE Docs Community Edition or Collabora Online must be evaluated for their exact licence obligations, supported deployment topology, security updates, storage callbacks and concurrent editing model. A commercial edition or paid managed API is not acceptable under the ₹0 cap. A Vercel serverless route is not a substitute for the long-running document server.

## Safe implementation gate

Before enabling Word Studio or Presentation Studio for editing:
1. Select a self-hosted, SaaS-compatible, no-cost engine and record its exact licence and attribution/source obligations.
2. Confirm a zero-cost host that supports its documented Docker/long-running services and enough storage/CPU within quota. Do not provision or upgrade without explicit confirmation.
3. Implement per-user signed, short-lived document URLs and callback authentication; never expose service credentials to the browser.
4. Save each callback as a new immutable revision, verify the output signature/container and scan it before publishing.
5. Add round-trip fixtures for DOCX, ODT, PPTX and ODP covering tables, images, headers/footers, charts, notes, slide masters and embedded objects; compare rendered output before/after no-op saves.
6. Keep the original immutable and preserve the prior revision on callback failure or invalid output.

Until these gates pass, Office files remain safely routed to their format-specific Studio shell and the existing Office-to-PDF conversion remains available. Do not label conversion or a PDF preview as native editing.
