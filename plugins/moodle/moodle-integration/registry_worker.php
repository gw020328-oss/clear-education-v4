<?php
// Separate owner fixture process for races/crash rollback. Never an HTTP route.
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1'){exit(1);}
require __DIR__.'/registry_fixture.php';
$input=json_decode(stream_get_contents(STDIN),true);
$pg=\clear_moodle_registry_fixture\owner();
echo "READY\n";flush();
try {
    $hook=($input['mode']??'')==='crash'?static function():void{exit(71);}:null;
    \clear_moodle_registry\accept($pg,$input['wire'],$hook);
    echo '{"ok":true}'."\n";
} catch(Throwable $e) {
    $code=preg_match('/^REGISTRY_[A-Z_]+$/D',$e->getMessage())?$e->getMessage():'REJECTED';
    echo json_encode(['ok'=>false,'code'=>$code])."\n";
} finally {pg_close($pg);}
