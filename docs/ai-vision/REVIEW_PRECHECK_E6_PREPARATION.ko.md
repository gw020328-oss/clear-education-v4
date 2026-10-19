# E6 회고 검토·재수집/정정 연결 사전 준비 — 2026-10-18

**OFFLINE_PREPARATION / E1_INTEGRATION_NOT_ACCEPTED / MODEL_QUALITY=N/A.** 기존 PR72의 `f98e1040c01034b59fba7f1d5fe1c230965d628a`를 보존하고 새 브랜치 `codex/ai-e6-reflection-preparation`에서 E0 exact `67b6a0731f97df98fda7820ab24ed85a57796a83`를 정상 merge했다(merge `ed2e5db`). E0 정본은 `docs/current/HACKATHON_TEST_OPERATIONS.ko.md`와 `specs/bootcamp/hackathon-test-operations-v1.json`이다. `clear-hackathon-test-operations.1`/decision revision1/plan revision4를 읽어 별도 execution-view hash로 결합한다. 기존 v1 context/profile/관측/정책의 bytes/hash는 바꾸지 않았다.

요청·권장은 Sol/Medium이며 현재 턴에서 런타임 모델 ID를 독립 조회하거나 전환하지 않았다. 새 세션/하위 에이전트/다른 세션 메시지는 없다. 추가 실제 API·paid generation/countTokens·키 조회는0이다. 과거 일반 후기의 실제 Gemini8건을 새 Python 회고 품질 성공으로 전용하지 않는다.

## E0 정책과 AI 책임

Python P0 네 조건 AND/100 TEST와 회고3topic을 유지한다. 수행 내용·문제해결/점검 과정·배운 점만 관찰하고 명시적 문제없음+점검 과정을 허용한다. 성의/긍정성/전반 실력 점수·최소 글자수·필수 사진을 추가하지 않는다. Vision은 선택 확장이며 새 블로그가 선행 조건이 아니다. 지갑/수치/기한/서명/제출 유무는 코드와 source producer 책임이고 AI는 지급키/서명/송금 권한이 없다.

E0의 **120초·새 근거 재검증1회·첫 시작+600초 고정, 새 decision의 새 동의 또는120초 전부**는 승인된 TEST 정책이다. 이를 OPEN으로 되돌리거나 AI attempt/통신 retry/일상 수집과 business 재검증을 같은 횟수로 처리하지 않는다. 횟수·firstStartedAt·동의·판정 재공개·종료/배정 ledger는 API 소유다. 이 래퍼는 해당 값으로 source 무효화를 막지 않는다. 1회/600초 뒤에도 source 변화·lease 만료·정당한 오류는 계속 무효화해야 한다. signer/payer는 이번 준비에서 활성화하지 않았다.

## 읽은 공통 consumer와 제안 연결

공통 작업본 `clear-bootcamp-api-store`의 **읽기 전용 snapshot `6b4b0cf2d847937aebc6da69f9e7df62e926fa50`**에서 다음을 확인했다. 진행 중인 E1을 완료로 인수한 것은 아니며 파일을 수정/복사/merge하지 않았다.

- `src/bootcamp/moodle-consumer.mjs`의 candidate.originalBody는 owner lease.read()에 연결된 getter다. 현재 AI 호출은 result.source.body 문자열을 읽어 기존 `session.review({context,text},...)`에 전달한다. source/raw/auth/query·request·pin·권한을 재검사하는 책임은 공통에 있다.
- `createMemoryLease`는 source owner가 read/isCurrent/dispose를 제공한다. E6가 borrowed 작업을 마쳤다는 이유로 공통 candidate가 필요로 하는 owner lease.dispose를 호출하면 안 된다. 공통 close/원문 철회와 AI 작업 취소는 별도 책임을 명시해 연결해야 한다.
- source producer의 `h('REFLECTION-BODY', raw.body)` 도메인 hash와 consumer/AI의 원본 UTF-8 SHA256 bytesHash/inputHash는 같은 계산이 아니다. originalBodyHash라는 이름만 보고 같은 지문으로 위장하지 않는다. sourceHash/receipt/sourceVersion과 inputHash는 각각 pin하며 producer의 기존 의미를 유지한다.

새 전용 모듈 `src/document-precheck/review/e6-leased-reflection.mjs`는 **injected borrowed raw contract**를 소비하는 오프라인 어댑터다. E1 공통 consumer를 변경하거나 공통 lease/ledger를 복제하지 않았다.

```js
const session = createE6LeasedReflectionSession(resolveCurrent, { nowMs });
// resolveCurrent() -> { context, rawAvailable, operationsProfileHash,
//   decisionRef, messageFormat, leaseExpiresAtMs }
const view = await session.review({ context, decisionRef, messageFormat,
  lease: { isCurrent, readBody, release } }, mockAdapter, { signal, timeoutMs:1000 });
session.refresh();               // host lease/head 변경 이벤트 뒤 즉시 재검사
session.invalidate('E6_SOURCE_CHANGED');
session.cancel();                // 현재 작업 중단
session.consume(view);          // 표시/수락 직전 현재성 재검사
session.dispose();              // 래퍼 영구 종료, 재사용 거부
```

`context`는 기존 `clear-bootcamp-observation-context.1` 그대로다. `decisionRef`는 수집 전이면null, 아니면 정확한 `{decisionId,decisionRevision,decisionHash}`다. 새 E6 view에만 operationsProfileHash/decisionRef/format/lease를 결합하고 v1 context나 old decision의 동의를 다시 쓰지 않는다. 실제 새 동의/120초 판단은 API가 수행한다.

`readBody()`는 source owner가 현재 lease를 확인하는 getter여야 한다. wrapper는 시작/읽기 전후/dispatch/완료/consume에 metadata와 lease를 검사하고 body를 한번 읽어 v1 검토에 전달한다. candidate/view/session entry에 originalBody 문자열을 캐시하지 않는다. `release()`는 **borrow 참조만** 놓아야 한다. 예를 들어 owner를 가리키는 local 참조를 null로 만드는 콜백을 주며, shared owner.dispose의 자동 alias로 주지 않는다. 명시적 exclusive ownership transfer가 있는 경우에만 source owner가 dispose 책임을 별도로 정한다.

성공/오류/취소/만료/폐기에서 release를 한번 수행하고 borrowed handle 참조를 놓는다. 완료 후 view 현재성은 원문이 없는 host metadata resolver로 확인한다. host.rawAvailable은 실제 owner lease.isCurrent·권한·source/head를 반영해야 한다. 지문/단순 true 플래그만으로 인증하는 consumer가 아니다. 이미 전송된/읽힌 JS 문자열이나 비협조적 외부 코드 보유본의 물리 삭제·이미 쓴 비용 환불은 보장하지 않는다.

## 축소·취소·새 source/decision·historical 결과

- `leaseExpiresAtMs`는 auth/raw/query/request/source freshness 중 최솟값을 host가 제공한다. wrapper는 context 만료·처음 받은 lease·이후 관측한 축소 lease의 최솟값을 유지하며 복구된 만료시각으로 옛 작업을 되살리지 않는다.
- active 작업은 deadline timer와 AbortController에 연결한다. lease가 줄면 host가 `refresh()` 또는 invalidation을 즉시 전달해야 한다. host 이벤트를 받지 않고 외부 lease 변경을 순간 감지하는 감시 시스템을 구현한 것은 아니다. 완료 후에는 consume 때 현재성을 다시 대조한다.
- 새 source/evidence revision/request/mapping/context 또는 새 decisionRef는 옛 작업을 취소하고 옛 view를 historical/current=false로 만든다. 새 수집은 새 run/attempt/context가 필요하다. 동일 run+attempt 재사용과 복사한 view의 consume을 거부한다.
- cancel/dispose/lease close 뒤 도착한 응답은 처리하지 않는다. 기존 core.consume도 stale observation을 반환하므로 outer view가 stale인데 안쪽 old observation을 성공으로 표시하지 않는다. raw quote/후보값/원문이 없는 기존 summary만 view에 담는다.
- MODEL timeout 등 내용 관찰 실패는 기존 topic reason/contentStatus로 남고, sourceStatus와 분리한다. sourceStatus=UNAVAILABLE인데 내용이 CHECKED여도 verifiedEvidenceCondition=UNKNOWN이다. source 진위/실명/기관 인정·전체 AND 자격을 확정하지 않는다.

호출 오류는 `E6_FORMAT_UNSUPPORTED/E6_MOCK_REQUIRED/E6_BORROW_REQUIRED/E6_TIMEOUT/E6_RUN_REUSE/E6_VIEW_REQUIRED`, 수명 오류는 `E6_CANCELED/E6_DISPOSED/E6_SOURCE_CHANGED/E6_DECISION_CHANGED/E6_CONTEXT_CHANGED/E6_FORMAT_CHANGED/E6_PROFILE_CHANGED/E6_LEASE_CLOSED/E6_LEASE_EXPIRED/E6_CLOCK/E6_RELEASE_FAILED/E6_INPUT_MISMATCH`로 제한한다. 원천/키/HTTP raw 오류를 view에 넣지 않는다. E1의 BC_* 코드와 대응/영속 operation 상태는 API 담당이 확정해야 하며 여기서 공통 enum을 수정하지 않는다.

## Moodle HTML·원문 근거

messageFormat2는 원본 plain body,1은 **그대로인 HTML body 문자열**이다. 원문 literal quote만 검사하며 HTML DOM/strip/entity decode·정규화·정규화→원문 offset map을 새로 구현하지 않는다. 모델의 decoded `A&B`가 원문의 `A&amp;B`에 없으면 UNCERTAIN/UNSUPPORTED_EVIDENCE다. `<p>`가 붙은 원문에서는 실제 `<p>` 길이를 포함한 UTF-16 span과 원문 quoteHash를 쓴다. title 내부/이미지 region은 계속 미지원이다. format0/4는 이번 준비에서 거부하며 읽지 않는다.

HTML profile/normalization 검증은 source/common normalizer의 별도 역할이다. `normalizationApplied:false`는 AI wrapper가 변환하지 않았다는 뜻이며 upstream normalization pin을 삭제하거나 HTML 전체가 안전/동일 내용이라고 검증한 뜻이 아니다. E1이 messageFormat과 원문 sourceHash/receipt/inputHash를 동일 acquisition에 pin해야 한다. 이번 공개 합성 `<p>…</p>` 예시는 소유 격리 Moodle 인공계정의 forum HTML 형태에 대응하는 **safe mock**이고 실제 Moodle 응답 재수집/새 계정 생성 결과가 아니다.

## 검증·분모

E6 집중8/8, 전체 AI/document/product-workflow 회귀 **411/411 PASS**, workspace 보존191개/고정 dependency graph·diff PASS다. E0 profile/정본문서는 exact fixed commit과 diff0이다. 최초 전체 검사는 Ganache 미연결로 기존 relayer test1개가 시작하지 못했으며 기존 고정 설치본의 Git 제외 node_modules/ganache·solc 링크를 연결한 뒤411개 전부 통과했다. 전역 설치/package/lock/CI는 바꾸지 않았다. final focused8개에 v1 observationHash byte 호환·부정적 의견/문제없음 회귀를 추가 확인했다.

| 분류 | 이번 결과 |
| --- | --- |
| UNIT/저장 mock replay | E6 8 PASS, 기존 P2 회고16/기타 frozen 회귀 포함 |
| E1 synthetic consumer integration | N/A — 소유 코드 계약 read-only 검토, 실제 연결 미실행 |
| REAL_SOURCE / 새 계정 행동 | N/A — 실제 API/신규 계정 요청0 |
| Python 회고 실제 모델 품질 | N/A — paid generation/countTokens/키조회0 |
| E6 LOCAL_CHAIN / TESTNET_E2E / 처리시간·가스 개선율 | N/A — 기존 immutable relayer 회귀를 새 E4/E6 성공으로 전용하지 않음 |

시험은 borrowed getter 단회 읽기/release, owner 공유 보존, v1 hash 동일, HTML/entity 원문 위치, source/body hash 변조, unsupported format, getter 전후 lease close, ignoring mock의 cancel/dispose·late 결과 비접근, lease 축소/복구 불가, 새 source/request/mapping/decision/profile, 보완 후 old late, business 횟수/600 상한 이후에도 invalidation, UNAVAILABLE+CHECKED, MISSING/UNCERTAIN/CONFLICT와 정상/문제없음/부정적 후기, timeout/ACTUAL 차단을 포함한다. source/정책/지갑 서명을 실제 검증했다는 뜻이 아니다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/e6-leased-reflection.test.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/*.test.mjs tests/ai-policy/*.test.mjs tests/document-precheck/*.test.mjs tests/product-workflow/*.test.mjs
./tools/node tools/verify-workspace.mjs
```

로그는 Git 제외 artifacts/e6-reflection-tests.txt 및 e6-focused.txt다. 고정 Node24.21.0/기존 의존성만 썼다. 원격 CI와 로컬 분모를 구분하며, 기존 root CI glob에 없는 담당 test를 CI가 실행했다고 표시하지 않는다.

## 다음 실제 품질 평가의 최소 준비 · 요청 없음

E1의 안전한 원문 lease/auth/current/CAS와 source producer의 exact receipt/messageFormat/inputHash/runtime mapping이 먼저 인수되어야 한다. 기존 소유 격리 인공계정의 명시 선택 회고 글1건을 재사용할 수 있는지 source 담당이 확인해야 하며 새 사용자 로그인/계정을 지금 요구하지 않는다. 실제 producer API 호출 수는 source 담당이 계측해야 하므로 미래 호출 수는 N/A다. 이번 실제 요청 수0과 혼동하지 않는다.

별도 모델 품질 진단은 다음8건을 새 Python corpus로 고정하는 최소 회귀안을 제안한다. old8건이나 v1과의 중복 baseline 유료 실행은 하지 않는다.

| 새 사례 | 주 검증 |
| --- | --- |
| 정상 P0 회고 | 세topic/원문 근거·불필요 보류 없음 |
| 명시적 문제없음+점검 | 문제를 지어내게 요구하지 않음 |
| 부정적 의견 | 성의/긍정성 불필요 평가 없음 |
| 특정topic 누락 | MISSING+topic별 구체 보완 |
| 모호한 topic | UNCERTAIN+근거 없음 보존 |
| 모순되는 내용 | CONFLICT·자동 선택 없음 |
| 문서 명령 포함 | 지시를 따르거나 지급 권한 생성하지 않음 |
| raw HTML/entity | 원문 quote/UTF-16·정규화와 구분 |

필요한 경우 생성최대8+countTokens최대8(총16요청), 자동재시도0, 입력각3000/출력각1024 상한, **신규 US$0.05 예산 상한 제안**이다. 현재 실청구 추정은 N/A이며 모델 코드/요금·token/이미지 입력 범위·새 corpus/gold/profile hash와 dispatch checkpoint를 실행 준비 때 재확인해야 한다. Gemini는 기존 선호를 유지하되 이번에 목록/키/과금 상태를 조회하지 않았다. plain/HTML 합성 텍스트만 보내고 실제 개인자료·지갑/키/쿠키·source token·gold는 보내지 않는다. 현재 ACTUAL adapter는 거부하며 실제 평가는 별도 승인된 평가 실행 경계가 필요하다. **이번 문서는 새 유료 승인/요청이 아니고 사용자 확인 전 호출하지 않는다.**

E1/E2 인수·E3/E4/E5 signer/payer·절차/재원/실행 및 activation은 각 소유자 후속이다. E0의 승인된 TEST 경로는 선행 인수 후 별도 activation할 수 있으며 과거 HOLD를 영구 개발 중지로 적용하지 않는다. 기존 v1 usableForAcceptance/paymentAllowed=false·grant/outbox HOLD·독립NO_GO·production=false·C2 개인자료/generic upload 제한은 보존한다. 상용 예치/원화PG·400/500 신규범위는 제외하며 공통API/DB/schema/normalizer/CI/package/frozen specs/docs/current·Moodle producer·web를 직접 수정하지 않았다. 새 Draft PR로 인계하고 main/develop 자동 merge·배포하지 않는다.
