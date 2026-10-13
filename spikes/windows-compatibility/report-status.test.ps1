$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'report-status.ps1')
function Fixture {
  return [PSCustomObject]@{schemaVersion=1;scope='SYNTHETIC_ONLY';realYbm=$false;checks=@(
    [PSCustomObject]@{id='chrome-private-pipe';status='PASS'},
    [PSCustomObject]@{id='chrome-synthetic-cdp-roundtrip';status='PASS'},
    [PSCustomObject]@{id='chrome-normal-exit';status='PASS'})}
}
function Expect($Report,[int]$Code,[bool]$Cleaned,[string]$Expected) {
  if ((Get-ChromeProfileStatus $Report $Code $Cleaned) -ne $Expected) { throw 'REPORT_STATUS_REGRESSION' }
}
Expect (Fixture) 0 $true 'PASS'
Expect (Fixture) 1 $true 'FAIL'
Expect (Fixture) 0 $false 'FAIL'
Expect $null 0 $true 'FAIL'
$r=Fixture;$r.checks=@();Expect $r 0 $true 'FAIL'
$r=Fixture;$r.checks=$r.checks[0..1];Expect $r 0 $true 'FAIL'
$r=Fixture;$r.checks[2].status='FAIL';Expect $r 0 $true 'FAIL'
$r=Fixture;$r.checks[2].id='chrome-private-pipe';Expect $r 0 $true 'FAIL'
$r=Fixture;$r.scope='UNKNOWN';Expect $r 0 $true 'FAIL'
Write-Output 'CHROME_REPORT_STATUS: 9 PASS (synthetic fixtures)'

foreach ($case in @(
  @(1,26200,'PASS',''),
  @(1,22000,'PASS',''),
  @(1,21999,'NOT_RUN','WINDOWS11_REQUIRED'),
  @(3,20348,'NOT_RUN','SERVER_CI_IS_NOT_WINDOWS11'),
  @(3,26200,'NOT_RUN','SERVER_CI_IS_NOT_WINDOWS11')
)) {
  $actual = Get-WindowsTargetStatus $case[0] $case[1]
  if ($actual.status -cne $case[2] -or $actual.code -cne $case[3]) { throw 'WINDOWS_TARGET_STATUS_REGRESSION' }
}
Write-Output 'WINDOWS_TARGET_STATUS: 5 PASS (synthetic fixtures)'
