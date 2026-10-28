import {RuleError,requireRule as check} from '../../src/policy/values.mjs';

// Read-only owner callbacks. Discard a failed projection and ask the store for
// one fresh, fully authenticated view. Never wrap collection, approval or writes.
export function readNormalView(read){
 try{return read();}catch(error){
  let conflict=false;
  try{conflict=Object.getPrototypeOf(error)===RuleError.prototype&&Object.getOwnPropertyDescriptor(error,'message')?.value==='BC_VIEW_STALE';}catch{}
  if(!conflict)throw error;
  return read();
 }
}
export function normalSourceTarget(v){
 check(v.status==='ACTIVE'&&v.decision.current&&v.decision.record.conditionsStatus==='MET'
  &&v.evidence.length===4&&v.evidence.every(e=>e.current),'BC_NORMAL_NOT_MET');
 return Object.freeze({applicationId:v.applicationId,applicationRevision:v.revision,policyHash:v.policyHash,runtimeMappingHash:v.runtimeMappingHash,
  decisionId:v.decision.record.decisionId,decisionRevision:v.decision.record.decisionRevision,decisionHash:v.decision.record.decisionHash});
}
export function assertNormalSourceTarget(current,expected){
 check(expected&&['applicationId','applicationRevision','policyHash','runtimeMappingHash','decisionId','decisionRevision','decisionHash']
  .every(k=>current[k]===expected[k]),'BC_NORMAL_SOURCE_CHANGED');
}
export function normalProcedureBody(store,context,app,target,extra={}){
 const v=readNormalView(()=>store.getProcedure(context,app));assertNormalSourceTarget(v,target);
 return {expectedRevision:v.applicationRevision,expectedLedgerSequence:v.ledgerSequence,
  targetDecisionId:v.decisionId,targetDecisionRevision:v.decisionRevision,targetDecisionHash:v.decisionHash,...extra};
}
// A single transition after collection. Only local store reads may be refreshed;
// connection registration and the command/key are each invoked once here.
export async function registerNormalSourceTarget({store,connection,user,app,key,sourceTarget}){
 const view=readNormalView(()=>store.getApplication(user,app)),target=normalSourceTarget(view);
 if(sourceTarget)assertNormalSourceTarget(target,sourceTarget);
 connection.registerApplication({applicationId:app,wallet:user.wallet.toLowerCase(),decisionId:target.decisionId});
 await connection.refresh(app);
 const body=normalProcedureBody(store,user,app,target),registration=store.registerCurrentMetForE4(user,app,body,key());
 const intake=readNormalView(()=>store.inspectRegistrationForE4(user,app,registration.record.target.registrationTargetId));
 connection.bindOpaque(app,intake.record.opaqueTarget);
 return {target,intake};
}
