# 공통 API 오류·요청 복구 계약

2026-10-13, [이슈 #22](https://github.com/gw020328-oss/clear-education-v4/issues/22). PR #20 병합 `4a0cdc6` 기준의 지급 방식과 독립적인 작업이다. 기존 전송기는 401 외의 오류를 축약하고 네트워크/JSON 예외를 그대로 전달할 수 있었다. 안전한 상세 코드와 요청 결과의 불확실성을 전달하되 재전송 여부는 호출자가 기존 서버 계약으로 판단한다.

실제 YBM 전체 목록과 학습 제공자/API·인증·계정 연결 검증은 계속 **BLOCKED**다. grant/outbox·CLEAR 추가 지급 서명 및 종속 UI/API 확대는 보류한다. 새 서버 경로·DB schema·정책·금고·발급 기능을 추가하지 않는다. 800점 AND 80%/최고점 정책을 유지한다.

## 사용과 호환성

```js
import { createSameOriginApi } from './src/application/api-client.mjs';
const api = createSameOriginApi({ origin: window.location.origin, timeoutMs: 45000 });
const controller = new AbortController();
const applications = await api('/applications', { signal: controller.signal });
```

기존 `wallet-client.mjs`의 같은 이름 import도 유지한다. `wallet.request(path, {method, body, idempotencyKey, signal})`은 signal을 전달하며 기존 지갑/체인/CSRF 검사를 유지한다. 로그인·동의 서명 helper의 인자는 바꾸지 않는다. 화면 표시와 재로그인·복구 실행은 프론트 담당 범위다.

- HTTPS의 정확한 origin과 `/`로 시작하는 동일 origin 경로만 허용한다. 외부 URL·`//`·역슬래시·공백/제어문자·query/fragment를 거부한다. 현재 서버 계약의 GET/POST만 허용하고 GET body는 거부한다.
- 쿠키 `same-origin`, `cache: no-store`, `redirect: error`를 고정한다. 전송기는 쿠키/서명/응답을 저장·로그 출력하지 않는다.
- 기본 제한은 **45초**, `timeoutMs`는 정수 1~120000ms다. fetch부터 성공/오류 본문 읽기까지 적용하고 완료 시 타이머·리스너·reader를 정리한다. 브라우저 정지 중의 정확한 실시간 만료를 보장하는 서버 타이머가 아니다.
- 주입하는 `fetch`는 표준 Response/ReadableStream을 반환해야 한다. 실제 브라우저에서는 기본 fetch를 쓴다. 취소를 무시하는 시험용 fetch도 호출자 대기를 끝내며 뒤늦은 응답은 버린다.

## 오류 객체

`name: 'ApiRequestError'`와 아래 필드를 가진 Error다. HTTP 오류 `.message`는 호환성을 위해 401이면 `AUTH_REQUIRED`, 그 외는 `API_REQUEST_FAILED`다. 로컬 오류 message는 code와 같다. 지갑/provider helper의 기존 오류 계약은 별도다.

| 필드 | 의미 |
| --- | --- |
| `code` | 상태와 일치하는 허용 목록 코드 또는 고정 로컬 코드. 그 외는 401 `AUTH_REQUIRED`, 나머지 `API_REQUEST_FAILED` |
| `status` | 확인한 오류 HTTP 상태 또는 null. 네트워크/본문 읽기 중단·성공 파싱 실패는 null |
| `requestId` | 오류 JSON의 소문자 UUID v4만 전달. 없거나 형식 불일치면 null |
| `outcome` | `NOT_SENT`, `HTTP_ERROR`, `UNKNOWN` 중 하나 |
| `retryable` | GET의 일시적인 네트워크/timeout/429/5xx/체인 조회 오류만 true. 자동 재시도·성공 보장이 아님. POST는 항상 false |
| `nextAction` | 아래 고정 안내 값. 임의 문자열/URL을 실행하지 않음 |

허용 목록은 [api-client.mjs](../../src/application/api-client.mjs)의 `codes`다. 상태/코드 조합은 [서버](../../src/application/http.mjs)와 함께 검토한다. 새 서버 코드를 자동 허용하지 않으며 세부 schema/내부 검증 코드는 일반 오류로 남긴다.

오류 body는 `application/json`만, **4096바이트 이하**만 읽는다. 선언된 길이와 누적 바이트를 검사하고 초과/잘못된 UTF-8·JSON/배열·스칼라/HTML은 상세 정보 없이 버린다. 서버 `message`, `retryable`, `nextAction`, 추가 필드와 원문 fetch/JSON/abort 예외·URL·cause를 전달하지 않는다. 성공 JSON은 기존 계약 그대로 반환하며 오류 body 한도를 성공 응답에 적용하지 않는다.

로컬 코드는 `API_ORIGIN`, `API_REQUEST_INVALID`, `API_NETWORK`, `API_TIMEOUT`, `API_ABORTED`, `API_RESPONSE_INVALID`다. 초기 factory 설정 실패는 `ORIGIN_CONFIG` 또는 `API_CONFIG` Error다.

## 복구 판단

| 상황 | nextAction |
| --- | --- |
| 전송 후 POST 결과가 불명확함 | `CHECK_RESULT` (다른 안내보다 우선) |
| 401 / CSRF | `SIGN_IN_AGAIN` |
| 지갑 문맥 변경 | `RECONNECT_WALLET` |
| 실제 원천 검증 차단 `PROOF_SOURCE_INCOMPLETE` | `WAIT_FOR_SOURCE` |
| GET 일시 오류 / POST 일시 오류 | `RETRY_LATER` / `CHECK_RESULT` |
| 미확정 예치·복구 필요·결과 충돌·nonce 소비 | `CHECK_RESULT` |
| 기타 409/410, proof 브라우저 세션 변경, runtime 변경, 최종 동의 만료 | `REFRESH_STATE` |
| 위에 해당하지 않는 호출자 취소 | `NONE` |
| 그 외 | `CHECK_REQUEST` |

`NOT_SENT`는 입력 검증 실패나 fetch 호출 전 취소다. `HTTP_ERROR`는 오류 응답을 받았다는 뜻이며 모든 부수 효과의 rollback을 보장하지 않는다. `UNKNOWN`은 네트워크 단절·전송 후 취소/timeout·잘못된 성공 응답·5xx 등으로 결과를 단정할 수 없는 상태다. 취소는 서버 작업을 되돌리지 않는다. 모든 GET/POST에서 전송기는 **자동 재시도·재서명·새 멱등키 생성·세션 상태 수정**을 하지 않는다.

POST가 `UNKNOWN`이면 먼저 본인 신청/세션/결과를 다시 조회한다. 신청 생성은 기존 `/applications` 조회와 동일 body·동일 멱등키의 명시적 재호출로 복구할 수 있다. 목록은 최대 100건이므로 목록 부재만으로 미생성을 확정하지 않는다. 알려진 신청 ID는 직접 조회하고, 생성 응답을 잃었을 때 기존 키를 새 키로 바꾸지 않는다. 다른 POST는 각 API의 멱등·nonce·만료 계약을 따라야 하며 무조건 재전송하지 않는다. 원천 차단/검증 실패는 재시도로 실제 검증 완료가 되지 않는다.

## 검증과 담당자 영향

```sh
./tools/node --test tests/application/api-client.test.mjs tests/application/api-recovery-http.test.mjs tests/application/wallet.test.mjs
./tools/npm run test:applications
```

전송기 36개 + HTTPS 3개 + 지갑 signal 1개를 추가했다. 악성/과대/잘못된 형식 오류, 상태 불일치, 전송 전/후 취소, fetch/본문 deadline, 늦은 응답·reader/timer 정리, 원문 예외 차단을 검증한다. 실제 loopback TLS와 기존 서버·합성 DB로 401/403/404/409/410, 원천 차단, 쓰기 응답 유실→조회→동일 키 복구를 확인한다. 제품 세션 시험은 새 메모리 TEST 체인만 사용한다.

로컬 결과: 집중 시험 51개, application/policy/proof-sessions/product-proof/exam-evidence/learning-evidence/vault/dev 회귀 **524개 통과**, 실패/skip 0개. 집중 시험은 회귀에 포함되므로 합산하지 않는다. `verify:workspace`, `verify:dependencies`, 변경 문서의 로컬 링크 79개와 `git diff --check`도 통과했다. 공개 이력 검사와 정확한 head의 CI/병합 상태는 연결 PR에서 확인한다.

브라우저 쿠키 저장소는 Node 시험 bridge로 모사한다. UI/실제 확장 지갑 E2E 검증은 아니다. 표준 fetch/Headers/AbortSignal.any/ReadableStream을 쓰는 최신 Chrome 대상이다. 프론트 담당자는 `.message` 호환성과 새 `.code/.nextAction/.outcome`을 확인한다. `web/`, 서버 라우트·DB·루트 의존성·CI 설정은 변경하지 않으며 새 시험은 기존 `test:applications` CI에서 실행된다.
