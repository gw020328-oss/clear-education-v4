<?php
require_once(__DIR__ . '/../../config.php');

$id = required_param('id', PARAM_INT);
$course = get_course($id);
require_login($course);
$context = context_course::instance($course->id);
require_capability('local/clearbridge:view', $context);
if (!is_enrolled($context, null, '', true)) {
    throw new required_capability_exception($context, 'local/clearbridge:view', 'nopermissions', '');
}

$PAGE->set_url(new moodle_url('/local/clearbridge/index.php', ['id' => $course->id]));
$PAGE->set_title(get_string('pluginname', 'local_clearbridge'));
$PAGE->set_heading(format_string($course->fullname));
echo $OUTPUT->header();
echo html_writer::tag('p', get_string('notconnected', 'local_clearbridge'));
echo html_writer::tag('button', get_string('continue', 'local_clearbridge'),
    ['type' => 'button', 'disabled' => 'disabled', 'class' => 'btn btn-secondary']);
echo $OUTPUT->footer();
