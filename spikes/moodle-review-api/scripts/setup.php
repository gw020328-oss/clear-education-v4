<?php
// New isolated synthetic forum only; no old course/account/credential is read.
define('CLI_SCRIPT',true);
require('/var/www/html/config.php');
require_once($CFG->dirroot.'/course/lib.php');
require_once($CFG->dirroot.'/course/modlib.php');
require_once($CFG->dirroot.'/user/lib.php');
require_once($CFG->libdir.'/externallib.php');
if($CFG->wwwroot!=='http://127.0.0.1:18766')throw new Exception('REVIEW_LAB_ONLY');
\core\session\manager::set_user(get_admin());
$run=$argv[1]??'run1';if(!preg_match('/^run[1-9][0-9]{0,3}$/',$run))throw new Exception('RUN');
if($DB->record_exists('course',['shortname'=>'CLEAR-REVIEW-'.$run]))throw new Exception('NO_RESET');
set_config('enablewebservices',1);set_config('webserviceprotocols','rest');
if(file_exists('/lab-runtime/fixture.json')){ $old=json_decode(file_get_contents('/lab-runtime/fixture.json'),true);foreach($old['services'] as $sid)if($DB->get_field('external_services','enabled',['id'=>$sid])||$DB->count_records('external_tokens',['externalserviceid'=>$sid]))throw new Exception('PREVIOUS_RUN_NOT_CLEANED');}
$s=json_decode(file_get_contents('/lab-runtime/secrets.json'),true);
$transaction=$DB->start_delegated_transaction();
$c=create_course((object)['fullname'=>'Synthetic general course review','shortname'=>'CLEAR-REVIEW-'.$run,'category'=>1]);
$other=create_course((object)['fullname'=>'Synthetic other course','shortname'=>'CLEAR-OTHER-'.$run,'category'=>1]);
$enrol=enrol_get_plugin('manual');$ei=$DB->get_record('enrol',['courseid'=>$c->id,'enrol'=>'manual']);
$m=add_moduleinfo((object)['modulename'=>'forum','module'=>$DB->get_field('modules','id',['name'=>'forum']),'course'=>$c->id,
 'section'=>0,'visible'=>1,'name'=>'General course reviews','intro'=>'Synthetic lab','introformat'=>1,'type'=>'general',
 'forcesubscribe'=>0,'trackingtype'=>0,'maxbytes'=>0,'maxattachments'=>0,'assessed'=>0,'completion'=>0],$c);
$users=[];$tokens=[];$services=[];
foreach(['writer','reader','outsider'] as $label){
 $uid=user_create_user((object)['username'=>'review-'.$label.'-'.$run,'mnethostid'=>$CFG->mnet_localhost_id,'password'=>$s['learnerPassword'],
 'firstname'=>'Synthetic','lastname'=>$label,'email'=>$label.'@example.invalid','confirmed'=>1,'auth'=>'manual']);$users[$label]=$uid;
 if($label!=='outsider')$enrol->enrol_user($ei,$uid,$DB->get_field('role','id',['shortname'=>'student']));
 $sid=$DB->insert_record('external_services',(object)['name'=>'Review '.$label.' '.$run,'enabled'=>1,'restrictedusers'=>1,'downloadfiles'=>0,'uploadfiles'=>0,'timecreated'=>time()]);
 $services[]=$sid;
 $functions=['core_webservice_get_site_info','mod_forum_get_forums_by_courses','mod_forum_get_discussion_post','mod_forum_get_discussion_posts','mod_forum_get_forum_discussions'];
 if($label==='writer')$functions=array_merge($functions,['mod_forum_add_discussion','mod_forum_update_discussion_post','mod_forum_delete_post']);
 foreach($functions as $f)$DB->insert_record('external_services_functions',(object)['externalserviceid'=>$sid,'functionname'=>$f]);
 $DB->insert_record('external_services_users',(object)['externalserviceid'=>$sid,'userid'=>$uid,'timecreated'=>time(),'validuntil'=>null]);
 $ctx=context_system::instance();$role=$DB->insert_record('role',(object)['name'=>'REST only '.$label,'shortname'=>'reviewrest'.$label.$run,'description'=>'Synthetic REST transport only','sortorder'=>100+$uid,'archetype'=>'']);
 assign_capability('webservice/rest:use',CAP_ALLOW,$role,$ctx->id);role_assign($role,$uid,$ctx->id);
 $tokens[$label]=external_generate_token(EXTERNAL_TOKEN_PERMANENT,$sid,$uid,$ctx,time()+3600);
}
$f=['courseId'=>(int)$c->id,'otherCourseId'=>(int)$other->id,'forumId'=>(int)$m->instance,'cmId'=>(int)$m->coursemodule,'users'=>$users,'tokens'=>$tokens,'services'=>$services];
$transaction->allow_commit();
file_put_contents('/lab-runtime/fixture.json',json_encode($f));chmod('/lab-runtime/fixture.json',0600);
echo 'REVIEW_FIXTURE_READY';
