import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceDiagnostics,observeMoodleCommand} from '../../src/hackerrank-evidence/diagnostics.mjs';
import {RuleError} from '../../src/policy/values.mjs';
import {commandFixture,createCommand} from './moodle-command-fixture.mjs';

const secret='SYNTHETIC_PRIVATE_REQUEST_TOKEN_SIGNATURE';
async function fixture(t,persist=()=>{}){
 const diagnostics=createSourceDiagnostics({persist}),x=await commandFixture({diagnostics});
 t.after(()=>x.owner.close());return {...x,diagnostics,events:()=>diagnostics.snapshot().moodleCommands??[]};
}
test('owner entry and successful return contain only sequence/phase/error, and do not consume the command',async t=>{
 const x=await fixture(t);assert.deepEqual(x.events(),[]);
 const granted=await x.grant(createCommand());
 assert.deepEqual(x.events(),[{sequence:1,phase:'ENTER',error:null},{sequence:2,phase:'RETURN',error:null}]);
 const reservation=await x.owner.reserveCommand(granted);reservation.assert();reservation.committed();reservation.finish();
 await assert.rejects(x.owner.reserveCommand(granted),/MOODLE_COMMAND_BINDING/);
 const copy=x.events();copy[0].phase=secret;assert.equal(x.events()[0].phase,'ENTER');
 assert.equal(x.diagnostics.snapshot().signatureAcceptance,'UNKNOWN');
 assert.deepEqual(x.diagnostics.snapshot().events,[]);
});
for(const [kind,phase,code] of [
 ['strict','STRICT_REQUEST','MOODLE_COMMAND_REQUEST'],
 ['duplicate','CONNECTED_AND_UNUSED','MOODLE_COMMAND_UNAVAILABLE'],
 ['reverse','REVERSE_AUTHORITY','UNKNOWN'],
 ['identity','IDENTITY_HORIZON','MOODLE_COMMAND_IDENTITY'],
 ['clear','CLEAR_AUTH','AUTH_REQUIRED'],
 ['lease','LIVE_CURRENTNESS','UNKNOWN'],
])test('unchanged rejection classified at '+phase,async t=>{
 const x=await fixture(t),command=createCommand('diagnostic-'+kind);
 if(kind==='duplicate')await x.grant(command);
 if(kind==='reverse')x.revokeRole();
 if(kind==='identity')x.replaceSession();
 const original=Object.assign(new RuleError('AUTH_REQUIRED'),{context:secret,stack:secret});
 if(kind==='clear')x.onAuth(()=>{throw original;});
 if(kind==='lease')x.invalidate();
 if(kind==='strict')await assert.rejects(x.owner.authorizeCommand({private:secret}),/MOODLE_COMMAND_REQUEST/);
 else await assert.rejects(x.grant(command),kind==='clear'?e=>e===original:()=>true);
 assert.deepEqual(x.events().at(-1),{sequence:x.events().length,phase,error:code});
 assert.equal(x.events().at(-2).phase,'ENTER');
 assert.equal(JSON.stringify(x.diagnostics.snapshot()).includes(secret),false);
 // Reservation failures remain UNKNOWN/spent; a fresh ref with the same hash cannot retry.
 if(['reverse','identity','clear','lease'].includes(kind)){
  x.onAuth(()=>{});
  await assert.rejects(x.grant(command),/MOODLE_COMMAND_UNAVAILABLE/);
 }
});
test('throwing persistence preserves success, exact rejection object and duplicate fencing',async t=>{
 const x=await fixture(t,()=>{throw Error(secret);});
 await x.grant(createCommand('success'));
 const original=new RuleError('AUTH_REQUIRED');x.onAuth(()=>{throw original;});
 await assert.rejects(x.grant(createCommand('fail')),e=>e===original);
 x.onAuth(()=>{});await assert.rejects(x.grant(createCommand('fail')),/MOODLE_COMMAND_UNAVAILABLE/);
 assert.equal(x.diagnostics.snapshot().persistence,'INCOMPLETE');
});
for(const kind of ['deadline','abort'])test('diagnostics preserve '+kind+' rejection and spent state',async t=>{
 const x=await fixture(t),command=createCommand(kind),original=Error(secret);
 x.onAuth(()=>{if(kind==='deadline')x.drift(5000);else x.signal.abort(original);});
 await assert.rejects(x.grant(command),kind==='abort'?e=>e===original:/MOODLE_LOGIN_LEASE_EXPIRED/);
 assert.deepEqual(x.events().at(-1),{sequence:2,phase:'LIVE_CURRENTNESS',
  error:kind==='deadline'?'MOODLE_LOGIN_LEASE_EXPIRED':'UNKNOWN'});
 x.onAuth(()=>{});await assert.rejects(x.grant(command),/MOODLE_COMMAND_UNAVAILABLE/);
 assert.equal(JSON.stringify(x.events()).includes(secret),false);
});
test('no getters, proxies, raw error strings, causes or unowned observers are consulted',()=>{
 const d=createSourceDiagnostics({persist(){}});let touched=0;
 const accessor=new RuleError('AUTH_REQUIRED');Object.defineProperty(accessor,'message',{get(){touched++;throw Error(secret);}});
 const proxy=new Proxy(new RuleError('AUTH_REQUIRED'),{getPrototypeOf(){touched++;throw Error(secret);},getOwnPropertyDescriptor(){touched++;throw Error(secret);}});
 for(const error of [Error('AUTH_REQUIRED'),new RuleError(secret),{message:'AUTH_REQUIRED'},accessor,proxy,
  {cause:new RuleError('AUTH_REQUIRED')},null,secret]){
  observeMoodleCommand(d,'REVERSE_AUTHORITY',error);assert.equal(d.snapshot().moodleCommands.at(-1).error,'UNKNOWN');
 }
 observeMoodleCommand({recordMoodleCommand(){touched++;}},'ENTER');
 observeMoodleCommand(d,secret,new RuleError('AUTH_REQUIRED'));
 assert.equal(touched,0);assert.equal(d.snapshot().moodleCommands.length,8);
 assert.equal(JSON.stringify(d.snapshot()).includes(secret),false);
 for(const row of d.snapshot().moodleCommands)assert.deepEqual(Object.keys(row),['sequence','phase','error']);
});
test('local history is bounded and diagnostic truncation cannot become authorization',()=>{
 const d=createSourceDiagnostics({persist(){}});
 for(let i=0;i<140;i++)observeMoodleCommand(d,'ENTER');
 const view=d.snapshot();assert.equal(view.moodleCommands.length,128);assert.equal(view.truncated,true);
 assert.deepEqual(view.moodleCommands.map(x=>x.sequence),Array.from({length:128},(_,i)=>i+1));
 assert.equal(view.firstFailure,null);assert.equal(view.signatureAcceptance,'UNKNOWN');
});
