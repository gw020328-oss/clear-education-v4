import {fork} from 'node:child_process';
import {createRequire} from 'node:module';
import {setMaxListeners} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {root,verifyPrepared} from './prepare.mjs';
import {managedWorkerTrust} from '../../src/hackerrank-evidence/worker-trust.mjs';
import {validateSelfProfile,requireProfileMode,SELF_MODE} from '../../src/hackerrank-evidence/self-profile.mjs';
import {check,freeze} from '../../src/hackerrank-evidence/values.mjs';
import {quiet} from '../../src/ybm-collector/client.mjs';
import {installClaimRpcObserver} from '../../src/ybm-collector/claim-rpc-observer.mjs';
import {installBoundedSender} from '../../src/ybm-collector/socket.mjs';
const owned=new WeakSet(),req=createRequire(root+'/src/ybm-collector/package.json');
export function assertSelfRuntime(value,profile){check(owned.has(value)&&value.isCurrent(),'SELF_RUNTIME_REQUIRED');requireProfileMode(profile,SELF_MODE,value.profile);}
export async function startSelfAttestorTest({signal,syntheticHttps=false}={}){
 check(process.env.CLEAR_LOCKED==='1','LOCKED_LAUNCHER_REQUIRED');check(typeof syntheticHttps==='boolean','SELF_ARGUMENT');signal?.throwIfAborted();verifyPrepared();
 const child=fork(fileURLToPath(new URL('./server-child.mjs',import.meta.url)),[syntheticHttps?'--synthetic-https':'--live-hackerrank'],
  {cwd:root,execPath:process.execPath,execArgv:[],env:{PATH:'/usr/bin:/bin',LOG_LEVEL:'silent'},stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});
 let closed=false,used=false,connection;const exited=new Promise(r=>child.once('exit',()=>{closed=true;r();}));
 async function close(){if(!closed){child.kill('SIGTERM');const kill=setTimeout(()=>child.kill('SIGKILL'),5000);kill.unref();await exited;clearTimeout(kill);}await connection?.close();signal?.removeEventListener('abort',abort);}
 const abort=()=>void close();signal?.addEventListener('abort',abort,{once:true});
 try{
  const init=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SELF_START_TIMEOUT')),20000);const finish=fn=>v=>{clearTimeout(timer);child.removeListener('message',message);child.removeListener('exit',exit);fn(v);};const message=finish(resolve),exit=finish(()=>reject(Error('SELF_START_FAILED')));child.once('message',message);child.once('exit',exit);});
  check(!init.failed&&!closed&&!signal?.aborted,'SELF_START_FAILED');const profile=validateSelfProfile(init.profile);
  check(profile.sourceEnvironment===(syntheticHttps?'SYNTHETIC_HTTPS':'LIVE_HACKERRANK'),'SELF_PROFILE');
  if(syntheticHttps){check(typeof init.fixtureCa==='string'&&init.fixtureCa.startsWith('-----BEGIN CERTIFICATE-----'),'SELF_FIXTURE_CA');(globalThis.TLS_ADDITIONAL_ROOT_CA_LIST??=[]).push(init.fixtureCa);}
  else check(init.fixtureCa===null,'SELF_FIXTURE_IN_LIVE');
  const runtime=Object.freeze({profile,isCurrent:()=>!closed&&!signal?.aborted,
   trust({audience,privacyKeyId}){check(!closed,'SELF_CLOSED');return freeze({...managedWorkerTrust({signers:[profile.signer],audience,privacyKeyId,now:Math.floor(Date.now()/1000)}),approvalRef:'clear-self-attestor-test.1',selfAttestor:profile});},
   async openClient({signal:scope}={}){
    check(!used&&!closed,'SELF_CLIENT_ONCE');used=true;scope?.throwIfAborted();
    const {setCryptoImplementation}=await import(pathToFileURL(req.resolve('@reclaimprotocol/tls'))),{webcryptoCrypto}=await import(pathToFileURL(req.resolve('@reclaimprotocol/tls/webcrypto')));setCryptoImplementation(webcryptoCrypto);
    const {AttestorClient}=await import(pathToFileURL(req.resolve('@reclaimprotocol/attestor-core'))),WebSocket=req('ws');
    const client=new AttestorClient({url:profile.endpoint,logger:quiet,authRequest:init.authRequest,makeWebSocket:u=>{
     const actual=new URL(u),expected=new URL(profile.endpoint);check(actual.origin===expected.origin&&actual.pathname===expected.pathname&&!actual.username&&!actual.password&&!actual.hash,'SELF_ENDPOINT');
     const socket=new WebSocket(u,{followRedirects:false,handshakeTimeout:5000,maxPayload:4*1024*1024,perMessageDeflate:false});installBoundedSender(socket,{proofMode:true,signal:scope});return socket;
    }});init.authRequest=null;installClaimRpcObserver(client);
    const wait=client.waitForResponse.bind(client);client.waitForResponse=(...x)=>{const p=wait(...x);p.catch(()=>{});return p;};if(client.eventTarget instanceof EventTarget)setMaxListeners(128,client.eventTarget);
    const stop=()=>void client.terminateConnection().catch(()=>{});scope?.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,30000);
    connection={client,async close(){scope?.removeEventListener('abort',stop);await client.terminateConnection().catch(()=>{});}};
    try{await client.waitForInit();scope?.throwIfAborted();check(client.isOpen&&!closed,'SELF_CLOSED');return connection;}catch{await connection.close();throw Error('SELF_CLIENT_FAILED');}finally{clearTimeout(timer);}
   },close});owned.add(runtime);return runtime;
 }catch{await close();throw Error('SELF_START_FAILED');}
}
