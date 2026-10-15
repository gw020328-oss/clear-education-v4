import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseProcesses,usesProfile} from '../../src/mac-collector/browser-recovery.mjs';
import {prepareRoot,createSession,removeSession} from '../../src/mac-collector/storage.mjs';
import {startChrome,stopRecordedBrowser} from '../../src/mac-collector/chrome.mjs';
import {syntheticBrowserCheck} from '../../src/mac-collector/synthetic.mjs';
import {legacySyntheticBrowserCheck} from './fixtures/synthetic-startup-legacy.mjs';
const exec=promisify(execFile);
async function stopped(session){const all=parseProcesses((await exec('/bin/ps',['-axww','-o','pid=,pgid=,uid=,stat=,command='])).stdout);assert.equal(all.filter(p=>usesProfile(p.command,session.path)).length,0,'owned browser group must already be gone');}
const actual={skip:process.platform!=='darwin'||process.arch!=='arm64',timeout:30000};
async function setup(t){
 const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'clear-cookie-regression-'));await fs.chmod(root,0o700);await prepareRoot(root,{synthetic:true});
 const session=await createSession(root);
 t.after(async()=>{await stopRecordedBrowser(session.path);await removeSession(root,session.path);await fs.rm(root,{recursive:true,force:true});});
 return {root,session};
}
// Deliberately reproduce a late navigation on Chrome's startup target. This is
// a controlled interleaving, not a claim that the old CI log recorded this event.
function lateStartupNavigation(){
 const evidence={competingNavigation:false,oldNavigationAborted:false,ownedTarget:false};
 return {evidence,async launchChrome(session,options){
  const browser=await startChrome(session,options),send=browser.send;
  const {targetInfos}=await send('Target.getTargets');const initial=targetInfos.find(t=>t.type==='page').targetId;
  const attached=await send('Target.attachToTarget',{targetId:initial,flatten:true});let off;
  return {...browser,async send(method,params={},sessionId){
   if(method==='Page.navigate'&&params.url.startsWith('http://127.0.0.1:')){
    // Hold the HTTP request, so the test orders the competing navigation by an
    // actual CDP event rather than a sleep or CPU-load assumption.
    let resolveRace,rejectRace;const raced=new Promise((r,j)=>{resolveRace=r;rejectRace=j;});
    off=browser.on('Fetch.requestPaused',(event,s)=>{
     if(s!==sessionId)return;
     void send('Page.navigate',{url:'about:blank'},attached.sessionId).then(()=>{evidence.competingNavigation=true;resolveRace();},rejectRace);
    });
    await send('Fetch.enable',{patterns:[{urlPattern:params.url,requestStage:'Request'}]},sessionId);
    const result=await send(method,params,sessionId);await raced;off();off=null;await send('Fetch.disable',{},sessionId);
    evidence.oldNavigationAborted=result.errorText==='net::ERR_ABORTED';return result;
   }
   if(method==='Target.createTarget'){
    const [created]=await Promise.all([send(method,params),send('Page.navigate',{url:'about:blank'},attached.sessionId)]);
    evidence.competingNavigation=true;evidence.ownedTarget=created.targetId!==initial;return created;
   }
   return send(method,params,sessionId);
  },async close(){off?.();await browser.close();}};
 }};
}
test('controlled startup navigation: old checker fails, dedicated target proves real HttpOnly round trip',actual,async t=>{
 const old=await setup(t),raceOld=lateStartupNavigation();
 await assert.rejects(legacySyntheticBrowserCheck(old.session,{},raceOld),{message:'SYNTHETIC_COOKIE_CHECK_FAILED'});
 assert.equal(raceOld.evidence.oldNavigationAborted,true);assert.equal(raceOld.evidence.competingNavigation,true);
 await stopped(old.session);await stopRecordedBrowser(old.session.path);await removeSession(old.root,old.session.path);
 const current=await setup(t),raceNew=lateStartupNavigation();
 const result=await syntheticBrowserCheck(current.session,{},raceNew);
 assert.equal(result.httpOnlyCookieRoundTrip,true);assert.equal(raceNew.evidence.ownedTarget,true);assert.equal(raceNew.evidence.competingNavigation,true);await stopped(current.session);
});
test('actual Chrome delivers an altered synthetic Cookie header and the checker rejects it',actual,async t=>{
 const {session}=await setup(t);
 const launchChrome=async(s,options)=>{
  const browser=await startChrome(s,options),send=browser.send;
  return {...browser,async send(method,params,sessionId){
   if(method==='Target.createTarget'){
    const created=await send('Target.createTarget',{url:'about:blank'});
    const attached=await send('Target.attachToTarget',{targetId:created.targetId,flatten:true});
    let off,resolveIntercept,rejectIntercept;const intercepted=new Promise((r,j)=>{resolveIntercept=r;rejectIntercept=j;});
    off=browser.on('Fetch.requestPaused',(e,id)=>{
     if(id!==attached.sessionId)return;
     void (async()=>{
      const headers=Object.entries(e.request.headers).filter(([name])=>name.toLowerCase()!=='cookie').map(([name,value])=>({name,value}));
      headers.push({name:'Cookie',value:'clear_synthetic=SYNTHETIC_WRONG'});
      await send('Fetch.continueRequest',{requestId:e.requestId,headers},id);
      off();await send('Fetch.disable',{},id);
     })().then(resolveIntercept,rejectIntercept);
    });
    await send('Fetch.enable',{patterns:[{urlPattern:params.url+'check',requestStage:'Request'}]},attached.sessionId);
    await Promise.all([send('Page.navigate',{url:params.url},attached.sessionId),intercepted]);return created;
   }
   return send(method,params,sessionId);
  }};
 };
 await assert.rejects(syntheticBrowserCheck(session,{}, {launchChrome}),{message:'SYNTHETIC_COOKIE_MISMATCH'});await stopped(session);
});
test('actual Chrome cancellation after creating the owned target still closes the process group',actual,async t=>{
 const {session}=await setup(t),control=new AbortController();
 const launchChrome=async(s,options)=>{const browser=await startChrome(s,options),send=browser.send;
  return {...browser,async send(method,...args){const result=await send(method,...args);if(method==='Target.createTarget')control.abort();return result;}};};
 await assert.rejects(syntheticBrowserCheck(session,{signal:control.signal},{launchChrome}));await stopped(session);
});
