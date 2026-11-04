<?php
// Models Moodle identity and clock while exercising the real private registry and login wire checks.
namespace local_clearbridge {
    function fsync($stream): bool {
        $ok = \fsync($stream);
        if (isset($GLOBALS['login_flush_hook'])) {
            ($GLOBALS['login_flush_hook'])();
        }
        return $ok;
    }
}
namespace {
    define('CLEAR_AUTHORITY_BRIDGE_LIBRARY_ONLY', true);
    require __DIR__ . '/course_authority_bridge_test.php';
    foreach (['course_login_authority', 'course_login_client'] as $file) {
        require __DIR__ . '/../local_clearbridge/classes/' . $file . '.php';
    }
    use local_clearbridge\course_authority_registry as Registry;
    use local_clearbridge\course_login_authority as Login;
    use local_clearbridge\course_login_client as Client;

    function login_record(string $operation = 'start', string $role = 'PARTICIPANT'): array {
        reset_bridge();
        unset($GLOBALS['CFG']->session_handler_class);
        $GLOBALS['CFG']->wwwroot = 'http://moodle.test';
        $GLOBALS['f']['fixedscope'] = ['ownerRunId' => 'run-1', 'installationRef' => 'install-1',
            'moodleOrigin' => 'http://moodle.test', 'courseId' => 7, 'courseRef' => 'course-1',
            'subjectUserId' => 42, 'subjectRef' => 'student-1', 'participantActorRef' => 'student-1',
            'operatorUserId' => 43, 'operatorActorRef' => 'teacher-1', 'expiresAtExclusive' => 2000000300];
        $GLOBALS['DB'] = new class($GLOBALS['DB']) {
            public function __construct(private readonly object $inner) {}
            public function get_record($table, $where, $fields) {
                $record = $this->inner->get_record($table, $where, $fields);
                if ($table === 'sessions' && $record && str_starts_with($fields, 'sid,')) {
                    $record->sid = 'synthetic-sid-never-export';
                }
                return $record;
            }
            public function __call($method, $args) {
                return $this->inner->$method(...$args);
            }
        };
        $actor = $role === 'PARTICIPANT' ? 42 : 43;
        $GLOBALS['USER']->id = $actor;
        $q = ['version' => Login::VERSION, 'requestRef' => str_repeat('1', 64), 'ownerRunId' => 'run-1',
            'moodleAuthorityRef' => str_repeat('2', 64), 'role' => $role, 'expiresAtExclusive' => 2000000005];
        if ($operation !== 'start') {
            $q['intentRef'] = str_repeat('3', 64);
        }
        if ($operation === 'finish') {
            $q += ['handback' => str_repeat('4', 64), 'finishProof' => str_repeat('5', 64)];
        }
        $record = Login::capture($operation, $q, Login::scope('run-1'), $actor, 10000000000, 2000000000);
        return [$q, $record];
    }

    $proof = Client::proofs(str_repeat('ab', 32), 'fixture-run', str_repeat('11', 32),
        str_repeat('22', 32), str_repeat('33', 32));
    expect($proof === ['browserProof' => 'da639afbb788b1f9bc2db5fa0c5afa6fa251282213be4d763be286c07b0cb8ca',
        'finishProof' => 'fe20a18a839aa91169577488c303c676fd6361a72cdd8bb881544ce11946323b'], 'PHP/Node vectors');
    echo "PASS agreed browser and finish HMAC vectors\n";

    [$unused, $path] = new_registry();
    $registry = new Registry($path, 'run-1', true);
    $config = ['sessionKey' => str_repeat('c', 64)];
    try {
        [$q, $r] = login_record('finish');
        rejected(fn() => $registry->publish($r)); // Old registry version.
        file_put_contents($path, json_encode(['version' => 'clear-moodle-login-registry.1', 'ownerRunId' => 'run-1',
            'wallFloor' => 0, 'leases' => [], 'nonces' => []]));
        $registry->publish($r);
        $raw = file_get_contents($path);
        foreach (['synthetic-sid-never-export', $q['handback'], $q['finishProof'], $q['intentRef']] as $secret) {
            expect(!str_contains($raw, $secret), 'no browser material in registry');
        }
        $answer = Login::respond('finish', $q, $config, $registry);
        expect(count($answer) === 8 && $answer['role'] === 'PARTICIPANT' && $answer['expiresAtExclusive'] === 2000000300
            && Login::hex($answer['sessionRef']), 'exact8 and distinct horizon');
        $reordered = array_reverse($q, true);
        expect(Login::respond('finish', $reordered, $config, $registry) === $answer, 'canonical request');
        $bad = $q;
        $bad['finishProof'] = str_repeat('6', 64);
        rejected(fn() => Login::respond('finish', $bad, $config, $registry));
        $bad = array_diff_key($q, ['handback' => true, 'finishProof' => true]);
        rejected(fn() => Login::respond('status', $bad, $config, $registry));
        rejected(fn() => (new Registry($path, 'run-1'))->lookup($r['request']));
        echo "PASS separate registry, exact operation digest, private proof and exact8 session horizon\n";

        foreach (['sessionexists' => false, 'session' => 32, 'enrol' => false, 'capability' => false] as $key => $value) {
            [$q, $r] = login_record('finish');
            $GLOBALS['f'][$key] = $value;
            rejected(fn() => Login::respond('finish', $q, $config, $registry));
        }
        echo "PASS missing file session, rotated row, enrollment and role revocation reject\n";

        [$q, $r] = login_record('finish');
        $flushes = 0;
        $GLOBALS['login_flush_hook'] = static function () use (&$flushes): void {
            if (++$flushes === 3) {
                $GLOBALS['f']['mono'] = 15000000000;
            }
        };
        rejected(fn() => Login::respond('finish', $q, $config, $registry));
        unset($GLOBALS['login_flush_hook']);
        echo "PASS final registry delay at exactly five seconds rejects\n";
        $registry->revoke($q['moodleAuthorityRef'], $q['expiresAtExclusive']);
        rejected(fn() => Login::respond('finish', $q, $config, $registry));

        [$q, $r] = login_record('status', 'COURSE_OPERATOR');
        $registry->publish($r);
        $teacher = Login::respond('status', $q, $config, $registry);
        expect($teacher['actorRef'] === 'teacher-1' && $teacher['subjectRef'] === 'student-1'
            && $teacher['sessionRef'] !== $answer['sessionRef'], 'distinct operator authority');
        echo "PASS teacher role and subject isolation\n";
    } finally {
        unset($GLOBALS['login_flush_hook']);
        cleanup_registry($path);
    }
}
