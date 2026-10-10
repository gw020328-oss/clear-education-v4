import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdir,writeFile,readFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Wallet } from 'ethers';

const mode=process.argv[2]??'normal';if(!['normal','outage','browser'].includes(mode))throw new Error('MODE');
const root=new URL('./',import.meta.url),stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-'),runDir=new URL(`artifacts/${mode}-${stamp}/`,root),runDirPath=fileURLToPath(runDir);await mkdir(runDir,{recursive:true});
const sponsor=Wallet.createRandom(),learner=Wallet.createRandom(),issuer=Wallet.createRandom(),relayer=Wallet.createRandom(),handles=[];
function start(file,env={}){const child=fork(new URL(file,root),[],{env:{...process.env,...env},stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SERVICE_TIMEOUT')),30000);child.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve(m)}else if(m.type==='failed'){clearTimeout(timer);reject(new Error(m.code))}});child.once('exit',code=>{if(code){clearTimeout(timer);reject(new Error(`SERVICE_EXIT_${code}:${output.slice(-400)}`))}})});const h={child,ready,output:()=>output};handles.push(h);return h;}
async function stop(handle){if(!handle||handle.child.exitCode!==null)return {alreadyStopped:true,exitCode:handle?.child.exitCode??null};handle.child.kill('SIGTERM');const [code,signal]=await once(handle.child,'exit');return {alreadyStopped:false,exitCode:code,signal};}
async function write(path,value){await writeFile(path,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});}
async function direct(env){const child=fork(new URL('services/direct-claim.mjs',root),[],{env:{...process.env,...env},stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);const h={child,ready:Promise.resolve(),output:()=>output};handles.push(h);return new Promise((resolve,reject)=>{child.on('message',m=>m.type==='complete'?resolve(m.result):m.type==='failed'&&reject(new Error(m.code)));child.once('exit',code=>code&&reject(new Error(`DIRECT_EXIT_${code}:${output.slice(-400)}`)));});}
async function scanSecrets(){const secrets=[sponsor.privateKey,learner.privateKey,issuer.privateKey,relayer.privateKey].map(v=>v.toLowerCase().replace(/^0x/,''));let files=0,matches=0;async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=join(dir,entry.name);if(entry.isDirectory())await walk(p);else{files++;const text=await readFile(p,'utf8').catch(()=> '');for(const secret of secrets)if(text.toLowerCase().includes(secret))matches++;}}}await walk(runDirPath);return {filesScanned:files,exactGeneratedSecretMatches:matches};}
let chain,issuerService,main,claim,record;
try{
  chain=start('services/chain.mjs',{CHAIN_PORT:'0',SPONSOR_KEY:sponsor.privateKey,RELAYER_KEY:relayer.privateKey,ISSUER_ADDRESS:issuer.address});
  const chainReady=await chain.ready,chainUrl=`http://127.0.0.1:${chainReady.port}`,manifestUrl=new URL('trusted-deployment.json',runDir),stateUrl=new URL('main-state.json',runDir),evidenceUrl=new URL('refund-evidence.v1.json',runDir);
  const manifestPath=fileURLToPath(manifestUrl),statePath=fileURLToPath(stateUrl),evidencePath=fileURLToPath(evidenceUrl);await write(manifestUrl,chainReady.manifest);
  issuerService=start('services/issuer.mjs',{ISSUER_PORT:'0',ISSUER_KEY:issuer.privateKey,MANIFEST_PATH:manifestPath,EXPECTED_LEARNER:learner.address});const issuerReady=await issuerService.ready;
  main=start('services/main.mjs',{MAIN_PORT:'0',CHAIN_URL:chainUrl,ISSUER_URL:`http://127.0.0.1:${issuerReady.port}`,MANIFEST_PATH:manifestPath,STATE_PATH:statePath,LEARNER_KEY:learner.privateKey,SPONSOR_KEY:sponsor.privateKey});const mainReady=await main.ready;
  let response=await fetch(`http://127.0.0.1:${mainReady.port}/prepare`,{method:'POST'});if(!response.ok)throw new Error('PREPARE_FAILED');const evidence=await (await fetch(`http://127.0.0.1:${mainReady.port}/evidence`)).json();await write(evidencePath,evidence);
  claim=start('services/claim.mjs',{CLAIM_PORT:'0',MANIFEST_PATH:manifestPath,EVIDENCE_PATH:evidencePath,DEMO_MODE:'1',RPC_ORIGINS:chainUrl});const claimReady=await claim.ready;
  let outageEvidence=null;if(mode==='outage'||mode==='browser'){outageEvidence={main:await stop(main),issuer:await stop(issuerService)};main=null;issuerService=null;}
  if(mode==='browser'){
    const runtime={mode,runDirectory:runDirPath,claimUrl:`http://127.0.0.1:${claimReady.port}`,rpcUrl:chainUrl,mainStopped:true,issuerStopped:true};await write(new URL('browser-runtime.json',runDir),runtime);console.log(JSON.stringify(runtime));await new Promise(resolve=>{process.on('SIGINT',resolve);process.on('SIGTERM',resolve)});record={mode,browserSessionHeld:true,outageEvidence};
  }else{
    const result=await direct({CHAIN_URL:chainUrl,MANIFEST_PATH:manifestPath,EVIDENCE_PATH:evidencePath,SUBMITTER_KEY:relayer.privateKey});
    response=await fetch(`http://127.0.0.1:${claimReady.port}/`);const rpcHealth=await fetch(chainUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})});
    record={mode,completedAt:new Date().toISOString(),outageEvidence,claimServerAfterServiceStop:{status:response.status},chainAfterServiceStop:{status:rpcHealth.status,result:(await rpcHealth.json()).result},payment:result,ports:{chain:chainReady.port,claim:claimReady.port}};
  }
  record.secretScan=await scanSecrets();await write(new URL('run-result.json',runDir),record);if(mode!=='browser')console.log(JSON.stringify({ok:true,mode,runDirectory:runDirPath,transactionHash:record.payment.transactionHash}));
}finally{await Promise.all(handles.map(stop));}
