<?php
define('CLI_SCRIPT',true);require('/var/www/html/config.php');
if($CFG->wwwroot!=='http://127.0.0.1:18766')throw new Exception('REVIEW_LAB_ONLY');
$f=json_decode(file_get_contents('/lab-runtime/fixture.json'),true);
// Include this isolated lab's earlier completed/partial setup runs; preserve course/posts.
$services=[];foreach($DB->get_records('external_services') as $service){
 if(preg_match('/^Review (writer|reader|outsider)( run[1-9][0-9]{0,3})?$/',$service->name))$services[]=$service->id;
}
$users=[];foreach($DB->get_records('user',['auth'=>'manual']) as $u){
 if(preg_match('/^review-(writer|reader|outsider)(-run[1-9][0-9]{0,3})?$/',$u->username,$m)&&$u->email===$m[1].'@example.invalid')$users[]=$u->id;
}
foreach($services as $sid){$DB->delete_records('external_tokens',['externalserviceid'=>$sid]);$DB->set_field('external_services','enabled',0,['id'=>$sid]);}
foreach($users as $uid){$DB->set_field('user','suspended',1,['id'=>$uid]);\core\session\manager::kill_user_sessions($uid);}
$n=0;foreach($services as $sid)$n+=$DB->count_records('external_tokens',['externalserviceid'=>$sid]);
echo json_encode(['tokensRemaining'=>$n,'servicesDisabled'=>count($services),'syntheticUsersSuspended'=>count($users)]);
