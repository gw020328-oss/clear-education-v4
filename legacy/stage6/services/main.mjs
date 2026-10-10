import { createServer } from 'node:http';
import { readFile,writeFile,rename,chmod } from 'node:fs/promises';
import { Wallet,JsonRpcProvider,TypedDataEncoder } from 'ethers';
import { acceptTerms,acceptanceTypes,makeEvidence,validateAcceptance,validateEvidence,validateTrust } from '../lib/evidence.mjs';
import { chainTime,enrollFunded,inspectEnrollment } from '../lib/chain.mjs';

const port=Number(process.env.MAIN_PORT??0),chainUrl=process.env.CHAIN_URL,issuerUrl=process.env.ISSUER_URL,statePath=process.env.STATE_PATH;
if(!chainUrl||!issuerUrl||!statePath)throw new Error('MAIN_CONFIGURATION');
const trusted=validateTrust(JSON.parse(await readFile(process.env.MANIFEST_PATH,'utf8'))),learner=new Wallet(process.env.LEARNER_KEY),sponsorWallet=new Wallet(process.env.SPONSOR_KEY),provider=new JsonRpcProvider(chainUrl,undefined,{cacheTimeout:-1});
let state=null,inflight=null;
async function loadState(){if(state)return state;try{state=JSON.parse(await readFile(statePath,'utf8'));if(state.recipient.toLowerCase()!==learner.address.toLowerCase()||state.termsHash!==trusted.termsHash)throw new Error('STATE_SCOPE');if(state.evidence)validateEvidence(state.evidence,trusted,learner.address,await chainTime(provider));return state}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,recipient:learner.address,termsHash:trusted.termsHash,phase:'new'};return state;}}
async function saveState(next){const tmp=statePath+'.tmp';await writeFile(tmp,JSON.stringify(next,null,2)+'\n',{mode:0o600});await chmod(tmp,0o600);await rename(tmp,statePath);state=next;}
async function acceptanceFor(enrollment){
  const value={termsHash:trusted.termsHash,learner:learner.address,acceptedAt:enrollment.acceptedAt};
  const acceptance={...value,signature:await learner.signTypedData(trusted.domain,acceptanceTypes,value)};
  const digest=validateAcceptance(acceptance,trusted,learner.address,await chainTime(provider));
  if(digest!==enrollment.consentDigest)throw new Error('ONCHAIN_CONSENT_MISMATCH');return acceptance;
}
async function runPrepare(){
  const saved=await loadState();if(saved.evidence)return saved.evidence;
  let enrollment=await inspectEnrollment(provider,trusted,learner.address),acceptance;
  if(!enrollment.enrolled){const at=await chainTime(provider);acceptance=await acceptTerms(trusted,learner,at,trusted.termsHash);await enrollFunded(provider,trusted,sponsorWallet.connect(provider),acceptance,learner.address);enrollment=await inspectEnrollment(provider,trusted,learner.address);}
  if(enrollment.settled)throw new Error('ALREADY_SETTLED');acceptance=await acceptanceFor(enrollment);
  await saveState({...saved,phase:'enrolled',acceptedAt:enrollment.acceptedAt,consentDigest:enrollment.consentDigest,acceptance});
  let response;try{response=await fetch(`${issuerUrl}/issue-all`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({learner:learner.address})});}catch{throw new Error('ISSUER_UNAVAILABLE')}
  if(!response.ok)throw new Error('ISSUER_UNAVAILABLE');const issued=await response.json(),evidence=makeEvidence(trusted,acceptance,issued.submissions);
  validateEvidence(evidence,trusted,learner.address,await chainTime(provider));await saveState({...state,phase:'complete',evidence});return evidence;
}
async function prepare(){if(inflight)return inflight;inflight=runPrepare().finally(()=>{inflight=null});return inflight;}
const page=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주 서비스 — 증빙 보관</title><body><main><h1>증빙을 미리 보관하세요</h1><button id="prepare">조건 동의·예치·증빙 준비</button> <a id="download" href="/evidence" download="refund-evidence.v1.json" hidden>증빙 파일 다운로드</a><p id="status">발급 실패 뒤에도 같은 등록을 확인해 안전하게 재시도합니다.</p><script>prepare.onclick=async()=>{prepare.disabled=true;status.textContent='준비 중…';try{const r=await fetch('/prepare',{method:'POST'});if(!r.ok)throw 0;prepare.hidden=true;download.hidden=false;status.textContent='증빙 준비 완료'}catch{status.textContent='발급 실패 · 발급자 복구 후 다시 시도할 수 있습니다';prepare.disabled=false}}</script></main></body></html>`;
const send=(res,status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store'});res.end(typeof value==='string'?value:JSON.stringify(value));};
const server=createServer(async(req,res)=>{try{
  if(req.method==='GET'&&req.url==='/')return send(res,200,page,'text/html');
  if(req.method==='GET'&&req.url==='/health'){const saved=await loadState();return send(res,200,{ok:true,service:'main',phase:saved.phase});}
  if(req.method==='POST'&&req.url==='/prepare'){await prepare();return send(res,200,{ok:true,phase:'complete'});}
  if(req.method==='GET'&&req.url==='/evidence'){const value=JSON.stringify(await prepare(),null,2)+'\n';res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="refund-evidence.v1.json"','Cache-Control':'no-store'});return res.end(value);}
  send(res,404,{ok:false,code:'NOT_FOUND'});
}catch(e){send(res,503,{ok:false,code:e.message==='ISSUER_UNAVAILABLE'?'ISSUER_UNAVAILABLE':'MAIN_PREPARE_FAILED'});}});
server.listen(port,'127.0.0.1',()=>process.send?.({type:'ready',service:'main',port:server.address().port}));
const stop=()=>server.close(async()=>{await provider.destroy();process.exit(0)});process.on('SIGTERM',stop);process.on('SIGINT',stop);
