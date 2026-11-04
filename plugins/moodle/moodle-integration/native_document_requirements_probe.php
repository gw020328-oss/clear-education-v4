<?php
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
require '/candidate/classes/native_document_requirements.php';
$_SERVER['REQUEST_URI'] = $_SERVER['SCRIPT_NAME'] = '/local/clearbridge/index.php';
$_SERVER['HTTP_X_CLEAR_DOCUMENT_NONCE'] = str_repeat('A', 32);
$requirements = new \local_clearbridge\native_document_requirements();
$method = new ReflectionMethod($requirements, 'trusted_requirements');
$source = html_writer::script('window.trusted = true;');
$valid = $method->invoke($requirements, $source);
assert(str_contains($valid, '<script nonce="' . str_repeat('A', 32) . '">'));
foreach (['<div>course HTML</div>', '<script>window.untrusted=true;</script>',
        html_writer::script('window.x=1;</script><script>window.untrusted=true;'),
        '<script nonce="attacker">bad()</script>'] as $bad) {
    try {
        $method->invoke($requirements, $bad);
        throw new RuntimeException('Expected untrusted fragment rejection');
    } catch (RuntimeException $error) {
        assert($error->getMessage() === 'CLEAR_NATIVE_REQUIREMENTS_FORMAT');
    }
}
class clear_untrusted_skip_renderer extends core_renderer {
    public function render_skip_links($links) {
        return html_writer::script('window.untrustedSkip = true;');
    }
}
$renderer = new clear_untrusted_skip_renderer($PAGE, RENDERER_TARGET_GENERAL);
$top = $requirements->get_top_of_body_code($renderer);
assert(str_starts_with($top, html_writer::script('window.untrustedSkip = true;')));
assert(substr_count($top, 'nonce=') === 1);
echo "PASS strict emitter grammar, breakout rejection, and untrusted skip-link isolation\n";
