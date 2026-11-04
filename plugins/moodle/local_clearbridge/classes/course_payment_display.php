<?php
namespace local_clearbridge;

defined('MOODLE_INTERNAL') || die();

/**
 * Translate A's display-only projection into a small localized view.
 */
final class course_payment_display {
    public static function data(array $dto, array $evidence, string $role, int $now): ?array {
        if (($dto['version'] ?? null) !== 'clear-moodle-payment-status.1'
                || ($dto['role'] ?? null) !== $role
                || ($dto['displayOnly'] ?? null) !== true
                || ($dto['paymentAuthority'] ?? null) !== false
                || !is_int($dto['observedAt'] ?? null) || $dto['observedAt'] > $now
                || !is_int($dto['expiresAtExclusive'] ?? null) || $dto['expiresAtExclusive'] <= $now
                || $dto['expiresAtExclusive'] > $dto['observedAt'] + 5
                || ($dto['decision']['sourceCurrentness'] ?? null) !== 'NOT_RECHECKED') {
            return null;
        }
        $decision = $dto['decision'];
        if (!is_string($decision['id'] ?? null) || $decision['id'] !== ($evidence['decision']['id'] ?? null)
                || !is_int($decision['revision'] ?? null) || $decision['revision'] < 1
                || $decision['revision'] !== ($evidence['decision']['revision'] ?? null)
                || !in_array($decision['recordedConditionsStatus'] ?? null, ['MET', 'NOT_MET', 'NEEDS_SUPPLEMENT', 'UNKNOWN'], true)
                || $decision['recordedConditionsStatus'] !== ($evidence['decision']['recordedConditionsStatus'] ?? null)) {
            return null;
        }

        $consent = $dto['consent'] ?? [];
        if (($consent['usableForPayment'] ?? null) !== false
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
        if (($receipt['symbol'] ?? null) !== 'TEST' || ($receipt['decimals'] ?? null) !== 6
                || !in_array($state, ['INCLUDED', 'NOT_OBSERVED', 'READBACK_UNAVAILABLE'], true)) {
            return null;
        }
        $included = $state === 'INCLUDED';
        if ($included && (($receipt['canonical'] ?? null) !== true
                || ($receipt['finalized'] ?? null) !== false
                || ($receipt['amountAtoms'] ?? null) !== '100000000')) {
            return null;
        }
        if (!$included && (($receipt['amountAtoms'] ?? null) !== null
                || ($receipt['canonical'] ?? null) !== null || ($receipt['finalized'] ?? null) !== null)) {
            return null;
        }
        $status = match ($state) {
            'INCLUDED' => 'receiptincluded',
            'NOT_OBSERVED' => 'receiptnotobserved',
            'READBACK_UNAVAILABLE' => 'receiptreadunknown',
        };
        return $roles + ['receiptstatus' => get_string($status, 'local_clearbridge')];
    }
}
