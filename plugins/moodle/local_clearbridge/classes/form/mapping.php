<?php
namespace local_clearbridge\form;

defined('MOODLE_INTERNAL') || die();
require_once($CFG->libdir . '/formslib.php');

class mapping extends \moodleform {
    protected function definition(): void {
        $form = $this->_form;
        $form->addElement('hidden', 'id', $this->_customdata['courseid']);
        $form->setType('id', PARAM_INT);
        foreach ($this->_customdata['options'] as $field => $choices) {
            $form->addElement('select', $field, get_string($field, 'local_clearbridge'),
                [0 => get_string('none')] + $choices);
            $form->setType($field, PARAM_INT);
        }
        $this->add_action_buttons();
    }

    public function validation($data, $files): array {
        $errors = parent::validation($data, $files);
        $selected = [];
        foreach ($this->_customdata['options'] as $field => $choices) {
            $id = (int)$data[$field];
            if ($id === 0) {
                continue;
            }
            if (!array_key_exists($id, $choices)) {
                $errors[$field] = get_string('invalidmodule', 'local_clearbridge');
            } else if (isset($selected[$id])) {
                $errors[$field] = get_string('distinctmodules', 'local_clearbridge');
            }
            $selected[$id] = true;
        }
        return $errors;
    }
}
