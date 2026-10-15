<?php
// Preserve all prior synthetic runs; cleanup is restricted to this new fixture.
define('CLI_SCRIPT',true); require('/var/www/html/config.php');
if($CFG->wwwroot!=='http://127.0.0.1:18765')throw new Exception('LOCAL_ONLY');
$marker=json_decode(file_get_contents('/lab-runtime/local-instance.json'),true);
if(($marker['name']??'')!=='clear-moodle-local-api40')throw new Exception('LOCAL_MARKER');
$path='/lab-runtime/retest1502-baseline.json'; $fixturepath='/var/moodledata/local-api-fixture.json';
$mode=$argv[1]??'';
function saved_rows($table,$conditions=[]){global $DB;return array_values($DB->get_records($table,$conditions,'id'));}
function verify_prior($baseline){
    global $DB;
    foreach($baseline['states'] as $row){
        if($DB->get_record('local_clearwatch_state',['id'=>$row->id])!=$row)throw new Exception('PRIOR_LEARNING_CHANGED');
    }
    foreach($baseline['users'] as $row){
        $u=$DB->get_record('user',['id'=>$row->id],'id,username,suspended');
        if($u!=$row||$DB->count_records('sessions',['userid'=>$row->id])!==0)throw new Exception('PRIOR_ACCOUNT_CHANGED');
    }
    foreach($baseline['services'] as $row){
        if($DB->get_record('external_services',['id'=>$row->id],'id,shortname,enabled')!=$row
            ||$DB->count_records('external_tokens',['externalserviceid'=>$row->id])!==0)throw new Exception('PRIOR_SERVICE_CHANGED');
    }
}
if($mode==='capture'){
    if(file_exists($path)||file_exists('/var/moodledata/local-api-fixture-before1502.json'))throw new Exception('BASELINE_ALREADY_CAPTURED');
    $states=saved_rows('local_clearwatch_state');
    if(count($states)!==6)throw new Exception('EXPECTED_SIX_PRESERVED_STATES');
    $users=array_values($DB->get_records_select('user',"username LIKE 'lab-one%' OR username LIKE 'lab-two%'",[],'id','id,username,suspended'));
    $services=array_values($DB->get_records_select('external_services',"shortname LIKE 'clearlocalread%'",[],'id','id,shortname,enabled'));
    foreach($users as $u)if(!$u->suspended)throw new Exception('PRIOR_USER_NOT_SUSPENDED');
    foreach($services as $s)if($s->enabled)throw new Exception('PRIOR_SERVICE_NOT_DISABLED');
    $n=0;foreach($DB->get_fieldset_select('course','shortname',"shortname LIKE 'CLEAR-LOCAL-API-COURSE%'") as $name){
        if(preg_match('/-run([0-9]+)$/',$name,$m))$n=max($n,(int)$m[1]);
    }
    $baseline=['states'=>$states,'users'=>$users,'services'=>$services,'nextRun'=>'run'.($n+1)];
    verify_prior($baseline);
    file_put_contents($path,json_encode($baseline));chmod($path,0600);
    copy($fixturepath,'/var/moodledata/local-api-fixture-before1502.json');chmod('/var/moodledata/local-api-fixture-before1502.json',0600);
    echo json_encode(['status'=>'PASS','priorRows'=>count($states),'nextRun'=>$baseline['nextRun']]);exit;
}
$baseline=json_decode(file_get_contents($path));verify_prior((array)$baseline);
if($mode==='verify'){echo json_encode(['status'=>'PASS','priorRows'=>count($baseline->states)]);exit;}
if($mode!=='cleanup')throw new Exception('RETEST_ACTION');
$f=json_decode(file_get_contents($fixturepath),true);$sid=$f['serviceid'];
if(in_array($sid,array_column($baseline->services,'id')))throw new Exception('PRIOR_SERVICE_NOT_OWNED_BY_RETEST');
$service=$DB->get_record('external_services',['id'=>$sid], '*',MUST_EXIST);
if($service->shortname!=='clearlocalread'.$baseline->nextRun)throw new Exception('RETEST_SERVICE_SCOPE');
$functions=$DB->get_fieldset_select('external_services_functions','functionname','externalserviceid = ?',[$sid]);sort($functions);
if($functions!==['local_clearapi_identity','local_clearapi_manifest','local_clearapi_page'])throw new Exception('RETEST_FUNCTION_SCOPE');
foreach($f['users'] as $label=>$uid){
    if($DB->get_field('user','username',['id'=>$uid])!=='lab-'.$label.'-'.$baseline->nextRun
        ||in_array($uid,array_column($baseline->users,'id')))throw new Exception('RETEST_USER_SCOPE');
}
$before=array_values($DB->get_records_list('local_clearwatch_state','userid',array_values($f['users']),'id'));
$DB->delete_records('external_tokens',['externalserviceid'=>$sid]);$DB->set_field('external_services','enabled',0,['id'=>$sid]);
foreach($f['users'] as $uid){$DB->set_field('user','suspended',1,['id'=>$uid]);\core\session\manager::kill_user_sessions($uid);}
$after=array_values($DB->get_records_list('local_clearwatch_state','userid',array_values($f['users']),'id'));
if($before!=$after)throw new Exception('NEW_LEARNING_CHANGED');
verify_prior((array)$baseline);
$sessions=0;foreach($f['users'] as $uid)$sessions+=$DB->count_records('sessions',['userid'=>$uid]);
$tokens=$DB->count_records('external_tokens',['externalserviceid'=>$sid]);
if($tokens!==0||$sessions!==0)throw new Exception('RETEST_CLEANUP_INCOMPLETE');
echo json_encode(['status'=>'PASS','servicesRevoked'=>1,'syntheticUsersSuspended'=>count($f['users']),
    'remainingTokens'=>$tokens,'remainingSessions'=>$sessions,'priorLearningRowsPreserved'=>count($baseline->states),
    'newLearningRowsPreserved'=>count($after),'priorAccountsAndServicesUnchanged'=>true]);
