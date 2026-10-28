// C1 display/authentication development only. Does not initialize a chain, application, source lease or signer.
import {mkdirSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {parseArgs} from 'node:util';
import {privateDirectory,writeJson,readJson,lock} from '../../src/dev/files.mjs';
import {createCertificates,loadTls} from '../../src/dev/tls.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {createBootcampFrontendServer} from './frontend-server.mjs';
const marker='CLEAR_BOOTCAMP_C1_DISPLAY_ONLY_1';
function validate(c){
 const u=new URL(c.origin);
 if(c.marker!==marker||u.protocol!=='https:'||u.hostname!=='127.0.0.1'||u.origin!==c.origin||!Number.isInteger(Number(u.port))
  ||Number(u.port)<1024||Number(u.port)>65535||!Number.isSafeInteger(c.chainId)||c.chainId<1
  ||![c.participant,c.operator].every(x=>/^0x[0-9a-f]{40}$/.test(x))||c.participant===c.operator||!/^0x[0-9a-f]{64}$/.test(c.instanceId??'')||!Number.isSafeInteger(c.createdAt))throw Error('BC_FRONTEND_CONFIG');
 return c;
}
const authConfig=(root,c)=>({directory:join(root,'authentication'),origin:c.origin,chainId:c.chainId,instanceId:c.instanceId,
 participants:[c.participant],operators:[c.operator]});
export function initializeFrontendDevelopment({directory,port=9444,chainId=431701,participant,operator}){
 const config=validate({marker,origin:'https://127.0.0.1:'+port,chainId,participant:participant?.toLowerCase(),operator:operator?.toLowerCase(),
  instanceId:'0x'+randomBytes(32).toString('hex'),createdAt:Math.floor(Date.now()/1000)});
 mkdirSync(directory,{mode:0o700});const root=privateDirectory(directory);config.fingerprint=createCertificates(root);
 const auth=createApplicationService(authConfig(root,config));auth.close();writeJson(join(root,'bootcamp-frontend.json'),config);
 return {origin:config.origin,chainId,participant:config.participant,operator:config.operator,sourceMode:'SYNTHETIC_TEST_SOURCE',applicationCreated:false};
}
export async function startFrontendDevelopment({directory,webRoot}){
 const root=privateDirectory(directory),c=validate(readJson(join(root,'bootcamp-frontend.json'))),release=lock(root);
 let authentication,store,mounted,closing;
 try{
  authentication=createApplicationService(authConfig(root,c));
  store=createBootcampStore({directory:join(root,'store'),authentication,instanceId:'c1-'+c.instanceId.slice(2,42),demoStartedAt:c.createdAt,
   mode:'DISABLED',operatorBindings:[{wallet:c.operator,courseOperatorRef:'course-operator-demo'}]});
  mounted=createBootcampFrontendServer({authentication,store,tls:loadTls(root,c.fingerprint),sourceMode:'SYNTHETIC_TEST_SOURCE',chainId:c.chainId,webRoot});
  await new Promise((resolve,reject)=>{mounted.server.once('error',reject);mounted.server.listen(Number(new URL(c.origin).port),'127.0.0.1',()=>{
   mounted.server.removeListener('error',reject);resolve();});});
 }catch(e){store?.close();authentication?.close();release();throw e;}
 return {config:{...mounted.config,participant:c.participant,operator:c.operator},close(){return closing??=(async()=>{
  const stopped=new Promise(r=>mounted.server.close(r));mounted.server.closeAllConnections();await stopped;await mounted.drain();store.close();authentication.close();release();})();}};
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 process.umask(0o077);
 try{
  const {values:v,positionals:p}=parseArgs({allowPositionals:true,options:{name:{type:'string'},port:{type:'string'},'chain-id':{type:'string'},participant:{type:'string'},operator:{type:'string'}}});
  if(p.length!==1||!['init','start'].includes(p[0])||!/^[a-z][a-z0-9-]{0,31}$/.test(v.name??''))throw Error('BC_FRONTEND_ARGUMENT');
  const root=realpathSync(join(dirname(fileURLToPath(import.meta.url)),'../..'));
  if(p[0]==='init')for(const part of ['var','var/bootcamp-frontend']){mkdirSync(join(root,part),{recursive:true,mode:0o700});privateDirectory(join(root,part));}
  const directory=join(root,'var/bootcamp-frontend',v.name);
  if(p[0]==='init')console.log(JSON.stringify(initializeFrontendDevelopment({directory,participant:v.participant,operator:v.operator,
   port:v.port===undefined?9444:Number(v.port),chainId:v['chain-id']===undefined?431701:Number(v['chain-id'])})));
  else{
   if(Object.keys(v).some(k=>k!=='name'))throw Error('BC_FRONTEND_ARGUMENT');
   const running=await startFrontendDevelopment({directory,webRoot:join(root,'web/dist')});console.log(JSON.stringify(running.config));
   const stop=()=>running.close().catch(()=>{process.exitCode=1;});process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }
 }catch(e){console.error(/^(BC_FRONTEND_[A-Z_]+|EEXIST|EADDRINUSE|DEV_LOCKED)$/.test(e.message)?e.message:'BC_FRONTEND_FAILED');process.exitCode=1;}
}
