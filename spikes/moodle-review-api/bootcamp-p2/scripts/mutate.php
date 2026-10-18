<?php
// Only known newly-created fixture targets. Not a public mutation endpoint.
define('CLI_SCRIPT',true);require('/var/www/html/config.php');require_once($CFG->dirroot.'/course/lib.php');
if($CFG->wwwroot!=='http://127.0.0.1:18767')throw new Exception('BOOTCAMP_LAB_ONLY');
$f=json_decode(file_get_contents('/lab-runtime/fixture.json'),true);$mode=$argv[1]??'';
if($mode==='hide-reflection'||$mode==='show-reflection')set_coursemodule_visible($f['reflection']['cmId'],$mode==='show-reflection');
else if($mode==='manual-activity'||$mode==='automatic-activity'){
 $DB->set_field('course_modules','completion',$mode==='manual-activity'?1:2,['id'=>$f['activity']['cmId']]);rebuild_course_cache($f['courseId'],true);
}else if($mode==='delete-assignment'){
 course_delete_module($f['assignment']['cmId']);
}else throw new Exception('UNKNOWN_MODE');
echo 'BC_P2_MUTATION_DONE';
