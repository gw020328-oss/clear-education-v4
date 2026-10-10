import fs from 'node:fs';
import {fork} from 'node:child_process';
import {resolve} from 'node:path';
import ganache from 'ganache';
import {Wallet,JsonRpcProvider,ContractFactory,keccak256} from 'ethers';
import {compile} from '../../stage15/lib/contracts.mjs';
import {root,save} from '../lib/io.mjs';
import {server,send,serve,staticFile,jsonBody} from './static.mjs';
const run='artifacts/run-'+Date.now();fs.mkdirSync(resolve(root,run),{recursive:true});
const roles=Object.fromEntries(['payer','participant','reviewer','issuer','other'].map(k=>[k,Wallet.createRandom()]));
const chain=ganache.server({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai',time:new Date('2030-01-01T00:00:00Z')},miner:{timestampIncrement:0},wallet:{accounts:Object.values(roles).map(w=>({secretKey:w.privateKey,balance:'0x3635c9adc5dea00000'}))}});await chain.listen(0,'127.0.0.1');const rpc=`http://127.0.0.1:${chain.address().port}`,provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
const artifacts=compile(),token=await new ContractFactory(artifacts.TestToken.abi,artifacts.TestToken.evm.bytecode.object,roles.payer.connect(provider)).deploy();await token.waitForDeployment();
let packet=null,evidence=[],mainPort=null,outage=null;
const childEnv={PATH:process.env.PATH};if(process.env.GEMINI_API_KEY)childEnv.GEMINI_API_KEY=process.env.GEMINI_API_KEY;if(process.env.GOOGLE_API_KEY)childEnv.GOOGLE_API_KEY=process.env.GOOGLE_API_KEY;
const issuer=fork(resolve(root,'server/issuer.mjs'),[],{env:{PATH:process.env.PATH},stdio:['ignore','ignore','ignore','ipc']});
const main=fork(resolve(root,'server/main.mjs'),[],{env:childEnv,stdio:['ignore','ignore','ignore','ipc']});
const ready=(child,type='ready')=>new Promise((r,j)=>{const listener=m=>{if(m.type===type){child.off('message',listener);r(m);}if(m.type==='error')j(Error(m.code));};child.on('message',listener);child.once('exit',()=>j(Error('CHILD_EXIT')));});
const issuerReady=ready(issuer);issuer.send({type:'init',key:roles.issuer.privateKey});await issuerReady;
// Independent loopback RPC route; not a separate consensus node or availability guarantee.
let recoveryOrigin='';const proxy=await server(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin',recoveryOrigin);res.setHeader('Access-Control-Allow-Headers','content-type');if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 const body=await jsonBody(req);const requests=Array.isArray(body)?body:[body];const allowed=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getBalance','eth_getTransactionCount','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_getTransactionReceipt','eth_getTransactionByHash','eth_sendTransaction','eth_accounts']);
 if(requests.some(x=>!allowed.has(x.method)||x.method==='eth_sendTransaction'&&x.params?.[0]?.from?.toLowerCase()!==roles.participant.address.toLowerCase()))throw Error('RPC_METHOD_BLOCKED');
 const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});send(res,await response.json());},{allowedOrigin:()=>recoveryOrigin});
const independentRPC=`http://127.0.0.1:${proxy.address().port}`;
const recovery=await server(async(req,res)=>{const path=new URL(req.url,'http://local').pathname;
 if(path==='/config.json')return send(res,{packet,evidence,outage,rpc:independentRPC,mainURL:mainPort?`http://127.0.0.1:${mainPort}`:null,participant:roles.participant.address,abis:{vault:artifacts.RefundVault.abi,token:artifacts.TestToken.abi},localDemo:true});
 const file=path==='/'?{content:fs.readFileSync(resolve(root,'recovery/index.html')),type:'text/html; charset=utf-8'}:staticFile(path);serve(res,file,independentRPC);
});recoveryOrigin=`http://127.0.0.1:${recovery.address().port}`;
const mainReady=ready(main);main.send({type:'init',rpc,token:token.target,issuer:roles.issuer.address,run,recoveryURL:recoveryOrigin,keys:{payer:roles.payer.privateKey,participant:roles.participant.privateKey,reviewer:roles.reviewer.privateKey}});mainPort=(await mainReady).port;
const endpoints={run,mainURL:`http://127.0.0.1:${mainPort}`,recoveryURL:recoveryOrigin,independentRPC,chainRPC:rpc,mainPID:main.pid,issuerPID:issuer.pid,supervisorPID:process.pid};save(run+'/endpoints.json',endpoints);console.log(JSON.stringify(endpoints));
const stopChild=child=>new Promise(r=>{if(child.exitCode!==null||child.signalCode!==null)return r({pid:child.pid,alreadyExited:true});child.once('exit',(code,signal)=>r({pid:child.pid,code,signal,observedAt:new Date().toISOString()}));child.kill('SIGTERM');});
main.on('message',async m=>{try{if(m.type==='deposited'){packet={...m.packet,tokenCodeHash:keccak256(await provider.getCode(token.target))};save(run+'/recovery-packet.json',packet);}if(m.type==='issue'){
 await provider.send('evm_setTime',[1895875200*1000]);await provider.send('evm_mine',[]);const issued=ready(issuer,'issued');issuer.send({type:'issue',plan:m.plan});evidence=(await issued).receipts;main.send({type:'issueResult',receipts:evidence});save(run+'/portable-evidence.json',evidence);
 }if(m.type==='stopBusiness'){
 const processes=await Promise.all([stopChild(main),stopChild(issuer)]);let mainUnavailable=false;try{await fetch(endpoints.mainURL+'/health',{signal:AbortSignal.timeout(2000)});}catch{mainUnavailable=true;}
 outage={at:new Date().toISOString(),processes,mainUnavailable,issuerExited:issuer.exitCode!==null||issuer.signalCode!==null,payoutAPIRequests:0};save(run+'/outage.json',outage);console.log(JSON.stringify({outage,recoveryURL:recoveryOrigin}));
 }}catch{if(main.connected)main.send({type:'issueResult',error:'ISSUER_FAILURE'});}});
const stop=async()=>{await Promise.all([stopChild(main),stopChild(issuer)]);recovery.close();proxy.close();provider.destroy();await chain.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
