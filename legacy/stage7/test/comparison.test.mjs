import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { Signature } from 'ethers';
import { fixture } from '../lib/fixture.mjs';
import { sha } from '../lib/process.mjs';
import { parseEvidenceText,validateEvidence } from '../../stage6/lib/evidence.mjs';
const result=JSON.parse(await readFile(new URL('../artifacts/comparison-results.json',import.meta.url)));
const expected={normal:[true,true],'main-down':[true,true],'issuer-down':[true,true],'both-down':[true,true],'executor-down':[false,true],'chain-down':[true,false],'ui-down':[true,true],missing:[false,false],'false-attestation':[true,true],forged:[false,false],duplicate:[false,false],'other-recipient':[false,false],expired:[false,false],'concurrent-replay':[true,true],restart:[true,true],underfunded:[false,false],'no-gas':[true,false]};
for(const [id,pair]of Object.entries(expected))test('frozen comparison: '+id,async()=>{
  const r=result.results.find(r=>r.id===id);assert.ok(r);assert.deepEqual([r.central.success,r.onchain.success],pair);assert.equal(r.protocolMatch,true);
  assert.equal(r.secretAudit.exactGeneratedSecretMatches,0);assert.equal(r.clockEvidence.centralClockFileSeconds,r.time);
  assert.equal(sha(await readFile(new URL('../artifacts/'+r.savedInputs.evidence,import.meta.url))),r.evidenceSha256);
  if(id!=='chain-down')assert.equal(r.clockEvidence.chainBlockSeconds,r.time);
  for(const stop of r.processStops){assert.equal(stop.exitCode,0);assert.equal(stop.reachableAfterExit,false);}
  for(const [i,rail]of ['central','onchain'].entries()){
    const v=r[rail];assert.ok(Number.isFinite(v.elapsedMs)&&v.elapsedMs>=0);assert.equal(v.additionalThirdPartyApprovalRequired,false);assert.equal(v.inputEvidenceSha256,r.evidenceSha256);
    if(pair[i]){assert.equal(v.paidUnits,'50000000');assert.equal(v.reserveAfter.paidUnits,'50000000');assert.equal(v.reserveAfter.reserveUnits,'0');assert.equal(v.reserveAfter.settled,true);}
    else if(!(id==='chain-down'&&rail==='onchain'))assert.equal(v.reserveAfter.paidUnits,'0');
    if(id==='concurrent-replay')assert.equal(v.attempts.filter(a=>a.success).length,1);
    if(id==='restart')assert.equal(v.replay.success,false);
    if(id==='ui-down')assert.equal(v.alternativeCliUsed,true);
    if(v.duplicatePaid!==null)assert.equal(v.duplicatePaid,false);
  }
  if(id==='underfunded'){assert.equal(r.enrollment.central,'CENTRAL_RESERVE');assert.equal(r.enrollment.onchainHttpStatus,503);assert.equal(r.onchain.reserveBefore.enrolled,false);assert.equal(r.central.reserveBefore.enrolled,false);}
  if(id==='no-gas'){assert.equal(r.onchain.code,'INSUFFICIENT_GAS');assert.equal(r.onchain.transactionHash,null);}
  for(const d of r.centralExecutorDecisions.filter(d=>d.accepted))assert.equal(d.inputSha256,r.evidenceSha256);
});
test('frozen protocol hash and aggregate counts are reproducible',async()=>{
  assert.equal(sha(await readFile(new URL('../COMPARISON_PROTOCOL.md',import.meta.url))),result.protocolSha256);
  assert.equal(result.protocolSha256,'a3ddef41dae2e265df7bfb273a32c1415a51010cf53e43bf52b059b08cbb007d');
  assert.equal(result.summary.scenarios,17);assert.equal(result.summary.protocolMatches,17);assert.equal(result.summary.centralSuccess,10);assert.equal(result.summary.onchainSuccess,9);
});
test('central durable ledger: competing OS writers, restart, replay and changed config',async()=>{
  const f=await fixture();const children=[];try{
    await f.stop('executor');
    for(let i=0;i<2;i++){const c=fork(new URL('./ledger-worker.mjs',import.meta.url),[f.dbPath,f.manifestPath,f.evidencePath,String(f.time)],{stdio:['ignore','pipe','pipe','ipc']});children.push(c);assert.equal((await once(c,'message'))[0].type,'ready');}
    const replies=children.map(c=>once(c,'message')),exits=children.map(c=>once(c,'exit'));children.forEach(c=>c.send('claim'));
    const values=(await Promise.all(replies)).map(v=>v[0]);await Promise.all(exits);assert.equal(values.filter(v=>v.success).length,1);assert.equal(values.find(v=>!v.success).code,'CENTRAL_NOT_CLAIMABLE');
    assert.deepEqual(f.centralState(),{enrolled:true,settled:true,reserveUnits:'0',paidUnits:'50000000'});
    await f.startExecutor();const response=await fetch(f.centralUrl+'/claim',{method:'POST',body:JSON.stringify(f.packet)});assert.equal(response.status,422);assert.equal((await response.json()).code,'CENTRAL_NOT_CLAIMABLE');
    const {CentralEscrow}=await import('../lib/central.mjs');const altered=structuredClone(f.manifest);altered.deployment.genesisHash='0x'+'aa'.repeat(32);assert.throws(()=>new CentralEscrow(f.dbPath,altered));
  }finally{for(const c of children)if(c.exitCode===null)c.kill('SIGTERM');await f.close();}
});
test('central HTTP and shared validation reject exactly the same bounded corpus',async()=>{
  const f=await fixture();try{
    const sig=f.packet.submissions[0].signature,mut=fn=>{const p=structuredClone(f.packet);fn(p);return JSON.stringify(p)},n=BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141'),s=BigInt('0x'+sig.slice(66,130));
    const corpus=[JSON.stringify(f.packet),mut(p=>p.submissions[0].signature=Signature.from(sig).compactSerialized),mut(p=>p.submissions[0].signature=sig.slice(0,-2)+'00'),mut(p=>p.submissions[0].signature={r:'0x1',s:'0x2',v:27}),mut(p=>p.submissions[0].signature=sig.slice(0,66)+(n-s).toString(16).padStart(64,'0')+(sig.endsWith('1b')?'1c':'1b')),mut(p=>p.extra=true),mut(p=>p.submissions[0].receipt.session='0'),JSON.stringify(f.packet)+' '.repeat(1024*1024),JSON.stringify({x:Array.from({length:15}).reduce(v=>[v],0)})];
    for(const text of corpus){let expected='ACCEPT';try{validateEvidence(parseEvidenceText(text),f.manifest,f.packet.recipient,f.time)}catch(e){expected=e.code;}
      const res=await fetch(f.centralUrl+'/inspect',{method:'POST',headers:{'Content-Type':'application/json'},body:text}),v=await res.json();assert.equal(res.ok?'ACCEPT':v.code,expected);
    }
    assert.equal(f.centralState().paidUnits,'0');
  }finally{await f.close();}
});
test('both UI servers share assets, limit hosts and routes, and hide demo files outside demo mode',async()=>{
  const f=await fixture();try{
    const urls=[f.centralUI,f.onchainUI].map(h=>'http://127.0.0.1:'+h.port),html=await Promise.all(urls.map(async u=>await(await fetch(u)).text()));assert.equal(html[0],html[1]);
    for(const url of urls){const res=await fetch(url);assert.match(res.headers.get('Content-Security-Policy'),/connect-src 'self' http:\/\/127\.0\.0\.1:/);assert.equal((await fetch(url+'/..%2f..%2fSTATUS.md')).status,404);
      const bad=await new Promise(resolve=>{const req=request(url,{headers:{Host:'attacker.example'}},r=>{r.resume();resolve(r.statusCode)});req.end()});assert.equal(bad,421);
      const demo=await(await fetch(url+'/demo-evidence.json')).text();assert.equal(sha(demo),sha(await readFile(f.evidencePath)));
    }
    const {start,stop}=await import('../lib/process.mjs');const h=await start(new URL('../services/ui.mjs',import.meta.url),{MANIFEST_PATH:f.manifestPath,EVIDENCE_PATH:f.evidencePath,UI_CONFIG:JSON.stringify({rail:'central',endpoint:f.centralUrl,demoMode:false})});try{assert.equal((await fetch('http://127.0.0.1:'+h.port+'/demo-evidence.json')).status,404)}finally{await stop(h)}
  }finally{await f.close();}
});
