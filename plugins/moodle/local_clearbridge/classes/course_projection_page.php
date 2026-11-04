<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * Connect the authenticated Moodle pages to an optional server-only provider.
 */
final class course_projection_page {
    public static function data(\stdClass $course, bool $student): array {
        global $CFG, $USER;

        $fallback = course_refund::template_data($student);
        $provider = $CFG->local_clearbridge_projection_provider ?? null;
        if (!$provider instanceof \Closure || !course_refund::is_demo_course($course->id)) {
            return $fallback;
        }
        $context = \context_course::instance($course->id);
        $userid = (int)$USER->id;
        $role = $student ? 'PARTICIPANT' : 'COURSE_OPERATOR';
        $capability = $student ? 'local/clearbridge:view' : 'local/clearbridge:configure';
        $current = static function () use ($userid, $context, $capability): bool {
            global $USER;
            return isloggedin() && !isguestuser() && (int)$USER->id === $userid
                && has_capability($capability, $context) && is_enrolled($context, null, '', true);
        };
        if (!$current()) {
            return $fallback;
        }

        try {
            $result = $provider((int)$course->id, $userid, $role);
            if (!$result instanceof course_projection || !$current()) {
                return $fallback;
            }
            $view = course_refund::template_data($student, $result->evidence);
            $payment = course_payment_display::data($result->payment, $result->evidence, $role, time());
            if (!$view['hasrecords'] || $payment === null) {
                return $fallback;
            }
            $view['payment'] = $payment;
            $view['synthetic'] = $result->synthetic;
            return $view;
        } catch (\Throwable $error) {
            // No upstream exception, DTO or credential should reach the course page.
            return $fallback;
        }
    }
}
