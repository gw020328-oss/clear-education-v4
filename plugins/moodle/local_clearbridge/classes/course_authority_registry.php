<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/** One pre-provisioned private run file, shared by PHP workers. No session secrets. */
final class course_authority_registry {
    public function __construct(private readonly string $path, private readonly string $run,
            private readonly bool $login = false) {
        if (!preg_match('/\A[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\z/', $run)) {
            throw new \RuntimeException('Authority unavailable');
        }
        $this->permissions();
    }

    private function record_shape(array $record): void {
        if ($this->login) {
            course_login_authority::record_shape($record);
        } else {
            course_authority_currentness::record_shape($record);
        }
    }

    private function permissions(): array {
        clearstatcache(true, $this->path);
        $dir = dirname($this->path);
        $d = @lstat($dir);
        $s = @lstat($this->path);
        if (!str_starts_with($this->path, '/') || realpath($dir) !== $dir || !is_dir($dir)
                || !$d || $d['uid'] !== posix_geteuid() || ($d['mode'] & 0777) !== 0700
                || !$s || !is_file($this->path) || is_link($this->path) || $s['nlink'] !== 1
                || $s['uid'] !== posix_geteuid() || ($s['mode'] & 0777) !== 0600) {
            throw new \RuntimeException('Authority unavailable');
        }
        return $s;
    }

    private function transaction(\Closure $action, ?int $until = null): mixed {
        $stat = $this->permissions();
        $file = @fopen($this->path, 'r+b'); // Never create or repair absent/corrupt state.
        if (!$file) {
            throw new \RuntimeException('Authority unavailable');
        }
        try {
            $actual = fstat($file);
            if ($actual['ino'] !== $stat['ino'] || $actual['dev'] !== $stat['dev']) {
                throw new \RuntimeException('Authority unavailable');
            }
            $started = hrtime(true);
            while (!flock($file, LOCK_EX | LOCK_NB)) {
                if ($until === null || time() >= $until || hrtime(true) - $started >= 5_000_000_000) {
                    throw new \RuntimeException('Authority unavailable');
                }
                usleep(10000);
            }
            $raw = @stream_get_contents($file, 262145);
            if (!is_string($raw) || strlen($raw) > 262144) {
                throw new \RuntimeException('Authority unavailable');
            }
            $state = json_decode($raw, true, 20, JSON_THROW_ON_ERROR);
            $now = time();
            if (!course_read_client::exact_keys($state, ['version', 'ownerRunId', 'wallFloor', 'leases', 'nonces'])
                    || $state['version'] !== ($this->login ? 'clear-moodle-login-registry.1' : 'clear-moodle-authority-registry.1')
                    || $state['ownerRunId'] !== $this->run
                    || !is_int($state['wallFloor']) || $state['wallFloor'] < 0 || $state['wallFloor'] > $now
                    || !is_array($state['leases']) || !is_array($state['nonces'])
                    || count($state['leases']) > 128 || count($state['nonces']) > 1024) {
                throw new \RuntimeException('Authority unavailable');
            }
            foreach ($state['leases'] as $key => $record) {
                if (!is_array($record) || !is_int($record['request']['expiresAtExclusive'] ?? null)) {
                    throw new \RuntimeException('Authority unavailable');
                }
                $this->record_shape($record);
                if ($key !== $record['request']['moodleAuthorityRef'] || $record['request']['ownerRunId'] !== $this->run) {
                    throw new \RuntimeException('Authority unavailable');
                }
                if ($record['request']['expiresAtExclusive'] <= $now) {
                    unset($state['leases'][$key]);
                }
            }
            foreach ($state['nonces'] as $key => $expiry) {
                if (!is_int($expiry) || !is_string($key) || preg_match('/\A[a-f0-9]{32}\z/', $key) !== 1) {
                    throw new \RuntimeException('Authority unavailable');
                }
                if ($expiry <= $now) {
                    unset($state['nonces'][$key]);
                }
            }
            $state['wallFloor'] = $now;
            $result = $action($state, $now);
            $encoded = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            if (strlen($encoded) > 262144 || !@rewind($file) || @fwrite($file, $encoded) !== strlen($encoded)
                    || !@ftruncate($file, strlen($encoded)) || !@fflush($file) || !@fsync($file)) {
                throw new \RuntimeException('Authority unavailable');
            }
            return $result;
        } finally {
            fclose($file);
        }
    }

    public function publish(array $record): void {
        $this->record_shape($record);
        $this->transaction(function (&$state, $now) use ($record): void {
            $q = $record['request'];
            $key = $q['moodleAuthorityRef'];
            if ($q['ownerRunId'] !== $this->run || $q['expiresAtExclusive'] <= $now || $q['expiresAtExclusive'] > $now + 5
                    || isset($state['leases'][$key]) || count($state['leases']) >= 128) {
                throw new \RuntimeException('Authority unavailable');
            }
            $state['leases'][$key] = $record;
        });
    }

    /** Call only after validating the direction-specific service MAC. */
    public function claim_nonce(string $nonce, int $timestamp): void {
        $this->transaction(function (&$state, $now) use ($nonce, $timestamp): void {
            if (!preg_match('/\A[a-f0-9]{32}\z/', $nonce) || $timestamp > $now || $timestamp <= $now - 5
                    || isset($state['nonces'][$nonce]) || count($state['nonces']) >= 1024) {
                throw new \RuntimeException('Authority unavailable');
            }
            $state['nonces'][$nonce] = $timestamp + 5;
        });
    }

    public function lookup(array $request): ?array {
        return $this->transaction(function (&$state, $now) use ($request): ?array {
            if ($this->login) {
                course_login_authority::base_shape($request);
            } else {
                course_authority_currentness::request_shape($request);
            }
            $record = $state['leases'][$request['moodleAuthorityRef']] ?? null;
            if ($record === null || $request['ownerRunId'] !== $this->run || $request['expiresAtExclusive'] <= $now) {
                return null;
            }
            $this->record_shape($record);
            foreach ($request as $field => $value) {
                if ($record['request'][$field] !== $value) {
                    return null;
                }
            }
            return $record;
        });
    }

    public function revoke(string $ref, int $expiry): void {
        $this->transaction(static function (&$state) use ($ref): void { unset($state['leases'][$ref]); }, $expiry);
    }

    /** Atomically consume only the matching original authorize-command publication. */
    public function take_command(array $request): ?array {
        course_authority_currentness::require_rule($this->login);
        $digest = course_login_authority::digest('authorize-command', $request);
        return $this->transaction(function (&$state, $now) use ($request, $digest): ?array {
            $ref = $request['moodleAuthorityRef'];
            $record = $state['leases'][$ref] ?? null;
            if ($record === null || $request['ownerRunId'] !== $this->run
                    || $request['expiresAtExclusive'] <= $now || $record['operation'] !== 'authorize-command'
                    || !hash_equals($record['digest'], $digest)) {
                return null;
            }
            // Compare every exact common header under the SAME lock as removal.
            foreach ($record['request'] as $field => $value) {
                if ($request[$field] !== $value) {
                    return null;
                }
            }
            unset($state['leases'][$ref]);
            return $record;
        }, $request['expiresAtExclusive']);
    }
}
