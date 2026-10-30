# 서준형 Claude Code 복사 지침

2026-10-30 우선순위: [현행 계획의 조건 초안 시연·코드 공백·D0–D2](BOOTCAMP_PRODUCT_CONNECTION_PLAN.ko.md)를 우선한다. **Privy 참가자·MetaMask 운영자의 새 정상100 TEST 완주가 먼저**다. 이후 한 가상 Python 반의 개설 전 초안 변경/도구 계획과 기존 판정 근거 표시를 작게 연결한다. 이번은 문서 인계이며 후속 구현·유료 호출을 지금 시작하는 지시가 아니다. SDK 검토 결과는 [별도 기록](SDK_DEPENDENCY_REVIEW_20261030.ko.md)을 따른다. 기존 `web/`/PR60과 로컬 자산을 보존한다.

2026-10-29 현행 인계: 참가자 Privy 내장 EOA·운영자 MetaMask의 정상100 TEST 완주가 우선이다. PR125 독립 제품 패널은 구현됐지만 미병합이며 팀원 최신 web/ 인수와 실제 새 증빙/V2/지급은 미완료다. 인증 전용 SIWE만 운영자 스크린샷/참가자 완료 보고로 확인했다. 공식 Attestor403의 서비스 측 정책 사유는 미확정이고 Zod3/viem peer 잔여 위험이 있다. 현재는 재로그인하지 않는다. [현행 계획](BOOTCAMP_PRODUCT_CONNECTION_PLAN.ko.md)과 [실행 인계](PRODUCT_WALLET_RUN.ko.md)를 먼저 따른다.

PR125의 `src/embedded-wallet/product-panel.jsx`와 `product-session.mjs`는 기존 normal-client/검토시간 driver를 재사용한다. 두 역할의 제품 SIWE 뒤에만 마운트하고, HR collector owner와 V2 runtime은 인증된 session의 `signingContext`에서 받아 서명 packet과 독립 대조한다. `clear-wallet-app.html` marker가 있는 공개 bundle과 product mount 인수가 필요하며 운영자에게 참가자 서명 문맥을 제공하지 않는다.

## 현재 기준과 세 가지 상태

확인된 develop: `d44b01216241d120064145016a99d73b1b361e34` (PR120/123 병합). PR125 코드 검토 기준은 `d8dd973dad8e9f56e9eb5a8045eb16e1f4271a56`, CI9/9 성공이며 문서 후속 HEAD와 CI는 PR에서 별도로 확인한다. [Issue106](https://github.com/gw020328-oss/clear-education-v4/issues/106)의 최신 확인된 병합 기준을 함께 사용한다.

| 기능 | 내부 구현 | 제품 HTTPS 호스트 | 새 실제 제품 시험 |
| --- | --- | --- | --- |
| V2 수령인 등록 GET/POST | PR115 병합 | PR120 병합 | 미완료 |
| S3 체인 반영 상태 GET | PR116 병합 | PR120 병합 | 미완료 |
| S4 판정 근거 GET | PR117 병합 | PR117에 mount 포함 | 미완료 |
| 이의 접수·평가·재검증 POST | 내부 API 존재 | 미노출, 사용자 요청 client 계약 미완료 | 미완료 |

PR120 검증 HEAD `cd659370a6264b1fa8592c85f7585ae125ee9275`의 CI 8/8 성공 후 develop `a395c6daac5220c38f6cadbbc8a4affa892e0a6a`에 정상 병합됐고 병합 트리는 검증 HEAD와 같다. [최종 E5 B 74/74·API/store 774/774](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40679016882), [E5 46/46·E4 164/164](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40679016840), [PR 공개/합성/Mac](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40679016836), [push 공개/합성/Mac](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40679011653)을 확인했다. 정확한 경로·client·초 경계 보정과 이전 실패 이력은 [S5 호스트 인수 기록](BOOTCAMP_S5_HOST_MOUNT.ko.md) 및 [PR120](https://github.com/gw020328-oss/clear-education-v4/pull/120)을 따른다. 호스트 인수 문서의 Draft/병합 대기 표현은 당시 기록이다. r20은 기존 V1 실제 성공 이력이며 새 V2 제품 시험을 대신하지 않는다.

구체적인 후속 순서·담당·관문은 [제품 연결 및 이의·재검증 계획](BOOTCAMP_PRODUCT_CONNECTION_PLAN.ko.md), S4 표시 계약은 [판정 근거 조회](BOOTCAMP_S4_DECISION_EVIDENCE.ko.md)를 따른다.

## Claude Code에 복사할 본문

```text
2026-10-30 추가 인계: 정상 내장지갑100 TEST 완주를 먼저 끝내고, 다음 작은 작업에서 한 가상 Python 반의 개설 전 운영자 초안→AI 구조화→필요 증거/도구 계획→지원 여부 검사→운영자 확인→버전 고정을 연결해. 기존 참여/서명/배정된 반의 정책·해시·권리·실지급 기록을 수정하지 마. 새 사이트 자동 연동/코드 생성·CP-SAT은 정상 완주의 선행 조건이 아니야. 준비된 Moodle/HackerRank 도구와 회고 텍스트 검토가 범위야.

후속 화면은 원문, 구조화 조건, 도구와 선택 이유, 실제 읽기 호출 근거, 모호·미지원 차단 사유를 구분해. 필수 강의 완료→활동 조회, 과제 제출 추가→과제 조회, 수행/해결/배운 점 회고→회고 조회+텍스트 AI로 계획과 호출이 달라져야 해. 성실 참여는 구체화 질문 후 확정 차단, 미지원 점수·출석은 미지원으로 표시해. 강좌 설정의 도구 매핑을 저장하고 학생별로 불필요하게 다시 생성하지 마. 예문 외 표현·부정·모순·미지원 입력으로 하드코딩 여부를 검증해.

현재 compileBootcampPolicy는 P0와 정확히 같아야 하고 normal-source-sequence는 네 조건 고정 순서야. 변형 초안은 우선 별도 읽기 전용 검증 시연이고 실제 지급은 검증된 고정 네 조건 정책이라고 분명히 표시해. JSON만 바뀌는 화면이나 가짜 호출 근거로 완료하지 마. 기존 producer도 P0 hash/고정 target을 요구하므로 임의 endpoint를 만들거나 검증을 제거하지 말고 D0 계약과 기존 담당의 읽기 연결을 인수해. 수치·기한·제출·증명 유효성은 결정론 규칙, AI는 의미·모순·회고 근거·안내를 담당해. AI에 승인키/송금 권한을 주거나 사용자 로그인·서명·이번 입력 비용 승인·동의를 대신하게 하지 마. 회고 사람 검토는 아직 미확정이야.

정상 완주 후 조건 초안/도구 계획과 기존 decision-evidence 표시를 우선하고, Moodle 제한 재조회·회고 보완, 중단 독립청구/자산 이동, 운영자 충전은 각각 후속으로 구분해. 전부 정상 완주 전에 만들지 마. 8분 발표는 초안 변경40~60초→검증된 정책 실제 환급→회고 부족/보완 중심을 권장하되 리허설로 조정해. 아직 구현되지 않은 보완 경로는 설명/합성 표시를 명확히 해. 교수님 피드백의 자동 사이트 연동은 향후 개발도구 연구이며 다른 실험 세션 중단 메시지는 필요 없어.

CLEAR 기존 프론트에 한 신청의 원천 확인·운영자의 이번 입력 AI 승인·네 조건 → 별도 V2 수령인 등록 서명 → 참가자/운영자의 같은 판정 명시 동의 → 100 TEST 수령 확인을 연결해줘. 현재 확인한 병합 기준은 develop d44b01216241d120064145016a99d73b1b361e34이며 PR120/123은 병합됐어. PR125는 미병합 Draft이므로 연결 코드 인수와 배포 완료를 구분해. PR115 V2 등록·PR116 S3 내부 체인 연결/조회·PR117 S4 판정 근거 조회가 포함돼. 내부 구현, 제품 HTTPS 호스트의 경로 노출, 새 실제 사용자 시험 완료를 구분해. PR120의 제품 호스트 V2 등록 GET/POST·S3 조회 GET도 병합됐어. 정확한 검증 HEAD는 cd659370a6264b1fa8592c85f7585ae125ee9275, 최종 CI는 8/8 성공(E5 B 74/74·API 774/774, E5 46/46·E4 164/164)이야. PR125 독립 제품 패널은 구현됐고 팀원 최신 web/ 인수와 새 실제 사용자 완주는 미완료야. Issue106의 최신 병합 기준과 docs/current/BOOTCAMP_S5_HOST_MOUNT.ko.md의 경로·검증 이력을 함께 확인해. 그 인수 문서의 Draft/병합 대기는 당시 기록이야. 해당 코드의 docs/current/BOOTCAMP_NORMAL_HOST.ko.md, BOOTCAMP_S3_CHAIN_REVIEW.ko.md, BOOTCAMP_S4_DECISION_EVIDENCE.ko.md, BOOTCAMP_PRODUCT_CONNECTION_PLAN.ko.md와 src/bootcamp/normal-client.mjs, tools/bootcamp/frontend-server.mjs, tools/bootcamp/test-client/driver.js를 대조해. 과거 PR102/V1 설명은 역사 참고이며 새 연결의 고정 기준이 아니야.

기존 프론트 PR #60(codex/frontend-shell)과 최신 로컬 변경·미추적 파일을 먼저 확인하고 안전하게 보존해. 기존 작업 브랜치에 최신 origin/develop을 병합하며 충돌은 양쪽 의도를 확인해 해결해. reset·덮어쓰기·강제 푸시로 정리하거나 이미 통합된 backend PR을 개별 cherry-pick하지 마. 현재 라우팅·디자인·지갑 adapter·빌드 방식을 재사용해. adapter가 없다면 아래 공개 계약에 필요한 최소 browser adapter를 구현해. web/와 관련 프론트 검사를 소유 범위로 삼고 backend/컨트랙트/수집기 변경이 필요하면 통합 담당과 조율해.

PR60 a0620cd39fe5cd44b62a1deb5806883503242227 기준은 npm/package/bundler/build 단계가 없는 web/index.html+src/*.js+CSS 정적 트리야. 현재 작업본이 다르면 먼저 차이를 확인하고 기존 방식을 유지해. 기존 5173 dev server는 합성용이고 실제 실행은 통합 담당 호스트가 최신 작업본 web/ 절대 경로의 공개 파일을 HTTPS 같은 출처로 제공해. 프론트 구현 후 통합 담당에게 절대 web 경로와 자산 변경 사실을 알려줘. backend 호스트가 자산 digest를 수락하기 전 실제 실행은 하지 않아.

준비 host GET /__dev/config는 phase=PREPARED_NOT_ACTIVATED, chainId/network/applicationId=null이고 /auth/*와 /bootcamp/*는 503 NORMAL_HOST_NOT_ACTIVATED야. 준비 중 화면을 만들고 지갑 로그인/신청/서명/동의 버튼을 비활성화해. 합성 성공으로 대체하지 마. 실제 활성화 때만 ACTIVE_LOCAL_TEST와 새 chainId 및 network(EIP3085)가 나타나. network.chainId는 hex이고 network.rpcUrls는 새 로컬 TEST RPC야. C1 431701이나 옛 RPC를 복사하지 마. 지갑 네트워크 추가/전환은 사용자가 확인한 명시 버튼에서만 해. native ETH18은 가스용이고 지급 TEST6과 구분해.

모듈은 같은 출처 /bootcamp-normal-client.mjs에서 import {createNormalBootcampClient} 해. request 포트에는 walletClient.request 형태의 인증 adapter를 연결해. 서버가 직접 제공하는 browser module은 normal-client 하나이고 src/application/wallet-client.mjs를 그 경로에서 자동 제공하지는 않아. 그 파일과 api-client.mjs는 지갑/세션 동작의 읽기 전용 구현 참고 자료야. wallet-client의 bare ethers import를 bundler 없는 정적 페이지에서 그대로 import하지 마. 최신 frontend에 이미 제공된 adapter가 있으면 재사용하고, 없으면 기존 정적 방식 안에서 필요한 EIP1193 connect/login/request/logout·세션 메모리 관리만 구현해. 기존 SIWE nonce→사용자 서명→verify→session, Secure HttpOnly cookie, credentials same-origin, wallet/chain 헤더, 쓰기 CSRF를 재사용해. 읽기 Origin은 브라우저가 관리하고 GET은 Sec-Fetch-Site same-origin 규칙을 따라. 두 역할은 서로 다른 주소/브라우저 쿠키 저장소를 써. accountsChanged/chainChanged/disconnect에서는 보존한 이전 세션의 헤더로 서버 logout을 시도하고 진행 요청·메모리 인증 상태를 정리해. 기존 참고 walletClient의 이벤트 invalidate는 메모리 정리만 하므로 그것만으로 서버 revoke가 됐다고 주장하지 마. 키/서명/토큰을 저장소나 로그에 남기지 마.

사용자가 참가자는 Privy Google 로그인/내장 EOA, 운영자는 당분간 MetaMask로 확정했어. 참가자 기존 내장 주소 복원·명시 수령인 확인 → 운영자 MetaMask와 같은 판정 직접 확인 → 기존 서비스 거래 제출/가스 부담 → 정확100 TEST를 연결해. 두 역할은 서로 다른 주소와 분리된 Chrome 프로필을 써. 과거 운영자 내장 주소나 옛 MetaMask 주소를 자동 등록/치환하지 말고 이번 사용자가 지정한 주소를 서버 allowlist에 등록한 새 세션을 사용해. PR125 adapter/실제 검증 상태와 최신 팀원 자산 인수를 대조하고 기존 nonce/chain/domain/만료/판정 버전/수령인 검증은 유지해. 인증 전용 SIWE는 양측 완료 보고가 있으나 제품 HR/V2 서명·새 지급은 미검증이야. AA/Paymaster 확장은 이번 범위가 아니야. 우리 노트북 시연은 추천안이며 대회 장비 규정 확정이 아니야.

개발용 외부 지갑은 사용자가 명시 선택할 때만 연결하고 Privy 오류 시 자동 fallback하지 마. “이 주소는 쓰이지 않습니다” 대신 “시험용 브라우저 지갑으로 연결했습니다. 이번 시험의 신청과 TEST 수령에는 이 주소가 사용됩니다. 실제 서비스의 내장 지갑 계정과는 별개입니다”라고 안내해. 지갑 전환으로 기존 신청/수령인/서명을 자동 치환하지 마.

participantWallet, expectedClaimOwner, 수령인은 서로 다른 의미야. 현재 claim owner는 수집기가 이번 증명에 만든 임시 EOA이고 참가자는 그 owner와 신청·정책·nonce·만료에 결합한 관측 요청에 서명해. 두 proof owner와 signed request context, 동일 HackerRank username 검증은 기존 수집기/검증기를 유지해. 학생 주소를 claim owner로 치환하거나 학생 개인키를 서버로 보내지 마. PRODUCT_STORE.ko.md의 “합성만 허용”은 PR80 초기 이력이며 현재 pair proof 수집/검증/제품 소비 코드가 없다는 뜻이 아니야. r20의 이전 V1 실제 성공은 이번 Privy 완주를 대신하지 않아.

합성 web/src/demo는 명시적으로 선택하는 별도 화면 검증 모드로 유지할 수 있어. 실제 서버 장애·미활성화·API 누락 때 자동 합성 전환하지 마. 합성 상태/세션은 실제 저장·서명·지급과 격리하고 합성 표시와 검사 성과를 구분해. 기존 디자인과 팀원 변경은 보존하되 이번 지침이 디자인/코드 리뷰 완료를 뜻하지는 않아. 추가 합성 기능 확장보다 정상 신청 한 건 연결을 우선해.

로그인 뒤 api.session()은 GET /bootcamp/v4/session의 clear-bootcamp-normal-session.1을 읽어. role은 PARTICIPANT 또는 OPERATOR이고 applicationId는 결합 전 null, 결합 뒤 같은 단일 app야. query/body로 역할/app를 지정하지 않아. 참여자만 기존 POST /bootcamp/v1/applications 빈 본문+사용자 동작 멱등 키로 신청을 만들고 record.applicationId로 bindSourceSession(app)를 한 번 호출해. 운영자는 새 신청을 만들지 않고 api.session()으로 공통 app를 읽어. public config app=null을 세션 app로 오해하지 마.

Bootcamp 응답의 오류 형식은 {error:CODE}이고 기존 application/api-client.mjs는 {code:CODE}와 자체 allowlist를 사용하므로 그대로 연결하면 BC_NORMAL_PROCEDURE_NOT_READY 등이 API_REQUEST_FAILED로 사라져. 프론트 transport에서 같은 출처/credentials/redirect error/취소/시간제한을 유지하고 Bootcamp 경로의 응답 error를 제한된 고정 코드로 보존해. 비2xx 응답을 성공으로 반환하거나 임의 서버 텍스트를 UI에 그대로 출력하지 마. 실제 transport를 통과한 준비 오류·만료·취소·target 충돌 검사도 넣어. 네 조건을 원래 MET/NOT_MET/MISSING/UNKNOWN과 current 그대로 표시해. procedureReady=false 또는 BC_NORMAL_PROCEDURE_NOT_READY이면 기존 v2 operations를 읽어 검토 준비 중으로 보여줘. 준비 뒤 api.view(app)를 사용해. 불명/오류/null을 성공이나 0으로 바꾸지 마.

참여자 pendingSourceSignature(app)의 정확한 message·용도·만료를 화면에 표시하고 별도 사용자 클릭으로 personal_sign 한 뒤 submitSourceSignature(app,approval,signature)해. bind/submit은 자동 재시도하지 마. 원천 확인 서명은 지급 동의가 아니고 운영자가 대신할 수 없어. 서명·쿠키·원문·proof를 로그/저장소/이슈에 남기지 마.

운영자의 이번 입력 AI 승인 화면을 반드시 연결해. api.session()의 aiApproval 자료에서 이번 입력·모델·외부 전송·비용·호출 한도·남은 시간을 보여주고 지정 승인 지갑인지 확인해. 별도 확인 체크와 직접 클릭으로만 승인해. tools/bootcamp/test-client/driver.js의 approveAi를 기준으로 POST /bootcamp/v4/applications/:app/reflection-approval의 version/applicationId/bodySha256/planHash/contextHash/runBindingHash/codeHead/model/action/costAcknowledgment 및 응답 검증을 그대로 대조해. normal-client에 없는 메서드를 임의로 가정하지 마. 결과 미확인은 확인 필요로 표시하고 자동 재승인·새 유료 호출을 만들지 마. 원천 확인 서명·AI 검토 승인·지급 동의는 각각 구분해.

V2 수령인 등록 내부 handler·normal-client는 PR115로 develop에 병합됐어. 제품 frontend-server의 등록 GET/POST 노출도 PR120으로 병합됐어. 이 호스트 연결과 제품 화면 인수·새 실제 정상 완주는 구분해. 프론트 담당이 PR을 임의 병합하지 마. api.session()의 recipientRegistrationRequired=true와 phase=AWAITING_RECIPIENT_REGISTRATION_SIGNATURE를 확인해. 원천 네 조건과 이번 입력 AI 확인 후, 검토/양측 동의 전에 아래 등록 단계를 추가해. procedureReady=false인 동안에도 등록 조회는 가능해.

api.recipientRegistration(app)는 GET /bootcamp/v3/applications/:app/recipient-registration이야. DTO version=clear-bootcamp-recipient-registration.1, role=PARTICIPANT 또는 COURSE_OPERATOR, purpose=REGISTER_FIXED_RECIPIENT, calldataPublic=true를 확인해. status는 NOT_READY/AWAITING_SIGNATURE/SIGNED/STALE/EXPIRED이며 signatureAccepted는 서버 서명 접수 여부야. applicationRevision/ledgerSequence/decisionId/decisionRevision/decisionHash가 쓰기 CAS이고 registrationTargetId가 서버 발행 요청이야. payload에는 EIP712 domain/types/primaryType/message가 있으며 참가자·수령인, 신청 ID, 정책/매핑, chainId·verifyingContract·instance salt, nonce와 원래 deadline을 그대로 보여줘. source 서명 또는 지급용 .3 메시지로 바꾸지 마.

PARTICIPANT의 AWAITING_SIGNATURE에서만 별도 확인 버튼으로 eth_signTypedData_v4를 호출해. 등록은 수령인 고정용이고 원천 적격성 확인·AI 승인·지급 동의가 아니야. 이 등록 서명과 공개 필드는 계약 검증을 위해 거래 calldata에 공개된다는 점을 서명 전에 안내해. JSON typed data의 types에 EIP712Domain=[name:string,version:string,chainId:uint256,verifyingContract:address,salt:bytes32]를 추가하고 서버 payload의 domain, RecipientRegistration 타입과 message는 그대로 유지해. 지갑 주소·체인이 payload와 맞는지 확인하고 계정/체인/세션/요청 변경, 취소, 원래 deadline 이후 돌아온 결과는 제출하지 마. 운영자는 읽기만 하며 참가자 대신 서명/제출하지 않아.

제출은 api.submitRecipientRegistration(app,packet,signature,{idempotencyKey,signal})이고 같은 /recipient-registration에 POST해. body는 expectedRevision/expectedLedgerSequence/targetDecisionId/targetDecisionRevision/targetDecisionHash/registrationTargetId/signature만 허용해. recipient, wallet, role, nonce, deadline을 body에 추가해 바꾸지 마. 기존 cookie/Origin/CSRF/지갑·체인 헤더를 사용해. 응답은 clear-bootcamp-procedure-operation.1이며 record.target.signatureAccepted=true와 chainStatus=NOT_OBSERVED는 접수 완료야. operationId가 있으면 api.operation으로 조회하고, 응답 유실이면 등록 GET으로 상태를 확인해. 자동 재서명·새 nonce·POST 자동 재시도는 하지 마. 같은 명령/멱등 키는 저장된 결과를 돌려주고 다른 키의 중복 제출은 거부돼.

등록 GET의 chainStatus는 NOT_OBSERVED/NOT_REGISTERED/INCLUDED로 서명 status와 별개야. 실행 호스트의 canonical 조회가 확인됐을 때만 INCLUDED, canonical=true, finalized=false, checkpoint, registrationSequence(10진 문자열), recipient, chainApplicationId를 보여줘. 순서는 실제 체인 최초 등록 순서이며 서버 접수 순서나 확정 블록 순서로 표현하지 마. 조회 실패 시 이전 INCLUDED를 새 확인 결과로 유지하지 말고 확인 필요를 표시해. SIGNED를 등록 완료나 지급 완료로 표시하지 않아. 수락 후 서명 요청이 EXPIRED여도 이미 수락한 권리의 만료를 뜻하지 않아. 수령 여부는 기존 paymentReceipt에서 별도로 확인해.

오류는 {error:CODE}야. AUTH_REQUIRED는 재인증/기존 실행 중단, FORBIDDEN·CSRF는 권한 확인, BC_VIEW_STALE/BC_DECISION_TARGET은 재조회·대상 재확인, BC_RECIPIENT_REGISTRATION_TARGET/SESSION/SOURCE/SIGNATURE/ALREADY_SIGNED와 BC_E3_CURRENT_MET_REQUIRED는 해당 등록/원천 상태 확인으로 처리해. 만료 시 BC_RECIPIENT_REGISTRATION_SIGNATURE 또는 현재 MET 오류가 반환될 수 있으니 GET status/deadline과 함께 표시해. 새 세션으로 이전 요청을 되살리지 마. S3 체인 반영/조회는 PR116, S4 근거 조회는 PR117로 내부 구현이 병합됐어. S3 제품 조회 GET은 PR120으로 병합됐고 S4 GET은 현재 호스트에 연결됐어. 이 기능을 등록 endpoint로 대신하지 마.

S4는 저장된 당시 검사 결과·안전한 근거 위치만 보여줘. sourceCurrentness=UNKNOWN, 원문 HTTP=false, 미저장 model/prompt/rubric/policy 문자열 버전=UNAVAILABLE을 유지하고 과거 MET를 현재 유효성으로 바꾸지 마. manifestHash만으로 진실성/독립 재검증/지급 권한을 주장하지 마. S3는 NOT_REQUESTED/PENDING/INCLUDED/REVERTED/REORGED, canonical/finalized=false, serverBlocked, matchesCurrentDecision, acceptedRightPreserved를 구분해. 서버 접수 전에 전송된 ACCEPT가 먼저 포함되면 수락 권리는 보존돼. reviewChain은 조회이며 이의 접수 쓰기가 아니야.

각 역할은 자기 최신 view와 같은 target/revision/hash를 화면에서 확인한 뒤 사용자 버튼으로 api.consent(app,view,'AGREE',{idempotencyKey})해. 자동 서명/자동 동의/POST 자동 재시도는 금지야. 상대 동의로 ledger가 바뀌거나 충돌이면 재조회 후 다시 사용자 확인을 받아. 응답 유실은 기존 operation/멱등 계약을 따라.

api.paymentReceipt(app)로 약정100 TEST, 배정, 제출, 수령 확인을 구분해. INCLUDED/finalized=false를 최종 확정으로 표현하지 마. exactExpectedAmountVerified/canonical/receivedAtoms 검증 조건을 따르고 미측정 null은 유지해. 현재 판정과 acceptedTarget을 구분해. receipt를 읽는 버튼에서 지급/claim 쓰기를 호출하지 마.

자동 GET 조회 중 명시 클릭이 조용히 유실되지 않게 하고 역할별 다음 행동·처리 중·비활성·실패 이유를 보여줘. 조회와 쓰기 요청의 충돌을 오프라인으로 재현·검사하고 쓰기 자동 재시도로 해결하지 마. 남은 시간은 서버 기준과 조회 경과 시간을 반영하며 브라우저 타이머로 원천·검토 기한을 연장하지 마. 현재 240초는 시험용 원천 유효기간이고 제품 지급기한이 아니야. 계정/체인 변경·원래 세션 폐기·만료 뒤 돌아온 원천 서명을 제출하지 마.

교수 피드백 중 승인된 핵심 보완은 이번 정상 흐름에 포함해. docs/current/BOOTCAMP_SECURITY_COMPLETION_PLAN.ko.md의 담당·완료 기준을 따라 위에서 구현한 별도 수령인 등록 서명과 체인 등록 순서를 연결해. S3는 api.reviewChain(app)의 접수/체인 반영 상태를 병합된 GET에 연결하고, S4는 api.decisionEvidence(app,{decisionId:view.target.targetDecisionId})의 manifest.decision ID/revision/hash를 화면 판정과 대조해 표시해. 내부 POST review-objections/objection-assessments/review-revalidations는 제품 호스트에 노출되지 않았고 normal-client 사용자 요청 메서드도 없어. review-revalidations는 assessmentId에 결합된 검증 결과 기록이며 AI 재실행 버튼 API가 아니야. 학생 화면에서 관리/평가 API를 직접 호출하지 마. 이의 화면 준비는 가능하나 서버 접수가 없으면 접수 완료로 표시하지 말고, 정상 지급 제품 완주 후 별도 요청 계약·평가 공급 경로 연결로 진행해. 원천 서명을 수령인 등록에 재사용하지 말고 아직 없는 endpoint를 가정하지 마. 양측 직접 동의 뒤 서버의 자동 ACCEPT/CLAIM과 정확한 영수증까지 연결하되 브라우저 자동 POST 재시도로 구현하지 마. 그 외 새 기능은 이번 정상 흐름 연결 뒤로 미뤄. 예치·배정 정책 변경, 새 반/LMS/Windows 확장, 독립 청구, 새 AI 조건 연결, C4~C6·복구 프레임워크·대시보드 확장과 디자인 전면 개편은 제외해. 실제 로그인·원천 증명·유료 AI·사용자 서명·새 체인/호스트 실행은 오프라인 연결과 자산 확인 후 본부가 사용자와 준비해. 지금 재로그인이나 비밀번호 설정을 요구하지 마. 기존 r20 실행·AI 승인·DB·원천 lease를 재사용하지 마. 실제 AI 승인 파일/서버키는 통합 담당 영역이야.

기존 decision-evidence GET으로 계정 증명/인증서 증명/연결 검증을 구분해 보여줘. HackerRank checks의 certificateName/issuerStatus/accountProofHash/certificateProofHash/accountProofIssuedAt/certificateProofIssuedAt/achievementAt을 사용하고 현재 achievementAt=null을 합격일로 만들어 표시하지 마. verification의 sourceStatus/participantBinding/requestBinding/integrity/freshness, reference의 RECORDED/UNAVAILABLE, availability를 함께 대조해. 두 해시가 있다는 이유만으로 연결 검증 성공을 표시하지 마. 조회는 저장된 당시 결과이고 실시간 원천 확인/독립 재검증이 아니야. 표현 근거가 부족하면 확인 필요로 남기고 별도 서버 요약 계약을 요청해. 원문/쿠키/계정 식별자를 임의 DTO로 추가하지 마.

금고로 ERC20 transfer만 하라는 충전 안내를 제거해. 현재 V2의 지정 depositor는 approve 후 fund(operationId, amount)를 실행해야 내부 balance가 늘고 단순 송금은 surplus야. 운영자 SIWE와 depositor는 별개이며 운영자 MetaMask에 그 계약 권한이 있다고 가정하지 마. 정상 완주는 기존 시험 재원으로 먼저 진행하고 현재 문구는 “현재 화면에서는 재원 충전을 지원하지 않습니다”로 해. 충전 UI/권한/chain·instance·vault·token·decimals DTO/operationId/영수증·회계 확인은 후속 계약이야.

기존 지급 relayer 대납은 금고→학생의 제한된 경로야. 학생 외부 송금과 중단 후 직접 청구의 네이티브 가스/독립 제출자 및 SDK·인증·RPC·호스팅 의존성은 후속 검증으로 남겨. 정상 완주 후 별도 수락·전액 배정·미청구 신청으로 새 브라우저 복구/직접 청구/자산 이동을 검사하고 이미 지급한 신청을 다시 청구하지 마. 키/복구문구는 사용자 비공개 UI에서만 취급해. 모든 송금 무료, 자동 AA/paymaster 채택, 한국 원화 현금화 지원을 약속하지 마. 현금화는 상용 미구현·미검증이야.

normal-source-sequence의 단회 수집과 화면 GET polling을 구분해. polling을 Moodle 재수집으로 표시하거나 “곧 다시 확인합니다”를 약속하지 마. 후속에는 해당 조건만 제한 재조회하고 회고 원천 수정 후 새 증거/판정까지 연결해. 주기·최대 횟수·운영창·다음 확인 시각은 backend 계약 전 고정하지 마. Reclaim이나 유료 AI를 모든 재조회에서 자동 실행하지 않고 원래 만료·동의·재검증 정책을 유지해. 이의 쓰기 제품 노출은 위 허용 경로대로 미완료이며 review-revalidations는 신뢰 평가 결과 기록이지 학생 재실행 요청 API가 아니야.

미해결 뒤 재개/구제는 정책 공백이야. 기존 신청·예약·수락권리·중복 방지를 확인하는 제안부터 하고 사람 검토/수동 지급/무조건 재신청/종료만으로 예약 해제를 확정 정책으로 표시하지 마. 후속 순서는 정상 완주 → 판단 근거 표시(기존 GET 인계는 병행 가능) → Moodle/회고 보완 재검증 → 중단 직접 청구/복구/자산 이동 → 운영자 충전이야. 어느 후속도 현재403 해결·정상 완주의 새 선행 기능으로 끼워 넣지 마.

변경에 필요한 검사만 실행해. 기준 정적 트리 검사 명령은 ./tools/node --test web/tests/*.test.mjs이고 별도 build 명령은 없어. 현재 작업본에 이미 검사/빌드가 추가됐다면 그 명시된 절차를 확인해. fixture는 합성이라고 구분하고 실제 API 확인 항목과 분리해. 준비 상태·인증 취소/만료·조회와 클릭 충돌·AI 승인·오래된 동의 대상·영수증 null/성공을 검사해. 완료 시 프론트 커밋/변경 파일/검사 명령과 결과/실제 API 확인 범위/fixture 확인 범위/절대 web 경로/자산 변경/남은 차단 사유를 보고하고 Issue #106을 기존 프론트 PR에 연결해. 제품 프론트로 실제 정상 흐름을 검증하기 전에는 Issue #106을 완료 처리하지 마. 자동 merge/배포하지 마.
```
