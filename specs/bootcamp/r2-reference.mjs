// Design arithmetic/measurement oracle ONLY. No auth, signer, DB, allocation, worker or transaction submission.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const R2_ADDENDUM=Object.freeze(JSON.parse(readFileSync(new URL('./p0-addendum-r2.json',import.meta.url))));
const check=(ok,code)=>{if(!ok)throw new Error(code);};
const atoms=value=>{check(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value),'R2_ATOMS');return BigInt(value);};
const ref=value=>check(typeof value==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(value),'R2_REF');
// obligations: all confirmed, unpaid obligations, including allocated obligations.
// An allocation is the whole obligation, never a second additional obligation.
export function referenceFunding({confirmedBalanceAtoms,obligations,allocations}){
 const balance=atoms(confirmedBalanceAtoms);check(Array.isArray(obligations)&&Array.isArray(allocations),'R2_FUNDING');
 const byId=new Map();let total=0n,reserved=0n;
 for(const row of obligations){ref(row.obligationId);ref(row.applicationRef);ref(row.recipientRef);check(!byId.has(row.obligationId),'R2_DUPLICATE_OBLIGATION');
  check(typeof row.decisionHash==='string'&&/^0x[0-9a-f]{64}$/.test(row.decisionHash),'R2_TARGET');
  const amount=atoms(row.amountAtoms);check(amount>0n,'R2_AMOUNT');byId.set(row.obligationId,row);total+=amount;}
 const allocated=new Set(),ids=new Set();
 for(const a of allocations){ref(a.allocationId);check(!ids.has(a.allocationId)&&!allocated.has(a.obligationId),'R2_DOUBLE_ALLOCATION');
  const o=byId.get(a.obligationId);check(o&&a.applicationRef===o.applicationRef&&a.decisionHash===o.decisionHash&&a.recipientRef===o.recipientRef&&a.amountAtoms===o.amountAtoms,'R2_ALLOCATION_TARGET');
  ids.add(a.allocationId);allocated.add(a.obligationId);reserved+=atoms(a.amountAtoms);}
 check(balance>=reserved,'R2_INSOLVENT_RESERVED');
 const available=balance-reserved,unallocated=total-reserved,shortfall=unallocated>available?unallocated-available:0n;
 return {confirmedBalanceAtoms:balance.toString(),reservedAtoms:reserved.toString(),availableAtoms:available.toString(),
  confirmedObligationAtoms:total.toString(),unallocatedObligationAtoms:unallocated.toString(),shortfallAtoms:shortfall.toString(),
  affectedQueue:obligations.filter(o=>!allocated.has(o.obligationId)).map(o=>o.obligationId),
  allocatedClaimRefs:allocations.map(a=>a.allocationId),globalPause:false};
}
const unionMs=rows=>{
 const intervals=rows.map(r=>[r.startedAtMs,r.endedAtMs]).sort((a,b)=>a[0]-b[0]);let total=0,end=-1;
 for(const [start,stop] of intervals){total+=Math.max(0,stop-Math.max(start,end));end=Math.max(end,stop);}return total;
};
// Synthetic rows remain labelled synthetic. This function never turns examples into measurements.
export function referenceMetrics(events,{baselineHumanWorkMs=null,baselineComparable=false,humanWorkCoverageComplete=false}={}){
 check(Array.isArray(events),'R2_EVENTS');const ids=new Map(),operations=new Set(),rows=[];
 for(const event of events){
  const keys=['version','eventId','scenarioRunId','applicationRef','decisionRevision','decisionHash','operationId','eventType','startedAtMs','endedAtMs','actorRef','provenance'];
  check(event&&Object.keys(event).length===keys.length&&keys.every(k=>Object.hasOwn(event,k)),'R2_EVENT_FIELDS');
  check(event.version==='clear-bootcamp-metric-event.2','R2_EVENT_VERSION');for(const k of ['eventId','scenarioRunId','applicationRef','operationId','actorRef'])ref(event[k]);
  check(Number.isSafeInteger(event.decisionRevision)&&event.decisionRevision>=1&&/^0x[0-9a-f]{64}$/.test(event.decisionHash),'R2_DECISION');
  check(R2_ADDENDUM.metrics.eventTypes.includes(event.eventType)&&R2_ADDENDUM.metrics.provenance.includes(event.provenance),'R2_EVENT_TYPE');
  check(Number.isSafeInteger(event.startedAtMs)&&Number.isSafeInteger(event.endedAtMs)&&event.startedAtMs>=0&&event.endedAtMs>=event.startedAtMs,'R2_INTERVAL');
  // Canonical fixed fields avoid object property order changing duplicate semantics.
  const canonical=JSON.stringify(keys.map(k=>event[k]));
  if(ids.has(event.eventId)){check(ids.get(event.eventId)===canonical,'R2_DUPLICATE_CONFLICT');continue;}ids.set(event.eventId,canonical);
  const logical=JSON.stringify(['scenarioRunId','applicationRef','decisionRevision','decisionHash','operationId','eventType'].map(k=>event[k]));
  check(!operations.has(logical),'R2_OPERATION_DUPLICATE');operations.add(logical);rows.push(event);
 }
 check(new Set(rows.map(r=>r.scenarioRunId+':'+r.applicationRef)).size<=1,'R2_CASE_MIX');
 check(new Set(rows.map(r=>r.provenance)).size<=1,'R2_PROVENANCE_MIX');
 const of=type=>rows.filter(r=>r.eventType===type),human=of('HUMAN_WORK_INTERVAL'),waiting=of('WAIT_INTERVAL');
 const humanMs=human.length?[...new Set(human.map(r=>r.actorRef))].reduce((n,actor)=>n+unionMs(human.filter(r=>r.actorRef===actor)),0):null;
 check(baselineHumanWorkMs===null||Number.isSafeInteger(baselineHumanWorkMs)&&baselineHumanWorkMs>0,'R2_BASELINE');
 const starts=of('CASE_STARTED'),ends=of('CASE_FINISHED'),first=starts.length===1?starts[0].startedAtMs:null,last=ends.length===1?ends[0].endedAtMs:null;
 check(first===null||last===null||last>=first,'R2_CASE_TIME');
 const verify=of('CONDITION_VERIFIED');
 return {provenance:rows[0]?.provenance??null,eventCount:rows.length,
  conditionVerificationWallMs:verify.length?Math.max(...verify.map(r=>r.endedAtMs))-Math.min(...verify.map(r=>r.startedAtMs)):null,
  overallElapsedMs:first!==null&&last!==null?last-first:null,humanWorkMs:humanMs,waitingWallMs:waiting.length?unionMs(waiting):null,
  automatedOperationCount:of('AUTO_OPERATION_COMPLETED').length,manualInterventionCount:human.length,
  supplementCount:of('SUPPLEMENT_REQUESTED').length,reverificationCount:of('REVERIFICATION_REQUESTED').length,failureCount:of('OPERATION_FAILED').length,
  baselineHumanWorkMs,humanWorkReductionPercent:baselineComparable===true&&humanWorkCoverageComplete===true&&baselineHumanWorkMs!==null&&humanMs!==null?100*(baselineHumanWorkMs-humanMs)/baselineHumanWorkMs:null};
}
export const frozenFileSha256=relative=>createHash('sha256').update(readFileSync(new URL(relative,import.meta.url))).digest('hex');
