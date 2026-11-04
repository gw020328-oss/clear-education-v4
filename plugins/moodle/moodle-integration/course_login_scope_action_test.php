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
        public function __construct(...$args) {}
        public static function proofs(...$args) { return ['browserProof' => str_repeat('b',64), 'finishProof' => str_repeat('f',64)]; }
        public function request($operation, $fields = []) {
            $GLOBALS['calls'][] = ['operation' => $operation, 'fields' => $fields];
            return match ($operation) {
                'start' => ['requestRef' => str_repeat('9',64), 'launchCode' => str_repeat('8',64), 'expiresAtExclusive' => time()+120],
                'status' => ['status' => 'RETURN_REQUIRED', 'handback' => str_repeat('7',64)],
                'finish' => ['status' => 'CONNECTED'],
                'end' => ['status' => 'UNAVAILABLE'],
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
    function require_capability(...$args) {}
    function is_enrolled(...$args) { return true; }
    function is_siteadmin() { return false; }
}
namespace core\session {
    class manager { public static function is_loggedinas() { return false; } }
}
BOOT;
$bootstrap = str_replace('CLASS_ROOT', var_export($classes, true), $bootstrap);
file_put_contents($root . '/config.php', $bootstrap);
$server = proc_open([PHP_BINARY, '-S', '127.0.0.1:18891', '-t', $root],
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
    foreach (['same'=>[], 'subject'=>['subjectUserId'=>44], 'operator'=>['operatorUserId'=>44],
            'course'=>['courseId'=>8], 'legacy'=>[]] as $label=>$change) {
        $role=$label==='operator'?'PARTICIPANT':'COURSE_OPERATOR';
        $attempt=['run'=>'run-1','role'=>$role,'intent'=>str_repeat('1',64),'scopeDigest'=>$digest];
        if ($label==='legacy') { unset($attempt['scopeDigest']); }
        foreach (['status','finish','end','start'] as $operation) {
            $current=array_replace($scope,$change);
            file_put_contents($root.'/case.json',json_encode(['scope'=>$current,'attempt'=>$attempt,
                'user'=>$role==='PARTICIPANT'?42:43]));
            $body=['id'=>(string)$current['courseId'],'sesskey'=>'fixture','operation'=>$operation];
            if ($operation==='start') { $body['challenge']=str_repeat('2',64); }
            if ($operation==='finish') { $body['finishProof']=str_repeat('3',64); }
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
                }
            }
        }
        echo "PASS actual PHP dispatch $label scope across status/finish/end/start\n";
    }
} finally {
    proc_terminate($server);
    proc_close($server);
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST) as $path) {
        $path->isDir()?rmdir($path->getPathname()):unlink($path->getPathname());
    }
    rmdir($root);
}
