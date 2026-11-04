<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * Private C-to-owner read client. A verified Moodle authority is required
 * separately from the per-run key used to authenticate this service.
 */
final class course_read_client {
    private const PATH = '/v1/moodle/course/read';
    private const MAX_RESPONSE_BYTES = 65536;

    public function __construct(
        private readonly string $origin,
        private readonly string $ca,
        private readonly string $run,
        private readonly string $key,
        private readonly bool $synthetic = false,
    ) {
        if (!preg_match('~\Ahttps://[A-Za-z0-9.-]+(?::[0-9]{1,5})?\z~', $origin)
                || !str_starts_with($ca, '/') || !is_file($ca) || !is_readable($ca)
                || !self::valid_ref($run) || !preg_match('/\A[a-f0-9]{64}\z/', $key)) {
            throw new \InvalidArgumentException('Invalid owner read configuration');
        }
    }

    public function read(string $authority, string $role, int $authorityexpiry): ?course_projection {
        $start = hrtime(true);
        $now = time();
        $expiry = min($authorityexpiry, $now + 5);
        if ($expiry <= $now || !self::valid_ref($authority) || !in_array($role, ['PARTICIPANT', 'COURSE_OPERATOR'], true)) {
            return null;
        }
        $ref = bin2hex(random_bytes(32));
        $nonce = bin2hex(random_bytes(16));
        $body = json_encode([
            'version' => 'clear-moodle-course-read-request.1',
            'requestRef' => $ref,
            'ownerRunId' => $this->run,
            'moodleAuthorityRef' => $authority,
            'role' => $role,
            'expiresAtExclusive' => $expiry,
        ], JSON_THROW_ON_ERROR);
        $material = implode("\n", [$now, $nonce, 'POST', self::PATH, hash('sha256', $body)]);
        // Match auth.mjs: the hex text itself is the UTF-8 key.
        $signature = hash_hmac('sha256', $material, $this->key);
        $milliseconds = (int)floor(min(5000 - (hrtime(true) - $start) / 1e6, ($expiry - microtime(true)) * 1000));
        if ($milliseconds < 1) {
            return null;
        }
        $curl = curl_init($this->origin . self::PATH);
        if ($curl === false) {
            return null;
        }
        $raw = '';
        try {
            if (!curl_setopt_array($curl, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_HTTPHEADER => [
                    'Content-Type: application/json', 'Accept: application/json',
                    'X-Clear-Timestamp: ' . $now, 'X-Clear-Nonce: ' . $nonce,
                    'X-Clear-Signature: ' . $signature,
                ],
                CURLOPT_PROXY => '',
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
                CURLOPT_CAINFO => $this->ca,
                CURLOPT_CONNECTTIMEOUT_MS => $milliseconds,
                CURLOPT_TIMEOUT_MS => $milliseconds,
                CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$raw): int {
                    if (strlen($raw) + strlen($chunk) > self::MAX_RESPONSE_BYTES) {
                        return 0;
                    }
                    $raw .= $chunk;
                    return strlen($chunk);
                },
            ]) || curl_exec($curl) === false || curl_getinfo($curl, CURLINFO_RESPONSE_CODE) !== 200
                    || strtolower(trim(explode(';', (string)curl_getinfo($curl, CURLINFO_CONTENT_TYPE), 2)[0]))
                        !== 'application/json') {
                return null;
            }
        } finally {
            curl_close($curl);
        }
        if (hrtime(true) - $start >= 5_000_000_000 || time() >= $expiry) {
            return null;
        }
        $reply = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        if (!self::exact_keys($reply, ['version', 'requestRef', 'ownerRunId', 'role', 'status',
                    'expiresAtExclusive', 'evidence', 'payment'])
                || $reply['version'] !== 'clear-moodle-course-read-response.1'
                || $reply['requestRef'] !== $ref || $reply['ownerRunId'] !== $this->run || $reply['role'] !== $role
                || $reply['status'] !== 'OK'
                || !is_int($reply['expiresAtExclusive']) || $reply['expiresAtExclusive'] <= time()
                || $reply['expiresAtExclusive'] > $expiry
                || !is_array($reply['evidence']) || !is_array($reply['payment'])
                || ($reply['payment']['requestRef'] ?? null) !== $ref
                || !is_int($reply['payment']['expiresAtExclusive'] ?? null)
                || $reply['expiresAtExclusive'] > $reply['payment']['expiresAtExclusive']) {
            return null;
        }
        return new course_projection($reply['evidence'], $reply['payment'], $this->synthetic, $reply['expiresAtExclusive']);
    }

    public static function exact_keys(mixed $value, array $keys): bool {
        return is_array($value) && count($value) === count($keys) && !array_diff($keys, array_keys($value));
    }

    private static function valid_ref(string $value): bool {
        return (bool)preg_match('/\A[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\z/', $value);
    }
}
