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
        $settings = $CFG->local_clearbridge_course_read ?? null;
        $provider = $CFG->local_clearbridge_projection_provider ?? null;
        if (!course_refund::is_demo_course($course->id)
                || ($settings === null && !$provider instanceof \Closure)) {
            return $fallback;
        }
        $userid = (int)$USER->id;
        $role = $student ? 'PARTICIPANT' : 'COURSE_OPERATOR';
        $capability = $student ? 'local/clearbridge:view' : 'local/clearbridge:configure';
        $access = new course_moodle_access((int)$course->id, $userid, $capability);
        $lease = null;
        try {
            if ($access->expires_at() === null) {
                return $fallback;
            }
            if ($settings !== null) {
                $resolve = $CFG->local_clearbridge_course_authority ?? null;
                if (!course_read_client::exact_keys($settings, ['enabled', 'origin', 'ca', 'ownerRunId', 'key', 'synthetic'])
                        || $settings['enabled'] !== true || !is_bool($settings['synthetic']) || !$resolve instanceof \Closure) {
                    return $fallback;
                }
                foreach (['origin', 'ca', 'ownerRunId', 'key'] as $field) {
                    if (!is_string($settings[$field])) {
                        return $fallback;
                    }
                }
                // The installation owner supplies a reference bound to this current
                // Moodle principal and session. Numeric IDs stay inside Moodle.
                $grant = $resolve((int)$course->id, $userid, $role);
                if ($grant instanceof course_authority_lease) {
                    $lease = $grant;
                    $bridge = $CFG->local_clearbridge_course_authority_bridge ?? null;
                    if ($bridge !== null) {
                        if (!$bridge instanceof \Closure) {
                            return $fallback;
                        }
                        $ports = $bridge();
                        if (!course_read_client::exact_keys($ports, ['registry', 'currentness'])
                                || !$ports['registry'] instanceof course_authority_registry
                                || !$ports['currentness'] instanceof course_authority_currentness) {
                            return $fallback;
                        }
                        $lease->attach_bridge($ports['registry'], $ports['currentness']);
                    }
                    $grant = $lease->grant_for((int)$course->id, $userid, $role, $settings['ownerRunId']);
                }
                if (!course_read_client::exact_keys($grant, ['moodleAuthorityRef', 'expiresAtExclusive'])
                        || !is_string($grant['moodleAuthorityRef']) || !is_int($grant['expiresAtExclusive'])) {
                    return $fallback;
                }
                $moodleexpiry = $access->expires_at();
                if ($moodleexpiry === null) {
                    return $fallback;
                }
                $client = new course_read_client($settings['origin'], $settings['ca'], $settings['ownerRunId'],
                    $settings['key'], $settings['synthetic']);
                $result = $client->read($grant['moodleAuthorityRef'], $role, min($moodleexpiry, $grant['expiresAtExclusive']), $lease);
            } else {
                $result = $provider((int)$course->id, $userid, $role);
                if (!$result instanceof course_projection || !$result->synthetic) {
                    return $fallback;
                }
            }
            if (!$result instanceof course_projection) {
                return $fallback;
            }
            $moodleexpiry = $access->expires_at();
            if ($moodleexpiry === null || ($lease !== null && !$lease->bridge_current())) {
                return $fallback;
            }
            $view = course_refund::template_data($student, $result->evidence);
            $payment = course_payment_display::data($result->payment, $result->evidence, $role, time());
            if (!$view['hasrecords'] || $payment === null || time() >= $moodleexpiry
                    || ($result->expiresAtExclusive !== null && time() >= $result->expiresAtExclusive)) {
                return $fallback;
            }
            $view['payment'] = $payment;
            $view['synthetic'] = $result->synthetic;
            return $view;
        } catch (\Throwable $error) {
            // No upstream exception, DTO or credential should reach the course page.
            return $fallback;
        } finally {
            if ($lease !== null && !$lease->revoke()) {
                return $fallback;
            }
        }
    }
}
