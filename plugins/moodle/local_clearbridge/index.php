<?php
require_once(__DIR__ . '/../../config.php');

$id = required_param('id', PARAM_INT);
$course = get_course($id);
require_login($course, false);
$context = context_course::instance($course->id);
require_capability('local/clearbridge:view', $context);
if (!is_enrolled($context, null, '', true)) {
    throw new required_capability_exception($context, 'local/clearbridge:view', 'nopermissions', '');
}

$PAGE->set_url(new moodle_url('/local/clearbridge/index.php', ['id' => $course->id]));
$PAGE->set_cacheable(false);
$PAGE->set_title(get_string('pluginname', 'local_clearbridge'));
$PAGE->set_heading(format_string($course->fullname));
$view = \local_clearbridge\course_refund::is_demo_course($course->id)
    ? \local_clearbridge\course_projection_page::data($course, true) : null;
echo $OUTPUT->header();
if ($view !== null) {
    echo $OUTPUT->render_from_template('local_clearbridge/course_refund', $view);
    echo html_writer::link($PAGE->url, get_string('refreshstatus', 'local_clearbridge'));
} else {
    echo html_writer::tag('p', get_string('notconnected', 'local_clearbridge'));
}
echo $OUTPUT->footer();
