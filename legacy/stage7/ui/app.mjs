/* global ethers */
import {createValidation} from '/shared/validation.mjs';
import {createClaimCore} from '/shared/claim-core.mjs';
import {waitForFinalReceipt,normalizeWalletError} from '/shared/wallet-flow.mjs';
const $=id=>document.getElementById(id),V=createValidation(ethers),core=createClaimCore(ethers);
const cfg=await(await fetch('/config.json')).json(),manifest=V.validateTrust(await(await fetch('/manifest.json')).json()),onchain=cfg.rail==='onchain';
let packet=null,checked=false,signer=null,provider=null,walletProvider=null,epoch=0,busy=false,actions=[];
function action(name){actions.push(name)}
function clear(){epoch++;checked=false;signer=null;walletProvider=null;$('result').textContent='아직 청구하지 않았습니다.';$('result').className='';$('receipt').textContent='';$('claim').disabled=true;$('verify-status').textContent='조건·준비금을 다시 확인하세요.';$('wallet-status').textContent='지갑을 다시 확인하세요.';update();}
function update(){$('verify').disabled=!packet||busy;$('claim').disabled=!checked||(onchain&&!signer)||busy;$('remaining').textContent=$('result').className==='success'?'환급 완료 · 추가 청구가 필요하지 않습니다.':checked?(onchain&&!signer?'지갑 연결·가스 확인이 남았습니다.':'50 TEST · 파일의 고정 수령자에게 지급합니다.'):'파일·조건·준비금 확인이 남았습니다.';}
const errors={COUNT:'증빙 4개가 모두 필요합니다.',DUPLICATE:'중복 제출 번호가 있습니다.',EXPIRED:'청구 기한이 지났습니다.',ISSUER_SIGNATURE:'발급자 서명이 유효하지 않습니다.',CONSENT_SCOPE:'수령자와 동의가 일치하지 않습니다.',SIGNATURE_FORMAT:'서명 형식이 유효하지 않습니다.',CENTRAL_NOT_CLAIMABLE:'미등록 또는 이미 지급된 증빙입니다.',NOT_CLAIMABLE:'미등록 또는 이미 지급된 증빙입니다.',CENTRAL_RESERVE:'전액 준비금이 부족합니다.',RESERVE_NOT_CONFIRMED:'전액 준비금이 부족합니다.',INSUFFICIENT_GAS:'예상 거래비용보다 가스 잔액이 부족합니다. 다른 전달 지갑을 사용할 수 있습니다.',DEPLOYMENT_MISMATCH:'접속 경로의 배포가 신뢰 명세와 다릅니다.',ACTION_REJECTED:'지갑 승인을 거절했습니다. 다시 시도할 수 있습니다.',WALLET_CHANGED:'계정·네트워크가 바뀌었습니다. 다시 검증하세요.',FILE_TOO_LARGE:'64KB 이하 파일만 사용할 수 있습니다.'};
function error(e){const code=normalizeWalletError(e)?.code||e.message||'CONNECTION';$('result').className='error';$('result').textContent=(errors[code]||'연결·증빙·지급 상태를 확인하지 못했습니다. 대체 접속 안내를 확인하세요.')+' ['+code+']';}
async function api(path,body){const endpoint=new URL($('endpoint').value);V.need(endpoint.origin===new URL(cfg.endpoint).origin,'ENDPOINT_CHANGED');const r=await fetch(endpoint.origin+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});const v=await r.json();V.need(r.ok,v.code||'CONNECTION');return v;}
$('rail').textContent=onchain?'온체인 금고':'독립 중앙 에스크로';$('unit').textContent=onchain?'무가치 TEST 토큰 지급':'중앙 모의 원장 50 TEST 상당 지급 · 은행 송금 아님';$('deadline').textContent='청구 기한 '+new Date(manifest.terms.claimUntil*1000).toISOString()+' (해당 초 포함)';
$('endpoint').value=cfg.endpoint;$('endpoint-label').textContent=onchain?'로컬 RPC 주소':'독립 실행자 주소';$('wallet-section').hidden=!onchain;$('demo').hidden=!cfg.demoMode;$('demo-wallet').hidden=!cfg.demoMode;$('cli').textContent=cfg.cli;
$('dependency').textContent=onchain?'CLI에도 지갑·가스·정상 체인/RPC·신뢰 manifest가 필요합니다. 수령자와 전달자는 다를 수 있습니다.':'CLI도 독립 실행자·원장이 정상이어야 합니다. 새 로그인·지갑·가스·RPC는 필요하지 않습니다.';
$('trust').textContent=onchain?'기본 계약·토큰에는 조기 회수·동결·조건 변경 관리 함수가 없습니다. 고정 설정 오류와 키 유실 복구도 어렵습니다.':'중앙 실행자는 학교 승인 없이 자동 지급합니다. 운영자는 코드·DB·지급 실행을 통제하며, 장애 복구도 운영자의 책임입니다.';
async function load(text){clear();packet=null;const p=V.parseEvidenceText(text);V.validateEvidence(p,manifest,p.recipient,manifest.terms.claimUntil);packet=p;$('file-status').textContent='파일 구조·동의·4개 서명 확인';$('recipient').textContent='고정 수령자 '+p.recipient;update();}
$('file').onchange=async e=>{action('file-select');clear();packet=null;try{const file=e.target.files[0];V.need(file&&file.size<=65536,'FILE_TOO_LARGE');await load(await file.text())}catch(e){error(e);update()}};
$('demo').onclick=async()=>{action('demo-file');try{await load(await(await fetch('/demo-evidence.json')).text())}catch(e){error(e)}};
$('endpoint').oninput=()=>{action('endpoint-change');clear()};
$('verify').onclick=async()=>{action('verify');clear();const version=epoch;busy=true;update();try{
  if(onchain){V.need(new URL($('endpoint').value).origin===new URL(cfg.endpoint).origin,'ENDPOINT_CHANGED');provider=new ethers.JsonRpcProvider(cfg.endpoint,undefined,{cacheTimeout:-1});await core.inspectClaim(provider,manifest,packet)}
  else await api('/inspect',packet);
  V.need(version===epoch,'WALLET_CHANGED');checked=true;$('verify-status').textContent='조건·기한·동의·미지급 상태·50 TEST 준비금 확인';
}catch(e){error(e)}finally{busy=false;update()}};
async function wallet(demo){action(demo?'demo-wallet':'browser-wallet');const version=epoch;try{
  V.need(checked,'VERIFY_FIRST');const p=demo?provider:new ethers.BrowserProvider(window.ethereum,undefined,{cacheTimeout:-1});
  if(!demo)await p.send('eth_requestAccounts',[]);
  const s=await p.getSigner(demo?cfg.demoSender:undefined);await core.verifyDeployment(provider,manifest);const d=await core.verifyDeployment(p,manifest);await core.estimateCost(d.vault,s,packet,await s.getAddress());V.need(version===epoch,'WALLET_CHANGED');signer=s;walletProvider=p;$('wallet-status').textContent='전달 지갑·동일 배포·예상 가스비 확인';update();
}catch(e){error(e)}}
$('wallet').onclick=()=>wallet(false);$('demo-wallet').onclick=()=>wallet(true);
if(window.ethereum?.on)for(const e of ['accountsChanged','chainChanged','disconnect'])window.ethereum.on(e,()=>clear());
$('claim').onclick=async()=>{action('claim');const version=epoch;busy=true;update();const started=performance.now();try{
  let receipt;
  if(onchain){
    await core.inspectClaim(provider,manifest,packet);const c=await core.inspectClaim(walletProvider,manifest,packet);const sender=await signer.getAddress();V.need((await walletProvider.send('eth_accounts',[])).map(ethers.getAddress).includes(ethers.getAddress(sender)),'WALLET_CHANGED');await core.estimateCost(c.vault,signer,packet,sender);V.need(version===epoch,'WALLET_CHANGED');
    $('result').textContent='지갑 승인 대기 · 아직 접수되지 않았습니다.';const tx=await c.vault.connect(signer).claim(...core.args(packet));$('result').textContent='거래 접수 · 채굴·지급 확인 중';receipt=await core.verifyPaidReceipt(walletProvider,manifest,packet,sender,await waitForFinalReceipt(tx));
  }else{
    $('result').textContent='청구 전송 중 · 아직 지급 확인 전';const r=await api('/claim',packet);$('result').textContent='청구 접수 · 영속 원장 지급 확인 중';const s=await api('/status?recipient='+packet.recipient);V.need(s.settled&&s.paidUnits==='50000000'&&s.reserveUnits==='0','PAYMENT_NOT_CONFIRMED');receipt={receiptId:r.receiptId,paidUnits:s.paidUnits,settled:s.settled};
  }
  V.need(version===epoch,'WALLET_CHANGED');$('result').className='success';$('result').textContent=onchain?'지급 완료 · 50 TEST 토큰 전송 확인':'지급 완료 · 모의 원장 50 TEST 상당 기록 확인';
  $('receipt').textContent=JSON.stringify({...receipt,localRequestToConfirmedMs:performance.now()-started,observedActionTrace:actions,userStudy:false},null,2);checked=false;
}catch(e){if(version===epoch)error(e)}finally{busy=false;update()}};
