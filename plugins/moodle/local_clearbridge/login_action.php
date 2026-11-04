<?php
use local_clearbridge\course_authority_currentness as current;
use local_clearbridge\course_login_authority as login;
use local_clearbridge\course_login_client as client;
use local_clearbridge\course_read_client as wire;

ini_set('display_errors', '0');
$level = ob_get_level();
ob_start();
$status = 403;
$reply = ['status' => 'UNAVAILABLE'];
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'
            || ($_SERVER['REQUEST_URI'] ?? '') !== '/local/clearbridge/login_action.php'
            || (int)($_SERVER['CONTENT_LENGTH'] ?? 0) <= 0 || (int)$_SERVER['CONTENT_LENGTH'] > 1024
            || ($_SERVER['CONTENT_TYPE'] ?? '') !== 'application/x-www-form-urlencoded;charset=UTF-8') {
        throw new RuntimeException('Rejected');
    }
    define('AJAX_SCRIPT', true);
    require __DIR__ . '/../../config.php';
    $moodleurl = parse_url($CFG->wwwroot);
    $origin = $moodleurl['scheme'] . '://' . $moodleurl['host'] . (isset($moodleurl['port']) ? ':' . $moodleurl['port'] : '');
    current::require_rule(($_SERVER['HTTP_ORIGIN'] ?? '') === $origin
        && empty($_SERVER['HTTP_AUTHORIZATION']) && empty($_SERVER['PHP_AUTH_USER']));
    $operation = $_POST['operation'] ?? '';
    current::require_rule(in_array($operation, ['start', 'status', 'finish', 'end', 'authorize-command'], true));
    $fields = ['id', 'sesskey', 'operation'];
    if ($operation === 'start') {
        $fields[] = 'challenge';
    } else if ($operation === 'finish') {
        $fields[] = 'finishProof';
    } else if ($operation === 'authorize-command') {
        $fields[] = 'commandHash';
    } else {
        $fields[] = 'intentTarget';
    }
    current::require_rule(wire::exact_keys($_POST, $fields) && is_string($_POST['id'])
        && preg_match('/\A[1-9][0-9]{0,15}\z/', $_POST['id']) === 1 && is_string($_POST['sesskey'])
        && file_get_contents('php://input', false, null, 0, 1025) === http_build_query($_POST, '', '&', PHP_QUERY_RFC1738));
    if (in_array($operation, ['status', 'end'], true)) {
        current::require_rule(login::hex($_POST['intentTarget']));
    } else if ($operation === 'authorize-command') {
        current::require_rule(login::hex($_POST['commandHash']));
    }
    require_sesskey();
    $config = login::config();
    $scope = login::scope($config['ownerRunId']);
    $course = get_course((int)$_POST['id']);
    require_login($course, false, null, false, true);
    $role = login::role($scope, (int)$course->id, (int)$USER->id);
    $context = context_course::instance($course->id);
    require_capability(login::capability($role), $context);
    current::require_rule(is_enrolled($context, null, '', true) && !is_siteadmin()
        && !\core\session\manager::is_loggedinas() && empty($USER->access['rsw']));

    $client = new client($config, $scope, (int)$USER->id, $role);
    $attempt = $SESSION->local_clearbridge_login_intent ?? null;
    $intent = login::attempt_intent($attempt, $scope, $role);
    // A changed or pre-upgrade mapping cannot authorize even an end of the old intent.
    // Explicit start may create a new intent; the old owner attempt retains its original expiry.
    current::require_rule($operation === 'start' || $attempt === null || $intent !== null);
    current::require_rule($operation !== 'authorize-command' || login::hex($intent));
    if ($operation === 'start') {
        current::require_rule(login::hex($_POST['challenge']));
        if (login::hex($intent)) {
            // Replacing an abandoned original tab requires retiring its owner intent first.
            $client->request('end', ['intentRef' => $intent]);
            unset($SESSION->local_clearbridge_login_intent);
        }
        $result = $client->request('start');
        $intent = $result['requestRef'];
        $proofs = client::proofs($config['proofKey'], $config['ownerRunId'], $intent, $result['launchCode'], $_POST['challenge']);
        $SESSION->local_clearbridge_login_intent = ['run' => $config['ownerRunId'], 'role' => $role, 'intent' => $intent,
            'scopeDigest' => login::scope_digest($scope)];
        $reply = ['status' => 'WAITING', 'expiresAtExclusive' => $result['expiresAtExclusive'],
            'launchCode' => $result['launchCode']] + $proofs
            + ['intentTarget' => login::intent_target($config, $scope, $role, $intent, session_id())];
    } else if (in_array($operation, ['status', 'end'], true) && (!login::hex($intent)
            || !hash_equals(login::intent_target($config, $scope, $role, $intent, session_id()), $_POST['intentTarget']))) {
        // A delayed request for an older tab must never select a later SESSION intent.
        // This is neither an owner-revocation receipt nor a connection-success assertion.
        $reply = ['status' => 'NOT_CURRENT'];
    } else if (login::hex($intent)) {
        $fields = ['intentRef' => $intent];
        if ($operation === 'finish') {
            current::require_rule(login::hex($_POST['finishProof']));
            $candidate = $client->request('status', $fields);
            current::require_rule($candidate['status'] === 'RETURN_REQUIRED');
            $fields += ['handback' => $candidate['handback'], 'finishProof' => $_POST['finishProof']];
        } else if ($operation === 'authorize-command') {
            // A's authorizeCommand must confirm CONNECTED and the bound CLEAR context.
            // C never treats UI state, a status projection or this hash alone as write authority.
            $fields['commandHash'] = $_POST['commandHash'];
        }
        $result = $client->request($operation, $fields);
        if ($operation === 'end') {
            unset($SESSION->local_clearbridge_login_intent);
        }
        $reply = $operation === 'authorize-command'
            ? array_intersect_key($result, array_flip(['status', 'requestRef', 'expiresAtExclusive']))
            : ['status' => $result['status']];
    }
    $status = 200;
} catch (Throwable $error) {
    // A lost response leaves the operation uncertain; status on the same Moodle page can recover it.
}
while (ob_get_level() > $level) {
    ob_end_clean();
}
header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
http_response_code($status);
echo json_encode($reply, JSON_THROW_ON_ERROR);
