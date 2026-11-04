<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * Recheck the Moodle side of a course read on both sides of the owner call.
 */
final class course_moodle_access {
    private ?array $generation = null;

    public function __construct(
        private readonly int $course,
        private readonly int $user,
        private readonly string $capability,
        private readonly bool $fixedscope = false,
    ) {
    }

    public function expires_at(): ?int {
        global $CFG, $DB, $USER;

        $sid = session_id();
        if (!isloggedin() || isguestuser() || \core\session\manager::is_loggedinas()
                || (int)$USER->id !== $this->user || $sid === '' || session_status() !== PHP_SESSION_ACTIVE
                || (!$this->fixedscope && ltrim((string)($CFG->session_handler_class ?? ''), '\\') !== \core\session\database::class)
                || ($this->fixedscope && (!in_array(ltrim(\core\session\manager::get_handler_class(), '\\'),
                    [\core\session\database::class, \core\session\file::class], true)
                    || !\core\session\manager::session_exists($sid)))
                || !empty($USER->access['rsw'])) {
            return null;
        }
        // Core file and database handlers share tracking rows. The fixed profile
        // additionally checked physical handler existence above, in the original
        // authenticated request only. No SID or session payload leaves Moodle.
        $session = $DB->get_record('sessions', ['sid' => $sid, 'userid' => $this->user], 'id,timecreated,timemodified');
        if (!$session || !$DB->record_exists('user', ['id' => $this->user, 'auth' => 'manual',
                'confirmed' => 1, 'deleted' => 0, 'suspended' => 0])) {
            return null;
        }
        $generation = [(int)$session->id, (int)$session->timecreated];
        if ($this->generation !== null && $generation !== $this->generation) {
            return null;
        }
        $this->generation = $generation;
        $expiry = (int)$session->timemodified + (int)$CFG->sessiontimeout;
        // Moodle's active-enrolment SQL and time rules without the USER.enrol shortcut.
        $enrolend = enrol_get_enrolment_end($this->course, $this->user);
        if ($enrolend === false || $expiry <= time()) {
            return null;
        }
        if ($enrolend > 0) {
            $expiry = min($expiry, $enrolend);
        }

        // Moodle 4.5 reloads assignments and context in this core helper.
        // The helper keeps the role definitions cache, so compare its inputs
        // with the uncached core query before accepting the capability result.
        reload_all_capabilities();
        $context = \context_course::instance($this->course, IGNORE_MISSING);
        if (!$context || !has_capability($this->capability, $context, $this->user)) {
            return null;
        }
        $roleids = [];
        foreach ($USER->access['ra'] ?? [] as $roles) {
            $roleids += $roles;
        }
        $roleids = array_keys($roleids);
        if (get_role_definitions($roleids) != get_role_definitions_uncached($roleids)) {
            return null;
        }
        return $expiry > time() ? $expiry : null;
    }
}
