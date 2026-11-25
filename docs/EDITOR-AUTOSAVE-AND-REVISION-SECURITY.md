# Office Studio Autosave and Cloud Revision Security

**Status:** Implemented on the feature branch; ClamAV queue, cross-device reopen and browser CI gates are awaiting successful verification.  
**Database:** Existing Supabase project `ueiwxomoirmncomzyudu`; the new ClamAV queue migration is committed but not yet applied to the live project.  
**Production:** Not deployed. PR #3 remains unmerged.

## What is implemented

### Browser-local recovery

- Office Studio now saves dirty DOCX/PPTX editor state automatically after a 2.5-second quiet period using the editor's supported save callback.
- Every accepted save is written to IndexedDB as an immutable local revision.
- The IndexedDB session retains the original source Blob, latest revision Blob, revision number, editor kind, cloud document link and latest cloud parent revision.
- Dashboard startup checks for recoverable Office drafts and restores the latest revision as an editor tab. The original source remains stored separately in IndexedDB.
- Switching workspace tabs keeps editor sessions mounted; reloading restores the latest completed local autosave.
- Quota/storage errors are surfaced to the user rather than claiming a save succeeded.

### Opt-in cloud history

- Cloud history is explicitly opt-in from Word Studio / Presentation Studio.
- Enabling it uploads the original to the existing private `documents` bucket and creates the owner-scoped `documents` record.
- Future autosaves upload to immutable paths:
  `<owner>/<document>/editor/<revision>/<filename>`.
- The server downloads the uploaded object, checks the 20 MiB limit, validates the OOXML ZIP structure using the hardened archive validator, calculates SHA-256 itself and queues a private scan job. The revision is not inserted into `editor_revisions` at this stage.\n- The isolated worker claims a leased scan job, downloads the exact immutable Storage object, streams it to ClamAV, and reports the verdict through a bearer-authenticated internal endpoint. Only a clean verdict invokes the service-role-only immutable publisher. Rejected objects are removed; scanner failures retry with backoff and fail closed.
- The database assigns monotonically increasing per-document versions under a row lock and verifies the parent revision belongs to the same owner and document.
- Cloud history lists only rows that have passed scanning; storage paths are never sent to the browser. Downloads use an owner-scoped published-row lookup and a 60-second signed URL.\n- The cloud library exposes **Open in PaperPilot** for DOCX/PPTX documents. A signed owner-scoped endpoint fetches the immutable original and latest published clean revision; a new browser/device creates a fresh local session linked to the same cloud document and revision parent.
- Restoring a cloud revision opens it as the current working copy; it does not overwrite or delete the stored revision.

## Database controls

The new `public.editor_revisions` table:
- Has RLS enabled and an authenticated owner-only SELECT policy.
- Grants SELECT to authenticated users only; anon has no access.
- Revokes direct INSERT/UPDATE/DELETE from anon and authenticated.
- Grants write access to service_role only.
- Stores immutable revision id, owner, source document, version, parent revision, private object path, format, size, SHA-256 and creation time.
- Uses a service-role-only `publish_editor_revision` function with a fixed search path and strict owner/document/path/format/parent checks.\n\nThe `public.editor_revision_scan_jobs` queue: - has RLS enabled and no browser grants; - stores only owner-scoped object metadata and scan state; - supports atomic `FOR UPDATE SKIP LOCKED` claims with bounded leases and three attempts; - is writable/readable only by `service_role`; - never exposes queued/scanning/rejected/failed objects through cloud history or the revision download route.

Live verification returned:
- RLS enabled: true
- anon SELECT: false
- authenticated SELECT: true
- authenticated INSERT: false
- authenticated EXECUTE on publisher: false
- service_role EXECUTE on publisher: true

The existing Supabase security advisor findings about `processing_api_rate_limits` and its rate-limit RPC are pre-existing and unrelated to this migration.

## Tests added

- Synthetic DOCX fixture: editable text, styles, a real table, embedded PNG, header and footer.
- Synthetic PPTX fixture: editable text, slide master, real table, embedded PNG and speaker notes.
- Browser tests perform edit → save → reopen and assert the edits and document structures remain.
- Saved Office package inspection verifies DOCX tables, image relationships, header/footer and PPTX master, notes, table and image parts.
- Malformed fixtures cover traversal paths, duplicate entries, macro payloads, excessive compression ratio and a corrupted ZIP end-of-central-directory record.
- Browser malformed-package test asserts a truncated package is rejected rather than showing an editable canvas.\n- Worker queue-to-storage integration now exercises the Office revision scan claim and clean verdict before the existing conversion flow.\n- HTTP suite checks that the new Office worker endpoints reject missing or incorrect bearer credentials.\n- Disposable PostgreSQL fixture claims a queued Office revision and verifies worker id, attempt count and lease persistence.
- IndexedDB browser test verifies source preservation, latest revision recovery and cloud lineage survive a full page reload.
- Disposable PostgreSQL test verifies direct writes are rejected, revision versions increment, parent lineage is recorded and cross-tenant rows remain hidden.

## Important security limitation

Cloud revision publication is now wired to the ClamAV queue in the feature branch, but **the new migration and updated worker have not yet been applied to a live worker/database environment**. Until the exact feature-branch CI gates pass and the worker is deployed by an operator, cloud revision publishing must be treated as unavailable/pilot-only. The browser leaves local autosaves intact and reports that cloud sync is pending or unavailable. Scanner timeout/outage and rejected verdicts fail closed; they never produce a downloadable revision.

The current structural validator rejects malformed/unsafe ZIP metadata, traversal, duplicate paths, symlinks, macro payloads, oversized entries and high expansion ratios. This is not a substitute for antivirus scanning or a full OOXML semantic sanitizer.

## Remaining release gates

1. Apply and verify the queue migration to the existing Supabase project only after CI validates the migration and exact feature branch.
2. Execute the worker integration with live ClamAV and verify clean, EICAR/rejected, timeout, retry, lease-expiry and crash-recovery paths; verify failed/rejected object cleanup.
3. Complete the cloud-library open flow with an authenticated browser session on a second device/browser and verify original, latest clean revision and parent lineage.
4. Pass the DOCX and PPTX edit → autosave → save → reopen suite in Chromium, including tables, images, slide master, speaker notes and malformed package rejection.
5. Verify manual Chrome and Edge behavior, browser quota exhaustion, tab switching, concurrent tabs and refresh during an in-flight autosave.
6. Keep Office Studio opt-in until all gates pass. No production deploy or PR merge without explicit user approval.
