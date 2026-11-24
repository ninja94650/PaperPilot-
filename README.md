# PaperPilot

A modern document workspace for viewing, organizing, editing and converting PDFs, Office documents and images.

## Current release

The first build focuses on a polished web interface and browser-side PDF workflows. Heavy document conversion, OCR and persistent file processing are designed to run in isolated background workers in a later backend phase.

## Stack

- Next.js App Router, React and TypeScript
- Tailwind CSS
- pdf-lib for browser-side PDF manipulation
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

## Roadmap

1. Add secure upload and asynchronous document jobs.
2. Add DOCX/PPTX conversion and editing through an isolated Office worker / embedded editor.
3. Add OCR, compression tiers, billing, authentication and team workspaces.

## Security note

The initial PDF workflows run locally in the browser. Do not treat this MVP as a production document-processing service until server-side upload validation, malware scanning, tenant isolation, retention policies and operational controls have been implemented.
