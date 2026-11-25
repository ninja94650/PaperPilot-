# Office Studio Autosave and Cloud Revision Security

**Status:** Implemented on the feature branch; validation and browser CI gates pending.  
**Database:** Supabase project `ueiwxomoirmncomzyudu`, migration `20261125150000_paperpilot_editor_revisions` applied and verified.  
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
- The server downloads the uploaded object, checks the 20 MiB limit, validates the OOXML ZIP structure using the hardened archive validator, calculates SHA-256 itself and publishes metadata through the service-role-only database function.
- The database assigns monotonically increasing per-document versions under a row lock and verifies the parent revision belongs to the same owner and document.
- Cloud history lists metadata only; storage paths are never sent to the browser. Downloads use an owner-scoped row lookup and a 60-second signed URL.
- Restoring a cloud revision opens it as the current working copy; it does not overwrite or delete the stored revision.

## Database controls

The new `public.editor_revisions` table:
- Has RLS enabled and an authenticated owner-only SELECT policy.
- Grants SELECT to authenticated users only; anon has no access.
- Revokes direct INSERT/UPDATE/DELETE from anon and authenticated.
- Grants write access to service_role only.
- Stores immutable revision id, owner, source document, version, parent revision, private object path, format, size, SHA-256 and creation time.
- Uses a service-role-only `publish_editor_revision` function with a fixed search path and strict owner/document/path/format/parent checks.

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
- Browser malformed-package test asserts a truncated package is rejected rather than showing an editable canvas.
- IndexedDB browser test verifies source preservation, latest revision recovery and cloud lineage survive a full page reload.
- Disposable PostgreSQL test verifies direct writes are rejected, revision versions increment, parent lineage is recorded and cross-tenant rows remain hidden.

## Important security limitation

**These cloud editor revisions are structurally validated, but are not yet ClamAV-scanned.** The browser autosave path does not currently route through the isolated ClamAV worker. Do not describe cloud Office autosave as malware-scanned or enable it broadly until the revision publication path is integrated with the existing scanner gate and a clean scan is required before a revision becomes downloadable.

The current validation rejects malformed/unsafe ZIP metadata, traversal, duplicate paths, symlinks, macro payloads, oversized entries and high expansion ratios. This is not a substitute for antivirus scanning or a full OOXML semantic sanitizer.

## Remaining release gates

1. Latest PaperPilot CI must pass on the exact feature branch head, including the new Office browser suite and disposable database fixture.
2. Fix any browser round-trip failures before calling DOCX/PPTX editing fidelity verified.
3. Wire cloud revision publication through the isolated ClamAV scan gate. A failed scan must not create a downloadable history entry; rejected objects must be removed safely.
4. Add route-level HTTP tests for unauthenticated, cross-owner, invalid path, invalid parent, storage upload failure and signed download denial.
5. Verify manual Chrome and Edge behavior, browser quota exhaustion, tab switching, concurrent tabs and refresh during an in-flight autosave.
6. No production deploy or PR merge without explicit user approval.
