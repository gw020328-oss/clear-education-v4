// Offline compatibility audit. Uses the unchanged Stage 12 validator and fixtures.
// Candidate projection is diagnostic only and must never be sent to a model.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { schema, validate } from '../../stage12/protocol-v3/tools/score.mjs';
import { tests, aggregateExpectations } from '../../stage12/protocol-v3/tools/fixtures.mjs';

export const encode = value => JSON.stringify(value, null, 2) + '\n';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const unsupported = new Set(['$schema', 'minLength', 'maxLength', 'pattern', 'uniqueItems']);
const documented = new Set(['type', 'title', 'description', 'properties', 'required', 'additionalProperties', 'enum', 'format', 'minimum', 'maximum', 'items', 'prefixItems', 'minItems', 'maxItems', 'anyOf', '$ref', '$defs']);
const pointer = value => value.replace(/~/g, '~0').replace(/\//g, '~1');

export function auditSchema() {
  const transformations = [];
  const unknownKeywords = [];
  const inventory = [];
  function visit(node, path = '') {
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (unsupported.has(key)) {
        transformations.push({path: path + '/' + pointer(key), key, originalValue: value,
          action: 'REMOVED_IN_REJECTED_DIAGNOSTIC_CANDIDATE_ONLY',
          reason: key === '$schema' ? 'Dialect annotation; not a value assertion in the frozen validator.' : 'Not listed in the official Structured Outputs supported subset; removing this assertion can weaken acceptance.'});
        continue;
      }
      if (!documented.has(key)) unknownKeywords.push({path, key});
      if (key === 'properties' || key === '$defs') {
        result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, visit(child, path + '/' + key + '/' + pointer(name))]));
      } else if (['anyOf', 'prefixItems'].includes(key)) {
        result[key] = value.map((child, index) => visit(child, path + '/' + key + '/' + index));
      } else if (key === 'items' || key === 'additionalProperties' && value && typeof value === 'object') {
        result[key] = visit(value, path + '/' + key);
      } else {
        result[key] = structuredClone(value);
      }
    }
    inventory.push({path: path || '/', type: node.type ?? null, propertyNames: node.properties ? Object.keys(node.properties) : null,
      required: node.required ?? null, enum: node.enum ?? null, additionalProperties: node.additionalProperties ?? 'DEFAULT_TRUE',
      anyOfBranchCount: node.anyOf?.length ?? null, nullBranch: node.type === 'null',
      arrayStructure: node.type === 'array' ? {items: node.items, minItems: node.minItems ?? null, maxItems: node.maxItems ?? null, uniqueItems: node.uniqueItems ?? false} : null});
    return result;
  }
  const candidate = visit(schema);
  const results = tests.map(test => {
    const originalErrors = validate(schema, test.output);
    const candidateErrors = validate(candidate, test.output);
    return {id: test.id, inputSha256: digest(encode(test.output)), originalAccept: originalErrors.length === 0,
      candidateAccept: candidateErrors.length === 0, equal: (originalErrors.length === 0) === (candidateErrors.length === 0),
      originalErrors, candidateErrors};
  });
  const mismatches = results.filter(result => !result.equal);
  const assertionCounts = Object.fromEntries([...unsupported].map(key => [key, transformations.filter(change => change.key === key).length]));
  const report = {
    kind: 'OFFLINE_SCHEMA_COMPATIBILITY_NOT_MODEL_EVALUATION',
    status: mismatches.length || unknownKeywords.length ? 'BLOCKED_SCHEMA_INCOMPATIBLE' : 'UNPROVEN_REQUIRE_FULL_SEMANTIC_EQUIVALENCE',
    compatible: false,
    source: 'https://ai.google.dev/gemini-api/docs/structured-output#json_schema_support',
    sourceCheckedDateUTC: '2026-09-14',
    originalSchemaPath: 'stage12/protocol-v3/schemas/output.schema.json',
    originalSchemaSha256: digest(readFileSync(new URL('../../stage12/protocol-v3/schemas/output.schema.json', import.meta.url))),
    candidateSchemaPath: 'stage13c/artifacts/schema/gemini-candidate.schema.json',
    candidateSchemaSha256: digest(encode(candidate)),
    actualTransmittedSchemaSha256: null,
    candidateDisposition: 'REJECTED_NOT_APPROVED_FOR_TRANSMISSION',
    validatorPath: 'stage12/protocol-v3/tools/score.mjs',
    validatorSha256: digest(readFileSync(new URL('../../stage12/protocol-v3/tools/score.mjs', import.meta.url))),
    validatorMethod: 'Two independent calls to frozen validate(schema, output), one per schema; no Stage 12 schema reapplied to candidate validation.',
    fixtureCount: results.length,
    equivalentFixtureCount: results.length - mismatches.length,
    mismatchCount: mismatches.length,
    aggregateScorerTestsNotSchemaInputs: aggregateExpectations.length,
    assertionCounts, transformations, unknownKeywords, inventory, results, mismatches,
    preserved: {fieldNames: true, requiredLists: true, enums: true, arrayItemsAndBounds: true, nullBranches: true, additionalProperties: true},
    notPreserved: ['string_length_constraints', 'numeric_string_patterns', 'array_item_uniqueness'],
    proofScope: 'The 3 existing counterexamples disprove equivalence of the diagnostic projection. The documented subset provides no general equivalent for these free-string and unbounded uniqueness constraints; undocumented provider behavior was not probed.'
  };
  return {candidate, report};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL('file://' + process.argv[1]))) {
  const {report} = auditSchema();
  if (process.argv.includes('--summary')) {
    console.log(encode({status: report.status, fixtureCount: report.fixtureCount, equivalentFixtureCount: report.equivalentFixtureCount,
      mismatchCount: report.mismatchCount, mismatches: report.mismatches.map(({id, originalAccept, candidateAccept}) => ({id, originalAccept, candidateAccept}))}));
  } else console.log(encode(report));
  process.exitCode = report.compatible ? 0 : 2;
}
