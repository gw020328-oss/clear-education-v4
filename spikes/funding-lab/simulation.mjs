import { exactKeys, decimal, requireRule as check } from '../../src/policy/values.mjs';
// Aggregate cohort what-if arithmetic only. No provider, contract, asset or defaults.
export function simulateReserve(input) {
  exactKeys(input, ['students','tuitionAtoms','refunds','ancillaryAtoms','holdBps','bufferBps','bufferBasis','topUpBps','topUpBasis','additionalTopUpAtoms'], 'SIMULATION_INPUT');
  const count = n => check(Number.isSafeInteger(n) && n >= 0 && n <= 1000000, 'SIMULATION_COUNT');
  count(input.students);
  const money = s => BigInt(decimal(s, 'SIMULATION_AMOUNT'));
  const tuition = money(input.tuitionAtoms), ancillary = money(input.ancillaryAtoms), additionalTopUp = money(input.additionalTopUpAtoms);
  for (const k of ['holdBps','bufferBps','topUpBps']) check(Number.isInteger(input[k]) && input[k] >= 0 && input[k] <= 10000, 'SIMULATION_BPS');
  for (const k of ['bufferBasis','topUpBasis']) check(['REVENUE','LIABILITY'].includes(input[k]), 'SIMULATION_BASIS');
  check(Array.isArray(input.refunds) && input.refunds.length <= 4, 'SIMULATION_TIERS');
  const seen = new Set(); let people = 0, refunds = 0n;
  for (const row of input.refunds) {
    exactKeys(row, ['tier','count','amountAtoms'], 'SIMULATION_REFUND');
    check([50,100,200,300].includes(row.tier) && !seen.has(row.tier), 'SIMULATION_TIERS'); seen.add(row.tier);
    count(row.count); people += row.count; refunds += BigInt(row.count) * money(row.amountAtoms);
  }
  check(people <= input.students, 'SIMULATION_COUNT');
  const revenue = tuition * BigInt(input.students), liability = refunds + ancillary;
  const basis = name => name === 'REVENUE' ? revenue : liability;
  const retained = revenue * BigInt(input.holdBps) / 10000n;
  const buffer = (basis(input.bufferBasis) * BigInt(input.bufferBps) + 9999n) / 10000n;
  const ratioTopUp = basis(input.topUpBasis) * BigInt(input.topUpBps) / 10000n, topUp = ratioTopUp + additionalTopUp;
  const required = liability + buffer, available = retained + topUp;
  return { mode: 'CALCULATION_ONLY', assumptions: structuredClone(input), refundPeople: people,
    ...Object.fromEntries(Object.entries({ revenueAtoms:revenue, refundAtoms:refunds, ancillaryAtoms:ancillary,
      liabilityAtoms:liability, retainedAtoms:retained, bufferAtoms:buffer, hypotheticalTopUpAtoms:topUp, ratioTopUpAtoms:ratioTopUp, explicitTopUpAtoms:additionalTopUp,
      simulatedAvailableAtoms:available, requiredAtoms:required, additionalRequiredAtoms:required > available ? required - available : 0n,
      surplusAtoms:available > required ? available - required : 0n }).map(([k,v])=>[k,v.toString()])),
    onchainSpendableAtoms: '0', paymentAllowed: false, productDefault: false };
}
