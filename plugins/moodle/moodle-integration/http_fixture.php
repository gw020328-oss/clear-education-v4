<?php
// Owner-only CLI preparation/inspection. Never routed over HTTP.
define('CLI_SCRIPT',true);
require __DIR__.'/http_bootstrap.php';
require '/var/www/html/config.php';
require_once __DIR__.'/adapter.php';
require __DIR__.'/attempt_fixture.php';
$target=json_decode(file_get_contents('/tmp/clear-target.json'),true);
if(($argv[1]??'')==='prepare') {
    $requests=[];
    foreach(['normal','redirect','nested','rollback','logout','regenerate','mutation','shutdown','csrf','idle','ip','external-data','external-identity'] as $name) {
        $requests[$name]=register_probe_attempt($target,null,['expiry'=>time()+1800]);
    }
    $pg=\clear_moodle_probe\pg_from_config('reader');
    $profile=\clear_moodle_probe\collect_profile($pg,$target);pg_close($pg);
    file_put_contents('/tmp/clear-http-profile.json',json_encode($profile,JSON_THROW_ON_ERROR));
    file_put_contents('/tmp/clear-http-requests.json',json_encode($requests,JSON_THROW_ON_ERROR));
    echo json_encode($requests,JSON_THROW_ON_ERROR);
} else if(($argv[1]??'')==='delay') {
    require __DIR__.'/snapshot_delay_fixture.php';
    $profile=json_decode(file_get_contents('/tmp/clear-http-profile.json'),true);
    $request=json_decode(file_get_contents('/tmp/clear-http-requests.json'),true)['normal'];
    // Pin immutable code at worker startup, as the persistent CLI adapter does. No clock/limit override.
    \clear_moodle_probe\code_pin($CFG->dirroot);
    $started=['wall'=>time(),'mono'=>hrtime(true)/1000000];
    $response=\clear_moodle_probe\confirmation($request,$profile);
    $received=['wall'=>time(),'mono'=>hrtime(true)/1000000];
    $result=['response'=>$response,'started'=>$started,'received'=>$received];
    file_put_contents('/tmp/clear-http-delay.json',json_encode($result,JSON_THROW_ON_ERROR));
    echo json_encode($result,JSON_THROW_ON_ERROR);
} else if(($argv[1]??'')==='inspect') {
    // Digest persistence evidence only; never serialize raw session/cookie bytes to the client.
    $rows=$DB->get_records_sql('SELECT c.attemptref,c.generation AS confirmedgeneration,g.generation AS currentgeneration,
        CASE WHEN s.id IS NULL THEN 0 ELSE 1 END AS sessionexists,md5(s.sessdata) AS digest
        FROM clear_probe.confirmations c LEFT JOIN {sessions} s ON s.id=c.sessionid
        LEFT JOIN clear_probe.generations g ON g.sessionid=c.sessionid');
    echo json_encode(['count'=>count($rows),'rows'=>array_values($rows)],JSON_THROW_ON_ERROR);
} else {exit(1);}
