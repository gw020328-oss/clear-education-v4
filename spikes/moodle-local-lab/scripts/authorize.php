<?php
// Can also resume authorization on this new laboratory only. Never grants token
// creation or global REST permission, and never changes other service/users.
if (!defined('CLI_SCRIPT')) { define('CLI_SCRIPT',true); require('/var/www/html/config.php'); }
if($CFG->wwwroot!=='http://127.0.0.1:18765')throw new Exception('LOCAL_ONLY');
$fixture=json_decode(file_get_contents('/var/moodledata/local-api-fixture.json'),true);
$ctx=context_course::instance($fixture['courseid']);
$roleid=$DB->get_field('role','id',['shortname'=>'clearlocalread']);
if(!$roleid)$roleid=create_role('Isolated local REST read','clearlocalread','Read protocol for two synthetic accounts in one lab course');
assign_capability('webservice/rest:use',CAP_ALLOW,$roleid,$ctx->id);
foreach($fixture['users'] as $uid)role_assign($roleid,$uid,$ctx->id);
$DB->set_field('external_services','requiredcapability','local/clearapi:readown',['id'=>$fixture['serviceid']]);
// This pinned core version selects restricted-user functions only for NULL or
// past su.validuntil. Keep NULL and enforce an explicit plugin access deadline
// plus the independent, actual token expiry; do not make the service unrestricted.
$DB->set_field('external_services_users','validuntil',null,['externalserviceid'=>$fixture['serviceid']]);
$c=json_decode(get_config('local_clearapi','course_'.$fixture['courseid']),true);
if(!isset($c['accessUntil']))$c['accessUntil']=time()+3600;
set_config('course_'.$fixture['courseid'],json_encode($c),'local_clearapi');
foreach($fixture['users'] as $uid) {
    $lock=\core\lock\lock_config::get_lock_factory('local_clearwatch')->get_lock('learner:'.$uid,5);
    if(!$lock)throw new Exception('LOCAL_BUSY');
    try{$tx=$DB->start_delegated_transaction();\local_clearapi\exporter::changed($uid,$fixture['courseid'],'BINDING_CONFIG');$tx->allow_commit();}
    catch(\Throwable $e){if(isset($tx))$tx->rollback($e);throw $e;}finally{$lock->release();}
}
