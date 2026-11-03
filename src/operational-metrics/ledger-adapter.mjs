import { validateMetric } from '../bootcamp/r2-ledger.mjs';

export const LEDGER_OBSERVATIONS_VERSION = 'clear-operational-metrics-ledger-observations.1';

// Only call with the result of the existing authorized getMetricEvents read.
export function projectLedgerObservations(projection, { applicationRef, runId }) {
  if (projection?.version !== 'clear-bootcamp-metric-events.2' ||
      !Number.isSafeInteger(projection.ledgerSequence) || projection.ledgerSequence < 0 ||
      !Array.isArray(projection.events) ||
      ![applicationRef, runId].every(ref => typeof ref === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(ref))) {
    throw new Error('METRIC_LEDGER_PROJECTION');
  }
  const ids = new Set();
  const logicalKeys = new Set();
  const counts = new Map();
  let provenance = null;
  for (const row of projection.events) {
    validateMetric(row);
    if (row.applicationRef !== applicationRef || ids.has(row.eventId)) {
      throw new Error('METRIC_LEDGER_SCOPE_OR_DUPLICATE');
    }
    ids.add(row.eventId);
    if (row.scenarioRunId !== runId) continue;
    const key = JSON.stringify([row.decisionRevision, row.decisionHash, row.operationId, row.eventType]);
    if (logicalKeys.has(key) || (provenance !== null && row.provenance !== provenance)) {
      throw new Error('METRIC_LEDGER_PROVENANCE_OR_DUPLICATE');
    }
    logicalKeys.add(key);
    provenance = row.provenance;
    counts.set(row.eventType, (counts.get(row.eventType) ?? 0) + 1);
  }
  const recorded = kind => logicalKeys.size ? counts.get(kind) ?? 0 : null;
  return {
    version: LEDGER_OBSERVATIONS_VERSION,
    scope: { type: 'APPLICATION_RUN', applicationRef, runId },
    source: 'AUTHORIZED_BOOTCAMP_LEDGER_EVENTS',
    ledgerProvenance: provenance,
    dataMode: null,
    coverage: 'RECORDED_EVENTS_ONLY',
    recorded: {
      eventCount: logicalKeys.size,
      conditionVerificationEvents: recorded('CONDITION_VERIFIED'),
      automatedCompletionEvents: recorded('AUTO_OPERATION_COMPLETED'),
      operationFailureEvents: recorded('OPERATION_FAILED'),
    },
    unavailable: ['EPOCH', 'VERIFIED_CONDITIONS', 'ATTEMPTS', 'RETRIES', 'MANDATORY_ACTIONS',
      'EXCEPTION_INTERVENTIONS', 'CASE_ELAPSED_MS', 'INTERVAL_DURATION_MS', 'PERSON_MS', 'WORK_REDUCTION'],
    humanWorkReductionPercent: null,
  };
}
