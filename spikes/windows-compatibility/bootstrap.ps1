[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'bootstrap-support.ps1')
$failureCode = 'WIN_X64_REQUIRED'
try {
  if (-not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'WIN_X64_REQUIRED' }
  $failureCode = 'RUNTIME_CONFIG_FAILED'
  $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
  $pin = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.json') -Raw | ConvertFrom-Json
  $toolchain = Join-Path $repo '.toolchain'
  $failureCode = 'LOCAL_DIRECTORY_FAILED'
  New-Item -ItemType Directory -Path $toolchain -Force | Out-Null
  $zip = Join-Path $toolchain 'node-v24.21.0-win-x64.zip'
  $nodeHome = Join-Path $toolchain 'node-v24.21.0-win-x64'
  $node = Join-Path $nodeHome 'node.exe'
  if (-not (Test-Path -LiteralPath $node)) {
    $failureCode = 'DOWNLOAD_FAILED'
    Invoke-WebRequest -UseBasicParsing -Uri $pin.url -OutFile $zip
    $failureCode = 'ARCHIVE_HASH_MISMATCH'
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.sha256) { throw 'ARCHIVE_HASH_MISMATCH' }
    $failureCode = 'PARTIAL_RUNTIME_REMOVE_MANUALLY'
    if (Test-Path -LiteralPath $nodeHome) { throw 'PARTIAL_RUNTIME_REMOVE_MANUALLY' }
    $failureCode = 'ARCHIVE_PATH_CHECK_FAILED'
    if (-not (Test-BootstrapArchivePath $zip $toolchain)) {
      $failureCode = 'ARCHIVE_PATH_TOO_LONG'
      throw $failureCode
    }
    $failureCode = 'ARCHIVE_EXTRACTION_FAILED'
    Expand-Archive -LiteralPath $zip -DestinationPath $toolchain
  }
  $failureCode = 'NODE_HASH_MISMATCH'
  if ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.nodeExeSha256) { throw 'NODE_HASH_MISMATCH' }
  $failureCode = 'NODE_VERSION_MISMATCH'
  if ((& $node --version) -ne ('v' + $pin.node)) { throw 'NODE_VERSION_MISMATCH' }
  $failureCode = 'NPM_VERSION_MISMATCH'
  $npm = Join-Path $nodeHome 'node_modules/npm/bin/npm-cli.js'
  if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) { throw 'NPM_VERSION_MISMATCH' }
  if ((& $node $npm --version) -ne $pin.npm) { throw 'NPM_VERSION_MISMATCH' }
  $oldPath = $env:PATH
  try {
    $env:PATH = $nodeHome + ';' + $oldPath
    # No lifecycle scripts, global installation or native gnark build.
    $failureCode = 'DEPENDENCY_INSTALL_FAILED'
    & $node $npm ci --prefix (Join-Path $repo 'src/ybm-collector') --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'DEPENDENCY_INSTALL_FAILED' }
  } finally { $env:PATH = $oldPath }
  Write-Output 'BOOTSTRAP_PASS: pinned local Node and lockfile dependencies installed.'
} catch {
  Write-Output (Get-BootstrapFailureMessage $failureCode)
  exit 1
}
