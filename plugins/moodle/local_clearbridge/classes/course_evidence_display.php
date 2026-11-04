<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * Presentation only for the server-owned B read DTO.
 * Never use this projection for authorization, consent or payment.
 */
final class course_evidence_display {
    private const AVAILABILITY = [
        'MISSING', 'UNAVAILABLE', 'DELETED', 'EXPIRED', 'SUPERSEDED',
        'INVALIDATED', 'APPLICATION_INACTIVE', 'VALID_AS_RECORDED',
    ];
    private const STATES = ['MET', 'NOT_MET', 'MISSING', 'UNKNOWN'];
    private const CONNECTIONS = ['CONNECTED', 'UNCONNECTED', 'UNKNOWN'];
    private const MODES = ['SYNTHETIC_FIXTURE', 'LOCAL_LMS_RECORD', 'RECLAIM_SIGNED_RECORD'];

    /**
     * Map an already authorized DTO to text. Null means render the unavailable state.
     * No identifier, raw evidence, URL, pending action or unknown field is forwarded.
     */
    public static function rows(?array $dto, bool $student, array $criteria): ?array {
        if ($dto === null || ($dto['version'] ?? null) !== 'clear-moodle-course-evidence.1'
                || ($dto['role'] ?? null) !== ($student ? 'PARTICIPANT' : 'COURSE_OPERATOR')
                || ($dto['usableForPayment'] ?? null) !== false
                || !is_bool($dto['applicationActive'] ?? null)
                || !is_array($dto['criteria'] ?? null) || count($dto['criteria']) !== count($criteria)) {
            return null;
        }
        $rows = [];
        foreach ($dto['criteria'] as $row) {
            if (!is_array($row) || !is_string($row['criterionId'] ?? null)) {
                return null;
            }
            $id = $row['criterionId'];
            $availability = $row['evidence']['availability'] ?? null;
            $recorded = $row['recordedState'] ?? null;
            $connection = $row['source']['connection'] ?? null;
            $mode = $row['source']['dataMode'] ?? null;
            if (!isset($criteria[$id]) || isset($rows[$id])
                    || !in_array($availability, self::AVAILABILITY, true)
                    || !in_array($recorded, self::STATES, true)
                    || !in_array($connection, self::CONNECTIONS, true)
                    || ($mode !== null && !in_array($mode, self::MODES, true))
                    || ($row['source']['currentness'] ?? null) !== 'UNKNOWN'
                    || ($row['evidence']['originalHttpAvailable'] ?? null) !== false) {
                return null;
            }
            if (!$dto['applicationActive']) {
                $availability = 'APPLICATION_INACTIVE';
            }
            $status = $availability === 'VALID_AS_RECORDED' ? 'recorded_' . $recorded : 'evidence_' . $availability;
            $rows[$id] = [
                'status' => get_string(strtolower($status), 'local_clearbridge'),
                'connection' => get_string('connection_' . strtolower($connection), 'local_clearbridge'),
                'topics' => $id === 'reflection-topics' && $availability === 'VALID_AS_RECORDED'
                    ? self::reflection_topics($row['evidence']['facts']['topics'] ?? null) : [],
                'provenance' => $mode === null ? null : get_string('mode_' . strtolower($mode), 'local_clearbridge'),
            ];
        }
        return $rows;
    }

    /** Display the recorded topic outcome without source excerpts or model claims. */
    private static function reflection_topics(mixed $facts): array {
        if (!is_array($facts) || count($facts) !== 3) {
            return [];
        }
        $topics = ['work-performed' => 'work', 'problem-solving-process' => 'solving', 'learning-takeaway' => 'learning'];
        $results = [];
        foreach ($facts as $fact) {
            $id = $fact['topicId'] ?? null;
            $state = $fact['state'] ?? null;
            if (!is_string($id) || !isset($topics[$id]) || isset($results[$id])
                    || !in_array($state, ['PRESENT', 'MISSING', 'UNCERTAIN', 'CONFLICT', 'UNKNOWN'], true)) {
                return [];
            }
            $results[$id] = [
                'topic' => get_string('topic_' . $topics[$id], 'local_clearbridge'),
                'outcome' => get_string('topicstate_' . strtolower($state), 'local_clearbridge'),
            ];
        }
        return array_map(static fn($id) => $results[$id], array_keys($topics));
    }
}
