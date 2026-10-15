<?php
define('CLI_SCRIPT',true); require('/var/www/html/config.php');
if($CFG->wwwroot!=='http://127.0.0.1:18765')throw new Exception('LOCAL_ONLY');
$f=json_decode(file_get_contents('/var/moodledata/local-api-fixture.json'),true); $uid=$f['users']['one']; $courseid=$f['courseid'];
$action=$argv[1]??''; if(!in_array($action,['hide','restore','revoke','expire','access-expire','access-restore'],true))throw new Exception('LOCAL_ACTION');
if($action==='revoke') {$DB->delete_records('external_tokens',['externalserviceid'=>$f['serviceid']]);echo '{"revoked":true}';exit;}
if($action==='expire') {$DB->set_field('external_tokens','validuntil',time()-1,['token'=>$f['tokens']['two']]);echo '{"expiredTestToken":true}';exit;}
if($action==='access-expire'||$action==='access-restore') {
 $c=json_decode(get_config('local_clearapi','course_'.$courseid),true);
 if($action==='access-expire'){set_config('saved_access_'.$courseid,$c['accessUntil'],'local_clearapi');$c['accessUntil']=time()-1;}
 else {$saved=(int)get_config('local_clearapi','saved_access_'.$courseid);if($saved<=time())throw new Exception('ORIGINAL_ACCESS_EXPIRED');$c['accessUntil']=$saved;}
 set_config('course_'.$courseid,json_encode($c),'local_clearapi');echo '{"controlledReadDeadline":true}';exit;
}
$lock=\core\lock\lock_config::get_lock_factory('local_clearwatch')->get_lock('learner:'.$uid,5);
if(!$lock)throw new Exception('LOCAL_BUSY');
try { $tx=$DB->start_delegated_transaction();
 $DB->set_field('course_modules','visible',$action==='restore'?1:0,['id'=>$f['modules']['unseen']]);
 \local_clearapi\exporter::changed($uid,$courseid,'LAB_CORRECTION'); $tx->allow_commit();
 echo '{"controlledVisibilityCorrection":true}';
} catch(\Throwable $e){if(isset($tx))$tx->rollback($e);throw $e;} finally{$lock->release();}
