<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();
require_once(__DIR__ . '/native_document_requirements.php');

/** Request-local page class, selected only by the explicit pre-setup include. */
final class native_document_page extends \moodle_page {
    protected function magic_get_requires() {
        if (is_null($this->_requires)) {
            $this->_requires = new native_document_requirements();
            $this->set_cacheable(false);
        }
        return $this->_requires;
    }
}
