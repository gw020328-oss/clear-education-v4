import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeMoodleLogin} from '../../src/embedded-wallet/moodle-native-login.mjs';
import {createCancelDiagnostic,readCancelDiagnostic} from '../../src/embedded-wallet/cancel-diagnostics.mjs';
const config={surface:'MOODLE_NATIVE',courseId:2,sesskey:'synthetic01',origin:'https://127.0.0.1:9477',role:'participant'};
const hex='aa'.repeat(32);
function fixture(response){
 const operations=[];let requests=0;
 const login=createNativeMoodleLogin({config,locks:{request:(_n,_o,f)=>f()},
  api:async path=>path.endsWith('bootstrap')?{challenge:hex,expiresAtExclusive:2000}:{status:'WAITING',role:'participant',expiresAtExclusive:2000,commandBinding:hex},
  fetch:async(_url,options)=>{
   const op=options.body.get('operation');operations.push(op);
   if(op==='start')return{ok:true,redirected:false,json:async()=>({status:'WAITING',expiresAtExclusive:2000,launchCode:hex,browserProof:hex,finishProof:hex,intentTarget:hex})};
   return typeof response==='function'?response(op):response;
  }});
 const session={assertSession:async()=>{},request:async()=>{requests++;throw Error('must not submit');}};
 const command={method:'POST',path:'/bootcamp/v4/applications/application-fixture/certificate-start',body:{expectedRevision:1},idempotencyKey:'cert-one'};
 return {login,session,command,operations,requests:()=>requests};
}
test('authorize-command preserves only numeric HTTP status and never reads rejected body or submits',async()=>{
 for(const status of [100,200,403,500,599,600,99,'403',NaN,undefined]){
  let bodyReads=0;const f=fixture({ok:false,redirected:false,status,json(){bodyReads++;throw Error('private response');}});
  const signal=new AbortController().signal;await f.login.begin(signal);
  await assert.rejects(f.login.command(f.session,f.command,signal),error=>{
   assert.equal(error.message,'MOODLE_LOGIN_UNAVAILABLE');assert.equal(error.status,Number.isInteger(status)&&status>=100&&status<=599?status:undefined);
   assert.deepEqual(Object.keys(error),error.status===undefined?[]:['status']);return true;
  });
  assert.equal(bodyReads,0);assert.equal(f.requests(),0);assert.deepEqual(f.operations,['start','authorize-command']);
 }
});
test('redirect rejection stays rejected and hostile status is omitted',async()=>{
 for(const hostile of [false,true]){
  const response={ok:true,redirected:true,json(){throw Error('must not parse');}};
  Object.defineProperty(response,'status',{get(){if(hostile)throw Error('private');return 200;}});
  const f=fixture(response),signal=new AbortController().signal;await f.login.begin(signal);
  await assert.rejects(f.login.command(f.session,f.command,signal),e=>e.message==='MOODLE_LOGIN_UNAVAILABLE'&&e.status===(hostile?undefined:200));assert.equal(f.requests(),0);
 }
});
test('authorize rejection is first diagnostic even when end later fails with a different status',async()=>{
 const f=fixture(op=>({ok:false,redirected:false,status:op==='end'?500:403,json(){throw Error('must not parse');}}));
 const signal=new AbortController().signal;await f.login.begin(signal);
 let saved;const storage={getItem:()=>saved,setItem:(_k,v)=>saved=v},diagnostic=createCancelDiagnostic(storage);
 try{await f.login.command(f.session,f.command,signal);}catch(error){diagnostic.record('workflow-failure','start-certificate',error);}
 try{await f.login.end(signal);}catch(error){diagnostic.record('destroy','NONE',error);}
 assert.deepEqual(readCancelDiagnostic(storage),{version:1,event:'CANCEL_TRIGGER',sequence:1,origin:'workflow-failure',action:'start-certificate',causeCode:'MOODLE_LOGIN_UNAVAILABLE',httpStatus:403});
 assert.deepEqual(f.operations,['start','authorize-command','end']);assert.equal(f.requests(),0);
});
test('certificate precheck and Moodle login failures are distinct fixed codes; arbitrary lookalikes remain unknown',()=>{
 for(const message of ['MOODLE_CERTIFICATE_UNAVAILABLE','MOODLE_LOGIN_UNAVAILABLE','MOODLE_LOGIN_UNAVAILABLE private-token']){
  let saved;const storage={getItem:()=>saved,setItem:(_k,v)=>saved=v};
  createCancelDiagnostic(storage).record('workflow-failure','start-certificate',Object.assign(Error(message),{body:'private',stack:'private'}));
  assert.equal(readCancelDiagnostic(storage).causeCode,message.includes(' ')?'UNKNOWN':message);assert.equal(readCancelDiagnostic(storage).httpStatus,null);assert(!saved.includes('private'));
 }
});
