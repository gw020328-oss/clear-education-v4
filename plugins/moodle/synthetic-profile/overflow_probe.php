<?php
// Run only after the disposable installer sets both counters to SAFE_MAX.
$db=pg_connect('host=clear-profile-db dbname=clear_profile user=clear_runtime password=synthetic-runtime');
foreach ([
 ["UPDATE clear_source.users SET suspended=true",'P0001','authority overflow rolls source mutation back'],
 ["UPDATE clear_source.sessions SET userid=999",'23514','session overflow rolls source mutation back'],
] as [$sql,$state,$name]) {
 pg_send_query($db,$sql); $result=pg_get_result($db);
 if(pg_result_error_field($result,PGSQL_DIAG_SQLSTATE)!==$state) {throw new RuntimeException('OVERFLOW_NOT_REJECTED');}
 while(pg_get_result($db)!==false) {}
 echo 'PASS '.$name."\n";
}
$result=pg_query($db,'SELECT suspended FROM clear_source.users WHERE id=7');
if(pg_fetch_result($result,0,0)!=='f') {throw new RuntimeException('PARTIAL_AUTHORITY_WRITE');}
$result=pg_query($db,'SELECT userid FROM clear_source.sessions WHERE id=1');
if(pg_fetch_result($result,0,0)!=='7') {throw new RuntimeException('PARTIAL_SESSION_WRITE');}
echo "PASS overflow failures preserve original account and session\n";
