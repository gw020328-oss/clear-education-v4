import {schema, validate, score} from '../../stage12/protocol-v3/tools/score.mjs';
import {tests} from '../../stage12/protocol-v3/tools/fixtures.mjs';
import {auditSchema} from '../../stage13c/tools/schema-audit.mjs';
import {read, fileSha, encode, sha} from './common.mjs';

export function dualSchemaValidation() {
  const wire = read('stage13c/artifacts/schema/gemini-candidate.schema.json');
  const {candidate, report: originalAudit} = auditSchema();
  const projectionIdentical = JSON.stringify(wire) === JSON.stringify(candidate);
  const results = tests.map(test => {
    const authoritativeErrors = validate(schema, test.output), wireErrors = validate(wire, test.output);
    const judged = score(test.output, test.reference, test.source);
    return {id: test.id, authoritativeValid: authoritativeErrors.length === 0, wireValid: wireErrors.length === 0,
      narrowed: authoritativeErrors.length === 0 && wireErrors.length > 0,
      authoritativeErrors, wireErrors, score: judged,
      originalScorerExpectationPassed: Object.entries(test.expected).every(([k,v]) => judged[k] === v)};
  });
  const three = results.filter(x => ['duplicate-span-format','empty-question-format','zero-denominator'].includes(x.id));
  const syntacticProof = projectionIdentical && originalAudit.transformations.every(t => ['$schema','minLength','maxLength','pattern','uniqueItems'].includes(t.key)) && originalAudit.unknownKeywords.length === 0;
  const passed = syntacticProof && results.every(x => !x.narrowed && x.originalScorerExpectationPassed) && three.length === 3 && three.every(x => x.wireValid && !x.authoritativeValid && !x.score.completeCorrect && !x.score.formatValid && x.score.majorError);
  return {wire, report: {kind: 'OFFLINE_DUAL_SCHEMA_TEST_NOT_MODEL_OUTPUT', passed,
    status: passed ? 'PASS' : 'BLOCKED_WIRE_SCHEMA_NARROWING', fixtureCount: results.length,
    authoritativeValidCount: results.filter(x => x.authoritativeValid).length,
    wireValidCount: results.filter(x => x.wireValid).length, narrowingCount: results.filter(x => x.narrowed).length,
    originalValidImpliesWireValid: results.every(x => !x.authoritativeValid || x.wireValid),
    structuralSupersetProof: {passed: syntacticProof, method: 'Only delete positive assertion keywords from an identical tree; preserve all other nodes including anyOf, property names, types, required, enums, items, bounds, null and additionalProperties. Assertion deletion is monotone through these positive combinators.',
      removedKeywords: originalAudit.assertionCounts, allTransforms: originalAudit.transformations},
    authoritativeSchemaPath: 'stage12/protocol-v3/schemas/output.schema.json', authoritativeSchemaSha256: fileSha('stage12/protocol-v3/schemas/output.schema.json'),
    wireSchemaSha256: sha(encode(wire)), wireSourceSha256: fileSha('stage13c/artifacts/schema/gemini-candidate.schema.json'),
    scorerSha256: fileSha('stage12/protocol-v3/tools/score.mjs'), fixtureSha256: fileSha('stage12/protocol-v3/tools/fixtures.mjs'),
    threeCounterexamplesStillFailed: three.every(x => x.wireValid && !x.authoritativeValid && !x.score.completeCorrect), results}};
}
