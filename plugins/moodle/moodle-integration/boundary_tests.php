<?php
require __DIR__.'/native_codec_fixture.php';
define('CLI_SCRIPT',true);
require '/var/www/html/config.php';
require __DIR__.'/adapter.php';
require __DIR__.'/attempt_fixture.php';
require __DIR__.'/native_handler_fixture.php';
use function clear_moodle_probe\mint;
use function clear_moodle_probe\observe;
use function clear_moodle_probe\pg_from_config;
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || $SITE->shortname!=='clear'){exit(1);}
function ok(bool $ok,string $name):void{if(!$ok){throw new RuntimeException('FAILED '.$name);}echo "PASS $name\n";}
function rejects(callable $fn,string $code,string $name):void {
    try{$fn();}catch(Throwable $e){ok($e->getMessage()===$code,$name);return;}throw new RuntimeException('FAILED '.$name);
}
$target=json_decode(file_get_contents('/tmp/clear-target.json'),true);
\core\session\manager::set_user(get_complete_user_data('id',$target['user']));
$SESSION=new stdClass();$_SESSION['SESSION']=&$SESSION;
$sid='synthetic-boundary-session';start_probe_codec($sid);$bytes=session_encode();session_abort();
$DB->delete_records('sessions',['sid'=>$sid]);
$target['session']=$DB->insert_record('sessions',(object)['state'=>0,'sid'=>$sid,'userid'=>$target['user'],
 'sessdata'=>base64_encode($bytes),'timecreated'=>time(),'timemodified'=>time(),'firstip'=>'','lastip'=>'']);
$pg=pg_from_config('reader');$profile=\clear_moodle_probe\collect_profile($pg,$target);pg_close($pg);
$attempt=register_probe_attempt($target);
$before=(int)$DB->get_field_sql('SELECT count(*) FROM clear_probe.confirmations');
$h=start_native_probe($sid);$outer=$DB->start_delegated_transaction();
rejects(fn()=>mint($h,$sid,$attempt,$profile),'OUTER_TRANSACTION','outer delegated transaction cannot return an uncommitted confirmation');
$outer->allow_commit();
ok((int)$DB->get_field_sql('SELECT count(*) FROM clear_probe.confirmations')===$before,'outer transaction rejection issues zero confirmations');
$h=start_native_probe($sid);
unset($_SESSION['USER']);$_SESSION['USER']=clone $USER;
rejects(fn()=>mint($h,$sid,$attempt,$profile),'NATIVE_IDENTITY_LINK','detached native USER object blocks issuance');
$h=start_native_probe($sid);
rejects(fn()=>mint($h,$sid,$attempt,$profile,function(){global $USER;unset($_SESSION['USER']);$_SESSION['USER']=clone $USER;}),
 'NATIVE_IDENTITY_LINK','post-flush native USER detachment blocks issuance');
$h=start_native_probe($sid);$receipt=mint($h,$sid,$attempt,$profile);
ok(session_status()===PHP_SESSION_NONE,'native abort closes actual core-derived handler');
$generation=$DB->get_field_sql('SELECT generation FROM clear_probe.generations WHERE sessionid=?',[$target['session']]);
$SESSION->after_abort='memory-only';session_write_close();
ok($DB->get_field_sql('SELECT generation FROM clear_probe.generations WHERE sessionid=?',[$target['session']])===$generation,
 'closed native session does not persist later PHP memory changes');
ok($SESSION->after_abort==='memory-only','abort does not freeze PHP globals and is not a terminal HTTP action');
// Core empty() treats the string zero as missing; SQL must not merely compare with empty string.
$DB->set_field('user','firstname','0',['id'=>$target['user']]);
$user=get_complete_user_data('id',$target['user']);unset($SESSION->fullysetupstrict);
ok(user_not_fully_set_up($user,false),'actual core rejects string-zero required profile field');
$pg=pg_from_config('reader');
rejects(fn()=>\clear_moodle_probe\row($pg,$profile,$target['session'],time()),'SOURCE_UNAVAILABLE','Page projection rejects the same string-zero profile counterexample');
pg_close($pg);$DB->set_field('user','firstname','Synthetic',['id'=>$target['user']]);
$attempt=register_probe_attempt($target);$h=start_native_probe($sid);$receipt=mint($h,$sid,$attempt,$profile);
$request=probe_observations_request($attempt,$receipt);
$owner=pg_connect('host='.$CFG->dbhost.' dbname=moodle user=moodle password=isolatedtest',PGSQL_CONNECT_FORCE_NEW);
pg_query_params($owner,'UPDATE clear_probe.confirmations SET confirmedat=$1 WHERE ref=$2',[time()+20,$receipt['confirmationRef']]);
rejects(fn()=>observe($request,$profile),'EXPIRED','lookup rejects a clock before original confirmedAt');
pg_close($owner);
