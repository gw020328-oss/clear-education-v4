<?php
require __DIR__.'/native_codec_fixture.php';
define('CLI_SCRIPT',true);
require '/var/www/html/config.php';
require __DIR__.'/adapter.php';
require __DIR__.'/attempt_fixture.php';
require __DIR__.'/native_handler_fixture.php';
use function clear_moodle_probe\pg_from_config;
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || $SITE->shortname!=='clear'){exit(1);}
$target=json_decode(file_get_contents('/tmp/clear-target.json'),true);
\core\session\manager::set_user(get_complete_user_data('id',$target['user']));
$SESSION=new stdClass();$_SESSION['SESSION']=&$SESSION;
$sid='synthetic-wire-session';start_probe_codec($sid);$bytes=session_encode();session_abort();
$DB->delete_records('sessions',['sid'=>$sid]);
$target['session']=$DB->insert_record('sessions',(object)['state'=>0,'sid'=>$sid,'userid'=>$target['user'],
 'sessdata'=>base64_encode($bytes),'timecreated'=>time(),'timemodified'=>time(),'firstip'=>'','lastip'=>'']);
$DB->delete_records('course_modules_completion',['userid'=>$target['user'],'coursemoduleid'=>$target['module']]);
$pg=pg_from_config('reader');$profile=\clear_moodle_probe\collect_profile($pg,$target);pg_close($pg);
// Explicit local test protocol. Never a web route. Only fixed fixture operations are supported.
fwrite(STDOUT,json_encode(['ready'=>true])."\n");
while(($line=fgets(STDIN))!==false) {
 try {
    $input=json_decode($line,true,32,JSON_THROW_ON_ERROR);
    switch($input['op']) {
        case 'register':
            // Reset this explicitly named synthetic attempt so the regression can be rerun.
            // This owner-only fixture operation is not part of the C adapter or lookup protocol.
            $owner=pg_connect('host='.$CFG->dbhost.' dbname=moodle user=moodle password=isolatedtest',PGSQL_CONNECT_FORCE_NEW);
            pg_query_params($owner,'DELETE FROM clear_probe.confirmations WHERE attemptref=$1',[$input['request']['attemptRef']]);
            pg_query_params($owner,'DELETE FROM clear_probe.attempts WHERE attemptref=$1',[$input['request']['attemptRef']]);
            pg_close($owner);
            $result=register_probe_attempt($target,$input['request'],$input['override']??[]);break;
        case 'mint':
            $h=start_native_probe($sid);
            $result=\clear_moodle_probe\mint($h,$sid,$input['request'],$profile);
            $result['nativeClosed']=session_status()===PHP_SESSION_NONE;
            break;
        case 'confirmation': $result=\clear_moodle_probe\confirmation($input['request'],$profile);break;
        case 'observations': $result=\clear_moodle_probe\observe($input['request'],$profile);break;
        case 'completePage':
            $id=$DB->insert_record('course_modules_completion',(object)['coursemoduleid'=>$target['module'],'userid'=>$target['user'],
                'completionstate'=>1,'viewed'=>null,'overrideby'=>null,'timemodified'=>time()]);$result=['done'=>true];break;
        case 'persistRoleSwitch':
            $h=start_native_probe($sid);
            $role=$DB->get_field('role','id',['shortname'=>'student'],MUST_EXIST);
            role_switch($role,context_course::instance($target['course']));
            $h->write_close();$result=['nativeClosed'=>session_status()===PHP_SESSION_NONE];break;
        case 'revokeAttempt':
            $owner=pg_connect('host='.$CFG->dbhost.' dbname=moodle user=moodle password=isolatedtest',PGSQL_CONNECT_FORCE_NEW);
            pg_query_params($owner,"UPDATE clear_probe.attempts SET status='REVOKED' WHERE attemptref=$1",[$input['attemptRef']]);
            pg_close($owner);$result=['done'=>true];break;
        case 'count': $result=['count'=>(int)$DB->get_field_sql('SELECT count(*) FROM clear_probe.confirmations')];break;
        default: throw new RuntimeException('TEST_OPERATION');
    }
    fwrite(STDOUT,json_encode(['ok'=>true,'result'=>$result],JSON_THROW_ON_ERROR)."\n");
 } catch(Throwable $error) {
    // No exception text/SQL/sid is sent out of this test process.
    $allowed=['REQUEST','CONFIRMATION','CONFIRMATION_BINDING','ATTEMPT_BINDING','STALE_CONFIRMATION','EXPIRED','ASSUMED_IDENTITY'];
    $code=in_array($error->getMessage(),$allowed,true)?$error->getMessage():'REJECTED';
    fwrite(STDOUT,json_encode(['ok'=>false,'code'=>$code])."\n");
 }
}
