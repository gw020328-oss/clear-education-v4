// C1: invited participant-only synthetic applications and exact-display acknowledgments.
// No publication, real consent, upload, document observer, Evidence or funding action.
import { randomBytes,randomUUID } from 'node:crypto';
import { canonical,exactKeys,freeze,requireRule as check } from '../policy/values.mjs';
import { compileMvpPolicy } from '../policy/mvp/compiler.mjs';
import { digest,validateContract } from '../policy/mvp/contract.mjs';
import { identifier,hash32,revision,GATES } from './contract.mjs';
import { openPrivateDb } from './private-db.mjs';
export const STUDENT_HTTP_VERSION='clear-mvp-student-http.1';
const gates={...GATES,version:STUDENT_HTTP_VERSION,dataMode:'SYNTHETIC',authenticationScope:'INVITED_WALLET_SESSION',identityVerified:false,
 policyPublished:false,fundingStatus:'UNKNOWN',eligibilityStatus:'NOT_EVALUATED',sourceStatus:'UNVERIFIED',documentSubmissionReady:false};
const schema=`
CREATE TABLE IF NOT EXISTS policies(hash TEXT PRIMARY KEY,policy_id TEXT NOT NULL,revision INTEGER NOT NULL,record TEXT NOT NULL,UNIQUE(policy_id,revision)) STRICT;
CREATE TABLE IF NOT EXISTS policy_heads(id TEXT PRIMARY KEY,hash TEXT NOT NULL REFERENCES policies(hash),revision INTEGER NOT NULL,active INTEGER NOT NULL CHECK(active IN(0,1))) STRICT;
CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,policy_id TEXT NOT NULL,policy_hash TEXT NOT NULL REFERENCES policies(hash),revision INTEGER NOT NULL,
 binding_revision INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN('DRAFT','ACKNOWLEDGED_SYNTHETIC')),ack_id TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(wallet,policy_id)) STRICT;
CREATE TABLE IF NOT EXISTS acknowledgments(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES applications(id),record TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,actor TEXT NOT NULL,route TEXT NOT NULL,key TEXT NOT NULL,request_hash TEXT NOT NULL,application_id TEXT NOT NULL REFERENCES applications(id),application_revision INTEGER NOT NULL,result TEXT NOT NULL,UNIQUE(actor,route,key)) STRICT;
CREATE TRIGGER IF NOT EXISTS student_policy_immutable BEFORE UPDATE ON policies BEGIN SELECT RAISE(ABORT,'IMMUTABLE_STUDENT_POLICY');END;
CREATE TRIGGER IF NOT EXISTS student_ack_immutable BEFORE UPDATE ON acknowledgments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_STUDENT_ACK');END;
CREATE TRIGGER IF NOT EXISTS student_command_immutable BEFORE UPDATE ON commands BEGIN SELECT RAISE(ABORT,'IMMUTABLE_STUDENT_COMMAND');END;
`;
export function createStudentWorkflowService({directory,authentication,instanceId,policies=[],now=()=>Math.floor(Date.now()/1000)}){
 check(authentication&&typeof authentication.authorizeWorkflow==='function','MVP_STUDENT_CONFIG');identifier(instanceId);
 check(Array.isArray(policies)&&policies.length<=16,'MVP_STUDENT_CONFIG');
 const definitions=structuredClone(policies);check(new Set(definitions.map(p=>p.policyId)).size===definitions.length,'MVP_STUDENT_CONFIG');
 const prepared=definitions.map(p=>{exactKeys(p,['policyId','revision','draft','sources','capabilities'],'MVP_STUDENT_CONFIG');identifier(p.policyId);revision(p.revision);
  return {definition:p,compiled:compileMvpPolicy(p.draft,{sources:p.sources,capabilities:p.capabilities})};});
 check(new Set(prepared.map(p=>p.compiled.policyHash)).size===prepared.length,'MVP_STUDENT_CONFIG');
 const store=openPrivateDb(directory,'mvp-student.sqlite',{instanceId,origin:authentication.origin,mode:'SYNTHETIC_STUDENT_C1'},schema,['policies','policy_heads','applications','acknowledgments','commands']);
 const {db,transaction}=store;let closed=false;
 const clock=()=>{const t=now();check(Number.isSafeInteger(t)&&t>=0&&t<=4102444800,'MVP_CLOCK');return t;};
 try{transaction(()=>{
  db.prepare('UPDATE policy_heads SET active=0').run();
  for(const {definition:p,compiled:c}of prepared){
   const prior=db.prepare('SELECT * FROM policy_heads WHERE id=?').get(p.policyId);
   check(!prior||p.revision>=prior.revision,'MVP_POLICY_ROLLBACK');
   const old=db.prepare('SELECT * FROM policies WHERE policy_id=? AND revision=?').get(p.policyId,p.revision);
   if(old)check(old.hash===c.policyHash&&old.record===canonical(p),'MVP_POLICY_CONFLICT');
   else {check(!db.prepare('SELECT hash FROM policies WHERE hash=?').get(c.policyHash),'MVP_POLICY_CONFLICT');
    db.prepare('INSERT INTO policies VALUES(?,?,?,?)').run(c.policyHash,p.policyId,p.revision,canonical(p));}
   db.prepare('INSERT INTO policy_heads VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,revision=excluded.revision,active=1').run(p.policyId,c.policyHash,p.revision);
  }
 });}catch(error){store.close();throw error;}
 const actor=(context,write=false)=>{check(!closed,'MVP_CLOSED');const s=authentication.authorizeWorkflow(context,write);check(s.role==='participant','FORBIDDEN');return s;};
 const load=id=>{hash32(id);const a=db.prepare('SELECT * FROM applications WHERE id=?').get(id);check(a,'MVP_NOT_FOUND');return a;};
 const owned=(id,s)=>{const a=load(id);check(a.wallet===s.wallet,'MVP_NOT_FOUND');check(clock()>=a.updated_at,'MVP_CLOCK');return a;};
 function policy(hash){hash32(hash);const row=db.prepare('SELECT * FROM policies WHERE hash=?').get(hash);check(row,'MVP_POLICY_UNAVAILABLE');
  const p=JSON.parse(row.record),c=compileMvpPolicy(p.draft,{sources:p.sources,capabilities:p.capabilities});check(c.policyHash===hash&&p.policyId===row.policy_id&&p.revision===row.revision,'MVP_STUDENT_INTEGRITY');return {row,definition:p,compiled:c};}
 function availability(a){const h=db.prepare('SELECT * FROM policy_heads WHERE id=?').get(a.policy_id);return !h?.active?'POLICY_UNAVAILABLE':h.hash!==a.policy_hash?'POLICY_CHANGED':null;}
 function display(p){const c=p.compiled,d=c.policy;
  return freeze({displayVersion:'clear-mvp-student-display.1',policyId:p.row.policy_id,policyRevision:p.row.revision,policyHash:c.policyHash,policyVersion:d.policyVersion,
   scope:{institutionId:d.institutionId,productId:d.productId,cohortId:d.cohortId},sourceSetHash:c.sourceSetHash,ruleHashes:c.ruleHashes,
   conditions:{ruleVersion:d.ruleVersion,requirements:d.requirements,rules:d.rules,commonRuleIds:d.commonRuleIds,tiers:d.tiers,learningRules:d.learningRules,amount:d.amount,deadlines:d.deadlines,selection:d.selection,questions:d.questions,capabilities:d.capabilities},
   acknowledgementScope:'SYNTHETIC_ACK_ONLY',...gates});
 }
 function policyView(p){const shown=display(p),h=db.prepare('SELECT * FROM policy_heads WHERE id=?').get(p.row.policy_id),current=!!h?.active&&h.hash===p.compiled.policyHash;
  return freeze({policyId:p.row.policy_id,policyRevision:p.row.revision,policyHash:p.compiled.policyHash,policyCurrent:current,
   configurationStatus:current?'SYNTHETIC_READY':h?.active?'SUPERSEDED_SYNTHETIC':'UNAVAILABLE',display:shown,displayHash:digest('CLEAR-MVP-STUDENT-DISPLAY.1',shown),...gates});}
 function binding(a){const c=policy(a.policy_hash).compiled,subject=digest('CLEAR-MVP-STUDENT-SUBJECT.1',{origin:authentication.origin,instanceId,wallet:a.wallet});
  const b={applicationId:a.id,subjectRef:subject,subjectBindingId:'wallet-'+subject.slice(2,34),bindingRevision:a.binding_revision,recipientRef:'recipient-'+subject.slice(2,34),instanceId,
   policyHash:a.policy_hash,policyVersion:c.policy.policyVersion,productId:c.policy.productId,cohortId:c.policy.cohortId};validateContract('Binding',b);return b;}
 function ackView(row,a){const r=JSON.parse(row.record);check(r.applicationId===a.id&&digest('CLEAR-MVP-STUDENT-ACK.1',r.payload)===r.acknowledgmentHash,'MVP_STUDENT_INTEGRITY');
  return freeze({...r,current:!availability(a)&&a.ack_id===r.acknowledgmentId,...gates});}
 function view(a){check(clock()>=a.updated_at,'MVP_CLOCK');const problem=availability(a),p=policy(a.policy_hash),ack=a.ack_id?db.prepare('SELECT * FROM acknowledgments WHERE id=?').get(a.ack_id):null;
  check((a.state==='ACKNOWLEDGED_SYNTHETIC')===!!ack,'MVP_STUDENT_INTEGRITY');
  return freeze({applicationId:a.id,learner:a.wallet,policyId:a.policy_id,policyHash:a.policy_hash,policyRevision:p.row.revision,workflowRevision:a.revision,
   state:problem??a.state,policyCurrent:!problem,agreementScope:ack?'SYNTHETIC_ACK_ONLY':'NONE',acknowledgment:ack?ackView(ack,a):null,
   createdAt:a.created_at,updatedAt:a.updated_at,...gates});}
 function preview(a){const p=policyView(policy(a.policy_hash)),payload={previewVersion:'clear-mvp-student-preview.1',applicationId:a.id,expectedRevision:a.revision,
  binding:binding(a),policyId:a.policy_id,policyRevision:p.policyRevision,policyHash:a.policy_hash,display:p.display,displayHash:p.displayHash,acknowledgementScope:'SYNTHETIC_ACK_ONLY',...gates};
  return freeze({...payload,previewHash:digest('CLEAR-MVP-STUDENT-PREVIEW.1',payload),policyCurrent:!availability(a)});}
 function commandView(row){const a=load(row.application_id),problem=availability(a),current=a.revision===row.application_revision&&!problem;
  check(a.wallet===row.actor,'MVP_STUDENT_INTEGRITY');check(clock()>=a.updated_at,'MVP_CLOCK');return freeze({operationId:row.id,applicationId:a.id,applicationRevision:row.application_revision,state:'RECORDED',
   current,reason:current?null:problem??'STALE_CONTEXT',result:current?JSON.parse(row.result):null,...gates});}
 function command(context,s,route,key,body,fn){identifier(key);const requestHash=digest('CLEAR-MVP-STUDENT-COMMAND.1',body);
  return transaction(()=>{
   actor(context,true);
   const old=db.prepare('SELECT * FROM commands WHERE actor=? AND route=? AND key=?').get(s.wallet,route,key);
   if(old){check(old.request_hash===requestHash,'IDEMPOTENCY_CONFLICT');return commandView(old);}
   check(db.prepare('SELECT COUNT(*) AS n FROM commands').get().n<2000,'MVP_BUSY');
   const a=fn(),id='student-op-'+randomUUID(),result=view(a);
   db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?,?,?)').run(id,s.wallet,route,key,requestHash,a.id,a.revision,canonical(result));
   return commandView(db.prepare('SELECT * FROM commands WHERE id=?').get(id));
  });
 }
 return {origin:authentication.origin,close(){closed=true;store.close();},
  policies(context){actor(context);return freeze({policies:db.prepare('SELECT hash FROM policy_heads WHERE active=1 ORDER BY id').all().map(r=>policyView(policy(r.hash))),...gates});},
  policy(context,hash){actor(context);return policyView(policy(hash));},
  list(context){const s=actor(context);return db.prepare('SELECT * FROM applications WHERE wallet=? ORDER BY created_at,id LIMIT 100').all(s.wallet).map(view);},
  get(context,id){return view(owned(id,actor(context)));},
  preview(context,id){return preview(owned(id,actor(context)));},
  create(context,body,key){const s=actor(context,true);exactKeys(body,['policyHash'],'MVP_STUDENT_CREATE');hash32(body.policyHash);
   return command(context,s,'applications',key,body,()=>{const p=policy(body.policyHash),h=db.prepare('SELECT * FROM policy_heads WHERE id=?').get(p.row.policy_id);
    check(h?.active&&h.hash===body.policyHash,'MVP_POLICY_UNAVAILABLE');check(!db.prepare('SELECT id FROM applications WHERE wallet=? AND policy_id=?').get(s.wallet,p.row.policy_id),'MVP_APPLICATION_EXISTS');
    check(db.prepare('SELECT COUNT(*) AS n FROM applications').get().n<500,'MVP_BUSY');
    const id='0x'+randomBytes(32).toString('hex'),t=clock();
    db.prepare("INSERT INTO applications VALUES(?,?,?,?,1,1,'DRAFT',NULL,?,?)").run(id,s.wallet,p.row.policy_id,body.policyHash,t,t);return load(id);
   });},
  acknowledge(context,id,body,key){const s=actor(context,true);exactKeys(body,['expectedRevision','previewHash','acknowledgement'],'MVP_STUDENT_ACK');revision(body.expectedRevision);hash32(body.previewHash);
   check(body.acknowledgement==='SYNTHETIC_ACK_ONLY','MVP_STUDENT_ACK');owned(id,s);
   return command(context,s,id+'/agreement',key,body,()=>{const a=owned(id,s);check(!availability(a),'MVP_STALE');check(a.revision===body.expectedRevision&&a.state==='DRAFT','MVP_STALE');
    const displayed=preview(a);check(displayed.previewHash===body.previewHash,'MVP_STALE');const acknowledgmentId='ack-'+randomUUID(),t=clock();check(t>=a.updated_at,'MVP_CLOCK');
    const payload={applicationId:id,applicationRevision:a.revision+1,recordedAt:t,actor:s.wallet,preview:displayed,scope:'SYNTHETIC_ACK_ONLY'};
    const record={acknowledgmentId,applicationId:id,acknowledgmentHash:digest('CLEAR-MVP-STUDENT-ACK.1',payload),payload,...gates};
    db.prepare('INSERT INTO acknowledgments VALUES(?,?,?)').run(acknowledgmentId,id,canonical(record));
    db.prepare("UPDATE applications SET revision=revision+1,state='ACKNOWLEDGED_SYNTHETIC',ack_id=?,updated_at=? WHERE id=?").run(acknowledgmentId,t,id);return load(id);
   });},
  selectPolicy(context,id,body,key){const s=actor(context,true);exactKeys(body,['expectedRevision','policyHash'],'MVP_STUDENT_POLICY');revision(body.expectedRevision);hash32(body.policyHash);owned(id,s);
   return command(context,s,id+'/policy-selection',key,body,()=>{const a=owned(id,s),p=policy(body.policyHash),h=db.prepare('SELECT * FROM policy_heads WHERE id=?').get(a.policy_id);
    check(a.revision===body.expectedRevision,'MVP_STALE');check(p.row.policy_id===a.policy_id&&h?.active&&h.hash===body.policyHash&&a.policy_hash!==body.policyHash,'MVP_POLICY_UNAVAILABLE');
    const t=clock();check(t>=a.updated_at,'MVP_CLOCK');
    db.prepare("UPDATE applications SET policy_hash=?,revision=revision+1,binding_revision=binding_revision+1,state='DRAFT',ack_id=NULL,updated_at=? WHERE id=?").run(body.policyHash,t,id);return load(id);
   });},
  acknowledgments(context,id){const a=owned(id,actor(context));return db.prepare('SELECT * FROM acknowledgments WHERE application_id=? ORDER BY rowid DESC LIMIT 20').all(id).map(r=>ackView(r,a));},
  operation(context,id){const s=actor(context);identifier(id);const row=db.prepare('SELECT * FROM commands WHERE id=? AND actor=?').get(id,s.wallet);check(row,'MVP_NOT_FOUND');return commandView(row);},
  recover(context,kind,key,id=null){const s=actor(context);identifier(key);check(['applications','agreement','policy-selection'].includes(kind),'MVP_NOT_FOUND');
   const route=kind==='applications'?'applications':owned(id,s).id+'/'+kind;const row=db.prepare('SELECT * FROM commands WHERE actor=? AND route=? AND key=?').get(s.wallet,route,key);check(row,'MVP_NOT_FOUND');return commandView(row);},
 };
}
