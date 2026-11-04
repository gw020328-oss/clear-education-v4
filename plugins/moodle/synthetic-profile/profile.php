<?php
namespace clear_synthetic;

const SAFE_MAX = 9007199254740991;
function require_rule(bool $ok, string $code): void {
    if (!$ok) {
        throw new \RuntimeException($code);
    }
}
function safe_int($value): int {
    require_rule(is_int($value) && $value >= 0 && $value <= SAFE_MAX, 'UNSAFE_INTEGER');
    return $value;
}
function canonical(array $data): string {
    foreach ($data as &$value) {
        if (is_array($value)) {
            $value = json_decode(canonical($value), true, 512, JSON_THROW_ON_ERROR);
        }
    }
    unset($value);
    if (!array_is_list($data)) {
        ksort($data);
    }
    return json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
}
function validate_profile(array $approved, array $observed): string {
    require_rule(($approved['mode'] ?? null) === 'SYNTHETIC_ONLY' &&
        ($approved['backend'] ?? null) === 'postgres-database-session' &&
        ($approved['moodleVersion'] ?? null) === 2024100715 &&
        ($approved['auth'] ?? null) === ['manual'] &&
        ($approved['enrol'] ?? null) === ['manual'] &&
        ($approved['projection'] ?? null) === 'core-page-manual-01', 'PROFILE_UNSUPPORTED');
    foreach (['hooks','customProfileFields','sitePolicies','timeoutHooks','additionalPlugins',
        'roleOverrides','roleSwitch','loginAs','availability','groups','replication'] as $field) {
        require_rule(array_key_exists($field, $approved) && $approved[$field] === [], 'PROFILE_UNSUPPORTED');
    }
    foreach (['codeInventoryHash','cfgHash','aclHash','queryHash','dependencyHash'] as $field) {
        require_rule(isset($approved[$field]) && preg_match('/^[a-f0-9]{64}$/D', $approved[$field]) === 1, 'PROFILE_PIN');
    }
    require_rule(hash_equals(canonical($approved), canonical($observed)), 'PROFILE_DRIFT');
    return hash('sha256', canonical($approved));
}
function reject_assumed_identity(object $user, array $session): void {
    require_rule(empty($user->realuser) && empty($user->loginascontext) &&
        empty($session['REALUSER']) && empty($session['REALSESSION']) &&
        empty($user->access['rsw']), 'ASSUMED_IDENTITY');
}
