<?php
require_once __DIR__.'/native_codec_fixture.php';
define('CLI_SCRIPT',true);
require '/var/www/html/config.php';
require __DIR__.'/adapter.php';
require __DIR__.'/native_handler_fixture.php';
require __DIR__.'/registry_fixture.php';
require __DIR__.'/registry_install.php';
use function clear_moodle_registry\accept;
use function clear_moodle_registry\stage;
use function clear_moodle_registry\query;
use function clear_moodle_registry\one;
use function clear_moodle_registry_fixture\seal;
use function clear_moodle_registry_fixture\trust;
use function clear_moodle_registry_fixture\roster;
use function clear_moodle_registry_fixture\attempt;
use function clear_moodle_registry_fixture\public_key;
use function clear_synthetic\canonical;
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || $SITE->shortname!=='clear'){exit(1);}
$pg=\clear_moodle_registry_fixture\owner();$checks=0;
function ok(bool $value,string $name):void {global $checks;if(!$value){throw new RuntimeException('FAILED '.$name);}echo "PASS $name\n";$checks++;}
function fingerprint():string {
    global $pg;
    $state=[];
    foreach(['authority','attempts','confirmations','registry_head','registry_keys','registry_bindings','registry_pending','registry_receipts'] as $table) {
        $r=query($pg,"SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM clear_probe.$table t");
        $state[]=pg_fetch_result($r,0,0);
    }
    return hash('sha256',implode("\n",$state));
}
function reject(callable $fn,string $code,string $name):void {
    $before=fingerprint();$got=false;
    try{$fn();}catch(Throwable $e){$got=$e->getMessage()===$code;}
    ok($got && fingerprint()===$before,$name.' / atomic no-change rejection');
}
function worker(string $wire,string $mode=''):array {
    $p=proc_open([PHP_BINARY,__DIR__.'/registry_worker.php'],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
    fwrite($pipes[0],json_encode(['wire'=>$wire,'mode'=>$mode]));fclose($pipes[0]);
    if(fgets($pipes[1])!=="READY\n"){throw new RuntimeException('FIXTURE_WORKER');}
    return [$p,$pipes];
}
function finish(array $child):array {
    [$p,$pipes]=$child;$out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);
    fclose($pipes[1]);fclose($pipes[2]);$exit=proc_close($p);
    ok($err==='','worker emits no diagnostics/payload/key material');
    return [$exit,$out===''?null:json_decode($out,true)];
}
$target=json_decode(file_get_contents('/tmp/clear-target.json'),true);
// Explicit rerun reset of this disposable test's own registry/control-plane fixtures only.
if(pg_fetch_result(query($pg,"SELECT to_regclass('clear_probe.registry_head')::text"),0,0)!==null) {
    query($pg,"DELETE FROM clear_probe.confirmations WHERE issuer='issuer-registry-v1'");
    query($pg,"DELETE FROM clear_probe.attempts WHERE issuer='issuer-registry-v1'");
    query($pg,'DROP TABLE clear_probe.registry_receipts,clear_probe.registry_pending,clear_probe.registry_bindings,clear_probe.registry_keys,clear_probe.registry_head');
}
install_signed_registry($pg,['rootRef'=>'root-v1','publicKey'=>public_key('root'),'issuerEpoch'=>'issuer-registry-v1',
    'installationRef'=>'synthetic-moodle','audience'=>'synthetic-clear'],[
    ['courseRef'=>'synthetic-course','subjectRef'=>'synthetic-subject',...$target]]);
$t=trust('a',1,1);$r=roster(1);$root=seal($t,'root','root-v1');
reject(fn()=>accept($pg,seal($t,'alien','root-v1')),'REGISTRY_SIGNATURE','untrusted root signature');
reject(fn()=>accept($pg,seal($t,'root','root-other')),'REGISTRY_SIGNER','root key selector cannot replace pin');
reject(fn()=>accept($pg,seal($t,'a','root-v1')),'REGISTRY_SIGNATURE','delegated signing key cannot authorize trust control');
foreach(['audience','issuerEpoch','installationRef'] as $field) {
    $bad=array_replace($t,[$field=>'wrong-scope']);
    reject(fn()=>accept($pg,seal($bad,'root','root-v1')),'REGISTRY_SCOPE','root-signed wrong '.$field);
}
accept($pg,$root);ok(one($pg,'SELECT * FROM clear_probe.registry_head WHERE id=1')['keyref']==='key-a','pinned root activates institution signing key');
reject(fn()=>accept($pg,$root),'REGISTRY_REPLAY','same control revision replay');
$low=array_replace($t,['controlRevision'=>2,'trustEpoch'=>0]);
reject(fn()=>accept($pg,seal($low,'root','root-v1')),'REGISTRY_INTEGER','zero epoch');
reject(fn()=>accept($pg,seal($r,'root','root-v1')),'REGISTRY_SIGNER','root key cannot substitute for roster signer');
reject(fn()=>accept($pg,seal($r,'alien','key-a')),'REGISTRY_SIGNATURE','wrong roster signing key');
accept($pg,seal($r,'a','key-a'));ok(one($pg,'SELECT * FROM clear_probe.registry_bindings')['rosterrevision']==='1','signed roster activates only offline-approved mapping');
$unmapped=array_replace($r,['subjectRef'=>'unapproved-subject','rosterRevision'=>2]);
reject(fn()=>accept($pg,seal($unmapped,'a','key-a')),'REGISTRY_MISSING','signature cannot add a local identity mapping');
$p=attempt();stage($pg,$p);$wire=seal($p,'a','key-a');
foreach(['audience','issuerEpoch','installationRef','bindingScopeHash','courseRef','subjectRef','attemptRef'] as $field) {
    $bad=array_replace($p,[$field=>$field==='bindingScopeHash'?str_repeat('c',64):'other-ref']);
    $code=in_array($field,['audience','issuerEpoch','installationRef'],true)?'REGISTRY_SCOPE':
        (in_array($field,['courseRef','subjectRef','attemptRef'],true)?'REGISTRY_MISSING':'REGISTRY_PENDING');
    reject(fn()=>accept($pg,seal($bad,'a','key-a')),$code,'signed attempt mismatched '.$field);
}
$tampered=json_decode($wire,true);$tampered['signature'][0]=$tampered['signature'][0]==='0'?'1':'0';
reject(fn()=>accept($pg,canonical($tampered)),'REGISTRY_SIGNATURE','bit-flipped signature');
$tampered=json_decode($wire,true);$tampered['keyRef']='unknown-key';
reject(fn()=>accept($pg,canonical($tampered)),'REGISTRY_SIGNER','unknown signing key selector');
reject(fn()=>accept($pg,$wire.' '),'REGISTRY_ENCODING','noncanonical envelope bytes');
$algorithm=[...json_decode($wire,true),'alg'=>'none'];
reject(fn()=>accept($pg,canonical($algorithm)),'REGISTRY_SHAPE','algorithm negotiation is not accepted');
$duplicate=substr($wire,0,-1).',"version":"clear-registry-envelope.1"}';
reject(fn()=>accept($pg,$duplicate),'REGISTRY_ENCODING','duplicate envelope key');
$bytes=canonical($p);$duplicate=substr($bytes,0,-1).',"type":"attempt"}';
reject(fn()=>accept($pg,\clear_moodle_registry_fixture\seal_bytes($duplicate,'a','key-a')),'REGISTRY_ENCODING','signed duplicate payload key');
$bad=array_replace($p,['rosterRevision'=>'1']);
reject(fn()=>accept($pg,seal($bad,'a','key-a')),'REGISTRY_INTEGER','numeric-string revision');
$bad=array_replace($p,['rosterRevision'=>9007199254740992]);
reject(fn()=>accept($pg,seal($bad,'a','key-a')),'UNSAFE_INTEGER','unsafe integer revision');
$bad=[...$p,'userid'=>$target['user']];
reject(fn()=>accept($pg,seal($bad,'a','key-a')),'REGISTRY_SHAPE','signed payload cannot choose internal user id');
$bad=array_replace($p,['notBefore'=>time()+5]);
reject(fn()=>accept($pg,seal($bad,'a','key-a')),'REGISTRY_TIME','not-yet-valid signed assertion');
$bad=array_replace($p,['notBefore'=>time()-10,'expiresAtExclusive'=>time()]);
reject(fn()=>accept($pg,seal($bad,'a','key-a')),'REGISTRY_TIME','exclusive expiration boundary');
$bad=array_replace($p,['expiresAtExclusive'=>$p['notBefore']+121]);
reject(fn()=>accept($pg,seal($bad,'a','key-a')),'REGISTRY_WINDOW','attempt cannot extend 120-second policy');
reject(fn()=>accept($pg,str_repeat('x',16385)),'REGISTRY_SIZE','oversize input');
$digest=accept($pg,$wire);
$a=one($pg,'SELECT * FROM clear_probe.attempts WHERE attemptref=$1',[$p['attemptRef']]);
ok((int)$a['userid']===(int)$target['user'] && (int)$a['courseid']===(int)$target['course'] && (int)$a['moduleid']===(int)$target['module'] &&
    $a['scopehash']===$p['bindingScopeHash'] && $a['issuer']===$p['issuerEpoch'],'verified attempt uses pinned local IDs and exact B scope');
ok((int)pg_fetch_result(query($pg,'SELECT count(*) FROM clear_probe.confirmations'),0,0)===0,'registry acceptance does not mint confirmation');
reject(fn()=>accept($pg,$wire),'REGISTRY_PENDING','consumed signed attempt replay');
reject(fn()=>stage($pg,$p),'REGISTRY_STORAGE','attempt reference cannot be restaged');

// Actual native Moodle session + existing adapter consume the accepted row; no owner fixture mint shortcut.
\core\session\manager::set_user(get_complete_user_data('id',$target['user']));
$SESSION=new stdClass();$_SESSION['SESSION']=&$SESSION;
$sid='synthetic-registry-session';start_probe_codec($sid);$bytes=session_encode();session_abort();
$DB->delete_records('sessions',['sid'=>$sid]);
$target['session']=$DB->insert_record('sessions',(object)['state'=>0,'sid'=>$sid,'userid'=>$target['user'],
    'sessdata'=>base64_encode($bytes),'timecreated'=>time(),'timemodified'=>time(),'firstip'=>'','lastip'=>'']);
$reader=\clear_moodle_probe\pg_from_config('reader');$profile=\clear_moodle_probe\collect_profile($reader,$target);pg_close($reader);
$request=['version'=>'clear-moodle-confirmation.3','attemptRef'=>$p['attemptRef'],'requestRef'=>bin2hex(random_bytes(16)),
    'issuerEpoch'=>$p['issuerEpoch'],'bindingScopeHash'=>$p['bindingScopeHash']];
$h=start_native_probe($sid);$receipt=\clear_moodle_probe\mint($h,$sid,$request,$profile);
$dto=\clear_moodle_probe\confirmation($request,$profile);
file_put_contents('/tmp/clear-registry-dto.json',json_encode($dto,JSON_THROW_ON_ERROR));
ok($dto['confirmationRef']===$receipt['confirmationRef'] && $dto['subjectRef']===$p['subjectRef'] &&
    $dto['trustEpoch']===1 && $dto['rosterRevision']===1,'signed registry feeds existing native mint and B .3 response');
$revoked=array_replace($r,['rosterRevision'=>2,'status'=>'REVOKED']);accept($pg,seal($revoked,'a','key-a'));
try {\clear_moodle_probe\confirmation($request,$profile);$blocked=false;}catch(Throwable $e){$blocked=true;}
ok($blocked && one($pg,'SELECT status FROM clear_probe.attempts WHERE attemptref=$1',[$p['attemptRef']])['status']==='REVOKED','signed roster revocation invalidates existing confirmation');
reject(fn()=>accept($pg,seal($r,'a','key-a')),'REGISTRY_REPLAY','older roster cannot restore revoked authority');
$r3=roster(3);accept($pg,seal($r3,'a','key-a'));
try {\clear_moodle_probe\confirmation($request,$profile);$blocked=false;}catch(Throwable $e){$blocked=true;}
ok($blocked,'higher authorized roster restoration does not revive old attempt');

$next=attempt(3);stage($pg,$next);$nextwire=seal($next,'a','key-a');
reject(fn()=>accept($pg,$nextwire,static function():void{throw new RuntimeException('INJECTED');}),'INJECTED','failure after writes rolls back receipt and consumption');
$beforecrash=fingerprint();$child=worker($nextwire,'crash');[$exit,$out]=finish($child);
ok($exit===71 && $out===null && one($pg,'SELECT status FROM clear_probe.registry_pending WHERE attemptref=$1',[$next['attemptRef']])['status']==='OPEN','worker termination rolls back uncommitted registry state');
ok(fingerprint()===$beforecrash,'terminated worker leaves all authority/receipt/attempt state unchanged');
$first=worker($nextwire);$second=worker($nextwire);$answers=[finish($first),finish($second)];
ok(count(array_filter($answers,fn($x)=>($x[1]['ok']??false)))===1 &&
    count(array_filter($answers,fn($x)=>($x[1]['code']??'')==='REGISTRY_PENDING'))===1,'two processes consume a signed attempt exactly once');

$short=attempt(3);$short['expiresAtExclusive']=time()+1;stage($pg,$short);
reject(fn()=>accept($pg,seal($short,'a','key-a'),static function():void{usleep(1100000);}),'REGISTRY_TIME','expiry after verification rolls back final commit');
$wait=attempt(3);$wait['expiresAtExclusive']=time()+1;stage($pg,$wait);$waitwire=seal($wait,'a','key-a');
query($pg,'BEGIN');query($pg,'SELECT revision FROM clear_probe.authority WHERE id=1 FOR UPDATE');
$child=worker($waitwire);usleep(1100000);query($pg,'COMMIT');[$exit,$answer]=finish($child);
ok($exit===0 && ($answer['code']??'')==='REGISTRY_TIME' && one($pg,'SELECT status FROM clear_probe.registry_pending WHERE attemptref=$1',[$wait['attemptRef']])['status']==='OPEN','post-lock clock check rejects assertion expired in queue');

$rotate=trust('b',2,2);accept($pg,seal($rotate,'root','root-v1'));
ok(one($pg,"SELECT status FROM clear_probe.registry_keys WHERE keyref='key-a'")['status']==='REVOKED' &&
    one($pg,'SELECT status FROM clear_probe.attempts WHERE attemptref=$1',[$next['attemptRef']])['status']==='REVOKED','root-signed rotation retires old key and attempts atomically');
reject(fn()=>accept($pg,seal(roster(4),'a','key-a')),'REGISTRY_TRUST','old trust epoch remains rejected after rotation');
reject(fn()=>accept($pg,seal(roster(4,2),'a','key-a')),'REGISTRY_SIGNER','retired key cannot claim new epoch');
$rollback=array_replace($t,['controlRevision'=>3]);
reject(fn()=>accept($pg,seal($rollback,'root','root-v1')),'REGISTRY_REPLAY','higher control revision cannot lower trust epoch');
$reuse=array_replace($t,['trustEpoch'=>3,'controlRevision'=>3]);
reject(fn()=>accept($pg,seal($reuse,'root','root-v1')),'REGISTRY_KEY_REUSE','retired key reference cannot be revived at higher epoch');
$reuse=trust('a',3,3);$reuse['keyRef']='key-other';
reject(fn()=>accept($pg,seal($reuse,'root','root-v1')),'REGISTRY_STORAGE','retired public key cannot be reused under another selector');
reject(fn()=>accept($pg,seal(roster(3,2),'b','key-b')),'REGISTRY_REPLAY','roster revision floor survives epoch rotation');
$r4=roster(4,2);accept($pg,seal($r4,'b','key-b'));
$p2=attempt(4,2);stage($pg,$p2);accept($pg,seal($p2,'b','key-b'));
ok(one($pg,'SELECT trustepoch FROM clear_probe.attempts WHERE attemptref=$1',[$p2['attemptRef']])['trustepoch']==='2','new key and increasing roster accept new attempt');
$keyrevoke=array_replace($rotate,['controlRevision'=>3,'status'=>'REVOKED']);
$request2=[...$request,'attemptRef'=>$p2['attemptRef'],'requestRef'=>bin2hex(random_bytes(16))];
$h=start_native_probe($sid);
\clear_moodle_probe\mint($h,$sid,$request2,$profile,static function()use($pg,$keyrevoke):void {
    reject(fn()=>accept($pg,seal($keyrevoke,'root','root-v1')),'REGISTRY_STORAGE','key revocation cannot cross native mint authority fence');
});
ok(\clear_moodle_probe\confirmation($request2,$profile)['trustEpoch']===2,'blocked revocation leaves committed confirmation valid');
accept($pg,seal($keyrevoke,'root','root-v1'));
try {\clear_moodle_probe\confirmation($request2,$profile);$blocked=false;}catch(Throwable $e){$blocked=true;}
ok($blocked,'key revocation after mint invalidates existing confirmation');
reject(fn()=>accept($pg,seal(roster(5,2),'b','key-b')),'REGISTRY_TRUST','revoked signing key cannot update roster');
$restore=array_replace($rotate,['controlRevision'=>4]);
reject(fn()=>accept($pg,seal($restore,'root','root-v1')),'REGISTRY_KEY_REUSE','higher control revision cannot reactivate revoked key');
reject(fn()=>accept($pg,seal($rotate,'root','root-v1')),'REGISTRY_REPLAY','old signed rotation cannot undo revocation');
$lowcontrol=trust('c',3,2);
reject(fn()=>accept($pg,seal($lowcontrol,'root','root-v1')),'REGISTRY_REPLAY','higher epoch cannot bypass control revision floor');
$shortkey=trust('c',3,4);$shortkey['expiresAtExclusive']=time()+2;$shortkey['keyExpiresAtExclusive']=$shortkey['expiresAtExclusive'];
accept($pg,seal($shortkey,'root','root-v1'));
$overlong=roster(5,3);
reject(fn()=>accept($pg,seal($overlong,'c','key-c')),'REGISTRY_KEY','signed roster cannot outlive signing-key authorization');
$shortroster=[...$overlong,'expiresAtExclusive'=>$shortkey['expiresAtExclusive']];accept($pg,seal($shortroster,'c','key-c'));
reject(fn()=>stage($pg,attempt(5,3)),'REGISTRY_KEY','B pending cannot outlive key expiry');
usleep(2100000);
reject(fn()=>accept($pg,seal(roster(6,3),'c','key-c')),'REGISTRY_TRUST','key and trust expiration reject even a cryptographically valid new signature');
$runtime=\clear_moodle_probe\pg_from_config('runtime');$reader=\clear_moodle_probe\pg_from_config('reader');
foreach(['runtime'=>$runtime,'reader'=>$reader] as $name=>$connection) {
    foreach(['registry_head','registry_keys','registry_bindings','registry_pending','registry_receipts','attempts'] as $table) {
        reject(fn()=>query($connection,"DELETE FROM clear_probe.$table"),'REGISTRY_STORAGE',$name.' cannot change '.$table);
        $privileges=one($connection,"SELECT has_table_privilege(current_user,$1,'INSERT') OR has_table_privilege(current_user,$1,'UPDATE')
            OR has_table_privilege(current_user,$1,'DELETE') OR has_table_privilege(current_user,$1,'TRUNCATE') AS writable",['clear_probe.'.$table]);
        ok($privileges['writable']==='f',$name.' has no write/erase privilege on '.$table);
    }
    reject(fn()=>stage($connection,attempt(4,2)),'REGISTRY_STORAGE',$name.' cannot invoke owner staging path');
}
query($pg,'BEGIN');$outer=false;try{accept($pg,$wire);}catch(Throwable $e){$outer=$e->getMessage()==='REGISTRY_OUTER_TRANSACTION';}
ok($outer && pg_transaction_status($pg)===PGSQL_TRANSACTION_INTRANS,'import refuses caller transaction without committing or rolling it back');query($pg,'ROLLBACK');
pg_close($runtime);pg_close($reader);pg_close($pg);
echo "PASS $checks signed registry checks\n";
