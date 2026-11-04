<?php
// New fixed path only; DB/helper/transport dependencies are modeled, not real Moodle users.
define('CLEAR_AUTHORITY_BRIDGE_LIBRARY_ONLY', true);
require __DIR__ . '/course_authority_bridge_test.php';
require __DIR__ . '/../local_clearbridge/classes/course_fixed_scope.php';
use local_clearbridge\course_fixed_scope as Fixed;
function fixed_reset(): void {
    reset_bridge();
    $GLOBALS['CFG']->wwwroot='http://127.0.0.1:18768';
    $GLOBALS['CFG']->local_clearbridge_enable_fixed_scope=true;
    unset($GLOBALS['CFG']->session_handler_class); // Actual source18768 uses core file handler.
    $GLOBALS['f']['fixedscope']=['enabled'=>true,'ownerRunId'=>'run-1','installationRef'=>'install-1',
        'moodleOrigin'=>'http://127.0.0.1:18768','courseId'=>7,'courseRef'=>'course-1','subjectUserId'=>42,
        'subjectRef'=>'subject-1','participantActorRef'=>'student-actor','operatorUserId'=>43,'operatorActorRef'=>'teacher-actor',
        'applicationRef'=>'normal-application','expiresAtExclusive'=>2000000100];
}
function fixed_test($label,$body): void {
    fixed_reset(); [$registry,$path]=new_registry();
    try { $body($registry,$path); echo "PASS $label\n"; } finally { cleanup_registry($path); }
}
function fixed_publish($registry,string $role='PARTICIPANT'): array {
    $user=$role==='PARTICIPANT'?42:43; $GLOBALS['USER']->id=$user;
    $lease=Fixed::issue(7,$user,$role); expect($lease!==null,'issue fixed');
    $grant=$lease->grant_for(7,$user,$role,'run-1');
    $q=['version'=>'clear-moodle-course-read-request.1','requestRef'=>str_repeat('a',64),'ownerRunId'=>'run-1',
        'moodleAuthorityRef'=>$grant['moodleAuthorityRef'],'role'=>$role,'expiresAtExclusive'=>$grant['expiresAtExclusive']];
    $lease->attach_registry($registry); expect($lease->publish_request($q),'publish fixed'); return [$lease,$q];
}
if (defined('CLEAR_FIXED_SCOPE_LIBRARY_ONLY')) { return; }
fixed_test('fixed file-session scope returns exact14 display-only fields without generation or epoch',function($registry) {
    [$lease,$q]=fixed_publish($registry); $v=Fixed::respond($q,$registry);
    expect($v['status']==='OK' && count($v)===14 && $v['applicationRef']==='normal-application'
        && $v['displayOnly']===true && $v['authorityConsumptionAllowed']===false
        && !array_key_exists('authorityEpoch',$v) && !array_key_exists('installationGeneration',$v),'exact14');
    $lease->revoke(); $v=Fixed::respond($q,$registry);
    expect($v['status']==='UNAVAILABLE' && count($v)===14 && $v['applicationRef']===null,'closed');
});
fixed_test('teacher actor and student subject remain distinct in same configured course',function($registry) {
    [$lease,$q]=fixed_publish($registry,'COURSE_OPERATOR'); $v=Fixed::respond($q,$registry);
    expect($v['actorRef']==='teacher-actor' && $v['subjectRef']==='subject-1'
        && $GLOBALS['f']['checkedcapability']==='local/clearbridge:configure','teacher'); $lease->revoke();
});
fixed_test('wrong course actor role run and unsupported settings never issue',function($registry) {
    expect(Fixed::issue(8,42,'PARTICIPANT')===null && Fixed::issue(7,43,'PARTICIPANT')===null
        && Fixed::issue(7,42,'COURSE_OPERATOR')===null && Fixed::issue(7,42,'OTHER')===null,'scope');
    $GLOBALS['f']['fixedscope']['moodleOrigin']='http://other'; expect(Fixed::issue(7,42,'PARTICIPANT')===null,'installation');
});
fixed_test('current config application scope and role changes revoke results',function($registry) {
    foreach (['applicationRef'=>'other-application','ownerRunId'=>'other-run','subjectRef'=>'other-subject',
        'participantActorRef'=>'other-actor','enabled'=>false] as $key=>$value) {
        fixed_reset(); [$lease,$q]=fixed_publish($registry); $GLOBALS['f']['fixedscope'][$key]=$value;
        expect(Fixed::respond($q,$registry)['status']==='UNAVAILABLE','config change'); $lease->revoke();
    }
});
fixed_test('file disappearance is rejected by originating request even when metadata row remains',function($registry) {
    [$lease,$q]=fixed_publish($registry); $GLOBALS['f']['sessionexists']=false;
    expect(!$lease->bridge_current() && Fixed::respond($q,$registry)['status']==='UNAVAILABLE','core file existence check');
});
fixed_test('logout metadata removal enrolment role account and config drift fail closed',function($registry) {
    foreach (['session'=>0,'enrol'=>false,'capability'=>false,'user'=>false,'configdrift'=>true] as $key=>$value) {
        fixed_reset(); [$lease,$q]=fixed_publish($registry); $GLOBALS['f'][$key]=$value;
        expect(Fixed::respond($q,$registry)['status']==='UNAVAILABLE','fresh denial'); $lease->revoke();
    }
});
fixed_test('unknown handlers and old epoch path still fail closed without real generation',function($registry) {
    $GLOBALS['CFG']->session_handler_class='unsupported'; expect(Fixed::issue(7,42,'PARTICIPANT')===null,'unsupported handler');
    unset($GLOBALS['CFG']->session_handler_class);
    expect(issue()===null,'old lease does not silently become fixed scope');
});
fixed_test('new request numeric-string replay and mixed record fields reject',function($registry) {
    [$lease,$q]=fixed_publish($registry); $q['requestRef']='0e'.str_repeat('2',62);
    expect(Fixed::respond($q,$registry)['status']==='UNAVAILABLE' && !$lease->bridge_current(),'wrong request');
    fixed_reset(); [$lease,$q]=fixed_publish($registry); $r=$registry->lookup($q); $r['generation']=['authorityEpoch'=>1];
    rejected(fn()=>\local_clearbridge\course_authority_currentness::record_shape($r)); $lease->revoke();
});
fixed_test('fixed path retains original monotonic and exclusive wall limits',function($registry) {
    [$lease,$q]=fixed_publish($registry); $GLOBALS['f']['mono']+=5000000000;
    expect(Fixed::respond($q,$registry)['status']==='UNAVAILABLE','mono'); $lease->revoke();
    fixed_reset(); [$lease,$q]=fixed_publish($registry); $GLOBALS['f']['wall']=$q['expiresAtExclusive'];
    expect(Fixed::respond($q,$registry)['status']==='UNAVAILABLE','wall'); $lease->revoke();
});
fixed_test('page publishes exact request allows current fixed payment and finally removes lease',function($registry) {
    $GLOBALS['CFG']->local_clearbridge_course_read=['enabled'=>true,'origin'=>'https://fixture.invalid','ca'=>__FILE__,
        'ownerRunId'=>'run-1','key'=>str_repeat('d',64),'synthetic'=>true];
    $GLOBALS['CFG']->local_clearbridge_course_authority_bridge=static fn()=>['registry'=>$registry];
    $GLOBALS['f']['paymentversion']='clear-moodle-fixed-payment-status.1';
    $GLOBALS['f']['owner']=static function() use($registry) {
        expect(Fixed::respond($GLOBALS['f']['lastRequest'],$registry)['status']==='OK','owner current read');
    };
    $v=\local_clearbridge\course_projection_page::data((object)['id'=>7],true);
    expect($v['hasrecords'] && $v['fixedscope'] && $registry->lookup($GLOBALS['f']['lastRequest'])===null,'display and finally');
    $GLOBALS['f']['owner']=static function() { $GLOBALS['f']['sessionexists']=false; };
    $v=\local_clearbridge\course_projection_page::data((object)['id'=>7],true);
    expect(!$v['hasrecords'],'file vanished before display');
});
fixed_test('fixed page refuses legacy payment version and mapping mutation during owner call',function($registry) {
    $GLOBALS['CFG']->local_clearbridge_course_read=['enabled'=>true,'origin'=>'https://fixture.invalid','ca'=>__FILE__,
        'ownerRunId'=>'run-1','key'=>str_repeat('d',64),'synthetic'=>true];
    $GLOBALS['CFG']->local_clearbridge_course_authority_bridge=static fn()=>['registry'=>$registry];
    expect(!\local_clearbridge\course_projection_page::data((object)['id'=>7],true)['hasrecords'],'legacy version');
    $GLOBALS['f']['paymentversion']='clear-moodle-fixed-payment-status.1';
    $GLOBALS['f']['owner']=static function() { $GLOBALS['f']['fixedscope']['applicationRef']='changed'; };
    expect(!\local_clearbridge\course_projection_page::data((object)['id'=>7],true)['hasrecords'],'mapping changed');
});
fixed_test('fixed endpoint accepts logical TLS host and rejects connection-port host in a separate worker',function($registry,$path) {
    [$lease,$q]=fixed_publish($registry); $root=dirname($path).'/web';
    mkdir($root,0700); mkdir($root.'/local',0700); mkdir($root.'/local/clearbridge',0700);
    copy(__DIR__.'/../local_clearbridge/authority.php',$root.'/local/clearbridge/authority.php');
    $code="<?php\ndefine('CLEAR_FIXED_SCOPE_LIBRARY_ONLY',true);\nrequire ".var_export(__FILE__,true).";\nfixed_reset();\n";
    // TLS termination flag is modeled. A owns the real CA/Apache TLS composition test.
    $code.="\$_SERVER['HTTPS']='on';\n\$CFG->local_clearbridge_authority_service=config();\n";
    $code.="\$CFG->local_clearbridge_authority_service['origin']='https://127.0.0.1:18768';\n";
    $code.="\$CFG->local_clearbridge_course_read=['key'=>str_repeat('b',64)];\n";
    $code.="\$CFG->local_clearbridge_course_authority_bridge=static fn()=>['registry'=>new \\local_clearbridge\\course_authority_registry(".
        var_export($path,true).",'run-1')];\n";
    file_put_contents($root.'/config.php',$code);
    $port=random_int(20000,45000); $log=dirname($path).'/http.log'; $pipes=[];
    $server=proc_open([PHP_BINARY,'-S','127.0.0.1:'.$port,'-t',$root],[0=>['pipe','r'],1=>['file',$log,'a'],2=>['file',$log,'a']],$pipes);
    expect(is_resource($server),'worker'); fclose($pipes[0]);
    try {
        $ready=false;
        for($i=0;$i<40;$i++) { $socket=@fsockopen('127.0.0.1',$port,$errno,$errstr,0.05);
            if($socket) {fclose($socket);$ready=true;break;} usleep(25000); }
        expect($ready,'worker ready');
        $call=static function($host,$extra=[]) use($port,$q) {
            [$s,$raw]=signed($q); $headers=['Content-Type: application/json','Host: '.$host,
                'X-Clear-Timestamp: '.$s['HTTP_X_CLEAR_TIMESTAMP'],'X-Clear-Nonce: '.$s['HTTP_X_CLEAR_NONCE'],
                'X-Clear-Signature: '.$s['HTTP_X_CLEAR_SIGNATURE'],...$extra];
            $ch=curl_init('http://127.0.0.1:'.$port.'/local/clearbridge/authority.php'); $seen=[];
            curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$raw,CURLOPT_HTTPHEADER=>$headers,
                CURLOPT_RETURNTRANSFER=>true,CURLOPT_PROXY=>'',CURLOPT_TIMEOUT=>2,
                CURLOPT_HEADERFUNCTION=>static function($handle,$line) use(&$seen) {$seen[]=$line;return strlen($line);}]);
            $raw=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
            expect(!str_contains(strtolower(implode('',$seen)),'set-cookie:'),'no cookie');
            return [$status,json_decode($raw,true,32,JSON_THROW_ON_ERROR)];
        };
        [$status,$v]=$call('127.0.0.1:18768'); expect($status===200&&$v['status']==='OK'&&count($v)===14,'logical origin');
        [$status]=$call('127.0.0.1:19468'); expect($status===403,'connection port cannot choose Host');
        [$status]=$call('evil.test',['X-Forwarded-Host: 127.0.0.1:18768']); expect($status===403,'no forwarded host bypass');
        [$status]=$call('127.0.0.1:18768',['Cookie: MoodleSession=private']); expect($status===403,'cookie rejected');
        $lease->revoke(); [$status,$v]=$call('127.0.0.1:18768');
        expect($status===200&&$v['status']==='UNAVAILABLE'&&$v['applicationRef']===null,'fixed close');
    } finally {
        proc_terminate($server);proc_close($server);
        foreach([$root.'/config.php',$root.'/local/clearbridge/authority.php',$log] as $f){unlink($f);}
        rmdir($root.'/local/clearbridge');rmdir($root.'/local');rmdir($root);
    }
});
