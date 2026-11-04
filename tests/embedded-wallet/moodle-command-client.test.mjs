import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeMoodleLogin} from '../../src/embedded-wallet/moodle-native-login.mjs';
import {moodleCommandDigest} from '../../src/embedded-wallet/moodle-command.mjs';
const hex=n=>n.toString(16).padStart(64,'0');
test('native command sends only its digest to C, keeps the one-use binding off forms, and discards it on invalidation',async()=>{
 const forms=[],sent=[],expiry=Math.floor(Date.now()/1000)+5;
 const config={surface:'MOODLE_NATIVE',courseId:2,sesskey:'synthetic01',role:'participant',origin:'https://example.invalid'};
 const login=createNativeMoodleLogin({config,locks:{request:(_n,_o,f)=>f()},
  api:async path=>path.endsWith('bootstrap')?{challenge:hex(1),expiresAtExclusive:expiry}
   :{status:'WAITING',role:'participant',expiresAtExclusive:expiry,commandBinding:hex(5)},
  fetch:async(_url,o)=>{const f=Object.fromEntries(o.body);forms.push(f);return {ok:true,redirected:false,json:async()=>
   f.operation==='start'?{status:'WAITING',expiresAtExclusive:expiry,launchCode:hex(1),browserProof:hex(2),finishProof:hex(3),intentTarget:hex(4)}
    :f.operation==='authorize-command'?{status:'AUTHORIZED',requestRef:hex(6),expiresAtExclusive:expiry}:{status:'CONNECTED'}};}});
 const signal=new AbortController().signal;await login.begin(signal);await login.finish(signal);
 const session={assertSession:async()=>{},request:async(path,options)=>{sent.push({path,options});return {syntheticReceipt:true};}};
 const command={method:'POST',path:'/bootcamp/v1/applications',body:{},idempotencyKey:'native-create'};
 assert.deepEqual(await login.command(session,command,signal),{syntheticReceipt:true});
 assert.deepEqual(forms.at(-1),{id:'2',sesskey:'synthetic01',operation:'authorize-command',commandHash:moodleCommandDigest(command)});
 assert.equal(JSON.stringify(forms).includes(hex(5)),false);
 assert.deepEqual(sent[0].options.moodleCommand,{requestRef:hex(6),commandBinding:hex(5)});
 login.invalidate();await assert.rejects(login.command(session,command,signal));assert.equal(sent.length,1);
});
