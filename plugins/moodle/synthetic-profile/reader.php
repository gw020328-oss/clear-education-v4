<?php
namespace clear_synthetic;
require_once __DIR__ . '/profile.php';
require_once __DIR__ . '/privilege_preflight.php';

function read_page($db, array $request, array $binding, callable $clock): array {
    $keys = array_keys($request);
    sort($keys);
    require_rule($keys === ['bindingScopeHash','confirmationRef','issuerEpoch','requestRef','version'] &&
        $request['version'] === 'clear-moodle-observations.3', 'REQUEST_FIELDS');
    foreach (['requestRef','issuerEpoch','bindingScopeHash','confirmationRef'] as $field) {
        require_rule(is_string($request[$field]) && preg_match('/^[a-f0-9]{64}$/D', $request[$field]) === 1,
            'REQUEST_REFERENCE');
        if ($field !== 'requestRef') {
            require_rule(hash_equals($binding[$field], $request[$field]), 'REQUEST_BINDING');
        }
    }
    require_rule($binding['mode'] === 'SYNTHETIC_ONLY', 'PROFILE_UNSUPPORTED');
    foreach (['sessionId','userId','sessionCreatedAt','courseId','moduleId','authorityRevision','sessionGeneration',
        'expiresAtExclusive','idleSeconds','trustEpoch','rosterRevision'] as $field) {
        safe_int($binding[$field]);
    }
    verify_privileges($db);
    $started = safe_int($clock());
    $mono = hrtime(true);
    require_rule(pg_transaction_status($db) === PGSQL_TRANSACTION_IDLE, 'SNAPSHOT_ALREADY_OPEN');
    require_rule(pg_query($db, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY') !== false, 'SNAPSHOT_FAILED');
    try {
        $result = pg_query_params($db, file_get_contents(__DIR__ . '/page.sql'),
            [$binding['sessionId'], $binding['courseId'], $binding['moduleId'], $started, $binding['aclHash']]);
        require_rule($result !== false && pg_num_rows($result) === 1, 'SOURCE_UNAVAILABLE');
        $row = pg_fetch_assoc($result);
        // First query acquired the snapshot after request validation.
        $observed = safe_int($clock());
        foreach (['revision','generation','session_id','userid','timecreated','timemodified','timeend','completion_rows'] as $field) {
            require_rule(ctype_digit($row[$field]) && strlen($row[$field]) <= 16, 'UNSAFE_INTEGER');
            $row[$field] = safe_int((int)$row[$field]);
        }
        require_rule($row['revision'] === $binding['authorityRevision'] &&
            $row['generation'] === $binding['sessionGeneration'] &&
            $row['userid'] === $binding['userId'] && $row['timecreated'] === $binding['sessionCreatedAt'] &&
            hash_equals($binding['installationEpoch'], $row['installation_epoch']) &&
            hash_equals($binding['profileHash'], $row['approved_hash']), 'SOURCE_GENERATION');
        require_rule($row['completion_rows'] <= 1 &&
            ($row['completion_state'] === null || in_array($row['completion_state'], ['0','1'], true)), 'COMPLETION_UNSUPPORTED');
        $checked = safe_int($clock());
        $expires = min($binding['expiresAtExclusive'], $row['timemodified'] + $binding['idleSeconds']);
        if ($row['timeend'] > 0) {
            $expires = min($expires, $row['timeend']);
        }
        safe_int($expires);
        require_rule($started <= $observed && $observed <= $checked && $checked - $started <= 5 &&
            (hrtime(true) - $mono) <= 5000000000 && $checked < $expires &&
            $row['timemodified'] <= $checked, 'SOURCE_EXPIRED');
        require_rule(pg_query($db, 'COMMIT') !== false, 'SNAPSHOT_FAILED');
        return [
            'version' => 'clear-moodle-observations.3', 'requestRef' => $request['requestRef'],
            'installationRef' => $binding['installationRef'], 'courseRef' => $binding['courseRef'],
            'subjectRef' => $binding['subjectRef'], 'audience' => $binding['audience'],
            'issuerEpoch' => $binding['issuerEpoch'], 'trustEpoch' => $binding['trustEpoch'],
            'rosterRevision' => $binding['rosterRevision'], 'bindingScopeHash' => $binding['bindingScopeHash'],
            'confirmationRef' => $binding['confirmationRef'],
            'moodleSessionGeneration' => hash('sha256', canonical([
                'domain' => 'SYNTHETIC_SESSION_GENERATION.1', 'installation' => $binding['installationEpoch'],
                'id' => $row['session_id'], 'generation' => $row['generation'],
            ])),
            'enrolmentRevision' => $row['revision'], 'scope' => 'READ_PREVIEW', 'sourceStatus' => 'OBSERVED_AT',
            'observedAt' => $observed, 'checkedAt' => $checked, 'expiresAtExclusive' => $expires,
            'observations' => [['targetRef' => $binding['targetRef'],
                'state' => $row['completion_state'] === '1' ? 'COMPLETE' : 'INCOMPLETE',
                'observedAt' => $observed]],
        ];
    } catch (\Throwable $error) {
        pg_query($db, 'ROLLBACK');
        throw $error;
    }
}
