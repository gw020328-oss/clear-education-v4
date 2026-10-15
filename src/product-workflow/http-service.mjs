// Development-only source workflow. Authentication remains in application/service.
import { randomUUID } from 'node:crypto';
import { canonical, exactKeys, freeze, requireRule as check } from '../policy/values.mjs';
import { digest } from '../policy/mvp/contract.mjs';
import { identifier, hash32, GATES } from './contract.mjs';
import { openPrivateDb } from './private-db.mjs';
import { openSourceStore } from './source-store.mjs';
import { sourceSnapshotHash, sourceBundleHash, resolveSourceBundle } from './source-contract.mjs';
import { collectSourceSnapshot } from './source-collector.mjs';
import { OFFICIAL_URLS } from './public-fetch.mjs';
import { proposeSourceBundle } from '../ai-policy/source-bundle-adapter.mjs';

const schema = `
CREATE TABLE IF NOT EXISTS heads(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, operation_id TEXT, bundle_hash TEXT) STRICT;
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, actor TEXT NOT NULL, route TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL,
 bundle_id TEXT NOT NULL, revision INTEGER NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 result TEXT, error TEXT, UNIQUE(actor,route,key)) STRICT;
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, actor TEXT NOT NULL, bundle_hash TEXT NOT NULL, preview_hash TEXT NOT NULL, record TEXT NOT NULL) STRICT;
`;
export const SOURCE_HTTP_VERSION='clear-mvp-source-http.1';
const gates = { ...GATES, version:SOURCE_HTTP_VERSION, dataMode:'SYNTHETIC', authenticationScope:'INVITED_WALLET_SESSION', identityVerified:false,
 policyPublished:false, fundingStatus:'UNKNOWN' };
const opId = () => 'op-' + randomUUID();
function waitFor(pending, signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(Error('MVP_CANCELLED'));};
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(pending).then(v=>{signal.removeEventListener('abort',abort);resolve(v);},e=>{signal.removeEventListener('abort',abort);reject(e);});
    if(signal.aborted)abort();
  });
}

export function createWorkflowHttpService({ directory, authentication, instanceId, bundles, captureMode,
 collector, proposalInputs = {}, textAdapter, visionAdapter, now = () => Math.floor(Date.now()/1000) }) {
  check(authentication && typeof authentication.authorizeWorkflow === 'function', 'MVP_CONFIG');
  identifier(instanceId);check(['MOCK','PUBLIC_URL'].includes(captureMode), 'MVP_CONFIG');
  check(captureMode!=='MOCK'||typeof collector==='function','MVP_CONFIG');
  for(const adapter of [textAdapter,visionAdapter])check(!adapter||adapter.execution==='MOCK','MVP_CONFIG');
  const collect=collector??collectSourceSnapshot;
  const definitions = structuredClone(bundles);
  check(Array.isArray(definitions) && definitions.length > 0 && definitions.length <= 8, 'MVP_CONFIG');
  check(new Set(definitions.map(b=>b.bundleId)).size===definitions.length, 'MVP_CONFIG');
  check(new Set(definitions.map(b=>b.sourceId)).size===definitions.length, 'MVP_CONFIG');
  for(const b of definitions){
    exactKeys(b,['bundleId','sourceId','institutionId','productId','cohortId','requiredSourceIds','urlIds'],'MVP_CONFIG');
    [b.bundleId,b.sourceId,b.institutionId,b.productId,b.cohortId,...b.requiredSourceIds].forEach(identifier);
    check(b.requiredSourceIds.length>0 && b.requiredSourceIds.length<=8 && new Set(b.requiredSourceIds).size===b.requiredSourceIds.length,'MVP_CONFIG');
    check(b.urlIds.length>0 && b.urlIds.every(i=>Number.isInteger(i)&&i>=0&&i<OFFICIAL_URLS.length),'MVP_CONFIG');
  }
  const pins = structuredClone(proposalInputs); // Host-reviewed independent pins; never derive them from captured bytes.
  const environment={instanceId,origin:authentication.origin,mode:'SYNTHETIC_HTTP',captureMode,
    configurationHash:digest('CLEAR-MVP-HTTP-CONFIG.1',{definitions,pins,textModel:textAdapter?.modelVersion??null,visionModel:visionAdapter?.modelVersion??null})};
  const store=openPrivateDb(directory,'mvp-http.sqlite',environment,schema,['heads','operations','reviews']);
  let archive;
  try{archive=openSourceStore({directory,environment:{instanceId,origin:authentication.origin,mode:'PUBLIC_SOURCE_ONLY'},now});}
  catch(e){store.close();throw e;}
  const {db,transaction}=store, active=new Map();let closing=false;
  const clock=()=>{const t=now();check(Number.isSafeInteger(t)&&t>=0&&t<=4102444800,'MVP_CLOCK');return t;};
  const definition=id=>{identifier(id);const d=definitions.find(b=>b.bundleId===id);check(d,'MVP_NOT_FOUND');return d;};
  const actor=(context,write=false)=>{check(!closing,'MVP_CLOSED');const s=authentication.authorizeWorkflow(context,write);check(s.role==='operator','FORBIDDEN');return s;};
  const head=id=>db.prepare('SELECT * FROM heads WHERE id=?').get(id)??{id,revision:0,operation_id:null,bundle_hash:null};
  const load=id=>{identifier(id);const row=db.prepare('SELECT * FROM operations WHERE id=?').get(id);check(row,'MVP_NOT_FOUND');return row;};
  function expire(row){
    if(['RUNNING','COMMITTING'].includes(row.state)&&clock()>=row.expires_at){
      db.prepare("UPDATE operations SET state='TIMED_OUT',result=NULL,error='TIMED_OUT' WHERE id=? AND state IN ('RUNNING','COMMITTING')").run(row.id);
      active.get(row.id)?.abort();return load(row.id);
    }return row;
  }
  function available(hash){try{const b=archive.getBundle(hash);for(const e of b.entries)archive.getSnapshot(e.snapshotHash);return true;}catch{return false;}}
  function purgeExpired(){
    const removed=archive.purgeExpired();
    transaction(()=>{for(const row of db.prepare("SELECT id,result FROM operations WHERE kind='drafts' AND result IS NOT NULL").all()){
      const result=JSON.parse(row.result);if(result.bundleHash&&!available(result.bundleHash))db.prepare("UPDATE operations SET result=NULL,error='SOURCE_UNAVAILABLE' WHERE id=?").run(row.id);
    }});return removed;
  }
  function view(row){row=expire(row);const h=head(row.bundle_id),result=row.result?JSON.parse(row.result):null;
    const current=row.error!=='SOURCE_UNAVAILABLE'&&h.revision===row.revision&&h.operation_id===row.id&&(!result?.bundleHash||available(result.bundleHash));
    return freeze({operationId:row.id,bundleId:row.bundle_id,revision:row.revision,kind:row.kind,state:row.state,current,
      result:row.state==='SUCCEEDED'&&current?result:null,reason:!current?'STALE_CONTEXT':row.error,
      createdAt:row.created_at,expiresAt:row.expires_at,captureMode,...gates});
  }
  function reserve(s,id,kind,key,body){
    identifier(key);const route='/mvp/source-bundles/'+id+'/'+kind,requestHash=digest('CLEAR-MVP-HTTP-REQUEST.1',body);
    return transaction(()=>{
      const old=db.prepare('SELECT * FROM operations WHERE actor=? AND route=? AND key=?').get(s.wallet,route,key);
      if(old){check(old.request_hash===requestHash,'IDEMPOTENCY_CONFLICT');return {row:old,fresh:false};}
      const h=head(id);check(body.expectedRevision===h.revision,'MVP_STALE');
      check(db.prepare('SELECT COUNT(*) AS n FROM operations').get().n<1000,'MVP_BUSY');
      const revision=h.revision+1,idValue=opId(),t=clock();
      if(h.operation_id){db.prepare("UPDATE operations SET state='SUPERSEDED',result=NULL,error='STALE_CONTEXT' WHERE id=? AND state IN ('RUNNING','COMMITTING')").run(h.operation_id);active.get(h.operation_id)?.abort();}
      db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)').run(idValue,s.wallet,route,key,requestHash,id,revision,kind,'RUNNING',t,t+30);
      db.prepare('INSERT INTO heads VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,operation_id=excluded.operation_id').run(id,revision,idValue,h.bundle_hash);
      return {row:load(idValue),fresh:true};
    });
  }
  const stillCurrent=row=>{const r=expire(load(row.id)),h=head(row.bundle_id);return ['RUNNING','COMMITTING'].includes(r.state)&&h.revision===row.revision&&h.operation_id===row.id;};
  function fail(row,code){transaction(()=>{if(stillCurrent(row))db.prepare('UPDATE operations SET state=?,error=?,result=NULL WHERE id=?').run(code==='CANCELLED'?'CANCELLED':'FAILED',code,row.id);});}
  function recover(row){ // Only reconcile already archived immutable results; never repeat URL/model calls.
    if(row.state!=='COMMITTING')return row;
    try{const r=JSON.parse(row.result),b=archive.getBundle(r.bundleHash);archive.getSnapshot(r.snapshotHash);
      check(b.bundleId===row.bundle_id&&b.revision===row.revision,'MVP_INTEGRITY');
      transaction(()=>{if(stillCurrent(row)){db.prepare("UPDATE operations SET state='SUCCEEDED' WHERE id=?").run(row.id);db.prepare('UPDATE heads SET bundle_hash=? WHERE id=?').run(r.bundleHash,row.bundle_id);}});
    }catch{}return load(row.id);
  }
  async function capture(context,id,body,key,{signal}={}){
    const s=actor(context,true),d=definition(id);purgeExpired();exactKeys(body,['expectedRevision','urlId'],'MVP_CAPTURE');
    check(Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>=0&&d.urlIds.includes(body.urlId),'MVP_CAPTURE');
    const {row,fresh}=reserve(s,id,'snapshots',key,body);if(!fresh)return view(recover(row));
    const controller=new AbortController(),cancel=()=>controller.abort();active.set(row.id,controller);
    if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    let collected;
    try{
      const scope=AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]);
      const pending=Promise.resolve().then(()=>{check(!scope.aborted,'MVP_CANCELLED');return collect({sourceId:d.sourceId,revision:row.revision,institutionId:d.institutionId,productId:d.productId,cohortId:d.cohortId,url:OFFICIAL_URLS[body.urlId]},
        {now,signal:scope});}).then(value=>{if(scope.aborted)for(const bytes of value.blobs.values())bytes.fill(0);return value;});
      collected=await waitFor(pending,scope);
      // Revalidate the authenticated session after asynchronous work, including logout/expiry/CSRF scope.
      actor(context,true);check(!controller.signal.aborted,'MVP_CANCELLED');
      transaction(()=>{check(stillCurrent(row),'MVP_STALE');
        const snapshotHash=sourceSnapshotHash(collected.snapshot);
        const bundle={version:'clear-source-bundle.1',bundleId:id,revision:row.revision,institutionId:d.institutionId,productId:d.productId,cohortId:d.cohortId,requiredSourceIds:d.requiredSourceIds,
          entries:[{sourceId:d.sourceId,revision:row.revision,snapshotHash}]};
        const bundleHash=sourceBundleHash(bundle),result={bundleHash,snapshotHash,retrievalStatus:collected.snapshot.retrievalStatus};
        // Write a recovery marker before committing the independent archive database.
        db.prepare("UPDATE operations SET state='COMMITTING',result=? WHERE id=?").run(canonical(result),row.id);
      });
      const result=JSON.parse(load(row.id).result),snapshot=collected.snapshot;
      archive.putSnapshot(snapshot,collected.blobs);
      archive.putBundle({version:'clear-source-bundle.1',bundleId:id,revision:row.revision,institutionId:d.institutionId,productId:d.productId,cohortId:d.cohortId,
        requiredSourceIds:d.requiredSourceIds,entries:[{sourceId:d.sourceId,revision:row.revision,snapshotHash:result.snapshotHash}]});
      recover(load(row.id));
    }catch{fail(row,controller.signal.aborted?'CANCELLED':'SOURCE_UNAVAILABLE');}
    finally{signal?.removeEventListener('abort',cancel);active.delete(row.id);if(collected)for(const bytes of collected.blobs.values())bytes.fill(0);}
    return view(load(row.id));
  }
  async function preview(context,id){
    actor(context);definition(id);purgeExpired();const h=head(id);check(h.bundle_hash,'MVP_NOT_FOUND');
    const b=archive.getBundle(h.bundle_hash),resolved=await resolveSourceBundle(b,{getSnapshot:archive.getSnapshot,getArtifact:archive.getArtifact,now});
    actor(context);const latest=head(id);check(latest.revision===h.revision&&latest.bundle_hash===h.bundle_hash,'MVP_STALE');
    const operation=h.operation_id?view(recover(load(h.operation_id))):null;
    const sourceCurrent=!!operation?.current&&operation.state==='SUCCEEDED';
    // Source blocks are JSON text only, never an HTML/asset response. A separate
    // transient proposal may include bounded quotes; it is not a document receipt.
    const display={bundleId:id,revision:h.revision,bundleRevision:b.revision,bundleHash:h.bundle_hash,status:resolved.status,missingSourceIds:resolved.missingSourceIds,
      sourceCurrent,operationId:operation?.operationId??null,operationState:operation?.state??null,
      draft:operation?.kind==='drafts'&&sourceCurrent?operation.result?.proposal??null:null,
      sources:resolved.sources.map(({snapshot,blocks})=>({sourceId:snapshot.sourceId,revision:snapshot.revision,snapshotHash:sourceSnapshotHash(snapshot),
        sourceType:snapshot.sourceType,retrievalStatus:snapshot.retrievalStatus,collectedAt:snapshot.collectedAt,expiresAt:snapshot.expiresAt,
        limitations:snapshot.limitations,resourceRequests:snapshot.resourceRequests,blocks:blocks.map(({locator,text})=>({locator,text}))}))};
    const previewHash=digest('CLEAR-MVP-SOURCE-DISPLAY.1',display);
    const operationMeta=operation?{...operation,result:undefined}:null;
    if(operationMeta)delete operationMeta.result;
    return freeze({...display,previewHash,captureMode,operation:operationMeta,...gates});
  }
  async function propose(context,id,body,key,{signal}={}){
    const s=actor(context,true);definition(id);exactKeys(body,['expectedRevision','bundleHash'],'MVP_PROPOSE');hash32(body.bundleHash);
    check(Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>=0,'MVP_PROPOSE');
    identifier(key);const prior=db.prepare('SELECT * FROM operations WHERE actor=? AND route=? AND key=?').get(s.wallet,'/mvp/source-bundles/'+id+'/drafts',key);
    if(prior){check(prior.request_hash===digest('CLEAR-MVP-HTTP-REQUEST.1',body),'IDEMPOTENCY_CONFLICT');return view(prior);}
    const before=await preview(context,id);check(before.revision===body.expectedRevision&&before.bundleHash===body.bundleHash,'MVP_STALE');
    check(before.operation?.kind!=='snapshots'||before.sourceCurrent,'MVP_STALE');
    const config=pins[id];check(config,'MVP_TEMPLATE_REQUIRED');
    const {row,fresh}=reserve(s,id,'drafts',key,body);if(!fresh)return view(row);
    const controller=new AbortController(),cancel=()=>controller.abort();active.set(row.id,controller);
    if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    try{
      const bundle=archive.getBundle(body.bundleHash);
      const proposal=await proposeSourceBundle({...structuredClone(config),bundle,expectedBundleHash:body.bundleHash,runId:row.id},
        {getSnapshot:archive.getSnapshot,getArtifact:archive.getArtifact,getCurrentBundleHash:archive.getCurrentBundleHash,now},
        {textAdapter,visionAdapter,signal:controller.signal});
      actor(context,true);check(!controller.signal.aborted,'MVP_CANCELLED');
      transaction(()=>{check(stillCurrent(row)&&head(id).bundle_hash===body.bundleHash&&proposal.current,'MVP_STALE');
        db.prepare("UPDATE operations SET state='SUCCEEDED',result=? WHERE id=?").run(canonical({bundleHash:body.bundleHash,proposal}),row.id);});
    }catch{fail(row,controller.signal.aborted?'CANCELLED':'DRAFT_UNAVAILABLE');}
    finally{signal?.removeEventListener('abort',cancel);active.delete(row.id);}
    return view(load(row.id));
  }
  async function review(context,id,body,key){
    const s=actor(context,true);exactKeys(body,['expectedRevision','previewHash','acknowledgement'],'MVP_REVIEW');hash32(body.previewHash);identifier(key);
    check(Number.isSafeInteger(body.expectedRevision)&&body.expectedRevision>=0,'MVP_REVIEW');
    definition(id);const idValue=digest('CLEAR-MVP-SOURCE-REVIEW.1',{actor:s.wallet,key,bundleId:id});
    const previous=db.prepare('SELECT record FROM reviews WHERE id=?').get(idValue);
    if(previous){const r=JSON.parse(previous.record);check(r.request.revision===body.expectedRevision&&r.request.previewHash===body.previewHash&&r.request.acknowledgement===body.acknowledgement,'IDEMPOTENCY_CONFLICT');return reviewView(r);}
    check(body.acknowledgement==='SYNTHETIC_REVIEW_ONLY','MVP_REVIEW');const p=await preview(context,id);
    check(p.sourceCurrent&&p.revision===body.expectedRevision&&p.previewHash===body.previewHash,'MVP_STALE');
    // No source/identity approval, executable publication or student agreement is produced.
    return transaction(()=>{actor(context,true);const h=head(id);check(h.revision===p.revision&&h.bundle_hash===p.bundleHash,'MVP_STALE');
      const old=db.prepare('SELECT record FROM reviews WHERE id=?').get(idValue);
      const request={bundleId:id,bundleHash:p.bundleHash,revision:p.revision,previewHash:p.previewHash,operationId:p.operationId,acknowledgement:body.acknowledgement};
      if(old){const r=JSON.parse(old.record);check(canonical(r.request)===canonical(request),'IDEMPOTENCY_CONFLICT');return reviewView(r);}
      check(db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n<1000,'MVP_BUSY');
      const r={reviewId:idValue,request,reviewer:s.wallet,reviewedAt:clock(),status:'SYNTHETIC_REVIEW_RECORDED',...gates};
      db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?)').run(idValue,s.wallet,p.bundleHash,p.previewHash,canonical(r));return reviewView(r);
    });
  }
  function reviewView(r){const h=head(r.request.bundleId);return freeze({...r,current:h.revision===r.request.revision&&h.bundle_hash===r.request.bundleHash&&available(r.request.bundleHash)});}
  purgeExpired();
  return {origin:authentication.origin,capture,preview,propose,review,purgeExpired,
    reviews(context,id){actor(context);definition(id);purgeExpired();return db.prepare("SELECT record FROM reviews WHERE json_extract(record,'$.request.bundleId')=? ORDER BY rowid DESC LIMIT 20").all(id).map(r=>reviewView(JSON.parse(r.record)));},
    catalogue(context){actor(context);purgeExpired();return freeze({bundles:definitions.map(b=>({...b,revision:head(b.bundleId).revision})),urls:OFFICIAL_URLS.map((url,urlId)=>({urlId,url})),captureMode,...gates});},
    operation(context,id){const s=actor(context);purgeExpired();const r=load(id);check(r.actor===s.wallet,'MVP_NOT_FOUND');return view(recover(r));},
    recoverOperation(context,id,kind,key){const s=actor(context);purgeExpired();definition(id);identifier(key);check(['snapshots','drafts'].includes(kind),'MVP_NOT_FOUND');
      const r=db.prepare('SELECT * FROM operations WHERE actor=? AND route=? AND key=?').get(s.wallet,'/mvp/source-bundles/'+id+'/'+kind,key);check(r,'MVP_NOT_FOUND');return view(recover(r));},
    cancel(context,id,body){const s=actor(context,true);exactKeys(body,[],'MVP_CANCEL');return transaction(()=>{const row=load(id);check(row.actor===s.wallet,'MVP_NOT_FOUND');
      if(['RUNNING','COMMITTING'].includes(row.state)){db.prepare("UPDATE operations SET state='CANCELLED',result=NULL,error='CANCELLED' WHERE id=?").run(id);active.get(id)?.abort();}return view(load(id));});},
    close(){check(active.size===0,'MVP_BUSY');closing=true;archive.close();store.close();},
  };
}
