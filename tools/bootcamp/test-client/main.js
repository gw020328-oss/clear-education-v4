import {createNormalBootcampClient} from '/bootcamp-normal-client.mjs';
import {createTestWalletSession} from './session.js';
import {createTestDriver} from './driver.js';
const el=id=>document.getElementById(id),show=(id,v)=>{el(id).textContent=typeof v==='string'?v:JSON.stringify(v,null,2);};
let driver;
const session=createTestWalletSession({origin:location.origin,provider:globalThis.ethereum,onEnd:()=>{void driver?.end();show('status','지갑/세션이 종료되었습니다. 실행을 중지하고 본부에 확인하세요.');}});
function render(s){
 const active=s.config?.phase==='ACTIVE_LOCAL_TEST',logged=!!s.identity,participant=s.bootstrap?.role==='PARTICIPANT',bound=!!s.bootstrap?.applicationId,ready=!!s.view;
 for(const b of document.querySelectorAll('button'))b.disabled=s.busy||s.ended;
 const allow=(id,ok)=>{el(id).disabled=s.busy||s.ended||!ok;};
 allow('network',active&&!logged);allow('login',active&&!logged);allow('refresh',logged);allow('create',participant&&!s.applicationId);allow('bind',participant&&!!s.applicationId&&!bound);
 allow('approval-read',participant&&bound);allow('sign',participant&&!!s.approval);allow('agree',ready&&!s.consentReplayPending);allow('withdraw',ready&&!s.consentReplayPending);
 allow('replay',logged&&s.consentReplayPending);allow('operation',logged&&!!s.operationId);allow('receipt-read',logged&&bound);el('cancel').disabled=!s.busy;el('end').disabled=s.ended;
 show('status',s.error?`${s.error.code} / ${s.error.outcome} — 쓰기 결과 미확인은 같은 요청 확인 버튼을 사용하세요.`:s.ended?'시험 페이지 종료':s.busy?'명시한 작업 처리 중':active?'실제 TEST 호스트 활성 / 각 단계는 직접 클릭':'준비 상태: 로그인·신청·서명·동의 차단');
 show('config',s.config?{phase:s.config.phase,origin:s.config.origin,chainId:s.config.chainId,network:s.config.network??null}:null);
 show('identity',{identity:s.identity,role:s.bootstrap?.role??null,applicationId:s.applicationId,boundApplicationId:s.bootstrap?.applicationId??null,procedureReady:s.bootstrap?.procedureReady??false});
 const rows=s.view?.criteria??s.operations?.evidence?.criteria??[];show('conditions',{sourceMode:s.config?.sourceMode??null,criteria:rows.map(r=>({criterionId:r.criterionId,state:r.state,current:r.current,expiresAt:r.expiresAt??null})),conditionsStatus:s.view?.decision.conditionsStatus??s.operations?.evidence?.conditionsStatus??null});
 show('target',s.view?{target:s.view.target,procedure:s.view.procedure,consent:s.view.consent,funding:s.view.funding,acceptedRight:s.view.payment.acceptedRight}:null);
 show('approval',s.approval?{purpose:s.approval.purpose,expiresAt:s.approval.expiresAt,message:s.approval.message}:null);
 const r=s.receipt;show('receipt',r?{result:r.claim.state==='INCLUDED'?'100 TEST 수령 검증 / INCLUDED, 최종 확정 아님':'수령 미확인',expectedPayment:r.expectedPayment,currentDecision:r.currentDecision,acceptedTarget:r.acceptedTarget,accept:r.accept,claim:r.claim,balance:r.balance}:null);
}
driver=createTestDriver({session,createNormalClient:createNormalBootcampClient,changed:render});
for(const [id,action]of Object.entries({'config-read':()=>driver.config(),network:()=>driver.network(),login:()=>driver.login(),refresh:()=>driver.refresh(),create:()=>driver.create(),bind:()=>driver.bind(),
 'approval-read':()=>driver.approval(),sign:()=>driver.sign(),agree:()=>driver.consent('AGREE'),withdraw:()=>driver.consent('WITHDRAW'),replay:()=>driver.replayConsent(),operation:()=>driver.operation(),
 'receipt-read':()=>driver.receipt(),cancel:()=>driver.cancel(),end:async()=>{const result=await driver.end();show('status',`시험 종료: ${result??'종료됨'}. 로그아웃 미확인은 본부에 확인하세요.`);}}))el(id).addEventListener('click',()=>{Promise.resolve().then(action).catch(()=>{});});
if(location.protocol!=='https:'||location.hostname!=='127.0.0.1'){show('status','이 페이지는 제공된 로컬 HTTPS 출처에서만 사용합니다.');for(const b of document.querySelectorAll('button'))b.disabled=true;}
else void driver.config().catch(()=>{});
