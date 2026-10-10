import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { Wallet,JsonRpcProvider,Contract } from 'ethers';
import { start,stop,freePort } from './processes.mjs';
import { validateEvidence,validateTrust,AMOUNT } from '../lib/evidence.mjs';
import { vaultAbi } from '../lib/chain.mjs';

test('M-05 issuer outage after deposit recovers across main restart without duplicate deposit',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'refund-stage6-recovery-')),manifestPath=join(dir,'manifest.json'),statePath=join(dir,'main-state.json');
  const sponsor=Wallet.createRandom(),learner=Wallet.createRandom(),issuer=Wallet.createRandom(),issuerPort=await freePort();let chain,main,issuerService;
  try{
    chain=start('../services/chain.mjs',{CHAIN_PORT:'0',SPONSOR_KEY:sponsor.privateKey,ISSUER_ADDRESS:issuer.address});const chainReady=await chain.ready,chainUrl=`http://127.0.0.1:${chainReady.port}`;
    await writeFile(manifestPath,JSON.stringify(chainReady.manifest),{mode:0o600});
    const mainEnv={MAIN_PORT:'0',CHAIN_URL:chainUrl,ISSUER_URL:`http://127.0.0.1:${issuerPort}`,MANIFEST_PATH:manifestPath,STATE_PATH:statePath,LEARNER_KEY:learner.privateKey,SPONSOR_KEY:sponsor.privateKey};
    main=start('../services/main.mjs',mainEnv);let mainReady=await main.ready;
    let response=await fetch(`http://127.0.0.1:${mainReady.port}/prepare`,{method:'POST'});assert.equal(response.status,503);assert.equal((await response.json()).code,'ISSUER_UNAVAILABLE');
    const provider=new JsonRpcProvider(chainUrl,undefined,{cacheTimeout:-1}),vault=new Contract(chainReady.manifest.domain.verifyingContract,vaultAbi,provider);
    assert.equal(await vault.totalReserved(),AMOUNT);assert.equal(await vault.enrolled(learner.address),true);const digest=await vault.consentDigest(learner.address),acceptedAt=await vault.acceptedAt(learner.address);
    await stop(main);main=null;
    issuerService=start('../services/issuer.mjs',{ISSUER_PORT:String(issuerPort),ISSUER_KEY:issuer.privateKey,MANIFEST_PATH:manifestPath,EXPECTED_LEARNER:learner.address});await issuerService.ready;
    main=start('../services/main.mjs',mainEnv);mainReady=await main.ready;response=await fetch(`http://127.0.0.1:${mainReady.port}/prepare`,{method:'POST'});assert.equal(response.status,200);
    const evidence=await (await fetch(`http://127.0.0.1:${mainReady.port}/evidence`)).json();validateEvidence(evidence,validateTrust(chainReady.manifest),learner.address,chainReady.manifest.terms.start);
    assert.equal(await vault.totalReserved(),AMOUNT);assert.equal(await vault.consentDigest(learner.address),digest);assert.equal(await vault.acceptedAt(learner.address),acceptedAt);
    response=await fetch(`http://127.0.0.1:${issuerPort}/issue-all`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({learner:Wallet.createRandom().address})});assert.equal(response.status,400);
    const saved=JSON.parse(await readFile(statePath,'utf8'));assert.equal(saved.phase,'complete');assert.equal(JSON.stringify(saved).includes(sponsor.privateKey.slice(2)),false);assert.equal(JSON.stringify(saved).includes(learner.privateKey.slice(2)),false);assert.equal((await stat(statePath)).mode&0o777,0o600);provider.destroy();
  }finally{await Promise.all([stop(main),stop(issuerService),stop(chain)])}
});

test('claim server restricts Host, CSP RPC origins, and demo endpoint',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'refund-stage6-server-')),manifestPath=join(dir,'manifest.json');await writeFile(manifestPath,'{}');
  const rpcPort=await freePort(),service=start('../services/claim.mjs',{CLAIM_PORT:'0',MANIFEST_PATH:manifestPath,RPC_ORIGINS:`http://127.0.0.1:${rpcPort}`,DEMO_MODE:'0'});
  try{
    const ready=await service.ready,base=`http://127.0.0.1:${ready.port}`;let response=await fetch(base+'/');assert.equal(response.status,200);const csp=response.headers.get('content-security-policy');assert.ok(csp.includes(`http://127.0.0.1:${rpcPort}`));assert.equal(csp.includes('127.0.0.1:*'),false);
    response=await fetch(base+'/demo-evidence.json');assert.equal(response.status,404);response=await fetch(base+'/selftest.html');assert.equal(response.status,404);
    const status=await new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:ready.port,path:'/',headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end();});assert.equal(status,421);
  }finally{await stop(service)}
});
