import test from 'node:test';
import assert from 'node:assert/strict';
import {browserCookieReader} from '../../src/hackerrank-evidence/browser-source.mjs';
import {runHackerRankCollection} from '../../src/hackerrank-evidence/run.mjs';
import {ACCOUNT_URL,CERTIFICATE_URL} from '../../src/hackerrank-evidence/recipes.mjs';

const cookie=()=>({name:'session',value:'SYNTHETIC_COOKIE_ONLY',domain:'.hackerrank.com'});
test('cookie access is limited to exact account/certificate URL and target session',async()=>{
 const calls=[],browser={async send(...args){calls.push(args);return {cookies:[cookie()]};}};
 const read=browserCookieReader(browser,'synthetic-page');
 await read({role:'account',url:ACCOUNT_URL});await read({role:'certificate',url:CERTIFICATE_URL+'?username=synthetic_orchid'});
 for(const call of calls){assert.equal(call[0],'Network.getCookies');assert.equal(call[1].urls.length,1);assert.equal(call[2],'synthetic-page');}
 for(const url of ['https://example.org/','https://www.hackerrank.com@evil.example/',CERTIFICATE_URL+'?username=synthetic_orchid&other=1',CERTIFICATE_URL+'?username=..%2Fother'])await assert.rejects(read({role:'certificate',url}));
 await assert.rejects(read({role:'account',url:CERTIFICATE_URL}));assert.equal(calls.length,2);
});
test('foreign domain, duplicate name and header injection cookies fail closed',async()=>{
 for(const cookies of [[{...cookie(),domain:'.other.example'}],[cookie(),cookie()],[{...cookie(),value:'SYNTHETIC_\r\nX: injected'}],[{...cookie(),name:'bad;name'}]]){
  const read=browserCookieReader({async send(){return {cookies};}},'synthetic-page');
  await assert.rejects(read({role:'account',url:ACCOUNT_URL}));
 }
});
test('pending trust run does not create a browser, owner, network or invoke host callbacks',async()=>{
 const fail=()=>assert.fail('pending trust invoked a host callback');
 const result=await runHackerRankCollection(null,{issueRequest:fail,approveRequest:fail,waitForReady:fail,submit:fail});
 assert.deepEqual(result,{status:'BLOCKED',code:'TRUST_NOT_CONFIGURED',proofVerified:false,paymentAllowed:false});
});
