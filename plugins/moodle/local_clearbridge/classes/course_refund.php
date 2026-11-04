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

    // The optional DTO is for a future owner-verified server composition, never a request parameter.
    public static function template_data(bool $student, ?array $dto = null): array {
        $criteria = [
            'activity-complete' => 'lecture',
            'assignment-submitted' => 'assignment',
            'reflection-topics' => 'reflection',
            'python-basic-certificate' => 'certificate',
        ];
        $rows = course_evidence_display::rows($dto, $student, $criteria);
        $conditions = [];
        foreach ($criteria as $id => $condition) {
            $conditions[] = [
                'name' => get_string('condition' . $condition, 'local_clearbridge'),
                'source' => get_string('source' . $condition, 'local_clearbridge'),
                'record' => $rows[$id] ?? null,
            ];
        }
        return ['student' => $student, 'hasrecords' => $rows !== null, 'conditions' => $conditions];
    }
}
