# 팀원 프론트 연결 정본 — Claude Code 착수 지침

## 2026-11-03 본선 프론트 인수

팀원은 [본선 병렬 프롬프트](FINALS_FRONTEND_PARALLEL_PROMPT_20261103.ko.md)로 착수한다. 기존 제품 흐름은 A 담당이 PR139에서 검증한다. 아래 복사 본문과 PR 상태는 이전 연결 단계의 이력이다. 최신 기준과 동결 일정은 [본선 계획](CLEAR_MODULE_DELIVERY_PLAN.ko.md)을 따른다.


2026-11-02. 이 문서의 현재 지침과 아래 복사 본문을 사용한다. 이전 버전의 240초 고정 안내·Privy 실제 완주 미확인·정상 완주 직후 새 기능 착수 지시는 당시 기록이며 Git 이력에 보존한다.

## 인수 기준과 소유 범위

- 확인한 develop: `a6372f50bc1e757d724bb064c723d7103ff064e1`. 실행 성공 코드 `7f59697f8086180ab48a3d0852fb7868d42a0e04`는 **PR131 Draft/미병합**이다. develop만 받아 해당 수정까지 있다고 가정하지 않는다.
- PR125도 Draft/OPEN, 확인 HEAD `911be028a79ac669e494dbffb4669bea261176af`. Privy SDK/참고 제품 패널의 선행 인수 이력이다. PR131에는 이 계열 후속이 포함돼 있으므로 통합 담당이 ancestry·최종 CI를 확인해 인수하며 중복 cherry-pick하지 않는다.
- PR60은 OPEN, 확인 HEAD `a0620cd39fe5cd44b62a1deb5806883503242227`. `web/`와 담당자의 최신 로컬 변경은 프론트 담당 소유다. 위 HEAD가 최신 로컬 자산까지 나타낸다는 뜻은 아니다.
- 본부 성공 기록은 [실제 100 TEST 결과](PRIVY_100_TEST_SUCCESS_20261102.ko.md), 연결 추적은 [Issue106](https://github.com/gw020328-oss/clear-education-v4/issues/106)이다. 실행 HEAD와 후속 문서 커밋 `233e9d7`을 구분한다.
- 기존 PR115/116/117/120/123의 V2 등록·S3 조회·S4 근거·호스트 mount 이력과 PR125/131의 후속을 함께 인수한다. 개별 PR의 과거 성공을 현재 팀원 프론트 검증으로 재사용하지 않는다.

실제 성공은 Google Privy 참가자 + MetaMask 운영자, 실제 HackerRank SELF_ATTESTOR_TEST, 생성된 로컬 Moodle 시연 자료, 운영자의 정확 입력 승인 후 실제 Gemini, V2 등록 및 양측 동의로 한 신청의 100 TEST 수령을 확인한 것이다. `INCLUDED/canonical=true/finalized=false`, 공식 hosted·독립 공증·실자산·다른 PC·팀원 프론트 완주와 구분한다. 양측 수령 확인 후 FINISH/정상 종료까지 완료했다.

**이번 범위는 팀원 프론트 연결이다. 새 기능은 연결 실증 완료 후로 보류한다.** 예치 정책은 미확정이다. 이후 공개 모듈·다른 컴퓨터 재현을 진행하고 실자산 판단은 그 이후다.

## Claude Code에 복사할 본문

```text
CLEAR 기존 팀원 프론트에 현재 검증된 한 신청의 전체 흐름을 연결해줘. docs/current/BOOTCAMP_FRONTEND_CLAUDE_PROMPT.ko.md가 정본이고 PRIVY_100_TEST_SUCCESS_20261102.ko.md가 실제 시험 근거야. 작업 시작 때 원격 develop/PR125/PR131/PR60과 네 로컬 변경을 다시 확인하고 HEAD·미병합 상태를 보고해. 문서에 적힌 develop a6372f5와 성공 실행 코드 7f59697을 같은 것으로 취급하지 마. PR131은 아직 Draft야. 통합 담당과 승인된 의존 코드 인수 순서를 확인하고 기존 web/·로컬 변경·미추적 파일을 보존해. 중복 cherry-pick/강제 푸시/자동 merge를 하지 마.

이번에는 화면/API 연결만 진행해. 새 정책/반/LMS/조건 초안·도구 계획/재수집·AI 재실행/이의 쓰기·평가/독립 청구/충전/AA·Paymaster/대시보드 확장은 보류야. 예치 정책을 확정하거나 기존 조건·금액·만료·재사용 방지를 변경하지 마. 백엔드/컨트랙트/수집기 변경이 필요하면 통합 담당에게 필요한 계약을 구체적으로 알려줘.

연결 순서:
1. 참가자는 기존 Google Privy 내장 EOA, 운영자는 명시 지정 MetaMask 주소로 각각 제품 SIWE 로그인한다. 서로 다른 주소와 분리된 브라우저 프로필/쿠키 저장소를 사용한다.
2. 참가자만 새 신청을 명시 생성하고 원천 세션을 결합한다. 운영자는 같은 서버 session.applicationId를 조회한다.
3. 참가자가 이번 원천 요청의 정확한 message/owner·신청·정책·nonce·만료를 확인해 직접 원천 승인 서명한다.
4. 운영자가 이번 회고 입력·모델·외부 전송·비용·호출 한도를 검토하고 1회 AI 승인을 한다. 실제 AI 응답과 네 조건의 현재 MET를 확인한다.
5. 참가자가 별도 V2 수령인 등록 공개 안내를 확인하고 EIP-712 서명한다. 서버 접수와 canonical 체인 등록을 구분한다.
6. 재원 배정/검토 준비 후 각 역할이 같은 최신 판정 ID/revision/hash·수령인·100 TEST를 검토하고 각각 AGREE한다.
7. 서버 PREPARE→ACCEPT→별도 claim 상태를 조회하고 양쪽 화면에서 exact 영수증을 확인한다. 사용자의 수령 확인 후 본부 FINISH로 종료한다.

원천 서명, 운영자 AI 승인, 수령인 등록 서명, 양측 지급 동의는 별개 동작이야. 어느 하나를 다른 승인으로 재사용하지 마. AI는 지급 권한을 갖지 않아. participantWallet, proof의 임시 expectedClaimOwner, 수령인은 각각의 문맥에서 검증해. 학생 개인키를 서버로 보내지 마. 지갑/계정/체인 전환으로 기존 신청이나 수령인을 자동 치환하지 마.

기존 라우팅·디자인·빌드와 adapter를 재사용해. 참고 구현은 src/embedded-wallet/product-session.mjs, approvals.mjs, product-panel.jsx, src/bootcamp/normal-client.mjs, tools/bootcamp/frontend-server.mjs, tools/bootcamp/test-client/driver.js 및 review-window.js야. PR60 기준은 정적 web/이고 bare ethers import를 그대로 브라우저로 가져올 수 없어. 최신 작업본의 실제 빌드 구성을 먼저 확인해. Privy 설치가 필요하면 고정 lock + --ignore-scripts 설치 후 tools/embedded-wallet/reviewed-dependencies.mjs --apply 절차를 따르고 임의 SDK 업그레이드는 하지 마.

준비 host /__dev/config의 PREPARED_NOT_ACTIVATED에서는 로그인·신청·서명·동의 버튼을 비활성화하고 이유를 표시해. ACTIVE_LOCAL_TEST의 새 chainId/network/instance를 읽어야 해. 과거 포트/체인/주소를 복사하지 마. 네트워크 선택은 사용자 동작이고 TEST6과 가스 ETH18을 구분해.

같은 출처 /bootcamp-normal-client.mjs의 createNormalBootcampClient에 인증 request adapter를 연결해. Secure HttpOnly cookie, credentials same-origin, wallet/chain 헤더, 쓰기 CSRF, redirect 거부·취소·timeout을 유지해. GET의 Origin/Sec-Fetch-Site는 브라우저 규칙을 따라. src/application/api-client.mjs의 현행 checkpoint 예외/고정 오류 처리를 인수하고 쿼리를 임의 확장하지 마. Bootcamp {error:CODE}를 제한된 코드로 보존하며 비2xx/null/불명 상태를 성공으로 바꾸지 마.

api.session()은 GET /bootcamp/v4/session이야. role=PARTICIPANT/OPERATOR, 결합 전 applicationId=null을 존중해. query/body로 역할이나 신청을 선택하지 마. 참가자의 POST /bootcamp/v1/applications는 빈 본문과 사용자 동작 멱등 키를 사용하고 record.applicationId로 bindSourceSession(app)해. 운영자는 신청을 새로 만들지 않아. procedureReady=false 또는 BC_NORMAL_PROCEDURE_NOT_READY 동안은 기존 operations 조회로 준비 상태를 표시해.

원천은 pendingSourceSignature(app)의 packet을 검토하고 personal_sign → submitSourceSignature(app,packet,signature)로 제출해. AI는 session.aiApproval과 driver.approveAi의 정확한 POST /bootcamp/v4/applications/:app/reflection-approval 계약을 인수해. version/applicationId/bodySha256/planHash/contextHash/runBindingHash/codeHead/model/action/costAcknowledgment를 대조해. normal-client에 없는 메서드를 만들어 가정하지 마. 결과 불명은 확인 필요로 표시하고 새 승인·유료 호출을 자동 생성하지 마.

V2 등록은 api.recipientRegistration(app), api.submitRecipientRegistration(app,packet,signature,{idempotencyKey,signal})야. PARTICIPANT + AWAITING_SIGNATURE에서만 직접 서명하고 운영자는 조회만 해. application/revision/ledgerSequence/decision/hash/registrationTargetId와 domain/types/message·nonce·원래 deadline을 유지해. calldataPublic=true의 공개 안내를 서명 전에 보여줘. signingContext.registration을 독립 대조해. PR131 product-session/approvals의 서명 전후 checkpoint 고정 GET(단일 encoded checkpoint)과 canonical 조상 검사를 함께 인수해. UI에서 packet을 조립하거나 query를 삭제하지 마. POST body는 서버 CAS/registrationTargetId/signature만 사용해. SIGNED/signatureAccepted는 접수이고 chainStatus=INCLUDED/canonical=true/checkpoint/registrationSequence는 체인 관측이야. 등록 순서를 서버 접수 순서로 표현하지 마. 응답 유실 시 자동 재서명/재전송하지 않고 기존 조회·멱등 계약으로 확인해.

api.view(app), api.reviewChain(app), api.decisionEvidence(app,{decisionId})로 현재 판정·당시 저장 근거·체인 반영을 구분해. S4 manifest의 판정 ID/revision/hash를 화면과 대조해. sourceCurrentness=UNKNOWN/UNAVAILABLE/null을 유지하고 과거 MET나 proof 해시만으로 현재 유효성·독립 공증을 주장하지 마. 원문 HTTP나 이의 POST 등 미노출 API를 가정하지 마. 자체 공증이면 selfAttestor 표시를 session과 영수증에 유지하고 공식 hosted 성공·독립 공증이라고 쓰지 마.

양 역할이 같은 최신 target을 직접 검토한 뒤 api.consent(app,view,'AGREE',{idempotencyKey})해. 다른 역할의 동의로 ledger가 바뀌면 재조회하고 변경된 대상은 다시 확인받아. 자동 동의나 POST 자동 재시도는 추가하지 마. busy GET polling 때문에 사용자의 클릭이 조용히 사라지지 않게 처리 중·비활성 사유를 명시해.

시간은 세 종류를 별도로 보여줘. 현재 정상 source sequence는 최대900초 원천 창을 사용하지만 각 원천/증명/lease의 더 짧은 실제 만료가 우선이야. 검토는 최초 시작부터600초 상한이고 갱신으로 시작 시각을 초기화하지 않아. AI 승인에는 별도 approvalWindowEndsAtMs가 있고 현재 준비에서 min(준비 시각+300초, 원천 만료-145초)로 제한돼. 이 숫자를 프론트에서 새 만료를 발행하는 데 쓰지 말고 서버 packet/상태와 현재 driver를 따르도록 해. 과거240초를 현행 TTL로 하드코딩하지 마.

검토 표시에는 review-window.js의 min(procedure.reviewCapAt, sourceValidUntilExclusive), observedAt와 요청 시작부터의 경과 시간을 반영해. null/오래된 관측이면 남은 시간을 계산할 수 없음으로 표시해. opening115초/첫 표시110초/검토 예산80초/정산 여유30초는 시험 운영 여유이며 지급 약관이나 원천 TTL이 아니야. 브라우저 타이머가 서버 기한을 늘릴 수 없어. 원천이 남아도 AI 승인/양측 검토 여유가 부족하면 중단될 수 있어.

비활성 사유는 로그인 필요/신청 결합 대기/처리 중/현재 조회 실패/AI 승인 지갑 불일치/양쪽 화면 최근 조회 필요/입력 확인 체크 필요/AI 승인 기록됨·결과 미확인/검토시간 부족/판정 변경/이의 차단/미해결 실패/종료를 구분해. testActionAvailability와 서버 거부 코드가 근거야. 두 화면의 최근 읽기는 동의가 아니야. 화면을 열거나 polling한 사실로 AGREE를 만들지 마.

새로고침·뒤로가기·탭 종료는 메모리 인증/검토 packet을 잃을 수 있어. Privy가 같은 주소를 복원하는 것과 제품 SIWE 및 진행 packet 복구는 별개야. 세션 토큰/서명/원문/proof를 localStorage·로그로 영속화하지 마. 자동 재로그인/새 신청/원천 재수집/유료 재호출로 복구하지 말고 기존 서버 상태와 복구 가능 여부를 표시해. 계정/체인 변경·disconnect는 이전 세션 문맥으로 서버 logout/revoke를 시도하고 진행 요청과 메모리를 정리해. 성공 receipt 조회와 복구는 쓰기 지급을 유발하지 않아야 해.

api.paymentReceipt(app)에서 예상100 TEST, 배정, ACCEPT, claim 전송, 수령을 구분해. 수령 완료는 claim.state=INCLUDED, claim.canonical=true, claim.transferAmountAtoms='100000000', balance.receivedAtoms='100000000', balance.exactExpectedAmountVerified=true와 신청·수령인·token·acceptedTarget 결합을 확인해. decimals=6이므로100 TEST야. finalized=false는 최종 확정으로 표시하지 마. measurement가 실제 잔액 증가인지 canonical Transfer 관측인지도 보존해. null/READBACK_UNAVAILABLE/NOT_OBSERVED는 확인 필요야. duplicateRejected는 서버 근거가 있을 때만 표시하고 브라우저에서 중복 청구를 시험하지 마. 이미 수락된 권리를 원천/등록 packet의 만료와 함께 소멸한 것으로 표시하지 마.

프론트 구현 뒤 현재 작업본의 빌드/검사를 실행해. PR60 정적 기준은 ./tools/node --test web/tests/*.test.mjs이고 별도 build가 없었으니 현재 구성에 맞게 확인해. 준비/취소/만료, GET과 클릭 충돌, AI 권한/기한, 등록 전후 checkpoint, 오래된 동의 대상, 새로고침, receipt null/성공을 합성으로 검사해. 프론트 커밋·검사 결과·web 절대 경로·공개 자산 digest/변경·adapter·fixture와 실제 API 확인 범위·미완료 사유를 Issue106에 인계해. 본부가 자산을 인수한 뒤 사용자와 팀원 프론트 실제 완주를 조율해. 실제 로그인·유료 호출·새 실행을 지금 시작하지 마. 제품 프론트 실증 전 Issue106을 닫지 마. 새 기능은 그 이후야.
```
