# 프론트·백엔드 연결 계약 — B2b 합성 수락·공통 오류 복구 기준

2026-10-15 M2: [경로·증거·금액 후보 평가](MVP_EVALUATOR.ko.md)의 `clear-mvp-evaluation.1`은 M1 계약을 소비하는 별도 순수 합성 모듈이다. 증거 상태·OR·명시 선택·최초 제출·정정/최종성과 금액 후보를 분리하며 실제 자격/지급은 false다. HTTP/DB/금고와 기존 차단 조건을 유지한다.

2026-10-15 M1: [공통 정책·증거 계약](MVP_POLICY_CONTRACT.ko.md)의 `clear-mvp.1`은 별도 버전 합성 컴파일/소비자 준비 계약이다. YBM형·시원스쿨형·제3 합성 프로필을 같은 제한된 엔진에서 설정으로 실행한다. 기존 M0·HTTP/DB/금고를 보존한다. M1/M2 승인으로 이번 범위 구현을 진행하되 아래 과거 미착수 문구는 당시 기록이다. 공식 조건·예치 정책 OPEN, Moodle/원천 BLOCKED·grant/outbox HOLD·독립 청구 NO-GO·Mac 원인 미확정은 유지한다.

2026-10-15 [TEST 재원 실험](TEST_FUNDING_LAB.ko.md)은 별도 spikes/funding-lab ABI/읽기 어댑터다. 아래 제품 HTTP·application DB schema 4·v4 동의/예치 계약은 변경하지 않는다. 공개 endpoint/신규 issuer·grant/outbox는 추가하지 않는다. 확인된 과거 블록의 TEST 상태와 제품 청구 가능 표시를 혼용하지 않는다.

2026-10-14 H2 후속: [격리 등록 접수](HISTORY_INTAKE.ko.md)는 H1의 두 목적을 별도 영속 ledger/독립 검증/관리형 수집기에 연결한다. 기존 H1 SYNTHETIC 및 HTTP/DB 계약은 보존한다. 로컬 모듈 연결과 실제 웹/기관 등록·자격 완료를 구분하며 미확인 전체성/신원/공식 기간은 UNKNOWN이다.

2026-10-14 후기 사전검토 후속은 [규칙·상태/필드 제안](REVIEW_PRECHECK.ko.md)을 따른다. rule별 자료 검토와 게시 원천 상태를 분리하며 400% 자동 자격/지급을 허용하지 않는다. 이번 변경은 문서뿐이고 기존 HTTP/Reason enum·M0 schema/version을 변경하지 않는다. 제안 필드를 기존 endpoint로 보내지 않는다.

2026-10-14 H1 후속: [등록 이력 → 목표 성적 계약](EXAM_LIFECYCLE.ko.md)의 합성 전용 스키마·검증·메모리 영수증을 추가했다. PR #32의 실제 표 공증 보고와 전체성/신청자 결합 미완료를 구분한다. 기존 M0 명세 전용 범위는 유지하고 H1만 별도 실행 가능한 합성 단위다. 실제 수집 통합·영구 보존·제품 자격/지급은 미구현이며 기존 차단을 유지한다.


2026-10-14 M0 추가: [합성 계약](M0_CONTRACT.ko.md)·[결정/미결 질문](M0_DECISIONS.ko.md)·[프런트 시작 문서](FRONTEND_M0_HANDOFF.ko.md)를 우선한다. 첫 mock의 필드·예제는 FIXED_FOR_M0_FIXTURES이며 소비자 합의는 PENDING이다. 아래 넓은 설계의 wire/ABI·실제 조건은 여전히 미동결이다. 제품 기능과 M1 이후 구현은 포함하지 않으며 실제 Moodle·원천 검증 차단, grant/outbox 보류, 독립 청구 NO-GO를 유지한다.

2026-10-14: 이 문서는 **현재 실행 API**를 설명한다. 새 목표의 [DRAFT_INTERFACE](MVP_INTERFACES_20261014.ko.md)는 미구현·미동결이며 이 HTTP/DB/EIP-712 계약을 변경하지 않는다. 새 등록/재원 분리를 위해서는 proof 세션의 ENROLLED 의존성을 포함한 별도 전환 PR이 필요하다. 현재 코드 기준 develop `6d941a1`, 실제 원천 차단·grant/outbox 보류·독립청구 NO-GO 유지.

공통 세션 흐름(2026-10-13): [이슈 #28](https://github.com/gw020328-oss/clear-education-v4/issues/28), [클라이언트 흐름 계약](PROOF_FLOW.ko.md). PR #27 병합 `77d1c4b` 위에서 생성·검토·지갑 승인·세션/결과 조회·취소와 응답 유실 복구를 구독 가능한 상태로 연결했다. F0 화면은 별도이며 HTTP/DB/정책/금고/Moodle 계약을 변경하지 않는다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류·독립 청구 제품 전환 NO-GO를 유지한다.

공통 증명 세션 승인(2026-10-13): [이슈 #26](https://github.com/gw020328-oss/clear-education-v4/issues/26), [지갑 승인 도구](PROOF_WALLET.ko.md). PR #25 병합 `51ee66b` 위에서 기존 B1 서명/HTTP 계약을 재사용하는 `authorizeProofSession`을 추가했다. 검토한 문맥·독립 owner 공개키·중단/만료·응답 유실을 검사한다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류는 유지하며 HTTP/DB/정책/금고/화면은 변경하지 않는다.

학습 provider 추가(2026-10-13): [합성 시드 provider·Moodle 최소 연결 명세](LEARNING_PROVIDER.ko.md)는 기존 B3의 내부 driver와 평가기 입력을 재사용한다. 기관/강좌/필수 활동·완료 의미/수정 시각을 검사하며 HTTP·DB·UI·공통 지갑/오류 API를 변경하지 않는다. 활동 완료율을 시청률·출석률로 표시하지 않으며 실제 Moodle 연동/원천 검증은 계속 차단한다.

공통 오류 복구 추가(2026-10-13): [브라우저 전송·복구 계약](API_RECOVERY.ko.md), [이슈 #22](https://github.com/gw020328-oss/clear-education-v4/issues/22). 안전한 상세 코드, 중단/시간 초과, 쓰기 결과 불확실성 안내를 추가한다. 서버 API/DB/화면 변경 및 grant/outbox 확대는 없다.

B3 추가(2026-10-13): [학습 증거 계약·합성 adapter](LEARNING_EVIDENCE.ko.md)는 내부 입력 검증만 추가하며 HTTP/DB/UI 계약은 변경하지 않는다. 실제 제공자·인증·영속 snapshot 수락은 미구현이다. CLEAR 추가 지급 서명을 전제로 한 grant/outbox·관련 UI/API 확대는 [최신 작업 범위](TEAM_PLAN.ko.md)에 따라 구조 검증 전까지 보류한다.

B2b 추가(2026-10-13): [상세 제품 수락 계약](PRODUCT_PROOF.ko.md). schema 4와 합성 증거의 단회 수락/영수증 API를 추가했다. 실제 원천 전체성·실제 proof/자격/지급은 차단 상태다. 아래 B1·신청 계약은 유지한다.

2026-10-12, PR #8의 신청/예치와 C1의 HTTPS에 B1 제품 증명 세션 API를 추가했다. B1 병합 여부는 [이슈 #15](https://github.com/gw020328-oss/clear-education-v4/issues/15)의 연결 PR을 확인한다. 실제 proof 수락·시드/outbox/청구 API는 아직 없다. 실행은 [C1 로컬 합성 HTTPS 안내](LOCAL_SYNTHETIC.ko.md)를 따른다. 개발 전용 `GET /__dev/config`와 제한된 `POST /rpc`, 정적 프론트 빌드가 같은 origin에서 제공된다. 개발 경로는 제품 proof·지급 API가 아니다.

원문: [HTTP](../../src/application/http.mjs), [서비스](../../src/application/service.mjs), [예치](../../src/application/funding.mjs), [지갑 도구](../../src/application/wallet-client.mjs). 변경 PR에서 소스·시험과 함께 이 문서를 갱신한다. 정책 전체 schema와 서명 필드는 기존 상세 문서와 소스를 따른다.

## 전송·인증

- 동일 origin의 HTTPS만 제품 경로로 사용한다. Host와 Origin을 검증하고 프록시의 `x-forwarded-proto`를 신뢰하지 않는다. 테스트용 loopback HTTP 예외를 프론트 개발 인증 우회로 사용하지 않는다.
- POST는 `Content-Type: application/json`, 본문 최대 64 KiB. 빈 본문을 요구하는 경로에도 `{}`를 보낸다. 임의 필드·null·배열을 추가하지 않는다.
- 사전 인증/세션은 `__Host-clear-preauth`, `__Host-clear-session` 쿠키이며 HttpOnly/Secure/SameSite=Strict다. 로그인 JSON에 세션 token은 없다.
- 인증된 요청에는 `x-wallet`, `x-chain-id`(10진 문자열), 쓰기에는 `x-csrf-token`이 필요하다. GET도 동일 출처 검증을 통과해야 한다. 브라우저는 쿠키를 직접 읽지 않고 기존 지갑 도구를 사용한다.
- `createSameOriginApi`는 same-origin credentials, no-store, redirect 거부를 사용한다. 다른 origin CORS 연결이나 URL 쿼리 기반 API를 가정하지 않는다.
- 정책 해시·신청 ID 경로는 `0x` + 소문자 64자리 hex다. 금액·시각 등은 소스의 문자열 형식을 유지하고 부동소수점으로 금액을 처리하지 않는다.

## 현재 경로

| 메서드·경로 | 입력 / 권한 | 응답·주의 |
| --- | --- | --- |
| POST `/auth/nonce` | `{wallet, chainId}`; chainId는 숫자 | `{nonce, message, expiresAt}` + 사전 인증 쿠키 |
| POST `/auth/verify` | `{nonce, signature}` + 사전 인증 쿠키 | `{wallet, role, csrf, expiresAt}` + 세션 쿠키 |
| GET `/auth/session` | 로그인 | 공개 세션 정보 |
| POST `/auth/logout` | `{}`, 로그인·CSRF | `{loggedOut: true}`, 쿠키 해제 |
| POST `/policies` | 운영자; 정확한 합성 정책 schema | 컴파일 결과·해시·`publishable=false` |
| GET `/policies/:policyHash` | 로그인 | 컴파일된 정책. 목록 경로는 없음 |
| POST `/applications` | `{policyHash}`; participant 역할, `Idempotency-Key` 필수 | 신청 view |
| GET `/applications` | 로그인 | 본인 신청/운영자 목록의 배열, 최대 100개, 페이지네이션 없음 |
| GET `/applications/:id` | 본인 또는 운영자 | 신청 view |
| POST `/applications/:id/consent-challenge` | `{}`; 본인 | `ApplicationTermsV4` typed payload |
| POST `/applications/:id/consent` | `{nonce, signature}`; 본인, `Idempotency-Key` 필수 | 신청 조건 동의 후 view |
| POST `/runtimes` | `{policyHash}`; sponsor와 일치하는 운영자 | 서버가 읽고 검증한 runtime. 요청에서 RPC/금고 주소를 받지 않음 |
| GET `/runtimes/:policyHash` | 로그인 | 불변 runtime record |
| POST `/applications/:id/final-consent-challenge` | `{}`; 본인 | `TermsAcceptanceV4` typed payload + runtime |
| POST `/applications/:id/final-consent` | `{nonce, signature}`; 본인 | 최종 동의 view; 동일 서명/nonce 재제출 멱등. 별도 Idempotency-Key 필수 아님 |
| POST `/applications/:id/funding-intent` | `{}`; sponsor 운영자 | `{transaction, application, approval}` |
| POST `/applications/:id/funding-confirmation` | `{transactionHash}`; sponsor 운영자 | 정확한 체인 거래·이벤트·예치를 검증한 view |

신청·동의 멱등 키는 같은 사용자 작업을 재시도할 때 유지하고, 새 작업에는 새 키를 사용한다. nonce는 challenge의 typed message에서는 `0x` 접두사가 있지만 동의 제출에서는 접두사를 제거한 64자리 hex다. 기존 `walletClient.consent()` / `finalConsent()`가 처리한다.

예치 intent의 `transaction`은 `{to, from, chainId, value, data}`, `value`는 `"0x0"`, chainId는 숫자다. `approval`은 `{token, spender, amount}`이고 amount는 문자열이다. 지갑 RPC 입력 변환과 승인 거래는 프론트 연결에서 구현·검증해야 한다. intent 생성은 거래 전송이 아니며 approval 필요량과 현재 allowance를 확인해야 한다. 서버 응답을 임의 주소·금액으로 덮어쓰지 않는다.

## B1 제품 증명 세션

[상세 계약·상태·합성 재현](PROOF_SESSIONS.ko.md)을 따른다. 동일 origin·인증 헤더·POST CSRF는 위와 같다. 본인 참가자만 접근하며 운영자 조회는 없다.

| 메서드·경로 | 입력 / 결과 |
| --- | --- |
| POST `/applications/:id/proof-sessions` | `{ownerPublicKey}` + Idempotency-Key → 세션 view |
| GET `/applications/:id/proof-sessions` | 본인 세션 view 배열, 최대 100개 |
| GET `/applications/:id/proof-sessions/:sid` | 세션 view |
| POST `/applications/:id/proof-sessions/:sid/authorize` | `{requestNonce, signature}` → 지갑 결합 승인 view |
| POST `/applications/:id/proof-sessions/:sid/cancel` | `{}` → 취소/종료 view |

`ISSUED → AUTHORIZED → CANCELLED/EXPIRED`이며 ISSUED에서 바로 취소/만료될 수도 있다. AUTHORIZED는 proof 검증 완료가 아니다. nonce는 승인 때 한 번 소비하고 동일 서명 재전송은 기존 기록만 반환한다. 이 경로의 **requestNonce는 0x를 포함**한다. 신청당 활성 세션은 하나, TTL 최대 30분, 승인에는 발급받은 동일 로그인 세션이 필요하다. 새 로그인에서는 조회·취소 후 새 owner/새 멱등 키로 다시 시작한다.

생성/승인은 제출 기간·현재 예치·발급/정산 여부와 체인 지문을 재검증한다. C1 기본 정책은 초기화 14일 뒤 제출 시작이므로 즉시 생성이 가능하다고 가정하지 않는다. F4는 [공통 승인 helper](PROOF_WALLET.ko.md)를 사용할 수 있으며 안전한 상세 오류 전달은 [공통 전송기](API_RECOVERY.ko.md)를 따른다. `/callback` 등 proof 성공 수락 API는 없다.

## 화면 상태

B2b는 POST `/applications/:id/proof-sessions/:sid/evidence`의 `{profile,bundle,sourceSignature,ownerSignature}`를 독립 검증하고 `ACCEPTED_SYNTHETIC` 영수증만 반환한다. GET `/applications/:id/proof-sessions/:sid/result`는 `NOT_ACCEPTED` 또는 과거 수락 영수증이다. B1 AUTHORIZED 및 결과 영수증은 서로 다른 상태다. POST는 동일 로그인 세션·CSRF가 필요하며 GET은 본인 과거 결과만 읽는다. 시험키/점수 snapshot을 노출하는 HTTP API는 없다. 기본 서버 원천 키가 null이면 수락을 차단하며 상세 오류·필드·크기·재시도 규칙은 B2b 문서를 따른다.

| state | 화면에서 말할 수 있는 사실 | 금지되는 추정 |
| --- | --- | --- |
| `DRAFT` | 신청 생성됨, 동의 전 | 등록·예치 완료 |
| `TERMS_ACCEPTED` | 신청 조건 확인됨 | 최종 계약 동의 완료 |
| `CONSENTED` | 표시한 배포 설정에 최종 동의 저장됨 | 예치 완료 |
| `FUNDING_PENDING` | 운영자가 예치 거래를 준비/재시도할 수 있음 | 거래 전송·성공 완료 |
| `ENROLLED` | 기록된 블록에서 예치 검증됨 | 현재 청구 가능·자격 충족·지급 완료 |

기본 view 필드는 `applicationId`, `learner`, `policyHash`, `state`, `consentDigest`, `createdAt`, `consentedAt`, `consentScope`, `contractConsentRequired`, `funded`, `paymentAllowed`, `dataMode`다. 초기 consent digest/시각은 null이며 시각은 문자열이다. 기본 scope는 `APPLICATION_ONLY`, contractConsentRequired는 true다.

최종 동의 후 funding view에는 `finalConsentDigest`, `runtimeConfigHash`, `fundingEvidence`가 추가되고 scope는 `CONTRACT`, contractConsentRequired는 false다. 증거는 null 또는 `{transactionHash, blockNumber, blockHash}`이며 blockNumber는 문자열이다. `funded`는 확인된 ENROLLED에서만 true, `paymentAllowed`는 항상 false, `dataMode`는 SYNTHETIC이다. 상세 구조는 [예치 문서](VAULT_ENROLLMENT.ko.md)를 따른다.

F0 mock은 이 상태와 필드의 합성 fixture를 사용한다. proof 성공·환급 가능 같은 미래 상태를 현재 API 응답으로 만들지 않는다. 버튼 활성 조건은 서버 권한·상태 검증을 대신하지 않는다.

## 지갑·오류 처리

`createWalletClient({provider, api, chainId})`는 `connect`, `login`, `resume`, `request`, `consent`, `finalConsent`, `authorizeProofSession`, `logout`, `dispose`를 제공한다. `finalConsent(id, reviewedRuntime)`에 넘길 runtime은 먼저 화면에서 사용자에게 보여준 전체 record다. challenge가 바뀌면 새 설정을 다시 확인해야 한다. 계정/체인 변경·disconnect는 진행 중 결과를 무효화한다.

서버 HTTP 오류는 `{code, message, retryable, nextAction, requestId}`다. 서버 message는 고정 일반 문구, retryable은 false, 401의 nextAction은 `SIGN_IN_AGAIN`, 그 외는 `CHECK_REQUEST`다. 브라우저 adapter는 기존 `.message`(401 `AUTH_REQUIRED`, 나머지 `API_REQUEST_FAILED`)를 유지하면서 상태와 일치하는 허용 목록 `.code` 및 제한된 `.requestId`만 전달한다. `.status/.outcome/.retryable/.nextAction`은 [공통 오류 복구 계약](API_RECOVERY.ko.md)에 따라 자체 계산한다. 서버/provider 원문과 임의 복구 지시를 전달하지 않는다. 쓰기 요청은 자동 재전송하지 않으며 timeout/취소가 서버 rollback을 뜻하지 않는다. `wallet.request`의 선택적 `signal`로 취소를 전달할 수 있다. 화면 적용은 별도 담당 범위다.

B1은 proof 만료 410과 활성/취소/owner 재사용/예치 상태 충돌 409를 추가한다. 상세 코드는 B1 문서를 따른다.

주요 HTTP 상태는 인증 실패 401, 권한/origin/CSRF/지갑 불일치 403, 미존재 404, 일부 멱등·신청 상태 충돌 409, 빈도 제한 429, 본문 크기 413, 나머지 규칙 위반 422, 내부 오류 500이다. 모든 상태 충돌이 409인 것은 아니다. 지갑 거절은 도구의 `WALLET_REJECTED`, 잘못된 체인은 `WRONG_CHAIN`, 변경은 `WALLET_CONTEXT_CHANGED`를 처리한다. 거절을 자동 재서명·재전송하지 않는다.

## 후속 계약 변경 절차

B2a의 [전체 시험 증거 계약](EXAM_EVIDENCE.ko.md)은 내부 합성 함수만 제공한다. `COMPLETE_SYNTHETIC`/`ON_HOLD`는 새 HTTP 상태나 B1 DB 상태가 아니다. 신뢰한 B1 AUTHORIZED view와 독립적으로 고정한 원천 manifest 지문을 입력으로 받아 완전성이 확인된 합성 exams snapshot 또는 보류를 반환한다. 실제 YBM 원천 인증·전체성·단회 proof 수락은 미구현이며 공개 `/verified`·`/consume` 경로를 추가하지 않았다. F4에서 세션 승인과 전체 시험 검증 완료를 구분한다.

후속 공통 API를 연결할 때도 세션 식별자·상태 전이·만료·재개·권한과 응답의 합성 예제를 먼저 추가한다. grant/outbox 전용 확대는 현재 보류다. 서버 구현과 시험이 없는 경로는 ‘제안’이라고 표시한다. 프론트와 mock은 이 변경을 따라가되, 서버 기능이 실제 병합되기 전에는 연결 완료로 보고하지 않는다.
