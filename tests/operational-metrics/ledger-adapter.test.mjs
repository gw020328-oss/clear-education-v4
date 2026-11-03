import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { r2Ledger } from '../../src/bootcamp/r2-ledger.mjs';
import { projectLedgerObservations } from '../../src/operational-metrics/ledger-adapter.mjs';

test('projects stored ledger events without fabricating attempts', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE r2_meta (id INTEGER PRIMARY KEY, sequence INTEGER);
    INSERT INTO r2_meta VALUES (1, 0);
    CREATE TABLE r2_metrics (id TEXT PRIMARY KEY, application_id TEXT, logical_key TEXT UNIQUE,
      record TEXT, clock_epoch TEXT, started_utc_ms INTEGER, ended_utc_ms INTEGER, sequence INTEGER);
  `);
  let clock = 0;
  const ledger = r2Ledger(db, { nowUtcMs: () => clock, monotonicMs: () => ++clock });
  const applicationRef = 'application-test';
  const operation = {
    applicationId: applicationRef, operationId: 'operation-test',
    decision: { decisionRevision: 1, decisionHash: '0x' + 'a'.repeat(64) },
  };
  for (const eventType of ['OPERATION_FAILED', 'OPERATION_FAILED', 'CONDITION_VERIFIED', 'AUTO_OPERATION_COMPLETED']) {
    ledger.emit({ ...operation, eventType });
  }
  const projection = {
    version: 'clear-bootcamp-metric-events.2', ledgerSequence: ledger.sequence(), events: ledger.events(applicationRef),
  };
  const runId = ledger.runId;
  const scope = { applicationRef, runId };
  const result = projectLedgerObservations(projection, scope);
  assert.equal(result.recorded.operationFailureEvents, 1);
  assert.equal(result.recorded.automatedCompletionEvents, 1);
  assert.equal(result.recorded.conditionVerificationEvents, 1);
  assert.equal(result.dataMode, null);
  assert.equal(result.humanWorkReductionPercent, null);
  assert.ok(result.unavailable.includes('ATTEMPTS'));
  assert.equal(projectLedgerObservations(projection, { ...scope, runId: 'run-missing' })
    .recorded.operationFailureEvents, null);
  assert.throws(() => projectLedgerObservations(projection, { ...scope, applicationRef: 'other-app' }),
    /METRIC_LEDGER_SCOPE/);
  assert.throws(() => projectLedgerObservations({ ...projection, events: [...projection.events, projection.events[0]] }, scope),
    /METRIC_LEDGER_SCOPE_OR_DUPLICATE/);
});
