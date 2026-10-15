<?php
// Revoke only services/accounts created by this isolated lab; keep learning rows.
define('CLI_SCRIPT',true);require('/var/www/html/config.php');
if($CFG->wwwroot!=='http://127.0.0.1:18765'||!is_file('/lab-runtime/local-instance.json'))throw new Exception('LOCAL_ONLY');
$marker=json_decode(file_get_contents('/lab-runtime/local-instance.json'),true);
if(($marker['name']??'')!=='clear-moodle-local-api40')throw new Exception('LOCAL_MARKER');
$expected=['local_clearapi_identity','local_clearapi_manifest','local_clearapi_page'];sort($expected);
$services=[];$users=[];
foreach($DB->get_records('external_services') as $service){
 if(!preg_match('/^clearlocalread(?:run[1-9][0-9]{0,3})?$/',$service->shortname))continue;
 $functions=array_values($DB->get_fieldset_select('external_services_functions','functionname','externalserviceid = ?',[$service->id]));sort($functions);
 if($functions!==$expected)throw new Exception('UNEXPECTED_LAB_SERVICE');
 foreach($DB->get_records('external_services_users',['externalserviceid'=>$service->id]) as $member){
  $u=$DB->get_record('user',['id'=>$member->userid],'id,username',MUST_EXIST);
  if(!preg_match('/^lab-(?:one|two)(?:-run[1-9][0-9]{0,3})?$/',$u->username))throw new Exception('UNEXPECTED_LAB_USER');
  $users[$u->id]=$u->id;
 }
 $services[]=$service->id;
}
$before=$DB->get_records_list('local_clearwatch_state','userid',array_values($users),'id');
foreach($services as $sid){$DB->delete_records('external_tokens',['externalserviceid'=>$sid]);$DB->set_field('external_services','enabled',0,['id'=>$sid]);}
foreach($users as $uid){$DB->set_field('user','suspended',1,['id'=>$uid]);\core\session\manager::kill_user_sessions($uid);}
$remaining=0;foreach($services as $sid)$remaining+=$DB->count_records('external_tokens',['externalserviceid'=>$sid]);
$after=$DB->get_records_list('local_clearwatch_state','userid',array_values($users),'id');
$preserved=serialize($before)===serialize($after);
echo json_encode(['status'=>$remaining===0&&$preserved?'PASS':'FAIL','servicesRevoked'=>count($services),'syntheticUsersSuspended'=>count($users),'remainingTokens'=>$remaining,'learningStateRows'=>count($after),'learningRecordsPreserved'=>$preserved]);
