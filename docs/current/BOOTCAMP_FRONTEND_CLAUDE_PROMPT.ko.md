# 서준형 Claude Code 복사 지침

아래 블록을 프론트 작업 중인 Claude Code에 붙여 넣는다. Issue #106의 최신 인계 댓글에 있는 정확한 backend 커밋을 먼저 확인한다.

```text
CLEAR 기존 프론트에 한 신청의 네 조건 → 참여자/운영자의 같은 판정 명시 동의 → 100 TEST 수령 조회를 연결해줘. GitHub Issue #106과 최신 인계 댓글, 해당 커밋 docs/current/BOOTCAMP_NORMAL_HOST.ko.md, BOOTCAMP_C3_FRONTEND.ko.md, BOOTCAMP_C3_REFRESH.ko.md를 읽고 진행해.

기존 프론트 PR #60과 최신 로컬 변경을 보존하고 먼저 git 상태와 기존 walletClient/라우팅/디자인을 확인해. develop에는 backend가 아직 합쳐지지 않았으므로 develop만 기준으로 구현하지 말고 backend PR #102/#78의 인계 커밋을 참고해. backend 전체를 프론트에 merge/cherry-pick하거나 기존 작업을 덮어쓰지 마. web/만 프론트 소유로 작업하고 backend/컨트랙트/수집기는 수정하지 마.

PR60 a0620cd39fe5cd44b62a1deb5806883503242227 기준은 npm/package/bundler/build 단계가 없는 web/index.html+src/*.js+CSS 정적 트리야. 현재 작업본이 다르면 먼저 차이를 확인하고 기존 방식을 유지해. 기존 5173 dev server는 합성용이고 실제 실행은 통합 담당 호스트가 최신 작업본 web/ 절대 경로의 공개 파일을 HTTPS 같은 출처로 제공해. 프론트 구현 후 통합 담당에게 절대 web 경로와 자산 변경 사실을 알려줘. backend 호스트가 자산 digest를 수락하기 전 실제 실행은 하지 않아.

준비 host GET /__dev/config는 phase=PREPARED_NOT_ACTIVATED, chainId/network/applicationId=null이고 /auth/*와 /bootcamp/*는 503 NORMAL_HOST_NOT_ACTIVATED야. 준비 중 화면을 만들고 지갑 로그인/신청/서명/동의 버튼을 비활성화해. 합성 성공으로 대체하지 마. 실제 활성화 때만 ACTIVE_LOCAL_TEST와 새 chainId 및 network(EIP3085)가 나타나. network.chainId는 hex이고 network.rpcUrls는 새 로컬 TEST RPC야. C1 431701이나 옛 RPC를 복사하지 마. 지갑 네트워크 추가/전환은 사용자가 확인한 명시 버튼에서만 해. native ETH18은 가스용이고 지급 TEST6과 구분해.

모듈은 같은 출처 /bootcamp-normal-client.mjs에서 import {createNormalBootcampClient} 해. request 포트에는 기존 walletClient.request를 연결해. 기존 SIWE nonce→사용자 서명→verify→session, Secure HttpOnly cookie, credentials same-origin, wallet/chain 헤더, 쓰기 CSRF를 재사용해. 읽기 Origin은 브라우저가 관리하고 GET은 Sec-Fetch-Site same-origin 규칙을 따라. 두 역할은 서로 다른 주소/브라우저 쿠키 저장소를 써. accountsChanged/chainChanged는 기존 logout/메모리 상태 정리로 처리해.

로그인 뒤 api.session()은 GET /bootcamp/v4/session의 clear-bootcamp-normal-session.1을 읽어. role은 PARTICIPANT 또는 OPERATOR이고 applicationId는 결합 전 null, 결합 뒤 같은 단일 app야. query/body로 역할/app를 지정하지 않아. 참여자만 기존 POST /bootcamp/v1/applications 빈 본문+사용자 동작 멱등 키로 신청을 만들고 record.applicationId로 bindSourceSession(app)를 한 번 호출해. 운영자는 새 신청을 만들지 않고 api.session()으로 공통 app를 읽어. public config app=null을 세션 app로 오해하지 마.

네 조건을 원래 MET/NOT_MET/MISSING/UNKNOWN과 current 그대로 표시해. procedureReady=false 또는 BC_NORMAL_PROCEDURE_NOT_READY이면 기존 v2 operations를 읽어 검토 준비 중으로 보여줘. 준비 뒤 api.view(app)를 사용해. 불명/오류/null을 성공이나 0으로 바꾸지 마.

참여자 pendingSourceSignature(app)의 정확한 message·용도·만료를 화면에 표시하고 별도 사용자 클릭으로 personal_sign 한 뒤 submitSourceSignature(app,approval,signature)해. bind/submit은 자동 재시도하지 마. 원천 확인 서명은 지급 동의가 아니고 운영자가 대신할 수 없어. 서명·쿠키·원문·proof를 로그/저장소/이슈에 남기지 마.

각 역할은 자기 최신 view와 같은 target/revision/hash를 화면에서 확인한 뒤 사용자 버튼으로 api.consent(app,view,'AGREE',{idempotencyKey})해. 자동 서명/자동 동의/POST 자동 재시도는 금지야. 상대 동의로 ledger가 바뀌거나 충돌이면 재조회 후 다시 사용자 확인을 받아. 응답 유실은 기존 operation/멱등 계약을 따라.

api.paymentReceipt(app)로 약정100 TEST, 배정, 제출, 수령 확인을 구분해. INCLUDED/finalized=false를 최종 확정으로 표현하지 마. exactExpectedAmountVerified/canonical/receivedAtoms 검증 조건을 따르고 미측정 null은 유지해. 현재 판정과 acceptedTarget을 구분해. receipt를 읽는 버튼에서 지급/claim 쓰기를 호출하지 마.

C4~C6, 복구 프레임워크, 새 대시보드나 디자인 전면 개편은 제외해. 사용자 지갑 설정/HR 로그인은 준비 완료 후 본부가 한 번에 안내하므로 지금 재로그인이나 비밀번호 설정을 요구하지 마. 실제 AI 승인 파일/서버키는 통합 담당 영역이야.

변경에 필요한 검사만 실행해. 기준 정적 트리 검사 명령은 ./tools/node --test web/tests/*.test.mjs이고 별도 build 명령은 없어. 현재 작업본에 이미 검사/빌드가 추가됐다면 그 명시된 절차를 확인해. fixture는 합성이라고 구분하고 실제 API 확인 항목과 분리해. 완료 시 변경 파일/검사 명령과 결과/실제 API 확인 범위/fixture 확인 범위/절대 web 경로/미확인 사항을 보고하고 Issue #106을 기존 프론트 PR에 연결해. 자동 merge/배포하지 마.
```
