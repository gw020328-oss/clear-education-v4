[CmdletBinding()]
param([switch]$Ci)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'report-status.ps1')
$checks = New-Object System.Collections.Generic.List[object]
function Check([string]$Id,[string]$Status,[string]$Code = '') {
  $item = [ordered]@{id=$Id;status=$Status}
  if ($Code) { $item.code=$Code }
  $checks.Add($item)
}
function No-Reparse([string]$Path) {
  $item = Get-Item -LiteralPath $Path -Force
  while ($null -ne $item) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_POINT' }
    $item=$item.Parent
  }
}
function Remove-SyntheticTree([string]$Path) {
  # Refuse links before recursive deletion. This is a synthetic diagnostic,
  # not a race-resistant production implementation of Windows storage.
  No-Reparse $Path
  $stack = New-Object System.Collections.Generic.Stack[string]
  $stack.Push($Path)
  while ($stack.Count -gt 0) {
    foreach ($item in (Get-ChildItem -LiteralPath $stack.Pop() -Force)) {
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_POINT' }
      if ($item.PSIsContainer) { $stack.Push($item.FullName) }
    }
  }
  Remove-Item -LiteralPath $Path -Recurse -Force
}
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$reportDir=Join-Path $repo 'artifacts/windows-compatibility'
$run=$null;$safeToDelete=$true;$exitCode=0;$osBuild=$null;$osKind='UNKNOWN'
$oldJob=$env:CLEAR_SYNTHETIC_JOB
$chromeAttempted=$false;$chromeProbeReport=$null;$chromeExitCode=1;$cleanupConfirmed=$false
try {
  if (-not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'WIN_X64_REQUIRED' }
  $os=Get-CimInstance Win32_OperatingSystem
  $osBuild=[string]$os.BuildNumber
  $osKind=if ($os.ProductType -eq 1) {'CLIENT'} else {'SERVER'}
  Check 'target-windows11-x64' $(if($os.ProductType -eq 1 -and [int]$os.BuildNumber -ge 22000){'PASS'}else{'NOT_RUN'}) 'SERVER_CI_IS_NOT_WINDOWS11'
  $node=Join-Path $repo '.toolchain/node-v24.21.0-win-x64/node.exe'
  $pin=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.json') -Raw | ConvertFrom-Json
  if ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pin.nodeExeSha256) { throw 'PINNED_NODE_REQUIRED' }
  Check 'pinned-windows-node-sha256' 'PASS'
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
  No-Reparse $env:LOCALAPPDATA
  # A unique path avoids touching old collector data. No real browser credentials.
  $run=Join-Path $env:LOCALAPPDATA ('CLEAR-Spike-' + [Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $run | Out-Null
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true,$false)
  $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $run -AclObject $acl
  $readAcl=Get-Acl -LiteralPath $run
  $allow=@($readAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object {$_.AccessControlType -eq 'Allow'})
  if (-not $readAcl.AreAccessRulesProtected -or $allow.Count -ne 1 -or $allow[0].IdentityReference.Value -ne $sid.Value -or $readAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'ACL_CHECK_FAILED' }
  Check 'new-directory-private-acl' 'PASS'
  No-Reparse $run;Check 'storage-ancestor-reparse-check' 'PASS'
  $knownSync=@($env:OneDrive,$env:OneDriveCommercial,$env:OneDriveConsumer) | Where-Object {$_}
  $insideSync=$false
  foreach($sync in $knownSync) { if($run.StartsWith(([IO.Path]::GetFullPath($sync).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)){$insideSync=$true} }
  Check 'known-onedrive-path-exclusion' $(if($insideSync){'FAIL'}else{'PASS'})
  Check 'other-sync-backup-exclusion' 'NOT_RUN' 'DEVICE_OWNER_REVIEW_REQUIRED'
  try {
    $volume=Get-BitLockerVolume -MountPoint ([IO.Path]::GetPathRoot($run))
    Check 'device-encryption-active' $(if([string]$volume.ProtectionStatus -eq 'On' -and [string]$volume.VolumeStatus -eq 'FullyEncrypted'){'PASS'}else{'BLOCKED'})
  } catch { Check 'device-encryption-active' 'BLOCKED' 'READ_ACCESS_OR_MODULE_UNAVAILABLE' }
  $lockPath=Join-Path $run 'synthetic.lock'
  $handle=[IO.File]::Open($lockPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try {
    $blocked=$false
    try {$other=[IO.File]::Open($lockPath,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$other.Dispose()}catch [IO.IOException]{$blocked=$true}
    Check 'exclusive-lock-second-open' $(if($blocked){'PASS'}else{'FAIL'})
  } finally {$handle.Dispose()}
  $reopen=[IO.File]::Open($lockPath,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$reopen.Dispose();Check 'exclusive-lock-release' 'PASS'
  $target=Join-Path $run 'junction-target';$link=Join-Path $run 'junction-link'
  New-Item -ItemType Directory -Path $target | Out-Null
  $junctionCreated=$false
  try {
    New-Item -ItemType Junction -Path $link -Target $target | Out-Null;$junctionCreated=$true
    $blocked=$false;try{No-Reparse $link}catch{$blocked=$true}
    Check 'junction-rejected' $(if($blocked){'PASS'}else{'FAIL'})
  } catch { Check 'junction-rejected' 'NOT_RUN' 'JUNCTION_CREATION_UNAVAILABLE' }
  finally { if($junctionCreated){[IO.Directory]::Delete($link)} }
  Add-Type -Path (Join-Path $PSScriptRoot 'JobRunner.cs')
  $env:CLEAR_SYNTHETIC_JOB='1'
  $marker=Join-Path $run 'tree-marker.json'
  try {
    $code=[ClearSpikeJob]::Run($node,@((Join-Path $PSScriptRoot 'job-tree-probe.mjs'),$marker),$run,3000)
    $spawned=(Test-Path -LiteralPath $marker) -and ((Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json).spawned -eq $true)
    Check 'job-suspended-assign-tree-terminate-zero' $(if($code -eq 124 -and $spawned){'PASS'}else{'FAIL'})
  } catch { $safeToDelete=$false;throw 'JOB_TREE_NOT_CONFIRMED' }
  Check 'job-host-forced-kill-close-recovery' 'NOT_RUN' 'PRODUCTION_LIFECYCLE_GATE'
  $cryptoReport=Join-Path $run 'crypto.json'
  try { $code=[ClearSpikeJob]::Run($node,@((Join-Path $PSScriptRoot 'crypto-probe.mjs'),$cryptoReport),$run,600000) }
  catch {$safeToDelete=$false;throw 'JOB_TREE_NOT_CONFIRMED'}
  if(Test-Path -LiteralPath $cryptoReport) { foreach($check in (Get-Content -LiteralPath $cryptoReport -Raw | ConvertFrom-Json).checks){Check $check.id $check.status $check.code} }
  else { Check 'crypto-probe-completed' 'FAIL' 'NO_REPORT' }
  if($code -ne 0){Check 'crypto-process-exit' 'FAIL'}
  $chromeCandidates=@((Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe'),(Join-Path ${env:ProgramFiles(x86)} 'Google/Chrome/Application/chrome.exe'),(Join-Path $env:LOCALAPPDATA 'Google/Chrome/Application/chrome.exe'))
  $chrome=$chromeCandidates | Where-Object {Test-Path -LiteralPath $_ -PathType Leaf} | Select-Object -First 1
  if($chrome){
    Check 'installed-chrome-found' 'PASS'
    $before=@(Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object {try{[PSCustomObject]@{Id=$_.Id;Start=$_.StartTime.ToUniversalTime().Ticks}}catch{}})
    $unicodeSpace='synthetic space ' + [char]0xD55C + [char]0xAE00
    $browserRoot=Join-Path $run $unicodeSpace;New-Item -ItemType Directory -Path $browserRoot | Out-Null
    $chromeAttempted=$true
    $chromeReport=Join-Path $run 'chrome.json'
    try {$code=[ClearSpikeJob]::Run($node,@((Join-Path $PSScriptRoot 'chrome-probe.mjs'),$chrome,$browserRoot,$chromeReport),$run,90000)}
    catch {$safeToDelete=$false;throw 'JOB_TREE_NOT_CONFIRMED'}
    $chromeExitCode=$code
    if(Test-Path -LiteralPath $chromeReport){$chromeProbeReport=Get-Content -LiteralPath $chromeReport -Raw | ConvertFrom-Json;foreach($check in $chromeProbeReport.checks){Check $check.id $check.status}}
    else{Check 'chrome-probe-completed' 'FAIL' 'NO_REPORT'}
    if($code -ne 0){Check 'chrome-process-exit' 'FAIL'}
    $preserved=$true
    foreach($existing in $before){$p=Get-Process -Id $existing.Id -ErrorAction SilentlyContinue;if(-not $p -or $p.StartTime.ToUniversalTime().Ticks -ne $existing.Start){$preserved=$false}}
    Check 'existing-chrome-pid-start-preserved' $(if($before.Count -eq 0){'NOT_RUN'}elseif($preserved){'PASS'}else{'FAIL'})
  }else {Check 'installed-chrome-found' 'BLOCKED'}
  Check 'pid-reuse-recovery-adversarial' 'NOT_RUN' 'PRODUCTION_LIFECYCLE_GATE'
  Check 'active-24h-expiry-and-crash-restart-cleanup' 'NOT_RUN' 'PRODUCTION_LIFECYCLE_GATE'
  Check 'reparse-race-and-hardlink-attack' 'NOT_RUN' 'PRODUCTION_STORAGE_GATE'
} catch {Check 'diagnostic-run' 'FAIL' 'SAFE_DIAGNOSTIC_FAILURE';$exitCode=1}
finally {
  $env:CLEAR_SYNTHETIC_JOB=$oldJob
  if($run -and (Test-Path -LiteralPath $run)){
    if($safeToDelete){try{Remove-SyntheticTree $run;$cleanupConfirmed=-not (Test-Path -LiteralPath $run);if(-not $cleanupConfirmed){throw 'CLEANUP_NOT_CONFIRMED'};Check 'synthetic-normal-error-cleanup' 'PASS'}catch{Check 'synthetic-normal-error-cleanup' 'FAIL';$exitCode=1}}
    else{Check 'synthetic-normal-error-cleanup' 'BLOCKED' 'PROCESS_TREE_NOT_CONFIRMED';$exitCode=1}
  }
  if($chromeAttempted){Check 'unicode-space-profile-job-cleanup' (Get-ChromeProfileStatus $chromeProbeReport $chromeExitCode $cleanupConfirmed)}
  if(@($checks | Where-Object {$_.status -eq 'FAIL'}).Count -gt 0){$exitCode=1}
  $report=[ordered]@{schemaVersion=1;scope='SYNTHETIC_ONLY';platform='win32';arch='x64';osKind=$osKind;osBuild=$osBuild;ciRequested=[bool]$Ci;checks=@($checks.ToArray());realYbm=$false;productionReady=$false}
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
  $output=Join-Path $reportDir ('report-' + [Guid]::NewGuid().ToString() + '.json')
  [IO.File]::WriteAllText($output,($report | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
  Write-Output 'Synthetic diagnostic complete. Share only artifacts/windows-compatibility/report-*.json. No raw proof, cookies, keys, profile, paths, or process IDs are included.'
}
exit $exitCode
