// Explicit owner-only isolated TEST composition. No HTTP/body activation flag.
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {openOwnedApiBridge} from '../hackathon-test-vault/e5b/bridge.mjs';
import {ExecutionReader,ZERO} from '../hackathon-test-vault/e5/reader.mjs';
import {canonical,freeze,requireRule as check} from '../policy/values.mjs';
import {e4Hash,validateE4Observation} from './execution-e4-ports.mjs';
import {createExecutionFailureLog,observeExecutionFailure} from './execution-diagnostics.mjs';
const connections=new WeakSet(),procedures=new WeakSet();
const failureLogs=new WeakMap();
export function recordDevelopmentFailure(configuration,phase,error){observeExecutionFailure(failureLogs.get(configuration),phase,error);}
export const isDevelopmentConnection=value=>connections.has(value);
export const isCanonicalProcedurePorts=value=>procedures.has(value);
export function openDevelopmentConnection({environmentId,sourceMode='SYNTHETIC_TEST_SOURCE',now=()=>Math.floor(Date.now()/1000)}){
 check(['SYNTHETIC_TEST_SOURCE','REGISTERED_TEST_SOURCE'].includes(sourceMode),'BC_E5B_DEVELOPMENT_SOURCE');
 const diagnosticPins=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/normal-source-pins-v22.json',import.meta.url)));
 check(diagnosticPins.scope==='EXACT_V25_NORMAL_PAYMENT_FAILURE_DIAGNOSTICS','BC_E5B_DEVELOPMENT_PACKET');
 const pins=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/source-pins.json',import.meta.url)));
 for(const [path,expected]of Object.entries(pins.sourceArtifactSha256).filter(([p])=>p.startsWith('src/hackathon-test-vault/e5b/'))){
  const revision=diagnosticPins.changes[path];if(revision)check(revision.before===expected,'BC_E5B_DEVELOPMENT_PACKET');
  check(createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')===(revision?.after??expected),'BC_E5B_DEVELOPMENT_PACKET');
 }
 const fixes=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/normal-source-pins.json',import.meta.url)));
 const clockFixes=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/normal-source-pins-v26.json',import.meta.url)));
 check(clockFixes.version==='clear-e5-normal-path-source-pins.26'&&clockFixes.scope==='EXACT_V29_ATOMIC_ADOPTION_AND_CANONICAL_CLOCK_READINESS','BC_E5B_DEVELOPMENT_PACKET');
 for(const [path,pin]of Object.entries(fixes.changes).filter(([p])=>p.startsWith('src/hackathon-test-vault/e5/'))){
  const revision=path==='src/hackathon-test-vault/e5/environment.mjs'?clockFixes.changes[path]:null;if(revision)check(revision.before===pin.after,'BC_E5B_DEVELOPMENT_PACKET');
  check(createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')===(revision?.after??pin.after),'BC_E5B_DEVELOPMENT_PACKET');
 }
 const diagnostic=createExecutionFailureLog();
 const owner=openOwnedApiBridge({environmentId,clock:now,onFailure:(phase,error)=>observeExecutionFailure(diagnostic.record,phase,error)}),m=owner.runtime.manifest;
 // Fixed codes only, outside the API rollback and before E4 sanitizes errors.
 const config=Object.freeze({version:'clear-bootcamp-e4b-connection.1',sourceMode,runtime:owner.runtime,reader:owner.reader,worker:owner.worker,fenceReader:owner.owner.fenceReader,
  bindController(factory){owner.owner.bindController(ports=>{
   let subphase;const observed={...ports,witnesses:{...ports.witnesses,consume(ticket){const e=ports.witnesses.consume(ticket);subphase=e.phase;return e;}}};
   const controller=factory(observed);
   return Object.fromEntries(Object.entries(controller).map(([phase,fn])=>[phase,arg=>{subphase=undefined;try{return fn(arg);}catch(error){observeExecutionFailure(diagnostic.record,phase,error,{subphase});throw error;}finally{subphase=undefined;}}]));
  });}});
 connections.add(config);
 failureLogs.set(config,diagnostic.record);
 const reader=new ExecutionReader(m),cache=new Map(),bindings=new Map();
 const execution='REGISTERED_TEST_CHAIN',result=(version,fields)=>({version,execution,...fields});
 const binding=context=>{const b=bindings.get(context.applicationId);check(b,'BC_E3_REGISTERED_BINDING');return b;};
 function snapshot(context){const b=binding(context),s=cache.get(context.applicationId);check(s&&now()<s.until,'BC_E3_REGISTERED_SNAPSHOT_EXPIRED');return {b,o:s.observation,a:s.observation.business.application};}
 const procedurePorts={execution,
  registration(context){const b=binding(context);return result('clear-bootcamp-procedure-registration-port.1',{registrationId:b.registrationId,applicationId:context.applicationId,decisionId:context.decisionId,decisionRevision:context.decisionRevision,decisionHash:context.decisionHash,allocationId:b.allocationId,obligationId:b.obligationId,recipient:b.wallet,token:m.tokenAddress,amountAtoms:'100000000',tokenDecimals:'6',domain:m.domain});},
  funding(context){const {b,o,a}=snapshot(context),full=['2','3'].includes(a.state);if(full)check(a.recipient===b.wallet&&a.allocationId===b.chainAllocationId&&a.target.decisionId===b.chainDecisionId&&a.target.decisionHash===context.decisionHash&&a.target.revision===String(context.decisionRevision)&&a.target.acceptanceSequence===String(context.acceptanceSequence),'BC_E3_REGISTERED_ALLOCATION');
   return result('clear-bootcamp-procedure-funding-port.1',{snapshotId:'snapshot-'+o.checkpoint.hash.slice(2,42),status:full?'FULLY_ALLOCATED':'WAITING_FUNDS',...context,allocationId:full?b.allocationId:null,obligationId:b.obligationId,recipient:b.wallet,token:m.tokenAddress,amountAtoms:'100000000',tokenDecimals:'6',reservedAtoms:full?'100000000':'0',allocationVersion:a.version,authorizationEpoch:a.epoch,replacement:null,queue:full?null:{position:1,shortfallAtoms:'100000000'}});},
  chain(context){const {b,o,a}=snapshot(context),accepted=['5','6'].includes(a.state),r=o.business.right;
   return result('clear-bootcamp-procedure-chain-port.1',{snapshotId:'snapshot-'+o.checkpoint.hash.slice(2,42),applicationId:context.applicationId,status:accepted?'ACCEPTED':a.state==='4'?'TERMINATED':'UNACCEPTED',allocationId:accepted?b.allocationId:null,decisionId:accepted?b.decisionId:null,recipient:accepted?r.recipient:null,token:accepted?r.token:null,amountAtoms:accepted?r.amountAtoms:null,claimState:accepted?(a.state==='6'?'CLAIMED':'UNCLAIMED'):null,transactionState:accepted?'INCLUDED':null,transactionHash:null,blockRef:'block-'+o.checkpoint.number,canonical:true});},
  authorization(context){const {b,o,a}=snapshot(context);check(o.business.nonce===b.nonce,'BC_E3_REGISTERED_NONCE');return result('clear-bootcamp-procedure-authorization-port.1',{snapshotId:'snapshot-'+o.checkpoint.hash.slice(2,42),domain:m.domain,signerKeyId:m.signerKeyId,signerActive:!o.business.keyRevoked,authorizationEpoch:a.epoch,nonce:b.nonce,nonceAvailable:!o.business.nonceUsed,expiresAt:cache.get(context.applicationId).until+115});},
 };
 procedures.add(procedurePorts);Object.freeze(procedurePorts);
 return Object.freeze({configuration:config,procedurePorts,runtime:owner.runtime,
  registerApplication({applicationId,wallet,decisionId}){check(!bindings.has(applicationId),'BC_E3_REGISTERED_BINDING');const short=e4Hash({applicationId,wallet}).slice(2,42);bindings.set(applicationId,{applicationId,wallet,decisionId,registrationId:'registration-'+short,allocationId:'allocation-'+short,obligationId:'obligation-'+short,chainApplicationId:ZERO,chainDecisionId:ZERO,chainAllocationId:ZERO,nonce:'0x'+randomBytes(32).toString('hex')});},
  bindOpaque(applicationId,target){const b=binding({applicationId});check(b.chainApplicationId===ZERO,'BC_E3_REGISTERED_BINDING');Object.assign(b,{chainApplicationId:target.applicationId,chainDecisionId:target.decisionId,chainAllocationId:target.allocationId});},
  async refresh(applicationId){const b=binding({applicationId}),o=validateE4Observation(await reader.observe({applicationId:b.chainApplicationId,nonce:b.nonce}),{runtimeHash:owner.runtime.runtimeHash});cache.set(applicationId,{observation:o,until:now()+5});return o;},
  diagnostics:diagnostic.snapshot,failureState:()=>owner.owner.failureState(),metrics:()=>owner.owner.metrics(),close:()=>owner.owner.close(),
 });
}
