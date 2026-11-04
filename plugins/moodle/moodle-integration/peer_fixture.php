<?php
// Owner-assisted synthetic CLI only. Never routed by Apache or included in the ZIP.
if (PHP_SAPI!=='cli' || getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || getenv('CLEAR_HTTP_LIFECYCLE_PROBE')!=='1') {exit(1);}
define('CLI_SCRIPT',true);
require __DIR__.'/http_bootstrap.php';require '/var/www/html/config.php';
require_once __DIR__.'/adapter.php';require_once __DIR__.'/attempt_fixture.php';
$target=json_decode(file_get_contents('/tmp/clear-target.json'),true,16,JSON_THROW_ON_ERROR);
// The trusted owner CLI accepts the exact B request; never replace its scope or attempt.
$incoming=null;
if (($argv[1]??'')==='--stdin') {
    $input=stream_get_contents(STDIN,16385);\clear_synthetic\require_rule(strlen($input)<=16384,'REQUEST');
    $incoming=json_decode($input,true,16,JSON_THROW_ON_ERROR);\clear_moodle_probe\wire_request($incoming,'confirmation');
}
$request=register_probe_attempt($target,$incoming,['expiry'=>time()+120]);
$pg=\clear_moodle_probe\pg_from_config('reader');$profile=\clear_moodle_probe\collect_profile($pg,$target);pg_close($pg);
file_put_contents('/tmp/clear-http-profile.json',json_encode($profile,JSON_THROW_ON_ERROR));
$curl=curl_init();curl_setopt_array($curl,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_COOKIEFILE=>'',CURLOPT_TIMEOUT=>20,CURLOPT_FOLLOWLOCATION=>false]);
function fixture_call(string $path,?array $body=null): array {
    global $curl;
    curl_setopt_array($curl,[CURLOPT_URL=>'http://127.0.0.1:18767'.$path,CURLOPT_CUSTOMREQUEST=>$body===null?'GET':'POST',CURLOPT_HTTPHEADER=>['Content-Type: application/json','Host: 127.0.0.1:18767'],CURLOPT_POSTFIELDS=>$body===null?null:json_encode($body)]);
    $text=curl_exec($curl);$value=json_decode($text,true);
    if (curl_getinfo($curl,CURLINFO_RESPONSE_CODE)!==200 || ($value['ok']??false)!==true) {throw new RuntimeException('SYNTHETIC_FIXTURE_REJECTED');}
    return $value['result'];
}
try {
    $session=fixture_call('/session');$session=fixture_call('/fixture-login',['sesskey'=>$session['sesskey']]);
    $receipt=fixture_call('/confirm',['sesskey'=>$session['sesskey'],'confirm'=>true,'request'=>$request]);
    $observations=probe_observations_request($request,$receipt);
    $confirmation=\clear_moodle_probe\confirmation($request,$profile);
    $out=['mode'=>'SYNTHETIC_ONLY','request'=>$observations,'confirmation'=>$confirmation,'expiresAtExclusive'=>$receipt['expiresAtExclusive']];
    file_put_contents('/tmp/clear-peer-request.json',json_encode($out,JSON_THROW_ON_ERROR));
    echo json_encode($out,JSON_THROW_ON_ERROR)."\n";
} finally {curl_close($curl);}
