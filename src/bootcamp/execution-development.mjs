// Explicit owner-only isolated TEST composition. No HTTP/body activation flag.
import {keccak256} from 'ethers';
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
export function openDevelopmentConnection({environmentId,sourceMode='SYNTHETIC_TEST_SOURCE',now=()=>Math.floor(Date.now()/1000),assessmentPorts=null}){
 check(['SYNTHETIC_TEST_SOURCE','REGISTERED_TEST_SOURCE'].includes(sourceMode),'BC_E5B_DEVELOPMENT_SOURCE');
 check(assessmentPorts===null||sourceMode==='SYNTHETIC_TEST_SOURCE','BC_E3_ASSESSMENT_BLOCKED');
 const registrationPins=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/normal-source-pins-v27.json',import.meta.url)));
 check(registrationPins.version==='clear-e5-normal-path-source-pins.27'&&registrationPins.scope==='EXACT_V31_RECIPIENT_REGISTRATION_V2','BC_E5B_DEVELOPMENT_PACKET');
 const diagnosticPins=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/normal-source-pins-v22.json',import.meta.url)));
 check(diagnosticPins.scope==='EXACT_V25_NORMAL_PAYMENT_FAILURE_DIAGNOSTICS','BC_E5B_DEVELOPMENT_PACKET');
 const pins=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/source-pins.json',import.meta.url)));
 for(const [path,expected]of Object.entries(pins.sourceArtifactSha256).filter(([p])=>p.startsWith('src/hackathon-test-vault/e5b/'))){
  const revision=diagnosticPins.changes[path];if(revision)check(revision.before===expected,'BC_E5B_DEVELOPMENT_PACKET');
  const v2=registrationPins.changes[path];if(v2)check(v2.before===(revision?.after??expected),'BC_E5B_DEVELOPMENT_PACKET');
  check(createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')===(v2?.after??revision?.after??expected),'BC_E5B_DEVELOPMENT_PACKET');
 }
 const fixes=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/normal-source-pins.json',import.meta.url)));
 const clockFixes=JSON.parse(readFileSync(new URL('../../docs/hackathon-test-vault/e5b/normal-source-pins-v26.json',import.meta.url)));
 check(clockFixes.version==='clear-e5-normal-path-source-pins.26'&&clockFixes.scope==='EXACT_V29_ATOMIC_ADOPTION_AND_CANONICAL_CLOCK_READINESS','BC_E5B_DEVELOPMENT_PACKET');
 for(const [path,pin]of Object.entries(fixes.changes).filter(([p])=>p.startsWith('src/hackathon-test-vault/e5/'))){
  const revision=path==='src/hackathon-test-vault/e5/environment.mjs'?clockFixes.changes[path]:null;if(revision)check(revision.before===pin.after,'BC_E5B_DEVELOPMENT_PACKET');
  const registrationRevision=registrationPins.changes[path];if(registrationRevision)check(registrationRevision.before===(revision?.after??pin.after),'BC_E5B_DEVELOPMENT_PACKET');
  check(createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')===(registrationRevision?.after??revision?.after??pin.after),'BC_E5B_DEVELOPMENT_PACKET');
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
 const procedurePorts={execution,...(assessmentPorts?{objectionAssessment:assessmentPorts.objectionAssessment,revalidationAssessment:assessmentPorts.revalidationAssessment}:{}),
  registration(context){const b=binding(context);b.registrationContext={decisionId:context.decisionId,decisionRevision:context.decisionRevision,decisionHash:context.decisionHash,acceptanceSequence:context.acceptanceSequence};return result(m.version==='clear-e5-test-runtime.2'?'clear-bootcamp-procedure-registration-port.2':'clear-bootcamp-procedure-registration-port.1',{registrationId:b.registrationId,applicationId:context.applicationId,decisionId:context.decisionId,decisionRevision:context.decisionRevision,decisionHash:context.decisionHash,allocationId:b.allocationId,obligationId:b.obligationId,recipient:b.wallet,token:m.tokenAddress,amountAtoms:'100000000',tokenDecimals:'6',domain:m.domain});},
  funding(context){const {b,o,a}=snapshot(context),full=['2','3'].includes(a.state),known=b.decisions.get(a.target.decisionId);
   if(full)check(a.recipient===b.wallet&&a.allocationId===b.chainAllocationId&&known&&known.decisionHash===a.target.decisionHash&&String(known.decisionRevision)===a.target.revision&&(m.version==='clear-e5-test-runtime.2'?BigInt(a.target.acceptanceSequence)>0n:a.target.acceptanceSequence===String(known.acceptanceSequence)),'BC_E3_REGISTERED_ALLOCATION');
   const target=full?known:context,proof=cache.get(context.applicationId).replacement;
   const replacement=proof?{version:'clear-bootcamp-allocation-replacement-receipt.1',allocationId:b.allocationId,
    fromDecisionId:b.decisions.get(proof.previous.decisionId)?.decisionId,fromDecisionHash:proof.previous.decisionHash,fromAuthorizationEpoch:String(proof.previous.epoch),fromAllocationVersion:String(proof.previous.appVersion),
    toDecisionId:target.decisionId,toDecisionHash:target.decisionHash,toAuthorizationEpoch:a.epoch,toAllocationVersion:a.version,receiptHash:proof.receiptHash}:null;
   return result('clear-bootcamp-procedure-funding-port.1',{snapshotId:'snapshot-'+o.checkpoint.hash.slice(2,42),status:full?'FULLY_ALLOCATED':'WAITING_FUNDS',...context,...target,allocationId:full?b.allocationId:null,obligationId:b.obligationId,recipient:b.wallet,token:m.tokenAddress,amountAtoms:'100000000',tokenDecimals:'6',reservedAtoms:full?'100000000':'0',allocationVersion:a.version,authorizationEpoch:a.epoch,replacement:full?replacement:null,queue:full?null:{position:1,shortfallAtoms:'100000000'}});},
  chain(context){const {b,o,a}=snapshot(context),accepted=['5','6'].includes(a.state),r=o.business.right;
   return result('clear-bootcamp-procedure-chain-port.1',{snapshotId:'snapshot-'+o.checkpoint.hash.slice(2,42),applicationId:context.applicationId,status:accepted?'ACCEPTED':a.state==='4'?'TERMINATED':'UNACCEPTED',allocationId:accepted?b.allocationId:null,decisionId:accepted?b.decisions.get(a.target.decisionId)?.decisionId:null,recipient:accepted?r.recipient:null,token:accepted?r.token:null,amountAtoms:accepted?r.amountAtoms:null,claimState:accepted?(a.state==='6'?'CLAIMED':'UNCLAIMED'):null,transactionState:accepted?'INCLUDED':null,transactionHash:null,blockRef:'block-'+o.checkpoint.number,canonical:true});},
  authorization(context){const {b,o,a}=snapshot(context);check(o.business.nonce===b.nonce,'BC_E3_REGISTERED_NONCE');return result('clear-bootcamp-procedure-authorization-port.1',{snapshotId:'snapshot-'+o.checkpoint.hash.slice(2,42),domain:m.domain,signerKeyId:m.signerKeyId,signerActive:!o.business.keyRevoked,authorizationEpoch:a.epoch,nonce:b.nonce,nonceAvailable:!o.business.nonceUsed,expiresAt:cache.get(context.applicationId).until+115});},
 };
 procedures.add(procedurePorts);Object.freeze(procedurePorts);
 return Object.freeze({configuration:config,procedurePorts,runtime:owner.runtime,
  registerApplication({applicationId,wallet,decisionId}){check(!bindings.has(applicationId),'BC_E3_REGISTERED_BINDING');const short=e4Hash({applicationId,wallet}).slice(2,42);bindings.set(applicationId,{applicationId,wallet,decisionId,registrationId:'registration-'+short,allocationId:'allocation-'+short,obligationId:'obligation-'+short,chainApplicationId:ZERO,chainDecisionId:ZERO,chainAllocationId:ZERO,decisions:new Map(),nonce:'0x'+randomBytes(32).toString('hex')});},
  bindDecision(applicationId,target,decision){const b=binding({applicationId});check(target.applicationId===b.chainApplicationId&&target.allocationId===b.chainAllocationId,'BC_E3_REGISTERED_BINDING');const v={decisionId:decision.decisionId,decisionRevision:decision.decisionRevision,decisionHash:decision.decisionHash,acceptanceSequence:decision.acceptanceSequence};const old=b.decisions.get(target.decisionId);check(!old||canonical(old)===canonical(v),'BC_E3_REGISTERED_BINDING');b.decisions.set(target.decisionId,v);},
  bindOpaque(applicationId,target,decision=null){const b=binding({applicationId});check(b.chainApplicationId===ZERO,'BC_E3_REGISTERED_BINDING');Object.assign(b,{chainApplicationId:target.applicationId,chainDecisionId:target.decisionId,chainAllocationId:target.allocationId});b.decisions.set(target.decisionId,decision??b.registrationContext);},
  async refresh(applicationId){
   const b=binding({applicationId});cache.delete(applicationId);
   let o=validateE4Observation(await reader.observe({applicationId:b.chainApplicationId,nonce:b.nonce}),{runtimeHash:owner.runtime.runtimeHash});
   let a=o.business.application,replacement=null;
   if(b.nonceEpoch!==undefined&&b.nonceEpoch!==a.epoch){b.nonce='0x'+randomBytes(32).toString('hex');o=validateE4Observation(await reader.observe({applicationId:b.chainApplicationId,nonce:b.nonce}),{runtimeHash:owner.runtime.runtimeHash});check(o.business.application.epoch===a.epoch,'BC_E5_CURRENT_CHANGED');a=o.business.application;}
   b.nonceEpoch=a.epoch;
   if(a.target.decisionId!==ZERO&&a.target.decisionId!==b.chainDecisionId){
    const logs=await reader.rpc('eth_getLogs',[{address:m.vaultAddress,fromBlock:'0x0',toBlock:'0x'+BigInt(o.checkpoint.number).toString(16),topics:[reader.vault.getEvent('TargetReplaced').topicHash,b.chainApplicationId]}]);
    for(const log of logs){const e=reader.vault.parseLog(log)?.args;if(!e||e.current.decisionId!==a.target.decisionId||e.current.decisionHash!==a.target.decisionHash)continue;
     const tx=await reader.rpc('eth_getTransactionByHash',[log.transactionHash]),raw=await reader.rpc('eth_getTransactionReceipt',[log.transactionHash]);check(tx&&raw?.logs.some(l=>l.logIndex===log.logIndex&&canonical(l)===canonical(log)),'BC_E3_REPLACEMENT_REQUIRED');
     const receipt=await reader.receipt({txHash:log.transactionHash,sender:m.roles.registrar,to:m.vaultAddress,nonce:BigInt(tx.nonce).toString(),dataHash:keccak256(tx.input),applicationId:b.chainApplicationId,method:'replaceTarget'});
     check(receipt.status==='INCLUDED'&&receipt.checkpoint.hash===log.blockHash&&log.removed!==true,'BC_E3_REPLACEMENT_REQUIRED');
     const recorded=receipt.observation.business.application;check(recorded.target.decisionId===e.current.decisionId&&recorded.target.decisionHash===e.current.decisionHash&&recorded.version===String(e.current.appVersion)&&recorded.epoch===String(e.current.epoch),'BC_E3_REPLACEMENT_REQUIRED');
     check((await reader.compare(receipt.checkpoint,o.checkpoint)).status==='CANONICAL_ANCESTOR','BC_E3_REPLACEMENT_REQUIRED');
     check(e.allocationId===a.allocationId&&String(e.current.revision)===a.target.revision&&String(e.current.acceptanceSequence)===a.target.acceptanceSequence,'BC_E3_REPLACEMENT_REQUIRED');
     replacement={previous:e.previous,receiptHash:e4Hash({txHash:log.transactionHash,blockHash:log.blockHash,logIndex:log.logIndex})};
    }
    check(replacement,'BC_E3_REPLACEMENT_REQUIRED');
   }
   await reader.block(o.checkpoint.hash);cache.set(applicationId,{observation:o,replacement,until:now()+5});return o;
  },
  recipientRegistrationState(applicationId){const b=binding({applicationId}),v=cache.get(applicationId);check(v&&now()<v.until,'BC_E5_CURRENT_CHANGED');const a=v.observation.business.application;if(a.state!=='0')check(a.recipient===b.wallet&&b.decisions.has(a.target.decisionId),'BC_E3_REGISTERED_BINDING');return {chainStatus:a.state==='0'?'NOT_REGISTERED':'INCLUDED',canonical:true,finalized:false,checkpoint:v.observation.checkpoint,registrationSequence:a.state==='0'?null:a.target.acceptanceSequence,recipient:a.state==='0'?null:a.recipient,chainApplicationId:b.chainApplicationId};},
  diagnostics:diagnostic.snapshot,failureState:()=>owner.owner.failureState(),metrics:()=>owner.owner.metrics(),close:()=>owner.owner.close(),
 });
}
