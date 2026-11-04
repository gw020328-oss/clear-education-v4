<?php
// Offline synthetic registry writer. Never exposed as an endpoint or imported by the adapter.
function register_probe_attempt(array $target,?array $request=null,array $override=[]): array {
    global $CFG;
    if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1'){throw new RuntimeException('SYNTHETIC_ONLY');}
    $request??=['version'=>'clear-moodle-confirmation.3','attemptRef'=>bin2hex(random_bytes(32)),
        'requestRef'=>bin2hex(random_bytes(32)),'issuerEpoch'=>'issuer-probe-v1','bindingScopeHash'=>str_repeat('b',64)];
    $a=array_replace(['attemptref'=>$request['attemptRef'],'issuer'=>$request['issuerEpoch'],'scopehash'=>$request['bindingScopeHash'],
        'userid'=>$target['user'],'courseid'=>$target['course'],'moduleid'=>$target['module'],
        'installationref'=>'synthetic-moodle','courseref'=>'synthetic-course','subjectref'=>'synthetic-subject',
        'audience'=>'synthetic-clear','rosterrevision'=>1,'trustepoch'=>1,'expiry'=>time()+120,'status'=>'ACTIVE'],$override);
    $owner=pg_connect('host='.$CFG->dbhost.' dbname=moodle user=moodle password=isolatedtest',PGSQL_CONNECT_FORCE_NEW);
    $r=pg_query_params($owner,'INSERT INTO clear_probe.attempts VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',array_values($a));
    pg_close($owner);
    if($r===false){throw new RuntimeException('FIXTURE_ATTEMPT');}
    return $request;
}
function probe_observations_request(array $attempt,array $receipt): array {
    return ['version'=>'clear-moodle-observations.3','requestRef'=>bin2hex(random_bytes(32)),
        'issuerEpoch'=>$attempt['issuerEpoch'],'bindingScopeHash'=>$attempt['bindingScopeHash'],'confirmationRef'=>$receipt['confirmationRef']];
}
