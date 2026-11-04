import assert from 'node:assert/strict';
import {structureSynthetic} from '@clear/preview-core';

import {runEvidenceDemo, runReflectionGroundingDemo, runSettlementConnectionDemo, prepareGeminiStructureRequest} from '@clear/preview-core/modules';
assert.equal(structureSynthetic('Moodle 활동 완료').status, 'READY');

const evidence = await runEvidenceDemo();
assert.equal(evidence.moodle.length, 2);
assert.ok(evidence.moodle.every(module => module.predicate === 'MET'));
assert.equal(evidence.certificate.syntheticSignaturesVerified, true);
assert.equal(evidence.certificate.invalidSignatureRejected, true);
assert.equal(evidence.paymentAllowed, false);
const reflection = await runReflectionGroundingDemo();
assert.equal(reflection.actualModelCall, false);
assert.equal(reflection.preparation.status, 'PREPARED_NOT_EXECUTED');
assert.match(reflection.preparation.bodySha256, /^[a-f0-9]{64}$/);
assert.equal(reflection.grounded.fields.length, 3);
assert.ok(reflection.grounded.fields.every(field => field.locationStatus === 'EXACT_SUBMITTED_TEXT'));
const prepared = prepareGeminiStructureRequest('Moodle 활동 완료');
assert.equal(prepared.transportEnabled, false);
const settlement = runSettlementConnectionDemo();
assert.equal(settlement.decision.criterionResults.length, 4);
assert.equal(settlement.decision.conditionsStatus, 'UNKNOWN');
assert.equal(settlement.decision.gates.paymentAllowed, false);
assert.equal(settlement.evidenceView.manifest.decision.decisionHash, settlement.decision.decisionHash);
assert.equal(settlement.evidenceView.limitations.usableForPayment, false);
console.log(JSON.stringify({evidence, reflection, settlement, gemini: prepared.executionMode}, null, 2));
