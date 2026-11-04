<?php
defined('MOODLE_INTERNAL') || die();

function local_clearbridge_extend_navigation_course(
    navigation_node $navigation, stdClass $course, context_course $context
): void {
    if (has_capability('local/clearbridge:view', $context) && is_enrolled($context, null, '', true)) {
        $navigation->add(get_string('pluginname', 'local_clearbridge'),
            new moodle_url('/local/clearbridge/index.php', ['id' => $course->id]));
    }
    if (has_capability('local/clearbridge:configure', $context)) {
        $navigation->add(get_string('configure', 'local_clearbridge'),
            new moodle_url('/local/clearbridge/configure.php', ['id' => $course->id]));
    }
}
