// Post-freeze exploratory diagnostic; never part of the 19 frozen fixture score.
import fs from 'node:fs';
import {runtimeGate} from '../protocol-v2/tools/runtime-gate.mjs';
const fixture=fs.readFileSync('stage10/protocol-v2/SYNTHETIC_RUNTIME_FIXTURES.jsonl','utf8').trim().split('\n').map(JSON.parse).find(x=>x.fixtureId==='F13');
const modified=structuredClone(fixture.input);
modified.policySpec.kind='NATIVE_FIXED_FOUR';
console.log(JSON.stringify({kind:'EXPLORATORY_POST_FREEZE_DIAGNOSTIC',parentFixture:'F13',modelCalls:0,change:{field:'policySpec.kind',before:fixture.input.policySpec.kind,after:modified.policySpec.kind},unchangedSourceBasis:modified.sourceBasis,frozenResult:runtimeGate(fixture.input),modifiedResult:runtimeGate(modified),interpretation:'A caller who relabels the profile can obtain readiness despite the PUBLIC_R02 source tag. The fixture gate validates a declared native profile and signed runtime facts; it does not prove faithful compilation from the public policy. No live chain or product exploit is demonstrated. Not included in frozen 19-case accuracy.'},null,2));
