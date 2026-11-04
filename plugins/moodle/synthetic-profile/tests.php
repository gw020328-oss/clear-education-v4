<?php
require __DIR__ . '/reader.php';
use function clear_synthetic\require_rule;
use function clear_synthetic\read_page;
function db(string $who) { return pg_connect('host=clear-profile-db dbname=clear_profile user=clear_' . $who . ' password=synthetic-' . $who, PGSQL_CONNECT_FORCE_NEW); }
function run($db, string $sql) { $r = pg_query($db, $sql); require_rule($r !== false, 'SQL_FAILED'); return $r; }
function ok(bool $value, string $name) { require_rule($value, 'FAILED ' . $name); echo 'PASS ' . $name . "\n"; }
function denied($db, string $sql, string $name) {
    pg_send_query($db, $sql); $r = pg_get_result($db);
    ok(pg_result_error_field($r, PGSQL_DIAG_SQLSTATE) === '42501', $name);
    while (pg_get_result($db) !== false) {}
}
$r = db('runtime'); $reader = db('reader');
run($r, 'DELETE FROM clear_source.completion; DELETE FROM clear_source.page_gate; DELETE FROM clear_source.course_gate; DELETE FROM clear_source.enrolments; DELETE FROM clear_source.sessions; DELETE FROM clear_source.users; DELETE FROM clear_source.profile');
run($r, "INSERT INTO clear_source.profile VALUES(1,'" . str_repeat('a',64) . "','" . str_repeat('b',64) . "');
 INSERT INTO clear_source.users VALUES(7,'manual',false,false,false,false,false,true);
 INSERT INTO clear_source.sessions VALUES(1,7,90,100,'synthetic-bytes');
 INSERT INTO clear_source.enrolments VALUES(1,7,2,'manual',true,0,0);
 INSERT INTO clear_source.course_gate VALUES(2,'" . str_repeat('c',64) . "',true,true,true);
 INSERT INTO clear_source.page_gate VALUES(3,2,4,true,true,false,'',0,0,false,1,'page');");
$get = fn($sql) => (int)pg_fetch_result(run($r,$sql),0,0);
$rev = $get('SELECT revision FROM clear_guard.authority');
run($r, 'UPDATE clear_source.enrolments SET active=false; UPDATE clear_source.enrolments SET active=true');
ok($get('SELECT revision FROM clear_guard.authority') === $rev+2, 'nonowner definer epoch changes on suspend restore');
$rev = $get('SELECT revision FROM clear_guard.authority');
run($r, 'BEGIN; UPDATE clear_source.users SET suspended=true; ROLLBACK');
ok($get('SELECT revision FROM clear_guard.authority') === $rev, 'runtime rollback also rolls epoch back');
$sessionbase = $get('SELECT generation FROM clear_guard.session_generations WHERE session_id=1');
run($r, "UPDATE clear_source.sessions SET sessdata='changed'");
ok($get('SELECT generation FROM clear_guard.session_generations') === $sessionbase+1 && $get('SELECT revision FROM clear_guard.authority') === $rev,
 'session update changes only per-session generation');
foreach ([
 ['UPDATE clear_guard.authority SET revision=1','epoch direct update denied'],
 ['ALTER TABLE clear_source.sessions DISABLE TRIGGER session_generation','trigger disable denied'],
 ['SET ROLE clear_owner','owner role switch denied'],
 ["SET session_replication_role='replica'",'replication bypass denied'],
 ['CREATE TEMP TABLE authority(id integer)','temporary shadow denied'],
 ['CREATE TABLE public.authority(id integer)','public shadow denied'],
 ['TRUNCATE clear_source.sessions','runtime truncate denied'],
 ['SELECT clear_guard.bump_authority()','direct definer invocation denied'],
] as [$sql,$name]) { denied($r,$sql,$name); }
denied($reader, 'SELECT sessdata FROM clear_source.sessions', 'reader session bytes denied');
denied($reader, 'UPDATE clear_source.completion SET completionstate=1', 'reader writes denied');
$binding = ['mode'=>'SYNTHETIC_ONLY','sessionId'=>1,'userId'=>7,'sessionCreatedAt'=>90,'courseId'=>2,'moduleId'=>3,
 'authorityRevision'=>$rev,'sessionGeneration'=>$sessionbase+1,'aclHash'=>str_repeat('c',64),'profileHash'=>str_repeat('a',64),
 'installationEpoch'=>str_repeat('b',64),'expiresAtExclusive'=>150,'idleSeconds'=>60,
 'issuerEpoch'=>str_repeat('d',64),'bindingScopeHash'=>str_repeat('e',64),'confirmationRef'=>str_repeat('f',64),
 'installationRef'=>'synthetic-install','courseRef'=>'synthetic-course','subjectRef'=>'synthetic-subject',
 'audience'=>'synthetic-clear','trustEpoch'=>1,'rosterRevision'=>1,'targetRef'=>'page-manual-mark'];
$request = ['version'=>'clear-moodle-observations.3','requestRef'=>str_repeat('1',64),
 'issuerEpoch'=>$binding['issuerEpoch'],'bindingScopeHash'=>$binding['bindingScopeHash'],'confirmationRef'=>$binding['confirmationRef']];
$read = fn($req=null,$bound=null,$clock=null) => read_page($reader,$req ?? $request,$bound ?? $binding,$clock ?? fn()=>101);
$dto = $read();
ok($dto['requestRef'] === $request['requestRef'] && $dto['observations'][0]['state']==='INCOMPLETE', 'new request snapshot missing row is incomplete');
run($r, 'INSERT INTO clear_source.completion VALUES(1,7,3,1)');
ok($read()['observations'][0]['state']==='COMPLETE', 'manual completion one accepted');
$reject = function(callable $fn,string $name) { try {$fn();} catch (RuntimeException $e) { echo 'PASS ' . $name . "\n"; return; } throw new RuntimeException('FAILED '.$name); };
run($r, 'UPDATE clear_source.completion SET completionstate=2');
$reject(fn()=>$read(), 'grade completion rejected');
run($r, 'UPDATE clear_source.completion SET completionstate=0; INSERT INTO clear_source.completion VALUES(2,7,3,0)');
$reject(fn()=>$read(), 'duplicate completion rejected');
run($r, 'DELETE FROM clear_source.completion WHERE id=2');
$bad=$request; $bad['issuerEpoch']=str_repeat('9',64); $reject(fn()=>$read($bad), 'issuer mismatch rejected');
$bad=$request; $bad['userId']=7; $reject(fn()=>$read($bad), 'extra identity field rejected');
$reject(fn()=>$read($request,$binding,fn()=>150), 'exclusive expiry rejected');
$clockvalues=[101,100]; $reject(fn()=>$read($request,$binding,function()use(&$clockvalues){return array_shift($clockvalues)??100;}), 'clock reversal rejected');
run($r, "UPDATE clear_source.sessions SET sessdata='after-confirmation'");
$reject(fn()=>$read(), 'stale session generation rejected');
$reject(fn()=>clear_synthetic\safe_int(9007199254740992), 'unsafe revision rejected');
$approved=['mode'=>'SYNTHETIC_ONLY','backend'=>'postgres-database-session','moodleVersion'=>2024100715,'auth'=>['manual'],'enrol'=>['manual'],'projection'=>'core-page-manual-01'];
foreach(['hooks','customProfileFields','sitePolicies','timeoutHooks','additionalPlugins','roleOverrides','roleSwitch','loginAs','availability','groups','replication'] as $field) {$approved[$field]=[];}
foreach(['codeInventoryHash','cfgHash','aclHash','queryHash','dependencyHash'] as $field) {$approved[$field]=str_repeat('a',64);}
ok(strlen(clear_synthetic\validate_profile($approved,$approved))===64,'exact synthetic profile accepted');
foreach(['hooks','customProfileFields','sitePolicies','timeoutHooks','additionalPlugins','roleOverrides','roleSwitch','loginAs','availability','groups','replication','codeInventoryHash','cfgHash','aclHash','queryHash','dependencyHash'] as $field) {
 $changed=$approved; $changed[$field]=is_array($changed[$field])?['unsupported']:str_repeat('b',64);
 $reject(fn()=>clear_synthetic\validate_profile($approved,$changed), 'profile drift rejected '.$field);
}
