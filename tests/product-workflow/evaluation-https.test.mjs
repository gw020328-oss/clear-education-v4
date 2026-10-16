import test from 'node:test';
import assert from 'node:assert/strict';
import {runEvaluationHttpDemo} from '../../specs/m3/evaluation-http-demo.mjs';
for(const profile of ['ybm','siwon'])test('verified HTTPS '+profile+' fixture acceptance to M2 stored result and restart recovery',async()=>{
 const result=await runEvaluationHttpDemo({profile});assert.equal(result.verifiedHttps,true);assert.equal(result.restartSameDecision,true);assert.equal(result.paymentAllowed,false);
});

test('evaluation host rejects mixed or invalid modes and advertises its synthetic clock after restart',async t=>{
 const {mkdtempSync,realpathSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{Wallet}=await import('ethers');
 const {initializeSourceDevelopment,startSourceDevelopment}=await import('../../src/product-workflow/http-development.mjs'),{availablePort}=await import('../../specs/m3/http-demo.mjs');
 const root=realpathSync(mkdtempSync(join(tmpdir(),'clear-eval-config-')));let host;t.after(async()=>{await host?.close();rmSync(root,{recursive:true,force:true});});
 const addresses={operator:Wallet.createRandom().address,participant:Wallet.createRandom().address};
 assert.throws(()=>initializeSourceDevelopment({directory:join(root,'mixed'),...addresses,documentMode:true,evaluationProfile:'ybm'}),/MVP_DEV_CONFIG/);
 assert.throws(()=>initializeSourceDevelopment({directory:join(root,'empty-profile'),...addresses,evaluationProfile:''}),/MVP_DEV_CONFIG/);
 const directory=join(root,'valid');initializeSourceDevelopment({directory,port:await availablePort(),...addresses,evaluationProfile:'ybm'});host=await startSourceDevelopment({directory});
 assert.equal(host.config.evaluationClockMode,'PUBLIC_SYNTHETIC_SCENARIO');assert.equal(host.config.syntheticEvidenceAcceptanceReady,true);assert.equal(host.config.evidenceAcceptanceReady,false);assert.equal(host.config.documentHttpVersion,null);
 await host.close();host=await startSourceDevelopment({directory});assert.equal(host.config.evaluationProfile,'ybm');
});
