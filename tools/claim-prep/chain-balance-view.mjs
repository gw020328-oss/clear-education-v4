// Read-only "chain balance" screen for the deferred-claim demo.
//
// A separate process from the CLEAR web/API. It only reads the owned local TEST chain
// (eth_call / logs) and serves one page on 127.0.0.1. No key, signature, write,
// CLEAR store, session or Moodle access, so it keeps working after the CLEAR API stops.
//
// CLI (main integrator, against a RUNNING owned e5 environment):
//   ./tools/node tools/claim-prep/chain-balance-view.mjs --environment e5-<uuid> [--application 0x<id>] [--port 9480]
// Without --application it shows the newest application in the vault.
// Routes (GET only): / page, /state.json balances, /attempts.json "확정된 환급 바꿔 보기".
// /attempts.json simulates operator-side changes with eth_call only (from = the role address in
// roles()); nothing is signed or sent. Open http://127.0.0.1:<port>/#attempts to run it once on load.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {Contract,JsonRpcProvider,keccak256,randomBytes,hexlify} from 'ethers';

export const CHAIN_VIEW_VERSION='clear-chain-balance-view.1';
export const ATTEMPTS_VERSION='clear-chain-view-attempts.1';
const TOKEN_ABI=['function balanceOf(address) view returns (uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'];
const STATES=['NONE','QUEUED','RESERVED','REVIEW','TERMINATED','ACCEPTED','SETTLED'];
const ensure=(ok,code)=>{if(!ok)throw Error(code);};
const b32=v=>typeof v==='string'&&/^0x[0-9a-f]{64}$/.test(v)&&v!=='0x'+'00'.repeat(32);
const ZERO='0x'+'00'.repeat(20);

/** One consistent read at a single block. Pure reads; returns strings only. */
export async function readChainView({provider,vaultAbi,vaultAddress,tokenAddress,applicationId=null}){
 const blockNumber=await provider.getBlockNumber();const at={blockTag:blockNumber};
 const vault=new Contract(vaultAddress,vaultAbi,provider),token=new Contract(tokenAddress,TOKEN_ABI,provider);
 let app=applicationId;
 if(!app){const ids=await vault.applicationIds(at);app=ids.length?ids[ids.length-1]:null;}
 const vaultAtoms=await token.balanceOf(vaultAddress,at);
 if(!app)return Object.freeze({version:CHAIN_VIEW_VERSION,blockNumber,applicationId:null,state:'NONE',recipient:null,recipientAtoms:null,vaultAtoms:vaultAtoms.toString(),payoutTxHash:null});
 ensure(b32(app),'CHAIN_VIEW_APPLICATION_ID');
 const a=await vault.application(app,at),state=STATES[Number(a.state)]??'UNKNOWN';
 const recipient=a.recipient&&a.recipient!==ZERO?a.recipient.toLowerCase():null;
 let recipientAtoms=null,payoutTxHash=null;
 if(recipient){
  // Whole wallet balance, as before. The payout tx is this application's own settlement only:
  // RightSettled(applicationId indexed, allocationId indexed, recipient indexed) from the vault,
  // never another application's Transfer to the same wallet. The vault settles an application once.
  recipientAtoms=(await token.balanceOf(recipient,at)).toString();
  const logs=await vault.queryFilter(vault.filters.RightSettled(app,null,recipient),0,blockNumber);
  ensure(logs.length<=1,'CHAIN_VIEW_SETTLEMENT_DUPLICATE');
  payoutTxHash=logs.length?logs[0].transactionHash:null;
 }
 return Object.freeze({version:CHAIN_VIEW_VERSION,blockNumber,applicationId:app,state,recipient,recipientAtoms,vaultAtoms:vaultAtoms.toString(),payoutTxHash});
}

const NOT_FINAL_NOTE='확정 전에는 정해진 절차(이의·재검증)로만 바뀔 수 있어요';
// Function names that would change a fixed payout amount/recipient or move funds out. None expected in V2.
const CHANGE_FUNCTION=/^(set|change|update|edit|modify|replace)_?(amount|recipient|payee|beneficiary|token)|withdraw|sweep|rescue|drain|redirect|reassign|refund|recover/i;
const rand32=()=>{let h;do h=hexlify(randomBytes(32));while(!b32(h));return h;};
const deepFreeze=o=>{for(const v of Object.values(o))if(v&&typeof v==='object')deepFreeze(v);return Object.freeze(o);};
// Only a contract revert is the chain's answer. RPC/network failures propagate (served as 503).
function revertReason(error){
 if(error?.code!=='CALL_EXCEPTION')throw error;
 for(const s of [error.reason,error.shortMessage]){
  if(typeof s!=='string')continue;
  const m=/^([A-Z][A-Z0-9_]{1,63})$/.exec(s)??/"([A-Z][A-Z0-9_]{1,63})"/.exec(s);
  if(m)return m[1];
 }
 return 'UNKNOWN_REVERT';
}

/**
 * "확정된 환급 바꿔 보기": asks the chain what would happen if the operator-side role account sent a change
 * to an ACCEPTED/SETTLED right. eth_call (staticCall) only, at one block: no key, signature or transaction.
 */
export async function readAttempts({provider,vaultAbi,vaultAddress,applicationId=null}){
 const blockNumber=await provider.getBlockNumber();const at={blockTag:blockNumber};
 const vault=new Contract(vaultAddress,vaultAbi,provider);
 let app=applicationId;
 if(!app){const ids=await vault.applicationIds(at);app=ids.length?ids[ids.length-1]:null;}
 const base={version:ATTEMPTS_VERSION,blockNumber:String(blockNumber),applicationId:app};
 if(!app)return deepFreeze({...base,available:false,state:'NONE',note:NOT_FINAL_NOTE});
 ensure(b32(app),'CHAIN_VIEW_APPLICATION_ID');
 const a=await vault.application(app,at),state=STATES[Number(a.state)]??'UNKNOWN';
 if(state!=='ACCEPTED'&&state!=='SETTLED')return deepFreeze({...base,available:false,state,note:NOT_FINAL_NOTE});
 const roles=await vault.roles(at);
 const simulate=async(name,args,from)=>{
  try{await vault[name].staticCall(...args,{from,blockTag:blockNumber});return {rejected:false,reason:null};}
  catch(error){return {rejected:true,reason:revertReason(error)};}
 };
 // ① Same target with revision+1 and a different decisionHash, as the registrar would send it.
 const t=a.target;let decisionHash;do decisionHash=rand32();while(decisionHash===t.decisionHash);
 const target={decisionId:t.decisionId,revision:t.revision+1n,decisionHash,sourceValidUntilExclusive:t.sourceValidUntilExclusive,acceptanceSequence:t.acceptanceSequence,sourceReceiptHash:t.sourceReceiptHash};
 const replace=await simulate('replaceTarget',[rand32(),app,target,0,a.version],roles.registrar);
 // ② Cancel the payout (CAP_UNRESOLVED) as the terminator would send it.
 const terminate=await simulate('terminate',[rand32(),app,1,rand32(),a.version],roles.terminator);
 // ③ Static facts: claim takes only the application id, the amount is a constant, no change function exists.
 const iface=vault.interface,claimInputs=iface.getFunction('claim').inputs.map(i=>i.type),amountFn=iface.getFunction('AMOUNT');
 ensure(amountFn&&amountFn.inputs.length===0&&amountFn.constant,'CHAIN_VIEW_AMOUNT_ABI');
 const changeFunctions=[];iface.forEachFunction(f=>{if(CHANGE_FUNCTION.test(f.name))changeFunctions.push(f.name);});
 const amountAtoms=(await vault.AMOUNT(at)).toString();
 return deepFreeze({...base,available:true,state,
  attempts:[{action:'REPLACE_DECISION',by:'운영 측 등록자 권한',...replace},{action:'TERMINATE_PAYOUT',by:'운영 측 종료 권한',...terminate}],
  fixed:{action:'CHANGE_AMOUNT_OR_RECIPIENT',claimInputs,claimHasRecipientOrAmountInput:!(claimInputs.length===1&&claimInputs[0]==='bytes32'),
   amountAtoms,changeFunctions,changeFunctionExists:changeFunctions.length>0}});
}

const PAGE=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>체인 잔액 확인</title><style>
:root{--bg:#f6f7f9;--fg:#111;--muted:#5b6170;--card:#fff;--line:#d8dce3;--ok:#0a7d32;--wait:#9a5b00;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#f2f3f5;--muted:#a3a9b5;--card:#1b1e23;--line:#2c313a;--ok:#4cc17a;--wait:#e0a03a;--bad:#f07067}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:14px}
.label{color:var(--muted);font-size:14px}.big{font-size:56px;font-weight:700;letter-spacing:-1px}.row{display:flex;gap:14px;flex-wrap:wrap}.row .card{flex:1;min-width:220px}
.state{font-size:22px;font-weight:700}.ok{color:var(--ok)}.wait{color:var(--wait)}.bad{color:var(--bad)}code{font-size:13px;word-break:break-all}
h2{font-size:18px;margin:0 0 4px}.note{color:var(--muted);font-size:14px;margin:4px 0 12px}
button{font:inherit;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--fg);color:var(--bg);cursor:pointer}button:disabled{opacity:.6;cursor:default}
.lines{margin:12px 0 0;padding:0;list-style:none}.lines li{padding:8px 0;border-top:1px solid var(--line);font-weight:600}.lines li:first-child{border-top:0}
</style><main><h1>체인 잔액 확인</h1><p class="sub">CLEAR 서버와 별개로 로컬 TEST 체인을 직접 읽습니다 · 읽기 전용 · 2초마다 갱신</p>
<div class="card"><div class="label">학생 지갑 <code id="r">-</code></div><div class="big" id="bal">-</div></div>
<div class="row"><div class="card"><div class="label">환급 권리 상태</div><div class="state" id="st">-</div></div>
<div class="card"><div class="label">금고 잔액</div><div class="state" id="vault">-</div></div></div>
<div class="card"><div class="label">학생에게 간 지급 거래</div><code id="tx">-</code></div>
<div class="card"><h2>확정된 환급 바꿔 보기</h2><p class="note">운영 측 권한을 가진 계정이 보냈다고 가정하고 블록체인에 물어봅니다 · 거래는 보내지 않습니다</p>
<button id="try" type="button">운영 측 권한으로 바꿔 보기</button><ul class="lines" id="att"></ul><p class="note" id="attfoot"></p></div>
<p class="sub" id="foot">-</p></main><script>
const KO={NONE:['신청 없음','wait'],QUEUED:['대기','wait'],RESERVED:['배정됨','wait'],REVIEW:['검토 중','wait'],TERMINATED:['종료','bad'],ACCEPTED:['수락됨 · 청구 대기','wait'],SETTLED:['지급 완료','ok'],UNKNOWN:['알 수 없음','bad']};
const t=a=>a===null?'-':(Number(BigInt(a)/10000n)/100).toLocaleString('ko-KR')+' TEST';
async function tick(){try{const r=await fetch('state.json',{cache:'no-store'});if(!r.ok)throw 0;const s=await r.json();
document.getElementById('r').textContent=s.recipient?s.recipient.slice(0,6)+'…'+s.recipient.slice(-4):'(수령인 등록 전)';
document.getElementById('bal').textContent=t(s.recipientAtoms);const k=KO[s.state]||KO.UNKNOWN,e=document.getElementById('st');e.textContent=k[0];e.className='state '+k[1];
document.getElementById('vault').textContent=t(s.vaultAtoms);document.getElementById('tx').textContent=s.payoutTxHash||'아직 없음';
document.getElementById('foot').textContent='블록 '+s.blockNumber+' 기준 · '+new Date().toLocaleTimeString('ko-KR');}
catch{document.getElementById('foot').textContent='체인에 연결할 수 없습니다 · '+new Date().toLocaleTimeString('ko-KR');}}
tick();setInterval(tick,2000);
const ACT={REPLACE_DECISION:'① 판정(조건) 바꾸기',TERMINATE_PAYOUT:'② 지급 취소'},WHY={UNACCEPTED_STATE:'이미 확정된 환급'};
const li=(text,cls)=>{const e=document.createElement('li');e.textContent=text;e.className=cls;return e;};
async function attempts(){const b=document.getElementById('try'),ul=document.getElementById('att'),f=document.getElementById('attfoot');
b.disabled=true;ul.replaceChildren();f.textContent='블록체인에 물어보는 중…';
try{const r=await fetch('attempts.json',{cache:'no-store'});if(!r.ok)throw 0;const s=await r.json();
if(!s.available){ul.append(li(s.note+' (현재: '+(KO[s.state]||KO.UNKNOWN)[0]+')','wait'));}
else{for(const a of s.attempts){const name=ACT[a.action]||a.action;
 ul.append(a.rejected?li(name+' → 블록체인이 거부 ('+(WHY[a.reason]||a.reason)+')','ok'):li(name+' → 블록체인이 거부하지 않음 (확인 필요)','bad'));}
 const x=s.fixed,fixed=!x.claimHasRecipientOrAmountInput&&!x.changeFunctionExists&&x.amountAtoms==='100000000';
 ul.append(fixed?li('③ 금액·받는 사람 바꾸기 → 바꾸는 기능 자체가 없음 (100 TEST 고정, 청구에는 받는 사람·금액 입력 없음)','ok'):li('③ 금액·받는 사람 바꾸기 → 확인 필요','bad'));}
f.textContent='블록 '+s.blockNumber+' 기준 · eth_call 시뮬레이션만 했고 체인에는 아무것도 바뀌지 않았습니다';}
catch{f.textContent='체인에 연결할 수 없습니다 · '+new Date().toLocaleTimeString('ko-KR');}
finally{b.disabled=false;}}
document.getElementById('try').addEventListener('click',attempts);
if(location.hash==='#attempts')attempts();</script></html>`;

/** Serves the page, the state read and (optional) the attempts read. GET only, loopback only, no other routes. */
export function createChainViewServer({read,attempts}){
 ensure(typeof read==='function'&&(attempts===undefined||typeof attempts==='function'),'CHAIN_VIEW_CONFIG');
 return createServer(async(req,res)=>{
  const head={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
  if(req.method!=='GET'){res.writeHead(405,head);res.end();return;}
  if(req.url==='/'){res.writeHead(200,{...head,'content-type':'text/html; charset=utf-8',
   'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'"});res.end(PAGE);return;}
  if(req.url==='/state.json'){
   try{const s=await read();res.writeHead(200,{...head,'content-type':'application/json'});res.end(JSON.stringify(s));}
   catch{res.writeHead(503,{...head,'content-type':'application/json'});res.end('{"error":"CHAIN_UNAVAILABLE"}');}
   return;}
  if(req.url==='/attempts.json'&&attempts){
   try{const s=await attempts();res.writeHead(200,{...head,'content-type':'application/json'});res.end(JSON.stringify(s));}
   catch{res.writeHead(503,{...head,'content-type':'application/json'});res.end('{"error":"CHAIN_UNAVAILABLE"}');}
   return;}
  res.writeHead(404,head);res.end();
 });
}

function args(argv){
 const out={port:9480};
 for(let i=0;i<argv.length;i++){const k=argv[i];
  if(['--checkout','--environment','--application','--port'].includes(k)&&argv[i+1])out[k.slice(2)]=argv[++i];else throw Error('CHAIN_VIEW_USAGE');}
 out.port=Number(out.port);
 ensure(/^e5-[0-9a-f-]{36}$/.test(out.environment??'')&&(out.application===undefined||b32(out.application))
  &&Number.isSafeInteger(out.port)&&out.port>=1024&&out.port<=65535,'CHAIN_VIEW_USAGE');return out;
}
async function main(){
 const a=args(process.argv.slice(2)),checkout=resolve(a.checkout??new URL('../..',import.meta.url).pathname);
 const env=await import(pathToFileURL(join(checkout,'src/hackathon-test-vault/e5/environment.mjs')).href);
 const {buildExecutionV2}=await import(pathToFileURL(join(checkout,'tests/hackathon-test-vault/execution-v2-build.mjs')).href);
 const m=env.loadRuntime(a.environment);ensure(m.version==='clear-e5-test-runtime.2'&&m.production===false,'CHAIN_VIEW_RUNTIME');
 const provider=new JsonRpcProvider(m.endpoint,undefined,{cacheTimeout:-1,batchMaxCount:1,staticNetwork:true});
 ensure((await provider.getNetwork()).chainId.toString()===m.chainId,'CHAIN_VIEW_CHAIN_ID');
 ensure(keccak256(await provider.getCode(m.vaultAddress))===m.vaultCodeHash&&keccak256(await provider.getCode(m.tokenAddress))===m.tokenCodeHash,'CHAIN_VIEW_CODE_PIN');
 const vaultAbi=buildExecutionV2().contract.abi;
 const server=createChainViewServer({read:()=>readChainView({provider,vaultAbi,vaultAddress:m.vaultAddress,tokenAddress:m.tokenAddress,applicationId:a.application??null}),
  attempts:()=>readAttempts({provider,vaultAbi,vaultAddress:m.vaultAddress,applicationId:a.application??null})});
 server.listen(a.port,'127.0.0.1',()=>process.stdout.write(JSON.stringify({event:'CHAIN_VIEW_LISTENING',url:'http://127.0.0.1:'+a.port+'/',environmentId:a.environment,readOnly:true})+'\n'));
 const stop=()=>{server.close();provider.destroy();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)main().catch(error=>{process.stderr.write((/^(CHAIN_VIEW|E5)_[A-Z0-9_]+$/.test(error.message)?error.message:'CHAIN_VIEW_FAILED')+'\n');process.exitCode=1;});
