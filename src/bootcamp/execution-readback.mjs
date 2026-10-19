import {freeze,requireRule as check} from '../policy/values.mjs';
import {chainBusinessHash} from './execution-ports.mjs';

export function compareExecutionObservations(previous,next,finalized=null){
 if(finalized){check(next.ancestry.finalizedBlockHash===finalized.blockHash,'BC_E5_FINALITY_BINDING');
  if(next.ancestry.finalizedRelation==='DIVERGED')return {status:'FINALIZED_CONFLICT'};
  if(!['SAME','DESCENDANT'].includes(next.ancestry.finalizedRelation))return {status:'REORG_EVIDENCE_REQUIRED'};
 }else check(next.ancestry.finalizedRelation==='NONE','BC_E5_FINALITY_BINDING');
 if(!previous){check(next.ancestry.relation==='INITIAL','BC_E5_ANCESTRY');return {status:'INITIAL_OBSERVATION'};}
 const p=previous.checkpoint,n=next.checkpoint;
 check(next.ancestry.fromBlockHash===p.blockHash,'BC_E5_ANCESTRY_BINDING');
 if(next.ancestry.relation==='UNPROVEN')return {status:'REORG_EVIDENCE_REQUIRED'};
 if(next.ancestry.relation==='DIVERGED')return {status:p.finality.kind==='LOCAL_FINALIZED'?'FINALIZED_CONFLICT':'REORG_EVIDENCE_REQUIRED'};
 const regression=BigInt(next.application.version)<BigInt(previous.application.version)||BigInt(next.application.epoch)<BigInt(previous.application.epoch);
 if(BigInt(n.blockNumber)<BigInt(p.blockNumber)||n.blockNumber===p.blockNumber&&n.blockHash!==p.blockHash||regression)
  return {status:p.finality.kind==='LOCAL_FINALIZED'?'FINALIZED_CONFLICT':'REORG_EVIDENCE_REQUIRED'};
 if(n.blockHash===p.blockHash){check(n.blockNumber===p.blockNumber&&n.parentHash===p.parentHash&&next.ancestry.relation==='SAME'&&chainBusinessHash(previous)===chainBusinessHash(next),'BC_E5_SAME_BLOCK_CONFLICT');
  if(previous.operation.operationId===next.operation.operationId)check(previous.operation.digest===next.operation.digest,'BC_E5_SAME_BLOCK_CONFLICT');return {status:'SAME_CHECKPOINT'};}
 check(next.ancestry.relation==='DESCENDANT','BC_E5_ANCESTRY');
 // A growing chain is not a reorg. The E4 reader must check ancestry and bind
 // every value to the requested blockHash, including its own postcheck reads.
 return {status:'ADVANCED_CHECKPOINT'};
}
export function executionReadback(observation){
 if(!observation)return null;
 const a=observation.application,r=observation.right;
 return freeze({checkpoint:observation.checkpoint,chainVersion:a.version,authorizationEpoch:a.epoch,
  state:a.state,accounting:observation.accounting,queue:observation.queue,
  acceptedRight:r?{...r,claimState:a.state==='SETTLED'?'CLAIMED':'UNCLAIMED',requiresCurrentSource:false,requiresCurrentSigner:false,
   requiresNewPaymentSignature:false,claimExpiresAt:null}:null});
}
