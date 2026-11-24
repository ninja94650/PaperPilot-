# PaperPilot

A modern document workspace for viewing, organizing, editing and converting PDFs, Office documents and images.

## Current release

PaperPilot 0.2 adds Supabase-backed email authentication, private cloud storage foundations, account document metadata, and ownership policies while preserving browser-side PDF workflows. Heavy conversion and OCR still require isolated background workers.

## Stack

- Next.js App Router, React and TypeScript
- Tailwind CSS
- pdf-lib for browser-side PDF manipulation
- Supabase Auth, Postgres and private Storage
- Neon reserved as a PostgreSQL fallback (not an Auth or Storage replacement)
- Native browser PDF preview in the initial editor
- Vercel for frontend hosting

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Current capabilities

- Responsive PaperPilot dashboard and tool discovery
- Drag-and-drop file selection
- Local PDF preview
- Merge, rotate, extract and split PDF pages in the browser
- Add text annotations and signature text overlays
- No file upload to a server is required for the browser-side PDF operations
- Email/password sign-up, sign-in and password recovery
- Account page with private document history foundation

## Roadmap

1. Add secure upload and asynchronous document jobs.
2. Add DOCX/PPTX conversion and editing through an isolated Office worker / embedded editor.
3. Add OCR, real compression, isolated conversion workers and team workspaces.

## Security note

The initial PDF workflows run locally in the browser. Do not treat this MVP as a production document-processing service until server-side upload validation, malware scanning, tenant isolation, retention policies and operational controls have been implemented.
