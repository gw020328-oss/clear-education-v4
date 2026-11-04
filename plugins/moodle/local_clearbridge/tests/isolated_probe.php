<?php
define('CLI_SCRIPT', true);
if (getenv('CLEAR_ISOLATED_PROBE') !== '1') {
    exit(1);
}
require __DIR__ . '/../../../config.php';
if ($SITE->shortname !== 'clear') {
    throw new RuntimeException('ISOLATED_SITE_REQUIRED');
}
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->dirroot . '/local/clearbridge/lib.php');

function check_result(bool $ok, string $label): void {
    if (!$ok) {
        throw new RuntimeException($label);
    }
    echo "PASS $label\n";
}
$suffix = bin2hex(random_bytes(4));
$course = create_course((object)['fullname' => 'Test Course', 'shortname' => 'clear-test-' . $suffix, 'category' => 1]);
$context = context_course::instance($course->id);
$manual = enrol_get_plugin('manual');
$instance = array_values(array_filter(enrol_get_instances($course->id, true), fn($item) => $item->enrol === 'manual'))[0];
foreach (['editingteacher', 'student'] as $shortname) {
    $userid = user_create_user((object)[
        'username' => 'test-' . $shortname . '-' . $suffix, 'firstname' => 'Synthetic', 'lastname' => $shortname,
        'email' => $shortname . '@example.invalid', 'auth' => 'manual', 'confirmed' => 1,
    ], false, false);
    $roleid = $DB->get_field('role', 'id', ['shortname' => $shortname], MUST_EXIST);
    $manual->enrol_user($instance, $userid, $roleid);
    $teacher = $shortname === 'editingteacher';
    check_result(has_capability('local/clearbridge:configure', $context, $userid) === $teacher, "$shortname configure");
    check_result(has_capability('local/clearbridge:view', $context, $userid) === !$teacher, "$shortname view");
    check_result(is_enrolled($context, $userid, '', true), "$shortname enrolled");
    check_result(!has_capability('local/clearbridge:configure', context_system::instance(), $userid), "$shortname outside scope");
}

$studentid = $userid;
$before = $DB->get_record('user_enrolments', ['userid' => $studentid, 'enrolid' => $instance->id], '*', MUST_EXIST);
$manual->update_user_enrol($instance, $studentid, ENROL_USER_SUSPENDED);
check_result(!is_enrolled($context, $studentid, '', true), 'suspension blocks active enrollment');
$manual->update_user_enrol($instance, $studentid, ENROL_USER_ACTIVE);
$after = $DB->get_record('user_enrolments', ['id' => $before->id], '*', MUST_EXIST);
check_result($after->id === $before->id && $after->status === $before->status,
    'suspend resume retains identity and final status');
$manual->unenrol_user($instance, $studentid);
$manual->enrol_user($instance, $studentid, $roleid);
$new = $DB->get_record('user_enrolments', ['userid' => $studentid, 'enrolid' => $instance->id], '*', MUST_EXIST);
check_result($new->id !== $before->id, 'delete reenrol creates another enrollment row');

$options = ['activity' => [11 => 'Activity'], 'assignment' => [12 => 'Task'], 'reflection' => [13 => 'Review', 12 => 'Task']];
$form = new \local_clearbridge\form\mapping(null, ['courseid' => $course->id, 'options' => $options]);
check_result($form->validation(['activity' => 11, 'assignment' => 12, 'reflection' => 13], []) === [],
    'valid mapping accepted');
check_result(isset($form->validation(['activity' => 99, 'assignment' => 12, 'reflection' => 13], [])['activity']),
    'foreign module rejected');
check_result(isset($form->validation(['activity' => 11, 'assignment' => 12, 'reflection' => 12], [])['reflection']),
    'duplicate mapping rejected');
check_result($form->validation(['activity' => 0, 'assignment' => 0, 'reflection' => 0], []) === [],
    'unconfigured mapping accepted');

$peer = pg_connect('host=' . $CFG->dbhost . ' dbname=' . $CFG->dbname .
    ' user=' . $CFG->dbuser . ' password=' . $CFG->dbpass, PGSQL_CONNECT_FORCE_NEW);
$table = $CFG->prefix . 'user_enrolments';
$sql = "UPDATE $table SET timemodified = $1 WHERE id = $2";
$transaction = $DB->start_delegated_transaction();
$first = $DB->get_field('user_enrolments', 'timemodified', ['id' => $new->id]);
pg_query_params($peer, $sql, [124, $new->id]);
$second = $DB->get_field('user_enrolments', 'timemodified', ['id' => $new->id]);
$transaction->allow_commit();
check_result($first != $second, 'default transaction sees concurrent commit');
// A dedicated PostgreSQL connection avoids Moodle's already-created savepoint.
$snapshot = pg_connect('host=' . $CFG->dbhost . ' dbname=' . $CFG->dbname .
    ' user=' . $CFG->dbuser . ' password=' . $CFG->dbpass, PGSQL_CONNECT_FORCE_NEW);
pg_query($snapshot, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
$read = "SELECT timemodified FROM $table WHERE id = $1";
$first = pg_fetch_result(pg_query_params($snapshot, $read, [$new->id]), 0, 0);
pg_query_params($peer, $sql, [125, $new->id]);
$second = pg_fetch_result(pg_query_params($snapshot, $read, [$new->id]), 0, 0);
pg_query($snapshot, 'COMMIT');
check_result($first == $second, 'dedicated repeatable snapshot remains consistent');
