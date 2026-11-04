<?php
// Actual C registry/client/HMAC/currentness, modeled Moodle and A's synchronous commit.
define('CLEAR_COMMAND_AUTHORITY_LIBRARY_ONLY', true);
require __DIR__ . '/course_command_authority_test.php';

use local_clearbridge\course_login_authority as Login;
use local_clearbridge\course_login_client as Client;
use local_clearbridge\course_authority_registry as Registry;
use local_clearbridge\course_authority_currentness as Currentness;

function execution_envelope(array $q, string $nonce): array {
    $config=['enabled'=>true,'origin'=>'https://moodle.test','ownerRunId'=>'run-1','key'=>str_repeat('d',64)];
    $raw=json_encode(['operation'=>'execute-command','request'=>$q],JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
    $stamp=(string)$GLOBALS['f']['wall'];
    $server=['REQUEST_METHOD'=>'POST','REQUEST_URI'=>Login::PATH,'HTTP_HOST'=>'moodle.test','HTTPS'=>'on',
        'CONTENT_TYPE'=>'application/json','HTTP_X_CLEAR_TIMESTAMP'=>$stamp,'HTTP_X_CLEAR_NONCE'=>$nonce,
        'HTTP_X_CLEAR_SIGNATURE'=>hash_hmac('sha256',implode("\n",[Currentness::DOMAIN,$stamp,$nonce,'POST',
            Login::PATH,hash('sha256',$raw)]),$config['key'])];
    return Currentness::authenticate_transport($server,$raw,$config,str_repeat('a',64),Login::PATH);
}

function authorized_command(array $fixture, array $record, Registry $registry, array $config): array {
    $GLOBALS['f']['owner']=static function() use($registry,$config): void {
        $q=$GLOBALS['f']['lastRequest'];
        Login::respond('authorize-command',$q,$config,$registry);
        $GLOBALS['f']['loginreply']=['version'=>Login::COMMAND_VERSION,'requestRef'=>$q['requestRef'],
            'status'=>'AUTHORIZED','expiresAtExclusive'=>$q['expiresAtExclusive']];
    };
    (new Client($config,$record['scope'],$record['actorUserId'],$fixture['role']))->request('authorize-command',
        ['intentRef'=>$fixture['intentRef'],'commandHash'=>$fixture['commandHash']]);
    return $GLOBALS['f']['lastRequest'];
}

if (($argv[1]??'')==='execute-worker') {
    [$unused,$record]=login_record('authorize-command');
    $job=json_decode(file_get_contents($argv[2]),true,8,JSON_THROW_ON_ERROR);
    $registry=new Registry($job['registry'],'run-1',true);
    [$envelope,$nonce,$stamp]=execution_envelope($job['request'],$argv[3]);
    Login::reverse_request_shape($envelope['operation'],$envelope['request']);
    $registry->claim_nonce($nonce,$stamp);
    echo "AUTHENTICATED\n"; fflush(STDOUT);
    fgets(STDIN); // Both distinct valid HMAC requests rendezvous after nonce admission.
    try {
        $grant=Login::respond('execute-command',$envelope['request'],['sessionKey'=>str_repeat('c',64)],$registry);
        expect($grant['expiresAtExclusive']===$job['request']['expiresAtExclusive'],'original deadline');
        // Only this fixture models the subsequent synchronous durable write. No live business call.
        file_put_contents($job['effect'],"effect\n",FILE_APPEND|LOCK_EX);
        echo "ACCEPT\n";
    } catch (Throwable $error) { echo "REJECT\n"; }
    exit;
}

foreach (['normal','session-replaced','session-gone','enrolment','role','scope','expiry','monotonic'] as $scenario) {
    command_case("authorize then $scenario: execution rechecks currentness and consumes even failed validation",
    function($fixture,$record,$registry,$config,$path) use($scenario) {
        $q=authorized_command($fixture,$record,$registry,$config);
        $before=Login::respond('authorize-command',$q,$config,$registry);
        expect(count(json_decode(file_get_contents($path),true)['leases'])===1,'authorize lookup is non-consuming');
        switch($scenario) {
            case 'session-replaced': $GLOBALS['f']['session']=32; break;
            case 'session-gone': $GLOBALS['f']['sessionexists']=false; break;
            case 'enrolment': $GLOBALS['f']['enrol']=false; break;
            case 'role': $GLOBALS['f']['capability']=false; break;
            case 'scope': $GLOBALS['f']['fixedscope']['subjectUserId']=44; break;
            case 'expiry': $GLOBALS['f']['wall']=2000000005; break;
            case 'monotonic': $GLOBALS['f']['mono']=15000000000; break;
        }
        $effect=0;
        $execute=static function() use($q,$config,$registry,&$effect,$before) {
            $grant=Login::respond('execute-command',$q,$config,$registry);
            $old=$before;$new=$grant;unset($old['expiresAtExclusive'],$new['expiresAtExclusive']);
            expect($old===$new && $grant['expiresAtExclusive']===$q['expiresAtExclusive'],'same identity and original expiry');
            $effect++; // Modeled A local commit, only after successful execution-time reverse check.
        };
        if ($scenario==='normal') { $execute(); } else { rejected($execute); }
        expect($effect===($scenario==='normal'?1:0),'durable effect count');
        expect(json_decode(file_get_contents($path),true)['leases']===[],'consumed despite failure');
        // Restore a transiently revoked Moodle state; consumption must still prevent reuse.
        login_record('authorize-command');
        if ($scenario==='expiry') { $GLOBALS['f']['wall']=2000000005; }
        rejected($execute);
        expect($effect===($scenario==='normal'?1:0),'lost response/retry produces no second effect');
    });
}

command_case('mismatched original q/digest never consumes the matching or unrelated publication',
function($fixture,$record,$registry,$config,$path) {
    $q=authorized_command($fixture,$record,$registry,$config);
    $otherq=$q;$otherq['requestRef']=str_repeat('a',64);$otherq['moodleAuthorityRef']=str_repeat('b',64);
    $other=Login::capture('authorize-command',$otherq,$record['scope'],42,10000000000,2000000000);
    $registry->publish($other);
    foreach (['commandHash'=>str_repeat('7',64),'intentRef'=>str_repeat('8',64),'requestRef'=>str_repeat('9',64),
            'expiresAtExclusive'=>2000000004,'role'=>'COURSE_OPERATOR','moodleAuthorityRef'=>$otherq['moodleAuthorityRef']] as $key=>$value) {
        $changed=$q;$changed[$key]=$value;
        rejected(fn()=>Login::respond('execute-command',$changed,$config,$registry));
        expect(count(json_decode(file_get_contents($path),true)['leases'])===2,'no mismatched record consumed');
    }
    Login::respond('execute-command',$q,$config,$registry);
    expect(count(json_decode(file_get_contents($path),true)['leases'])===1,'only exact matching record consumed');
    Login::respond('execute-command',$otherq,$config,$registry);
    expect(json_decode(file_get_contents($path),true)['leases']===[],'unrelated record remains independently usable');
});

command_case('post-consumption fsync/currentness failure cannot restore the consumed record',
function($fixture,$record,$registry,$config,$path) {
    $q=authorized_command($fixture,$record,$registry,$config);
    $GLOBALS['login_flush_hook']=static function() { throw new RuntimeException('synthetic post-fsync response loss'); };
    rejected(fn()=>Login::respond('execute-command',$q,$config,$registry));
    unset($GLOBALS['login_flush_hook']);
    expect(json_decode(file_get_contents($path),true)['leases']===[],'removal persisted before response failure');
    rejected(fn()=>Login::respond('execute-command',$q,$config,$registry));
});

command_case('two separately authenticated concurrent execute workers produce exactly one effect; fresh-nonce retry fails',
function($fixture,$record,$registry,$config,$path) {
    $q=authorized_command($fixture,$record,$registry,$config);
    $job=dirname($path).'/job.json';$effect=dirname($path).'/effect.txt';
    file_put_contents($job,json_encode(['registry'=>$path,'request'=>$q,'effect'=>$effect]));
    $workers=[];
    try {
        foreach (['1','2'] as $n) {
            $process=proc_open([PHP_BINARY,__FILE__,'execute-worker',$job,str_repeat($n,32)],
                [0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
            expect(is_resource($process),'worker started');
            $workers[]=[$process,$pipes];
            expect(trim(fgets($pipes[1]))==='AUTHENTICATED','distinct HMAC+nonce authenticated before race');
        }
        foreach($workers as [$process,$pipes]) { fwrite($pipes[0],"go\n");fflush($pipes[0]); }
        $results=[];
        foreach($workers as [$process,$pipes]) {
            fclose($pipes[0]);$results[]=trim(stream_get_contents($pipes[1]));fclose($pipes[1]);
            $stderr=stream_get_contents($pipes[2]);fclose($pipes[2]);
            expect(proc_close($process)===0 && $stderr==='','worker completed');
        }
        $workers=[];sort($results);
        expect($results===['ACCEPT','REJECT'],'single take under lock');
        expect(file_get_contents($effect)==="effect\n",'exactly one modeled durable effect');
        [$envelope,$nonce,$stamp]=execution_envelope($q,str_repeat('3',32));
        $registry->claim_nonce($nonce,$stamp);
        rejected(fn()=>Login::respond($envelope['operation'],$envelope['request'],$config,$registry));
        expect(file_get_contents($effect)==="effect\n",'fresh signed retry after response loss has no effect');
    } finally {
        foreach($workers as [$process,$pipes]) { foreach($pipes as $pipe) { if(is_resource($pipe))fclose($pipe); } proc_terminate($process);proc_close($process); }
        if(is_file($job))unlink($job);if(is_file($effect))unlink($effect);
    }
});

rejected(fn()=>Login::request_version('execute-command'));
echo "PASS execute-command has no outbound/browser request operation\n";
