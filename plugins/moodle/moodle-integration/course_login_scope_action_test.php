<?php
// Actual login_action.php dispatch with modeled Moodle and owner calls on isolated loopback.
$root = sys_get_temp_dir() . '/clear-login-scope-' . bin2hex(random_bytes(8));
mkdir($root . '/local/clearbridge', 0700, true);
copy(__DIR__ . '/../local_clearbridge/login_action.php', $root . '/local/clearbridge/login_action.php');
$classes = realpath(__DIR__ . '/../local_clearbridge/classes');
$bootstrap = <<<'BOOT'
<?php
namespace local_clearbridge {
    class course_refund {
        public static function is_demo_course($id) { return $id === $GLOBALS['case']['scope']['courseId']; }
    }
    class course_login_client {
        public function __construct($config, $scope, $user, $role, private readonly ?\Closure $diagnostic = null) {}
        public static function proofs(...$args) { return ['browserProof' => str_repeat('b',64), 'finishProof' => str_repeat('f',64)]; }
        public function request($operation, $fields = []) {
            $GLOBALS['calls'][] = ['operation' => $operation, 'fields' => $fields];
            if ($this->diagnostic && isset($GLOBALS['case']['diagnostic'])) {
                $case = $GLOBALS['case']['diagnostic'];
                ($this->diagnostic)($case['phase'], 'HTTP', $case['http']);
                if (!empty($case['reject'])) {
                    ($this->diagnostic)(null, 'REJECTED');
                    // A secondary cleanup failure cannot overwrite the original rejection.
                    ($this->diagnostic)('ORIGIN_RECHECK');
                    throw new \RuntimeException('SYNTHETIC_PRIVATE_EXCEPTION');
                }
            }
            return match ($operation) {
                'start' => ['requestRef' => str_repeat('9',64), 'launchCode' => str_repeat('8',64), 'expiresAtExclusive' => time()+120],
                'status' => ['status' => 'RETURN_REQUIRED', 'handback' => str_repeat('7',64)],
                'finish' => ['status' => 'CONNECTED'],
                'end' => ['status' => 'UNAVAILABLE'],
                'authorize-command' => ['version'=>'clear-moodle-command.1','requestRef'=>str_repeat('e',64),
                    'status'=>'AUTHORIZED','expiresAtExclusive'=>time()+5],
            };
        }
    }
}
namespace {
    define('MOODLE_INTERNAL', true);
    require CLASS_ROOT . '/course_read_client.php';
    require CLASS_ROOT . '/course_authority_currentness.php';
    require CLASS_ROOT . '/course_login_authority.php';
    $case = json_decode(file_get_contents(__DIR__.'/case.json'), true);
    if (!empty($case['sinkfails'])) { ini_set('error_log', __DIR__); }
    session_id($case['sessionid'] ?? 'synthetic-session-one');
    $CFG = (object)['wwwroot' => 'http://127.0.0.1:18891',
        'local_clearbridge_login' => ['enabled'=>true,'origin'=>'https://owner.test:19473',
            'browserOrigin'=>'https://127.0.0.1:19473','ca'=>__DIR__.'/case.json','ownerRunId'=>'run-1',
            'key'=>str_repeat('a',64),'proofKey'=>str_repeat('b',64),'sessionKey'=>str_repeat('c',64),'registry'=>'unused'],
        'local_clearbridge_authority_service'=>['enabled'=>true,'ownerRunId'=>'run-1','key'=>str_repeat('d',64)]];
    $DB = new class {
        public function get_record(...$args) { return (object)['value'=>json_encode($GLOBALS['case']['scope'])]; }
    };
    $USER = (object)['id'=>$case['user'],'access'=>[]];
    $SESSION = (object)['local_clearbridge_login_intent'=>$case['attempt']];
    $calls = [];
    register_shutdown_function(static function() {
        file_put_contents(__DIR__.'/result.json',json_encode(['calls'=>$GLOBALS['calls'],'attempt'=>$GLOBALS['SESSION']->local_clearbridge_login_intent??null]));
    });
    function require_sesskey() { if (($_POST['sesskey']??'')!=='fixture') throw new RuntimeException(); }
    function get_course($id) { return (object)['id'=>$id]; }
    function require_login(...$args) {}
    class context_course { public static function instance($id) { return (object)['id'=>$id]; } }
    function require_capability(...$args) {
        if (($GLOBALS['case']['permission'] ?? true) !== true) { throw new RuntimeException('SYNTHETIC_PRIVATE_ROLE'); }
    }
    function is_enrolled(...$args) { return true; }
    function is_siteadmin() { return false; }
}
namespace core\session {
    class manager { public static function is_loggedinas() { return false; } }
}
BOOT;
$bootstrap = str_replace('CLASS_ROOT', var_export($classes, true), $bootstrap);
file_put_contents($root . '/config.php', $bootstrap);
$server = proc_open([PHP_BINARY, '-d', 'error_log='.$root.'/diagnostic.log', '-S', '127.0.0.1:18891', '-t', $root],
    [0 => ['pipe', 'r'], 1 => ['file', $root . '/server.log', 'w'], 2 => ['file', $root . '/server.log', 'a']], $pipes);
if (!is_resource($server)) { throw new RuntimeException('server'); }
fclose($pipes[0]);
try {
    $ready = false;
    for ($i=0; $i<100; $i++) {
        $socket = @fsockopen('127.0.0.1',18891);
        if ($socket) { fclose($socket); $ready=true; break; }
        usleep(10000);
    }
    if (!$ready) { throw new RuntimeException('server not ready'); }
    $scope = ['ownerRunId'=>'run-1','installationRef'=>'install-1','moodleOrigin'=>'http://127.0.0.1:18891',
        'courseId'=>7,'courseRef'=>'course-1','subjectUserId'=>42,'subjectRef'=>'student-1',
        'participantActorRef'=>'student-1','operatorUserId'=>43,'operatorActorRef'=>'teacher-1',
        'expiresAtExclusive'=>time()+300];
    $sorted=$scope;
    ksort($sorted,SORT_STRING);
    $digest=hash('sha256',json_encode($sorted,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES));
    $target = static function(array $scope, string $role, string $intent, string $sid = 'synthetic-session-one'): string {
        ksort($scope, SORT_STRING);
        $digest = hash('sha256', json_encode($scope, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
        return hash_hmac('sha256', implode("\n", ['CLEAR-MOODLE-LOGIN-INTENT-TARGET-1',
            $scope['ownerRunId'], $role, $digest, $intent, $sid]), str_repeat('c',64));
    };
    foreach (['same'=>[], 'subject'=>['subjectUserId'=>44], 'operator'=>['operatorUserId'=>44],
            'course'=>['courseId'=>8], 'legacy'=>[]] as $label=>$change) {
        $role=$label==='operator'?'PARTICIPANT':'COURSE_OPERATOR';
        $attempt=['run'=>'run-1','role'=>$role,'intent'=>str_repeat('1',64),'scopeDigest'=>$digest];
        if ($label==='legacy') { unset($attempt['scopeDigest']); }
        foreach (['status','finish','end','start','authorize-command'] as $operation) {
            $current=array_replace($scope,$change);
            file_put_contents($root.'/case.json',json_encode(['scope'=>$current,'attempt'=>$attempt,
                'user'=>$role==='PARTICIPANT'?42:43]));
            $body=['id'=>(string)$current['courseId'],'sesskey'=>'fixture','operation'=>$operation];
            if ($operation==='start') { $body['challenge']=str_repeat('2',64); }
            if ($operation==='finish') { $body['finishProof']=str_repeat('3',64); }
            if ($operation==='authorize-command') { $body['commandHash']=str_repeat('6',64); }
            if (in_array($operation,['end','status'],true)) { $body['intentTarget']=$target($scope,$role,$attempt['intent']); }
            $context=stream_context_create(['http'=>['method'=>'POST','ignore_errors'=>true,
                'header'=>"Origin: http://127.0.0.1:18891\r\nContent-Type: application/x-www-form-urlencoded;charset=UTF-8\r\n",
                'content'=>http_build_query($body,'','&',PHP_QUERY_RFC1738)]]);
            $raw=file_get_contents('http://127.0.0.1:18891/local/clearbridge/login_action.php',false,$context);
            $reply=json_decode($raw,true,8,JSON_THROW_ON_ERROR);
            $result=json_decode(file_get_contents($root.'/result.json'),true);
            $calls=array_column($result['calls'],'operation');
            if ($label!=='same' && $operation!=='start') {
                if ($calls!==[] || $result['attempt']!==$attempt || $reply!==['status'=>'UNAVAILABLE']
                        || !str_contains($http_response_header[0],'403')) {
                    throw new RuntimeException("$label $operation reused old scope");
                }
            } else {
                $expected=match($operation) {
                    'start'=>$label==='same'?['end','start']:['start'],
                    'finish'=>['status','finish'],
                    default=>[$operation],
                };
                if ($calls!==$expected || !str_contains($http_response_header[0],'200')) {
                    throw new RuntimeException("$label $operation dispatch failed");
                }
                if ($operation==='start') {
                    ksort($current,SORT_STRING);
                    $newdigest=hash('sha256',json_encode($current,JSON_THROW_ON_ERROR|JSON_UNESCAPED_SLASHES));
                    if ($result['attempt']['scopeDigest']!==$newdigest || $result['attempt']['intent']!==str_repeat('9',64)) {
                        throw new RuntimeException('new attempt not pinned');
                    }
                    if (count($reply)!==6 || $reply['intentTarget']!==$target($current,$role,$result['attempt']['intent'])) {
                        throw new RuntimeException('new target not pinned');
                    }
                }
                if ($operation==='authorize-command' && (count($reply)!==3 || $reply['status']!=='AUTHORIZED'
                        || $reply['requestRef']!==str_repeat('e',64) || !is_int($reply['expiresAtExclusive'])
                        || $result['attempt']!==$attempt || $result['calls']!==[['operation'=>'authorize-command',
                            'fields'=>['intentRef'=>$attempt['intent'],'commandHash'=>str_repeat('6',64)]]])) {
                    throw new RuntimeException('command did not use server SESSION intent with exact browser response');
                }
            }
        }
        echo "PASS actual PHP dispatch $label scope across status/finish/end/start/authorize-command\n";
    }
    $send = static function(array $case, string $operation, array $extra = []) use ($root): array {
        file_put_contents($root.'/diagnostic.log', '');
        file_put_contents($root.'/case.json',json_encode($case));
        $body=['id'=>(string)$case['scope']['courseId'],'sesskey'=>$case['sesskey']??'fixture','operation'=>$operation]+$extra;
        $context=stream_context_create(['http'=>['method'=>'POST','ignore_errors'=>true,
            'header'=>"Origin: http://127.0.0.1:18891\r\nContent-Type: application/x-www-form-urlencoded;charset=UTF-8\r\n",
            'content'=>http_build_query($body,'','&',PHP_QUERY_RFC1738)]]);
        $raw=file_get_contents('http://127.0.0.1:18891/local/clearbridge/login_action.php',false,$context);
        $diagnostics = [];
        foreach (file($root.'/diagnostic.log', FILE_IGNORE_NEW_LINES) as $line) {
            $prefix = 'CLEAR_MOODLE_COMMAND_DIAGNOSTIC ';
            $at = strpos($line, $prefix);
            if ($at !== false) { $diagnostics[] = json_decode(substr($line, $at+strlen($prefix)), true, 8, JSON_THROW_ON_ERROR); }
        }
        return [json_decode($raw,true,8,JSON_THROW_ON_ERROR),json_decode(file_get_contents($root.'/result.json'),true),
            str_contains($http_response_header[0],'200')?200:403,$diagnostics];
    };
    $old=['run'=>'run-1','role'=>'PARTICIPANT','intent'=>str_repeat('1',64),'scopeDigest'=>$digest];
    $case=['scope'=>$scope,'attempt'=>$old,'user'=>42];
    $oldtarget=$target($scope,'PARTICIPANT',$old['intent']);
    [$started,$state,$status]=$send($case,'start',['challenge'=>str_repeat('2',64)]);
    if ($status!==200 || array_column($state['calls'],'operation')!==['end','start']) {
        throw new RuntimeException('replacement start did not retire original intent');
    }
    $case['attempt']=$state['attempt'];
    foreach (['end','status'] as $operation) {
        [$reply,$state,$status]=$send($case,$operation,['intentTarget'=>$oldtarget]);
        if ($status!==200 || $reply!==['status'=>'NOT_CURRENT'] || $state['calls']!==[] || $state['attempt']!==$case['attempt']) {
            throw new RuntimeException('late old operation touched replacement intent');
        }
        [$reply,$state,$status]=$send($case+['sessionid'=>'synthetic-session-two'],$operation,
            ['intentTarget'=>$started['intentTarget']]);
        if ($status!==200 || $reply!==['status'=>'NOT_CURRENT'] || $state['calls']!==[]) {
            throw new RuntimeException('target crossed original PHP session');
        }
        foreach ([[],['intentTarget'=>'invalid'],['intentTarget'=>$started['intentTarget'],'extra'=>'bad']] as $extra) {
            [$reply,$state,$status]=$send($case,$operation,$extra);
            if ($status!==403 || $state['calls']!==[] || $state['attempt']!==$case['attempt']) {
                throw new RuntimeException('bad target shape changed current intent');
            }
        }
    }
    echo "PASS delayed old end/status cannot touch replacement intent; missing/malformed/extra and other session reject\n";
    [$reply,$state,$status]=$send($case,'end',['intentTarget'=>$started['intentTarget']]);
    if ($status!==200 || $reply!==['status'=>'UNAVAILABLE'] || $state['attempt']!==null
            || $state['calls']!==[['operation'=>'end','fields'=>['intentRef'=>$case['attempt']['intent']]]]) {
        throw new RuntimeException('targeted normal end failed');
    }
    $case['attempt']=null;
    foreach (['end','status'] as $operation) {
        [$reply,$state,$status]=$send($case,$operation,['intentTarget'=>$started['intentTarget']]);
        if ($status!==200 || $reply!==['status'=>'NOT_CURRENT'] || $state['calls']!==[] || $state['attempt']!==null) {
            throw new RuntimeException('ended intent repeated operation was not inert');
        }
    }
    echo "PASS targeted normal end and repeated end/status are isolated and idempotent without a new registry\n";
    [$reply,$state,$status]=$send($case,'authorize-command',['commandHash'=>str_repeat('6',64)]);
    if ($status!==403 || $state['calls']!==[]) { throw new RuntimeException('command without current intent'); }
    $case['attempt']=$old;
    foreach ([[],['commandHash'=>'0x'.str_repeat('6',64)],['commandHash'=>str_repeat('A',64)],
            ['commandHash'=>str_repeat('6',64),'intentRef'=>str_repeat('8',64)],
            ['commandHash'=>str_repeat('6',64),'commandBinding'=>str_repeat('8',64)],
            ['commandHash'=>str_repeat('6',64),'body'=>'{}']] as $extra) {
        [$reply,$state,$status]=$send($case,'authorize-command',$extra);
        if ($status!==403 || $state['calls']!==[] || $state['attempt']!==$old) {
            throw new RuntimeException('invalid command browser DTO accepted');
        }
    }
    echo "PASS command without SESSION intent or with malformed/extra caller binding/body cannot authorize\n";
    [$reply,$state,$status]=$send($case,'execute-command',['commandHash'=>str_repeat('6',64)]);
    if ($status!==403 || $reply!==['status'=>'UNAVAILABLE'] || $state['calls']!==[] || $state['attempt']!==$old) {
        throw new RuntimeException('reverse-only execute accepted by browser dispatcher');
    }
    echo "PASS reverse-only execute-command is rejected by actual browser dispatcher without owner calls\n";

    foreach (['ok','fields','sesskey','permission','intent','upstream','unknown-phase','sink-fails'] as $scenario) {
        $case=['scope'=>$scope,'attempt'=>$old,'user'=>42];
        $extra=['commandHash'=>str_repeat('6',64)];
        switch ($scenario) {
            case 'fields': $extra['body']='SYNTHETIC_PRIVATE_BODY'; break;
            case 'sesskey': $case['sesskey']='SYNTHETIC_PRIVATE_SESSKEY'; break;
            case 'permission': $case['permission']=false; break;
            case 'intent': $case['attempt']=null; break;
            case 'upstream': $case['diagnostic']=['phase'=>'AUTHORITY_TRANSPORT','http'=>503,'reject'=>true]; break;
            case 'unknown-phase': $case['diagnostic']=['phase'=>'SYNTHETIC_PRIVATE_PHASE','http'=>'SYNTHETIC_PRIVATE_HTTP','reject'=>true]; break;
            case 'sink-fails': $case['sinkfails']=true; break;
        }
        [$reply,$state,$status,$events]=$send($case,'authorize-command',$extra);
        $ok = in_array($scenario,['ok','sink-fails'],true);
        if ($status!==($ok?200:403) || (!$ok && $reply!==['status'=>'UNAVAILABLE'])) {
            throw new RuntimeException('diagnostics changed public response');
        }
        if (!$events || $events[0]!==['version'=>1,'event'=>'ENTER','phase'=>'INPUT',
                'origin'=>'LOGIN_ACTION','upstreamHttpStatus'=>null]) { throw new RuntimeException('missing safe entry'); }
        if ($scenario!=='sink-fails') {
            $last=end($events);
            $phase=match($scenario) {'ok'=>'RESPONSE_PROJECTION','fields'=>'INPUT_FIELDS','sesskey'=>'SESSKEY',
                'permission'=>'MOODLE_AUTHORITY','intent'=>'SESSION_INTENT','upstream'=>'AUTHORITY_TRANSPORT',
                'unknown-phase'=>'CLIENT_DISPATCH'};
            if ($last!==['version'=>1,'event'=>$ok?'SUCCEEDED':'REJECTED','phase'=>$phase,
                    'origin'=>$scenario==='upstream'?'LOGIN_CLIENT':'LOGIN_ACTION',
                    'upstreamHttpStatus'=>$scenario==='upstream'?503:null]) { throw new RuntimeException('wrong failure stage'); }
            if (count(array_filter($events,static fn($row)=>$row['event']==='REJECTED'))!==($ok?0:1)) {
                throw new RuntimeException('first rejection not latched');
            }
        }
        $encoded=json_encode($events);
        foreach (['SYNTHETIC_PRIVATE',str_repeat('6',64),'run-1','synthetic-session-one','student-1','fixture'] as $forbidden) {
            if (str_contains($encoded,$forbidden)) { throw new RuntimeException('private value reached diagnostic'); }
        }
        echo "PASS actual PHP diagnostic $scenario keeps fixed fields, first failure and unchanged response\n";
    }
    foreach ([100,599,99,600,'503',null] as $http) {
        $case=['scope'=>$scope,'attempt'=>$old,'user'=>42,
            'diagnostic'=>['phase'=>'AUTHORITY_TRANSPORT','http'=>$http,'reject'=>true]];
        [,,,$events]=$send($case,'authorize-command',['commandHash'=>str_repeat('6',64)]);
        $expected=is_int($http)&&$http>=100&&$http<=599?$http:null;
        if (end($events)['upstreamHttpStatus']!==$expected) { throw new RuntimeException('HTTP status not bounded'); }
    }
    echo "PASS actual PHP diagnostic upstream status is only integer 100..599 or null\n";
    $case=['scope'=>$scope,'attempt'=>$old,'user'=>42];
    foreach (['status','end','finish','start','execute-command'] as $operation) {
        [,,,$events]=$send($case,$operation,['intentTarget'=>$oldtarget]);
        if ($events!==[]) { throw new RuntimeException('non-command diagnostic emitted'); }
    }
    echo "PASS actual PHP diagnostics stay silent for all other operations\n";
} finally {
    proc_terminate($server);
    proc_close($server);
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST) as $path) {
        $path->isDir()?rmdir($path->getPathname()):unlink($path->getPathname());
    }
    rmdir($root);
}
