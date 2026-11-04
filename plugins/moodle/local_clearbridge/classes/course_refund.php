<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * Shared display of the fixed policy, with no assessment or payment authority.
 */
final class course_refund {
    public static function is_demo_course(int $courseid): bool {
        global $CFG;
        // The site operator designates the fixed policy course in config.php.
        return $courseid !== SITEID && (string)($CFG->local_clearbridge_demo_courseid ?? '') === (string)$courseid;
    }

    public static function template_data(bool $student): array {
        $conditions = [];
        foreach (['lecture', 'assignment', 'reflection', 'certificate'] as $condition) {
            $conditions[] = [
                'name' => get_string('condition' . $condition, 'local_clearbridge'),
                'source' => get_string('source' . $condition, 'local_clearbridge'),
            ];
        }
        return ['student' => $student, 'conditions' => $conditions];
    }
}
