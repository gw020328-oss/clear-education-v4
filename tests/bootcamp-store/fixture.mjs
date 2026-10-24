import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fixture as authenticationFixture} from '../application/fixture.mjs';
import {bootcampP0Example} from '../../specs/bootcamp/p0-example.mjs';
import {P0_POLICY,p0Hash} from '../../specs/bootcamp/p0-contract.mjs';
import {createBootcampStore,DEFAULT_MAPPING_HASH} from '../../src/bootcamp/store.mjs';
export const START=1580558400;
export function syntheticAuthority({now=()=>START,transform=()=>{},beforeVerify=async()=>{},recheck=()=>true}={}){
  const guards=new Map(),issued=new WeakSet(),example=bootcampP0Example();
  function resolveSource(context){
    const key=context.applicationId+':'+context.criterionId;
    if(!guards.has(key))guards.set(key,{
      source:{provider:'synthetic-source',instanceRef:'fixture-only',recordRef:'record-'+p0Hash('FIXTURE-RECORD',key).slice(2,30),
        accountBindingRef:'account-'+p0Hash('FIXTURE-ACCOUNT',context.participantId).slice(2,30)},sourceVersion:'fixture.1',
      sourceHash:p0Hash('FIXTURE-SOURCE',key),sourceReceiptHash:p0Hash('FIXTURE-RECEIPT',key),runtimeMappingHash:DEFAULT_MAPPING_HASH,
      trustHash:p0Hash('FIXTURE-TRUST','not-a-real-signer'),leaseId:'fixture-lease.1',authExpiresAt:START+4000,
      rawExpiresAt:START+1800,queryExpiresAt:START+4000,rawAvailable:true});
    return guards.get(key);
  }
  const producers=Object.fromEntries(P0_POLICY.criteria.map((c,index)=>[c.criterionId,{execution:'SYNTHETIC_FIXTURE',capability:c.capability,
    async verify(request,{signal}){
      await beforeVerify(request,signal);const g=resolveSource(request),e=structuredClone(example.evidence[index]),time=now();
      if(index===2)for(const t of e.facts.topics)t.originalEvidenceLocator.sourceId=g.source.recordRef;
      if(index===3){e.facts.accountProofIssuedAt=time;e.facts.certificateProofIssuedAt=time;}
      const candidate={requestHash:request.requestHash,nonceHash:request.nonceHash,proofBundleHash:p0Hash('FIXTURE-BUNDLE',request.requestHash),
        source:structuredClone(g.source),sourceVersion:g.sourceVersion,sourceHash:g.sourceHash,acquiredAt:time,verifiedAt:time,
        validUntilExclusive:Math.min(time+301,request.expiresAt),facts:e.facts,
        rawLocator:{recordRef:g.source.recordRef,fieldPath:index===2?'/source/body':index===3?'/certificate/status':index===1?'/source/submission':'/source/state',
          expiresAt:Math.min(time+1800,g.rawExpiresAt)},originalBody:index===2?example.reflection.text:null};
      transform(candidate,request);issued.add(candidate);return candidate;
    },
    recheck(candidate,request){return issued.has(candidate)&&candidate.requestHash===request.requestHash&&recheck(candidate,request);},
  }]));
  return {producers,resolveSource,guards,change(applicationId,criterionId,patch){
    const key=applicationId+':'+criterionId,g=guards.get(key);if(!g)throw new Error('FIXTURE_GUARD_NOT_CREATED');Object.assign(g,patch);
  }};
}
export async function storeFixture(t,options={}){
  const f=await authenticationFixture(t);let time=START,store;
  const authority=syntheticAuthority({now:()=>time,...options.authority});const directory=join(f.directory,'bootcamp');
  const configuration={directory,authentication:f.service,instanceId:'bootcamp-fixture',demoStartedAt:START,mode:'SYNTHETIC_FIXTURE',
    ...authority,now:()=>time,...options.store};
  const open=()=>createBootcampStore(configuration);store=open();t.after(()=>store.close());
  let n=0;const key=()=>`command-${++n}`;
  return {...f,...authority,directory,configuration,key,open,get store(){return store;},get time(){return time;},setTime:v=>{time=v;},setAuthenticationTime:f.setTime,restartAuthentication:f.restart,get service(){return f.service;},
    restart(){store.close();store=open();},
    create(context=f.aliceContext){return store.createApplication(context,{},key()).record.applicationId;},
    view(applicationId,context=f.aliceContext){return store.getApplication(context,applicationId);},
    request(applicationId,criterionId='activity-complete',context=f.aliceContext){
      return store.issueRequest(context,applicationId,{criterionId,expectedRevision:store.getApplication(context,applicationId).revision},key());
    },
    async accept(applicationId,criterionId='activity-complete',context=f.aliceContext){
      const r=this.request(applicationId,criterionId,context);
      return store.collect(context,applicationId,{requestId:r.record.target.requestId,expectedRevision:r.record.applicationRevision},key());
    },
    counts(){const db=new DatabaseSync(join(directory,'bootcamp.sqlite'),{readOnly:true});try{
      return Object.fromEntries(['evidence','decisions','commands','requests','events'].map(name=>[name,db.prepare('SELECT count(*) n FROM '+name).get().n]));
    }finally{db.close();}},
  };
}
