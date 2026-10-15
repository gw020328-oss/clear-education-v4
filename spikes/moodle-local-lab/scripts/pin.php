<?php
define('CLI_SCRIPT',true); require('/var/www/html/config.php');
if($CFG->wwwroot!=='http://127.0.0.1:18765')throw new Exception('LOCAL_ONLY');
$f=json_decode(file_get_contents('/var/moodledata/local-api-fixture.json'),true);
$label=$argv[1]??'one'; if(!isset($f['users'][$label]))throw new Exception('LOCAL_ACCOUNT');
\core\session\manager::set_user($DB->get_record('user',['id'=>$f['users'][$label]]));
try { echo json_encode(\local_clearapi\exporter::snapshot($f['users'][$label],$f['courseid'])); }
catch(\Throwable $e) {
    file_put_contents('/lab-runtime/pin-error.json',json_encode(['type'=>get_class($e),'diagnostic'=>$e->debuginfo??$e->getMessage()]));
    chmod('/lab-runtime/pin-error.json',0600); echo 'LOCAL_PIN_FAILED'; exit(1);
}
