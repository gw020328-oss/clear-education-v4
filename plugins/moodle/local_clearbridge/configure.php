<?php
require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . "/completionlib.php");

$id = required_param('id', PARAM_INT);
$course = get_course($id);
require_login($course, false);
$context = context_course::instance($course->id);
require_capability('local/clearbridge:configure', $context);

$url = new moodle_url('/local/clearbridge/configure.php', ['id' => $course->id]);
$PAGE->set_url($url);
$PAGE->set_cacheable(false);
$PAGE->set_title(get_string('configure', 'local_clearbridge'));
$PAGE->set_heading(format_string($course->fullname));

$options = ['activity' => [], 'assignment' => [], 'reflection' => []];
foreach (get_fast_modinfo($course)->get_cms() as $cm) {
    if ($cm->deletioninprogress || !$cm->uservisible) {
        continue;
    }
    $label = format_string($cm->name, true, ['context' => $cm->context]);
    if ($cm->completion != COMPLETION_TRACKING_NONE) {
        $options['activity'][$cm->id] = $label;
    }
    if ($cm->modname === 'assign') {
        $options['assignment'][$cm->id] = $label;
        $options['reflection'][$cm->id] = $label;
    } else if ($cm->modname === 'forum') {
        $options['reflection'][$cm->id] = $label;
    }
}
$key = 'course_' . $course->id;
$form = new \local_clearbridge\form\mapping($url, ['courseid' => $course->id, 'options' => $options]);
if ($form->is_cancelled()) {
    redirect(new moodle_url('/course/view.php', ['id' => $course->id]));
}
if ($data = $form->get_data()) {
    $mapping = [];
    foreach (array_keys($options) as $field) {
        $mapping[$field] = (int)$data->$field;
    }
    set_config($key, json_encode($mapping, JSON_THROW_ON_ERROR), 'local_clearbridge');
    redirect($url, get_string('changessaved'));
}
$saved = json_decode((string)get_config('local_clearbridge', $key), true);
$form->set_data(is_array($saved) ? $saved : []);
$isdemocourse = \local_clearbridge\course_refund::is_demo_course($course->id);
$view = $isdemocourse ? \local_clearbridge\course_projection_page::data($course, false) : null;
if ($view !== null) {
    // The mapping capability alone does not enroll a course operator.
    $view['showconnection'] = is_enrolled($context, null, '', true);
    if ($view['showconnection']) {
        \local_clearbridge\course_native_wallet::enable_page($PAGE, $course->id, $USER->id, 'COURSE_OPERATOR');
    }
}
echo $OUTPUT->header();
if ($view !== null) {
    echo $OUTPUT->render_from_template('local_clearbridge/course_refund', $view);
    echo html_writer::link($url, get_string('refreshstatus', 'local_clearbridge'));
}
echo $OUTPUT->heading(get_string('mappingheading', 'local_clearbridge'), 2);
echo html_writer::tag('p', get_string('mappingnotice', 'local_clearbridge'));
$form->display();
if ($isdemocourse) {
    echo $OUTPUT->heading(get_string('previewheading', 'local_clearbridge'), 2);
    // Operator condition draft panel (display only). course_native_wallet.js mounts it only when
    // the CLEAR operator wallet UI is on this page; otherwise the server-rendered notice stays.
    echo html_writer::div(
        html_writer::tag('p', get_string('previewunavailable', 'local_clearbridge')),
        '',
        ['data-clear-operator-conditions' => '', 'data-course-id' => (string)$course->id]
    );
}
echo $OUTPUT->footer();
