<?php
define('CLI_SCRIPT',true);
require('/var/www/html/config.php');
require_once($CFG->dirroot.'/course/lib.php'); require_once($CFG->dirroot.'/course/modlib.php');
require_once($CFG->dirroot.'/user/lib.php'); require_once($CFG->dirroot.'/lib/enrollib.php'); require_once($CFG->libdir.'/externallib.php');
if ($CFG->wwwroot!=='http://127.0.0.1:18765') throw new Exception('ISOLATED_LOCAL_LAB_ONLY');
\core\session\manager::set_user(get_admin());
$secrets=json_decode(file_get_contents('/lab-runtime/secrets.json'),true);
$registry=json_decode(file_get_contents('/lab-runtime/registry.json'),true);
$run=$registry['runRef']??'run1'; if(!preg_match('/^run[1-9][0-9]{0,3}$/',$run))throw new Exception('LOCAL_RUN');
$shortname='CLEAR-LOCAL-API-COURSE-'.$run;
if ($DB->record_exists('course',['shortname'=>$shortname])) throw new Exception('ALREADY_CONFIGURED_NO_RESET');
set_config('enablewebservices',1); set_config('webserviceprotocols','rest'); set_config('timezone','Asia/Seoul');
$course=create_course((object)['fullname'=>'Synthetic accounts, real local playback '.$run,'shortname'=>$shortname,'category'=>1,'enablecompletion'=>1,'startdate'=>$registry['periodStart']]);
$users=[]; $tokens=[]; $usernames=[]; $enrol=enrol_get_plugin('manual'); $ei=$DB->get_record('enrol',['courseid'=>$course->id,'enrol'=>'manual']);
foreach (['one','two'] as $label) {
    $usernames[$label]='lab-'.$label.'-'.$run;
    $uid=user_create_user((object)['username'=>$usernames[$label],'mnethostid'=>$CFG->mnet_localhost_id,'password'=>$secrets['learnerPassword'],
        'firstname'=>'Synthetic','lastname'=>ucfirst($label),'email'=>$label.'@example.invalid','confirmed'=>1,'auth'=>'manual','timezone'=>'Asia/Seoul']);
    $enrol->enrol_user($ei,$uid,$DB->get_field('role','id',['shortname'=>'student'])); $users[$label]=$uid;
}
$activities=[]; $modules=[];
foreach ($registry['activityIds'] as $label) {
    $m=add_moduleinfo((object)['modulename'=>'videocheck','module'=>$DB->get_field('modules','id',['name'=>'videocheck']),
        'course'=>$course->id,'section'=>0,'visible'=>1,'name'=>'Local '.$label,'intro'=>'Synthetic local test video','introformat'=>1,
        'videosource'=>'upload','videourl'=>'','resumeplayback'=>1,'allowseek'=>1,'completioncheckpoints'=>0,'completionmode'=>'all','completionminimum'=>1,'completion'=>0],$course);
    $file=get_file_storage()->create_file_from_pathname(['contextid'=>context_module::instance($m->coursemodule)->id,'component'=>'mod_videocheck',
        'filearea'=>'video','itemid'=>0,'filepath'=>'/','filename'=>'synthetic-30s.webm','mimetype'=>'video/webm'],'/lab-runtime/constant-30s.webm');
    $policy=(object)['cmid'=>$m->coursemodule,'durationms'=>30000,'thresholdbps'=>9000,'contenthash'=>$file->get_contenthash(),
        'policyhash'=>hash('sha256',json_encode([$m->coursemodule,30000,9000,$file->get_contenthash(),'local-api-lab-v1']))];
    $DB->insert_record('local_clearwatch_policy',$policy); $modules[$label]=(int)$m->coursemodule;
    $activities[]=['activityId'=>$label,'lectureId'=>'local-'.$label,'cmid'=>(int)$m->coursemodule,'activityType'=>$label==='ot'?'OT':'VIDEO',
        'sourcePolicyHash'=>$policy->policyhash,'durationMs'=>'30000'];
}
$accounts=[];
foreach($users as $label=>$uid) $accounts[(string)$uid]=['sourceAccountRef'=>'local-account-'.$label.'-'.$run,'accountBindingId'=>'local-binding-'.$label.'-'.$run,'accountBindingVersion'=>'local-binding.1'];
$config=['sourceBinding'=>['institutionId'=>'local-lab','providerInstanceId'=>$registry['instanceRef']??'local-api40','courseId'=>'local-course-'.$run],
    'accounts'=>$accounts,'activities'=>$activities,'pageSize'=>2,'inventoryVersion'=>'local-inventory.1','activitySetHash'=>$registry['activitySetHash'],
    'periodStart'=>$registry['periodStart'],'periodEndExclusive'=>$registry['periodEndExclusive'],'accessUntil'=>time()+3600];
set_config('course_'.$course->id,json_encode($config),'local_clearapi');
$sid=$DB->insert_record('external_services',(object)['name'=>'Local lab own read only '.$run,'shortname'=>'clearlocalread'.$run,'enabled'=>1,'restrictedusers'=>1,
    'downloadfiles'=>0,'uploadfiles'=>0,'timecreated'=>time(),'requiredcapability'=>'local/clearapi:readown']);
foreach(['identity','manifest','page'] as $method) $DB->insert_record('external_services_functions',(object)['externalserviceid'=>$sid,'functionname'=>'local_clearapi_'.$method]);
foreach($users as $label=>$uid) {
    $DB->insert_record('external_services_users',(object)['externalserviceid'=>$sid,'userid'=>$uid,'timecreated'=>time(),'validuntil'=>null,'iprestriction'=>'']);
    $tokens[$label]=external_generate_token(EXTERNAL_TOKEN_PERMANENT,$sid,$uid,context_course::instance($course->id),time()+3600);
}
$fixture=['courseid'=>(int)$course->id,'users'=>$users,'usernames'=>$usernames,'modules'=>$modules,'tokens'=>$tokens,'serviceid'=>$sid,'config'=>$config];
$owned=json_decode(get_config('local_clearapi','owned_services')?:'[]',true);$owned[]=$sid;set_config('owned_services',json_encode($owned),'local_clearapi');
file_put_contents('/var/moodledata/local-api-fixture.json',json_encode($fixture)); chmod('/var/moodledata/local-api-fixture.json',0600);
require('/lab-scripts/authorize.php');
echo json_encode(['configured'=>true,'activityCount'=>count($activities),'readOnlyFunctions'=>3]);
