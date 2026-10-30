// 검토 창과 버튼 게이트 — **백엔드 제공본 복사**
//
// 원본   tools/bootcamp/test-client/review-window.js
// 출처   origin/develop @ 3374c383e585f26ea712911ac6be5b6ac44c0a56 (2026-10-24)
// 복사   2026-10-28
//
// ── 왜 복사하나 ─────────────────────────────────────────────────────────
//
// 이 파일은 시험 화면(tools/bootcamp/test-client)에 있고 브라우저로 제공되지
// 않는다. 그런데 **두 버튼(AI 승인·지급 동의)이 언제 눌리는지**를 정하는
// 규칙이 여기 다 있다. 우리가 손으로 옮겨 적으면 반드시 어긋난다 — 조건이
// AI 쪽 10개, 동의 쪽 9개다.
//
// 그래서 **그대로 복사하고 출처 커밋을 박는다.** 원본이 바뀌면 대조해서
// 다시 복사한다. fixtures/bootcamp.js 와 같은 방법이다.
//
// 오규원 지침: "driver.js 의 approveAi 를 기준으로 … 응답 검증을 그대로
// 대조해", "역할별 다음 행동·처리 중·비활성·실패 이유를 보여줘".
// testActionAvailability 가 바로 그 `{enabled, code, reason}` 을 돌려준다.
//
// **한 줄도 고치지 않는다.** 고쳐야 할 것이 있으면 통합 담당과 상의한다.
//
//@@ 아래부터 원본 — 손대지 않는다

// Test-host operating budget, not a source TTL, payment term or human time limit.
// 240 = 95 acquisition/approval + 30 processing + 5 first read + 80 review + 30 reserve.
export const REVIEW_WINDOW = Object.freeze({
  minimumHumanReviewSeconds:80,
  settlementReserveSeconds:30,
  firstDisplaySeconds:110,
  openingSeconds:115,
  beforeModelSeconds:145,
  readersFreshSeconds:5,
  pollMs:1000,
});

export function displayedReviewWindow(view,{nowMs,readStartedAtMs}={}){
  const dates=[view?.procedure?.reviewCapAt,view?.sourceValidUntilExclusive];
  if(!dates.every(Number.isSafeInteger)||!Number.isSafeInteger(view?.observedAt)
    ||!Number.isFinite(nowMs)||!Number.isFinite(readStartedAtMs)||nowMs<readStartedAtMs)return null;
  // Charge the entire read round trip. A timer never creates a new observation.
  const deadline=Math.min(...dates),remainingMs=(deadline-view.observedAt)*1000-(nowMs-readStartedAtMs);
  return {deadline,remainingMs,reviewMs:Math.max(0,remainingMs-REVIEW_WINDOW.settlementReserveSeconds*1000)};
}


// These are the same gates used by the two buttons; no action is performed here.
export function testActionAvailability(s,{ack=false,readerEnabled=true,visible=true}={}){
 const no=(code,reason)=>({enabled:false,code,reason});
 const yes=reason=>({enabled:true,code:'READY',reason});
 let common;
 if(s.ended)common=no('ENDED','이 시험 화면은 종료됐습니다. 버튼을 다시 누르지 말고 본부에 확인하세요.');
 else if(s.busy)common=no('BUSY','현재 요청을 처리 중입니다. 완료될 때까지 기다리세요.');
 else if(!s.identity)common=no('LOGIN_REQUIRED','먼저 표시한 네트워크에서 본인 지갑으로 로그인하세요.');
 else if(!s.bootstrap?.applicationId)common=no('APPLICATION_REQUIRED','참여자의 신청 생성·원천 세션 결합을 기다리세요.');
 if(common)return {ai:common,consent:common};
 const a=s.bootstrap.aiApproval;
 let ai;
 if(s.aiApprovalUnknown)ai=no('AI_OUTCOME_UNKNOWN','AI 승인 결과가 미확인입니다. 다시 승인하지 말고 본부에 확인하세요.');
 else if(s.error)ai=no('STATE_UNAVAILABLE','현재 서버 상태를 확인하지 못했습니다. 이전 대기 자료는 유효하다고 보지 마세요. 표시된 오류를 본부에 알리고 자동 재시도하지 마세요.');
 else if(s.aiApprovalReceipt||a?.status==='RECORDED')ai=no('AI_RECORDED','이번 입력의 승인이 이미 기록됐습니다. 다시 승인하지 말고 다음 단계를 기다리세요.');
 else if(!a)ai=no('AI_PACKET_WAIT','원천 검증과 이번 정확한 AI 승인 자료 준비를 기다리세요.');
 else if(a.status==='PARTIAL_STOPPED')ai=no('AI_PARTIAL_STOPPED','승인 기록이 일부만 남아 중단됐습니다. 다시 누르지 말고 본부에 확인하세요.');
 else if(a.status==='INSUFFICIENT_REVIEW_WINDOW'||!Number.isFinite(s.aiApprovalRemainingMs)||s.aiApprovalRemainingMs<0)
  ai=no('AI_TIME_INSUFFICIENT','이후 양측 검토시간을 확보할 AI 승인 기한이 지났습니다. 원천 만료 전이어도 이번 실행은 중단합니다.');
 else if(!a.authorityConfigured)ai=no('AI_AUTHORITY_REQUIRED','이 호스트의 비용 승인 지갑 지정이 확인되지 않습니다. 본부에 확인하세요.');
 else if(s.identity.wallet?.toLowerCase()!==a.approvalWallet?.toLowerCase())
  ai=no('AI_WRONG_WALLET','이 지갑은 이번 비용 승인 지갑이 아닙니다. 사전 지정된 운영자 또는 참여자 화면에서 승인하세요. 현재 로그인 지갑을 전환하지 마세요.');
 else if(!a.reviewScreensReady)ai=no('BOTH_READERS_REQUIRED',!visible||!readerEnabled
  ?'이 화면을 보이는 상태로 열고 자동 읽기를 켜세요. 반대쪽 화면도 같은 상태로 유지해야 합니다.'
  :'반대쪽 화면도 보이는 상태로 열고 자동 읽기를 켜세요. 양쪽의 최근 상태 읽기를 기다립니다.');
 else if(a.status!=='WAITING'||!a.permitted)ai=no('AI_NOT_PERMITTED','이번 입력의 승인 조건이 확인되지 않습니다. 최신 상태와 표시된 권한·기한을 확인하고 본부에 알리세요.');
 else if(!ack)ai=no('AI_ACK_REQUIRED','이번 입력의 모델·한도·외부 전송·비용 안내를 읽고 확인 체크박스를 선택하세요. 입력이 바뀌면 다시 확인해야 합니다.');
 else ai=yes('이번 정확한 입력을 검토했다면 직접 승인할 수 있습니다. 지급 동의는 별도입니다.');
 let consent;
 if(s.consentReplayPending)consent=no('CONSENT_OUTCOME_UNKNOWN','이전 동의 결과가 미확인입니다. 새 동의를 보내지 말고 같은 요청의 결과 확인을 이용하세요.');
 else if(s.error)consent=no('STATE_UNAVAILABLE','현재 서버 상태를 확인하지 못했습니다. 이전 대기 자료는 유효하다고 보지 마세요. 표시된 오류를 본부에 알리고 자동 재시도하지 마세요.');
 else if(s.consentTargetChanged)consent=no('CONSENT_TARGET_CHANGED','신청·판정 또는 지급 대상이 바뀌었습니다. 최신 판정 읽기를 직접 눌러 다시 검토하세요. 이전 동의는 옮기지 않습니다.');
 else if(s.reviewStopped)consent=no('CONSENT_REVIEW_STOPPED','첫 검토에 필요한 잔여시간이나 현재 판정 조건이 부족해 중단했습니다. 다시 동의하지 말고 본부에 확인하세요.');
 else if(s.bootstrap.phase!=='AWAITING_AUTHENTICATED_APP_CONSENTS')consent=no('CONSENT_PREPARATION_WAIT','원천·AI 검증과 지급 준비가 끝난 뒤 양측 동의가 열립니다. 현재 단계를 기다리세요.');
 else if(!s.view)consent=no('CONSENT_VIEW_REQUIRED','세션·조건·최신 판정 읽기를 눌러 같은 신청의 최신 상태를 확인하세요.');
 else if(s.view.objection?.blocked)consent=no('CONSENT_OBJECTION','해결되지 않은 이의가 있어 동의할 수 없습니다. 본부에 확인하세요.');
 else if(!s.reviewWindow||s.reviewWindow.remainingMs<=REVIEW_WINDOW.settlementReserveSeconds*1000)
  consent=no('CONSENT_TIME_INSUFFICIENT','정산 여유 30초를 남겨야 하므로 새 동의를 중단했습니다. 이번 실행을 재개하지 마세요.');
 else if(!s.canAgree)consent=no('CONSENT_TARGET_NOT_READY','네 조건의 현재 MET·같은 판정·수령자·100 TEST 전액 준비를 확인할 수 없습니다. 최신 상태를 읽고 본부에 확인하세요.');
 else consent=yes('같은 최신 판정·수령자·100 TEST를 검토한 뒤 각 사용자가 직접 동의하세요.');
 return {ai,consent};
}
