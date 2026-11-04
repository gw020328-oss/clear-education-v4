<?php
define('CLI_SCRIPT',true);
require '/var/www/html/config.php';
require_once $CFG->dirroot.'/course/lib.php';
require_once $CFG->dirroot.'/course/modlib.php';
require_once $CFG->dirroot.'/user/lib.php';
require __DIR__.'/install.php';
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || $SITE->shortname!=='clear'){exit(1);}
$CFG->debug=DEBUG_DEVELOPER; $CFG->debugdisplay=1;
$suffix=bin2hex(random_bytes(3));
set_config('enablecompletion',1);set_config('enableavailability',0);set_config('auth','manual');set_config('enrol_plugins_enabled','manual');
$uid=user_create_user((object)['username'=>'actual-page-student-'.$suffix,'firstname'=>'Synthetic','lastname'=>'Student','email'=>'synthetic@example.invalid','auth'=>'manual','confirmed'=>1,'mnethostid'=>$CFG->mnet_localhost_id],false,false);
$course=create_course((object)['fullname'=>'Synthetic Core Page','shortname'=>'actual-page-'.$suffix,'category'=>1,'enablecompletion'=>1,'format'=>'topics']);
$enrol=enrol_get_plugin('manual');
$instance=array_values(array_filter(enrol_get_instances($course->id,true),fn($i)=>$i->enrol==='manual'))[0];
$role=$DB->get_field('role','id',['shortname'=>'student'],MUST_EXIST);
$enrol->enrol_user($instance,$uid,$role);
\core\session\manager::set_user(get_admin());
$page=add_moduleinfo((object)['modulename'=>'page','module'=>$DB->get_field('modules','id',['name'=>'page'],MUST_EXIST),'course'=>$course->id,'section'=>0,'name'=>'Synthetic manual mark',
 'visible'=>1,'visibleoncoursepage'=>1,'completion'=>1,'completionview'=>0,'completionexpected'=>0,'groupmode'=>0,'groupingid'=>0,
 'introeditor'=>['text'=>'','format'=>FORMAT_HTML,'itemid'=>0],
 'page'=>['text'=>'Synthetic public fixture','format'=>FORMAT_HTML,'itemid'=>0],
 'content'=>'Synthetic public fixture','contentformat'=>FORMAT_HTML,'display'=>5,'printintro'=>0,'printheading'=>1],$course);
$module=$page->coursemodule;
// Force only the approved Page profile fields in this disposable fixture.
$DB->set_field('course_modules','completiongradeitemnumber',null,['id'=>$module]);
$sessionid=$DB->insert_record('sessions',(object)['state'=>0,'sid'=>'synthetic-actual-page-session','userid'=>$uid,
 'sessdata'=>base64_encode('initial-state'),'timecreated'=>time(),'timemodified'=>time(),'firstip'=>'','lastip'=>'']);
$target=['user'=>$uid,'course'=>$course->id,'module'=>$module,'session'=>$sessionid];
file_put_contents('/tmp/clear-target.json',json_encode($target));
$pg=pg_connect('host='.$CFG->dbhost.' dbname='.$CFG->dbname.' user='.$CFG->dbuser.' password='.$CFG->dbpass,PGSQL_CONNECT_FORCE_NEW);
install_clear_probe($pg,$CFG->prefix);
echo "PASS actual core Page fixture and restricted roles installed\n";
