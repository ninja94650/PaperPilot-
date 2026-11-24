# PaperPilot

PaperPilot is a document workspace for PDF, Office and image workflows.

## PaperPilot 0.2 development

This branch introduces the Advanced Document Workspace and account foundation. It is not yet merged into the production branch.

### Browser-side tools

- PDF.js rendering with page thumbnails and page selection
- Drag-to-reorder, move and delete PDF pages
- Merge, split into one-page PDFs, extract, rotate, annotate and add a typed signature
- Lossy PDF compression presets (rasterizes pages; text, links, forms and vector content are flattened)
- OCR text extraction from scanned PDFs (exports a text transcript; does not yet add a searchable text layer)
- Image-to-PDF and PDF-to-PNG conversion

The browser-side tools process files locally and do not require an upload to PaperPilot servers.

### Account and cloud library

- Supabase SSR sign-in, sign-up, password recovery and password update flows
- Private cloud document library with signed downloads and user-scoped deletion
- RLS-protected document metadata and private Storage bucket migration

To enable accounts, configure \`NEXT_PUBLIC_SUPABASE_URL\` and \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\`, then apply the SQL migration in \`supabase/migrations\`.

### Office conversion and editing

DOC/DOCX/PPT/PPTX conversion is routed to a separately deployed, isolated LibreOffice worker. ONLYOFFICE editing is integrated through signed configuration and callback routes. These capabilities remain unavailable until the external worker / Docs server and required server-only secrets are configured.

See:
- [Integration setup](docs/INTEGRATIONS-0.2.md)
- [LibreOffice worker contract](docs/WORKER-CONTRACT.md)
- [0.2 roadmap](docs/ROADMAP-0.2.md)

## Stack

- Next.js App Router, React and TypeScript
- PDF.js for rendering and Tesseract.js for browser OCR
- pdf-lib for PDF manipulation and image conversion
- Supabase Auth, Postgres and private Storage (when configured)
- Vercel for the web application

## Development

Use Node.js 22.13+.

\`\`\`bash
npm install
npm run dev
\`\`\`

Open http://localhost:3000.

## Environment variables

Copy \`.env.example\` to \`.env.local\`. Only publishable Supabase credentials use the \`NEXT_PUBLIC_\` prefix. Keep service-role keys, worker tokens and ONLYOFFICE JWT secrets server-side.

## Security

All uploaded documents are untrusted input. The Office worker must be isolated, non-root, resource-limited and network-restricted. Cloud document access is user-scoped with RLS and a private Storage bucket. Do not enable production cloud storage or Office editing until the external services and authorization flows are configured and verified.
