<?php
define('CLI_SCRIPT',true);require('/var/www/html/config.php');require_once($CFG->dirroot.'/course/lib.php');
if($CFG->wwwroot!=='http://127.0.0.1:18766')throw new Exception('REVIEW_LAB_ONLY');
$f=json_decode(file_get_contents('/lab-runtime/fixture.json'),true);
if(!in_array($argv[1]??'', ['hide','show'],true))throw new Exception('MODE');
set_coursemodule_visible($f['cmId'],$argv[1]==='show');
echo 'REVIEW_VISIBILITY_CHANGED';
