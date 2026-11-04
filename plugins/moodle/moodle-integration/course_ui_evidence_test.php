<?php
// Run only via CLI against the isolated Moodle installation.
define('CLI_SCRIPT', true);
require '/var/www/html/config.php';
if ($CFG->wwwroot !== 'http://127.0.0.1:18769') {
    throw new RuntimeException('Expected isolated course UI installation');
}
$PAGE->set_context(context_system::instance());
$PAGE->set_url(new moodle_url('/local/clearbridge/index.php'));
$expect = static function (bool $condition, string $label): void {
    if (!$condition) {
        throw new RuntimeException($label);
    }
    echo "PASS $label\n";
};
$render = static function (?array $dto, bool $student = true) use ($OUTPUT): string {
    return $OUTPUT->render_from_template('local_clearbridge/course_refund',
        \local_clearbridge\course_refund::template_data($student, $dto));
};
$dto = [
    'version' => 'clear-moodle-course-evidence.1',
    'role' => 'PARTICIPANT',
    'applicationActive' => true,
    'usableForPayment' => false,
    'criteria' => [],
];
foreach (['activity-complete', 'assignment-submitted', 'reflection-topics', 'python-basic-certificate'] as $id) {
    $dto['criteria'][] = [
        'criterionId' => $id,
        'recordedState' => in_array($id, ['assignment-submitted', 'reflection-topics'], true) ? 'NOT_MET' : 'MET',
        'source' => ['currentness' => 'UNKNOWN', 'connection' => 'UNKNOWN', 'dataMode' => 'SYNTHETIC_FIXTURE'],
        'evidence' => ['originalHttpAvailable' => false,
            'availability' => $id === 'activity-complete' ? 'EXPIRED' : 'VALID_AS_RECORDED',
            'id' => 'PRIVATE-DISPLAY-CANARY'],
        'pendingUserAction' => 'PRIVATE-ACTION-CANARY',
    ];
}
$dto['criteria'][2]['evidence']['facts'] = [
    'modelExecution' => 'UNKNOWN',
    'topics' => [
        ['topicId' => 'work-performed', 'state' => 'PRESENT', 'span' => ['text' => 'PRIVATE-SPAN-CANARY']],
        ['topicId' => 'problem-solving-process', 'state' => 'PRESENT'],
        ['topicId' => 'learning-takeaway', 'state' => 'MISSING'],
    ],
];
$html = $render($dto);
$expect(str_contains($html, 'Evidence expired') && substr_count($html, 'Met as recorded') === 1
    && str_contains($html, 'Not met as recorded') && str_contains($html, 'Synthetic fixture record')
    && str_contains($html, 'The current source status was not checked.'), 'recorded verdict and expiry stay distinct');
$expect(str_contains($html, 'Lessons learned: Needs more detail as recorded'),
    'reflection guidance labels only the recorded missing topic');
$expect(!str_contains($html, 'PRIVATE-') && !str_contains($html, '<iframe'), 'DTO identifiers and pending actions stay out of HTML');

$inactive = $dto;
$inactive['applicationActive'] = false;
$html = $render($inactive);
$expect(!str_contains($html, 'Met as recorded') && substr_count($html, 'Application inactive') === 4,
    'inactive application suppresses recorded outcome');
$invalid = $dto;
$invalid['criteria'][2]['criterionId'] = 'activity-complete';
$expect(!str_contains($render($invalid), 'Met as recorded'), 'duplicate criterion fails closed');
$invalid = $dto;
$invalid['usableForPayment'] = true;
$expect(!str_contains($render($invalid), 'Met as recorded'), 'wrong payment flag fails closed');
$expect(!str_contains($render($dto, false), 'Met as recorded'), 'different presentation role fails closed');
