<?php
// Synthetic CLI process tests for the pre-setup opt-in include (no Moodle session).
$CFG = new stdClass();
$_SERVER['REQUEST_URI'] = $argv[1];
$_SERVER['SCRIPT_NAME'] = $argv[2];
if ($argv[3] !== 'MISSING') {
    $_SERVER['HTTP_X_CLEAR_DOCUMENT_NONCE'] = $argv[3];
}
if (($argv[4] ?? '') === 'conflict') {
    $CFG->moodlepageclass = 'existing_custom_page';
}
require '/candidate/native_document_config.php';
echo json_encode($CFG, JSON_THROW_ON_ERROR);
