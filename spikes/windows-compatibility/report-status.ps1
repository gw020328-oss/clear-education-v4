function Get-ChromeProfileStatus($Report, [int]$ProcessExitCode, [bool]$CleanupConfirmed) {
  # A process exit, complete child checks, and actual folder removal are all
  # required. An empty/partial child report must never manufacture a PASS.
  if (-not $CleanupConfirmed -or $ProcessExitCode -ne 0 -or $null -eq $Report) { return 'FAIL' }
  if ($Report.schemaVersion -ne 1 -or $Report.scope -ne 'SYNTHETIC_ONLY' -or $Report.realYbm -ne $false) { return 'FAIL' }
  $required=@('chrome-private-pipe','chrome-synthetic-cdp-roundtrip','chrome-normal-exit')
  if (@($Report.checks).Count -ne $required.Count) { return 'FAIL' }
  foreach ($id in $required) {
    $matching=@($Report.checks | Where-Object {$_.id -ceq $id})
    if ($matching.Count -ne 1 -or $matching[0].status -cne 'PASS') { return 'FAIL' }
  }
  return 'PASS'
}
