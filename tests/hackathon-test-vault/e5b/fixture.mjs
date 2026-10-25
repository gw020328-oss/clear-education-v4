import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {openSync,closeSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture,hash} from '../e5/fixture.mjs';
import {environmentRecord,stopEnvironment,parkEnvironment} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {openOwnedApiBridge} from '../../../src/hackathon-test-vault/e5b/bridge.mjs';
import {ensure,sha} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {commitment,testApiController} from './controller-fixture.mjs';
import {ZERO} from '../../../src/hackathon-test-vault/e5/reader.mjs';
export const command=(method,args,applicationId=ZERO)=>({method,args,applicationId});
export async function bridgeFixture(t){
 const f=await fixture(),{dir}=environmentRecord(f.id);f.service.close();
 const path=join(dir,'test-api-controller.sqlite');if(!existsSync(path))closeSync(openSync(path,'wx',0o600));const api=new DatabaseSync(path);api.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS commits(ref TEXT PRIMARY KEY,record TEXT NOT NULL)');
 const state={clockOffset:0,now:()=>Math.floor(Date.now()/1000)+state.clockOffset,fence:'1',workerId:'worker-1',leaseId:randomUUID(),leaseUntil:Math.floor(Date.now()/1000)+120,current:true,intentFence:'1',before:null,ports:null,seen:[],inTransaction:false};
 const expected=b=>commitment(b,state),factory=testApiController(api,state);
 let bridge=openOwnedApiBridge({environmentId:f.id,clock:()=>state.now()});bridge.owner.bindController(factory);
 const result={f,dir,state,api,factory,get bridge(){return bridge;},
  restart({cut,wrapFactory}={}){bridge.owner.close();bridge=openOwnedApiBridge({environmentId:f.id,clock:()=>state.now(),cut});bridge.owner.bindController(wrapFactory?ports=>wrapFactory(ports,factory(ports)):factory);},
  async request(cmd,{expiresAt=state.leaseUntil,purpose='EXECUTE',identity={},business}={}){
   const {observation:o,businessHash}=await bridge.reader.observe(cmd),now=state.now();
   if(!business){let sourceUntil=null,reviewUntil=null,messageUntil=null;const a=o.business.application;
    if(['registerCurrentMet','allocate','startReview','replaceTarget','bindConsents','prepareUnsigned','accept'].includes(cmd.method)){
     const target=cmd.method==='registerCurrentMet'?cmd.args[3]:cmd.method==='replaceTarget'?cmd.args[2]:a.target;sourceUntil=Number(target.sourceValidUntilExclusive);reviewUntil=cmd.method==='startReview'?Number(cmd.args[3])+600:Number(a.firstStartedAt)>0?Number(a.firstStartedAt)+600:null;if(['prepareUnsigned','accept'].includes(cmd.method))messageUntil=Number(cmd.args[1].expiresAt);
    }
    business={createdAt:now,sourceUntil,reviewUntil,messageUntil,businessValidUntil:Math.min(now+120,sourceUntil??Infinity,reviewUntil??Infinity,messageUntil??Infinity)};
   }
   const binding={version:'clear-e5-execution-capability.2',intentId:randomUUID(),requestId:randomUUID(),attemptId:randomUUID(),runtimeHash:bridge.runtime.runtimeHash,lineage:'1',workerFence:state.fence,workerId:state.workerId,leaseId:state.leaseId,expiresAt,e3Commitment:ZERO,commandHash:sha(cmd),anchor:o.checkpoint,businessHash,purpose,business,...identity};binding.e3Commitment=expected(binding);const capability=await bridge.worker.authorize({binding,command:cmd});return {binding,command:cmd,capability};
  },
  async refresh(req,{purpose='EXECUTE',newFence=true}={}){if(newFence){state.fence=String(BigInt(state.fence)+1n);state.workerId='worker-'+state.fence;state.leaseId=randomUUID();}state.leaseUntil=state.now()+120;return result.request(req.command,{purpose,business:req.binding.business,identity:Object.fromEntries(['intentId','requestId','attemptId','lineage'].map(k=>[k,req.binding[k]]))});},
  commit(adoption){const r={ref:adoption.ref,manifestHash:adoption.manifestHash,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash};api.prepare('INSERT OR REPLACE INTO commits VALUES(?,?)').run(r.ref,JSON.stringify(r));},
  async included(request,r){if(r.status==='UNKNOWN'&&!r.code){const e=bridge.worker.envelope(request);await f.provider.waitForTransaction(e.txHash,1,10000);return bridge.worker.recover(request);}return r;},
  async submit(cmd){const req=await result.request(cmd),sealed=await bridge.worker.seal(req),adoption=await bridge.worker.adopt({...req,...sealed});result.commit(adoption);const request={...req,...sealed,adoptionId:adoption.adoptionId,adoptionHash:adoption.adoptionHash};return {req,sealed,adoption,result:await result.included(request,await bridge.worker.dispatch(request))};},
  async ready(){const app=hash(),op=hash,now=Number((await f.reader.block()).timestamp),target={decisionId:hash(),revision:'1',decisionHash:hash(),sourceValidUntilExclusive:String(now+3600),acceptanceSequence:String((await f.vault.lastAcceptanceSequence())+1n),sourceReceiptHash:hash()};
   await f.sent(f.token.approve(f.m.vaultAddress,100000000n));await f.sent(f.vault.connect(f.wallet('depositor')).fund(op(),100000000n));
   await f.sent(f.vault.registerCurrentMet(op(),app,f.wallet('recipient').address,target));await f.sent(f.vault.allocate(op(),app,hash(),1));let a=await f.vault.application(app);await f.sent(f.vault.startReview(op(),app,hash(),a.allocatedAt,a.version));a=await f.vault.application(app);await f.sent(f.vault.bindConsents(op(),app,hash(),true,a.version));a=await f.vault.application(app);
   const msg={applicationId:app,policyHash:f.m.policyHash,runtimeMappingHash:f.m.runtimeMappingHash,decisionId:a.target.decisionId,decisionRevision:String(a.target.revision),decisionHash:a.target.decisionHash,recipient:a.recipient.toLowerCase(),token:f.m.tokenAddress,amountAtoms:'100000000',allocationId:a.allocationId,consentSetHash:a.consentSetHash,deadlinePolicyHash:hash(),eligibilityRoute:'1',nonce:hash(),issuedAt:String((await f.reader.block()).timestamp),expiresAt:String(a.firstStartedAt+590n),signerKeyId:f.m.signerKeyId,authorizationEpoch:String(a.epoch),operationsPolicyHash:f.m.operationsPolicyHash,procedureId:a.procedureId,firstReviewStartedAt:String(a.firstStartedAt),decisionPublishedAt:String(a.publishedAt),sourceValidUntilExclusive:String(a.target.sourceValidUntilExclusive),revalidationCount:String(a.revalidationCount)};
   ensure((await result.submit(command('prepareUnsigned',[op(),msg,String(a.version)],app))).result.status==='INCLUDED','E5B_TEST_PREPARE');a=await f.vault.application(app);return {app,msg,command:command('accept',[op(),msg,String(a.version)],app)};
  }
 };
 t.after(()=>{bridge.owner.close();api.close();f.close();stopEnvironment(f.id);parkEnvironment(f.id);});return result;
}
