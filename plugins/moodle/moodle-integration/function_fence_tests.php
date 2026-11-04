<?php
// Actual integration DB, synthetic rows only. No Moodle login/session bootstrap.
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1'){exit(1);}
$pg=pg_connect('host=clear-actual-db dbname=moodle user=clear_moodle_runtime password=synthetic-runtime');
$r=pg_query($pg,"SELECT s.id,s.userid,g.generation,a.revision FROM mdl_sessions s JOIN clear_probe.generations g ON g.sessionid=s.id CROSS JOIN clear_probe.authority a WHERE s.sid='synthetic-issue-failure'");
$row=pg_fetch_assoc($r);if(!$row){throw new RuntimeException('FIXTURE_MISSING');}
function rejectcall($pg,array $args,string $code):void {
 pg_send_query_params($pg,'SELECT clear_probe.insert_confirmation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',$args);
 $r=pg_get_result($pg);$message=pg_result_error($r);while(pg_get_result($pg)!==false){}
 if(!str_contains($message,$code)){throw new RuntimeException('FENCE_NOT_REJECTED');}
 echo 'PASS database insert rejects '.$code."\n";
}
$args=[bin2hex(random_bytes(32)),$row['id'],$row['userid'],$row['revision'],$row['generation'],str_repeat('a',64),str_repeat('b',64),str_repeat('c',64),str_repeat('d',64),time(),time()+60];
rejectcall($pg,$args,'SESSION_LOCK_REQUIRED');
pg_query_params($pg,'SELECT pg_advisory_lock($1)',[$row['id']]);
$args[4]=(int)$row['generation']+1;rejectcall($pg,$args,'STALE_FENCE');
pg_query_params($pg,'SELECT pg_advisory_unlock($1)',[$row['id']]);
pg_close($pg);
