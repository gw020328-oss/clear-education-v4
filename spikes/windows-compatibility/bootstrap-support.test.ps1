$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'bootstrap-support.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Join-Path ([IO.Path]::GetTempPath()) ('clear-bootstrap-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try {
  $zip = Join-Path $root 'synthetic.zip'
  $archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
  try {
    $entry = $archive.CreateEntry('node/node_modules/npm/' + ('nested/' * 8) + 'fixture.txt')
    $writer = New-Object IO.StreamWriter($entry.Open())
    try { $writer.Write('synthetic') } finally { $writer.Dispose() }
  } finally { $archive.Dispose() }
  $short = Join-Path $root 'short'
  if (-not (Test-BootstrapArchivePath $zip $short)) { throw 'SHORT_PATH_REJECTED' }
  Expand-Archive -LiteralPath $zip -DestinationPath $short
  if (@(Get-ChildItem -LiteralPath $short -Recurse -Filter fixture.txt).Count -ne 1) { throw 'SHORT_EXTRACTION_FAILED' }
  $long = Join-Path $root ('x' * 170)
  if (Test-BootstrapArchivePath $zip $long) { throw 'LONG_PATH_ACCEPTED' }
  if (Test-Path -LiteralPath $long) { throw 'PREFLIGHT_WROTE_DESTINATION' }
  # A long parent is unsafe even when its file path is shorter than MAX_PATH.
  $directoryZip = Join-Path $root 'directory.zip'
  $archive = [IO.Compression.ZipFile]::Open($directoryZip, [IO.Compression.ZipArchiveMode]::Create)
  try { $null = $archive.CreateEntry(('d' * (248 - $short.Length - 1)) + '/x') }
  finally { $archive.Dispose() }
  if (Test-BootstrapArchivePath $directoryZip $short) { throw 'LONG_DIRECTORY_ACCEPTED' }
  $message = Get-BootstrapFailureMessage 'ARCHIVE_PATH_TOO_LONG'
  if ($message -notmatch '\[ARCHIVE_PATH_TOO_LONG\]' -or $message -notmatch 'NEW short folder') { throw 'LONG_PATH_GUIDANCE_MISSING' }
  $unknown = Get-BootstrapFailureMessage 'C:\private-user\secret-error'
  if ($unknown -match 'private-user|secret-error' -or $unknown -notmatch 'UNEXPECTED_BOOTSTRAP_ERROR') { throw 'ERROR_TEXT_LEAKED' }
  $download = Get-BootstrapFailureMessage 'DOWNLOAD_FAILED'
  if ($download -notmatch '\[DOWNLOAD_FAILED\]' -or $download -notmatch 'network') { throw 'DOWNLOAD_GUIDANCE_MISSING' }
  Write-Output 'BOOTSTRAP_SUPPORT: short extraction, long file/directory rejection, read-only preflight, safe error guidance PASS'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
