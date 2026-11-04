<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/** C-to-A signed operations. Only operation digests cross into the private registry. */
final class course_login_client {
    public function __construct(private readonly array $config, private readonly array $scope,
            private readonly int $user, private readonly string $role) {
    }

    public static function proofs(string $key, string $run, string $intent, string $code, string $challenge): array {
        return [
            'browserProof' => hash_hmac('sha256', implode("\n",
                ['CLEAR-MOODLE-LOGIN-BROWSER-PROOF-1', $run, $intent, $code, $challenge]), $key),
            'finishProof' => hash_hmac('sha256', implode("\n",
                ['CLEAR-MOODLE-LOGIN-FINISH-PROOF-1', $run, $intent, $code]), $key),
        ];
    }

    public function request(string $operation, array $fields = []): array {
        $start = hrtime(true);
        $now = time();
        $q = ['version' => course_login_authority::request_version($operation), 'requestRef' => bin2hex(random_bytes(32)),
            'ownerRunId' => $this->config['ownerRunId'], 'moodleAuthorityRef' => bin2hex(random_bytes(32)),
            'role' => $this->role, 'expiresAtExclusive' => min($now + 5, $this->scope['expiresAtExclusive'])] + $fields;
        course_login_authority::request_shape($operation, $q);
        $record = course_login_authority::capture($operation, $q, $this->scope, $this->user, $start, $now);
        $registry = new course_authority_registry($this->config['registry'], $this->config['ownerRunId'], true);
        $retain = false;
        try {
            $registry->publish($record);
            $reply = $this->exchange('/v1/moodle/connect/' . $operation, $q, $start);
            course_login_authority::check_origin($record);
            $mono = hrtime(true);
            $wall = time();
            course_authority_currentness::require_rule($wall >= $now && $wall < $q['expiresAtExclusive']
                && $mono >= $start && $mono - $start < 5_000_000_000);
            self::response_shape($operation, $q, $reply, $wall, $this->scope['expiresAtExclusive']);
            // Preserve only a fully validated command publication, with its ORIGINAL deadline.
            // execute-command consumes this same record; no fresh lease is issued at execution.
            $retain = $operation === 'authorize-command';
            return $reply;
        } finally {
            if (!$retain) {
                $registry->revoke($q['moodleAuthorityRef'], $q['expiresAtExclusive']);
            }
        }
    }

    public static function response_shape(string $operation, array $q, array $reply, int $now, int $runend): void {
        if ($operation === 'authorize-command') {
            course_login_authority::request_shape($operation, $q);
            course_authority_currentness::require_rule(course_read_client::exact_keys($reply,
                ['version', 'requestRef', 'status', 'expiresAtExclusive'])
                && $reply['version'] === course_login_authority::COMMAND_VERSION
                && $reply['requestRef'] === $q['requestRef'] && $reply['status'] === 'AUTHORIZED'
                && $reply['expiresAtExclusive'] === $q['expiresAtExclusive']
                && $reply['expiresAtExclusive'] > $now && $reply['expiresAtExclusive'] <= $runend);
            return;
        }
        $start = $operation === 'start';
        course_authority_currentness::require_rule(course_read_client::exact_keys($reply,
            ['version', 'requestRef', 'status', 'expiresAtExclusive', $start ? 'launchCode' : 'handback'])
            && $reply['version'] === course_login_authority::VERSION && $reply['requestRef'] === $q['requestRef']);
        $statuses = match ($operation) {
            'start' => ['WAITING'],
            'status' => ['WAITING', 'RETURN_REQUIRED', 'CONNECTED', 'UNAVAILABLE', 'EXPIRED'],
            'finish' => ['CONNECTED', 'UNAVAILABLE'],
            'end' => ['UNAVAILABLE', 'EXPIRED'],
        };
        $status = $reply['status'];
        course_authority_currentness::require_rule(in_array($status, $statuses, true));
        if (in_array($status, ['UNAVAILABLE', 'EXPIRED'], true)) {
            course_authority_currentness::require_rule($reply['expiresAtExclusive'] === null && $reply['handback'] === null);
            return;
        }
        $expiry = $reply['expiresAtExclusive'];
        course_authority_currentness::require_rule(course_authority_currentness::positive($expiry) && $expiry > $now
            && $expiry <= $runend);
        if ($start) {
            course_authority_currentness::require_rule($expiry <= $now + 120 && course_login_authority::hex($reply['launchCode']));
        } else {
            course_authority_currentness::require_rule($status === 'RETURN_REQUIRED'
                ? ($expiry <= $now + 60 && course_login_authority::hex($reply['handback'])) : $reply['handback'] === null);
        }
    }

    private function exchange(string $path, array $q, int $start): array {
        $stamp = time();
        $nonce = bin2hex(random_bytes(16));
        $body = json_encode($q, JSON_THROW_ON_ERROR);
        $signature = hash_hmac('sha256', implode("\n", [$stamp, $nonce, 'POST', $path, hash('sha256', $body)]),
            $this->config['key']);
        $milliseconds = (int)floor(min(5000 - (hrtime(true) - $start) / 1e6,
            ($q['expiresAtExclusive'] - microtime(true)) * 1000));
        course_authority_currentness::require_rule($milliseconds > 0);
        $curl = curl_init($this->config['origin'] . $path);
        course_authority_currentness::require_rule($curl !== false);
        $raw = '';
        try {
            course_authority_currentness::require_rule(curl_setopt_array($curl, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json',
                    'X-Clear-Timestamp: ' . $stamp, 'X-Clear-Nonce: ' . $nonce, 'X-Clear-Signature: ' . $signature],
                CURLOPT_PROXY => '',
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_CAINFO => $this->config['ca'],
                CURLOPT_CONNECTTIMEOUT_MS => $milliseconds,
                CURLOPT_TIMEOUT_MS => $milliseconds,
                CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$raw): int {
                    if (strlen($raw) + strlen($chunk) > 4096) {
                        return 0;
                    }
                    $raw .= $chunk;
                    return strlen($chunk);
                },
            ]) && curl_exec($curl) !== false && curl_getinfo($curl, CURLINFO_RESPONSE_CODE) === 200
                && strtolower(trim(explode(';', (string)curl_getinfo($curl, CURLINFO_CONTENT_TYPE), 2)[0])) === 'application/json');
        } finally {
            curl_close($curl);
        }
        $reply = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
        course_authority_currentness::require_rule(is_array($reply)
            && json_encode($reply, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) === $raw);
        return $reply;
    }
}
