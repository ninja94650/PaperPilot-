$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot

python -m pip install --disable-pip-version-check python-docx==1.1.2 python-pptx==1.0.2
python tests/office/generate-fixtures.py
node --test tests/office/archive-validation.test.mjs

$tools = Join-Path $env:TEMP "paperpilot-office-e2e-tools"
npm install --prefix $tools --no-save --no-package-lock vite@8.3.5 playwright-core@1.57.0
& (Join-Path $tools "node_modules\.bin\playwright-core.cmd") install chromium

$env:OFFICE_E2E_TOOLS = $tools
$env:OFFICE_E2E_URL = "http://127.0.0.1:4173"
$vite = Join-Path $tools "node_modules\.bin\vite.cmd"
$stdout = Join-Path $env:TEMP "paperpilot-office-vite.stdout.log"
$stderr = Join-Path $env:TEMP "paperpilot-office-vite.stderr.log"
$server = Start-Process -FilePath $vite -ArgumentList @("tests/office/e2e", "--host", "127.0.0.1", "--port", "4173", "--strictPort") -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      Invoke-WebRequest -Uri $env:OFFICE_E2E_URL -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $ready) {
    if (Test-Path $stderr) { Get-Content $stderr }
    throw "Office editor fixture server did not start."
  }
  node --test tests/office/e2e.test.mjs
  if ($LASTEXITCODE -ne 0) { throw "Office browser regression tests failed." }
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}
