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
function ok(bool $x,string $name):void {if(!$x){throw new RuntimeException('FAILED '.$name);} echo 'PASS '.$name."\n";}
function reject(callable $fn,string $code,string $name):void {try{$fn();}catch(Throwable $e){ok($e->getMessage()===$code,$name);return;}throw new RuntimeException('FAILED '.$name);}
function sql($db,string $sql){$r=pg_query($db,$sql);if($r===false){throw new RuntimeException('SQL');}return $r;}
function blocked($db,string $sql,string $name):void {
 pg_send_query($db,$sql);$r=pg_get_result($db);$state=pg_result_error_field($r,PGSQL_DIAG_SQLSTATE);while(pg_get_result($db)!==false){}
 ok($state==='55P03',$name);
}
$target=json_decode(file_get_contents('/tmp/clear-target.json'),true);
\core\session\manager::set_user(get_complete_user_data('id',$target['user']));
$SESSION=new stdClass();$_SESSION['SESSION']=&$SESSION;
// Reset only these owned synthetic fixture rows for this candidate's regression.
$DB->delete_records('sessions',['sid'=>'synthetic-actual-page-session']);
$target['session']=$DB->insert_record('sessions',(object)['state'=>0,'sid'=>'synthetic-actual-page-session','userid'=>$target['user'],
 'sessdata'=>base64_encode('initial'),'timecreated'=>time(),'timemodified'=>time(),'firstip'=>'','lastip'=>'']);
$DB->delete_records('course_modules_completion',['userid'=>$target['user'],'coursemoduleid'=>$target['module']]);

$reader=pg_from_config('reader');
$profile=collect_profile($reader,$target);pg_close($reader);
$sid='synthetic-actual-page-session';
$attempt=null;
$makehandler=function()use($sid){start_probe_codec($sid);$h=new \clear_moodle_probe\guarded_database();$h->set_requires_write_lock(true);$h->read($sid);return $h;};
$issue=function($barrier=null)use($makehandler,$sid,$profile,$target,&$attempt){$attempt=register_probe_attempt($target);return mint($makehandler(),$sid,$attempt,$profile,$barrier);};
$request=function($confirmation)use(&$attempt){return probe_observations_request($attempt,$confirmation);};
$confirmation=$issue();
$r=$request($confirmation);$dto=observe($r,$profile);
ok($dto['requestRef']===$r['requestRef'] && $dto['observations'][0]['status']==='INCOMPLETE','actual core tables issue and empty manual completion observation');
$peer=pg_from_config('runtime');sql($peer,"SET lock_timeout='150ms'");
$confirmation=$issue(function()use($peer,$target,$CFG){
 $held=pg_fetch_result(sql($peer,'SELECT pg_try_advisory_lock('.$target['session'].')'),0,0);
 ok($held==='f','Moodle session advisory lock held throughout issue');
 blocked($peer,'UPDATE '.$CFG->prefix.'sessions SET timemodified=timemodified+1 WHERE id='.$target['session'],'same session concurrent write fenced');
 blocked($peer,'UPDATE '.$CFG->prefix.'user_enrolments SET status=1 WHERE userid='.$target['user'],'authority mutation fenced during issuance');
});
ok(observe($request($confirmation),$profile)['observations'][0]['status']==='INCOMPLETE','blocked writers leave usable confirmation');
// Manual core table update is fixture manipulation, not a real learner action.
$id=$DB->insert_record('course_modules_completion',(object)['coursemoduleid'=>$target['module'],'userid'=>$target['user'],'completionstate'=>0,'viewed'=>null,'overrideby'=>null,'timemodified'=>time()]);
$dto=observe($request($confirmation),$profile,function()use($peer,$CFG,$id){sql($peer,'UPDATE '.$CFG->prefix.'course_modules_completion SET completionstate=1 WHERE id='.$id);});
ok($dto['observations'][0]['status']==='INCOMPLETE','new repeatable snapshot keeps original completion across concurrent update');
ok(observe($request($confirmation),$profile)['observations'][0]['status']==='COMPLETE','next request acquires new snapshot and sees completion one');
$DB->set_field('course_modules_completion','completionstate',2,['id'=>$id]);
reject(fn()=>observe($request($confirmation),$profile),'COMPLETION_STATE','actual core grade-state completion rejected');
$DB->set_field('course_modules_completion','completionstate',1,['id'=>$id]);
$DB->set_field('user_enrolments','status',1,['userid'=>$target['user']]);
$DB->set_field('user_enrolments','status',0,['userid'=>$target['user']]);
reject(fn()=>observe($request($confirmation),$profile),'STALE_CONFIRMATION','suspend restore cannot revive actual confirmation');
$confirmation=$issue();
set_user_preference('auth_forcepasswordchange',1,$target['user']);
reject(fn()=>$issue(),'SOURCE_UNAVAILABLE','force password change blocks issuance');
unset_user_preference('auth_forcepasswordchange',$target['user']);
$confirmation=$issue();
$context=context_course::instance($target['course']);
$roleid=$DB->get_field('role','id',['shortname'=>'student'],MUST_EXIST);
role_switch($roleid,$context);
reject(fn()=>$issue(),'ASSUMED_IDENTITY','actual role switch blocks new issuance');
$h=$makehandler();$h->write($sid,session_encode());$h->close();
reject(fn()=>observe($request($confirmation),$profile),'STALE_CONFIRMATION','same session persisted role switch invalidates earlier confirmation');
role_switch(0,$context);
$confirmation=$issue();
$h=new \core\session\database();$h->destroy($sid);
reject(fn()=>observe($request($confirmation),$profile),'SOURCE_UNAVAILABLE','core database session destruction blocks observation');
pg_close($peer);
echo "SYNTHETIC_ACTUAL_MOODLE_INTEGRATION_ONLY\n";
