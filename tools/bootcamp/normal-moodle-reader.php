<?php
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require_once $CFG->libdir . '/externallib.php';
require_once $CFG->dirroot . '/webservice/lib.php';
if ($CFG->wwwroot !== 'https://127.0.0.1:9477' || $CFG->dbhost !== 'db') {
    throw new RuntimeException('ACTIVITY_READER_SCOPE');
}
$scope = json_decode(file_get_contents('/activity-reader-scope.json'), true, 4, JSON_THROW_ON_ERROR);
$request = json_decode(stream_get_contents(STDIN), true, 4, JSON_THROW_ON_ERROR);
$service = (int) $scope['serviceId'];
$user = 3;
if ($service !== 2 || $scope['userId'] !== $user) {
    throw new RuntimeException('ACTIVITY_READER_ACCOUNT');
}
$allowed = ['core_webservice_get_site_info', 'core_course_get_contents', 'core_completion_get_activities_completion_status',
    'mod_assign_get_assignments', 'mod_assign_get_submission_status'];
$selection = $scope['forumSelection'] ?? null;
if ($selection !== null) {
    if ($selection['postId'] !== 3 || $selection['discussionId'] !== 3 || $selection['courseId'] !== 2
        || $selection['forumId'] !== 3 || $selection['authorId'] !== 3 || $selection['cmId'] !== 5) {
        throw new RuntimeException('ACTIVITY_READER_SCOPE');
    }
    $allowed = array_merge($allowed, ['mod_forum_get_forums_by_courses', 'mod_forum_get_forum_discussions', 'mod_forum_get_discussion_post']);
}
if (in_array($request['action'], ['prepare', 'issue'], true)) {
if (!$DB->record_exists('external_services_users', ['externalserviceid' => $service, 'userid' => $user])) {
    throw new RuntimeException('ACTIVITY_READER_ACCOUNT');
}
$members = $DB->get_fieldset_select('external_services_users', 'userid', 'externalserviceid = ?', [$service]);
if (count($members) !== 1 || (int)reset($members) !== $user) { throw new RuntimeException('ACTIVITY_READER_ACCOUNT'); }
$participant = $DB->get_record('user', ['id' => $user, 'deleted' => 0, 'suspended' => 0], '*', MUST_EXIST);
$cm = get_coursemodule_from_id('assign', 4, 2, false, MUST_EXIST);
if ((int)$cm->instance !== 1 || !is_enrolled(context_course::instance(2), $participant, '', true)
    || !has_capability('mod/assign:submit', context_module::instance(4), $participant)) {
    throw new RuntimeException('ACTIVITY_READER_ACCOUNT');
}
if ($selection !== null) {
    foreach (['createdAt','modifiedAt','observedAt','expiresAtExclusive'] as $field) {
        if (!is_int($selection[$field] ?? null) || $selection[$field] <= 0) throw new RuntimeException('ACTIVITY_READER_SCOPE');
    }
    if ($selection['modifiedAt'] < $selection['createdAt'] || $selection['observedAt'] < $selection['modifiedAt']) throw new RuntimeException('ACTIVITY_READER_SCOPE');
    $post = $DB->get_record('forum_posts', ['id'=>3], 'id,discussion,userid,created,modified,deleted', MUST_EXIST);
    $discussion = $DB->get_record('forum_discussions', ['id'=>3], 'id,forum,course', MUST_EXIST);
    $forumcm = get_coursemodule_from_id('forum', 5, 2, false, MUST_EXIST);
    if ((int)$forumcm->instance !== 3 || (int)$post->discussion !== 3 || (int)$post->userid !== 3 || $post->deleted
        || (int)$discussion->forum !== 3 || (int)$discussion->course !== 2
        || (int)$post->created !== $selection['createdAt'] || (int)$post->modified !== $selection['modifiedAt']
        || time() < $selection['observedAt'] || time() >= $selection['expiresAtExclusive']
        || $selection['expiresAtExclusive'] - $selection['observedAt'] > 3600
        || !has_capability('mod/forum:viewdiscussion', context_module::instance(5), $participant)) {
        throw new RuntimeException('ACTIVITY_READER_ACCOUNT');
    }
}
}
if ($request['action'] === 'prepare') {
    foreach ($DB->get_records('external_services_functions', ['externalserviceid' => $service]) as $row) {
        if (!in_array($row->functionname, $allowed, true)) {
            $DB->delete_records('external_services_functions', ['id' => $row->id]);
        }
    }
    $manager = new webservice();
    foreach ($allowed as $method) {
        if (!$manager->service_function_exists($method, $service)) {
            $manager->add_external_function_to_service($method, $service);
        }
    }
    $DB->set_field('external_services', 'enabled', 1, ['id' => $service, 'restrictedusers' => 1]);
    echo '{"ready":true}';
} elseif ($request['action'] === 'issue') {
    $methods = array_values($DB->get_fieldset_select('external_services_functions', 'functionname', 'externalserviceid = ?', [$service]));
    if (count($methods) !== count($allowed) || array_diff($methods, $allowed) ||
        !$DB->record_exists('external_services', ['id' => $service, 'enabled' => 1, 'restrictedusers' => 1])) {
        throw new RuntimeException('ACTIVITY_READER_SERVICE');
    }
    $expiry = time() + 60;
    $token = external_generate_token(EXTERNAL_TOKEN_PERMANENT, $service, $user, context_system::instance(), $expiry);
    echo json_encode(['token' => $token, 'expiresAtMs' => $expiry * 1000], JSON_THROW_ON_ERROR);
} elseif ($request['action'] === 'revoke' && preg_match('/^[a-f0-9]{32}$/', $request['token'] ?? '')) {
    $DB->delete_records('external_tokens', ['token' => $request['token'], 'externalserviceid' => $service, 'userid' => $user]);
    echo '{"revoked":true}';
} else {
    throw new RuntimeException('ACTIVITY_READER_ACTION');
}
