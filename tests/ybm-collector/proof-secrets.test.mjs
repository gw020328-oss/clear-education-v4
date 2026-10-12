import test from 'node:test';
import assert from 'node:assert/strict';
import {createProofSecrets} from '../../src/ybm-collector/proof-secrets.mjs';
import {loadAttestorTrust,validateTrust,REGISTRY_URL} from '../../src/ybm-collector/trust.mjs';
import {endpoints,methods,policyFor} from '../../src/ybm-collector/source-policy.mjs';
import {core} from './proof-fixture.mjs';
import {quiet} from '../../src/ybm-collector/client.mjs';
const cookie={name:'SYNTHETIC_SESSION',value:'SYNTHETIC_COOKIE',domain:'.toeic.co.kr'};
const request=role=>({url:endpoints[role],method:methods[role],...(role==='registration'?{postData:'encExamData=SYNTHETIC%2BFORM%3D&zzxxcc='}:{})});
test('credentials are obtained only for exact URL and encoded body stays redacted',async()=>{
 const calls=[],s=createProofSecrets({send:async(m,p,id)=>{calls.push({m,p,id});return {cookies:[cookie]};}});
 await s.capture('registration',request('registration'),'synthetic-tab');
 assert.deepEqual(calls,[{m:'Network.getCookies',p:{urls:[endpoints.registration]},id:'synthetic-tab'}]);
 const secret=s.take('registration');assert.equal(secret.paramValues.encExamData,'SYNTHETIC%2BFORM%3D');
 const data=core.providers.http.createRequest(secret,policyFor('registration'),quiet),redacted=Buffer.from(data.data);
 assert.ok(redacted.toString().includes('encExamData=SYNTHETIC%2BFORM%3D&zzxxcc='));
 for(const range of data.redactions)redacted.fill('*',range.fromIndex,range.toIndex);
 assert.ok(!redacted.toString().includes('SYNTHETIC_COOKIE'));assert.ok(!redacted.toString().includes('SYNTHETIC%2BFORM'));s.close();assert.throws(()=>s.take('registration'));
});
for(const [name,patch] of [['wrong endpoint',{url:endpoints.registration+'?extra=1'}],['wrong method',{method:'GET'}],['missing body',{postData:undefined}],['extra form field',{postData:'encExamData=abc&zzxxcc=&password=private'}],['duplicate field',{postData:'encExamData=abc&encExamData=xyz&zzxxcc='}],['malformed encoding',{postData:'encExamData=%ZZ&zzxxcc='}]])test('secret collection rejects '+name+' before cookies are read',async()=>{
 let calls=0;const s=createProofSecrets({send:async()=>{calls++;return {cookies:[cookie]};}});await assert.rejects(s.capture('registration',{...request('registration'),...patch},'s'));assert.equal(calls,0);s.close();
});
test('close during scoped cookie query discards values and prevents generation',async()=>{
 let release;const s=createProofSecrets({send:()=>new Promise(r=>release=r)});const pending=s.capture('score',request('score'),'s');s.close();release({cookies:[cookie]});await assert.rejects(pending);assert.throws(()=>s.take('score'));
});
test('foreign cookie scope and header injection are rejected',async()=>{
 for(const c of [{...cookie,domain:'.evil.example'},{...cookie,value:'x\r\nAuthorization: y'},{...cookie,name:'a:b'}]){
  const s=createProofSecrets({send:async()=>({cookies:[c]})});await assert.rejects(s.capture('score',request('score'),'s'));s.close();
 }
});
test('public registry fetch pins deduplicated trust before login and rejects redirects or large responses',async()=>{
 const address='0x'+'12'.repeat(20);const fetcher=async(url,options)=>{assert.equal(url,REGISTRY_URL);assert.equal(options.redirect,'error');return new Response(JSON.stringify({data:[{address},{address}]}));};
 assert.deepEqual(await loadAttestorTrust({fetcher}),[address]);
 for(const response of [new Response('',{status:302}),new Response('x'.repeat(65537)),new Response('{"data":[]}')])await assert.rejects(loadAttestorTrust({fetcher:async()=>response}),/ATTESTOR_TRUST_UNAVAILABLE/);
 assert.throws(()=>validateTrust(['0x'+'00'.repeat(20)]));
});
