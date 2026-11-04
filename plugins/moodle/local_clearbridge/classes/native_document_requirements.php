<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/** Moodle 4.5.15 requirements emitters only. Never pass rendered page/course HTML here. */
final class native_document_requirements extends \page_requirements_manager {
    private string $documentnonce;
    private bool $walletmodule = false;

    public function enable_wallet_module(): void {
        if ($this->is_head_done()) {
            throw new \RuntimeException('CLEAR_NATIVE_REQUIREMENTS_FORMAT');
        }
        $this->walletmodule = true;
    }

    public function __construct() {
        $path = explode('?', $_SERVER['REQUEST_URI'] ?? '', 2)[0];
        $nonce = $_SERVER['HTTP_X_CLEAR_DOCUMENT_NONCE'] ?? null;
        if (!in_array($path, ['/local/clearbridge/index.php', '/local/clearbridge/configure.php'], true)
                || ($_SERVER['SCRIPT_NAME'] ?? '') !== $path
                || !is_string($nonce) || preg_match('/\A[A-Za-z0-9+\/]{32}\z/', $nonce) !== 1) {
            throw new \RuntimeException('CLEAR_NATIVE_DOCUMENT_UNAVAILABLE');
        }
        $this->documentnonce = $nonce;
        parent::__construct();
    }

    /** Accept only the exact emitter grammar reviewed in Moodle 4.5.15. */
    private function trusted_requirements(string $fragment): string {
        $result = '';
        $offset = 0;
        while ($offset < strlen($fragment)) {
            $rest = substr($fragment, $offset);
            if (preg_match('~\A<script>\n//<!\[CDATA\[\n(.*?)\n//\]\]>\n</script>\n~s', $rest, $match)) {
                // Reject HTML parser breakout, including an accidental raw script tag in registered code.
                if (preg_match('~</?script\b~i', $match[1])) {
                    throw new \RuntimeException('CLEAR_NATIVE_REQUIREMENTS_FORMAT');
                }
                $result .= '<script nonce="' . $this->documentnonce . '">' . substr($match[0], 8);
            } else if (preg_match('~\A(?:\s+|<link\b[^<>]*>|<script src="[^"<>]*"></script>\n'
                    . '|<script id="firstthemesheet" type="text/css">/\*\* Required in order to fix style inclusion problems in IE with YUI \*\*/</script>)~',
                    $rest, $match)) {
                // Linked resources retain the gateway's existing self/source policy. No nonce elevation.
                $result .= $match[0];
            } else {
                throw new \RuntimeException('CLEAR_NATIVE_REQUIREMENTS_FORMAT');
            }
            $offset += strlen($match[0]);
        }
        return $result;
    }

    public function get_head_code(\moodle_page $page, \core_renderer $renderer) {
        $page->set_cacheable(false);
        $head = $this->trusted_requirements(parent::get_head_code($page, $renderer))
            // YUI 3.18.1 otherwise discovers its global via Function('return this').
            // Its supported global option avoids that eval without changing core or CSP.
            . $this->trusted_requirements(\html_writer::script('YUI_config.global = window;'))
            . \html_writer::empty_tag('meta', ['name' => 'sc-nonce', 'content' => $this->documentnonce]) . "\n";
        if ($this->walletmodule) {
            $head .= \html_writer::tag('script', '', ['type' => 'module', 'nonce' => $this->documentnonce,
                'src' => '/clear-assets/moodle-native.js']) . "\n";
        }
        return $head;
    }

    public function get_top_of_body_code(\renderer_base $renderer) {
        $fragment = parent::get_top_of_body_code($renderer);
        // This parent fragment includes theme-rendered skip links. Touch only its fixed final script.
        $tail = \html_writer::script("document.body.className += ' jsenabled';") . "\n";
        if (!str_ends_with($fragment, $tail)) {
            throw new \RuntimeException('CLEAR_NATIVE_REQUIREMENTS_FORMAT');
        }
        return substr($fragment, 0, -strlen($tail)) . $this->trusted_requirements($tail);
    }

    public function get_end_code() {
        return $this->trusted_requirements(parent::get_end_code());
    }
}
