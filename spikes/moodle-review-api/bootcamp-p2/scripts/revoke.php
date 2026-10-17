<?php
define('CLI_SCRIPT',true);require('/var/www/html/config.php');
if($CFG->wwwroot!=='http://127.0.0.1:18767')throw new Exception('BOOTCAMP_LAB_ONLY');
$f=json_decode(file_get_contents('/lab-runtime/fixture.json'),true);
foreach($f['services'] as $sid){$DB->delete_records('external_tokens',['externalserviceid'=>$sid]);$DB->set_field('external_services','enabled',0,['id'=>$sid]);}
foreach($f['users'] as $uid){$DB->set_field('user','suspended',1,['id'=>$uid]);\core\session\manager::kill_user_sessions($uid);}
$n=0;foreach($f['services'] as $sid)$n+=$DB->count_records('external_tokens',['externalserviceid'=>$sid]);
echo json_encode(['environmentRef'=>$f['environmentRef'],'tokensRemaining'=>$n,'servicesDisabled'=>count($f['services']),'syntheticUsersSuspended'=>count($f['users'])]);
