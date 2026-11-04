import {createHmac} from 'node:crypto';
import {createMoodleLoginIntents,MOODLE_LOGIN_INTENT} from '../../tools/bootcamp/moodle-login-intent.mjs';
import {createMoodleCommandScope} from '../../src/bootcamp/moodle-command-scope.mjs';
import {MOODLE_COMMAND_VERSION,moodleCommandDigest} from '../../src/embedded-wallet/moodle-command.mjs';
import {START} from './fixture.mjs';
export const hex=n=>n.toString(16).padStart(64,'0');
export const createCommand=(key='native-create')=>({method:'POST',path:'/bootcamp/v1/applications',body:{},idempotencyKey:key});
export async function commandFixture({authentication,contexts}={}){
 let wall=START,mono=0,seq=0,current=true,sessionRef=hex(99),afterAuth=()=>{},authorityDenied=false;
 const verificationOperations=[],records=new Map();let loseExecutionResponse=false;
 contexts??={PARTICIPANT:{token:hex(10),wallet:'0x'+'12'.repeat(20),chainId:12345,csrf:hex(11)},
  COURSE_OPERATOR:{token:hex(12),wallet:'0x'+'34'.repeat(20),chainId:12345,csrf:hex(13)}};
 const wallets=Object.fromEntries(Object.entries(contexts).map(([r,c])=>[r,c.wallet.toLowerCase()]));
 const proof=x=>createHmac('sha256','invented-proof-key').update(JSON.stringify(x)).digest('hex');
 const auth=c=>{const a=authentication?authentication.whoami(c):{wallet:c.wallet,role:c.wallet.toLowerCase()===wallets.PARTICIPANT?'participant':'operator',expiresAt:START+1200};
  authentication?.authorizeWorkflow(c,true);afterAuth();return a;};
 const owner=createMoodleLoginIntents({ownerRunId:'run-fixture',runExpiresAtExclusive:START+1800,wallets,
  scope:{installationRef:'installation',courseRef:'course',subjectRef:'student',actorRefs:{PARTICIPANT:'student',COURSE_OPERATOR:'teacher'}},
  now:()=>wall,monotonic:()=>mono,deriveBrowserProof:proof,deriveFinishProof:proof,authenticateClear:auth,
  verifyMoodle:async({operation,request:q})=>{verificationOperations.push(operation);
   if(operation==='execute-command'){if(!records.delete(q.requestRef))throw Error('COMMAND_ALREADY_TAKEN');if(loseExecutionResponse)throw Error('EXECUTE_RESPONSE_LOST');}
   if(authorityDenied)throw Error('MOODLE_ROLE_REVOKED');return ({ownerRunId:q.ownerRunId,role:q.role,installationRef:'installation',courseRef:'course',subjectRef:'student',
   actorRef:q.role==='PARTICIPANT'?'student':'teacher',sessionRef,expiresAtExclusive:START+1500});}});
 const signal=new AbortController();
 const lease=()=>({signal:signal.signal,assertCurrent(){if(!current)throw Error('LEASE_REVOKED');}});
 const request=(role,extra={})=>({version:MOODLE_LOGIN_INTENT,requestRef:hex(++seq),ownerRunId:'run-fixture',moodleAuthorityRef:hex(90),role,expiresAtExclusive:wall+5,...extra});
 const bindings={};
 for(const role of Object.keys(contexts)){
  const q=request(role),issued=await owner.issue(q),boot=owner.bootstrap(),p={ownerRunId:q.ownerRunId,intentRef:q.requestRef,launchCode:issued.launchCode};
  const redeemed=owner.redeem({code:issued.launchCode,...boot,browserProof:proof({...p,challenge:boot.challenge})},{native:true});
  await owner.complete(redeemed.browserBinding,contexts[role]);
  const status=await owner.status(request(role,{intentRef:q.requestRef}));
  const done=await owner.finish(request(role,{intentRef:q.requestRef,handback:status.handback,finishProof:proof(p)}));
  if(done.status!=='CONNECTED')throw Error('FIXTURE_NOT_CONNECTED');
  bindings[role]={intentRef:q.requestRef,commandBinding:redeemed.commandBinding};
 }
 let lastReservation;
 const scope=createMoodleCommandScope({enabled:()=>true,reserve:async q=>(lastReservation=await owner.reserveCommand(q))});
 return {owner,scope,contexts,bindings,signal,verificationOperations,loseExecute(){loseExecutionResponse=true;},revokeRole(){authorityDenied=true;},get lastReservation(){return lastReservation;},
  advance(n){wall+=n;mono+=n*1000;},drift(n){mono+=n;},invalidate(){current=false;},replaceSession(){sessionRef=hex(98);},onAuth(fn){afterAuth=fn;},
  async grant(command,role='PARTICIPANT'){
   const q=request(role,{version:MOODLE_COMMAND_VERSION,intentRef:bindings[role].intentRef,commandHash:moodleCommandDigest(command)});
   records.set(q.requestRef,structuredClone(q));
   const result=await owner.authorizeCommand(q,lease());
   return {command,context:contexts[role],commandBinding:bindings[role].commandBinding,requestRef:result.requestRef,signal:signal.signal};
  },
  end(role='PARTICIPANT'){return owner.end(request(role,{intentRef:bindings[role].intentRef}),lease());},
 };
}
