# 프론트·백엔드 연결 계약 — PR #8 기준

2026-10-12, 제품 API는 PR #8 코드 `841052a` 기준이며 C1은 기존 인증·요청 계약을 유지한다. 후속 proof/시드/outbox/청구 API는 아직 없다. 실행은 [C1 로컬 합성 HTTPS 안내](LOCAL_SYNTHETIC.ko.md)를 따른다. 개발 전용 `GET /__dev/config`와 제한된 `POST /rpc`, 정적 프론트 빌드가 같은 origin에서 제공된다. 개발 경로는 제품 proof·지급 API가 아니다.

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

## 화면 상태

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

`createWalletClient({provider, api, chainId})`는 `connect`, `login`, `resume`, `request`, `consent`, `finalConsent`, `logout`, `dispose`를 제공한다. `finalConsent(id, reviewedRuntime)`에 넘길 runtime은 먼저 화면에서 사용자에게 보여준 전체 record다. challenge가 바뀌면 새 설정을 다시 확인해야 한다. 계정/체인 변경·disconnect는 진행 중 결과를 무효화한다.

HTTP 오류는 `{code, message, retryable, nextAction, requestId}`다. 현재 message는 고정 일반 문구, retryable은 false, 401의 nextAction은 `SIGN_IN_AGAIN`, 그 외는 `CHECK_REQUEST`다. **현재 브라우저 adapter는 401을 `AUTH_REQUIRED`, 나머지를 `API_REQUEST_FAILED`로 축약한다.** 상세 code가 화면에 전달된다고 가정하지 않는다. 확장한다면 허용 목록의 안전한 code만 전달하고 원문 서버/provider 오류·URL을 노출하지 않도록 별도 검증한다.

주요 HTTP 상태는 인증 실패 401, 권한/origin/CSRF/지갑 불일치 403, 미존재 404, 일부 멱등·신청 상태 충돌 409, 빈도 제한 429, 본문 크기 413, 나머지 규칙 위반 422, 내부 오류 500이다. 모든 상태 충돌이 409인 것은 아니다. 지갑 거절은 도구의 `WALLET_REJECTED`, 잘못된 체인은 `WRONG_CHAIN`, 변경은 `WALLET_CONTEXT_CHANGED`를 처리한다. 거절을 자동 재서명·재전송하지 않는다.

## 후속 계약 변경 절차

B1 이후에는 세션 식별자·상태 전이·만료·재개·권한과 응답의 합성 예제를 먼저 추가한다. 서버 구현과 시험이 없는 경로는 ‘제안’이라고 표시한다. 프론트와 mock은 이 변경을 따라가되, 서버 기능이 실제 병합되기 전에는 연결 완료로 보고하지 않는다.
