<?php
namespace clear_moodle_probe;

require_once __DIR__.'/../synthetic-profile/profile.php';
require_once __DIR__.'/wire.php';

/**
 * Isolated POST dispatch candidate. The future peer boundary must authenticate the exact
 * bytes and return a strictly decoded DTO. This file registers no HTTP endpoint.
 */
function dispatch_observations(
    string $method,
    string $target,
    string $body,
    callable $reader,
    ?callable $verified_request = null
): array {
    $rejected = ['code' => 'REJECTED'];
    if ($target !== '/observations') {
        return [404, $rejected];
    }
    if ($method !== 'POST') {
        return [405, $rejected];
    }
    if (strlen($body) > 16384) {
        return [413, $rejected];
    }
    if ($verified_request === null) {
        return [503, $rejected];
    }
    try {
        $request = $verified_request($method, $target, $body);
        if (!is_array($request)) {
            return [403, $rejected];
        }
        wire_request($request, 'observations');
        return [200, $reader($request)];
    } catch (\Throwable $error) {
        return [403, $rejected];
    }
}

function observations_route(
    string $method,
    string $target,
    string $body,
    array $profile,
    ?callable $verified_request = null
): array {
    require_once __DIR__.'/adapter.php';
    return dispatch_observations(
        $method, $target, $body, static fn(array $request): array => observe($request, $profile), $verified_request
    );
}
