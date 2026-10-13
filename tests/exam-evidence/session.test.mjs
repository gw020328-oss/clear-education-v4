import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture as proofFixture } from '../proof-sessions/fixture.mjs';
import { fixture, policyDraft, registration, score } from './fixture.mjs';
import { compileSyntheticPolicy } from '../../src/policy/compiler.mjs';
import { assessSyntheticExamEvidence } from '../../src/exam-evidence/synthetic-completeness.mjs';

test('real B1 service authorization on a fresh synthetic EVM supplies context without a second nonce consumption', async t => {
  const p = await proofFixture(t, { policyDraft: policyDraft() }), issued = await p.create();
  const session = await p.authorize(issued, await p.signed(issued));
  const f = fixture({ compiled: p.app.compiled, session });
  assert.equal(f.assess().status, 'COMPLETE_SYNTHETIC');
  assert.deepEqual(p.get(issued), session);
  assert.equal(p.sql(db => db.prepare('SELECT count(*) n FROM proof_sessions WHERE consumed_at IS NOT NULL').get().n), 1);
  p.app.restart({ vaultReader: p.reader }); f.context.session = p.get(issued);
  assert.equal(f.assess().highestScore, 900);
  p.cancel(issued); f.context.session = p.get(issued);
  assert.throws(f.assess, /EVIDENCE_SESSION/);
});

test('a policy period that has not ended cannot establish its final highest score', () => {
  const compiled = compileSyntheticPolicy({ ...policyDraft(), examDateEnd: '2020-02-04' });
  const f = fixture({ compiled });
  assert.deepEqual(f.assess().reasons, ['PERIOD_NOT_CLOSED']);
});

test('a new session cannot reuse a former session inventory, even with the old manifest pin', () => {
  const f = fixture(), other = fixture();
  assert.deepEqual(assessSyntheticExamEvidence(other.compiled, { ...other.context, manifestHash: f.context.manifestHash }, f.bundle).reasons, ['MANIFEST_CONTEXT']);
});

test('total-score boundary is preserved without component mixing or threshold-driven omission', () => {
  const f = fixture(); f.setRows([registration('a')], [score('a', 795)]);
  assert.equal(f.assess().highestScore, 795);
  f.setRows([registration('a'), registration('b')], [score('a', 795), score('b', 800)]);
  assert.equal(f.assess().highestScore, 800);
  f.bundle.pages.find(p => p.role === 'REGISTRATION').records.push(registration('missing-best'));
  f.seal(); assert.deepEqual(f.assess().reasons, ['SCORE_MISSING']);
});
