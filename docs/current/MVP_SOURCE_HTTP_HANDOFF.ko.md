# MVP HTTP 연결·서준형 프론트 인계

버전 `clear-mvp-source-http.1` + C1 `clear-mvp-student-http.1` / 2026-10-15 / **원문 PR59 develop 병합 완료 / C1 PR61 Draft**.
C1 브랜치 `codex/mvp-student-application-http`, 초기 코드 `7c564429b5c55665b8575491a8c417040a8805ef` + clock/정책 alias 보정 `680bce36c2306b38615a3731da611fececa71a7b`, 쓰기 transaction 내부 세션 재검사 코드 `922ada6fe45dde53135ece116e90531aa0b662a9`, 최초 선행 PR59 head `11e27aca483441aecda757686c2d3826e5360ac4`에서 출발했으며, PR59 최종 head `112e93a36c2b19cdddef15cd44f7c106eb6030be`의 develop merge `2bb6d291b77ba397f8544995557db78b3ce54724`를 정상 merge로 포함했다. 후속 [Draft PR #61](https://github.com/gw020328-oss/clear-education-v4/pull/61), 최종 CI는 해당 PR과 이슈55를 확인한다.
현재 기반 develop `2bb6d291b77ba397f8544995557db78b3ce54724`(#56/#58/#57/#59 통합), 구현 브랜치 `codex/mvp-http-integration`. 구현 코드 커밋 `032215f2d50261808c62675d9880b45ef2e00cb0`, 병합 완료 [PR #59](https://github.com/gw020328-oss/clear-education-v4/pull/59). 이후 인계/검증 문서 커밋은 코드 변경과 구분한다. 이 문서가 이번 프론트 연결의 단일 시작점이다.

## 현재 구현과 다음 의존

| 구분 | 상태 |
| --- | --- |
| A: 기존 서명 로그인·역할/CSRF, 별도 저장소·멱등/CAS·개발 listener | PR59 develop 병합 완료 |
| B: 등록 URL ID→원문 archive/부분 상태→조회→mock 초안→정확 표시 확인 기록 | PR59 develop 병합 완료. 실행 예시는 **MOCK**, 실제 URL/유료 모델 호출0 |
| C1: 학생 본인 신청·서버 합성 조건 표시·합성 확인/정책 변경 재확인 | 후속 Draft 구현. `clear-mvp-student-http.1`, 아래 C1 API만 가용. **실제 동의 아님** |
| C2: 파일 접수/bytes·문서 검토run·보완/재제출 | **미구현**. `documentSubmissionReady:false`, 업로드/검토 API 호출 금지 |
| D: 새 원문 HTTP용 브라우저 adapter·예제·검사 | 이번 Draft 제공. 실제 `web/` 연결은 서준형 담당/미연결 |
| 운영 원천 진위/적용성/동일인·정책 게시·실동의·Evidence/M2 영속 판정·재원 | **미완료**. mock/검토 기록은 운영 보장이 아님 |

소유 확인: 공개 열린 PR0개를 조회했으며, 원격 `codex/frontend-shell`의 최신 `dc9bc62629daaf498e073a6aaab6527fed6d6fed`는 작성 계정 `puppy57201-stack`, 문서상 담당 서준형의 F0다. 이는 최초 원문 HTTP 단위의 관측이다. C1 시작 시 다시 조회한 원격 head는 `9c03b7bbb612ebf1f18fb2181944382468d40ba7`이며 서준형의 조건/정책/검증단계 화면과 develop 이력 merge가 추가됐다. 이후 공개된 [프론트 PR #60](https://github.com/gw020328-oss/clear-education-v4/pull/60)의 head `4219a53bb5cb7efa2ca3e48939bd82de69e071d7`와 web-only 수정 경로를 다시 확인했다. `web/`의 새 policy-view/conditions/step-detail/timeline·시험과 두 반 안내문 반영은 서준형 작업이며 이 백엔드 PR에서 수정하지 않는다. 공개 후속 commit/PR 부재가 미공개 로컬 변경 부재를 뜻하지 않는다. 사용자 답변으로 **web/·지갑 UI·기존 F0 adapter는 서준형 소유**를 확정했다. 통합 세션은 `web/`를 편집하거나 팀원에게 직접 외부 메시지를 보내지 않는다.

백엔드 소유: `src/product-workflow/http-*`, `src/application`의 인증/라우팅 연결, 공개 자산 로더 재사용, 전용 `specs/m3`·tests·tools·현행 문서. F0의 엄격한 ApplicationView 및 `listApplications/getApplication/describe`는 그대로다. 새 원문용 client는 별도 namespace이며 기존 ApplicationView에 필드를 추가하지 않는다.

## 실행 가능한 개발 환경

Node24.21.0/npm11.19.0과 저장소 tools 실행기를 사용한다. 기존 환경/DB/체인/키를 가져오지 않는다. 아래 주소는 새 무가치 TEST 지갑의 **공개 주소**다. 키를 명령·문서·브라우저 번들에 넣지 않는다.

```sh
# 비밀 없는 설정 예시. 실제 사용하는 새 TEST 지갑의 공개 주소로 지정한다.
export CLEAR_MVP_OPERATOR='0x0000000000000000000000000000000000000001'
export CLEAR_MVP_PARTICIPANT='0x0000000000000000000000000000000000000002'
./tools/node tools/mvp-source-dev.mjs init --name source-demo --port 9443 --chain-id 431701 --operator "$CLEAR_MVP_OPERATOR" --participant "$CLEAR_MVP_PARTICIPANT"
./tools/node tools/mvp-source-dev.mjs start --name source-demo
```

예시의 임의 주소만 지정하면 그 주소로 로그인할 수는 없다. 소유한 새 TEST 지갑의 공개 주소로 바꾸고 해당 지갑의 EIP-1193 서명을 사용한다. 인증/상태 자동 데모는 아래 명령으로 새 메모리 TEST 지갑을 만들어 실행하고 끝에 전용 임시 파일을 정리한다. 개인 계정/기존 키나 체인을 사용하지 않는다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs specs/m3/http-demo.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/http*.test.mjs
```

base URL은 `https://127.0.0.1:9443`, listener도 IPv4 loopback만이다. `var/mvp-source/source-demo`에 새 인증 DB·MVP DB·공개 원문 archive·로컬 인증서/공개 주소 설정이 생성된다. 기존 이름 재초기화는 EEXIST로 거부한다. 기본 환경과 CLI는 **MOCK 고정**이며 실제 사이트나 모델을 호출하지 않는다. sourceType은 실제 fixture provenance인 PASTE로 남고 응답 captureMode도 MOCK이다. PUBLIC_URL 실행 모듈은 호스트의 명시 설정 전용이고 이번 실제 URL 수집 검증은 없다.

서버 인증서는 이 새 환경의 CA로 검증해야 한다. 브라우저 신뢰 설치는 자동 수행하지 않는다. 본인이 생성한 `var/mvp-source/source-demo/ca.pem`만 수동으로 검토/신뢰하고 TLS 검증을 끄지 않는다. 비밀인 ca.key/server.key/source-http.json·DB는 정적 자산으로 제공하지 않는다. `/__dev/config`는 origin/chainId·초대 공개 주소·MOCK/합성 표시만 반환한다. 체인·RPC·금고/예치는 이 서버가 만들지 않는다. 지갑의 연결 chainId는 명시 설정과 같아야 한다.

서버는 시작할 때 `web/dist`의 제한된 공개 자산을 스냅샷으로 읽는다. 그 폴더가 없으면 HTML 화면은 제공하지 않고 API만 동작한다. `web/dist` 출력은 프론트 담당자가 준비한다. 별도5173 개발 서버에서9443으로 cross-origin 쿠키/API를 호출하는 CORS 우회는 제공하지 않는다. 같은9443 출처의 화면에서 호출한다. 시작 전 프론트 산출물이 준비돼야 하며 자산 변경 후 서버를 재시작한다. 브라우저용 client 한 파일 외 Node/DB/collector/specs를 정적 산출물에 복사하지 않는다.

정상 종료는 Ctrl-C이며 처리 중 HTTP를 취소/정리하고 DB·archive는 보존한다. 강제 종료 뒤 run.lock이 남으면 실제 종료 확인 후 `./tools/node tools/mvp-source-dev.mjs unlock --name source-demo`를 사용한다. 살아 있거나 재사용된 PID는 보수적으로 차단한다. 기존 환경을 reset하거나 볼륨/브랜치를 삭제하지 않는다.

## 인증·권한·동의의 의미

기존 `/auth/nonce`→지갑 서명→`/auth/verify`를 재사용한다. 초대 participant/operator는 호스트 설정이 정한다. 역할·wallet·actor·verified를 요청 body로 지정할 수 없다. 세션은 HttpOnly/Secure/SameSite=Strict host cookie이며 token을 JSON/브라우저 저장소에 넣지 않는다. 요청은 정확 Host/Origin·동일 출처, `x-wallet`, `x-chain-id`를 검사하고 POST는 세션에 결합된 `x-csrf-token`도 검사한다. 비동기 원문/AI 처리 후 세션/로그아웃·역할/CSRF를 다시 검사한다. 외부 배포·reverse proxy 운영 경로가 아니다.

이 인증은 초대한 지갑의 서명·현재 세션 제어를 검사한다. 학생 실명/동일인·기관 권한·실제 학생 동의/계약 체결을 증명하지 않는다. 원문 namespace의 source API는 **operator만** 호출한다. 별도 C1 student namespace는 **participant만** 호출하며 operator의 학생 신청 조회/수정도 거부한다. 학생 role로 조회/등록/운영자 확인을 시도하면403이다. 운영자 확인은 `SYNTHETIC_REVIEW_ONLY`, source/초안의 정확 표시 DTO 지문을 확인한 **개발용 검토 기록**이다. 정책 게시·학생 동의·자격·지급을 승인하지 않는다.

## 구현된 API

모든 성공 응답은200 JSON/no-store/nosniff다. 키는 `[a-z][a-z0-9.-]{0,63}`이며 POST snapshots/drafts/reviews에는 수동으로 정한 `Idempotency-Key`를 전달한다. JSON body는64KiB 이하다. URL 문자열·헤더/쿠키·M1 pins·RunContext를 body로 받지 않는다.

| 메서드/경로 | 요청 / 반환 |
| --- | --- |
| GET `/mvp/source-bundles` | 설정된 bundleId/sourceId·기관/상품/반·requiredSourceIds/urlIds와 현재 command revision·공식 URL ID 목록 |
| POST `/mvp/source-bundles/:id/snapshots` | `{expectedRevision:0,urlId:0}` → Operation. 호스트 설정 URL ID만 허용. 실제 원문 bytes는 서버에서 수집/보관 |
| GET `/mvp/source-bundles/:id` | SourcePreview: revision/bundleRevision/hash/status/missingSourceIds/sourceCurrent, snapshot·scope/시간/부분/요청 상태·plain text blocks, 현재 draft, previewHash, operation metadata |
| POST `/mvp/source-bundles/:id/drafts` | `{expectedRevision:1,bundleHash}` → Operation. 호스트의 독립 M1 pins·template만 소비. 임의 captured bytes에서 공식 pin 자동 생성 없음 |
| POST `/mvp/source-bundles/:id/reviews` | `{expectedRevision:2,previewHash,acknowledgement:"SYNTHETIC_REVIEW_ONLY"}` → 검토 영수증. 표시된 원문·초안·현재 operation 상태를 hash에 결합 |
| GET `/mvp/source-bundles/:id/reviews` | 최근 검토20개. `current:false`는 이전 이력이며 현재 승인으로 표시 금지 |
| GET `/mvp/operations/:operationId` | 해당 operator 본인 작업의 현재 상태/결과. 다른 actor의 operation ID는404 |
| GET `/mvp/source-bundles/:id/operations/:kind/:key` | kind=snapshots/drafts. **POST 응답 유실 시 같은 actor/route/key로 GET 복구**. 다시 URL/모델을 실행하지 않음 |
| POST `/mvp/operations/:operationId/cancel` | `{}` → RUNNING/COMMITTING만 취소. 이미 SUCCEEDED인 과거 결과를 취소로 바꾸지 않음 |

command revision은 snapshots/drafts 새 작업 예약 때 증가한다. source bundleRevision은 실제 archive 버전이며 둘은 다를 수 있다. 표시/검토에는 preview의 현재 command revision을 사용한다. 이전 작업 결과가 늦게 오면 SUPERSEDED이며 현재 값으로 복구되지 않는다. 같은 키/다른 body는409 IDEMPOTENCY_CONFLICT, 새 시도는 명시한 새 키와 최신 revision으로만 실행한다. POST 자동 재전송/자동 새 키 생성은 금지한다. 검토 영수증 재조회는 기존 키의 같은 요청을 멱등 반환하고 이력이면 current=false다.

Operation.state는 RUNNING/COMMITTING/SUCCEEDED/FAILED/CANCELLED/TIMED_OUT/SUPERSEDED다. **SUCCEEDED는 처리·저장 완료이며 원문 수집 완전성/조건 충족이 아니다.** `result.retrievalStatus`의 FAILED/PARTIAL과 source preview의 NEEDS_SUPPLEMENT를 별도로 표시한다. source status는 NEEDS_SUPPLEMENT 또는 READABLE_UNVERIFIED이며 후자도 진위·공식 적용성 미확인이다. command 중에는 과거 source를 이력으로 보여줄 수 있지만 sourceCurrent=false이면 검토 버튼을 활성화하지 않는다.

공통 응답 제한은 `dataMode:SYNTHETIC`, `captureMode:MOCK|PUBLIC_URL`, `authenticationScope:INVITED_WALLET_SESSION`, identityVerified/sourceVerified/userConsentVerified/policyPublished/productEligible/paymentAllowed=false, fundingStatus=UNKNOWN, grant/outbox=HOLD, independentClaim=NO_GO다. source image가 읽혔어도 signature-only는 IMAGE_NOT_DECODED이며 완전 decode/PASS로 승격하지 않는다.

실제 합성 loopback HTTP 응답으로 만든 [요청/응답·409 stale·403 권한 예제](../../specs/m3/source-http-responses.json)를 함께 제공한다. token·서명·키는 포함하지 않는다. 예제의 ID/hash/fixture 시각은 실행 권한으로 재사용하지 않으며 CLI의 synthetic-demo와 테스트 fixture의 bundle-a 이름은 구분한다. 기존 C1 `tools/dev.mjs`/8443에는 이번 MVP service가 자동 연결되지 않으므로 위 전용 CLI/9443을 사용한다.

예제 흐름(실제 값은 응답에서 가져온다):

```js
const catalogue = await sourceClient.catalogue();
const operation = await sourceClient.capture('synthetic-demo',
  { expectedRevision: catalogue.bundles[0].revision, urlId: 0 },
  { idempotencyKey: 'source-capture-1' });
const preview = await sourceClient.preview('synthetic-demo');
const draftOperation = await sourceClient.propose('synthetic-demo',
  { expectedRevision: preview.revision, bundleHash: preview.bundleHash },
  { idempotencyKey: 'source-draft-1' });
const displayed = await sourceClient.preview('synthetic-demo');
// 화면에서 displayed의 자료·초안·미확정/부분 상태를 실제로 보여준 뒤 사용자 클릭 시:
const review = await sourceClient.review('synthetic-demo',
  { expectedRevision: displayed.revision, previewHash: displayed.previewHash,
    acknowledgement: 'SYNTHETIC_REVIEW_ONLY' },
  { idempotencyKey: 'source-review-1' });
// 응답을 잃으면 자동 POST 대신:
const recovered = await sourceClient.recover('synthetic-demo', 'drafts', 'source-draft-1');
```

서버에 성공이 저장돼도 응답 유실/브라우저 취소가 있을 수 있다. 실패 화면에서 새 제출/중복 호출을 자동 생성하지 않는다. 상태를 GET으로 확인한 뒤 사용자가 명시적으로 새 시도를 선택한다.

| HTTP/코드 | UI 처리 |
| --- | --- |
| 401 AUTH_REQUIRED/AUTH_CHALLENGE/SIGNATURE | 로그인 필요. 현재 지갑/세션 재확인 |
| 403 FORBIDDEN/CSRF/ORIGIN/WALLET_CONTEXT_CHANGED/TRANSPORT | 역할·동일 출처·지갑/세션 확인. 본문으로 권한 지정 금지 |
| 404 MVP_NOT_FOUND/ROUTE | 없음/접근 범위 밖 또는 미구현 경로. 빈 결과와 구분 |
| 409 MVP_STALE | 최신 preview 재조회 후 변경 내용 표시. 과거 previewHash 재승인 금지 |
| 409 IDEMPOTENCY_CONFLICT | 같은 키로 요청 내용 변경 금지. 과거 operation 확인 |
| 409 MVP_TEMPLATE_REQUIRED | 호스트의 독립 원문 pin/template 준비가 필요. 프론트에서 pin 생성 금지 |
| 409 MVP_BUSY/MVP_CLOSED | 현재 작업/개발 저장소 상한·종료 상태 확인. 자동 재시도 금지 |
| 410 SOURCE_EXPIRED | 원문 만료/새 수집 또는 보완 필요. 이전 관찰을 현재로 표시 금지 |
| 413 BODY_SIZE / 422 입력 오류 | 자료/요청 수정. provider/stack/원문 오류를 표시하지 않음 |
| 500 INTERNAL_ERROR 또는 network/timeout | 고정 오류 표시·GET 복구. raw 서버 메시지나 URL·키를 로그에 복사하지 않음 |

Operation.reason은 CANCELLED/TIMED_OUT/STALE_CONTEXT/SOURCE_UNAVAILABLE/DRAFT_UNAVAILABLE 또는 null이다. source/초안 부족은 HTTP500과 다르다. 보완 자료·미수집 가이드/JS/image·만료 이유를 사용자 말로 표시한다. 내부 DB/해시/모델 이름은 일반 사용자 화면에서 기본 설명으로 노출하지 않는다.

## 프론트 adapter와 화면 수용 기준

브라우저 전용 `src/product-workflow/http-client.mjs`는 Node import/키/영속 저장이 없다. 검증된 기존 지갑 controller의 `request`를 주입한다.

```js
// 아래 한 파일은 프론트 빌드에 포함해도 된다. Node 서버 모듈은 포함하지 않는다.
import { createWorkflowSourceClient } from './bundled-workflow-source-client.js';
const sourceClient = createWorkflowSourceClient({ request: walletClient.request.bind(walletClient) });
```

브라우저 import 경로/번들링·지갑 UI 자체는 서준형 소유이며 기존 F0의 ES 모듈 구조를 보존해 연결한다. `walletClient`가 아직 없으면 F1 지갑 연결·서명 거부/계정·체인 변경·resume/logout을 별도 검증하고 연결한다. root server 파일을 복사해 브라우저 인증을 흉내내지 않는다. 기존 `createSameOriginApi`는 HTTPS same-origin/HttpOnly cookie와 고정 오류·timeout/취소·수동 복구를 유지한다. auth/CSRF 상태는 메모리만 사용하고 localStorage/sessionStorage에 token·서명·키·자료를 넣지 않는다.

- 기존 F0 합성 목록·상세/5상태·빈 목록/로딩/오류와 엄격 DTO 검사가 유지된다.
- 새 운영자 원문 화면은 목록/아직 수집 없음/수집 중/부분·실패/초안·질문/검토 이력을 구분한다. mock 배너를 항상 표시한다.
- blocks/quote/questions는 **textContent** 또는 검증된 텍스트 렌더로만 표시한다. innerHTML/iframe/srcdoc, 원문 script 실행, 원문 URL 자동 embed/fetch는 금지한다.
- 등록 버튼 중복/응답 유실/취소·새로고침·서버 재시작에서 같은 key GET 조회로 같은 결과를 확인한다. GET 실패를 성공/빈 목록으로 만들지 않는다.
- source refresh·draft 실행으로 command revision이 바뀌면 과거 previewHash 확인 버튼을 비활성화하고 새 표시를 요구한다. 늦은 응답이 현재 화면을 덮어쓰지 않게 요청 세대/취소를 검사한다.
- 검토 기록은 “개발용 검토 기록됨”이며 “정책 승인/학생 동의/자격 충족/환급 가능”으로 표시하지 않는다. 재원은 “미확정”이며 0원/지급 가능으로 추정하지 않는다.
- C1 학생 신청/조건 표시/합성 확인은 아래 별도 namespace로만 연결한다. C2 서류 제출·보완/검토run은 미구현이므로 업로드 완료·가짜 성공 요청을 만들지 않는다. `documentSubmissionReady:false`를 존중한다.
- 좁은 화면·키보드·로딩/오류/보완·지갑 거절/계정·체인 변경·세션 만료·동일 출처·권한 오류를 시험한다.

## 저장·복구·보관 정책

새 source-workflow/mvp-http.sqlite(schema1)에는 command heads·actor/route/key/requestHash·30초 작업·공개 원문에 대한 제한된 초안/검토 지문을 저장한다. sources.sqlite는 기존 immutable source archive이며 raw/text와 실패 resourceRequests를 결합한다. authentication/applications.sqlite는 이 새 개발환경만의 서명 로그인 저장소다. 기존 사용자 DB 마이그레이션은 **없다**. 환경/기관·상품·반·pins/model 설정 지문 불일치와 불완전한 기존 schema는 조용히 초기화하지 않고 시작을 거부한다.

새 디렉터리0700/파일0600. 공개 원문·공개자료 초안의30일 만료를 조회 시 검사하고 시작/인증된 조회·등록 시 논리 purge한다. source bytes와 원문 의존 draft result를 제거하고 버전 tombstone/중복 방지 키·검토 hash는 유지한다. SQLite/디스크 잔재 완전 삭제 보장은 아니다. 최대120 snapshot/1000 operation/1000 review의 개발 상한이 있으며 상한을 지우려고 과거 DB를 reset하지 않는다. 학생 원문·실서류 업로드는 받지 않는다. 운영 개인자료/실동의/장기 확정 정책 보관 관문은 여전히 OPEN이다.

두 DB 사이에는 COMMITTING 복구 marker를 먼저 쓰고 immutable archive를 기록한 뒤 결과를 확정한다. 중간 종료 후 GET은 **이미 보관된** 정확 snapshot/bundle만 화해해 복구한다. bytes가 저장되지 않았다면 작업은 기한까지 RUNNING/COMMITTING으로 남고 TIMED_OUT으로 보류한다. 재시작이 URL/모델을 자동 재호출하지 않는다. 새 revision/명시 취소는 늦은 결과를 현재로 수락하지 않는다. 실제 다중 서버 운영/분산 worker는 이 개발용 단위 범위가 아니다.

예치율/보관율/배정 우선/충전·회수 정책OPEN,자격과 재원분리,400%사전검토만·자동자격/지급금지,500%제외,원천/동일인미확인보류,grant/outboxHOLD·독립claimNO-GO를 유지한다. PR59는 사용자 승인에 따라 최종 실질 검토·CI6/6·미해결 대화0을 확인한 뒤 develop에 정상 병합했다(merge2bb6d29). 학생 C1 후속 PR과 프론트 PR의 자동 병합 권한은 없으며 main 병합·배포·유료 호출도 없다.

## C1 학생 신청·합성 확인 HTTP

버전 `clear-mvp-student-http.1`, displayVersion `clear-mvp-student-display.1`, previewVersion `clear-mvp-student-preview.1`. 선행 PR59 원문 API는 develop에 병합됐으며 C1의 선행 의존은 해소됐다. C1은 최신 develop2bb6d29를 포함하는 **별도 후속 Draft PR**이고 PR59 승인/병합 권한을 자동 승계하지 않는다.

같은 전용 CLI9443에서 기존 초대 participant의 서명 로그인·HttpOnly 세션·Origin/CSRF를 재사용한다. `/__dev/config.studentHttpVersion`과 `studentApplicationHttpImplemented:true`로 가용성을 확인한다. 기존 C1 `tools/dev.mjs`/8443에 이 namespace를 자동 추가하지 않는다. source API는 operator, student API는 participant로 분리하며 학생은 자기 신청만 볼 수 있다. 다른 학생 신청/operation은404, operator의 학생 API 호출은403이다.

**실행 설정과 정책 관문:** 호스트가 검토한 고정 SYNTHETIC configuration만 기존 MVP compiler/독립 source·capability pins로 검증해 등록한다. 기본은 기존 third 합성 예제이며 F0의 기존 800점/80% fixture를 변경하거나 재해석한 것이 아니다. source의 OFFICIAL_DRAFT/운영자 검토 결과를 자동 게시/승격하지 않는다. 설정이 없으면 정책 목록은 비고 신청은409 MVP_POLICY_UNAVAILABLE로 막힌다. 정책 게시 API·실제 학생 계약/동의는 없다. 호스트 설정 revision의 역행/같은 revision 내용 변경은 시작을 거부한다.

| 메서드/경로 | 요청 / 결과 |
| --- | --- |
| GET `/mvp/policies` | 현재 host 합성 정책 목록. policyId/revision/hash·SYNTHETIC_READY·정확 display/displayHash |
| GET `/mvp/policies/:policyHash` | 고정 조건 조회. 과거 버전은 policyCurrent=false·SUPERSEDED_SYNTHETIC/UNAVAILABLE로 구분 |
| POST `/mvp/applications` | `{policyHash}` + Idempotency-Key → 원자 command 영수증. 서버가 applicationId/학생·수령인 참조/instance/Binding을 구성 |
| GET `/mvp/applications` / GET `:id` | 학생 본인 신청 목록/상태. F0의 ApplicationView와 별도 구조 |
| GET `/mvp/applications/:id/agreement-preview` | application/expectedRevision·Binding·policy/sourceSet/rule hash·정확 display와 displayHash·previewHash, SYNTHETIC_ACK_ONLY |
| POST `/mvp/applications/:id/agreement` | `{expectedRevision,previewHash,acknowledgement:"SYNTHETIC_ACK_ONLY"}` + key → 합성 확인 기록/ACKNOWLEDGED_SYNTHETIC |
| GET `/mvp/applications/:id/agreements` | 본인 확인 이력20개. current=false는 과거 기록이며 현재 동의가 아님 |
| POST `/mvp/applications/:id/policy-selection` | `{expectedRevision,policyHash}` + key → 같은 policyId의 최신 host 설정을 명시 선택. DRAFT/새 Binding revision·새 표시 확인 필요 |
| GET `/mvp/student-operations/:operationId` | 본인 원자 command 영수증 조회 |
| GET `/mvp/applications/operations/:key` | create 응답 유실 후 같은 actor/route/key GET 복구 |
| GET `/mvp/applications/:id/operations/:kind/:key` | kind=agreement/policy-selection. 같은 actor/app/route/key GET 복구 |

성공은200 JSON. POST JSON≤64KiB·동일 출처·CSRF·명시 Idempotency-Key(소문자 slug≤64자)를 사용한다. client body에 wallet/actor/recipient/Binding/display/verified/서명·파일을 추가할 수 없다. C1의 합성 확인은 지갑 세션/CSRF로 누가 어떤 DTO에 확인을 요청했는지 기록하며 **표시 내용에 대한 별도 지갑 서명·실제 학생 동의·실명/동일인 증명이 아니다**. 브라우저가 실제로 읽었다는 사실도 서버 hash만으로 증명하지 않는다. 화면에서 전체 표시 DTO를 보여주고 사용자가 명시적으로 확인한 뒤에만 POST한다.

새 command는 한 SQLite BEGIN IMMEDIATE에서 요청 지문/신청 revision/확인 기록·결과를 같이 저장한다. 반환 `state:RECORDED`는 명령 저장이며 자격/동의 승인 상태가 아니다. `result.state`는 DRAFT 또는 ACKNOWLEDGED_SYNTHETIC. 현재 host 정책이 바뀌거나 비활성화되면 GET 신청은 POLICY_CHANGED/POLICY_UNAVAILABLE, 과거 acknowledgment.current=false다. `policy-selection` 뒤에는 DRAFT와 새 revision/previewHash를 받아 다시 확인한다. 자동 재선택·과거 확인 복원/자동 재동의는 하지 않는다.

원자 command 영수증에는 operationId/applicationId/applicationRevision/current/reason/result가 있다. 그 후 신청 revision이나 정책이 바뀌면 current=false·result=null이며 reason은 STALE_CONTEXT/POLICY_CHANGED/POLICY_UNAVAILABLE다. 이때 외부 applicationId로 GET 최신 신청을 읽는다. 같은 키/다른 body는409 IDEMPOTENCY_CONFLICT, 다른 키로 중복 신청하면409 MVP_APPLICATION_EXISTS다. 같은 학생/같은 policyId의 신청은 하나이며 조건 변경은 기존 신청에서 명시 선택한다. 새로고침 후에는 본인 목록/상세 또는 같은 키 GET 복구를 사용하고 POST를 자동 재전송하지 않는다.

HTTP401/403/404·BODY_SIZE/입력422는 위 공통 인증·입력 규칙을 따른다. 추가409는 MVP_STALE/MVP_POLICY_UNAVAILABLE/MVP_APPLICATION_EXISTS/IDEMPOTENCY_CONFLICT/MVP_BUSY다. timestamps는 C1에서 **숫자 초 단위**이며 F0의 문자열 시각 DTO를 바꾸지 않는다. C1 응답도 identityVerified/userConsentVerified/sourceVerified/policyPublished/productEligible/paymentAllowed=false, documentSubmissionReady=false, fundingStatus=UNKNOWN·eligibilityStatus=NOT_EVALUATED·sourceStatus=UNVERIFIED, grant/outboxHOLD·independentClaimNO_GO다.

```js
import { createStudentWorkflowClient } from './bundled-student-http-client.js';
const studentClient = createStudentWorkflowClient({ request: walletClient.request.bind(walletClient) });
const configured = (await studentClient.policies()).policies[0];
// 없으면 정책 미준비를 표시하고 신청하지 않는다.
const created = await studentClient.create({ policyHash: configured.policyHash },
  { idempotencyKey: 'student-create-1' });
const applicationId = created.applicationId;
const shown = await studentClient.preview(applicationId);
// shown.display 전체의 조건·합성/미확인·재원미확정을 보여주고 사용자 확인 후:
const receipt = await studentClient.acknowledge(applicationId,
  { expectedRevision: shown.expectedRevision, previewHash: shown.previewHash,
    acknowledgement: 'SYNTHETIC_ACK_ONLY' }, { idempotencyKey: 'student-ack-1' });
// 응답을 잃으면 재전송 대신 GET:
const recovered = await studentClient.recover(applicationId, 'agreement', 'student-ack-1');
const current = await studentClient.get(applicationId);
```

합성 [C1 요청/응답·표시 DTO·권한/stale 예제](../../specs/m3/student-http-responses.json)를 제공한다. responseProjection 표시는 실제 응답에서 일부 필드만 발췌한 것이며 실제 확인에는 GET 전체 display를 사용한다. 예제의 application/hash/preview는 다른 신청·서버 권한으로 재사용하지 않는다. 자동 검증 예제는 다음과 같다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs specs/m3/student-http-demo.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/student*.test.mjs
```

저장은 새 student-workflow/mvp-student.sqlite(schema1)로 분리한다. 기존 사용자/원문/서명 DB migration은 없다. host 정책 버전·정확 표시/합성 확인과 중복 방지 명령 이력은 불변이며 새 버전은 append한다. 최대16 active 정책/500 신청/2000 command의 개발 상한이다. 같은 policy hash를 다른 revision/별칭으로 재등록하거나 시계를 거슬러 확인 시각을 이전 신청 revision보다 앞에 기록하는 것은 거부한다. 파일·학생 서류·원문 proof·생성 모델 출력·쿠키/token·서명은 이 DB에 넣지 않는다. 기록된 학생/운영자는 이 시험의 새 TEST 지갑이며 실제 학생/개인자료 검증은0이다. 실제 학생 동의/개인자료의 운영 보관·삭제 정책은 후속 관문이다.

C2의 file 접수/bytes manifest·문서 검토run/취소/보완·재제출은 이 버전에 **없다**. `/submissions`, `/review-runs`, `/evaluations` 같은 미구현 endpoint는404이며 문서 업로드 완료 UI를 만들지 않는다. 이번 합성 확인을 운영 Evidence·환급 자격/재원·지급으로 표시하지 않는다.

## Claude Code 복붙용 작업 지침

```text
CLEAR 프론트 담당 서준형의 작업을 이어간다. 먼저 최신 origin/develop와 루트/제품 AGENTS.md, docs/current/MVP_SOURCE_HTTP_HANDOFF.ko.md, API_CONTRACT/PRODUCT_WORKFLOW_CONTRACT, 현재 열린 PR을 읽는다. 이 문서에 기록된 backend 코드 커밋/검토 PR의 최종 head·CI·병합 여부를 다시 확인한다. 미병합 API를 develop 구현으로 오해하지 않는다.

자신의 frontend 작업본에서 branch/head와 git status를 먼저 확인하고 미커밋·미공개 변경을 보존한다. 원격 codex/frontend-shell의 최신 관측 PR60/head4219a53bb5cb7efa2ca3e48939bd82de69e071d7(최초dc9bc62 및 중간9c03b7b 이후 화면 변경 있음)은 공개 확인 기준일 뿐 최신 로컬 작업을 reset/덮어쓰라는 지시가 아니다. 필요한 최신 develop/승인된 backend 의존 이력은 정상 merge로 반영하며 강제push·브랜치삭제·개인 DB/체인 초기화는 하지 않는다.

소유 범위는 web/와 프론트 테스트/실행 안내다. 기존 F0 strict ApplicationView·list/get adapter·해시 라우팅·접근성을 유지한다. 새 clear-mvp-source-http.1 원문 namespace adapter를 별도로 연결한다. src/product-workflow/http-client.mjs는 브라우저용 한 파일이며 인증된 walletClient.request를 주입한다. backend/DB/collector/공통 정책을 프론트에서 복제하거나 핀/권한/verified 값을 만들어 보내지 않는다. API 의미나 endpoint 가용성이 애매하면 구체 요청/응답·경로와 질문을 오규원에게 전달하고 backend를 임의 수정하지 않는다.

같은 loopback HTTPS origin의 명시 MOCK 개발환경에서 원문 등록→보관된 부분 자료 조회→mock 초안/근거·미확정 질문→정확 previewHash 검토 기록을 연결한다. 원문/quote는 textContent로 렌더하고 HTML/script/iframe 자동실행·원문 URL 직접fetch는 하지 않는다. 실제 화면 전 동의/표시 확인을 요구하며 HTTP SUCCEEDED를 원천 진위·기관 승인·학생 동의·자격/지급 성공으로 표시하지 않는다. sourceCurrent=false·revision 변경·만료·늦은 응답은 현재 승인에서 제외한다.

중복 클릭/새로고침/응답 유실/취소/서버 재시작·세션 만료·계정/체인 변경을 확인한다. POST 자동 재전송·자동 새 키 생성 대신 같은 actor/route/key의 GET 복구를 사용한다. 로딩·없음·HTTP 실패·보완 필요를 구분한다. C1 학생 본인 신청·합성 조건 표시·SYNTHETIC_ACK_ONLY는 clear-mvp-student-http.1의 별도 adapter로 연결한다. 상태 DRAFT/ACKNOWLEDGED_SYNTHETIC/POLICY_CHANGED/POLICY_UNAVAILABLE를 F0의 TERMS_ACCEPTED/ENROLLED로 변환하지 않는다. C2 파일 업로드/문서 검토·보완은 미구현이므로 가짜 성공이나 존재하지 않는 endpoint 호출을 만들지 않는다.

키·서버 Node/DB/collector 모듈은 브라우저 번들에 포함하지 않는다. auth token/서명/개인자료를 브라우저 저장소·로그에 넣지 않는다. 새 유료 모델 호출·개인 로그인/실서류·YBM proof 재실행·실제 Moodle 재시험·실자금/공개체인·배포는 수행하지 않는다. 예치/보관/배정/충전정책OPEN,자격/재원분리,400%자동자격/지급금지,500%제외,grant/outboxHOLD·독립claimNO-GO를 유지한다.

관련 프론트 단위/adapter/브라우저·접근성 시험과 backend 계약 예제를 검증한다. 실제 수정 경로·backend 기준·구현/미연결·성공/실패 근거를 문서화하고 공개 이력 검사/필수 CI를 확인해 develop 대상 Draft PR로 제출한다. PR을 채팅에 attach하고 자동 병합하지 않는다. 원문·개인정보·키가 공개 문서/fixture/CI에 들어가지 않게 한다.
```

## 검증·인계 기준

구현 `032215f`에서 관련267/267(신규HTTP·HTTPS15 포함), 기존 개발환경33/33·새 합성 HTTPS 데모·원본/legacy191개·의존성·공개이력·diff-check가 통과했다. 코드 변경 뒤의 정확한 최종 head/원격 CI는 PR59 Checks와 최종 보고를 정본으로 삼는다. 이 문서 기록만으로 원격 CI 성공을 가정하지 않는다. 코드 검증은 operator 권한·TLS/Host/Origin/CSRF, raw JSON 권한 주입 거부, 새 합성 DB의 멱등·CAS/취소·로그아웃 후 거부·시간/원문 만료·COMMITTING 화해/미커밋 보류·재시작·기존 F0/v4 보존을 포함한다. 재시작 marker 시험은 새 합성 DB에 crash 상태를 구성한 시험이며 실제 사용자 DB나 실제 강제종료 원인 실측으로 기록하지 않는다.

C1 코드680bce3 검증: 신규 학생 HTTP/HTTPS11개 포함 관련278/278, 기존 개발 환경33/33, 검증 HTTPS·새 TEST 지갑 로그인/신청/합성 확인/restart 데모, 원본/legacy191개·의존성/공개 이력·diff-check PASS. C1의 정확한 최종 head/CI는 후속 PR을 정본으로 삼고 PR59의6/6 성공을 대신 사용하지 않는다. 이번 C1 요청 설정은 GPT-6.1 Sol / Medium이며 현재 턴을 임의로 다른 설정으로 전환했다고 주장하지 않는다.


## PR59 실질 검토 보완 (2026-10-15)

요청 설정 GPT-6.1 Sol / High의 검토 단위다. 보완 코드 `7402f7f97158b3dbf42247203dcf9e587aeb1178`에서 다음 재현 실패를 수정했다.

- COMMITTING 복구가 첫 preview의 원문을 읽은 뒤 head를 갱신해 과거 bundle/bytes와 새 operation을 함께 반환했다. 이제 읽기 전에 복구하고 비동기 해석 뒤 head를 다시 검사한다.
- 원문을 일시적으로 읽을 수 없는 상태를 만료로 취급해 시계 역행 시 아직 유효한 draft result를 삭제했다. 이제 내부의 무결성 검증된 보관 기한만으로 만료를 판정한다. 이 메타데이터 helper는 HTTP에 노출되지 않으며 만료 원문·bytes의 조회 차단을 유지한다.
- 작업 생성·검토 기록 시각 이전의 clock에서는 현재 작업/검토 이력·멱등 재생을 `422 MVP_CLOCK`으로 차단한다. 시계가 정상으로 돌아오면 보관된 결과를 재수집 없이 읽는다.

관련272/272(신규 회귀5개 포함), 기존 개발환경33/33, 합성 HTTPS 서명 지갑·재시작 데모, 의존성·원본/legacy191개·diff 검사가 통과했다. 같은 operator 역할의 별도 지갑도 다른 actor의 operation ID·route/key GET 복구·취소에 접근할 수 없음을 확인했다. 재현은 새 합성 DB만 사용했다. 실제 사이트/유료 호출0, 기존 사용자 DB/키/체인 접근0, web/편집0. 원격 최종 head CI와 병합 결과는 PR59 및 후속 통합 기록에서 확인한다.

C1은 별도 Draft [PR61](https://github.com/gw020328-oss/clear-education-v4/pull/61)의 `2354b70bd1f5cb6f4402c73ce0c40efeb3ca08d9`에 보존했다. PR59 병합 후 최신 develop2bb6d29를 정상 merge했으며 C1은 PR61에만 유지한다. C2 문서 제출/보완 HTTP·실동의는 미완료다. 관찰한 서준형 소유 PR60 head는 `4219a53bb5cb7efa2ca3e48939bd82de69e071d7`이며 검토/수정/병합 대상이 아니다.


## PR59 병합·C1 기반 갱신 (2026-10-15)

PR59 최종 head `112e93a36c2b19cdddef15cd44f7c106eb6030be`의 [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38715507758)·[PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38715523867) CI6/6 SUCCESS 후 develop merge `2bb6d291b77ba397f8544995557db78b3ce54724`로 병합했다. 병합 커밋 자체의 CI 성공을 뜻하지 않는다. C1 기존 head2354b70을 보존하고 최신 develop을 정상 merge했으며 충돌은 이 단일 인계 문서의 상태/추가 절뿐이었다. C1 API 절과 PR59 보완 기록을 모두 유지했다. 코드 충돌·web/변경은 없다. PR61은 Draft이고 C2·실동의는 미완료다. 기반 갱신 뒤의 로컬/최종 CI는 후속 기록으로 확인한다.
