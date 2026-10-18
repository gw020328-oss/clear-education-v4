<?php
// Fresh isolated synthetic Python bootcamp. No imported DB/config/account.
define('CLI_SCRIPT',true);require('/var/www/html/config.php');
require_once($CFG->dirroot.'/course/lib.php');require_once($CFG->dirroot.'/course/modlib.php');
require_once($CFG->dirroot.'/user/lib.php');require_once($CFG->libdir.'/externallib.php');
if($CFG->wwwroot!=='http://127.0.0.1:18768')throw new Exception('BOOTCAMP_LAB_ONLY');
\core\session\manager::set_user(get_admin());
$run=$argv[1]??'run1';if(!preg_match('/^run[1-9][0-9]{0,3}$/',$run))throw new Exception('RUN');
if($DB->record_exists('course',['shortname'=>'E6-'.$run]))throw new Exception('NO_RESET');
set_config('enablewebservices',1);set_config('webserviceprotocols','rest');set_config('enablecompletion',1);
if(file_exists('/lab-runtime/fixture.json')){$old=json_decode(file_get_contents('/lab-runtime/fixture.json'),true);foreach($old['services'] as $sid)if($DB->get_field('external_services','enabled',['id'=>$sid])||$DB->count_records('external_tokens',['externalserviceid'=>$sid]))throw new Exception('PREVIOUS_RUN_NOT_REVOKED');}
$s=json_decode(file_get_contents('/lab-runtime/secrets.json'),true);$tx=$DB->start_delegated_transaction();
$c=create_course((object)['fullname'=>'Fictional Python bootcamp P2 run1','shortname'=>'E6-'.$run,'category'=>1,'enablecompletion'=>1,'showcompletionconditions'=>1]);
$other=create_course((object)['fullname'=>'Synthetic other course','shortname'=>'E6-OTHER-'.$run,'category'=>1]);
function module($kind,$name,$extra=[]){global $DB,$c;return add_moduleinfo((object)array_merge(['modulename'=>$kind,'module'=>$DB->get_field('modules','id',['name'=>$kind]),'course'=>$c->id,'section'=>0,'visible'=>1,'name'=>$name,'intro'=>'Synthetic bootcamp fixture','introformat'=>1,'completion'=>0],$extra),$c);}
$page=module('page','Python intro activity',['content'=>'<p>Python loops introduction, synthetic.</p>','contentformat'=>1,'display'=>5,'displayoptions'=>'','completion'=>2,'completionview'=>1]);
$assign=module('assign','Python practice task',['alwaysshowdescription'=>1,'submissiondrafts'=>1,'requiresubmissionstatement'=>0,'sendnotifications'=>0,'sendstudentnotifications'=>0,'sendlatenotifications'=>0,'duedate'=>0,'allowsubmissionsfromdate'=>0,'grade'=>0,'cutoffdate'=>0,'gradingduedate'=>0,'teamsubmission'=>0,'requireallteammemberssubmit'=>0,'teamsubmissiongroupingid'=>0,'blindmarking'=>0,'attemptreopenmethod'=>'none','maxattempts'=>1,'markingworkflow'=>0,'markingallocation'=>0,'markinganonymous'=>0,'activityformat'=>0,'timelimit'=>0,'submissionattachments'=>0,'assignsubmission_onlinetext_enabled'=>1,'assignsubmission_file_enabled'=>0,'assignfeedback_comments_enabled'=>0,'assignfeedback_file_enabled'=>0]);
$forum=module('forum','Python reflections',['type'=>'general','forcesubscribe'=>0,'trackingtype'=>0,'maxbytes'=>0,'maxattachments'=>0,'assessed'=>0]);
$enrol=enrol_get_plugin('manual');$ei=$DB->get_record('enrol',['courseid'=>$c->id,'enrol'=>'manual']);$users=[];$tokens=[];$services=[];
$read=['core_webservice_get_site_info','core_course_get_contents','core_completion_get_activities_completion_status','mod_assign_get_assignments','mod_assign_get_submission_status','mod_forum_get_forums_by_courses','mod_forum_get_forum_discussions','mod_forum_get_discussion_post'];
$write=['mod_page_view_page','mod_assign_save_submission','mod_assign_submit_for_grading','mod_forum_add_discussion','mod_forum_update_discussion_post','mod_forum_delete_post'];
foreach(['one','two','outsider'] as $label){
 $uid=user_create_user((object)['username'=>'e6-'.$label.'-'.$run,'mnethostid'=>$CFG->mnet_localhost_id,'password'=>$s['learnerPassword'],'firstname'=>'Synthetic','lastname'=>$label,'email'=>$label.'@example.invalid','confirmed'=>1,'auth'=>'manual']);$users[$label]=$uid;
 if($label!=='outsider')$enrol->enrol_user($ei,$uid,$DB->get_field('role','id',['shortname'=>'student']));
 $ctx=context_system::instance();$role=$DB->insert_record('role',(object)['name'=>'E6 source REST '.$label.' '.$run,'shortname'=>'e6rest'.$label.$run,'description'=>'Synthetic transport only','sortorder'=>100+$uid,'archetype'=>'']);assign_capability('webservice/rest:use',CAP_ALLOW,$role,$ctx->id);role_assign($role,$uid,$ctx->id);
 foreach(['read','write'] as $mode){
  if($mode==='write'&&$label==='outsider')continue;
  $sid=$DB->insert_record('external_services',(object)['name'=>'E6 source '.$label.' '.$mode.' '.$run,'enabled'=>1,'restrictedusers'=>1,'downloadfiles'=>0,'uploadfiles'=>0,'timecreated'=>time()]);$services[]=$sid;
  foreach($mode==='read'?$read:array_merge($read,$write) as $fn)$DB->insert_record('external_services_functions',(object)['externalserviceid'=>$sid,'functionname'=>$fn]);
  $DB->insert_record('external_services_users',(object)['externalserviceid'=>$sid,'userid'=>$uid,'timecreated'=>time(),'validuntil'=>null]);
  $tokens[$label][$mode]=['serviceId'=>$sid,'userId'=>$uid];
 }
}
$pagecfg=$DB->get_record('course_modules',['id'=>$page->coursemodule],'id,course,module,instance,completion,completionview,completiongradeitemnumber,completionexpected',MUST_EXIST);
$f=['environmentRef'=>'e6-20261018-'.$run,'runRef'=>$run,'sourceVersion'=>'moodle-4.5.15-215f4438','courseId'=>(int)$c->id,'otherCourseId'=>(int)$other->id,
 'activity'=>['cmId'=>(int)$page->coursemodule,'instanceId'=>(int)$page->instance,'module'=>'page'],
 'assignment'=>['cmId'=>(int)$assign->coursemodule,'instanceId'=>(int)$assign->instance],
 'reflection'=>['cmId'=>(int)$forum->coursemodule,'forumId'=>(int)$forum->instance],
 'users'=>$users,'credentials'=>$tokens,'services'=>$services,'setupCompletionConfiguration'=>$pagecfg,'setupObservedAt'=>time()];
$tx->allow_commit();file_put_contents('/lab-runtime/fixture.json',json_encode($f));chmod('/lab-runtime/fixture.json',0600);echo 'BC_P2_FIXTURE_READY';
