# Office Editing Engine and Zero-Cost Hosting Evaluation

**Date:** 25 November 2026  
**Decision status:** Candidate selected for isolated browser-only pilot; not approved for production use yet  
**Budget constraint:** ₹0 absolute maximum

## Executive decision

The best-fit candidate discovered is **`@p10node/office-engine@0.18.0`** for an isolated browser-side Word/Presentation pilot. It is MIT-licensed, has zero runtime dependencies, performs parsing/editing in a Web Worker, and advertises DOCX/PPTX editing with native-format save callbacks. It does not require an Office server or a separate compute host.

This is a candidate, not a production approval. The upstream project was created on 2 November 2026 and its v0.18.0 release is dated 23 November 2026. Despite a passing upstream CI run, it is too new for PaperPilot to trust without its own round-trip, security and compatibility testing.

## Candidate comparison

| Candidate | Licence / cost | Hosting requirements | Decision |
|---|---|---|---|
| `@p10node/office-engine@0.18.0` | MIT; no licence fee; zero runtime dependencies | Browser only; no server | **Pilot first**. Verify actual output fidelity and parser safety before enabling users |
| ONLYOFFICE Docs Community Edition | AGPLv3; free software, not a no-obligations commercial licence; branding and source obligations apply | Docker Linux; official baseline 4 GB RAM and 40 GB disk | Do not integrate until PaperPilot's overall licence and source obligations are deliberately approved |
| Collabora CODE | Free development edition; explicitly not recommended for production | Self-hosted Docker / Linux service | Not suitable as production SaaS editor |
| Oracle Cloud Always Free VM + ONLYOFFICE | Compute may remain ₹0 within Always Free quota; sign-up requires payment-card verification and capacity is not guaranteed | Always-on Linux VM, Docker, firewall, updates, persistent storage | Not selected: introduces account/card and reclamation risks, and does not solve the AGPL decision |
| Render Free Docker Web Service | ₹0 within included usage | 512 MB RAM, sleeps after 15 idle minutes, ephemeral disk; background workers and persistent disks are paid | Not suitable for a document server |
| Vercel Hobby / Daemons | Hobby is $0 but restricted to personal/non-commercial use; Daemons have metered usage | Serverless/daemon platform, not a replacement for Compose sidecars | Do not use for a commercial PaperPilot SaaS or assume Daemons are free |

## Evidence and source links

### Browser engine

- Repository: https://github.com/p10node/office-engine
- npm package: https://www.npmjs.com/package/@p10node/office-engine
- Upstream docs: https://p10node.github.io/office-engine/
- Licence file: https://github.com/p10node/office-engine/blob/main/LICENSE
- API docs: https://github.com/p10node/office-engine/blob/main/docs/api.md
- Features and known format gaps: https://github.com/p10node/office-engine/blob/main/docs/features.md
- Development and browser-test matrix: https://p10node.github.io/office-engine/docs/development.html
- Version evaluated: 0.18.0, published 23 November 2026.
- Upstream main CI for release commit `625254aa20a7b138c840c37dba1d2a963b2dbd66`: https://github.com/p10node/office-engine/actions/runs/45163025590 (success).
- Upstream has tests for DOCX editing, PPTX editing, save/reopen, legacy Office conversion, permissions and Chromium E2E. These are upstream tests, not PaperPilot verification.

### ONLYOFFICE

- Licence FAQ: https://helpcenter.onlyoffice.com/docs/installation/community/faq
- Docker system requirements: https://helpcenter.onlyoffice.com/docs/installation/community/docker/sys-reqs
- Community README: https://github.com/ONLYOFFICE/DocumentServer
- Community Edition is AGPLv3. ONLYOFFICE's own FAQ says SaaS use of its AGPL product requires making the modified version and derivative work source available; Community branding must remain. Community support has no SLA. The README recommends up to 20 users.
- Official Docker baseline: 4 GB RAM and 40 GB disk.

### Collabora

- CODE: https://www.collaboraonline.com/code/
- Collabora describes CODE as a development version for testing, home use or small teams, and explicitly says it is not recommended for production.

### Hosting

- Oracle Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Oracle India Free Tier FAQ: https://www.oracle.com/in/cloud/free/faq/
- Oracle Always Free compute allocation documented as 2 OCPU / 12 GB memory for A1 and 200 GB block storage. Capacity is region-dependent. Idle instances can be reclaimed if CPU, network and (A1) memory remain below 20% at the 95th percentile over 7 days. Sign-up requires a credit/debit card for identity verification; Oracle says it may place a temporary authorization hold.
- Render free limits: https://render.com/docs/free
- Vercel Hobby: https://vercel.com/docs/plans/hobby
- Vercel pricing / Daemons: https://vercel.com/pricing
- Vercel Hobby is non-commercial/personal use only. Daemons are metered; included usage is not proof that the feature is eligible or safe for this existing Hobby project.

## Why the browser engine is the leading option

It removes the biggest blocker: no external document server, persistent VM, Docker daemon, ClamAV sidecar or additional hosting quota is required for editing. The document bytes can remain in the browser and the editor can return a Blob/File to PaperPilot's revision flow.

The API documents:
- `<DocViewer src={file} editable onSave={(blob, name) => ...} />`
- `allowSave` and `allowDownload` controls
- Web Worker parsing and editing
- DOCX/PPTX editing and native-format save.

## Mandatory PaperPilot pilot gates

Do not enable the engine for all users until every gate below passes:

1. **Dependency integrity**
   - Pin exactly `@p10node/office-engine@0.18.0`.
   - Confirm npm package metadata, tarball integrity, provenance and MIT licence.
   - Inspect runtime bundle and transitive runtime dependencies (upstream says zero).
   - Run dependency audit and record SBOM/licence information.

2. **Document preservation**
   - Use synthetic DOCX fixtures containing headings, styles, lists, tables, merged cells, headers/footers, images, hyperlinks, comments, tracked changes and section breaks.
   - Use synthetic PPTX fixtures containing themes, masters, layouts, text, shapes, images, tables, charts, speaker notes and embedded objects.
   - Open and save without edits; compare package parts and rendered output.
   - Edit one small text element; save as a new immutable revision; reopen it and verify the edit.
   - Confirm original bytes and previous revisions remain unchanged.

3. **Security**
   - Test malformed ZIP central directories, traversal names, duplicate entries, oversized expansion, encrypted files, malformed XML and macro-enabled content.
   - Run the parser in its Web Worker and enforce PaperPilot file-size/page limits.
   - Verify document content cannot cause external network fetches, script execution or navigation.
   - Keep the existing server-side archive validator and malware scanner for server-side processing. The browser editor is not a replacement for those controls.

4. **Product integration**
   - Load the engine dynamically only for DOCX/DOC/ODT/RTF and PPTX/PPT/ODP routes.
   - Keep PDF.js/PDF Studio untouched.
   - Save output as a new revision and never overwrite the original.
   - Persist recovery state and revisions through PaperPilot's authenticated storage only after the editor's save output passes validation.
   - Provide a clear compatibility notice for unsupported document features.

5. **Release gate**
   - PaperPilot CI must pass all existing jobs plus Office editor tests.
   - Manual test on Chrome and Edge, including large documents and switching between tabs.
   - No production deployment or PR merge without user approval.

## Current decision

Proceed with an isolated browser-only pilot of `@p10node/office-engine@0.18.0` as the best zero-hosting candidate. Do not provision Oracle, Render, Vercel Daemons, or any other host. Do not integrate ONLYOFFICE or Collabora into PaperPilot until licence obligations and the commercial distribution model are explicitly settled.

If the browser engine fails the preservation or security gates, do not silently fall back to lossy PDF conversion or a plain-text editor. Keep the original Office file recoverable and report the exact unsupported feature.
