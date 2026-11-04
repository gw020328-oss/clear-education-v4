<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/** Cookie-free, pinned Moodle 4.5.15 authority reader and service handler. */
final class course_authority_currentness {
    public const PATH = '/local/clearbridge/authority.php';
    public const DOMAIN = 'CLEAR-MOODLE-AUTHORITY-A-TO-C-1';

    /** Generation receives private scope; both closures are approved server sources. */
    public function __construct(private readonly \Closure $generation, private readonly \Closure $mapping) {
    }

    public static function ref(mixed $value): bool {
        return is_string($value) && (bool)preg_match('/\A[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\z/', $value);
    }

    public static function positive(mixed $value): bool {
        return is_int($value) && $value > 0 && $value <= 9007199254740991;
    }

    public static function require_rule(bool $ok): void {
        if (!$ok) {
            throw new \RuntimeException('Authority unavailable');
        }
    }

    public static function request_shape(array $q): void {
        self::require_rule(course_read_client::exact_keys($q,
            ['version', 'requestRef', 'ownerRunId', 'moodleAuthorityRef', 'role', 'expiresAtExclusive']));
        self::require_rule($q['version'] === 'clear-moodle-course-read-request.1' && self::ref($q['ownerRunId'])
            && is_string($q['requestRef']) && preg_match('/\A[a-f0-9]{64}\z/', $q['requestRef']) === 1
            && is_string($q['moodleAuthorityRef']) && preg_match('/\A[a-f0-9]{64}\z/', $q['moodleAuthorityRef']) === 1
            && in_array($q['role'], ['PARTICIPANT', 'COURSE_OPERATOR'], true) && self::positive($q['expiresAtExclusive']));
    }

    public static function record_shape(array $r): void {
        self::require_rule(course_read_client::exact_keys($r, ['request', 'binding', 'generation', 'courseId',
            'actorUserId', 'subjectUserId', 'sessionRowId', 'sessionCreatedAt', 'startedMonotonic']));
        self::require_rule(is_array($r['request']) && is_array($r['binding']) && is_array($r['generation']));
        self::request_shape($r['request']);
        self::require_rule(course_read_client::exact_keys($r['binding'],
            ['installationRef', 'ownerRunId', 'courseRef', 'subjectRef', 'actorRef', 'expiresAtExclusive'])
            && course_read_client::exact_keys($r['generation'], ['installationGeneration', 'authorityEpoch']));
        foreach (['installationRef', 'ownerRunId', 'courseRef', 'subjectRef', 'actorRef'] as $field) {
            self::require_rule(self::ref($r['binding'][$field]));
        }
        foreach (['courseId', 'actorUserId', 'subjectUserId', 'sessionRowId', 'sessionCreatedAt'] as $field) {
            self::require_rule(self::positive($r[$field]));
        }
        self::require_rule(is_int($r['startedMonotonic']) && $r['startedMonotonic'] >= 0);
        self::require_rule(self::positive($r['binding']['expiresAtExclusive'])
            && self::ref($r['generation']['installationGeneration']) && self::positive($r['generation']['authorityEpoch'])
            && $r['binding']['ownerRunId'] === $r['request']['ownerRunId']
            && $r['request']['expiresAtExclusive'] <= $r['binding']['expiresAtExclusive']
            && ($r['request']['role'] !== 'PARTICIPANT' || $r['actorUserId'] === $r['subjectUserId']));
    }

    private function mapped(array $binding, int $course, int $actor, string $role): array {
        $m = ($this->mapping)($binding, $role);
        self::require_rule(course_read_client::exact_keys($m, ['binding', 'courseId', 'actorUserId', 'subjectUserId'])
            && course_read_client::exact_keys($m['binding'], array_keys($binding)) && $m['courseId'] === $course
            && $m['actorUserId'] === $actor && self::positive($m['subjectUserId']));
        foreach ($binding as $field => $value) {
            self::require_rule($m['binding'][$field] === $value);
        }
        return ['binding' => $binding, 'courseId' => $course, 'actorUserId' => $actor, 'subjectUserId' => $m['subjectUserId']];
    }

    private function same_generation(array $record): bool {
        $expected = $record['generation'];
        $scope = ['installationRef' => $record['binding']['installationRef'], 'ownerRunId' => $record['request']['ownerRunId']];
        foreach (['courseId', 'actorUserId', 'subjectUserId', 'sessionRowId', 'sessionCreatedAt'] as $field) {
            $scope[$field] = $record[$field];
        }
        $actual = ($this->generation)($scope);
        return course_read_client::exact_keys($actual, ['installationGeneration', 'authorityEpoch'])
            && $actual['installationGeneration'] === $expected['installationGeneration']
            && $actual['authorityEpoch'] === $expected['authorityEpoch'];
    }

    private function config_current(): bool {
        global $CFG, $DB;
        // Core helpers consult CFG loaded at bootstrap. Do not accept a newer
        // DB epoch with stale default-role/admin/idle settings in that snapshot.
        foreach (['siteadmins', 'siteguest', 'defaultuserroleid', 'defaultfrontpageroleid', 'sessiontimeout'] as $name) {
            $row = $DB->get_record('config', ['name' => $name], 'value');
            if ($row ? (string)$row->value !== (string)($CFG->$name ?? '') : !empty($CFG->$name)) {
                return false;
            }
        }
        return true;
    }

    /** Called only in the original authenticated page, before C starts its HTTP read. */
    public function capture(array $request, array $binding, array $generation, int $course, int $actor, int $started): array {
        global $DB;
        $access = new course_moodle_access($course, $actor,
            $request['role'] === 'PARTICIPANT' ? 'local/clearbridge:view' : 'local/clearbridge:configure');
        self::require_rule(($access->expires_at() ?? 0) >= $request['expiresAtExclusive']);
        $session = $DB->get_record('sessions', ['sid' => session_id(), 'userid' => $actor], 'id,timecreated');
        self::require_rule((bool)$session);
        $mapped = $this->mapped($binding, $course, $actor, $request['role']);
        $record = ['request' => $request, 'binding' => $binding, 'generation' => $generation,
            'courseId' => $course, 'actorUserId' => $actor, 'subjectUserId' => $mapped['subjectUserId'],
            'sessionRowId' => (int)$session->id, 'sessionCreatedAt' => (int)$session->timecreated, 'startedMonotonic' => $started];
        self::record_shape($record);
        self::require_rule($this->verify($record));
        return $record;
    }

    /** No session start, USER replacement, sessdata read or SID/token lookup. */
    public function verify(array $record): bool {
        global $CFG, $DB;
        try {
            self::record_shape($record);
            $q = $record['request'];
            $now = time();
            self::require_rule((float)($CFG->version ?? 0) === 2024100715.0
                && !$DB->is_transaction_started()
                && $this->config_current()
                && ltrim((string)($CFG->session_handler_class ?? ''), '\\') === \core\session\database::class
                && $now < $q['expiresAtExclusive'] && hrtime(true) >= $record['startedMonotonic']
                && hrtime(true) - $record['startedMonotonic'] < 5_000_000_000
                && $this->same_generation($record));
            $m = $this->mapped($record['binding'], $record['courseId'], $record['actorUserId'], $q['role']);
            self::require_rule($m['subjectUserId'] === $record['subjectUserId']);
            $session = $DB->get_record('sessions', ['id' => $record['sessionRowId'], 'userid' => $record['actorUserId']],
                'id,timecreated,timemodified');
            self::require_rule($session && (int)$session->timecreated === $record['sessionCreatedAt']
                && (int)$session->timemodified + (int)$CFG->sessiontimeout >= $q['expiresAtExclusive']);
            foreach (array_unique([$record['actorUserId'], $record['subjectUserId']]) as $user) {
                self::require_rule($DB->record_exists('user', ['id' => $user, 'auth' => 'manual', 'confirmed' => 1,
                    'deleted' => 0, 'suspended' => 0]) && !isguestuser($user) && !is_siteadmin($user));
                $end = enrol_get_enrolment_end($record['courseId'], $user);
                self::require_rule($end !== false && ($end === 0 || $end >= $q['expiresAtExclusive']));
            }
            $course = $DB->get_record('course', ['id' => $record['courseId'], 'visible' => 1], 'id,category');
            self::require_rule((bool)$course);
            $category = $DB->get_record('course_categories', ['id' => $course->category], 'id,path');
            self::require_rule($category && preg_match('~\A(?:/[1-9][0-9]*)+\z~', $category->path) === 1);
            foreach (explode('/', trim($category->path, '/')) as $id) {
                self::require_rule($DB->record_exists('course_categories', ['id' => (int)$id, 'visible' => 1]));
            }
            // Fresh core role assignments, no cached USER/accessdatabyuser identity.
            // Role definitions may be cached by core; compare to its uncached query.
            accesslib_clear_all_caches(true);
            $context = \context_course::instance($record['courseId'], IGNORE_MISSING);
            $access = get_user_roles_sitewide_accessdata($record['actorUserId']);
            $roleids = [];
            foreach ($access['ra'] ?? [] as $roles) {
                foreach ($roles as $roleid) {
                    $roleids[(int)$roleid] = true;
                }
            }
            $capability = $q['role'] === 'PARTICIPANT' ? 'local/clearbridge:view' : 'local/clearbridge:configure';
            self::require_rule($context && empty($access['rsw'])
                && has_capability_in_accessdata($capability, $context, $access)
                && get_role_definitions(array_keys($roleids)) == get_role_definitions_uncached(array_keys($roleids)));
            // Re-fetch mapping and epoch after all database reads. Same-final-state
            // revoke/restore requires the approved epoch source to have advanced.
            self::require_rule($this->mapped($record['binding'], $record['courseId'], $record['actorUserId'], $q['role']) === $m
                && $this->config_current() && $this->same_generation($record) && !$DB->is_transaction_started()
                && time() >= $now && time() < $q['expiresAtExclusive']
                && hrtime(true) >= $record['startedMonotonic'] && hrtime(true) - $record['startedMonotonic'] < 5_000_000_000);
            return true;
        } catch (\Throwable $error) {
            return false;
        }
    }

    /** Exact service configuration; no proxy-header trust and no cookie authority. */
    public static function authenticate(array $server, string $raw, array $config, string $outboundkey): array {
        self::require_rule(course_read_client::exact_keys($config, ['enabled', 'origin', 'ownerRunId', 'key'])
            && $config['enabled'] === true && is_string($config['origin'])
            && preg_match('~\Ahttps://[a-z0-9.-]+(?::[1-9][0-9]{0,4})?\z~', $config['origin']) === 1
            && self::ref($config['ownerRunId']) && is_string($config['key'])
            && preg_match('/\A[a-f0-9]{64}\z/', $config['key']) === 1
            && preg_match('/\A[a-f0-9]{64}\z/', $outboundkey) === 1 && !hash_equals($outboundkey, $config['key']));
        $host = substr($config['origin'], 8);
        self::require_rule(($server['REQUEST_METHOD'] ?? '') === 'POST' && ($server['REQUEST_URI'] ?? '') === self::PATH
            && ($server['HTTP_HOST'] ?? '') === $host && in_array($server['HTTPS'] ?? '', ['on', '1'], true)
            && ($server['CONTENT_TYPE'] ?? '') === 'application/json' && strlen($raw) <= 4096 && $raw !== ''
            && empty($server['HTTP_COOKIE']) && empty($server['HTTP_AUTHORIZATION'])
            && empty($server['PHP_AUTH_USER']) && empty($server['HTTP_CONTENT_ENCODING']));
        $stamp = $server['HTTP_X_CLEAR_TIMESTAMP'] ?? '';
        $nonce = $server['HTTP_X_CLEAR_NONCE'] ?? '';
        $mac = $server['HTTP_X_CLEAR_SIGNATURE'] ?? '';
        self::require_rule(is_string($stamp) && preg_match('/\A[1-9][0-9]{0,9}\z/', $stamp) === 1
            && is_string($nonce) && preg_match('/\A[a-f0-9]{32}\z/', $nonce) === 1
            && is_string($mac) && preg_match('/\A[a-f0-9]{64}\z/', $mac) === 1);
        $now = time();
        self::require_rule((int)$stamp <= $now && (int)$stamp > $now - 5);
        $material = implode("\n", [self::DOMAIN, $stamp, $nonce, 'POST', self::PATH, hash('sha256', $raw)]);
        self::require_rule(hash_equals(hash_hmac('sha256', $material, $config['key']), $mac));
        $q = json_decode($raw, true, 12, JSON_THROW_ON_ERROR);
        self::require_rule(is_array($q) && json_encode($q, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) === $raw);
        self::request_shape($q);
        self::require_rule($q['ownerRunId'] === $config['ownerRunId'] && $q['expiresAtExclusive'] > $now
            && $q['expiresAtExclusive'] <= $now + 5);
        return [$q, $nonce, (int)$stamp];
    }

    public function respond(array $q, course_authority_registry $registry): array {
        $start = hrtime(true);
        $wall = time();
        $result = ['version' => 'clear-moodle-authority-check.1', 'requestRef' => $q['requestRef'],
            'ownerRunId' => $q['ownerRunId'], 'moodleAuthorityRef' => $q['moodleAuthorityRef'], 'role' => $q['role'],
            'status' => 'UNAVAILABLE', 'installationRef' => null, 'installationGeneration' => null,
            'authorityEpoch' => null, 'courseRef' => null, 'subjectRef' => null, 'actorRef' => null, 'expiresAtExclusive' => null];
        try {
            self::request_shape($q);
            $r = $registry->lookup($q);
            self::require_rule($r !== null && $this->verify($r));
            self::require_rule($registry->lookup($q) === $r && $this->verify($r));
            self::require_rule($registry->lookup($q) === $r && time() >= $wall && time() < $q['expiresAtExclusive']
                && hrtime(true) >= $start && hrtime(true) - $start < 5_000_000_000);
            $result['status'] = 'OK';
            foreach (['installationRef', 'courseRef', 'subjectRef', 'actorRef'] as $field) {
                $result[$field] = $r['binding'][$field];
            }
            $result['installationGeneration'] = $r['generation']['installationGeneration'];
            $result['authorityEpoch'] = $r['generation']['authorityEpoch'];
            $result['expiresAtExclusive'] = $q['expiresAtExclusive'];
        } catch (\Throwable $error) {
            // Correlation only, never expose stored IDs or failure details.
            try {
                $registry->revoke($q['moodleAuthorityRef'], $q['expiresAtExclusive']);
            } catch (\Throwable $cleanup) {
                // Unreadable/locked registry cannot authorize a successful reply.
            }
        }
        return $result;
    }
}
