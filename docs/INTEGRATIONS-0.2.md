# PaperPilot 0.2 service integrations

This release contains browser-side PDF tools and the application integration points below. External processing services are intentionally fail-closed: PaperPilot returns an explicit setup error rather than simulating a successful conversion.

## Supabase Auth and private cloud library

Set these Vercel environment variables:

- \`NEXT_PUBLIC_SUPABASE_URL\`
- \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\`

Apply \`supabase/migrations/20261124000100_paperpilot_cloud.sql\` to the connected project. The migration creates the private document metadata table and private Storage bucket with user-folder ownership policies.

Configure Supabase Auth email confirmation and add these redirect URLs in Auth URL Configuration:

- \`https://paperpilot-ninja94650-5268.vercel.app/auth/callback\`
- Your Vercel preview URL pattern, if preview authentication is required
- \`http://localhost:3000/auth/callback\` for local development

The application never puts a Supabase secret/service-role key in browser variables.

## DOC/DOCX/PPT/PPTX conversion worker

Set server-only Vercel variables:

- \`DOCUMENT_WORKER_URL\`: base URL of an isolated LibreOffice conversion service
- \`DOCUMENT_WORKER_TOKEN\`: bearer token shared only with that service

PaperPilot calls \`POST {DOCUMENT_WORKER_URL}/convert\` with multipart field \`file\` and an Authorization bearer token. The worker must return a PDF with a valid \`%PDF-\` signature. It must run LibreOffice in a non-root container with network egress disabled, resource/time limits, temporary-directory isolation, input validation and guaranteed cleanup.

The Vercel route requires an authenticated PaperPilot user, limits uploads to 20 MB, validates extensions, applies a timeout, and validates the returned PDF signature. The worker itself still needs to be deployed and hardened before Office conversion is available in production.

## ONLYOFFICE Docs

The ONLYOFFICE Docs server must be deployed separately and reachable by the user's browser and the document storage/callback service. A complete integration additionally needs:

- \`ONLYOFFICE_DOCUMENT_SERVER_URL\`
- \`ONLYOFFICE_JWT_SECRET\` configured identically on the Docs server and backend
- Authenticated document download URLs and a callback endpoint that verifies ONLYOFFICE JWTs before accepting saved content
- A private storage write path and ownership checks for every document

Do not expose the JWT secret to \`NEXT_PUBLIC_*\` variables. Do not enable editing until the Docs server and signed callback flow are configured and tested.

## Current tool behavior

- PDF page thumbnails, page selection, drag reorder, move controls and page deletion are local.
- Compression rasterizes pages to JPEG at the selected quality. This reduces image payloads but flattens text, links, forms and vectors; it is not a lossless optimizer.
- OCR runs in the browser and exports a text transcript; it does not yet embed a searchable text layer into the source PDF.
- Image-to-PDF and PDF-to-PNG conversion run locally.
- Office conversion requires the isolated LibreOffice worker above.
- Cloud upload/history require Supabase credentials and the migration above.
