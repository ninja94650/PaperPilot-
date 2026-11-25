# Office editor regression suite

This suite is deliberately separate from the normal production build because it downloads a pinned Chromium test browser and uses synthetic documents only. It does not upload any document to an external service.

## What it tests

- Real DOCX editing, idle autosave, save callback, reopen and preservation of tables, images, headers and footers.
- Real PPTX editing, idle autosave, save callback, reopen and preservation of slide masters, speaker notes, tables and images.
- Rejection of malformed Office packages in the browser editor.
- Hardened archive validation for valid DOCX/PPTX plus traversal, duplicate paths, macro payloads, compression bombs and corrupted ZIP directory metadata.
- IndexedDB persistence across a full page reload, retaining the original source Blob, latest revision and cloud lineage metadata.

## Windows (PowerShell)

From the repository root:

```powershell
.\tests\office\run-e2e.ps1
```

The script installs only pinned, test-only Python/npm tools into the current environment and a temporary npm prefix. Chromium is installed into the local Playwright browser cache. No paid service or API key is used.

## Linux / CI

```bash
python -m pip install python-docx==1.1.2 python-pptx==1.0.2
python tests/office/generate-fixtures.py
node --test tests/office/archive-validation.test.mjs
npm install --prefix "$RUNNER_TEMP/office-tools" --no-save --no-package-lock vite@8.3.5 playwright-core@1.57.0
"$RUNNER_TEMP/office-tools/node_modules/.bin/playwright-core" install --with-deps chromium
"$RUNNER_TEMP/office-tools/node_modules/.bin/vite" --root tests/office/e2e --host 127.0.0.1 --port 4173 --strictPort &
export OFFICE_E2E_TOOLS="$RUNNER_TEMP/office-tools"
export OFFICE_E2E_URL="http://127.0.0.1:4173"
node --test tests/office/e2e.test.mjs
```

The browser suite is authored but has not yet completed a successful CI run. Treat DOCX/PPTX fidelity as unverified until this suite passes on the exact branch head and the round-trip fixtures are inspected.
