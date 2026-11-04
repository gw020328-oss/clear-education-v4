<?php
// Opt-in include in config.php BEFORE lib/setup.php. Never auto-installed by the plugin.
// The HTTP upstream must be private: only the nonce-stripping HTTPS gateway may reach it.
if (!isset($CFG) || !is_object($CFG)) {
    throw new RuntimeException('CLEAR_NATIVE_DOCUMENT_CONFIG');
}
$clearpath = explode('?', $_SERVER['REQUEST_URI'] ?? '', 2)[0];
$cleardocuments = ['/local/clearbridge/index.php', '/local/clearbridge/configure.php'];
if ((!defined('CLI_SCRIPT') || !CLI_SCRIPT) && in_array($clearpath, $cleardocuments, true)) {
    $clearnonce = $_SERVER['HTTP_X_CLEAR_DOCUMENT_NONCE'] ?? null;
    if (!is_string($clearnonce) || preg_match('/\A[A-Za-z0-9+\/]{32}\z/', $clearnonce) !== 1
            || !empty($CFG->moodlepageclass) || !empty($CFG->moodlepageclassfile)
            || ($_SERVER['SCRIPT_NAME'] ?? '') !== $clearpath) {
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        exit('CLEAR_NATIVE_DOCUMENT_UNAVAILABLE');
    }
    $CFG->moodlepageclass = '\\local_clearbridge\\native_document_page';
    $CFG->moodlepageclassfile = __DIR__ . '/classes/native_document_page.php';
}
unset($clearpath, $cleardocuments, $clearnonce);
