<?php
require __DIR__.'/native_codec_fixture.php';
define('CLI_SCRIPT',true);
require '/var/www/html/config.php';
require __DIR__.'/adapter.php';
require __DIR__.'/attempt_fixture.php';
use function clear_moodle_probe\collect_profile;
use function clear_moodle_probe\mint;
use function clear_moodle_probe\observe;
use function clear_moodle_probe\pg_from_config;
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || $SITE->shortname!=='clear'){exit(1);}
function ok(bool $x,string $name):void{if(!$x){throw new RuntimeException('FAILED '.$name);}echo 'PASS '.$name."\n";}
function rejected(callable $fn,string $code,string $name):void{try{$fn();}catch(Throwable $e){ok($e->getMessage()===$code,$name);return;}throw new RuntimeException('FAILED '.$name);}
$target=json_decode(file_get_contents('/tmp/clear-target.json'),true);
\core\session\manager::set_user(get_complete_user_data('id',$target['user']));$SESSION=new stdClass();$_SESSION['SESSION']=&$SESSION;
$sid='synthetic-issue-failure';
$old=$DB->get_record('sessions',['sid'=>$sid]);if($old){$DB->delete_records('sessions',['id'=>$old->id]);}
$target['session']=$DB->insert_record('sessions',(object)['state'=>0,'sid'=>$sid,'userid'=>$target['user'],'sessdata'=>base64_encode('old'),'timecreated'=>time(),'timemodified'=>time(),'firstip'=>'','lastip'=>'']);
$pg=pg_from_config('reader');$profile=collect_profile($pg,$target);pg_close($pg);
$attempt=register_probe_attempt($target);
$handler=function()use($sid){start_probe_codec($sid);$h=new \clear_moodle_probe\guarded_database();$h->set_requires_write_lock(true);$h->read($sid);return $h;};
$count=fn()=>(int)$DB->get_field_sql('SELECT count(*) FROM clear_probe.confirmations');
$before=$count();$h=$handler();
$peer=pg_from_config('runtime');
pg_query($peer,"UPDATE {$CFG->prefix}sessions SET sessdata='YWRtaW4tY2hhbmdl' WHERE id=".$target['session']);
rejected(fn()=>mint($h,$sid,$attempt,$profile),'SESSION_CHANGED_AFTER_READ','concurrent persisted session update blocks stale issuance');
ok($count()===$before,'stale-memory failure issues zero confirmations');
$held=pg_fetch_result(pg_query($peer,'SELECT pg_try_advisory_lock('.$target['session'].')'),0,0);ok($held==='t','failed issuance releases core advisory lock');
pg_query($peer,'SELECT pg_advisory_unlock('.$target['session'].')');
// Offline fixture owner holds only the generation row to make the actual flush trigger time out.
$owner=pg_connect('host='.$CFG->dbhost.' dbname=moodle user=moodle password=isolatedtest',PGSQL_CONNECT_FORCE_NEW);
pg_query($owner,'BEGIN');pg_query($owner,'SELECT * FROM clear_probe.generations WHERE sessionid='.$target['session'].' FOR UPDATE');
$DB->execute("SET lock_timeout='150ms'");
$h=$handler();
rejected(fn()=>mint($h,$sid,$attempt,$profile),'SESSION_PERSISTENCE','actual trigger timeout blocks confirmation issuance');
pg_query($owner,'ROLLBACK');$DB->execute('SET lock_timeout=DEFAULT');
ok($count()===$before,'flush failure rolls confirmation transaction back');
$h=$handler();$confirmation=mint($h,$sid,$attempt,$profile);
$request=probe_observations_request($attempt,$confirmation);
ok(observe($request,$profile)['version']==='clear-moodle-observations.3','new explicit attempt after failed flush is observable');
$h=$handler();$USER->realuser=99;
rejected(fn()=>mint($h,$sid,$attempt,$profile),'ASSUMED_IDENTITY','assumed identity rejected before insert and lock released');
unset($USER->realuser);
$held=pg_fetch_result(pg_query($peer,'SELECT pg_try_advisory_lock('.$target['session'].')'),0,0);ok($held==='t','pre-transaction rejection releases core session lock');
pg_query($peer,'SELECT pg_advisory_unlock('.$target['session'].')');
// Mutations after successful flush must roll back both persistence and issuance.
$before=$count();$h=$handler();
rejected(fn()=>mint($h,$sid,$attempt,$profile,function(){$_SESSION['after_flush']='changed';}),
 'SESSION_MEMORY_CHANGED','post-flush native memory change blocks issuance');
unset($_SESSION['after_flush']);
ok($count()===$before,'post-flush memory change issues zero confirmations');
$context=context_course::instance($target['course']);
$roleid=$DB->get_field('role','id',['shortname'=>'student'],MUST_EXIST);
$h=$handler();
rejected(fn()=>mint($h,$sid,$attempt,$profile,function()use($roleid,$context){role_switch($roleid,$context);}),
 'ASSUMED_IDENTITY','post-flush actual role switch blocks issuance');
role_switch(0,$context);
ok($count()===$before,'post-flush role switch issues zero confirmations');
// New source and request binding checks, not prior shadow-schema results.
$bad=$request;$bad['issuerEpoch']=str_repeat('f',64);
rejected(fn()=>observe($bad,$profile),'CONFIRMATION_BINDING','actual observation issuer mismatch rejected');
$bad=$request;$bad['userId']=$target['user'];
rejected(fn()=>observe($bad,$profile),'REQUEST','actual observation rejects browser identity input');
pg_query($owner,"ALTER FUNCTION clear_probe.bump_session() SET search_path=pg_catalog,clear_probe,public,pg_temp");
rejected(fn()=>observe($request,$profile),'PROFILE_DRIFT','function definition drift blocks observation');
pg_query($owner,"ALTER FUNCTION clear_probe.bump_session() SET search_path=pg_catalog,clear_probe,pg_temp");
pg_query($owner,'ALTER TABLE '.$CFG->prefix.'sessions DISABLE TRIGGER clear_session');
rejected(fn()=>observe($request,$profile),'PROFILE_DRIFT','trigger disabled state blocks observation');
pg_query($owner,'ALTER TABLE '.$CFG->prefix.'sessions ENABLE ALWAYS TRIGGER clear_session');
foreach(['SELECT sessdata FROM '.$CFG->prefix.'sessions','SELECT password FROM '.$CFG->prefix.'user','SELECT content FROM '.$CFG->prefix.'page'] as $sql) {
 $reader=pg_from_config('reader');pg_send_query($reader,$sql);$result=pg_get_result($reader);
 ok(pg_result_error_field($result,PGSQL_DIAG_SQLSTATE)==='42501','actual reader sensitive column privilege denied');pg_close($reader);
}
pg_close($owner);pg_close($peer);
