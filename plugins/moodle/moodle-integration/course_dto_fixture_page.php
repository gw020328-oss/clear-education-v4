<?php
/**
 * Isolated HTTP fixture mounted by an explicit test Apache alias. Never in the plugin ZIP.
 * Test grants and DTOs below do not implement an owner protocol.
 */
if (getenv('CLEAR_ISOLATED_COURSE_DTO') !== '1' || ($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(404);
    exit;
}
require '/var/www/html/config.php';
if ($CFG->wwwroot !== 'http://127.0.0.1:18770') {
    http_response_code(404);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$student = $path === '/__course-dto/student.php';
if (!$student && $path !== '/__course-dto/teacher.php') {
    http_response_code(404);
    exit;
}
$id = required_param('id', PARAM_INT);
$course = get_course($id);
require_login($course, false);
$context = context_course::instance($course->id);
$capability = $student ? 'local/clearbridge:view' : 'local/clearbridge:configure';
require_capability($capability, $context);
if (isguestuser() || !is_enrolled($context, null, '', true)) {
    throw new required_capability_exception($context, $capability, 'nopermissions', '');
}
$role = $student ? 'PARTICIPANT' : 'COURSE_OPERATOR';

// Public synthetic tokens only. A token never selects the Moodle user, role, course or participant.
// The server fixture binds an existing synthetic user and one known course to a fixed test record.
$resolve = static function () use ($DB, $USER, $course, $context, $role, $capability): ?array {
    if (!\local_clearbridge\course_refund::is_demo_course($course->id)
            || !isloggedin() || isguestuser() || !has_capability($capability, $context)
            || !is_enrolled($context, null, '', true)) {
        return null;
    }
    $grant = match ($_SERVER['HTTP_X_CLEAR_TEST_GRANT'] ?? '') {
        'fixture-student' => ['synthetic-student', 'PARTICIPANT', 'OK'],
        'fixture-operator' => ['synthetic-editingteacher', 'COURSE_OPERATOR', 'OK'],
        'fixture-student-b-error' => ['synthetic-student', 'PARTICIPANT', 'B_ERROR'],
        'fixture-student-a-error' => ['synthetic-student', 'PARTICIPANT', 'A_ERROR'],
        'fixture-student-revoked' => ['synthetic-student', 'PARTICIPANT', 'REVOKED_AFTER_READ'],
        default => null,
    };
    if ($grant === null || $grant[1] !== $role) {
        return null;
    }
    $principal = $DB->get_field('user', 'id', ['username' => $grant[0], 'deleted' => 0, 'suspended' => 0]);
    return (int)$principal === (int)$USER->id ? $grant : null;
};

$dto = null;
$payment = null;
$grant = $resolve();
if ($grant !== null) {
    try {
        $readb = static function () use ($grant, $role): array {
            if ($grant[2] === 'B_ERROR') {
                throw new RuntimeException('Synthetic B read error');
            }
            $rows = [];
            foreach (['activity-complete', 'assignment-submitted', 'reflection-topics', 'python-basic-certificate'] as $index => $key) {
                $rows[] = [
                    'criterionId' => $key,
                    'recordedState' => $index === 3 ? 'MET' : 'NOT_MET',
                    'source' => ['currentness' => 'UNKNOWN', 'connection' => 'UNKNOWN', 'dataMode' => 'SYNTHETIC_FIXTURE'],
                    'evidence' => ['originalHttpAvailable' => false,
                        'availability' => $index === 0 ? 'EXPIRED' : 'VALID_AS_RECORDED'],
                ];
            }
            return ['version' => 'clear-moodle-course-evidence.1', 'role' => $role, 'applicationActive' => true,
                'usableForPayment' => false, 'criteria' => $rows];
        };
        $reada = static function () use ($grant): array {
            if ($grant[2] === 'A_ERROR') {
                throw new RuntimeException('Synthetic A read error');
            }
            // Display canary only. Not a proposed A schema, payable state or real transaction.
            return ['label' => 'Synthetic receipt display sample: 100 TEST. No transfer occurred.'];
        };
        $candidate = $readb();
        $sample = $reada();
        // The test injects a revoked authority after the reads. A final failure discards both views.
        $final = $grant[2] === 'REVOKED_AFTER_READ' ? null : $resolve();
        if ($grant === $final) {
            $dto = $candidate;
            $payment = $sample;
        }
    } catch (RuntimeException $error) {
        // Intentionally do not send upstream failure details to the browser.
    }
}

$PAGE->set_url(new moodle_url($path, ['id' => $course->id]));
$PAGE->set_cacheable(false);
$PAGE->set_title('Synthetic course DTO integration fixture');
$PAGE->set_heading(format_string($course->fullname));
$view = \local_clearbridge\course_refund::template_data($student, $dto);
echo $OUTPUT->header();
echo html_writer::tag('p', 'Synthetic test fixture. No actual CLEAR authority or payment.');
if (!$view['hasrecords'] || $payment === null) {
    echo html_writer::tag('p', 'CLEAR projections unavailable.');
}
echo $OUTPUT->render_from_template('local_clearbridge/course_refund', $view);
if ($view['hasrecords'] && $payment !== null) {
    echo html_writer::tag('p', s($payment['label']));
}
echo $OUTPUT->footer();
