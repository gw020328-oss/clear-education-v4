<?php
require __DIR__.'/native_codec_fixture.php';
define('CLI_SCRIPT',true);
require '/var/www/html/config.php';
require __DIR__.'/adapter.php';
require __DIR__.'/attempt_fixture.php';
require __DIR__.'/native_handler_fixture.php';
use function clear_moodle_probe\pg_from_config;
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || $SITE->shortname!=='clear'){exit(1);}
function ok(bool $x,string $name):void{if(!$x){throw new RuntimeException('FAILED '.$name);}echo "PASS $name\n";}
function state($pg,string $sql):string {
 pg_send_query($pg,$sql);$r=pg_get_result($pg);$state=pg_result_error_field($r,PGSQL_DIAG_SQLSTATE)?:'00000';
 while(pg_get_result($pg)!==false){}return $state;
}
$target=json_decode(file_get_contents('/tmp/clear-target.json'),true);
\core\session\manager::set_user(get_complete_user_data('id',$target['user']));
$SESSION=new stdClass();$_SESSION['SESSION']=&$SESSION;
$sid='synthetic-mutation-session';start_probe_codec($sid);$bytes=session_encode();session_abort();
$DB->delete_records('sessions',['sid'=>$sid]);
$target['session']=$DB->insert_record('sessions',(object)['state'=>0,'sid'=>$sid,'userid'=>$target['user'],
 'sessdata'=>base64_encode($bytes),'timecreated'=>time(),'timemodified'=>time(),'firstip'=>'','lastip'=>'']);
$pg=pg_from_config('reader');$profile=\clear_moodle_probe\collect_profile($pg,$target);pg_close($pg);
$attempt=register_probe_attempt($target);
$peer=pg_from_config('runtime');pg_query($peer,"SET lock_timeout='40ms'");
$owner=pg_connect('host='.$CFG->dbhost.' dbname=moodle user=moodle password=isolatedtest',PGSQL_CONNECT_FORCE_NEW);
pg_query($owner,"SET lock_timeout='40ms'");pg_query($owner,"SET client_min_messages=warning");
$tables=['user','user_preferences','user_info_field','user_info_data','enrol','user_enrolments',
 'role','role_assignments','role_capabilities','capabilities','context','config','config_plugins',
 'course','course_categories','course_sections','course_modules','modules','page'];
foreach(['INSERT INTO clear_probe.attempts SELECT * FROM clear_probe.attempts WHERE false',
 'UPDATE clear_probe.attempts SET status=status WHERE false','DELETE FROM clear_probe.attempts WHERE false',
 'TRUNCATE clear_probe.attempts','UPDATE clear_probe.confirmations SET expiry=expiry WHERE false'] as $sql) {
 ok(state($peer,$sql)==='42501','runtime cannot rewrite trusted attempt or confirmation registry');
}
$h=start_native_probe($sid);
$receipt=\clear_moodle_probe\mint($h,$sid,$attempt,$profile,function()use($tables,$CFG,$peer,$owner,$target){
 foreach($tables as $name) {
    $table='public.'.$CFG->prefix.$name;
    foreach(['INSERT'=>"INSERT INTO $table SELECT * FROM $table WHERE false",'UPDATE'=>"UPDATE $table SET id=id WHERE false",'DELETE'=>"DELETE FROM $table WHERE false"] as $op=>$sql) {
        ok(state($peer,$sql)==='55P03',"authority lock fences $name $op statement path");
    }
    ok(state($peer,"TRUNCATE $table")==='42501',"runtime cannot truncate $name");
 }
 foreach(['INSERT'=>"INSERT INTO clear_probe.attempts SELECT * FROM clear_probe.attempts WHERE false",
  'UPDATE'=>"UPDATE clear_probe.attempts SET status=status WHERE false",'DELETE'=>"DELETE FROM clear_probe.attempts WHERE false"] as $op=>$sql) {
    ok(state($owner,$sql)==='55P03',"authority lock fences trusted attempt $op");
 }
 ok(state($peer,'UPDATE '.$CFG->prefix.'sessions SET timemodified=timemodified WHERE id='.$target['session'])==='55P03','session row lock fences current UPDATE');
 ok(state($peer,'DELETE FROM '.$CFG->prefix.'sessions WHERE id='.$target['session'])==='55P03','session row lock fences current DELETE');
 ok(state($peer,'TRUNCATE '.$CFG->prefix.'sessions')==='42501','runtime cannot truncate sessions');
 $sql="INSERT INTO {$CFG->prefix}sessions(state,sid,userid,sessdata,timecreated,timemodified,firstip,lastip) VALUES(0,'synthetic-unrelated',0,'',1,1,'','')";
 ok(state($peer,$sql)==='00000' && state($peer,"UPDATE {$CFG->prefix}sessions SET sessdata='eA==' WHERE sid='synthetic-unrelated'")==='00000'
  && state($peer,"DELETE FROM {$CFG->prefix}sessions WHERE sid='synthetic-unrelated'")==='00000','unrelated session mutations remain independent');
});
ok(\clear_moodle_probe\observe(probe_observations_request($attempt,$receipt),$profile)['version']==='clear-moodle-observations.3','blocked source mutations and unrelated sessions leave issued confirmation usable');
// Maintenance-only TRUNCATE invokes the authority trigger; rollback preserves every fixture table.
foreach([...array_map(fn($n)=>'public.'.$CFG->prefix.$n,$tables),'clear_probe.attempts','public.'.$CFG->prefix.'sessions'] as $table) {
 pg_query($owner,'BEGIN');$before=(int)pg_fetch_result(pg_query($owner,'SELECT revision FROM clear_probe.authority'),0,0);
 $r=pg_query($owner,"TRUNCATE $table" . ($table==='clear_probe.attempts'?' CASCADE':''));
 $after=(int)pg_fetch_result(pg_query($owner,'SELECT revision FROM clear_probe.authority'),0,0);
 pg_query($owner,'ROLLBACK');ok($r!==false && $after>$before,"maintenance truncate advances authority for $table before rollback");
}
pg_close($owner);pg_close($peer);
