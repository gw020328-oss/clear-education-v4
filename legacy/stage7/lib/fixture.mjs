import { mkdtemp,writeFile,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet,Contract } from 'ethers';
import { start,stop,jsonFile,scanSecrets } from './process.mjs';
import { localProvider,core } from './clients.mjs';
import { CentralEscrow } from './central.mjs';
import { AMOUNT,acceptTerms,makeEvidence } from '../../stage6/lib/evidence.mjs';
export async function fixture({underfunded=false,dir}={}){
  dir??=await mkdtemp(join(tmpdir(),'refund-stage7-'));
  const sponsor=Wallet.createRandom(),learner=Wallet.createRandom(),issuer=Wallet.createRandom(),relayer=Wallet.createRandom();
  const handles=[],stops=[];
  const f={dir,handles,stops,sponsor,learner,issuer,relayer,underfunded};
  const spawn=async(file,env)=>{const h=await start(new URL(file,import.meta.url),env);handles.push(h);return h};
  f.stop=async(name)=>{const result=await stop(f[name]);if(result)stops.push({component:name,...result});return result;};
  f.close=async()=>{f.provider?.destroy();for(const h of handles)await stop(h);return scanSecrets(dir,[sponsor.privateKey,learner.privateKey,issuer.privateKey,relayer.privateKey],handles.map(h=>h.logs));};
  try{
    f.chain=await spawn('../../stage6/services/chain.mjs',{CHAIN_PORT:'0',SPONSOR_KEY:sponsor.privateKey,RELAYER_KEY:relayer.privateKey,ISSUER_ADDRESS:issuer.address});
    f.manifest=f.chain.ready.manifest;f.chainUrl='http://127.0.0.1:'+f.chain.port;f.time=f.manifest.terms.start;
    f.provider=localProvider(f.chainUrl);f.manifestPath=join(dir,'manifest.json');f.evidencePath=join(dir,'evidence.json');f.dbPath=join(dir,'central.sqlite');f.clockPath=join(dir,'clock.txt');
    await jsonFile(f.manifestPath,f.manifest);await writeFile(f.clockPath,String(f.time),{mode:0o600});
    f.issuerService=await spawn('../../stage6/services/issuer.mjs',{ISSUER_PORT:'0',ISSUER_KEY:issuer.privateKey,MANIFEST_PATH:f.manifestPath,EXPECTED_LEARNER:learner.address});
    if(underfunded){const token=new Contract(f.manifest.terms.token,['function approve(address,uint256) returns(bool)'],await f.provider.getSigner(sponsor.address));await(await token.approve(f.manifest.domain.verifyingContract,AMOUNT-1n)).wait();}
    f.main=await spawn('../../stage6/services/main.mjs',{MAIN_PORT:'0',CHAIN_URL:f.chainUrl,ISSUER_URL:'http://127.0.0.1:'+f.issuerService.port,MANIFEST_PATH:f.manifestPath,STATE_PATH:join(dir,'main-state.json'),LEARNER_KEY:learner.privateKey,SPONSOR_KEY:sponsor.privateKey});
    const prepared=await fetch('http://127.0.0.1:'+f.main.port+'/prepare',{method:'POST'});
    f.enrollmentResult={onchainHttpStatus:prepared.status};
    if(underfunded){
      const acceptance=await acceptTerms(f.manifest,learner,f.time,f.manifest.termsHash);
      const submissions=(await(await fetch('http://127.0.0.1:'+f.issuerService.port+'/issue-all',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({learner:learner.address})})).json()).submissions;
      f.packet=makeEvidence(f.manifest,acceptance,submissions);
    }else{if(!prepared.ok)throw new Error('PREPARE_FAILED');f.packet=await(await fetch('http://127.0.0.1:'+f.main.port+'/evidence')).json();}
    await jsonFile(f.evidencePath,f.packet);
    const ledger=new CentralEscrow(f.dbPath,f.manifest,{create:true});
    try{ledger.fund(underfunded?AMOUNT-1n:AMOUNT);try{ledger.enroll(f.packet.acceptance,f.packet.recipient,f.time);f.enrollmentResult.central='ENROLLED';}catch(e){f.enrollmentResult.central=e.code;} }finally{ledger.close();}
    f.startExecutor=async()=>{f.executor=await spawn('../services/executor.mjs',{MANIFEST_PATH:f.manifestPath,LEDGER_PATH:f.dbPath,CLOCK_PATH:f.clockPath});f.centralUrl='http://127.0.0.1:'+f.executor.port;return f.executor;};
    await f.startExecutor();
    f.startUIs=async()=>{for(const rail of ['central','onchain']){
      const h=await spawn('../services/ui.mjs',{MANIFEST_PATH:f.manifestPath,EVIDENCE_PATH:f.evidencePath,UI_CONFIG:JSON.stringify({rail,endpoint:rail==='central'?f.centralUrl:f.chainUrl,demoMode:true,demoSender:relayer.address,time:f.time,cli:`node stage7/cli.mjs ${rail} ${rail==='central'?f.centralUrl:f.chainUrl} EVIDENCE.json`+(rail==='onchain'?' MANIFEST.json':'')})});f[rail+'UI']=h;
      if(rail==='central')f.executor.child.send({type:'origins',origins:['http://127.0.0.1:'+h.port]});
    }};
    await f.startUIs();
    f.setTime=async t=>{await f.provider.send('evm_setTime',[t*1000]);await f.provider.send('evm_mine',[]);await writeFile(f.clockPath,String(t));f.time=t;};
    f.centralState=()=>{const e=new CentralEscrow(f.dbPath,f.manifest);try{return e.status(f.packet.recipient)}finally{e.close()}};
    f.chainState=async()=>{const {vault,token}=await core.verifyDeployment(f.provider,f.manifest);return {observedBlockTime:Number((await f.provider.send('eth_getBlockByNumber',['latest',false])).timestamp),enrolled:await vault.enrolled(f.packet.recipient),settled:await vault.settled(f.packet.recipient),reserveUnits:(await vault.totalReserved()).toString(),paidUnits:(await token.balanceOf(f.packet.recipient)).toString()};};
    return f;
  }catch(e){await f.close();throw e;}
}
