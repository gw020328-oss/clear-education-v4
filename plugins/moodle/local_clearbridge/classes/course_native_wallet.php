<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/** Opt-in composition only. All operations still pass login_action.php authority checks. */
final class course_native_wallet {
    public static function enable_page(\moodle_page $page, int $course, int $user, string $role): bool {
        global $CFG;
        try {
            if (!$page instanceof native_document_page || !in_array($role, ['PARTICIPANT', 'COURSE_OPERATOR'], true)) {
                return false;
            }
            $login = course_login_authority::config();
            $scope = course_login_authority::scope($login['ownerRunId']);
            if (course_login_authority::role($scope, $course, $user) !== $role || is_siteadmin($user)) {
                return false;
            }
            $access = new course_moodle_access($course, $user, course_login_authority::capability($role), true);
            if ($access->expires_at() === null) {
                return false;
            }
            $config = $CFG->local_clearbridge_native_wallet ?? null;
            course_authority_currentness::require_rule(course_read_client::exact_keys($config,
                ['appId', 'origin', 'redirectUri', 'phase', 'chainId', 'rpcUrl', 'instanceId', 'surface'])
                && $config['surface'] === 'MOODLE_NATIVE' && $config['origin'] === $CFG->wwwroot
                && $config['origin'] === $login['browserOrigin']
                && preg_match('~\Ahttps://127\.0\.0\.1:([1-9][0-9]{3,4})\z~', $config['origin'], $port) === 1
                && (int)$port[1] >= 1024 && (int)$port[1] <= 65535
                && $config['redirectUri'] === $config['origin'] . '/local/clearbridge/wallet-return'
                && $config['phase'] === 'ACTIVE_LOCAL_TEST'
                && is_int($config['chainId']) && $config['chainId'] > 0 && $config['chainId'] <= 9007199254740991
                && is_string($config['rpcUrl'])
                && preg_match('~\Ahttp://127\.0\.0\.1:([1-9][0-9]{3,4})\z~', $config['rpcUrl'], $rpcport) === 1
                && (int)$rpcport[1] >= 1024 && (int)$rpcport[1] <= 65535
                && is_string($config['instanceId']) && preg_match('/\A0x[a-f0-9]{64}\z/', $config['instanceId']) === 1
                && ($config['appId'] === null || (is_string($config['appId'])
                    && preg_match('/\A[a-z0-9]{10,80}\z/', $config['appId']) === 1))
                && ($role !== 'PARTICIPANT' || $config['appId'] !== null));
            $config['role'] = $role === 'PARTICIPANT' ? 'participant' : 'operator';
            $config['courseId'] = $course;
            // A's native login closure uses this only for the fixed same-origin C POST route.
            $config['sesskey'] = sesskey();
            if (!$page->requires instanceof native_document_requirements) {
                return false;
            }
            $page->requires->enable_wallet_module();
            $page->requires->js_call_amd('local_clearbridge/course_native_wallet', 'init', [$config]);
            return true;
        } catch (\Throwable $error) {
            return false;
        }
    }
}
