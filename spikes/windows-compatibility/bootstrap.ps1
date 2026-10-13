[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  if (-not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'WIN_X64_REQUIRED' }
  $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
  $pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.json') -Raw | ConvertFrom-Json
  $toolchain = Join-Path $repo '.toolchain'
  New-Item -ItemType Directory -Path $toolchain -Force | Out-Null
  $zip = Join-Path $toolchain 'node-v24.21.0-win-x64.zip'
  $nodeHome = Join-Path $toolchain 'node-v24.21.0-win-x64'
  $node = Join-Path $nodeHome 'node.exe'
  if (-not (Test-Path -LiteralPath $node)) {
    Invoke-WebRequest -UseBasicParsing -Uri $pin.url -OutFile $zip
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256) { throw 'ARCHIVE_HASH_MISMATCH' }
    if (Test-Path -LiteralPath $nodeHome) { throw 'PARTIAL_RUNTIME_REMOVE_MANUALLY' }
    Expand-Archive -LiteralPath $zip -DestinationPath $toolchain
  }
  if ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.nodeExeSha256) { throw 'NODE_HASH_MISMATCH' }
  if ((& $node --version) -ne ('v' + $pin.node)) { throw 'NODE_VERSION_MISMATCH' }
  $npm = Join-Path $nodeHome 'node_modules/npm/bin/npm-cli.js'
  if ((& $node $npm --version) -ne $pin.npm) { throw 'NPM_VERSION_MISMATCH' }
  $oldPath = $env:PATH
  try {
    $env:PATH = $nodeHome + ';' + $oldPath
    # No lifecycle scripts, global installation or native gnark build.
    & $node $npm ci --prefix (Join-Path $repo 'src/ybm-collector') --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'DEPENDENCY_INSTALL_FAILED' }
  } finally { $env:PATH = $oldPath }
  Write-Output 'BOOTSTRAP_PASS: pinned local Node and lockfile dependencies installed.'
} catch {
  Write-Output 'BOOTSTRAP_FAIL: check download, hash, architecture, or local dependency installation. Do not share npm logs.'
  exit 1
}
