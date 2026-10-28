<?php
// Only this live owned fixture. No reset/volume cleanup/other-environment access.
define('CLI_SCRIPT',true);require('/var/www/html/config.php');require_once($CFG->dirroot.'/course/lib.php');
if($CFG->wwwroot!=='http://127.0.0.1:18768')throw new Exception('E6_LAB_ONLY');
$f=json_decode(file_get_contents('/lab-runtime/fixture.json'),true);$r=json_decode(stream_get_contents(STDIN),true);$action=$r['action']??'';
if($action==='hide'||$action==='show')set_coursemodule_visible($f['reflection']['cmId'],$action==='show');
else if($action==='manual'||$action==='automatic'){$DB->set_field('course_modules','completion',$action==='manual'?1:2,['id'=>$f['activity']['cmId']]);rebuild_course_cache($f['courseId'],true);}
else if($action==='disable-read'||$action==='enable-read'){$sid=$f['credentials']['one']['read']['serviceId'];$DB->set_field('external_services','enabled',$action==='enable-read'?1:0,['id'=>$sid]);if($action==='disable-read')$DB->delete_records('external_tokens',['externalserviceid'=>$sid]);}
else throw new Exception('ACTION');
echo '{"ownedMutation":true}';
