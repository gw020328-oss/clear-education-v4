import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Wallet, core } from './proof-fixture.mjs';
import { scoreHtml } from './source-fixture.mjs';
import { canonical, digest } from '../../src/ybm-collector/values.mjs';
import { historyParams } from '../../src/ybm-collector/history-policy.mjs';
import { openHistoryIntake } from '../../src/exam-evidence/intake.mjs';
import { INTAKE_VERIFIER, intakeTrustDigest, intakeClaimContext, intakeClaimParams, createIntakeVerifier, verifyIntakeClaim } from '../../src/ybm-collector/intake-verifier.mjs';
import { collectIntakeHistory } from '../../src/ybm-collector/intake-run.mjs';
import { parseOptions } from '../../src/mac-collector/options.mjs';

async function fixture(t) {
  const directory=realpathSync(mkdtempSync(join(tmpdir(),'clear-intake-proof-'))),attestor=Wallet.createRandom(),owner=Wallet.createRandom();
  const trust=[attestor.address],config={directory,instanceId:'synthetic-registration',mode:'SYNTHETIC',verifierProfile:INTAKE_VERIFIER,
    verifierConfigDigest:intakeTrustDigest(trust),verify:createIntakeVerifier(trust)};
  let intake=openHistoryIntake(config);
  t.after(()=>{intake.close();rmSync(directory,{recursive:true,force:true});});
  const binding={applicationId:'synthetic-application',participantRef:'synthetic-subject',recipientRef:'synthetic-recipient',bindingRevision:1};
  intake.register({binding,policy:{policyVersion:'synthetic-policy',consentVersion:'synthetic-consent',baselineRequired:true,
    baselineWindow:'CALENDAR_TWO_YEARS_CANDIDATE',baselineLagSeconds:1800,achievementFromSeconds:0,
    achievementUntilSeconds:1800,acceptanceMaxAgeSeconds:300,sessionSeconds:600,retentionSeconds:86400}});
  const session=intake.openSession(binding.applicationId,'BASELINE_HISTORY',owner.address.toLowerCase());
  const sign=async proof=>{proof.claim.identifier=core.getIdentifierFromClaimInfo(proof.claim);proof.signature=await attestor.signMessage(core.createSignDataForClaim(proof.claim));};
  const make=async(s=session)=>{
    const proof={claim:{provider:'http',parameters:canonical(historyParams()),owner:s.ownerAddress,timestampS:Math.floor(Date.now()/1000),epoch:1,
      context:canonical({...intakeClaimContext(s),extractedParameters:{history_html:scoreHtml().match(/<table[\s\S]*?<\/table>/)[0]}}),identifier:''},attestor:attestor.address,signature:''};
    await sign(proof);return proof;
  };
  return {get intake(){return intake;},binding,session,make,sign,trust,owner,directory,config,
    reopen(){intake.close();intake=openHistoryIntake(config);},attestor};
}
test('signed synthetic whole table -> offline verifier -> durable unknown receipt -> reopen',async t=>{
  const f=await fixture(t),p=await f.make(),r=await f.intake.accept(f.session.sessionId,p);
  assert.equal(r.state,'RECEIVED_UNVERIFIED_COVERAGE');assert.equal(r.proofVerified,false);assert.equal(r.syntheticSignatureVerified,true);
  f.reopen();assert.deepEqual(f.intake.receipt(f.session.sessionId),r);
  assert.equal(r.fullHistoryProven,false);assert.equal(r.baselineBelowThreshold,false);
  const bytes=readFileSync(join(f.directory,'history-intake.sqlite'));
  for(const value of ['SYNTHETIC_PRIVATE_EXTRA','123456','Total 850',p.signature,p.claim.context])assert.ok(!bytes.includes(value));
});
for(const kind of ['purpose','nonce','application','policy','period','owner','trust','query','row-recipe','mask','unsigned-delete','future-time','extra-context'])
  test(`signed intake rejects ${kind}`,async t=>{
    const f=await fixture(t),p=await f.make(),expected=structuredClone(f.session);
    if(['purpose','nonce','application','policy','period'].includes(kind)){
      if(kind==='purpose')expected.purpose='ACHIEVEMENT';
      if(kind==='nonce')expected.nonce='f'.repeat(64);
      if(kind==='application')expected.binding.applicationId='other-app';
      if(kind==='policy')expected.policyDigest='0x'+'01'.repeat(32);
      if(kind==='period')expected.period.from-=86400;
      const {contextDigest,state,...body}=expected;expected.contextDigest=digest(body);
      // A signature for the original context cannot satisfy this server session.
    }
    if(kind==='owner')p.claim.owner=Wallet.createRandom().address;
    if(kind==='trust')p.attestor=Wallet.createRandom().address;
    if(kind==='query'){const params=JSON.parse(p.claim.parameters);params.url+='?page=1';p.claim.parameters=canonical(params);}
    if(kind==='row-recipe'){const params=JSON.parse(p.claim.parameters);params.responseRedactions=[{xPath:'//tr[1]'}];p.claim.parameters=canonical(params);}
    if(kind==='mask'){const c=JSON.parse(p.claim.context);c.extractedParameters.history_html=c.extractedParameters.history_html.replace('Total 850','***');p.claim.context=canonical(c);}
    if(kind==='future-time')p.claim.timestampS+=60;
    if(kind==='extra-context'){const c=JSON.parse(p.claim.context);c.fullHistoryProven=true;p.claim.context=canonical(c);}
    if(kind!=='unsigned-delete')await f.sign(p);
    else {const c=JSON.parse(p.claim.context);c.extractedParameters.history_html='<table></table>';p.claim.context=canonical(c);}
    await assert.rejects(verifyIntakeClaim({proof:p,expected,trust:f.trust}));
    if(['purpose','nonce','application','policy','period'].includes(kind)){
      const c=JSON.parse(p.claim.context);c.intakeContextDigest=expected.contextDigest;p.claim.context=canonical(c);await f.sign(p);
    }
    await assert.rejects(f.intake.accept(f.session.sessionId,p),/VERIFICATION_FAILED/);
    assert.equal(f.intake.receipt(f.session.sessionId),null);
  });
test('legacy diagnostic context and malformed expected context cannot enter registration intake',async t=>{
  const f=await fixture(t),p=await f.make();const c=JSON.parse(p.claim.context);c.purpose='YBM_HISTORY_SPIKE_NO_PAYMENT';p.claim.context=canonical(c);await f.sign(p);
  await assert.rejects(f.intake.accept(f.session.sessionId,p));
  await assert.rejects(verifyIntakeClaim({proof:await f.make(),expected:{...f.session,nonce:'changed'},trust:f.trust}),/EXPECTED/);
});
test('validly signed empty table remains unsupported, never non-attendance',async t=>{
  const f=await fixture(t),p=await f.make(),c=JSON.parse(p.claim.context);c.extractedParameters.history_html='<table><tr><td>내역 없음</td></tr></table>';p.claim.context=canonical(c);await f.sign(p);
  await assert.rejects(f.intake.accept(f.session.sessionId,p));assert.equal(f.intake.receipt(f.session.sessionId),null);
});

async function runMock(t,{empty=false,fail=false,cancel=false,cleanupFail=false,purpose='BASELINE_HISTORY'}={}){
  const f=await fixture(t),input=new PassThrough(),closed=new Set(),messages=[];
  let claimCalls=0,context,extraction;
  const client={isOpen:true,isInitialised:true};
  const result=collectIntakeHistory({}, {intake:f.intake,applicationId:f.binding.applicationId,purpose,scoreIndex:purpose==='ACHIEVEMENT'?0:null,input,
    output:m=>{messages.push(m);if(m.startsWith('CLEAR INTAKE:'))setImmediate(()=>input.write(cancel?'close\n':'ready\n'));},
    openClient:async()=>({client,close:async()=>closed.add('client')}),
    routeFactory:async()=>({client,signal:new AbortController().signal,proxyUrl:'SYNTHETIC',close:async()=>closed.add('route')}),probe:async()=>{},
    launchBrowser:async()=>({send:async method=>method==='Target.getTargets'?{targetInfos:[{type:'page',targetId:'fake'}]}:method==='Target.attachToTarget'?{sessionId:'fake'}:{},close:async()=>{closed.add('browser');if(cleanupFail)throw new Error('SYNTHETIC_CLEANUP_FAILURE');}}),
    captureFactory:({extractionFactory})=>{
      extraction=extractionFactory();let done;const promise=new Promise(resolve=>done=resolve);
      return {done:promise,arm:async()=>{const bytes=Buffer.from(empty?'<html>로그인 또는 내역 없음</html>':scoreHtml());try{extraction.accept('score',bytes);}finally{bytes.fill(0);}done({complete:true});},close:async()=>closed.add('capture')};
    },
    secretsFactory:()=>({capture(){},take:()=>({cookieStr:'SYNTHETIC_SECRET'}),close:()=>closed.add('secrets')}),
    operatorsFactory:()=>({}),releaseOperators:async()=>closed.add('operators'),
    createClaim:async request=>{
      claimCalls++;context=request.context;if(fail)throw new Error('SYNTHETIC_PRIVATE_FAILURE');
      assert.equal(request.client,client);assert.equal(request.zkEngine,'snarkjs');assert.equal(request.params.url,historyParams().url);
      const claim={provider:'http',parameters:canonical(request.params),owner:new Wallet(request.ownerPrivateKey).address.toLowerCase(),timestampS:Math.floor(Date.now()/1000),epoch:1,
        context:canonical({...request.context,extractedParameters:purpose==='BASELINE_HISTORY'?{history_html:scoreHtml().match(/<table[\s\S]*?<\/table>/)[0]}:{exam_type:'TOEIC',exam_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','.'),registration_number:'123456',total_score:'850'}}),identifier:''};
      const p={claim,attestor:f.attestor.address,signature:''};await f.sign(p);
      return {claim,signatures:{claimSignature:Buffer.from(p.signature.slice(2),'hex'),attestorAddress:p.attestor}};
    }});
  if(fail||cancel||cleanupFail)await assert.rejects(result,/INTAKE_COLLECTION_FAILED|SYNTHETIC_CLEANUP_FAILURE/);
  else {const r=await result;if(empty)assert.equal(r.state,'SOURCE_LAYOUT_UNSUPPORTED');else {assert.equal(r.receipt.purpose,purpose);assert.equal(r.receipt.status,'UNKNOWN');assert.equal(context.intakeContextDigest,r.receipt.contextDigest);}}
  assert.equal(claimCalls,empty||cancel?0:1);
  for(const key of ['client','route','browser','capture','secrets','operators'])assert.ok(closed.has(key),key);
  assert.ok(!messages.join('').includes('SYNTHETIC_SECRET'));assert.ok(!messages.join('').includes('SYNTHETIC_PRIVATE'));
}
test('collector connects baseline registration to durable offline acceptance and closes all resources',t=>runMock(t));
test('collector uses a separate achievement purpose',t=>runMock(t,{purpose:'ACHIEVEMENT'}));
test('empty/login layout is only an observation and never starts proof or accepts absence',t=>runMock(t,{empty:true}));
test('proof failure still closes managed resources without raw errors',t=>runMock(t,{fail:true}));
test('new live CLI cannot mix with diagnostic or synthetic root',()=>{
  assert.equal(parseOptions(['--ybm-registration-intake']).intakeCheck,true);
  assert.throws(()=>parseOptions(['--ybm-registration-intake'],'/synthetic'));
  assert.throws(()=>parseOptions(['--ybm-registration-intake','--ybm-history-check']));
});

test('user cancellation before ready closes all resources and never generates a claim',t=>runMock(t,{cancel:true}));
test('browser cleanup failure still closes route/client and is not reported as success',t=>runMock(t,{cleanupFail:true}));
