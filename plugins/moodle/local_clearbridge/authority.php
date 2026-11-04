<?php
// Existing Moodle server endpoint. NO_MOODLE_COOKIES is set before bootstrap.
ini_set('display_errors', '0');
$level = ob_get_level();
$started = hrtime(true);
ob_start();
$status = 403;
$output = '{"code":"REJECTED"}';
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'
            || ($_SERVER['REQUEST_URI'] ?? '') !== '/local/clearbridge/authority.php'
            || !empty($_SERVER['HTTP_COOKIE']) || !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        throw new RuntimeException('Rejected');
    }
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if (!is_string($raw) || strlen($raw) > 4096) {
        throw new RuntimeException('Rejected');
    }
    define('NO_MOODLE_COOKIES', true);
    require __DIR__ . '/../../config.php';
    if (session_status() === PHP_SESSION_ACTIVE) {
        throw new RuntimeException('Rejected');
    }
    $config = $CFG->local_clearbridge_authority_service ?? null;
    $factory = $CFG->local_clearbridge_course_authority_bridge ?? null;
    if (!is_array($config) || !$factory instanceof Closure) {
        throw new RuntimeException('Rejected');
    }
    [$request, $nonce, $timestamp] = \local_clearbridge\course_authority_currentness::authenticate(
        $_SERVER, $raw, $config, $CFG->local_clearbridge_course_read['key'] ?? '');
    $ports = $factory();
    \local_clearbridge\course_authority_currentness::require_rule(
        \local_clearbridge\course_read_client::exact_keys($ports, ['registry', 'currentness'])
        && $ports['registry'] instanceof \local_clearbridge\course_authority_registry
        && $ports['currentness'] instanceof \local_clearbridge\course_authority_currentness);
    $ports['registry']->claim_nonce($nonce, $timestamp);
    $result = $ports['currentness']->respond($request, $ports['registry']);
    if ($result['status'] === 'OK' && (time() >= $result['expiresAtExclusive']
            || hrtime(true) - $started >= 5_000_000_000)) {
        $result['status'] = 'UNAVAILABLE';
        foreach (['installationRef', 'installationGeneration', 'authorityEpoch', 'courseRef', 'subjectRef',
                'actorRef', 'expiresAtExclusive'] as $field) {
            $result[$field] = null;
        }
    }
    $output = json_encode($result, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $status = 200;
} catch (Throwable $error) {
    // No exception text, configuration or private record reaches the peer.
}
while (ob_get_level() > $level) {
    ob_end_clean();
}
header_remove('Set-Cookie');
header('Content-Type: application/json');
header('Cache-Control: no-store');
http_response_code($status);
echo $output;
