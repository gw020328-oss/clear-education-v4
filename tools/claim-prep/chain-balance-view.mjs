// Read-only "chain balance" screen for the deferred-claim demo.
//
// A separate process from the CLEAR web/API. It only reads the owned local TEST chain
// (eth_call / logs) and serves one page on 127.0.0.1. No key, signature, write,
// CLEAR store, session or Moodle access, so it keeps working after the CLEAR API stops.
//
// CLI (main integrator, against a RUNNING owned e5 environment):
//   ./tools/node tools/claim-prep/chain-balance-view.mjs --environment e5-<uuid> [--application 0x<id>] [--port 9480]
// Without --application it shows the newest application in the vault.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {Contract,JsonRpcProvider,keccak256} from 'ethers';

export const CHAIN_VIEW_VERSION='clear-chain-balance-view.1';
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

const PAGE=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>체인 잔액 확인</title><style>
:root{--bg:#f6f7f9;--fg:#111;--muted:#5b6170;--card:#fff;--line:#d8dce3;--ok:#0a7d32;--wait:#9a5b00;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#f2f3f5;--muted:#a3a9b5;--card:#1b1e23;--line:#2c313a;--ok:#4cc17a;--wait:#e0a03a;--bad:#f07067}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:14px}
.label{color:var(--muted);font-size:14px}.big{font-size:56px;font-weight:700;letter-spacing:-1px}.row{display:flex;gap:14px;flex-wrap:wrap}.row .card{flex:1;min-width:220px}
.state{font-size:22px;font-weight:700}.ok{color:var(--ok)}.wait{color:var(--wait)}.bad{color:var(--bad)}code{font-size:13px;word-break:break-all}
</style><main><h1>체인 잔액 확인</h1><p class="sub">CLEAR 서버와 별개로 로컬 TEST 체인을 직접 읽습니다 · 읽기 전용 · 2초마다 갱신</p>
<div class="card"><div class="label">학생 지갑 <code id="r">-</code></div><div class="big" id="bal">-</div></div>
<div class="row"><div class="card"><div class="label">환급 권리 상태</div><div class="state" id="st">-</div></div>
<div class="card"><div class="label">금고 잔액</div><div class="state" id="vault">-</div></div></div>
<div class="card"><div class="label">학생에게 간 지급 거래</div><code id="tx">-</code></div>
<p class="sub" id="foot">-</p></main><script>
const KO={NONE:['신청 없음','wait'],QUEUED:['대기','wait'],RESERVED:['배정됨','wait'],REVIEW:['검토 중','wait'],TERMINATED:['종료','bad'],ACCEPTED:['수락됨 · 청구 대기','wait'],SETTLED:['지급 완료','ok'],UNKNOWN:['알 수 없음','bad']};
const t=a=>a===null?'-':(Number(BigInt(a)/10000n)/100).toLocaleString('ko-KR')+' TEST';
async function tick(){try{const r=await fetch('state.json',{cache:'no-store'});if(!r.ok)throw 0;const s=await r.json();
document.getElementById('r').textContent=s.recipient?s.recipient.slice(0,6)+'…'+s.recipient.slice(-4):'(수령인 등록 전)';
document.getElementById('bal').textContent=t(s.recipientAtoms);const k=KO[s.state]||KO.UNKNOWN,e=document.getElementById('st');e.textContent=k[0];e.className='state '+k[1];
document.getElementById('vault').textContent=t(s.vaultAtoms);document.getElementById('tx').textContent=s.payoutTxHash||'아직 없음';
document.getElementById('foot').textContent='블록 '+s.blockNumber+' 기준 · '+new Date().toLocaleTimeString('ko-KR');}
catch{document.getElementById('foot').textContent='체인에 연결할 수 없습니다 · '+new Date().toLocaleTimeString('ko-KR');}}
tick();setInterval(tick,2000);</script></html>`;

/** Serves the page and one JSON read. GET only, loopback only, no other routes. */
export function createChainViewServer({read}){
 ensure(typeof read==='function','CHAIN_VIEW_CONFIG');
 return createServer(async(req,res)=>{
  const head={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
  if(req.method!=='GET'){res.writeHead(405,head);res.end();return;}
  if(req.url==='/'){res.writeHead(200,{...head,'content-type':'text/html; charset=utf-8',
   'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'"});res.end(PAGE);return;}
  if(req.url==='/state.json'){
   try{const s=await read();res.writeHead(200,{...head,'content-type':'application/json'});res.end(JSON.stringify(s));}
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
 const server=createChainViewServer({read:()=>readChainView({provider,vaultAbi,vaultAddress:m.vaultAddress,tokenAddress:m.tokenAddress,applicationId:a.application??null})});
 server.listen(a.port,'127.0.0.1',()=>process.stdout.write(JSON.stringify({event:'CHAIN_VIEW_LISTENING',url:'http://127.0.0.1:'+a.port+'/',environmentId:a.environment,readOnly:true})+'\n'));
 const stop=()=>{server.close();provider.destroy();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href)main().catch(error=>{process.stderr.write((/^(CHAIN_VIEW|E5)_[A-Z0-9_]+$/.test(error.message)?error.message:'CHAIN_VIEW_FAILED')+'\n');process.exitCode=1;});
