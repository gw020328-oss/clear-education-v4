<?php
// The owner bridge never starts a browser session.
use local_clearbridge\course_authority_currentness as current;
use local_clearbridge\course_authority_registry as registry;
use local_clearbridge\course_login_authority as login;

ini_set('display_errors', '0');
$level = ob_get_level();
$started = hrtime(true);
$wall = time();
ob_start();
$status = 403;
$output = '{"code":"REJECTED"}';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'
            || ($_SERVER['REQUEST_URI'] ?? '') !== '/local/clearbridge/login_authority.php'
            || !empty($_SERVER['HTTP_COOKIE']) || !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        throw new RuntimeException('Rejected');
    }
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if (!is_string($raw) || strlen($raw) > 4096) {
        throw new RuntimeException('Rejected');
    }
    define('NO_MOODLE_COOKIES', true);
    require __DIR__ . '/../../config.php';
    current::require_rule(session_status() !== PHP_SESSION_ACTIVE);
    $config = login::config();
    [$envelope, $nonce, $timestamp] = current::authenticate_transport($_SERVER, $raw,
        $CFG->local_clearbridge_authority_service, $config['key'], login::PATH);
    current::require_rule(\local_clearbridge\course_read_client::exact_keys($envelope, ['operation', 'request'])
        && is_string($envelope['operation']) && is_array($envelope['request']));
    $q = $envelope['request'];
    login::request_shape($envelope['operation'], $q);
    $now = time();
    current::require_rule($q['ownerRunId'] === $config['ownerRunId'] && $q['expiresAtExclusive'] > $now
        && $q['expiresAtExclusive'] <= $now + 5);
    $registry = new registry($config['registry'], $config['ownerRunId'], true);
    $registry->claim_nonce($nonce, $timestamp);
    $grant = login::respond($envelope['operation'], $q, $config, $registry);
    $mono = hrtime(true);
    $now = time();
    current::require_rule($now >= $wall && $now < $q['expiresAtExclusive']
        && $mono >= $started && $mono - $started < 5_000_000_000);
    $output = json_encode([
        'version' => 'clear-moodle-login-authority-result.1',
        'requestRef' => $q['requestRef'],
        'ownerRunId' => $q['ownerRunId'],
        'moodleAuthorityRef' => $q['moodleAuthorityRef'],
        'role' => $q['role'],
        'intentRef' => $q['intentRef'] ?? null,
        'status' => 'OK',
    ] + $grant, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $status = 200;
} catch (Throwable $error) {
    // Reject with no Moodle details, IDs, request body or proof.
}
while (ob_get_level() > $level) {
    ob_end_clean();
}
header_remove('Set-Cookie');
header('Content-Type: application/json');
header('Cache-Control: no-store');
http_response_code($status);
echo $output;
