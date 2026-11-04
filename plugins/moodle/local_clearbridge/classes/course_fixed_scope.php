<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/** One installed course, one participant and one operator. Current display only. */
final class course_fixed_scope {
    private bool $revoked = false;
    private ?array $request = null;
    private ?course_authority_registry $registry = null;
    private int $wallfloor;
    private int $monofloor;

    private function __construct(private readonly array $scope, private readonly array $identity,
            private readonly course_moodle_access $access, private readonly string $role,
            private readonly string $ref, private readonly int $expiry, private readonly int $started) {
        $this->wallfloor = time();
        $this->monofloor = $started;
    }

    public static function settings(): ?array {
        global $CFG, $DB;
        try {
            if (($CFG->local_clearbridge_enable_fixed_scope ?? false) !== true) {
                return null;
            }
            $row = $DB->get_record('config_plugins', ['plugin' => 'local_clearbridge', 'name' => 'fixedscope'], 'value');
            if (!$row || strlen($row->value) > 4096) {
                return null;
            }
            $s = json_decode($row->value, true, 8, JSON_THROW_ON_ERROR);
            if (!course_read_client::exact_keys($s, ['enabled', 'ownerRunId', 'installationRef', 'moodleOrigin',
                    'courseId', 'courseRef', 'subjectUserId', 'subjectRef', 'participantActorRef', 'operatorUserId',
                    'operatorActorRef', 'applicationRef', 'expiresAtExclusive']) || $s['enabled'] !== true
                    || $s['moodleOrigin'] !== $CFG->wwwroot || $s['expiresAtExclusive'] <= time()) {
                return null;
            }
            foreach (['courseId', 'subjectUserId', 'operatorUserId', 'expiresAtExclusive'] as $key) {
                if (!course_authority_currentness::positive($s[$key])) {
                    return null;
                }
            }
            foreach (['ownerRunId', 'installationRef', 'courseRef', 'subjectRef', 'participantActorRef', 'operatorActorRef', 'applicationRef'] as $key) {
                if (!course_authority_currentness::ref($s[$key])) {
                    return null;
                }
            }
            if ($s['subjectUserId'] === $s['operatorUserId'] || $s['participantActorRef'] === $s['operatorActorRef']) {
                return null;
            }
            ksort($s);
            return $s;
        } catch (\Throwable $error) {
            return null;
        }
    }

    public static function issue(int $course, int $user, string $role): ?self {
        global $DB;
        try {
            $started = hrtime(true);
            $s = self::settings();
            if ($s === null || !in_array($role, ['PARTICIPANT', 'COURSE_OPERATOR'], true) || $course !== $s['courseId']
                    || $user !== ($role === 'PARTICIPANT' ? $s['subjectUserId'] : $s['operatorUserId'])) {
                return null;
            }
            $access = new course_moodle_access($course, $user,
                $role === 'PARTICIPANT' ? 'local/clearbridge:view' : 'local/clearbridge:configure', true);
            $end = $access->expires_at();
            if ($end === null) {
                return null;
            }
            $session = $DB->get_record('sessions', ['sid' => session_id(), 'userid' => $user], 'id,timecreated');
            if (!$session) {
                return null;
            }
            $identity = ['courseId' => $course, 'actorUserId' => $user, 'subjectUserId' => $s['subjectUserId'],
                'sessionRowId' => (int)$session->id, 'sessionCreatedAt' => (int)$session->timecreated, 'startedMonotonic' => $started,
                'sessionBackend' => ltrim(\core\session\manager::get_handler_class(), '\\')];
            $lease = new self($s, $identity, $access, $role, bin2hex(random_bytes(32)), min(time() + 5, $end, $s['expiresAtExclusive']), $started);
            return $lease->is_current() ? $lease : null;
        } catch (\Throwable $error) {
            return null;
        }
    }

    private function record(): array {
        return ['request' => $this->request ?? ['role' => $this->role, 'expiresAtExclusive' => $this->expiry],
            'fixedScope' => $this->scope] + $this->identity;
    }

    public static function record_shape(array $r): void {
        course_authority_currentness::require_rule(course_read_client::exact_keys($r, ['request', 'fixedScope', 'courseId',
            'actorUserId', 'subjectUserId', 'sessionRowId', 'sessionCreatedAt', 'startedMonotonic', 'sessionBackend'])
            && is_array($r['request']) && is_array($r['fixedScope']));
        course_authority_currentness::request_shape($r['request']);
        foreach (['courseId', 'actorUserId', 'subjectUserId', 'sessionRowId', 'sessionCreatedAt'] as $field) {
            course_authority_currentness::require_rule(course_authority_currentness::positive($r[$field]));
        }
        course_authority_currentness::require_rule(is_int($r['startedMonotonic']) && $r['startedMonotonic'] >= 0);
        course_authority_currentness::require_rule(in_array($r['sessionBackend'],
            [\core\session\file::class, \core\session\database::class], true));
    }

    private static function matches(array $r): bool {
        $s = self::settings();
        return $s !== null && $s === $r['fixedScope'] && $s['courseId'] === $r['courseId']
            && $s['subjectUserId'] === $r['subjectUserId'] && $r['request']['expiresAtExclusive'] <= $s['expiresAtExclusive']
            && $r['actorUserId'] === ($r['request']['role'] === 'PARTICIPANT' ? $s['subjectUserId'] : $s['operatorUserId']);
    }

    public static function verify_record(array $r): bool {
        try {
            self::record_shape($r);
            return self::matches($r) && $r['request']['ownerRunId'] === $r['fixedScope']['ownerRunId']
                && course_authority_currentness::verify_database($r, true) && self::matches($r);
        } catch (\Throwable $error) {
            return false;
        }
    }

    public function is_current(): bool {
        try {
            $now = time(); $mono = hrtime(true);
            if ($this->revoked || $now < $this->wallfloor || $mono < $this->monofloor || $now >= $this->expiry
                    || $mono - $this->started >= 5_000_000_000 || ($this->access->expires_at() ?? 0) < $this->expiry) {
                $this->revoke(); return false;
            }
            $r = $this->record();
            if (!self::matches($r) || !course_authority_currentness::verify_database($r, true) || !self::matches($r)
                    || time() < $now || time() >= $r['request']['expiresAtExclusive']
                    || hrtime(true) < $mono || hrtime(true) - $this->started >= 5_000_000_000) {
                $this->revoke(); return false;
            }
            $this->wallfloor = time(); $this->monofloor = hrtime(true);
            return true;
        } catch (\Throwable $error) {
            $this->revoke(); return false;
        }
    }

    public function grant_for(int $course, int $user, string $role, string $run): ?array {
        if ($course !== $this->identity['courseId'] || $user !== $this->identity['actorUserId'] || $role !== $this->role
                || $run !== $this->scope['ownerRunId'] || !$this->is_current()) {
            $this->revoke(); return null;
        }
        return ['moodleAuthorityRef' => $this->ref, 'expiresAtExclusive' => $this->expiry];
    }

    public function attach_registry(course_authority_registry $registry): void {
        if ($this->registry !== null || $this->request !== null || !$this->is_current()) {
            throw new \RuntimeException('Fixed scope unavailable');
        }
        $this->registry = $registry;
    }

    public function publish_request(array $request): bool {
        try {
            course_authority_currentness::request_shape($request);
            if ($this->registry === null || $this->request !== null || $request['ownerRunId'] !== $this->scope['ownerRunId']
                    || $request['moodleAuthorityRef'] !== $this->ref || $request['role'] !== $this->role
                    || $request['expiresAtExclusive'] > $this->expiry || !$this->is_current()) {
                $this->revoke(); return false;
            }
            $this->request = $request;
            if (!$this->is_current()) {
                return false;
            }
            $this->registry->publish($this->record());
            return $this->bridge_current();
        } catch (\Throwable $error) {
            $this->revoke(); return false;
        }
    }

    public function bridge_current(): bool {
        try {
            if ($this->request === null || $this->registry === null || !$this->is_current()
                    || $this->registry->lookup($this->request) !== $this->record()) {
                $this->revoke(); return false;
            }
            return true;
        } catch (\Throwable $error) {
            $this->revoke(); return false;
        }
    }

    public function revoke(): bool {
        $this->revoked = true;
        try { $this->registry?->revoke($this->ref, $this->expiry); return true; }
        catch (\Throwable $error) { return false; }
    }

    public static function unavailable(array $q): array {
        return ['version' => 'clear-moodle-fixed-scope-check.1', 'requestRef' => $q['requestRef'], 'ownerRunId' => $q['ownerRunId'],
            'moodleAuthorityRef' => $q['moodleAuthorityRef'], 'role' => $q['role'], 'status' => 'UNAVAILABLE',
            'installationRef' => null, 'courseRef' => null, 'subjectRef' => null, 'actorRef' => null, 'applicationRef' => null,
            'expiresAtExclusive' => null, 'displayOnly' => true, 'authorityConsumptionAllowed' => false];
    }

    public static function respond(array $q, course_authority_registry $registry): array {
        try {
            $start = hrtime(true); $now = time();
            $r = $registry->lookup($q);
            course_authority_currentness::require_rule($r !== null && self::verify_record($r));
            course_authority_currentness::require_rule($registry->lookup($q) === $r && self::verify_record($r));
            course_authority_currentness::require_rule($registry->lookup($q) === $r);
            $finalmono = hrtime(true);
            course_authority_currentness::require_rule(time() >= $now && time() < $q['expiresAtExclusive']
                && $finalmono >= $start && $finalmono - $start < 5_000_000_000
                && $finalmono >= $r['startedMonotonic'] && $finalmono - $r['startedMonotonic'] < 5_000_000_000);
            $result = self::unavailable($q); $s = $r['fixedScope']; $result['status'] = 'OK';
            foreach (['installationRef', 'courseRef', 'subjectRef', 'applicationRef'] as $key) { $result[$key] = $s[$key]; }
            $result['actorRef'] = $q['role'] === 'PARTICIPANT' ? $s['participantActorRef'] : $s['operatorActorRef'];
            $result['expiresAtExclusive'] = $q['expiresAtExclusive'];
            return $result;
        } catch (\Throwable $error) {
            try { $registry->revoke($q['moodleAuthorityRef'], $q['expiresAtExclusive']); } catch (\Throwable $ignored) {}
            return self::unavailable($q);
        }
    }

    public function __serialize(): array { throw new \LogicException('Fixed scope cannot leave its request'); }
    public function __unserialize(array $data): void { throw new \LogicException('Fixed scope cannot be restored'); }
    public function __debugInfo(): array { return ['revoked' => $this->revoked]; }
    private function __clone() {}
}
