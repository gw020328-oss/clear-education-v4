# 공통 store R2 / E1 소비자·운영 조회 인수

2026-10-18. 기존 P0 네 조건·금액·v1 기록/hash를 보존하면서 고정된 전용 producer를 합성 입력으로 연결한다. **실제 신뢰·mapping은 기본 차단이며 실제 원천 수락은 0건이다.** E1 원문 수명·최종 권한 경계의 요청/추천 설정은 Astra / High다. 안내만으로 실행 설정을 바꿨다고 주장하지 않으며 현재 런타임의 실제 모델 ID는 별도로 검증하지 않았다. 일반 후속 구현은 Sol / High 작업 단위로 분리한다.

## 고정 입력과 소유 범위

| 입력 | 고정 commit / 소비 |
| --- | --- |
| P0 | `03fa64324ef9cc2ce4fb442a612329a7b1285677`, 기존 정책·네 capability·100 TEST·v1 wire |
| 기존 API/store PR80 | 구현 `f1efbee6af817083269c518c82fe29501d5b8554`, 원격 head `66893eab4bdafc574147ebee497e3f5a9edafb08` 보존 |
| P1 PR79 | `0da3abe89e2361ac75c19a331e7910afa7ecc70a`, 독립 Reclaim verifier·원본 candidate identity |
| Moodle PR71 | `488a09ce8af62aad2067680dbb459eb0358f452e`, read-only bootcamp producer |
| AI PR72 | `f98e1040c01034b59fba7f1d5fe1c230965d628a`, original-body reflection session |
| R2 PR78 | `69d6dc80caaf2bde963385e176068e3a0293e6b3`, 별도 v2 projection/metric |
| R3 PR78 | `733fe693f4fd2e16977b0c52ef88e35ee9687f2c`, G1 canonical accept/cancel 순서 |
| E0 TEST 운영 PR78 | `67b6a0731f97df98fda7820ab24ed85a57796a83`, `clear-hackathon-test-operations.1` decision rev1 / repo planrev4 |

위 입력은 선별 복사 없이 normal merge했다. 자체 변경은 `src/bootcamp/`, `tests/bootcamp-store/`, workflow test 진입점, `docs/bootcamp-store/`와 기존 CI의 pinned P1 dependency 설치 한 줄이다. producer/web/frozen specs/docs/current/자금 코드는 수정하지 않는다. develop 대상 Draft에 선행 #74/#78/#79/#71/#72/#80 이력이 포함된다. Draft 생성은 선행 PR 병합이나 독립 인수 완료가 아니다.

## 실제 producer 코드와 합성 입력의 연결

`reclaim-consumer.mjs`는 서버가 주입한 P1 verifier와 메모리 lease 소유 수집기만 호출한다. 실제 trust pin·수집기 기본값은 없고 `UNCONFIGURED_BLOCKED`다. 시험은 공식 SDK 검증 코드에 공개 합성 claim과 임시 서명을 입력한다. 실제 공증자 fresh proof pair를 생성한 것이 아니다.

별도 `clear-bootcamp-bound-request.2`가 P1의 `clear-hackerrank-request.1`을 번역한다. ledger의 예측 불가능한 nonce commitment가 P1 challenge nonce가 되며, 서로 다른 hash domain의 requestHash/nonceHash를 `clear-bootcamp-producer-bridge.2` side receipt로 연결한다. participant EOA 서명, 두 claim의 signed context, username/claim owner/선택 인증서는 P1에서 검사한다. P1 receipt JSON 복원은 WeakMap identity를 되살리지 못한다. 최종 durable nonce 소비는 오직 공통 SQLite transaction에서 수행한다. v1 요청은 v2 route로, v2 요청은 v1 route로 수락할 수 없다.

`moodle-consumer.mjs`는 명시적인 `fixtureOnly`와 `OFFLINE_SYNTHETIC_FIXTURE` client만 받는다. 실제 Moodle API client로 바꾸면 차단된다. P2 실제 read/validation 코드를 오프라인 응답으로 실행하고 `LOCAL_LMS_RECORD` 원래 assurance와 `usableForAcceptance=false`를 side receipt에 보존한다. 제품 증거는 `SYNTHETIC_FIXTURE/MOCK_VERIFIED`다. 활동 AUTOMATIC, 과제 SUBMITTED, 회고 원문 UTF-16 span/hash를 검사하며 AI session은 MOCK이다. 네 조건이 같은 신청에서 ALL MET가 되는 시험은 합성 통합 성공이다.

## 원문 수명과 판정 current

원문 보유 권한과 검증된 사실/판정의 현재성은 별개 검사다. 원문을 읽을 수 있다는 사실만으로 조건이 MET가 되지 않는다. 반대로 역사적 MET 기록은 원문 재조회 권한이 아니다. 이 고정 P0 단계는 raw/query/auth lease와 source freshness를 current의 선행 조건으로 요구하므로, lease가 없어지면 현재 head를 무효화하되 당시 evidence/decision 본문과 hash는 바꾸지 않는다.

- Moodle candidate의 `originalBody`는 고정 문자열 복사 대신 소유 lease의 guarded accessor다. store도 metadata만 복사하고 원문은 동기 grounding에 필요한 순간 읽는다. 종료·만료(단축된 auth/raw/query 상한 포함)·mapping 변경·로그아웃·요청 교체·취소 이후의 새 읽기는 거부된다. 미래 시각으로 단축하면 새 상한까지만 원문 권한이 남고, 판정 current는 별도로 exact guard 변화에 따라 무효화된다. 폐기된 lease는 시간이 복원되어도 살아나지 않는다.
- producer 진입 직전 request/CAS/session을 다시 검사한다. Moodle의 각 API 호출 전후에도 권한·pin·lease를 검사하고, AI dispatch 및 await 뒤에는 원문 lease와 session current를 재검사한다. Reclaim collector에는 `{signal,isAuthorized}`를 전달한다. collector는 자신의 lease/read 및 비동기 단계에도 이 권한을 적용해야 한다. 현재 fixture는 이를 인수했으며 실제 collector 연결은 미수락이다.
- 수락 전 request는 정확한 pending revision/정책/mapping/session을 요구한다. 수락 뒤 원문 lease는 같은 요청에서 수락된 증거가 여전히 valid head이고 신청이 ACTIVE일 때만 남을 수 있다. 다른 조건의 새 판정이 생겼다는 이유로 퇴역한 head를 복원하지 않는다.
- `close()`는 이 소비자가 가진 lease를 폐기한다. 새 process/generation은 과거 원문의 소유권을 복구하지 못한다. 새 수집에는 새 요청이 필요하다.

JavaScript의 이미 반환된 문자열·외부 adapter가 보관한 복사본을 물리적으로 소거할 수는 없다. 보장 범위는 소유 참조 해제와 **향후 접근 거부**이며 강제 GC·메모리 zeroization·디스크 무흔적을 주장하지 않는다. 진행 중 adapter의 취소도 협력적이다. 실제 provider의 보존·폐기 인수 전 real mode는 켜지 않는다. HTTP/DB/metric에는 원문·proof·cookie를 넣지 않는다.

## 최종 권한·조회 경계

v1 신청 요약/증거/판정/명령 GET, v2 두 역할 projection/이력/metric, operator pagination, create-key replay를 모두 최종 검증한다. command savepoint 이후 최신 clock/source를 재조회하고 revision/ledger sequence가 변했으면 응답을 거부한다. source callback 뒤에 최종 인증을 배치하여 같은 wallet의 역할 변경도 거부한다. operator scope는 서버의 `resolveOperatorBindings`로 재조회할 수 있으며 없으면 생성 시 정규화한 고정 bindings를 쓴다. request body로 권한을 늘릴 수 없다.

거부 시 새 command/action/nonce 쓰기는 rollback하지만 관측한 원천 무효화는 savepoint 밖에서 다시 적용해 commit한다. operator 조회는 학생의 pending request를 operator session으로 바꾸지 않는다. pagination은 course scope 전체를 refresh하고 같은 ledger sequence에서만 다음 페이지를 허용한다.

비동기 collect의 HTTP 반환과 v2 bridge 반환에도 다시 인증/현재 projection을 읽는다. 이미 durable 수락된 뒤 로그아웃하면 비공개 응답은 차단하고 수락 이력은 보존한다. 재로그인 후 같은 operation 조회/동일 key 재시도로 복구한다. source/auth 서비스 전체에 분산 lock을 거는 보장은 없다. 서버가 주입한 동기 resolver는 신뢰된 현재 snapshot 공급자이며 재진입 쓰기나 비동기 I/O를 수행하면 안 된다. 최종 동기 검사 후 발생한 외부 변경은 다음 관측에서 무효화된다.

## 별도 v2 HTTP 및 화면 인계

호스트는 기존 `/bootcamp/v1/`와 새 `/bootcamp/v2/`를 같은 opt-in handler로 분기한다. HTTPS/origin/loopback/session/CSRF 및 4096-byte command 제한을 유지한다. 새 listener·배포·web 변경은 없다.

| 경로 | 용도 |
| --- | --- |
| GET `/bootcamp/v2/applications/:app/operations` | 학생/해당 course operator 전용 v2 projection |
| GET `/bootcamp/v2/operations?limit=20&after=:app&sequence=:n` | operator pagination; limit 1–50, 다음 페이지는 반환 sequence 고정 |
| GET `.../:app/metric-events` | 저장된 서버 측정 event; 업로드 불가 |
| POST `.../:app/source-requests` | `{criterionId,expectedRevision}`, 서버 bound request 발급 |
| GET `.../:app/source-requests/:id` | 학생 본인의 요청 상태 |
| POST `.../:app/source-collection` | `{requestId,expectedRevision}`, 서버 producer 호출 |
| GET `.../:app/operation-receipts/:id` | redacted v2 명령 결과·current |
| POST `.../:app/consent-requests` | BLOCKED_INTENT_ONLY 의사 표시, 수락된 동의 아님 |
| POST `.../:app/objections` | RECEIVED/UNASSESSED 접수 |
| GET `.../:app/actions/:id` | immutable action과 최신 current |

action body는 `expectedRevision`, `expectedLedgerSequence`, `targetDecisionId`, `targetDecisionRevision`, `targetDecisionHash`, `reason` 여섯 필드다. 동의 reason은 `AGREE_SAME_RESULT`; 이의는 `SOURCE_MISMATCH`, `EVIDENCE_MISSING`, `DECISION_TARGET_ERROR`, `UNRESOLVED_QUESTION`만 받는다. 사유 자유문 원문이나 임의 rejected/eligible 값은 받지 않는다. 같은 actor/판정/reason의 반복은 같은 action을 돌려주고 기한을 만들거나 연장하지 않는다.

두 화면은 같은 `applicationId/decisionId/decisionRevision/decisionHash/policyHash/runtimeMappingHash/ledgerSequence`로 합친다. `current`는 현재 신청/판정 wrapper이며 지급 허용 flag가 아니다. 증거 축 `COMPLETE/NEEDS_SUPPLEMENT/REVERIFICATION_REQUIRED/UNRESOLVED`, funding 미구현, payment BLOCKED, 미수락 동의, 미평가 이의를 각각 표시한다. operator에게는 raw facts/locator·학생 wallet을 주지 않으며 `originalEvidenceAccessible=false`다. 학생의 접근 가능 표기도 실제 원문 endpoint를 제공한다는 뜻은 아니다. 현재 원문 HTTP route는 없다.

예: 합성 네 조건이 MET이면 학생과 operator가 같은 decisionHash를 본다. 그래도 `fundingSnapshotId=null`, `funding.implementation=NOT_IMPLEMENTED`, `payment.state=BLOCKED`, `consent.acceptedConsentCount=0`이다. 이의를 접수하면 같은 immutable 판정을 보존하면서 운영 증거 축을 UNRESOLVED로 표시한다. 새 판정이 나오면 이전 action은 `current=false`가 된다. 이 예는 `r2-operations.test.mjs`와 HTTP 시험으로 검증한다.

## 단일 ledger·migration·측정

v1 DB 환경 pin/hash를 바꾸지 않고 r2 side schema를 transaction으로 추가한다. `r2_decisions/metrics/attempts/bridges/actions`는 append-only이고 공통 증가 sequence를 공유한다. 기존 decision은 순서를 보존해 backfill한다. schema/backfill 실패는 전체 rollback, 재시작 시 필수 table/trigger/sequence를 검증한다. 성공 후 옛 v1 writer는 guard trigger로 거부한다. 옛 v1 reader는 변경이 필요 없는 fresh 기록을 계속 읽을 수 있지만, 무효화 쓰기가 필요한 경우 새 writer가 필요하다. 구버전으로 downgrade write를 허용하지 않는다.

nonce 소비·evidence·bridge·decision·명령·성공 metric은 한 transaction이다. 네 쓰기 지점 SIGKILL, 독립 두 프로세스 CAS, 응답 유실과 재시작을 검사한다. 실패 attempt와 failure event는 별도 서버 기록으로 남기며 성공 retry가 지우지 않는다.

v2 metric wire는 R2 exact fields만 쓴다. ID/본문 충돌과 새 ID의 같은 논리 event를 거부하고, 서버 retry는 최초 구간을 재사용한다. monotonic 구간과 UTC metadata/프로세스 epoch를 구분한다. 프로세스 재시작의 다른 epoch를 합산하지 않는다. 현재 조건 검증·자동 동작·대기 구간은 실제 합성 실행의 `MEASURED_ISOLATED_TEST`다. 사람 작업/수동 기준선/사례 전체/P5 완료·감소율은 미측정 `null`이며 0 또는 100%로 꾸미지 않는다. 사람 합계와 대기 구간 union 알고리즘 시험은 `SYNTHETIC_EXAMPLE`이다.

## E3 인계와 미수락

사용자가 확정한 `clear-hackathon-test-operations.1` 문서와 [E0 정본](../current/HACKATHON_TEST_OPERATIONS.ko.md), profile/reference/intake를 읽고 위 고정 commit을 normal merge했다. profileHash는 `0x47a18b20a02a8acf89160c50601b8a2625bcae432292d9cf6d4644af0a2fdb98`다. 새 120초·새 근거 재검증 1회·최초 절차부터 600초(리셋 불가), 전액 배정 뒤 절차 시작, 새 판정의 새 동의/온전한 120초, 내용 있는 미평가 이의 차단은 **E1/E2 교차 인수 후 별도 E3 작업**으로 연결한다. 지금의 P0/R2/R3를 조용히 수정하거나 임의 deadline·funding 상태를 만들어 넣지 않았다. E0 reference를 제품 verifier/authorization의 trusted flag로 import하지 않는다.

E3에는 현재 판정 pin과 동의·이의 history, 원천 무효화 event, CAS/ledger sequence, 역할별 projection을 인계한다. 별도 절차 schema/version과 최초 시작 시각·재검증 횟수를 영속화해야 한다. 새 유효 오류·원문 만료는 상한 뒤에도 계속 차단해야 한다. 확인 절차와 재원 대기는 별도 상태다.

미수락 종료의 epoch 무효화·예약 해제는 E4 contract의 원자 작업이다. DB만으로 자금 해제나 승인 취소를 완료 처리하지 않는다. R3 G1의 canonical 순서, accept 선행 시 고정 수령인/금액 권리 보존, claim 때 새 서버/현재 signer 재요구 금지를 유지한다. G2–G6의 TEST 정책은 E0에서 확정됐으며 구체 구현·승인 인코딩·signer/worker/relayer/실제 E2E 인수는 이 Draft에 없다. 이번 새 승인으로 선택된 TEST 개발을 영구 HOLD로 해석하지 않되, 현재 미구현 경로를 활성화하지 않는다.

기존 금고·DB·체인·키를 열거나 초기화하지 않았다. 실제 원천/개인 자료·유료 호출·배포·자동 병합은 없다. 기존 상용 400% 자동 자격/지급 금지·500% 제외·멘토 미결 정책은 그대로다. 현 런타임 gates는 false/HOLD/NO_GO이며 실제 검증 완료를 주장하지 않는다. Mac은 재현된 fixture 수명 경쟁 수정과 과거 CI의 정확한 IPC 순서 미관측을 구분한다.

검증·정확 commit·원격 CI는 [R2_VERIFICATION.ko.md](R2_VERIFICATION.ko.md)에 기록한다.
