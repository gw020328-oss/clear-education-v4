import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticBrowserCheck} from '../../src/mac-collector/synthetic.mjs';
const settle=()=>new Promise(r=>setImmediate(r));
function fakeBrowser(action=async()=>{}){
  let closeCount=0,resolveClosed,resolveAction;const actionDone=new Promise(r=>resolveAction=r);const closed=new Promise(r=>resolveClosed=r),calls=[];
  const browser={closed,async send(method,params){calls.push(method);assert.equal(method,'Target.createTarget');await action(params.url);resolveAction();return {targetId:'SYNTHETIC_OWNED_TARGET'};},
    async close(){closeCount++;resolveClosed();}};
  return {browser,calls,actionDone,closeCount:()=>closeCount,launchChrome:async()=>browser};
}
async function cookie(url){const r=await fetch(url);const value=r.headers.get('set-cookie');assert.match(value,/; HttpOnly; SameSite=Strict; Path=\/$/);await r.text();return value.split(';')[0];}
async function check(url,value){const r=await fetch(url+'check',{headers:value?{cookie:value}:{}});await r.text();return r.status;}
test('a created target still needs a genuine synthetic server cookie receipt',async()=>{
  const fake=fakeBrowser(async url=>assert.equal(await check(url,await cookie(url)),200));
  const out=await syntheticBrowserCheck({}, {},fake);assert.equal(out.httpOnlyCookieRoundTrip,true);assert.equal(out.liveProof,false);
  assert.deepEqual(fake.calls,['Target.createTarget']);assert.equal(fake.closeCount(),1);assert.doesNotMatch(JSON.stringify(out),/clear_synthetic|[a-f0-9]{48}/);
});
for(const value of [null,'clear_synthetic=SYNTHETIC_WRONG'])test('missing/wrong cookie fails and cannot be repaired by a later correct receipt: '+String(value),async()=>{
  const fake=fakeBrowser(async url=>{const good=await cookie(url);assert.equal(await check(url,value),403);assert.equal(await check(url,good),200);});
  await assert.rejects(syntheticBrowserCheck({}, {},fake),{message:'SYNTHETIC_COOKIE_MISMATCH'});assert.equal(fake.closeCount(),1);
});
test('an acknowledged target without page request is never a successful cookie check',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const fake=fakeBrowser();const result=syntheticBrowserCheck({}, {},fake);
  const rejection=assert.rejects(result,{message:'SYNTHETIC_PAGE_NOT_REQUESTED'});
  await fake.actionDone;await settle();t.mock.timers.tick(10000);await rejection;assert.equal(fake.closeCount(),1);
});
test('page received but no browser fetch has its own fixed failure code',async t=>{
  const fake=fakeBrowser(async url=>{await cookie(url);});const result=syntheticBrowserCheck({}, {},fake);
  const rejection=assert.rejects(result,{message:'SYNTHETIC_RECEIPT_MISSING'});
  t.mock.timers.enable({apis:['setTimeout']});
  await fake.actionDone;await settle();
  t.mock.timers.tick(10000);await rejection;assert.equal(fake.closeCount(),1);
});
test('cancellation after target creation closes browser and server',async()=>{
  const control=new AbortController();const fake=fakeBrowser(async url=>{await cookie(url);control.abort();});
  await assert.rejects(syntheticBrowserCheck({}, {signal:control.signal},fake));assert.equal(fake.closeCount(),1);
});
test('browser exit before a receipt fails without waiting for the cookie deadline',async()=>{
  const fake=fakeBrowser();fake.browser.closed=Promise.resolve();
  await assert.rejects(syntheticBrowserCheck({}, {},fake),{message:'SYNTHETIC_BROWSER_CLOSED'});assert.equal(fake.closeCount(),1);
});
test('missing target id is rejected and owned browser still closes',async()=>{
  const fake=fakeBrowser();fake.browser.send=async()=>({});
  await assert.rejects(syntheticBrowserCheck({}, {},fake),{message:'SYNTHETIC_TARGET_MISSING'});assert.equal(fake.closeCount(),1);
});
