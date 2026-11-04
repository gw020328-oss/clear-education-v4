<?php
// Real C client/registry/currentness; modeled Moodle clock/identity and TLS transport.
define('CLEAR_LOGIN_AUTHORITY_LIBRARY_ONLY', true);
require __DIR__ . '/course_login_authority_test.php';

use local_clearbridge\course_login_authority as Login;
use local_clearbridge\course_login_client as Client;
use local_clearbridge\course_authority_registry as Registry;

function command_case(string $label, Closure $body, string $role = 'PARTICIPANT'): void {
    [$q,$record] = login_record('authorize-command', $role);
    [$unused,$path] = new_registry();
    file_put_contents($path,json_encode(['version'=>'clear-moodle-login-registry.1','ownerRunId'=>'run-1',
        'wallFloor'=>0,'leases'=>[],'nonces'=>[]]));
    $registry = new Registry($path,'run-1',true);
    $config = ['ownerRunId'=>'run-1','sessionKey'=>str_repeat('c',64),'key'=>str_repeat('a',64),
        'origin'=>'https://owner.test:19473','ca'=>'/synthetic-unused','registry'=>$path];
    try { $body($q,$record,$registry,$config,$path); echo "PASS $label\n"; }
    finally { unset($GLOBALS['login_flush_hook']); cleanup_registry($path); }
}

if (defined('CLEAR_COMMAND_AUTHORITY_LIBRARY_ONLY')) { return; }

foreach (['PARTICIPANT','COURSE_OPERATOR'] as $role) {
    command_case("$role command exact8 digest uses the existing registry and exact8 reverse grant", function($q,$r,$registry,$config,$path) {
        Login::request_shape('authorize-command',$q);
        expect(count($q)===8 && $q['version']===Login::COMMAND_VERSION,'command exact8');
        $registry->publish($r);
        $answer = Login::respond('authorize-command',$q,$config,$registry);
        expect(count($answer)===8 && $answer['role']===$q['role'],'exact reverse grant');
        $raw=file_get_contents($path);
        foreach ([$q['commandHash'],$q['intentRef'],'synthetic-sid-never-export'] as $secret) {
            expect(!str_contains($raw,$secret),'only operation digest stored');
        }
        foreach (['commandHash'=>str_repeat('7',64),'intentRef'=>str_repeat('8',64)] as $field=>$value) {
            $changed=$q; $changed[$field]=$value;
            rejected(fn()=>Login::respond('authorize-command',$changed,$config,$registry));
        }
        $other=$q;unset($other['commandHash']);$other['version']=Login::VERSION;
        rejected(fn()=>Login::respond('status',$other,$config,$registry));
        $wrong=$r;$wrong['operation']='status';
        rejected(fn()=>Login::record_shape($wrong));
    },$role);
}

command_case('command response requires exact requestRef, version, AUTHORIZED and identical unextended deadline',
function($q,$r,$registry,$config) {
    $reply=['version'=>Login::COMMAND_VERSION,'requestRef'=>$q['requestRef'],'status'=>'AUTHORIZED',
        'expiresAtExclusive'=>$q['expiresAtExclusive']];
    Client::response_shape('authorize-command',$q,$reply,2000000000,2000000300);
    foreach (['version'=>Login::VERSION,'requestRef'=>str_repeat('9',64),'status'=>'CONNECTED',
            'expiresAtExclusive'=>2000000006,'extra'=>true] as $key=>$value) {
        $bad=$reply;$bad[$key]=$value;
        rejected(fn()=>Client::response_shape('authorize-command',$q,$bad,2000000000,2000000300));
    }
    $short=$reply;$short['expiresAtExclusive']--;
    rejected(fn()=>Client::response_shape('authorize-command',$q,$short,2000000000,2000000300));
    $bad=$reply;unset($bad['requestRef']);
    rejected(fn()=>Client::response_shape('authorize-command',$q,$bad,2000000000,2000000300));
    rejected(fn()=>Client::response_shape('authorize-command',$q,$reply,2000000005,2000000300));
    rejected(fn()=>Client::response_shape('authorize-command',$q,$reply,2000000000,2000000004));
});

foreach (['ok','wrong-ref','extended-expiry','short-expiry','extra','transport-error','expiry','monotonic',
        'enrolment','role','scope','session'] as $scenario) {
    command_case("real C command client $scenario retains only validated success and revokes every failure",
    function($fixture,$r,$registry,$config,$path) use($scenario) {
        $GLOBALS['f']['owner'] = static function() use($scenario,$registry,$config): void {
            $q=$GLOBALS['f']['lastRequest'];
            expect(count($q)===8 && $q['version']===Login::COMMAND_VERSION,'private DTO');
            expect($GLOBALS['f']['lastUrl']==='https://owner.test:19473/v1/moodle/connect/authorize-command','fixed command path');
            foreach ($GLOBALS['f']['lastHeaders'] as $header) {
                expect(!preg_match('/\A(?:Cookie|Origin|Authorization|X-Clear-Command-Binding):/i',$header),
                    'browser credentials/binding never sent to private owner');
            }
            $grant=Login::respond('authorize-command',$q,$config,$registry);
            expect($grant['expiresAtExclusive'] >= $q['expiresAtExclusive'],'unchanged authority horizon');
            $GLOBALS['f']['loginreply']=['version'=>Login::COMMAND_VERSION,'requestRef'=>$q['requestRef'],
                'status'=>'AUTHORIZED','expiresAtExclusive'=>$q['expiresAtExclusive']];
            switch($scenario) {
                case 'wrong-ref': $GLOBALS['f']['loginreply']['requestRef']=str_repeat('f',64); break;
                case 'extended-expiry': $GLOBALS['f']['loginreply']['expiresAtExclusive']++; break;
                case 'short-expiry': $GLOBALS['f']['loginreply']['expiresAtExclusive']--; break;
                case 'extra': $GLOBALS['f']['loginreply']['handback']=null; break;
                case 'transport-error': $GLOBALS['f']['transportfail']=true; break;
                case 'expiry': $GLOBALS['f']['wall']=2000000005; break;
                case 'monotonic': $GLOBALS['f']['mono']=15000000000; break;
                case 'enrolment': $GLOBALS['f']['enrol']=false; break;
                case 'role': $GLOBALS['f']['capability']=false; break;
                case 'scope': $GLOBALS['f']['fixedscope']['subjectUserId']=44; break;
                case 'session': $GLOBALS['f']['session']=32; break;
            }
        };
        $client=new Client($config,$r['scope'],42,'PARTICIPANT');
        $call=fn()=>$client->request('authorize-command',['intentRef'=>$fixture['intentRef'],'commandHash'=>$fixture['commandHash']]);
        if ($scenario==='ok') {
            $reply=$call();
            expect($reply['status']==='AUTHORIZED' && $reply['expiresAtExclusive']===2000000005,'authorized exact deadline');
        } else { rejected($call); }
        $state=json_decode(file_get_contents($path),true,8,JSON_THROW_ON_ERROR);
        if ($scenario==='ok') {
            expect(count($state['leases'])===1 && array_values($state['leases'])[0]['request']['expiresAtExclusive']===2000000005,
                'success retains original deadline for execution');
        } else {
            expect($state['leases']===[],'failure revoked before any success retention');
        }
    });
}
