import {createNormalBootcampClient} from '/bootcamp-normal-client.mjs';
import {createTestWalletSession} from './session.js';
import {createTestDriver,createTestAutoReader} from './driver.js';
import {testActionAvailability} from './review-window.js';
const el=id=>document.getElementById(id),show=(id,v)=>{el(id).textContent=typeof v==='string'?v:JSON.stringify(v,null,2);};
const localPage=location.protocol==='https:'&&location.hostname==='127.0.0.1';
let driver,reader,lastApprovalKey=null;
const session=createTestWalletSession({origin:location.origin,provider:globalThis.ethereum,onEnd:()=>{void driver?.end();show('status','지갑/세션이 종료되었습니다. 실행을 중지하고 본부에 확인하세요.');}});
function render(s){
 if(!localPage){show('status','이 페이지는 제공된 로컬 HTTPS 출처에서만 사용합니다.');for(const b of document.querySelectorAll('button'))b.disabled=true;return;}
 const active=s.config?.phase==='ACTIVE_LOCAL_TEST',logged=!!s.identity,participant=s.bootstrap?.role==='PARTICIPANT',bound=!!s.bootstrap?.applicationId,ready=!!s.view;
 for(const b of document.querySelectorAll('button'))b.disabled=s.busy||s.ended;
 const allow=(id,ok)=>{el(id).disabled=s.busy||s.ended||!ok;};
 allow('network',active&&!logged);allow('login',active&&!logged);allow('refresh',logged);allow('create',participant&&!s.applicationId);allow('bind',participant&&!!s.applicationId&&!bound);
 allow('approval-read',participant&&bound);allow('sign',participant&&!!s.approval);allow('withdraw',ready&&!s.consentReplayPending);
 allow('replay',logged&&s.consentReplayPending);allow('operation',logged&&!!s.operationId);allow('receipt-read',logged&&bound);el('cancel').disabled=!s.busy;el('end').disabled=s.ended;
 show('status',s.error?`${s.error.code} / ${s.error.outcome} — ${s.error.outcome==='UNKNOWN'?'쓰기 결과가 미확인입니다. 자동 재전송하지 않습니다.':'확인이 실패했습니다. 상태를 다시 읽고 본부에 확인하세요.'}`:s.ended?'시험 페이지 종료':s.busy?'명시한 작업 처리 중':active?'실제 TEST 호스트 활성 / 각 단계는 직접 클릭':'준비 상태: 로그인·신청·서명·동의 차단');
 show('config',s.config?{phase:s.config.phase,origin:s.config.origin,chainId:s.config.chainId,network:s.config.network??null}:null);
 show('identity',{identity:s.identity,role:s.bootstrap?.role??null,applicationId:s.applicationId,boundApplicationId:s.bootstrap?.applicationId??null,procedureReady:s.bootstrap?.procedureReady??false});
 const rows=s.view?.criteria??s.operations?.evidence?.criteria??[];show('conditions',{sourceMode:s.config?.sourceMode??null,criteria:rows.map(r=>({criterionId:r.criterionId,state:r.state,current:r.current,sourceAccessUntil:r.expiresAt??null})),sourceValidUntilExclusive:s.view?.sourceValidUntilExclusive??null,conditionsStatus:s.view?.decision.conditionsStatus??s.operations?.evidence?.conditionsStatus??null});
 show('target',s.view?{target:s.view.target,procedure:s.view.procedure,consent:s.view.consent,funding:s.view.funding,acceptedRight:s.view.payment.acceptedRight}:null);
 const window=s.reviewWindow;
 show('review-window',s.reviewStopped?'검토를 시작할 잔여시간이 부족합니다. 이번 실행은 중단하고 본부에 확인하세요.':
  s.consentTargetChanged?'신청·판정 또는 지급 대상이 바뀌었습니다. 이전 선택을 옮기지 않았습니다. 수동으로 최신 판정을 읽고 다시 검토하세요.':
  window&&s.bootstrap?.phase==='AWAITING_AUTHENTICATED_APP_CONSENTS'?`원천·검토 중 빠른 만료까지 ${Math.max(0,Math.floor(window.remainingMs/1000))}초. 동의 조작 여유 ${Math.max(0,Math.floor(window.reviewMs/1000))}초. 30초 이하는 동의 진행을 중단합니다. 지급 완료를 보장하는 시간은 아닙니다.`:
  `로그인 뒤 두 화면에서 자동 읽기를 유지하세요. 현재 단계: ${s.bootstrap?.phase??'준비 중'}`);
 show('review-summary',s.view?{applicationId:s.view.applicationId,decisionId:s.view.decision.id,decisionHash:s.view.decision.hash,
  recipient:s.bootstrap?.expectedPayment?.recipient,token:s.bootstrap?.expectedPayment?.token,amount:'100 TEST',eachRoleMustConsentDirectly:true}:null);
 const a=s.bootstrap?.aiApproval,approvalRemaining=s.aiApprovalRemainingMs,key=a?JSON.stringify([a.applicationId,a.bodySha256,a.planHash,a.contextHash,a.runBindingHash,a.model]):null;
 if(key!==lastApprovalKey){el('ai-ack').checked=false;lastApprovalKey=key;}
 const displayA=a&&a.status==='WAITING'&&approvalRemaining<0?{...a,status:'INSUFFICIENT_REVIEW_WINDOW'}:a;
 show('ai-approval',displayA?{...displayA,statusLabel:({WAITING:'이번 입력의 명시적 승인 대기',RECORDED:'정식 승인 기록 완료',PARTIAL_STOPPED:'일부 기록만 남아 중단됨 · 본부 확인',INSUFFICIENT_REVIEW_WINDOW:'검토시간 부족으로 승인 중단'})[displayA.status]??displayA.status}:'이번 입력의 AI 승인자료를 기다립니다. 승인 지갑 사전 지정이 없으면 이 화면은 승인할 수 없습니다.');
 show('ai-window',a?`검토 시간을 남기기 위한 AI 승인 가능시간 ${Math.max(0,Math.floor(approvalRemaining/1000))}초. 원천 만료는 연장되지 않습니다. 지정 승인 지갑: ${a.approvalWallet??'미지정'}.`:'');
 const available=testActionAvailability(s,{ack:el('ai-ack').checked,readerEnabled:reader?.enabled??true,visible:document.visibilityState==='visible'});
 allow('ai-approve',available.ai.enabled);allow('agree',available.consent.enabled);
 show('ai-reason',available.ai.reason);show('consent-reason',available.consent.reason);
 el('live-read').checked=reader?.enabled??true;
 show('approval',s.approval?{purpose:s.approval.purpose,expiresAt:s.approval.expiresAt,message:s.approval.message}:null);
 const r=s.receipt;show('receipt',r?{result:r.claim.state==='INCLUDED'?'100 TEST 수령 검증 / INCLUDED, 최종 확정 아님':'수령 미확인',expectedPayment:r.expectedPayment,currentDecision:r.currentDecision,acceptedTarget:r.acceptedTarget,accept:r.accept,claim:r.claim,balance:r.balance}:null);
 reader?.sync();
}
driver=createTestDriver({session,createNormalClient:createNormalBootcampClient,elapsedNow:()=>performance.now(),changed:render});
reader=createTestAutoReader({driver,visible:()=>document.visibilityState==='visible'});
el('live-read').addEventListener('change',()=>reader.setEnabled(el('live-read').checked));
document.addEventListener('visibilitychange',()=>reader.sync());
el('ai-ack').addEventListener('change',()=>render(driver.snapshot()));
el('ai-approve').addEventListener('click',event=>{if(event.isTrusted&&el('ai-ack').checked)void driver.approveAi().catch(()=>{});});
if(localPage)setInterval(()=>render(driver.snapshot()),1000);
for(const [id,action]of Object.entries({'config-read':()=>driver.config(),network:()=>driver.network(),login:()=>driver.login(),refresh:()=>driver.refresh(),create:()=>driver.create(),bind:()=>driver.bind(),
 'approval-read':()=>driver.approval(),sign:()=>driver.sign(),agree:()=>driver.consent('AGREE'),withdraw:()=>driver.consent('WITHDRAW'),replay:()=>driver.replayConsent(),operation:()=>driver.operation(),
 'receipt-read':()=>driver.receipt(),cancel:()=>driver.cancel(),end:async()=>{const result=await driver.end();show('status',`시험 종료: ${result??'종료됨'}. 로그아웃 미확인은 본부에 확인하세요.`);}}))el(id).addEventListener('click',()=>{Promise.resolve().then(action).catch(()=>{});});
if(location.protocol!=='https:'||location.hostname!=='127.0.0.1'){show('status','이 페이지는 제공된 로컬 HTTPS 출처에서만 사용합니다.');for(const b of document.querySelectorAll('button'))b.disabled=true;}
else void driver.config().catch(()=>{});
