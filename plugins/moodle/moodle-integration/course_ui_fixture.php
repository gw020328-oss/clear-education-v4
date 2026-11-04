<?php
// CLI only, on a fresh isolated Moodle database with a test host.
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/user/lib.php');

if (!in_array($CFG->wwwroot, ['http://127.0.0.1:18769', 'http://127.0.0.1:18770', 'http://127.0.0.1:18771', 'http://127.0.0.1:18772'], true) || getenv('CLEAR_ISOLATED_COURSE_UI') !== '1'
        || $DB->count_records('course') !== 1) {
    throw new RuntimeException('Expected a fresh isolated course UI installation');
}
$course = create_course((object)['fullname' => 'Synthetic CLEAR Python', 'shortname' => 'clear-ui',
    'category' => 1, 'enablecompletion' => 1]);
$other = create_course((object)['fullname' => 'Synthetic other course', 'shortname' => 'clear-ui-other',
    'category' => 1]);
$manual = enrol_get_plugin('manual');
foreach (['student', 'editingteacher', 'suspended', 'outsider'] as $actor) {
    $id = user_create_user((object)['username' => 'synthetic-' . $actor,
        'firstname' => 'Synthetic', 'lastname' => $actor, 'email' => $actor . '@example.invalid',
        'password' => 'Public-Synthetic-Only-2026', 'confirmed' => 1, 'lang' => 'en',
        'mnethostid' => $CFG->mnet_localhost_id, 'city' => 'Synthetic', 'country' => 'KR']);
    $role = $DB->get_field('role', 'id', ['shortname' => $actor === 'editingteacher' ? $actor : 'student'],
        MUST_EXIST);
    $enrol = static function ($target, $status) use ($manual, $id, $role): void {
        $instances = enrol_get_instances($target->id, true);
        $instance = null;
        foreach ($instances as $candidate) {
            if ($candidate->enrol === 'manual') {
                $instance = $candidate;
                break;
            }
        }
        if (!$instance || $instance->enrol !== 'manual') {
            throw new RuntimeException('Missing manual enrolment');
        }
        $manual->enrol_user($instance, $id, $role, 0, 0, $status);
    };
    if ($actor !== 'outsider') {
        $enrol($course, $actor === 'suspended' ? ENROL_USER_SUSPENDED : ENROL_USER_ACTIVE);
    }
    if ($actor === 'student') {
        $enrol($other, ENROL_USER_ACTIVE);
    }
}
echo json_encode(['course' => $course->id, 'other' => $other->id], JSON_THROW_ON_ERROR), PHP_EOL;
