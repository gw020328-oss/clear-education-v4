import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const onChange=source.match(/  onChange: (.*),\n/)[1];
const entry=source.slice(source.indexOf('// Authenticated team iframe only;'));
for(const failure of [false,true])test(`team poll keeps reader position through session notification and final render; failure=${failure}`,async()=>{
 let y=618,draws=0;
 const result=await runInNewContext(`let liveView={old:true};const connection={refreshSession:async()=>(${onChange})(),refresh:async()=>{if(failure)throw Error('OFFLINE');return {current:true};}};${entry}\nwindow.clearTeamRefresh().then(()=>liveView)`,{window:{clearTeamRuntime:{}},failure,parseRoute:()=>({name:'bootcamp'}),render:opts=>{draws++;if(!opts?.keepScroll)y=0;}});
 assert.equal(draws,2,'both the session notification and refreshed view must render');assert.equal(y,618,'background reads must not send the iframe to its top');
 if(failure)assert.equal(result,null,'failed reads still clear the stale view');else assert.equal(result.current,true);
});
test('ordinary non-team connection changes retain navigation rendering',()=>{
 let opts;
 runInNewContext(`(${onChange})()`,{window:{},parseRoute:()=>({name:'bootcamp'}),render:value=>{opts=value;}});
 assert.ok(!opts?.keepScroll);
});
