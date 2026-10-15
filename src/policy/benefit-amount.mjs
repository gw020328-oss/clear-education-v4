import { exactKeys, decimal, requireRule as check } from './values.mjs';
// Shared M0 arithmetic, not official pricing or an eligibility/payment decision.
export function quoteBenefitAmount(tier, a) {
  check(tier === null || [50, 100, 200, 300, 400].includes(tier), 'BENEFIT_TIER');
  exactKeys(a, ['basis','token','decimals','paidAtoms','bookAtoms','deviceAtoms','fixedFeeAtoms','examCreditAtoms','taxBps','capAtoms','rounding','formulaVersion'], 'BENEFIT_INPUT');
  check(['SYNTHETIC_ASSUMPTION','OFFICIAL_OPEN'].includes(a.basis) && a.token === 'TEST' && a.decimals === 6
    && a.rounding === 'FLOOR_ONCE_DEMO' && a.formulaVersion === 'siwon-demo-amount.1', 'BENEFIT_PROFILE');
  for (const k of ['paidAtoms','bookAtoms','deviceAtoms','fixedFeeAtoms','examCreditAtoms','capAtoms']) if (a[k] !== null) decimal(a[k], 'BENEFIT_AMOUNT');
  check(a.taxBps === null || (Number.isInteger(a.taxBps) && a.taxBps >= 0 && a.taxBps <= 10000), 'BENEFIT_TAX');
  if (tier === null) return ['NO_SELECTION', null];
  if (tier === 400) return ['PRECHECK_ONLY', null];
  if (a.basis === 'OFFICIAL_OPEN' || Object.values(a).includes(null)) return ['AMOUNT_OPEN', null];
  const [paid, book, device, fee, exam, cap] = ['paidAtoms','bookAtoms','deviceAtoms','fixedFeeAtoms','examCreditAtoms','capAtoms'].map(k => BigInt(a[k]));
  const base = paid - book - device, beforeTax100 = base * BigInt(tier) - fee * 100n + exam * 100n;
  if (base < 0n || beforeTax100 <= 0n) return ['INVALID_AMOUNT', null];
  const net = beforeTax100 * BigInt(10000 - a.taxBps) / 1000000n;
  return net <= 0n || net > cap ? ['INVALID_AMOUNT', null] : ['CALCULATED_SYNTHETIC', net.toString()];
}
