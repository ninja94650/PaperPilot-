# PaperPilot

PaperPilot is a document workspace for PDF, Office and image workflows.

## PaperPilot 0.2

The 0.2 development branch adds:

### Browser-side tools
- PDF.js rendering with page thumbnails and page selection
- Drag-to-reorder, move and delete PDF pages
- Merge, split into one-page PDFs, extract, rotate, annotate and typed signatures
- PDF compression presets (lossy rasterized output with a clear warning)
- OCR text extraction from scanned PDFs (exports a text transcript)
- Image-to-PDF and PDF-to-PNG conversion

Browser-side PDF tools process suitable files locally and do not upload them to PaperPilot servers.

### Accounts and cloud library
- Supabase email sign-in, sign-up and password recovery
- Private cloud document library with upload progress, signed downloads and user-scoped deletion
- Existing Supabase RLS policies and document history

### Office integrations
- Authenticated API proxy and isolated LibreOffice worker for DOC/DOCX/PPT/PPTX conversion
- Signed ONLYOFFICE editor configuration and save callback bridge

Office conversion and ONLYOFFICE editing require separately deployed services and server-only secrets. They return explicit setup errors until those services are connected.

## Stack
- Next.js App Router, React and TypeScript
- PDF.js, Tesseract.js and pdf-lib
- Supabase Auth, Postgres and private Storage
- LibreOffice worker container for Office conversion
- ONLYOFFICE Docs for in-browser Office editing
- Vercel for the web application

## Development

Use Node.js 22.13+.

    npm install
    npm run dev

Open http://localhost:3000.

Copy .env.example to .env.local. Keep service-role keys, worker tokens and ONLYOFFICE JWT secrets server-side.

See:
- docs/BACKEND-SETUP.md
- docs/INTEGRATIONS-0.2.md
- worker/README.md
- docs/ROADMAP-0.2.md
