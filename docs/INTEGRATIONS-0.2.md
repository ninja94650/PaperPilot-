# PaperPilot 0.2 integrations

## Supabase Auth and cloud library

The existing Supabase project is in Mumbai (ap-south-1). The Vercel project already has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY configured for production, preview and development.

The existing migration 20261124000000_paperpilot_workspace_foundation creates:
- profiles, documents and processing_jobs with row-level security
- A private Storage bucket named documents
- Per-user row and storage policies

The account page uses this existing schema. Cloud files are stored under <auth-user-id>/<random-id>/<safe-file-name>; metadata is stored in public.documents. Signed download links expire after 60 seconds. Uploads are limited to 20 MB and show real upload progress.

For production email confirmation and password recovery, configure the Supabase Auth Site URL and redirect allowlist with:
- https://paperpilot-ninja94650-5268.vercel.app/auth/callback
- Your Vercel preview callback URL ending in /auth/callback
- http://localhost:3000/auth/callback for local development

Configure SMTP before relying on production email delivery.

## LibreOffice worker

A deployable Docker worker is included in worker/. It accepts authenticated multipart POST /convert requests and returns PDF bytes. The web API requires a signed-in PaperPilot user and proxies the request to this isolated worker.

Set server-only Vercel variables:
- DOCUMENT_WORKER_URL: public HTTPS base URL of the worker
- DOCUMENT_WORKER_TOKEN: same long random bearer token configured in the worker
- NEXT_PUBLIC_APP_URL: canonical PaperPilot origin (also used by ONLYOFFICE callbacks)

The worker validates file extensions and signatures, limits input to 20 MB, runs LibreOffice as a non-root user in an isolated temporary directory, limits concurrency and conversion time, checks the output PDF signature, and removes job files after each request.

Production requirements: keep the worker behind HTTPS and a private network or IP allowlist, restrict outbound network access at the host firewall, monitor resource use, and keep the container patched.

## ONLYOFFICE Docs

The web integration includes:
- Authenticated document configuration endpoint
- Short-lived signed Storage URL for the source file
- HS256-signed editor configuration
- Callback JWT verification
- Callback document-key and server-host validation
- Bounded save download and Office file signature validation
- Server-side Storage update using a service-role key

Deploy ONLYOFFICE Docs separately and set:
- ONLYOFFICE_DOCUMENT_SERVER_URL
- ONLYOFFICE_JWT_SECRET (at least 32 characters and identical to the Docs server secret)
- SUPABASE_SERVICE_ROLE_KEY (server-only; never add a NEXT_PUBLIC_ prefix)

Do not enable production editing until the Docs server is reachable by the browser and callback service, the callback URL is reachable from the Docs server, and an authenticated edit-save-reopen test passes.

## Browser-side tools and limits

- PDF.js viewer, thumbnails, page selection, drag reorder, move controls and delete run locally.
- PDF compression rasterizes pages at the chosen JPEG quality. It can flatten text, links, forms and vector content; compare output size before using it.
- OCR runs in the browser and exports a text transcript. It does not yet add a searchable text layer to the original PDF.
- Image-to-PDF and PDF-to-PNG conversion run locally.
- Browser PDF rendering is capped at 150 pages; OCR and page-image export are capped at 100 pages.
- DOC/DOCX/PPT/PPTX conversion requires the isolated LibreOffice worker.
- Cloud uploads and document history use the existing Supabase project and migration.
