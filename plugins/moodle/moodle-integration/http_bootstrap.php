<?php
// Disposable fixture only: loaded before Moodle config; core is never patched.
if(getenv('CLEAR_ACTUAL_MOODLE_PROBE')!=='1' || getenv('CLEAR_HTTP_LIFECYCLE_PROBE')!=='1') {
    http_response_code(404);exit;
}
ini_set('display_errors','0');
spl_autoload_register(static function(string $class): void {
    if($class==='clear_moodle_probe\\http_database') {
        require_once __DIR__.'/adapter.php';
        require_once __DIR__.'/http_database.php';
    }
});
