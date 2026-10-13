# Windows PowerShell 5.1 extraction uses legacy path limits. Inspect the
# verified archive before extraction so a long destination leaves no partial runtime.
function Test-BootstrapArchivePath([string]$ArchivePath, [string]$Destination) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
  try {
    foreach ($entry in $archive.Entries) {
      $target = [IO.Path]::GetFullPath((Join-Path $Destination $entry.FullName))
      $isDirectory = $entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')
      if ($target.Length -ge 260) { return $false }
      $directory = if ($isDirectory) { $target.TrimEnd([char[]]'\/') } else { [IO.Path]::GetDirectoryName($target) }
      if ($directory.Length -ge 248) { return $false }
    }
    return $true
  } finally { $archive.Dispose() }
}

function Get-BootstrapFailureMessage([string]$Code) {
  $messages = @{
    WIN_X64_REQUIRED = 'Use Windows x64 and 64-bit PowerShell.'
    RUNTIME_CONFIG_FAILED = 'Use a fresh copy of the complete diagnostic package.'
    LOCAL_DIRECTORY_FAILED = 'Use a new writable local folder.'
    DOWNLOAD_FAILED = 'Check network access to nodejs.org and retry.'
    ARCHIVE_HASH_MISMATCH = 'Node ZIP verification failed. Use a fresh diagnostic folder and retry.'
    ARCHIVE_PATH_CHECK_FAILED = 'Cannot inspect the verified Node ZIP. Use a fresh diagnostic folder.'
    ARCHIVE_PATH_TOO_LONG = 'Unpack the diagnostic ZIP into a NEW short folder, for example %USERPROFILE%\clear-diag, and retry.'
    PARTIAL_RUNTIME_REMOVE_MANUALLY = 'Incomplete runtime found. Unpack the diagnostic ZIP into a NEW short folder and retry.'
    ARCHIVE_EXTRACTION_FAILED = 'Node ZIP extraction failed. Use a NEW short folder; check available disk space and folder access.'
    NODE_HASH_MISMATCH = 'Node executable verification failed. Use a fresh diagnostic folder.'
    NODE_VERSION_MISMATCH = 'Pinned Node could not run or has the wrong version.'
    NPM_VERSION_MISMATCH = 'Pinned npm could not run or is incomplete. Use a NEW short diagnostic folder.'
    DEPENDENCY_INSTALL_FAILED = 'Dependency installation failed. Check network access and use a short local folder.'
  }
  if (-not $messages.ContainsKey($Code)) { $Code = 'UNEXPECTED_BOOTSTRAP_ERROR'; $hint = 'Use a fresh diagnostic folder and report this code.' }
  else { $hint = $messages[$Code] }
  return "BOOTSTRAP_FAIL [$Code]: $hint Do not share npm logs or personal paths."
}
