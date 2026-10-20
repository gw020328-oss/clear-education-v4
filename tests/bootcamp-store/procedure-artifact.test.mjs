import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TypedDataEncoder} from 'ethers';
import {createTestDraftInspector} from '../../src/bootcamp-authorization/test-encoding-v3.mjs';
import {TYPES,PRIMARY_TYPE} from '../../src/bootcamp-authorization/test-schema-v3.mjs';
import {procedureFixture,START} from './procedure-fixture.mjs';

const proposal=JSON.parse(readFileSync(new URL('../../docs/bootcamp-procedure/e4-port-proposal.json',import.meta.url)));
const sample=JSON.parse(readFileSync(new URL('../../docs/bootcamp-procedure/synthetic-intake-example.json',import.meta.url)));
// Independent recipe implementation for the persisted handoff vector.
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const hash=(domain,value)=>'0x'+createHash('sha256').update(domain+'\n'+canonical(value)).digest('hex');
test('persisted synthetic handoff independently reproduces consent hashes, role DTO pins and frozen E2 .3 digest',()=>{
 assert.equal(sample.execution,'SYNTHETIC_PORT_FIXTURE');assert.equal(sample.paymentTransactions,0);assert.equal(sample.authorizationSignatures,0);
 assert.equal(hash(proposal.consentScopeHashDomain,sample.consentScope),sample.target.consentSet.scopeHash);
 assert.equal(hash(proposal.consentSetHashDomain,sample.target.consentSet),sample.target.payload.message.consentSetHash);
 const result=createTestDraftInspector(sample.target.snapshot,{clock:()=>Number(sample.target.payload.message.issuedAt)}).inspect(sample.target.payload,sample.target.currentServerState);
 assert.equal(result.status,'UNSIGNED_PREFLIGHT_ONLY');
 assert.equal(result.hashes.digest,TypedDataEncoder.hash(sample.target.payload.domain,TYPES,sample.target.payload.message));
 assert.equal(sample.student.decisionHash,sample.operator.decisionHash);assert.equal(sample.student.procedure.id,sample.operator.procedure.id);
 for(const field of ['applicationId','decisionId','allocationId'])assert.equal(sample.bootstrap.record.opaqueTarget[field],sample.target.payload.message[field]);
 assert.equal(sample.bootstrap.procedureStarted,false);assert.equal(sample.bootstrap.allocationConfirmed,false);
 assert.equal(sample.termination.intent.contractExecuted,false);assert.ok(proposal.terminationReasons.includes(sample.termination.intent.reason));
});
test('E4 proposed port fields match current runtime adapter; E2 source SHA/type pins stay exact',async t=>{
 const f=await procedureFixture(t),a=f.create();await f.complete(a);const v=f.view(a);
 const funding=f.configuration.procedurePorts.funding({applicationId:a,decisionId:v.decisionId,decisionRevision:v.decisionRevision,decisionHash:v.decisionHash,acceptanceSequence:1});
 for(const [fields,value]of [[proposal.fundingFields,funding],[proposal.chainFields,f.configuration.procedurePorts.chain({applicationId:a})],[proposal.authorizationFields,f.configuration.procedurePorts.authorization()],
  [proposal.registrationFields,f.configuration.procedurePorts.registration({applicationId:a,decisionId:v.decisionId,decisionRevision:v.decisionRevision,decisionHash:v.decisionHash})]])
  assert.deepEqual([...fields].sort(),Object.keys(value).sort());
 const pins=JSON.parse(readFileSync(new URL('../../specs/bootcamp/hackathon-test-consumer-pins-v1.json',import.meta.url)));
 const delta=JSON.parse(readFileSync(new URL('../../docs/bootcamp-execution/normal-consumer-source-delta.json',import.meta.url)));
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 for(const [path,expected]of Object.entries(pins.artifactSha256)){
  const change=delta.changes[path];
  if(change){assert.equal(change.before,expected);assert.equal(sha(execFileSync('git',['show',delta.baselineCommit+':'+path])),expected);}
  assert.equal(sha(readFileSync(new URL('../../'+path,import.meta.url))),change?.after??expected);
 }
 assert.equal(proposal.e2TypeHash,pins.typedEncoding.typeHash);assert.equal(TypedDataEncoder.hashStruct(PRIMARY_TYPE,TYPES,sample.target.payload.message),sample.target.inspection.hashes.structHash);
});
