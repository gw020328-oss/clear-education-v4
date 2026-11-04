<?php
// CLI-only modeled Moodle/transport dependencies. No bootstrap, DB, cookie or socket.
namespace core\session {
    class database {}
    class file {}
    class manager {
        public static function is_loggedinas(): bool { return $GLOBALS['f']['impersonation']; }
        public static function get_handler_class(): string { return $GLOBALS['CFG']->session_handler_class ?? file::class; }
        public static function session_exists($sid): bool { return $GLOBALS['f']['sessionexists'] ?? true; }
    }
}
namespace {
    define('MOODLE_INTERNAL', true);
    define('IGNORE_MISSING', 0);
    class context_course {
        public static function instance($id, $strictness) { return $id === 7 ? (object)['id' => 9] : false; }
    }
}
namespace local_clearbridge {
    function time() { return $GLOBALS['f']['wall']; }
    function hrtime($asnumber) { return $GLOBALS['f']['mono']; }
    function session_id() { return 'synthetic-sid-never-export'; }
    function session_status() { return PHP_SESSION_ACTIVE; }
    function isloggedin() { return $GLOBALS['f']['loggedin']; }
    function isguestuser() { return false; }
    function enrol_get_enrolment_end($course, $user) { return $GLOBALS['f']['enrol']; }
    function reload_all_capabilities() { $GLOBALS['f']['fresh']++; }
    function has_capability($capability, $context, $user) {
        $GLOBALS['f']['checkedcapability'] = $capability;
        return $GLOBALS['f']['capability'];
    }
    function get_role_definitions($roles) { return ['cap' => 1]; }
    function get_role_definitions_uncached($roles) { return ['cap' => $GLOBALS['f']['definition']]; }
    // Transport shim isolates only page lease lifecycle. It is not TLS testing.
    function curl_init($url) { return new \stdClass(); }
    function curl_setopt_array($handle, $options) { $handle->options = $options; return true; }
    function curl_exec($handle) {
        $request = json_decode($handle->options[CURLOPT_POSTFIELDS], true);
        $GLOBALS['f']['lastRequest'] = $request;
        ($GLOBALS['f']['owner'])();
        if ($GLOBALS['f']['transportfail']) { return false; }
        $reply = ['version' => 'clear-moodle-course-read-response.1', 'requestRef' => $request['requestRef'],
            'ownerRunId' => $request['ownerRunId'], 'role' => $request['role'], 'status' => 'OK',
            'expiresAtExclusive' => $request['expiresAtExclusive'], 'evidence' => ['fixture' => true],
            'payment' => ['version' => $GLOBALS['f']['paymentversion'] ?? 'clear-moodle-payment-status.1',
                'requestRef' => $request['requestRef'], 'expiresAtExclusive' => $request['expiresAtExclusive']]];
        $raw = json_encode($reply);
        ($handle->options[CURLOPT_WRITEFUNCTION])($handle, $raw);
        return true;
    }
    function curl_getinfo($handle, $option) { return $option === CURLINFO_RESPONSE_CODE ? 200 : 'application/json'; }
    function curl_close($handle) {}
    class course_refund {
        public static function is_demo_course($id) { return $id === 7; }
        public static function template_data($student, $evidence = null) { return ['hasrecords' => $evidence !== null]; }
    }
    class course_payment_display { public static function data(...$args) { return ['fixture' => true]; } }
}
namespace {
    foreach (['course_moodle_access', 'course_read_client', 'course_authority_lease', 'course_projection', 'course_projection_page'] as $file) {
        require __DIR__ . '/../local_clearbridge/classes/' . $file . '.php';
    }
    use local_clearbridge\course_authority_lease as Lease;
    function reset_fixture(): void {
        $GLOBALS['f'] = ['wall' => 2000000000, 'mono' => 10000000000, 'epoch' => 11, 'generation' => 'restore-1',
            'loggedin' => true, 'impersonation' => false, 'session' => 31, 'user' => true, 'enrol' => 0,
            'capability' => true, 'definition' => 1, 'fresh' => 0, 'transportfail' => false, 'owner' => static function () {}];
        $GLOBALS['CFG'] = (object)['version' => 2024100715.0, 'session_handler_class' => '\\core\\session\\database', 'sessiontimeout' => 3600];
        $GLOBALS['USER'] = (object)['id' => 42, 'access' => ['ra' => [9 => [5 => 5]]]];
        $GLOBALS['DB'] = new class {
            public function get_record($table, $where, $fields) {
                return $GLOBALS['f']['session'] ? (object)['id' => $GLOBALS['f']['session'], 'timecreated' => 1999999000,
                    'timemodified' => 2000000000] : false;
            }
            public function record_exists($table, $where) { return $GLOBALS['f']['user']; }
        };
    }
    function generation(): array { return ['installationGeneration' => $GLOBALS['f']['generation'], 'authorityEpoch' => $GLOBALS['f']['epoch']]; }
    function binding(): array { return ['installationRef' => 'install-1', 'ownerRunId' => 'run-1', 'courseRef' => 'course-1',
        'subjectRef' => 'subject-1', 'actorRef' => 'actor-1', 'expiresAtExclusive' => 2000000100]; }
    function issue(string $role = 'PARTICIPANT'): ?Lease { return Lease::issue(7, 42, $role, binding(), \Closure::fromCallable('generation')); }
    function query(Lease $lease): array {
        return ['version' => 'clear-moodle-course-read-request.1', 'requestRef' => str_repeat('a', 64), 'ownerRunId' => 'run-1',
            'moodleAuthorityRef' => $lease->grant()['moodleAuthorityRef'], 'role' => 'PARTICIPANT', 'expiresAtExclusive' => 2000000005];
    }
    function expect($ok, $label): void { if (!$ok) { throw new \RuntimeException($label); } }
    function test($label, $body): void {
        if (defined('CLEAR_AUTHORITY_TEST_LIBRARY_ONLY')) { return; }
        reset_fixture(); $body(); echo "PASS $label\n";
    }
    test('exact grant and repeated authenticated-request checks call fresh access', function () {
        $lease = issue(); $grant = $lease->grant(); $q = query($lease); $before = $GLOBALS['f']['fresh'];
        $a = $lease->check($q); $b = $lease->check(array_reverse($q, true));
        expect(count($grant) === 2 && preg_match('/^[a-f0-9]{64}$/', $grant['moodleAuthorityRef']) && $a === $b
            && count($a) === 13 && $GLOBALS['f']['fresh'] === $before + 2, 'exact and fresh');
        expect(!str_contains(json_encode([$grant, $a]), 'synthetic-sid') && !str_contains(json_encode($a), 'session'), 'no session export');
        expect(issue()->grant()['moodleAuthorityRef'] !== $grant['moodleAuthorityRef'], 'random ref');
    });
    test('missing invalid and throwing generation sources fail closed', function () {
        foreach ([null, [], ['installationGeneration' => 'r', 'authorityEpoch' => 0],
            ['installationGeneration' => 'r', 'authorityEpoch' => '11'],
            ['installationGeneration' => 'r', 'authorityEpoch' => 9007199254740992]] as $value) {
            expect(Lease::issue(7, 42, 'PARTICIPANT', binding(), static fn() => $value) === null, 'invalid epoch');
        }
        expect(Lease::issue(7, 42, 'PARTICIPANT', binding(), static function () { throw new \RuntimeException('PRIVATE'); }) === null, 'throw');
    });
    test('epoch movement during issue prevents publication', function () {
        expect(Lease::issue(7, 42, 'PARTICIPANT', binding(), static function () {
            $GLOBALS['f']['epoch']++; return generation();
        }) === null, 'issue race');
    });
    test('unsupported version backend login-as role switch and wrong principal reject issue', function () {
        $mutations = [static function () { $GLOBALS['CFG']->version++; }, static function () { $GLOBALS['CFG']->session_handler_class = 'files'; },
            static function () { $GLOBALS['f']['impersonation'] = true; }, static function () { $GLOBALS['USER']->access['rsw'] = [1]; },
            static function () { $GLOBALS['USER']->id++; }, static function () { $GLOBALS['f']['user'] = false; }];
        foreach ($mutations as $mutate) { reset_fixture(); $mutate(); expect(issue() === null, 'unsupported auth'); }
    });
    test('wrong page course principal role and run cannot borrow a grant', function () {
        foreach ([[8,42,'PARTICIPANT','run-1'],[7,43,'PARTICIPANT','run-1'],[7,42,'COURSE_OPERATOR','run-1'],[7,42,'PARTICIPANT','run-2']] as $args) {
            $lease = issue(); expect($lease->grant_for(...$args) === null && $lease->grant() === null, 'wrong page');
        }
    });
    test('teacher binds a distinct actor and checked configure capability', function () {
        $lease = issue('COURSE_OPERATOR'); $q = query($lease); $q['role'] = 'COURSE_OPERATOR';
        $result = $lease->check($q); expect($result['actorRef'] !== $result['subjectRef'], 'actor distinct');
        expect($GLOBALS['f']['checkedcapability'] === 'local/clearbridge:configure', 'teacher capability');
        $GLOBALS['f']['capability'] = false; expect($lease->check($q) === null, 'teacher revoke');
    });
    test('wrong wire fields and added cookie field reject and revoke', function () {
        foreach (['version','ownerRunId','moodleAuthorityRef','role','requestRef','cookie'] as $field) {
            $lease = issue(); $q = query($lease); $q[$field] = 'wrong';
            expect($lease->check($q) === null && $lease->grant() === null, 'bad shape');
        }
    });
    test('request reference and deadline cannot be rebound', function () {
        foreach (['requestRef','expiresAtExclusive'] as $field) {
            $lease = issue(); $q = query($lease); expect($lease->check($q) !== null, 'first');
            $q[$field] = $field === 'requestRef' ? str_repeat('b',64) : 2000000004;
            expect($lease->check($q) === null && !$lease->is_current(), 'rebind');
        }
    });
    test('numeric-looking hex references are distinct and revoke on rebinding', function () {
        $lease = issue(); $q = query($lease); $q['requestRef'] = '0e' . str_repeat('1', 62);
        expect($lease->check($q) !== null && $lease->check(array_reverse($q, true)) !== null, 'same reordered request');
        $q['requestRef'] = '0e' . str_repeat('2', 62);
        expect($lease->check($q) === null && !$lease->is_current() && $lease->grant() === null, 'strict reference and revoke');
    });
    test('session generation replacement and deletion are observed', function () {
        foreach ([32, 0] as $id) { reset_fixture(); $lease = issue(); $GLOBALS['f']['session'] = $id;
            expect(!$lease->is_current(), 'session change'); $GLOBALS['f']['session'] = 31; expect(!$lease->is_current(), 'permanent'); }
    });
    test('account enrolment role and uncached definition revocation are observed', function () {
        foreach (['user' => false, 'enrol' => false, 'capability' => false, 'definition' => -1] as $key => $value) {
            reset_fixture(); $lease = issue(); $GLOBALS['f'][$key] = $value; expect(!$lease->is_current(), 'access changed');
        }
    });
    test('revoke-restore with same final access still fails on durable epoch change', function () {
        $lease = issue(); $GLOBALS['f']['enrol'] = false; $GLOBALS['f']['epoch']++;
        $GLOBALS['f']['enrol'] = 0; $GLOBALS['f']['epoch']++; expect(!$lease->is_current(), 'ABA');
    });
    test('epoch rollback and installation restore generation fail closed', function () {
        $lease = issue(); $GLOBALS['f']['epoch']--; expect(!$lease->is_current(), 'epoch rollback');
        reset_fixture(); $lease = issue(); $GLOBALS['f']['generation'] = 'restore-2'; expect(!$lease->is_current(), 'restore');
    });
    test('exclusive wall deadline monotonic deadline and clock rollback reject', function () {
        foreach ([['wall',2000000005],['mono',15000000000],['wall',1999999999],['mono',9999999999]] as [$key,$value]) {
            reset_fixture(); $lease = issue(); $GLOBALS['f'][$key] = $value; expect(!$lease->is_current(), 'clock');
        }
        reset_fixture(); $lease = issue(); $GLOBALS['f']['mono']++; expect($lease->is_current(), 'advance');
        $GLOBALS['f']['mono']--; expect(!$lease->is_current(), 'mono regression after read');
    });
    test('shorter request deadline and expiring callback cannot extend lease', function () {
        $lease = issue(); $q = query($lease); $q['expiresAtExclusive'] = 2000000001;
        expect($lease->check($q) !== null, 'short request'); $GLOBALS['f']['wall']++; expect(!$lease->is_current(), 'request expiry');
        reset_fixture(); $calls = 0;
        $lease = Lease::issue(7,42,'PARTICIPANT',binding(), static function () use (&$calls) {
            if (++$calls === 6) { $GLOBALS['f']['wall'] = 2000000005; } return generation();
        });
        expect($lease !== null && !$lease->is_current(), 'expiry inside callback');
    });
    test('explicit revocation and serialization prevent reuse', function () {
        $lease = issue(); $thrown = false; try { serialize($lease); } catch (\LogicException $e) { $thrown = true; }
        expect($thrown && $lease->__debugInfo() === ['revoked' => false], 'serialization');
        $lease->revoke(); expect($lease->grant() === null && !$lease->is_current(), 'revoke');
    });
    test('generation movement during fresh verification revokes the issued lease', function () {
        $change = false; $reads = 0;
        $lease = Lease::issue(7,42,'PARTICIPANT',binding(), static function () use (&$change, &$reads) {
            if ($change && ++$reads === 2) { $GLOBALS['f']['epoch']++; }
            return generation();
        });
        $change = true; expect(!$lease->is_current() && $lease->grant() === null, 'verification race');
    });
    test('binding and local deadlines cap issuance and cannot extend', function () {
        $b = binding(); $b['expiresAtExclusive'] = 2000000003;
        $GLOBALS['f']['enrol'] = 2000000002;
        $lease = Lease::issue(7,42,'PARTICIPANT',$b,\Closure::fromCallable('generation'));
        expect($lease->grant()['expiresAtExclusive'] === 2000000002, 'minimum deadline');
        $GLOBALS['f']['enrol'] = 0;
        expect($lease->grant()['expiresAtExclusive'] === 2000000002, 'no extension');
        $q = query($lease); expect($lease->check($q) === null, 'wire deadline exceeds grant');
    });
    function page_fixture($owner, bool $fail = false): array {
        $lease = issue();
        $GLOBALS['CFG']->local_clearbridge_course_read = ['enabled' => true, 'origin' => 'https://fixture.invalid',
            'ca' => __FILE__, 'ownerRunId' => 'run-1', 'key' => str_repeat('d',64), 'synthetic' => true];
        $GLOBALS['CFG']->local_clearbridge_course_authority = static fn() => $lease;
        $GLOBALS['f']['owner'] = $owner; $GLOBALS['f']['transportfail'] = $fail;
        $view = \local_clearbridge\course_projection_page::data((object)['id' => 7], true);
        expect(!$lease->is_current(), 'page finally revokes'); return $view;
    }
    test('page consumes local lease and revokes it after successful display', function () {
        expect(page_fixture(static function () {})['hasrecords'], 'success');
    });
    test('page suppresses response after in-flight epoch change with unchanged final access', function () {
        expect(!page_fixture(static function () { $GLOBALS['f']['epoch'] += 2; })['hasrecords'], 'page ABA');
    });
    test('page revokes lease after owner failure and exception', function () {
        expect(!page_fixture(static function () {}, true)['hasrecords'], 'transport fail');
        reset_fixture(); expect(!page_fixture(static function () { throw new \RuntimeException('PRIVATE'); })['hasrecords'], 'throw');
    });
}
