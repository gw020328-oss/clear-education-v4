<?php
// Installed endpoint. Disabled outside the explicitly isolated synthetic profile.
// Webserver maps only exact /observations here; never map the owner/fault fixture router.
ini_set('display_errors','0');
header('Content-Type: application/json');header('Cache-Control: no-store');
$level=ob_get_level();ob_start();
try {
    if (getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || getenv('CLEAR_HTTP_LIFECYCLE_PROBE')!=='1') {
        http_response_code(404);throw new RuntimeException('REJECTED');
    }
    require_once __DIR__.'/peer/protocol.php';
    \local_clearbridge\peer\check(($_SERVER['REQUEST_URI']??'')==='/observations' && ($_SERVER['REQUEST_METHOD']??'')==='POST' &&
        ($_SERVER['CONTENT_TYPE']??'')==='application/json' && empty($_SERVER['HTTP_CONTENT_ENCODING']));
    $wire=file_get_contents('php://input',false,null,0,32769);
    \local_clearbridge\peer\check(is_string($wire) && strlen($wire)<=32768);
    define('NO_MOODLE_COOKIES',true);
    require __DIR__.'/../../config.php';
    \local_clearbridge\peer\check($SITE->shortname==='clear' && !empty($CFG->clearbridge_synthetic_peerconfig));
    $config=json_decode(file_get_contents($CFG->clearbridge_synthetic_peerconfig),true,16,JSON_THROW_ON_ERROR);
    \local_clearbridge\peer\exact($config,['keyBase64','pin','replayPath','profilePath']);
    $key=base64_decode($config['keyBase64'],true);
    \local_clearbridge\peer\check(is_string($key) && strlen($key)===32 && base64_encode($key)===$config['keyBase64']);
    $replay=new \local_clearbridge\peer\ReplayStore($config['replayPath']);
    try {
        $request=\local_clearbridge\peer\accept($wire,$key,$config['pin'],$replay);
        require_once '/probe/moodle-integration/observations_route.php';
        $profile=json_decode(file_get_contents($config['profilePath']),true,32,JSON_THROW_ON_ERROR);
        [$status,$value]=\clear_moodle_probe\observations_route('POST','/observations',$request['body'],$profile,
            static fn($method,$target,$body)=>json_decode($body,true,16,JSON_THROW_ON_ERROR));
        \local_clearbridge\peer\check($status===200);
        $body=json_encode($value,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        $result=\local_clearbridge\peer\response($request,$body,$key,$config['pin'],time(),$value['expiresAtExclusive']);
    } finally {$replay->close();if (isset($key)) {sodium_memzero($key);}}
    while (ob_get_level()>$level) {ob_end_clean();}
    header_remove('Set-Cookie');header('Content-Type: application/json');header('Cache-Control: no-store');http_response_code(200);echo $result;
} catch (Throwable $e) {
    while (ob_get_level()>$level) {ob_end_clean();}
    header_remove('Set-Cookie');header('Content-Type: application/json');header('Cache-Control: no-store');if (http_response_code()!==404) {http_response_code(403);}
    echo '{"code":"REJECTED"}';
}
