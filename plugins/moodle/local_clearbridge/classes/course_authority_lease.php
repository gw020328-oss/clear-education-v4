<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * Server-only, originating-request lease. This is NOT an A-to-C HTTP resolver.
 *
 * The owner must supply an authoritative generation reader. No timestamp,
 * HMAC, session row ID or local counter substitutes for its durable epoch.
 */
final class course_authority_lease {
    private bool $revoked = false;
    private ?array $request = null;
    private int $wallfloor;
    private int $monofloor;

    private function __construct(
        private readonly course_moodle_access $access,
        private readonly array $binding,
        private readonly array $generation,
        private readonly \Closure $readgeneration,
        private readonly int $course,
        private readonly int $user,
        private readonly string $role,
        private readonly string $ref,
        private readonly int $expiry,
        private readonly int $started,
        int $now,
    ) {
        $this->wallfloor = $now;
        $this->monofloor = $started;
    }

    /** All arguments are owner configuration or checked Moodle page arguments. */
    public static function issue(int $course, int $user, string $role, array $binding,
            \Closure $readgeneration): ?self {
        global $CFG;
        try {
            $now = time();
            $started = hrtime(true);
            if ((float)($CFG->version ?? 0) !== 2024100715.0 || $course < 1 || $user < 1
                    || !in_array($role, ['PARTICIPANT', 'COURSE_OPERATOR'], true)
                    || !course_read_client::exact_keys($binding,
                        ['installationRef', 'ownerRunId', 'courseRef', 'subjectRef', 'actorRef', 'expiresAtExclusive'])
                    || !is_int($binding['expiresAtExclusive']) || $binding['expiresAtExclusive'] <= $now) {
                return null;
            }
            foreach (['installationRef', 'ownerRunId', 'courseRef', 'subjectRef', 'actorRef'] as $field) {
                if (!self::reference($binding[$field])) {
                    return null;
                }
            }
            $generation = $readgeneration();
            if (!self::valid_generation($generation)) {
                return null;
            }
            $access = new course_moodle_access($course, $user,
                $role === 'PARTICIPANT' ? 'local/clearbridge:view' : 'local/clearbridge:configure');
            // This object also pins the internal session row generation. It
            // remains private and is never serialized or forwarded to A.
            $localexpiry = $access->expires_at();
            if ($localexpiry === null || !self::same_generation($generation, $readgeneration())) {
                return null;
            }
            $lease = new self($access, $binding, $generation, $readgeneration, $course, $user, $role,
                bin2hex(random_bytes(32)), min($now + 5, $binding['expiresAtExclusive'], $localexpiry), $started, $now);
            return $lease->is_current() ? $lease : null;
        } catch (\Throwable $error) {
            return null;
        }
    }

    /** Existing C-to-A grant shape. Possession is not current authorization. */
    public function grant(): ?array {
        return $this->is_current()
            ? ['moodleAuthorityRef' => $this->ref, 'expiresAtExclusive' => $this->expiry] : null;
    }

    public function grant_for(int $course, int $user, string $role, string $run): ?array {
        if ($course !== $this->course || $user !== $this->user || $role !== $this->role
                || $run !== $this->binding['ownerRunId']) {
            $this->revoke();
            return null;
        }
        return $this->grant();
    }

    /**
     * Local contract candidate for an already authenticated owner request.
     * Repeated identical checks support A's before/after scope checks. A second
     * request, even in the same run, may not reuse this lease.
     */
    public function check(array $request): ?array {
        if (!course_read_client::exact_keys($request,
                ['version', 'requestRef', 'ownerRunId', 'moodleAuthorityRef', 'role', 'expiresAtExclusive'])
                || $request['version'] !== 'clear-moodle-course-read-request.1'
                || !is_string($request['requestRef']) || !preg_match('/\A[a-f0-9]{64}\z/', $request['requestRef'])
                || $request['ownerRunId'] !== $this->binding['ownerRunId'] || $request['moodleAuthorityRef'] !== $this->ref
                || $request['role'] !== $this->role || !is_int($request['expiresAtExclusive'])
                || $request['expiresAtExclusive'] > $this->expiry || $request['expiresAtExclusive'] <= time()) {
            $this->revoke();
            return null;
        }
        // Key order is irrelevant; each value and the complete key set are pinned.
        if ($this->request !== null && $this->request != $request) {
            $this->revoke();
            return null;
        }
        $this->request = $request;
        if (!$this->is_current()) {
            return null;
        }
        return [
            'version' => 'clear-moodle-authority-check.1',
            'requestRef' => $request['requestRef'],
            'ownerRunId' => $this->binding['ownerRunId'],
            'moodleAuthorityRef' => $this->ref,
            'role' => $this->role,
            'status' => 'OK',
            'installationRef' => $this->binding['installationRef'],
            'installationGeneration' => $this->generation['installationGeneration'],
            'authorityEpoch' => $this->generation['authorityEpoch'],
            'courseRef' => $this->binding['courseRef'],
            'subjectRef' => $this->binding['subjectRef'],
            'actorRef' => $this->binding['actorRef'],
            'expiresAtExclusive' => $request['expiresAtExclusive'],
        ];
    }

    /** Must also run after the owner reply, immediately before local display. */
    public function is_current(): bool {
        if ($this->revoked) {
            return false;
        }
        try {
            $before = time();
            $mono = hrtime(true);
            if ($before < $this->wallfloor || $before >= $this->expiry || $mono < $this->monofloor
                    || $mono - $this->started >= 5_000_000_000
                    || ($this->request !== null && $before >= $this->request['expiresAtExclusive'])
                    || !self::same_generation($this->generation, ($this->readgeneration)())) {
                $this->revoke();
                return false;
            }
            $this->wallfloor = $before;
            $this->monofloor = $mono;
            $expiry = $this->access->expires_at();
            $same = self::same_generation($this->generation, ($this->readgeneration)());
            $after = time();
            $mono = hrtime(true);
            if ($expiry === null || $expiry < $this->expiry || !$same || $after < $before || $after >= $this->expiry
                    || ($this->request !== null && $after >= $this->request['expiresAtExclusive'])
                    || $mono < $this->monofloor || $mono - $this->started >= 5_000_000_000) {
                $this->revoke();
                return false;
            }
            $this->wallfloor = $after;
            $this->monofloor = $mono;
            return true;
        } catch (\Throwable $error) {
            $this->revoke();
            return false;
        }
    }

    public function revoke(): void {
        $this->revoked = true;
    }

    public function __serialize(): array {
        throw new \LogicException('A Moodle authority lease cannot leave its originating request');
    }

    public function __unserialize(array $data): void {
        throw new \LogicException('A Moodle authority lease cannot be restored');
    }

    public function __debugInfo(): array {
        return ['revoked' => $this->revoked];
    }

    private function __clone() {
    }

    private static function reference(mixed $value): bool {
        return is_string($value) && (bool)preg_match('/\A[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\z/', $value);
    }

    private static function valid_generation(mixed $value): bool {
        return course_read_client::exact_keys($value, ['installationGeneration', 'authorityEpoch'])
            && self::reference($value['installationGeneration']) && is_int($value['authorityEpoch'])
            && $value['authorityEpoch'] > 0 && $value['authorityEpoch'] <= 9007199254740991;
    }

    private static function same_generation(array $expected, mixed $actual): bool {
        return self::valid_generation($actual)
            && $expected['installationGeneration'] === $actual['installationGeneration']
            && $expected['authorityEpoch'] === $actual['authorityEpoch'];
    }
}
