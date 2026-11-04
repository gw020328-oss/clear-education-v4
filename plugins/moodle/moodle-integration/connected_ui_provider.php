<?php
// Loaded only from config.php in the separate synthetic browser installation.
if (getenv('CLEAR_CONNECTED_UI_FIXTURE') !== '1' || $CFG->wwwroot !== 'http://127.0.0.1:18771') {
    throw new RuntimeException('Wrong synthetic fixture environment');
}

$CFG->local_clearbridge_projection_provider = static function (int $course, int $user, string $role)
        : ?\local_clearbridge\course_projection {
    global $DB, $CFG;
    $case = match ($_SERVER['HTTP_X_CLEAR_UI_FIXTURE'] ?? '') {
        'student' => ['synthetic-student', 'PARTICIPANT', 'INCLUDED'],
        'teacher' => ['synthetic-editingteacher', 'COURSE_OPERATOR', 'INCLUDED'],
        'readback' => ['synthetic-student', 'PARTICIPANT', 'READBACK_UNAVAILABLE'],
        'expired' => ['synthetic-student', 'PARTICIPANT', 'EXPIRED'],
        'mismatch' => ['synthetic-student', 'PARTICIPANT', 'MISMATCH'],
        'error' => ['synthetic-student', 'PARTICIPANT', 'ERROR'],
        default => null,
    };
    if (!$case || $course !== (int)$CFG->local_clearbridge_demo_courseid || $role !== $case[1]
            || (int)$DB->get_field('user', 'id', ['username' => $case[0], 'suspended' => 0, 'deleted' => 0]) !== $user) {
        return null;
    }
    if ($case[2] === 'ERROR') {
        throw new RuntimeException('PRIVATE-FIXTURE-ERROR');
    }
    $decision = ['id' => 'fixture-decision', 'revision' => 1, 'recordedConditionsStatus' => 'NEEDS_SUPPLEMENT'];
    $rows = [];
    foreach (['activity-complete', 'assignment-submitted', 'reflection-topics', 'python-basic-certificate'] as $key) {
        $facts = $key === 'reflection-topics' ? ['topics' => [
            ['topicId' => 'work-performed', 'state' => 'PRESENT'],
            ['topicId' => 'problem-solving-process', 'state' => 'PRESENT'],
            ['topicId' => 'learning-takeaway', 'state' => 'MISSING', 'span' => 'PRIVATE-FIXTURE-SPAN'],
        ]] : null;
        $rows[] = [
            'criterionId' => $key, 'recordedState' => $facts ? 'NOT_MET' : 'MET',
            'source' => ['currentness' => 'UNKNOWN', 'connection' => 'UNKNOWN', 'dataMode' => 'SYNTHETIC_FIXTURE'],
            'evidence' => ['originalHttpAvailable' => false, 'facts' => $facts,
                'availability' => $key === 'activity-complete' ? 'EXPIRED' : 'VALID_AS_RECORDED'],
        ];
    }
    $evidence = [
        'version' => 'clear-moodle-course-evidence.1', 'role' => $role, 'applicationActive' => true,
        'usableForPayment' => false, 'criteria' => $rows, 'decision' => $decision,
    ];
    $now = time();
    $included = $case[2] !== 'READBACK_UNAVAILABLE';
    $payment = [
        'version' => 'clear-moodle-payment-status.1', 'role' => $role, 'observedAt' => $now,
        'expiresAtExclusive' => $case[2] === 'EXPIRED' ? $now : $now + 5,
        'displayOnly' => true, 'paymentAuthority' => false,
        'decision' => array_replace($decision, ['sourceCurrentness' => 'NOT_RECHECKED',
            'revision' => $case[2] === 'MISMATCH' ? 2 : 1]),
        'consent' => ['participant' => 'RECORDED_WITHDRAW', 'operator' => 'RECORDED_AGREE',
            'publicationMatchesCurrentDecision' => true, 'usableForPayment' => false,
            'onchainWalletSignaturesVerified' => false],
        'receipt' => ['state' => $included ? 'INCLUDED' : 'READBACK_UNAVAILABLE',
            'symbol' => 'TEST', 'decimals' => 6, 'amountAtoms' => $included ? '100000000' : null,
            'canonical' => $included ? true : null, 'finalized' => $included ? false : null,
            'transactionHash' => 'PRIVATE-FIXTURE-RECEIPT'],
    ];
    return new \local_clearbridge\course_projection($evidence, $payment, true);
};
