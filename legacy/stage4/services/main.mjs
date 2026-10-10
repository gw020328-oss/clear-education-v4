import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Wallet, JsonRpcProvider } from 'ethers';
import { acceptTerms, makeEvidence, validateTrust } from '../../stage2/lib/evidence.mjs';
import { chainTime, enrollFunded } from '../../stage2/lib/chain.mjs';

const port=Number(process.env.MAIN_PORT ?? 4300), chainUrl=process.env.CHAIN_URL, issuerUrl=process.env.ISSUER_URL;
const trusted=validateTrust(JSON.parse(await readFile(process.env.MANIFEST_PATH,'utf8')));
const learner=new Wallet(process.env.LEARNER_KEY), sponsorWallet=new Wallet(process.env.SPONSOR_KEY);
const provider=new JsonRpcProvider(chainUrl, undefined, { cacheTimeout: -1 });
let evidence=null;
async function prepare() {
  if (evidence) return evidence;
  const at=await chainTime(provider);
  const acceptance=await acceptTerms(trusted, learner, at, trusted.termsHash);
  await enrollFunded(provider, trusted, sponsorWallet.connect(provider), acceptance, learner.address);
  const response=await fetch(`${issuerUrl}/issue-all`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({learner:learner.address}) });
  if(!response.ok) throw new Error('ISSUER_UNAVAILABLE');
  evidence=makeEvidence(trusted, acceptance, (await response.json()).submissions);
  return evidence;
}
const page=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주 서비스 — 증빙 보관</title><style>body{font-family:-apple-system,sans-serif;background:#f5f2ea;color:#17231d;margin:0;padding:40px}main{max-width:680px;margin:auto;background:#fffef9;padding:34px;border-radius:20px}h1{font-size:30px}button,a{display:inline-block;border:0;border-radius:10px;padding:14px 18px;background:#1d6a4b;color:white;font-weight:800;text-decoration:none;cursor:pointer}small{display:block;color:#687069;margin-top:16px}</style><main><p>주 서비스 · 로컬 시연</p><h1>증빙을 미리 보관하세요</h1><p>독립 청구 화면에서 사용할 환급 증빙 파일입니다.</p><button id="prepare">조건 동의·예치·증빙 준비</button> <a id="download" href="/evidence" download="refund-evidence.v1.json" hidden>증빙 파일 다운로드</a><small id="status">발급 서버가 켜져 있을 때만 새 증빙을 만들 수 있습니다.</small><script>prepare.onclick=async()=>{prepare.disabled=true;status.textContent='준비 중…';try{const r=await fetch('/prepare',{method:'POST'});if(!r.ok)throw 0;prepare.hidden=true;download.hidden=false;status.textContent='증빙 준비 완료 · 지금 파일을 내려받으세요.'}catch{status.textContent='준비하지 못했습니다.'}}</script></main></html>`;
const send=(res,status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store'});res.end(typeof value==='string'?value:JSON.stringify(value));};
const server=createServer(async(req,res)=>{try{
  if(req.method==='GET'&&req.url==='/')return send(res,200,page,'text/html');
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,service:'main',prepared:Boolean(evidence)});
  if(req.method==='POST'&&req.url==='/prepare'){await prepare();return send(res,200,{ok:true});}
  if(req.method==='GET'&&req.url==='/evidence'){const value=JSON.stringify(await prepare(),null,2)+'\n';res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="refund-evidence.v1.json"','Cache-Control':'no-store'});return res.end(value);}
  send(res,404,{ok:false,code:'NOT_FOUND'});
}catch{send(res,503,{ok:false,code:'MAIN_PREPARE_FAILED'});}});
server.listen(port,'127.0.0.1',()=>process.send?.({type:'ready',service:'main',port}));
const stop=()=>server.close(async()=>{await provider.destroy();process.exit(0)});process.on('SIGTERM',stop);process.on('SIGINT',stop);
