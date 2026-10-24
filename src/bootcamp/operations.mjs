import {randomUUID} from 'node:crypto';
import {exactKeys,freeze,requireRule as check} from '../policy/values.mjs';
import {P0_GATES,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {PROJECTION_VERSION} from './r2-ledger.mjs';
import {id,revision,hash} from './model.mjs';
import {createProcedure} from './procedure.mjs';

export function createOperations({db,transaction,authentication,operatorBindings,app,refresh,tick,sessionHash,ledger,heads,replay,command,projectOperation,
 source,mode,procedurePorts=null,fault=()=>{}}){
  const decision=a=>JSON.parse(db.prepare('SELECT record FROM decisions WHERE id=?').get(a.decision_id).record);
  function authenticate(context,write){
    const s=authentication.authorizeWorkflow(context,write);check(['participant','operator'].includes(s?.role),'FORBIDDEN');
    check(typeof s.wallet==='string'&&/^0x[0-9a-fA-F]{40}$/.test(s.wallet),'FORBIDDEN');return {...s,wallet:s.wallet.toLowerCase()};
  }
  function scope(s,a,bindings=operatorBindings()){check(s.role==='participant'?s.wallet===a.wallet:bindings.some(b=>b.wallet===s.wallet&&b.courseOperatorRef===a.course_operator_ref),'FORBIDDEN');}
  function finalAuthority(context,write,initial,applications){
    // Resolve mutable server scope before the last authentication. No source or
    // scope callback is invoked after that authentication and before return.
    const bindings=operatorBindings(),s=authenticate(context,write);
    check(s.wallet===initial.wallet&&s.role===initial.role,'BC_COMMIT_AUTHORITY');
    for(const a of applications)scope(s,a,bindings);
    if(s.role==='operator')check(bindings.some(b=>b.wallet===s.wallet),'FORBIDDEN');
  }
  function access(context,applicationId,write,fn,finalCheck=()=>{},{retryClockBoundary=false}={}){
    id(applicationId);
    // Only internal registration opts in. Retry one rolled-back transaction,
    // never a caller's stale CAS/decision, changed source, port or authority.
    for(let attempt=0;;attempt++){
    const result=transaction(()=>{
      const s=authenticate(context,write);let a=app(applicationId);scope(s,a);const clock=tick();
      a=refresh(a,clock.time,clock.reversed,s.role==='participant'?sessionHash(context,s.wallet):null);
      const initialSequence=ledger.sequence();let clockOnly=false;
      db.exec('SAVEPOINT r2_command');
      try{check(!clock.reversed,'BC_CLOCK_REVERSED');const value=fn(a,s,clock.time),sequence=ledger.sequence();
        const final=tick(),latest=refresh(app(applicationId),final.time,final.reversed);finalCheck(latest,s,final.time);const end=tick();
        clockOnly=!final.reversed&&!end.reversed&&end.time>clock.time&&latest.revision===a.revision&&ledger.sequence()===sequence;
        check(!final.reversed&&!end.reversed&&end.time===clock.time&&latest.revision===a.revision&&ledger.sequence()===sequence,'BC_VIEW_STALE');
        finalAuthority(context,write,s,[latest]);
        db.exec('RELEASE r2_command');return {value};}
      catch(error){db.exec('ROLLBACK TO r2_command; RELEASE r2_command');const c=tick(),latest=refresh(app(applicationId),c.time,c.reversed);
        return {error,retry:retryClockBoundary&&attempt===0&&clockOnly&&!c.reversed&&c.time>=clock.time
          &&latest.revision===a.revision&&ledger.sequence()===initialSequence};}
    });
    if(result.retry)continue;
    if(result.error)throw result.error;return result.value;
    }
  }
  const current=(a,r)=>a.status==='ACTIVE'&&r.targetDecisionId===a.decision_id;
  const actionView=(a,r)=>({record:r,current:current(a,r),usableForAuthorization:false});
  function dto(a,s,time){
    const d=decision(a),history=ledger.actions(a.id),active=history.filter(r=>current(a,r)),hs=heads(a);
    const openObjections=active.filter(r=>r.kind==='OBJECTION');
    const evidenceState=openObjections.length?'UNRESOLVED':hs.some(h=>!h.valid)?'REVERIFICATION_REQUIRED':d.conditionsStatus==='MET'?'COMPLETE':d.conditionsStatus==='NEEDS_SUPPLEMENT'?'NEEDS_SUPPLEMENT':'UNRESOLVED';
    return freeze({version:PROJECTION_VERSION,projectionVersion:2,role:s.role.toUpperCase(),ledgerSequence:ledger.sequence(),applicationId:a.id,
      decisionId:d.decisionId,decisionRevision:d.decisionRevision,decisionHash:d.decisionHash,policyHash:a.policy_hash,runtimeMappingHash:a.mapping_hash,fundingSnapshotId:null,
      asOf:{observedAt:time,blockRef:null},current:a.status==='ACTIVE',staleReason:a.status==='ACTIVE'?null:'APPLICATION_CANCELLED',
      evidence:{state:evidenceState,conditionsStatus:d.conditionsStatus,criteria:d.criterionResults.map(r=>{
        const h=hs.find(h=>h.criterion_id===r.criterionId);return {criterionId:r.criterionId,state:r.state,evidenceId:r.evidenceId,evidenceRevision:r.evidenceRevision,
          originalEvidenceAccessible:s.role==='participant'&&!!h?.valid,expiresAt:h?.evidence.rawLocator.expiresAt??null,
          reasonCode:s.role==='operator'?'ROLE_RAW_ACCESS_NOT_GRANTED':h?.reason??(h?null:'SOURCE_UNAVAILABLE')};
      })},
      funding:{implementation:'NOT_IMPLEMENTED',state:null,confirmedBalanceAtoms:null,reservedAtoms:null,availableAtoms:null,
        confirmedObligationAtoms:null,unallocatedObligationAtoms:null,shortfallAtoms:null},
      payment:{implementation:'NOT_IMPLEMENTED',state:'BLOCKED',reason:'AUTHORIZATION_AND_FUNDING_NOT_IMPLEMENTED',
        candidateAmountAtoms:d.amountCandidate.amountAtoms,symbol:'TEST',decimals:6,transactionHash:null,confirmationBlock:null},
      consent:{implementation:'BLOCKED_INTENT_ONLY',status:'BLOCKED',reason:d.conditionsStatus==='MET'?'FULL_ALLOCATION_REQUIRED':'CURRENT_MET_DECISION_REQUIRED',
        acceptedConsentCount:0,deadlinePolicy:null,noObjectionAutomaticRouteEnabled:false,intents:active.filter(r=>r.kind==='CONSENT_INTENT').map(r=>actionView(a,r))},
      objection:{status:openObjections.length?'UNRESOLVED':'NONE_RECEIVED',validity:openObjections.length?'UNASSESSED':null,
        deadlineExtensionAllowed:false,records:openObjections.map(r=>actionView(a,r))},metrics:ledger.metrics(a.id),gates:P0_GATES});
  }
  function action(context,applicationId,body,key,kind){
    exactKeys(body,['expectedRevision','expectedLedgerSequence','targetDecisionId','targetDecisionRevision','targetDecisionHash','reason'],'BC_R2_ACTION_BODY');
    revision(body.expectedRevision);revision(body.targetDecisionRevision);id(body.targetDecisionId);hash(body.targetDecisionHash);
    check(Number.isSafeInteger(body.expectedLedgerSequence)&&body.expectedLedgerSequence>=0,'BC_LEDGER_SEQUENCE');
    check(kind==='CONSENT_INTENT'?body.reason==='AGREE_SAME_RESULT':['SOURCE_MISMATCH','EVIDENCE_MISSING','DECISION_TARGET_ERROR','UNRESOLVED_QUESTION'].includes(body.reason),'BC_R2_REASON');
    return access(context,applicationId,true,(a,s,time)=>{
      const route='r2-'+kind.toLowerCase()+':'+applicationId,prior=replay(s.wallet,route,key,body);if(prior)return projectOperation(prior);
      check(a.revision===body.expectedRevision&&ledger.sequence()===body.expectedLedgerSequence,'BC_VIEW_STALE');const d=decision(a);
      check(a.status==='ACTIVE'&&d.decisionId===body.targetDecisionId&&d.decisionRevision===body.targetDecisionRevision&&d.decisionHash===body.targetDecisionHash,'BC_DECISION_TARGET');
      const actorRef=s.role==='participant'?a.participant_id:a.course_operator_ref;
      const logicalKey=p0Hash('R2-ACTION',{kind,applicationId,decisionHash:d.decisionHash,actorRef,reason:body.reason});
      const record={version:kind==='CONSENT_INTENT'?'clear-bootcamp-consent-gate.2':'clear-bootcamp-objection-receipt.2',id:'action-'+randomUUID(),kind,
        applicationId,targetDecisionId:d.decisionId,targetDecisionRevision:d.decisionRevision,targetDecisionHash:d.decisionHash,
        actorRef,actorRole:s.role.toUpperCase(),recordedAt:time,reason:body.reason,
        processingStatus:kind==='OBJECTION'?'RECEIVED':'BLOCKED',validityStatus:kind==='OBJECTION'?'UNASSESSED':'NOT_ACCEPTED',
        deadlineExtensionAllowed:false,deadlinePolicy:null,usableForAuthorization:false,gates:P0_GATES};
      const saved=ledger.action(a.id,kind,logicalKey,record);
      const result=command(a,s.wallet,route,key,body,{decisionId:d.decisionId,actionId:saved.id},time);
      return projectOperation(result);
    });
  }
  const operations={
    authorizeOperations(context,write=false){const s=authenticate(context,write);finalAuthority(context,write,s,[]);},
    getOperationsProjection(context,applicationId){return access(context,applicationId,false,dto);},
    listOperations(context,{limit=20,after=null,expectedLedgerSequence=null}={}){
      check(Number.isSafeInteger(limit)&&limit>=1&&limit<=50,'BC_PAGE');if(after!==null)id(after);
      if(expectedLedgerSequence!==null)check(Number.isSafeInteger(expectedLedgerSequence)&&expectedLedgerSequence>=0,'BC_LEDGER_SEQUENCE');
      const result=transaction(()=>{
        const s=authenticate(context,false);check(s.role==='operator','FORBIDDEN');
        const courses=operatorBindings().filter(b=>b.wallet===s.wallet).map(b=>b.courseOperatorRef);check(courses.length>0,'FORBIDDEN');
        const all=db.prepare('SELECT * FROM applications ORDER BY id').all().filter(a=>courses.includes(a.course_operator_ref));
        const c=tick();for(const a of all)refresh(a,c.time,c.reversed);
        try{
          check(!c.reversed,'BC_CLOCK_REVERSED');check(expectedLedgerSequence===null||ledger.sequence()===expectedLedgerSequence,'BC_VIEW_STALE');
          const selected=all.filter(a=>after===null||a.id>after).slice(0,limit+1),rows=selected.slice(0,limit).map(a=>dto(app(a.id),s,c.time));
          const sequence=ledger.sequence(),final=tick();for(const a of all)refresh(app(a.id),final.time,final.reversed);
          const end=tick();check(!final.reversed&&!end.reversed&&end.time===c.time&&sequence===ledger.sequence(),'BC_VIEW_STALE');
          finalAuthority(context,false,s,all);
          return {value:freeze({version:PROJECTION_VERSION,ledgerSequence:sequence,rows,nextAfter:selected.length>limit?rows.at(-1).applicationId:null,gates:P0_GATES})};
        }catch(error){const end=tick();for(const a of all)refresh(app(a.id),end.time,end.reversed);return {error};}
      });
      if(result.error)throw result.error;return result.value;
    },
    getMetricEvents(context,applicationId){return access(context,applicationId,false,a=>freeze({version:'clear-bootcamp-metric-events.2',ledgerSequence:ledger.sequence(),events:ledger.events(a.id),gates:P0_GATES}));},
    getR2Operation(context,applicationId,operationId){id(operationId);return access(context,applicationId,false,a=>{
      const row=db.prepare('SELECT record FROM commands WHERE id=? AND application_id=?').get(operationId,a.id);check(row,'BC_NOT_FOUND');const record=JSON.parse(row.record);
      check(!record.route.startsWith('e3-'),'BC_REQUEST_VERSION');return projectOperation(record);
    });},
    getAction(context,applicationId,actionId){id(actionId);return access(context,applicationId,false,a=>{const r=ledger.actions(a.id).find(r=>r.id===actionId);check(r,'BC_NOT_FOUND');return freeze(actionView(a,r));});},
    requestConsent(context,applicationId,body,key){return action(context,applicationId,body,key,'CONSENT_INTENT');},
    fileObjection(context,applicationId,body,key){return action(context,applicationId,body,key,'OBJECTION');},
  };
  return Object.assign(operations,createProcedure({db,transaction,ledger,access,heads,source,replay,command,operatorBindings,mode,ports:procedurePorts,fault}));
}
