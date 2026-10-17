import { readFileSync } from 'node:fs';
import { inspectDecisionTrace } from './inspect.mjs';
// Only the already public synthetic response, never user data or a running DB.
const fixture = JSON.parse(readFileSync(new URL('../../specs/m3/evaluation-http-responses.json', import.meta.url)));
const record = fixture.responses.final.result;
const expected = {
  binding: fixture.responses.preview.binding,
  c1AcknowledgmentHash: fixture.responses.preview.c1AcknowledgmentHash,
  workflowRevision: 8, factsRevision: 6, selectionRevision: 2,
};
console.log(JSON.stringify(inspectDecisionTrace(record, expected), null, 2));
