import {createHash} from 'node:crypto';
import {createNormalReceiptReader} from './normal-receipt.mjs';
import {isMoodlePaymentSnapshots} from './moodle-payment-snapshot.mjs';
import {canonical,exactKeys,freeze,requireRule as check} from '../policy/values.mjs';

export const MOODLE_PAYMENT_VERSION='clear-moodle-payment-status.1';
export const FIXED_MOODLE_MAPPING_VERSION='clear-normal-moodle-fixed-mapping.1';
export const FIXED_MOODLE_SCOPE_VERSION='clear-moodle-fixed-scope-check.1';
export const FIXED_MOODLE_PAYMENT_VERSION='clear-moodle-fixed-payment-status.1';
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const ref=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const slug=v=>typeof v==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(v);
const hash=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v);
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&v!=='0x'+'00'.repeat(20);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const same=(a,b)=>canonical(a)===canonical(b);
const mappingKeys=['mappingRevision','installationRef','courseRef','subjectRef','bApplicationId','bindingRef','bindingRevision',
 'bindingExpiresAtExclusive','applicationId','participantId','courseOperatorRef','policyHash','runtimeMappingHash',
 'participantWallet','operatorWallet','recipient','token','expiresAtExclusive'];
function pinMapping(value){
 const fixed=value?.version===FIXED_MOODLE_MAPPING_VERSION;
 exactKeys(value,fixed?[...mappingKeys.filter(k=>!['bApplicationId','bindingRef','bindingRevision','bindingExpiresAtExclusive'].includes(k)),'version','mappingRef']:mappingKeys,'MOODLE_PAYMENT_MAPPING');const m=structuredClone(value);
 check((fixed?['mappingRevision','expiresAtExclusive']:['mappingRevision','bindingRevision','bindingExpiresAtExclusive','expiresAtExclusive']).every(k=>positive(m[k]))
  &&['installationRef','courseRef','subjectRef',fixed?'mappingRef':'bindingRef'].every(k=>ref(m[k]))
  &&['applicationId','participantId','courseOperatorRef'].every(k=>slug(m[k]))
  &&(fixed?['policyHash','runtimeMappingHash']:['bApplicationId','policyHash','runtimeMappingHash']).every(k=>hash(m[k]))
  &&['participantWallet','operatorWallet','recipient','token'].every(k=>address(m[k]))
  &&m.participantWallet===m.recipient&&m.operatorWallet!==m.recipient&&m.token!==m.recipient,'MOODLE_PAYMENT_MAPPING');
 return freeze(m);
}
function snapshot(p,m,role){
 check(p?.version==='clear-moodle-payment-snapshot.1'&&p.applicationId===m.applicationId
  &&p.role===(role==='COURSE_OPERATOR'?'OPERATOR':'PARTICIPANT')
  &&p.participantId===m.participantId&&p.participantWallet===m.participantWallet&&p.courseOperatorRef===m.courseOperatorRef
  &&p.policyHash===m.policyHash&&p.runtimeMappingHash===m.runtimeMappingHash
  &&slug(p.decisionId)&&positive(p.decisionRevision)&&hash(p.decisionHash)
  &&p.sourceCurrentness==='NOT_RECHECKED'&&positive(p.clearSessionExpiresAtExclusive)
  &&['MET','NOT_MET','NEEDS_SUPPLEMENT','UNKNOWN'].includes(p.recordedConditionsStatus),'MOODLE_PAYMENT_SCOPE');
 if(p.publication)check(p.publication.recipient===m.recipient&&p.publication.token===m.token&&p.publication.amountAtoms==='100000000','MOODLE_PAYMENT_SCOPE');
 return p;
}
const target=p=>{const {observedAt,...stable}=p;return stable;};
function receipt(r,m,role,p){
 check(r?.version==='clear-bootcamp-normal-payment-receipt.1'&&r.applicationId===m.applicationId
  &&r.policyHash===m.policyHash&&r.runtimeMappingHash===m.runtimeMappingHash
  &&r.role===(role==='COURSE_OPERATOR'?'OPERATOR':'PARTICIPANT')
  &&r.expectedPayment?.recipient===m.recipient&&r.expectedPayment?.token===m.token
  &&r.expectedPayment.amountAtoms==='100000000'&&r.expectedPayment.symbol==='TEST'&&r.expectedPayment.decimals===6
  &&same(r.currentDecision,{decisionId:p.decisionId,decisionRevision:p.decisionRevision,decisionHash:p.decisionHash})
  &&['NOT_OBSERVED','READBACK_UNAVAILABLE','INCLUDED'].includes(r.claim?.state),'MOODLE_PAYMENT_RECEIPT');
 const included=r.claim.state==='INCLUDED';
 if(included)check(r.claim.canonical===true&&r.claim.finalized===false&&r.claim.transferAmountAtoms==='100000000'
  &&r.balance?.receivedAtoms==='100000000'&&r.balance.exactExpectedAmountVerified===true&&hash(r.claim.transactionHash)
  &&hash(r.claim.checkpoint?.hash)&&['number','time'].every(k=>typeof r.claim.checkpoint[k]==='string'&&/^(0|[1-9][0-9]*)$/.test(r.claim.checkpoint[k]))
  &&slug(r.acceptedTarget?.decisionId)&&positive(r.acceptedTarget.decisionRevision)&&hash(r.acceptedTarget.decisionHash), 'MOODLE_PAYMENT_RECEIPT');
 else check(r.claim.canonical===null&&r.claim.finalized===null&&r.claim.transferAmountAtoms===null
  &&r.balance?.receivedAtoms===null&&r.balance.exactExpectedAmountVerified===null,'MOODLE_PAYMENT_RECEIPT');
 return {state:r.claim.state,amountAtoms:included?'100000000':null,symbol:'TEST',decimals:6,
  canonical:included?true:null,finalized:included?false:null,transactionHash:included?r.claim.transactionHash:null,
  checkpoint:included?{number:r.claim.checkpoint.number,hash:r.claim.checkpoint.hash,time:r.claim.checkpoint.time}:null,
  acceptedDecision:included?{id:r.acceptedTarget.decisionId,revision:r.acceptedTarget.decisionRevision,hash:r.acceptedTarget.decisionHash}:null};
}

// Private owner composition only. resolveScope must independently verify current
// Moodle authority and B binding/mapping; it cannot borrow a student's session
// for a teacher. No HTTP mount, signer, write port, or review-reader heartbeat.
// A reviewed production resolver is still required before host activation.
export function createMoodlePaymentReader({mapping,resolveScope,authentication,snapshots,receiptSource,
 now=()=>Math.floor(Date.now()/1000),monotonic=()=>performance.now()}){
 const m=pinMapping(mapping),fixed=m.version===FIXED_MOODLE_MAPPING_VERSION;
 check([resolveScope,authentication?.authorizeWorkflow,now,monotonic].every(f=>typeof f==='function')
  &&isMoodlePaymentSnapshots(snapshots,authentication),'MOODLE_PAYMENT_CONFIG');
 exactKeys(receiptSource,['runtimeHash','readReport','readCanonicalClaim','selfAttestor'],'MOODLE_PAYMENT_CONFIG');
 const readSnapshot=(c,a)=>snapshots.read(c,a);
 const getPaymentReceipt=createNormalReceiptReader({...receiptSource,authorize:readSnapshot,
  runtimeMappingHash:m.runtimeMappingHash,policyHash:m.policyHash,recipient:m.recipient,token:m.token});
 let wallFloor=0;
 const time=()=>{const wall=now(),mono=monotonic();check(positive(wall)&&wall>=wallFloor&&Number.isFinite(mono)&&mono>=0,'MOODLE_PAYMENT_CLOCK');wallFloor=wall;return {wall,mono};};
 async function scope(caller){
  const s=structuredClone(await resolveScope(caller));
  exactKeys(s,['requestRef','authorityRef',fixed?'version':'authorityEpoch','expiresAtExclusive','mapping','role','clearContext'],'MOODLE_PAYMENT_SCOPE');
  exactKeys(s.clearContext,['token','wallet','chainId','csrf'],'MOODLE_PAYMENT_SCOPE');
  check(ref(s.requestRef)&&ref(s.authorityRef)&&(fixed?s.version===FIXED_MOODLE_SCOPE_VERSION:positive(s.authorityEpoch))&&positive(s.expiresAtExclusive)&&same(s.mapping,m)&&['PARTICIPANT','COURSE_OPERATOR'].includes(s.role),'MOODLE_PAYMENT_SCOPE');
  const actor=authentication.authorizeWorkflow(s.clearContext,false),participant=s.role==='PARTICIPANT';
  check(actor.role===(participant?'participant':'operator')&&actor.wallet.toLowerCase()===(participant?m.participantWallet:m.operatorWallet),'MOODLE_PAYMENT_CLEAR_ROLE');
  return s;
 }
 return Object.freeze({async read(caller){
  const started=time();let end=Math.min(m.expiresAtExclusive,fixed?m.expiresAtExclusive:m.bindingExpiresAtExclusive,started.wall+5);
  const current=()=>{const t=time();check(t.wall<end&&t.mono>=started.mono&&t.mono-started.mono<5000,'MOODLE_PAYMENT_EXPIRED');return t;};
  current();const before=await scope(caller);end=Math.min(end,before.expiresAtExclusive);current();const initialHash=digest(before);
  const first=snapshot(readSnapshot(before.clearContext,m.applicationId),m,before.role);
  end=Math.min(end,first.clearSessionExpiresAtExclusive);current();
  const r=await getPaymentReceipt(before.clearContext,m.applicationId);current();
  const after=await scope(caller);current();check(digest(after)===initialHash,'MOODLE_PAYMENT_AUTHORITY_CHANGED');
  // Existing store rechecks CLEAR role/application access before returning.
  const last=snapshot(readSnapshot(after.clearContext,m.applicationId),m,after.role);current();
  check(same(target(first),target(last)),'MOODLE_PAYMENT_CHANGED');
  const payment=receipt(r,m,after.role,last);
  return freeze({version:fixed?FIXED_MOODLE_PAYMENT_VERSION:MOODLE_PAYMENT_VERSION,requestRef:after.requestRef,mappingRevision:m.mappingRevision,
   ...(fixed?{mappingRef:m.mappingRef}:{bindingRef:m.bindingRef,bindingRevision:m.bindingRevision}),role:after.role,observedAt:current().wall,expiresAtExclusive:end,
   displayOnly:true,paymentAuthority:false,decision:{id:last.decisionId,revision:last.decisionRevision,hash:last.decisionHash,
    recordedConditionsStatus:last.recordedConditionsStatus,sourceCurrentness:'NOT_RECHECKED'},
   consent:{...last.recordedConsent,publicationMatchesCurrentDecision:last.publication?.current??false,
    onchainWalletSignaturesVerified:false,usableForPayment:false},receipt:payment});
 }});
}
