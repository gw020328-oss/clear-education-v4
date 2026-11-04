<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/** Pre-application Moodle login authority. Display leases cannot enter this registry. */
final class course_login_authority {
    public const VERSION = 'clear-moodle-login-intent.1';
    public const COMMAND_VERSION = 'clear-moodle-command.1';
    public const PATH = '/local/clearbridge/login_authority.php';
    private const BASE = ['version', 'requestRef', 'ownerRunId', 'moodleAuthorityRef', 'role', 'expiresAtExclusive'];

    public static function hex(mixed $value): bool {
        return is_string($value) && preg_match('/\A[a-f0-9]{64}\z/', $value) === 1;
    }

    public static function config(): array {
        global $CFG;
        $c = $CFG->local_clearbridge_login ?? null;
        course_authority_currentness::require_rule(course_read_client::exact_keys($c,
            ['enabled', 'origin', 'browserOrigin', 'ca', 'ownerRunId', 'key', 'proofKey', 'sessionKey', 'registry'])
            && $c['enabled'] === true && is_string($c['origin'])
            && preg_match('~\Ahttps://[a-z0-9.-]+(?::[1-9][0-9]{0,4})?\z~', $c['origin']) === 1
            && is_string($c['browserOrigin'])
            && preg_match('~\Ahttps://127\.0\.0\.1:[1-9][0-9]{0,4}\z~', $c['browserOrigin']) === 1
            && (int)parse_url($c['browserOrigin'], PHP_URL_PORT) <= 65535
            && is_string($c['ca']) && str_starts_with($c['ca'], '/') && is_readable($c['ca']) && is_file($c['ca'])
            && course_authority_currentness::ref($c['ownerRunId']) && is_string($c['registry']));
        $reverse = $CFG->local_clearbridge_authority_service ?? null;
        $keys = [$c['key'], $c['proofKey'], $c['sessionKey'], $reverse['key'] ?? null];
        course_authority_currentness::require_rule(count(array_filter($keys, self::hex(...))) === 4
            && count(array_unique($keys)) === 4 && ($reverse['enabled'] ?? false) === true
            && ($reverse['ownerRunId'] ?? null) === $c['ownerRunId']);
        return $c;
    }

    public static function scope(string $run): array {
        global $CFG, $DB;
        $row = $DB->get_record('config_plugins', ['plugin' => 'local_clearbridge', 'name' => 'loginscope'], 'value');
        course_authority_currentness::require_rule($row && strlen($row->value) <= 4096);
        $s = json_decode($row->value, true, 8, JSON_THROW_ON_ERROR);
        course_authority_currentness::require_rule(course_read_client::exact_keys($s, [
            'ownerRunId', 'installationRef', 'moodleOrigin', 'courseId', 'courseRef', 'subjectUserId',
            'subjectRef', 'participantActorRef', 'operatorUserId', 'operatorActorRef', 'expiresAtExclusive',
        ]) && $s['ownerRunId'] === $run && $s['moodleOrigin'] === $CFG->wwwroot);
        foreach (['courseId', 'subjectUserId', 'operatorUserId', 'expiresAtExclusive'] as $key) {
            course_authority_currentness::require_rule(course_authority_currentness::positive($s[$key]));
        }
        foreach (['installationRef', 'courseRef', 'subjectRef', 'participantActorRef', 'operatorActorRef'] as $key) {
            course_authority_currentness::require_rule(course_authority_currentness::ref($s[$key]));
        }
        course_authority_currentness::require_rule($s['subjectUserId'] !== $s['operatorUserId']
            && $s['participantActorRef'] !== $s['operatorActorRef']
            && $s['expiresAtExclusive'] > time() && course_refund::is_demo_course($s['courseId']));
        ksort($s);
        return $s;
    }

    public static function role(array $scope, int $course, int $user): string {
        course_authority_currentness::require_rule($course === $scope['courseId']
            && in_array($user, [$scope['subjectUserId'], $scope['operatorUserId']], true));
        return $user === $scope['subjectUserId'] ? 'PARTICIPANT' : 'COURSE_OPERATOR';
    }

    /** Canonical fingerprint of the complete, validated scalar scope. Kept inside Moodle. */
    public static function scope_digest(array $scope): string {
        ksort($scope, SORT_STRING);
        return hash('sha256', json_encode($scope, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
    }

    /** Opaque browser selector only; every use still requires the current original SESSION and scope. */
    public static function intent_target(array $config, array $scope, string $role, string $intent,
            string $sessionid): string {
        course_authority_currentness::require_rule(self::hex($config['sessionKey']) && self::hex($intent)
            && $sessionid !== '' && in_array($role, ['PARTICIPANT', 'COURSE_OPERATOR'], true)
            && $config['ownerRunId'] === $scope['ownerRunId']);
        return hash_hmac('sha256', implode("\n", ['CLEAR-MOODLE-LOGIN-INTENT-TARGET-1',
            $config['ownerRunId'], $role, self::scope_digest($scope), $intent, $sessionid]), $config['sessionKey']);
    }

    public static function attempt_intent(mixed $attempt, array $scope, string $role): ?string {
        if (!course_read_client::exact_keys($attempt, ['run', 'role', 'intent', 'scopeDigest'])
                || $attempt['run'] !== $scope['ownerRunId'] || $attempt['role'] !== $role
                || !self::hex($attempt['intent']) || !self::hex($attempt['scopeDigest'])
                || !hash_equals($attempt['scopeDigest'], self::scope_digest($scope))) {
            return null;
        }
        return $attempt['intent'];
    }

    public static function capability(string $role): string {
        return $role === 'PARTICIPANT' ? 'local/clearbridge:view' : 'local/clearbridge:configure';
    }

    public static function enable_page(\moodle_page $page, int $course, int $user, string $role): bool {
        try {
            $config = self::config();
            $scope = self::scope($config['ownerRunId']);
            if (self::role($scope, $course, $user) !== $role || is_siteadmin($user)) {
                return false;
            }
            $access = new course_moodle_access($course, $user, self::capability($role), true);
            if ($access->expires_at() === null) {
                return false;
            }
            $page->requires->js_call_amd('local_clearbridge/course_login', 'init', [$course, $config['browserOrigin'], sesskey()]);
            return true;
        } catch (\Throwable $error) {
            return false;
        }
    }

    public static function request_version(string $operation): string {
        course_authority_currentness::require_rule(in_array($operation,
            ['start', 'status', 'end', 'finish', 'authorize-command'], true));
        return $operation === 'authorize-command' ? self::COMMAND_VERSION : self::VERSION;
    }

    /** Registry lookup uses the exact common header; an operation digest still binds all command fields. */
    public static function base_shape(array $q): void {
        course_authority_currentness::require_rule(course_read_client::exact_keys($q, self::BASE)
            && in_array($q['version'], [self::VERSION, self::COMMAND_VERSION], true)
            && self::hex($q['requestRef']) && self::hex($q['moodleAuthorityRef'])
            && course_authority_currentness::ref($q['ownerRunId'])
            && in_array($q['role'], ['PARTICIPANT', 'COURSE_OPERATOR'], true)
            && course_authority_currentness::positive($q['expiresAtExclusive']));
    }

    public static function request_shape(string $operation, array $q): void {
        $version = self::request_version($operation);
        $tail = match ($operation) {
            'start' => [],
            'finish' => ['intentRef', 'handback', 'finishProof'],
            'authorize-command' => ['intentRef', 'commandHash'],
            default => ['intentRef'],
        };
        self::base_shape(array_intersect_key($q, array_flip(self::BASE)));
        course_authority_currentness::require_rule(course_read_client::exact_keys($q, array_merge(self::BASE, $tail))
            && $q['version'] === $version);
        foreach ($tail as $key) {
            course_authority_currentness::require_rule(self::hex($q[$key]));
        }
        course_authority_currentness::require_rule(!isset($q['intentRef']) || $q['intentRef'] !== $q['requestRef']);
    }

    public static function digest(string $operation, array $q): string {
        self::request_shape($operation, $q);
        ksort($q);
        return hash('sha256', json_encode(['operation' => $operation, 'request' => $q], JSON_THROW_ON_ERROR));
    }

    /** execute-command is reverse-only and reuses the original authorize DTO and digest. */
    public static function reverse_request_shape(string $operation, array $q): void {
        self::request_shape($operation === 'execute-command' ? 'authorize-command' : $operation, $q);
    }

    public static function record_shape(array $r): void {
        course_authority_currentness::require_rule(course_read_client::exact_keys($r, [
            'request', 'operation', 'digest', 'scope', 'courseId', 'actorUserId', 'subjectUserId',
            'sessionRowId', 'sessionCreatedAt', 'sessionBackend', 'startedMonotonic', 'startedWall',
        ]) && is_array($r['request']) && is_array($r['scope']) && self::hex($r['digest'])
            && in_array($r['operation'], ['start', 'status', 'end', 'finish', 'authorize-command'], true)
            && in_array($r['sessionBackend'], [\core\session\file::class, \core\session\database::class], true)
            && is_int($r['startedMonotonic']) && $r['startedMonotonic'] >= 0);
        self::base_shape($r['request']);
        course_authority_currentness::require_rule($r['request']['version'] === self::request_version($r['operation']));
        foreach (['courseId', 'actorUserId', 'subjectUserId', 'sessionRowId', 'sessionCreatedAt', 'startedWall'] as $key) {
            course_authority_currentness::require_rule(course_authority_currentness::positive($r[$key]));
        }
    }

    public static function capture(string $operation, array $q, array $scope, int $user, int $start, int $wall): array {
        global $DB;
        $access = new course_moodle_access($scope['courseId'], $user, self::capability($q['role']), true);
        course_authority_currentness::require_rule(($access->expires_at() ?? 0) >= $q['expiresAtExclusive']);
        $session = $DB->get_record('sessions', ['sid' => session_id(), 'userid' => $user], 'id,timecreated');
        course_authority_currentness::require_rule((bool)$session);
        $record = ['request' => array_intersect_key($q, array_flip(self::BASE)), 'operation' => $operation,
            'digest' => self::digest($operation, $q), 'scope' => $scope, 'courseId' => $scope['courseId'],
            'actorUserId' => $user, 'subjectUserId' => $scope['subjectUserId'], 'sessionRowId' => (int)$session->id,
            'sessionCreatedAt' => (int)$session->timecreated, 'sessionBackend' => ltrim(\core\session\manager::get_handler_class(), '\\'),
            'startedMonotonic' => $start, 'startedWall' => $wall];
        self::record_shape($record);
        self::horizon($record);
        return $record;
    }

    private static function fence(array $record): void {
        $wall = time();
        $mono = hrtime(true);
        course_authority_currentness::require_rule($wall >= $record['startedWall']
            && $wall < $record['request']['expiresAtExclusive'] && $mono >= $record['startedMonotonic']
            && $mono - $record['startedMonotonic'] < 5_000_000_000);
    }

    /** The long session horizon is separate from the short operation lease. */
    private static function horizon(array $record): int {
        global $CFG, $DB;
        $q = $record['request'];
        $scope = self::scope($q['ownerRunId']);
        course_authority_currentness::require_rule($scope === $record['scope']
            && self::role($scope, $record['courseId'], $record['actorUserId']) === $q['role']
            && $record['subjectUserId'] === $scope['subjectUserId']
            && course_authority_currentness::verify_database($record, true));
        $row = $DB->get_record('sessions', ['id' => $record['sessionRowId'], 'userid' => $record['actorUserId']],
            'sid,timecreated,timemodified');
        course_authority_currentness::require_rule($row && (int)$row->timecreated === $record['sessionCreatedAt']
            && \core\session\manager::session_exists($row->sid));
        $horizon = min($scope['expiresAtExclusive'], (int)$row->timemodified + (int)$CFG->sessiontimeout);
        foreach (array_unique([$record['actorUserId'], $record['subjectUserId']]) as $user) {
            $end = enrol_get_enrolment_end($scope['courseId'], $user);
            course_authority_currentness::require_rule($end !== false);
            if ($end > 0) {
                $horizon = min($horizon, $end);
            }
        }
        course_authority_currentness::require_rule($horizon >= $q['expiresAtExclusive'] && self::scope($q['ownerRunId']) === $scope);
        self::fence($record);
        return $horizon;
    }

    public static function check_origin(array $record): void {
        global $DB;
        $row = $DB->get_record('sessions', ['sid' => session_id(), 'userid' => $record['actorUserId']], 'id,timecreated');
        course_authority_currentness::require_rule(session_status() === PHP_SESSION_ACTIVE && $row
            && (int)$row->id === $record['sessionRowId'] && (int)$row->timecreated === $record['sessionCreatedAt']);
        self::horizon($record);
    }

    public static function respond(string $operation, array $q, array $config, course_authority_registry $registry): array {
        $execute = $operation === 'execute-command';
        $publishedoperation = $execute ? 'authorize-command' : $operation;
        $digest = self::digest($publishedoperation, $q);
        $base = array_intersect_key($q, array_flip(self::BASE));
        // take_command commits removal before any currentness check can throw.
        $record = $execute ? $registry->take_command($q) : $registry->lookup($base);
        course_authority_currentness::require_rule($record !== null && $record['operation'] === $publishedoperation
            && hash_equals($record['digest'], $digest));
        $horizon = self::horizon($record);
        if (!$execute) {
            course_authority_currentness::require_rule($registry->lookup($base) === $record);
        }
        $horizon = min($horizon, self::horizon($record));
        if (!$execute) {
            course_authority_currentness::require_rule($registry->lookup($base) === $record);
        }
        $scope = $record['scope'];
        $actor = $q['role'] === 'PARTICIPANT' ? $scope['participantActorRef'] : $scope['operatorActorRef'];
        $sessionref = hash_hmac('sha256', implode("\n", ['CLEAR-MOODLE-LOGIN-SESSION-REF-1', $q['ownerRunId'],
            $scope['installationRef'], $scope['courseRef'], $scope['subjectRef'], $actor, $q['role'],
            $record['sessionRowId'], $record['sessionCreatedAt'], $record['sessionBackend'],
            self::scope_digest($scope)]), $config['sessionKey']);
        if ($execute) {
            $horizon = min($horizon, self::horizon($record), $q['expiresAtExclusive']);
        }
        self::fence($record);
        return ['ownerRunId' => $q['ownerRunId'], 'role' => $q['role'], 'installationRef' => $scope['installationRef'],
            'courseRef' => $scope['courseRef'], 'subjectRef' => $scope['subjectRef'], 'actorRef' => $actor,
            'sessionRef' => $sessionref, 'expiresAtExclusive' => $horizon];
    }
}
