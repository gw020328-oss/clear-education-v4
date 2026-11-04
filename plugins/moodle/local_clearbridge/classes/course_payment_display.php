<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * Translate A's display-only projection into a small localized view.
 */
final class course_payment_display {
    public static function data(array $dto, array $evidence, string $role, int $now): ?array {
        $fixed = ($dto['version'] ?? null) === 'clear-moodle-fixed-payment-status.1';
        $keys = $fixed ? ['version', 'requestRef', 'mappingRevision', 'mappingRef', 'role', 'observedAt',
            'expiresAtExclusive', 'displayOnly', 'paymentAuthority', 'decision', 'consent', 'receipt']
            : ['version', 'requestRef', 'mappingRevision', 'bindingRef', 'bindingRevision', 'role', 'observedAt',
                'expiresAtExclusive', 'displayOnly', 'paymentAuthority', 'decision', 'consent', 'receipt'];
        if (!course_read_client::exact_keys($dto, $keys)
                || (!$fixed && $dto['version'] !== 'clear-moodle-payment-status.1')
                || !is_string($dto['requestRef']) || ($fixed
                    ? !preg_match('/\A[a-f0-9]{64}\z/', $dto['requestRef']) : !self::ref($dto['requestRef']))
                || !is_int($dto['mappingRevision']) || $dto['mappingRevision'] < 1
                || !self::ref($fixed ? $dto['mappingRef'] : $dto['bindingRef'])
                || (!$fixed && (!is_int($dto['bindingRevision']) || $dto['bindingRevision'] < 1))
                || !in_array($role, ['PARTICIPANT', 'COURSE_OPERATOR'], true)
                || ($dto['role'] ?? null) !== $role
                || ($dto['displayOnly'] ?? null) !== true
                || ($dto['paymentAuthority'] ?? null) !== false
                || !is_int($dto['observedAt'] ?? null) || $dto['observedAt'] > $now
                || !is_int($dto['expiresAtExclusive'] ?? null) || $dto['expiresAtExclusive'] <= $now
                || $dto['expiresAtExclusive'] > $dto['observedAt'] + 5
                || !course_read_client::exact_keys($dto['decision'], ['id', 'revision', 'hash', 'recordedConditionsStatus', 'sourceCurrentness'])
                || ($dto['decision']['sourceCurrentness'] ?? null) !== 'NOT_RECHECKED') {
            return null;
        }
        $decision = $dto['decision'];
        if (!self::ref($decision['id']) || !self::hash($decision['hash']) || $decision['id'] !== ($evidence['decision']['id'] ?? null)
                || !is_int($decision['revision'] ?? null) || $decision['revision'] < 1
                || $decision['revision'] !== ($evidence['decision']['revision'] ?? null)
                || !in_array($decision['recordedConditionsStatus'] ?? null, ['MET', 'NOT_MET', 'NEEDS_SUPPLEMENT', 'UNKNOWN'], true)
                || $decision['recordedConditionsStatus'] !== ($evidence['decision']['recordedConditionsStatus'] ?? null)) {
            return null;
        }

        $consent = $dto['consent'] ?? [];
        if (!course_read_client::exact_keys($consent, ['participant', 'operator', 'publicationMatchesCurrentDecision',
                    'onchainWalletSignaturesVerified', 'usableForPayment'])
                || ($consent['usableForPayment'] ?? null) !== false
                || ($consent['onchainWalletSignaturesVerified'] ?? null) !== false
                || !is_bool($consent['publicationMatchesCurrentDecision'] ?? null)) {
            return null;
        }
        $labels = [
            'NOT_RECORDED' => 'consentnone',
            'RECORDED_AGREE' => 'consentagree',
            'RECORDED_WITHDRAW' => 'consentwithdraw',
            'ACTOR_NO_LONGER_AUTHORIZED' => 'consentactorexpired',
        ];
        $roles = [];
        foreach (['participant', 'operator'] as $key) {
            $value = $consent[$key] ?? null;
            if (!is_string($value) || !isset($labels[$value])) {
                return null;
            }
            $label = $consent['publicationMatchesCurrentDecision'] ? $labels[$value] : 'consentnone';
            $roles[$key] = get_string($label, 'local_clearbridge');
        }

        $receipt = $dto['receipt'] ?? [];
        $state = $receipt['state'] ?? null;
        if (!course_read_client::exact_keys($receipt, ['state', 'amountAtoms', 'symbol', 'decimals', 'canonical',
                    'finalized', 'transactionHash', 'checkpoint', 'acceptedDecision'])
                || ($receipt['symbol'] ?? null) !== 'TEST' || ($receipt['decimals'] ?? null) !== 6
                || !in_array($state, ['INCLUDED', 'NOT_OBSERVED', 'READBACK_UNAVAILABLE'], true)) {
            return null;
        }
        $included = $state === 'INCLUDED';
        if ($included && (($receipt['canonical'] ?? null) !== true
                || ($receipt['finalized'] ?? null) !== false
                || ($receipt['amountAtoms'] ?? null) !== '100000000')) {
            return null;
        }
        if ($included && (!self::hash($receipt['transactionHash'])
                || !course_read_client::exact_keys($receipt['checkpoint'], ['number', 'hash', 'time'])
                || !self::hash($receipt['checkpoint']['hash'])
                || !self::decimal($receipt['checkpoint']['number']) || !self::decimal($receipt['checkpoint']['time'])
                || !course_read_client::exact_keys($receipt['acceptedDecision'], ['id', 'revision', 'hash'])
                || !self::ref($receipt['acceptedDecision']['id']) || !self::hash($receipt['acceptedDecision']['hash'])
                || !is_int($receipt['acceptedDecision']['revision']) || $receipt['acceptedDecision']['revision'] < 1)) {
            return null;
        }
        if (!$included && (($receipt['amountAtoms'] ?? null) !== null
                || $receipt['canonical'] !== null || $receipt['finalized'] !== null || $receipt['transactionHash'] !== null
                || $receipt['checkpoint'] !== null || $receipt['acceptedDecision'] !== null)) {
            return null;
        }
        $status = match ($state) {
            'INCLUDED' => 'receiptincluded',
            'NOT_OBSERVED' => 'receiptnotobserved',
            'READBACK_UNAVAILABLE' => 'receiptreadunknown',
        };
        $decisionlabel = match ($decision['recordedConditionsStatus']) {
            'MET' => 'nativedecisionmet',
            'NOT_MET' => 'nativedecisionnotmet',
            'NEEDS_SUPPLEMENT' => 'nativedecisionsupplement',
            'UNKNOWN' => 'nativedecisionunknown',
        };
        return $roles + ['receiptstatus' => get_string($status, 'local_clearbridge'),
            'decisionstatus' => get_string($decisionlabel, 'local_clearbridge')];
    }

    private static function ref(mixed $value): bool {
        return is_string($value) && preg_match('/\A[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\z/', $value) === 1;
    }
    private static function hash(mixed $value): bool {
        return is_string($value) && preg_match('/\A0x[a-f0-9]{64}\z/', $value) === 1;
    }
    private static function decimal(mixed $value): bool {
        return is_string($value) && preg_match('/\A(?:0|[1-9][0-9]*)\z/', $value) === 1;
    }
}
