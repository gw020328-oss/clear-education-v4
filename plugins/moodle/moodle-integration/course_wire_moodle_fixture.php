<?php
// Explicitly mounted only in the local synthetic browser installation.
if (getenv('CLEAR_COURSE_WIRE_FIXTURE') !== '1' || $CFG->wwwroot !== 'http://127.0.0.1:18772') {
    throw new RuntimeException('Wrong synthetic wire fixture environment');
}
$case = $_SERVER['HTTP_X_CLEAR_UI_FIXTURE'] ?? '';
$CFG->local_clearbridge_course_read = [
    'enabled' => $case !== 'disabled',
    'origin' => $case === 'hostname' ? 'https://owner-wrong-host:18443' : 'https://clear-c-course-wire-owner:18443',
    'ca' => $case === 'ca' ? '/wire-ca/wrong-ca.pem' : '/wire-ca/ca.pem',
    'ownerRunId' => 'course-wire-fixture',
    'key' => str_repeat($case === 'bad-key' ? 'e' : 'd', 64),
    'synthetic' => true,
];
$CFG->local_clearbridge_course_authority = static function (int $course, int $userid, string $role) use ($case): ?array {
    global $CFG, $DB;
    $teachers = ['teacher', 'revoke-role'];
    $cases = array_merge($teachers, ['student', 'readback', 'expired', 'mismatch', 'wrong-run', 'wrong-ref',
        'unavailable', 'redirect', 'revoke-enrol', 'hostname', 'ca', 'bad-key']);
    $teacher = in_array($case, $teachers, true);
    $user = $teacher ? 'synthetic-editingteacher' : 'synthetic-student';
    if (!in_array($case, $cases, true) || $course !== (int)$CFG->local_clearbridge_demo_courseid
            || $role !== ($teacher ? 'COURSE_OPERATOR' : 'PARTICIPANT')
            || (int)$DB->get_field('user', 'id', ['username' => $user, 'suspended' => 0, 'deleted' => 0]) !== $userid) {
        return null;
    }
    $mode = in_array($case, ['hostname', 'ca', 'bad-key'], true) ? 'student' : $case;
    return ['moodleAuthorityRef' => 'fixture-' . $mode, 'expiresAtExclusive' => time() + 5];
};
