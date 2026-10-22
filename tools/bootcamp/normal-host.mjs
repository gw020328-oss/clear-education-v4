// Actual normal-host preparation and explicit activation. Importing performs nothing.
import {parseArgs} from 'node:util';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {initializeHost,configureHost,loadHostConfig,hostReadiness,fail} from './normal-host-config.mjs';
import {loadTls} from '../../src/dev/tls.mjs';
import {createPreparedNormalServer,listenNormalServer} from './normal-host-prepared-server.mjs';
import {atomicPrivate,readPrivate} from '../../src/hackathon-test-vault/e5/private-storage.mjs';
import {launchNormalHostWorker} from './normal-host-launch.mjs';
export async function servePreparedNormalHost(name){
 const {directory,config}=loadHostConfig(name),path=join(directory,'prepared-listener.lock');
 atomicPrivate(path,{pid:process.pid,origin:config.origin},{exclusive:true});let mounted,closing;
 const release=async()=>{const {unlinkSync}=await import('node:fs');if(existsSync(path)){const owner=JSON.parse(readPrivate(path));fail(owner.pid===process.pid,'NORMAL_HOST_LISTENER_OWNER');unlinkSync(path);}};
 try{mounted=createPreparedNormalServer({config,tls:loadTls(directory,config.tlsFingerprint)});await listenNormalServer(mounted.server,config.origin);}
 catch(e){await release();throw e;}
 return {config:mounted.config,close(){return closing??=(async()=>{const stopped=new Promise(r=>mounted.server.close(r));mounted.server.closeAllConnections();await stopped;await release();})();}};
}
export async function normalHostCli(args){
 const {values:v,positionals:p}=parseArgs({args,allowPositionals:true,options:{name:{type:'string'},origin:{type:'string'},'web-root':{type:'string'},participant:{type:'string'},operator:{type:'string'},certificate:{type:'string'},'frontend-accepted':{type:'boolean'},registry:{type:'boolean'},activate:{type:'boolean'}}});
 fail(p.length===1&&['prepare','configure','check','serve-prepared','run'].includes(p[0]),'NORMAL_HOST_ARGUMENT');
 const allowed={prepare:['name','origin','web-root'],configure:['name','web-root','participant','operator','certificate','frontend-accepted'],check:['name','registry'],'serve-prepared':['name'],run:['name','activate']};
 fail(Object.keys(v).every(k=>allowed[p[0]].includes(k)),'NORMAL_HOST_ARGUMENT');
 const print=x=>process.stdout.write(JSON.stringify(x)+'\n');
 if(p[0]==='prepare'){const result=initializeHost({name:v.name,origin:v.origin,webRoot:v['web-root']});print({...result,tlsCaPath:join(result.directory,'ca.pem'),roleInputTemplatePath:join(result.directory,'public-input-template.json')});return;}
 if(p[0]==='configure'){print(configureHost({name:v.name,participantWallet:v.participant,operatorWallet:v.operator,webRoot:v['web-root'],frontendAccepted:v['frontend-accepted'],selectedCertificateId:v.certificate}));return;}
 if(p[0]==='check'){
  print(hostReadiness(loadHostConfig(v.name)));if(v.registry){const result=await launchNormalHostWorker({mode:'registry',name:v.name});process.exitCode=result.exitCode;}return;
 }
 if(p[0]==='serve-prepared'){
  const live=await servePreparedNormalHost(v.name);print(live.config);const stop=()=>live.close().catch(()=>{process.exitCode=1;});for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.once(s,stop);return;
 }
 fail(v.activate===true,'NORMAL_HOST_EXPLICIT_ACTIVATION_REQUIRED');
 const readiness=hostReadiness(loadHostConfig(v.name));fail(readiness.readyForActivation,'NORMAL_HOST_ACTIVATION_NOT_READY');
 const result=await launchNormalHostWorker({mode:'run',name:v.name});process.exitCode=result.exitCode;
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 process.umask(0o077);normalHostCli(process.argv.slice(2)).catch(e=>{process.stderr.write((/^(NORMAL_HOST_[A-Z0-9_]+|EEXIST|EADDRINUSE)$/.test(e?.message)?e.message:'NORMAL_HOST_PREPARATION_FAILED')+'\n');process.exitCode=1;});
}
