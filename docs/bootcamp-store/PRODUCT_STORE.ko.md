# Python 부트캠프 P2: 단일 ledger 합성 수락 구현

> PR80 첫 저장 단계의 역사적 기록이다. 이후 producer 연결·v2 운영 조회·원문 수명/최종 권한 보강과 최신 미구현 범위는 [R2_IMPLEMENTATION.ko.md](R2_IMPLEMENTATION.ko.md)를 따른다. 이 문서의 ‘미연결/OPEN’은 당시 상태이며 후속 TEST 운영 결정의 취소를 뜻하지 않는다.

2026-10-17. 요청 설정 Sol / High, 현재 턴의 실제 모델 ID·설정은 독립 확인하지 않았다. P0 고정 `03fa64324ef9cc2ce4fb442a612329a7b1285677` / [Draft PR78](https://github.com/gw020328-oss/clear-education-v4/pull/78)에 의존하는 첫 저장 구현 단위다. P0 정본·계약·예제를 수정하지 않고 소비한다. 새 파일만 `src/bootcamp/`, `tests/bootcamp-store/`, 이 문서 경로에 두며 기존 workflow CI glob의 전용 진입점 하나를 추가했다. root package/CI·기존 C1/C2/C3 API/schema/DB·web에는 변경이 없다.

이 단계는 **영속 요청/nonce·증거/판정·멱등 명령·current 무효화의 합성 인수**다. 실제 Moodle/AI/Reclaim 연결 완료가 아니다. 기본 `mode=DISABLED`, 활성 가능한 유일한 수집 모드는 `SYNTHETIC_FIXTURE`이며 `realAcceptanceReady=false`다. 실제 producer를 등록하는 모드, 임의 candidate/원문/proof HTTP 업로드는 없다. `MOCK_VERIFIED`를 실제 원천 검증으로 표시하지 않는다.

## 런타임 의미

[`model.mjs`](../../src/bootcamp/model.mjs)는 P0 네 capability를 닫힌 버전으로 컴파일한다. 고정 정책 외의 변형은 거부하고 EXAM/DAILY/BOOLEAN으로 낮추지 않는다. P0 reference decision oracle을 제품 검증기로 호출하지 않는다.

| 조건 | 저장 계층이 도출하는 predicate |
| --- | --- |
| activity-complete | COMPLETED + AUTOMATIC + 관측 rule hash. manual/설정 미확인은 UNKNOWN, 자동 미완료는 NOT_MET |
| assignment-submitted | SUBMITTED만 MET. DRAFT/NOT_SUBMITTED는 NOT_MET, 미확인은 UNKNOWN. 점수는 추가하지 않음 |
| reflection-topics | 세 topic의 PRESENT와 원문 body hash·UTF-16 span·quote hash를 대조. MISSING은 보완, UNCERTAIN/CONFLICT는 UNKNOWN |
| python-basic-certificate | Python (Basic)/test_passed 보유형, 각 signed timestamp와 선택 레코드 commitment의 형식. 원천/서명/계정 통제는 producer 책임이며 현재 합성만 허용 |

reflection 원문은 등록 producer가 메모리로 제공하는 값에 한해 quote/span을 대조하고 ledger에 저장하지 않는다. topic 의미를 저장소가 새로 AI 판정하거나 사진/긍정성/글자수 요건을 추가하지 않는다. 인증서 signature/same-record/selected certificate/claim owner가 실제로 검증됐다고 이 형식 검사만으로 주장하지 않는다. 실제 수락은 계속 비활성이다.

AND 결과는 NOT_MET → 전부 MET → MISSING이면 NEEDS_SUPPLEMENT → 나머지 UNKNOWN이다. 100 TEST / 100000000 atoms는 `DEMO_CANDIDATE_NOT_ENTITLEMENT`이며 체인/token pin·배정·지급은 미구현이다. productEligible/paymentAllowed/productionEnabled=false, grant/outbox HOLD, independentClaim NO_GO를 모든 기록에 고정한다.

## API와 소유권

[`createBootcampStore`](../../src/bootcamp/store.mjs)는 기존 authentication의 `authorizeWorkflow(context,write)`를 재사용한다. invited participant 지갑으로 participant/recipient를 서버에서 도출하며 operator·다른 참가자·CSRF/지갑 변경은 거부한다. `courseOperatorRef`는 서버 설정일 뿐 P3 동의 권한 구현이 아니다.

[`createBootcampHandler`](../../src/bootcamp/http.mjs)는 opt-in handler다. listener/deployment를 시작하지 않는다. 기존 호스트가 `/bootcamp/v1/`만 이 handler로, 나머지는 기존 application handler로 분기해야 한다. 동일 인증 인스턴스·HTTPS origin·Host·session cookie와 wallet/chain/CSRF header를 사용한다. loopback만 허용하고 proxy header를 신뢰하지 않는다. `allowLoopbackHttpForTests`는 시험 전용이며 기본 false다. cookie/token은 JSON 응답에 내보내지 않는다.

| 메서드 / 경로 | body / 결과 |
| --- | --- |
| GET /bootcamp/v1/policy | 고정 policy/hash, mode, 실제 수락 false, gates |
| POST /bootcamp/v1/applications | `{}`. `Idempotency-Key` 필수, 서버가 참가자/수취인 고정 |
| GET /bootcamp/v1/applications/:app | revision·상태·현재 판정·criterion별 증거 head |
| POST .../:app/requests | `{criterionId,expectedRevision}`. 무작위 32-byte 재료에서 nonceHash 발급, 서버 requestHash/policy/mapping/source/auth-session pin |
| GET .../:app/requests/:id | 요청 immutable snapshot + PENDING/CONSUMED/REVOKED projection |
| POST .../:app/collect | `{requestId,expectedRevision}`. 서버 등록 producer만 호출, verified/condition/receipt/proof body 거부 |
| POST .../:app/invalidations | `{criterionId,reason,expectedRevision}`. reason CORRECTED/DELETED/INACCESSIBLE, 이전 current를 영구 무효화 |
| POST .../:app/cancel | `{expectedRevision}`. 신청 취소, pending/current 무효화 |
| GET .../:app/operations/:id | 응답 유실 후 같은 immutable 명령 target과 현재성 조회 |
| GET .../:app/evidence/:id | immutable evidence + current/invalidationReason projection |
| GET .../:app/decisions/:id | immutable decision/hash + current projection |

POST command는 4096 UTF-8 bytes 이하, 정확한 key 집합만 받는다. 모든 응답은 no-store이며 외부 오류·원문·임의 recovery 명령을 echo하지 않는다. 운영 pagination/list/recovery-by-key 검색 UI는 이번 단계에 없다. application ID/operation ID를 이미 받은 경우 GET 또는 동일 body/key POST로 복구한다. 생성 응답을 잃은 경우 동일 create key로 복구한다.

## 트랜잭션과 현재성

새 전용 private directory(0700) 아래 `bootcamp.sqlite`(0600) 하나만 연다. 기존 DB를 migration/open하지 않는다. SQLite BEGIN IMMEDIATE / synchronous FULL, foreign keys, 환경 pin과 필수 table 검사를 재사용한다. 증거·판정·명령·무효화 event는 UPDATE/DELETE를 DB trigger로 금지한다. head/status만 변경한다. 같은 UID의 악성 DB 편집이나 하드웨어/파일시스템 손실에 대한 암호학적 변조 방지는 제공하지 않는다.

요청 발급은 participant/wallet/application·정책·mapping·source guard·현재 auth session hash와 app revision을 고정한다. nonce 원재료를 폐기하고 nonceHash만 저장한다. 이 요청은 **이번 합성 저장 계약**이며 P1 signed request wire를 구현/대체한 것이 아니다. 한 application에 pending request는 한 개다. 네 조건은 차례로 수집한다. 새 요청은 이전 pending을 revoke하고 해당 criterion의 기존 current를 무효화한다. 다른 criterion의 current는 각 source lease가 유효하면 유지한다.

수집/원문 검토는 transaction 밖에서 실행한다. 등록 producer의 `verify(request,{signal})`가 반환한 원래 객체와 동기 `recheck(candidate,request)===true`만 사용하며 공개 hash를 producer 인증으로 삼지 않는다. recheck는 async/외부 I/O일 수 없다. 브라우저의 JSON receipt를 복원해 수락하는 메서드는 없다. 시험은 in-process WeakSet identity를 가진 producer를 사용한다. verifier timeout/취소/실패는 nonce를 소비하지 않는다.

서버의 동기 `resolveSource(context)`는 source refs/version/hash/receiptHash, mappingHash, trustHash, leaseId, rawAvailable 및 auth/raw/query expiry를 반환해야 한다. Promise·예외·누락·만료는 UNKNOWN/차단이다. source guard는 participant/application/criterion별로 해석하며 현재 증거에 저장한 exact guard와 비교한다. 단순히 호출자가 같이 만든 hash들의 일치를 실제 원천 진위로 간주하지 않는다.

1. 인증·소유권과 현재 source/clock 상태를 읽어 stale head/pending을 무효화한다.
2. 별도 command savepoint에서 CAS, 초기 [0,1800)/보완 <3600, nonce/request, source/trust/mapping/lease, raw expiry, producer identity·typed facts·source timestamp를 검사한다.
3. 같은 transaction에 nonce CONSUMED, unique request/nonce/proofBundle, evidence append, head 갱신, decision append, command 결과를 쓴다.
4. COMMIT 직전에 session 권한·producer recheck·clock/lease/expiry와 **다른 criterion head까지** 재검사한다. 하나라도 바뀌면 command savepoint를 rollback하고 source invalidation을 다시 적용한 뒤 transaction을 commit한다. 거부 오류는 그 후 전달한다.

동일 actor/route/key+body는 동일 operation/target을 돌려준다. 같은 key의 다른 body는 충돌이다. proofBundleHash는 ledger 전체 unique로 다른 nonce/신청 재사용도 차단한다. old operation 재조회/재시도는 역사적 target만 반환하며 새 nonce·증거·판정을 만들지 않는다. 같은 논리 request를 verifier가 반복 관측할 수 있는 것과 durable 수락은 다르다.

source 수정/삭제/접근불가·mapping/trust/lease/만료·clock reversal은 invalidation event와 새 UNKNOWN 판정을 남긴다. 명시적으로 폐기한 guard는 retired set에 남아 같은 snapshot 복원으로 살아나지 않는다. 새로운 source/lease와 새 request/revision이 필요하다. 취소는 재개 API가 없다. clock floor는 DB에 남아 재시작으로 역행 제한을 없앨 수 없다. 실제 source 시간은 scenario 시계로 덮어쓰지 않는다.

판정/증거의 `record`는 immutable 당시 snapshot이다. 특히 `record.current`는 당시 P0 기록의 값이다. **사용 가능 여부는 wrapper의 `current`와 최신 application/decision projection으로 판단**해야 한다. old decision hash를 바꾸거나 과거 snapshot의 current 필드를 덮어쓰지 않는다. raw 만료 후 locator metadata는 역사로 남지만 원문 읽기 권한을 주지 않는다. candidate validUntilExclusive도 head에 보존하여 원천 age만으로 수명을 연장하지 않는다.

이 원자성은 한 bootcamp ledger 내부다. authentication/source DB·원격 Moodle·AI 실행을 distributed transaction으로 잠그지 않는다. 동기 authority snapshot을 최종 재검사하고 이후 변화는 다음 접근 때 영구 invalidation한다. 프로세스 미실행 중의 정시 무효화/원문 삭제, source ABA/조회 전 몰랐던 수정 이력 전체를 보장하지 않는다. producer/raw 소유자의 실제 폐기·cancel relay는 별도 인수다.

## 의존성 대조와 다음 인수

| 전용 영역 | 읽기 전용 대조 / 남은 연결 |
| --- | --- |
| Moodle PR71 | `488a09ce8af62aad2067680dbb459eb0358f452e`, docs/moodle/REVIEW_API_BOOTCAMP_P2.ko.md. 활동/본인 SUBMITTED/선택 회고 REST와 fixture22+guard2 기록. 삭제/정리 후 live-ready=false. 역사적 report/숫자ID로 현재 ready를 올리지 않음 |
| AI PR72 | `f98e1040c01034b59fba7f1d5fe1c230965d628a`, bootcamp-reflection session의 original body/span/run/profile/lease. 현재 MOCK/usableForAcceptance=false이며 이 store의 producer로 연결하지 않음 |
| Reclaim | 별도 worktree docs/hackerrank/INTEGRATION.ko.md의 미커밋 제안을 읽음. candidate/recheck/request binding의 최종 commit 미고정이므로 코드를 복사하거나 제품 의존으로 import하지 않음. signed request/trusted recipe/새 두 증명·실제 private raw 경계 인수 필요 |

다음 단계는 해당 전용 PR exact commit이 고정된 뒤 **새 product adapter 제안**으로 각각의 독립 verifier·source/AI receipt·expected owner/selected certificate·raw disposer를 연결하는 것이다. 현재 nonce/request wire는 P1의 participant EOA 서명과 두 claim signed context에 아직 연결되지 않았다. real mode는 그 전에는 추가하지 않는다. C2 삭제/새 run/generation 이벤트도 실제 relay 대신 source guard 변화 시험까지만 완료했다. 현재 DB 환경의 policy/mapping pin은 immutable이므로 다른 mapping으로 다시 열기는 거부한다. 승인된 pin migration/CAS와 새 live fixture가 별도 필요하며, 지금은 resolver mapping 불일치만 영구 stale 처리한다.

P3 동의·이의는 exact current MET decision+고정 recipient+전액 배정 뒤 같은 결과를 겨냥해야 한다. 새 decision에 옛 동의를 재사용하지 않는다. 이의 RECEIVED는 UNASSESSED, deadline 자동 연장 없음. P4 자금 배정/회수/worker·TEST 거래·PG·분쟁 시간은 구현하지 않았다. 예치율·배정순서·충전의무·회수/PG/72·120h는 OPEN이다. P5 정상/수정/재원부족 E2E는 이번 저장 시험으로 완료 처리하지 않는다.

기존 금고·DB·체인·키, 멘토 미결 정책, 400% 자동 자격·지급 금지, 500% 제외, Moodle·원천 검증 차단, grant/outbox HOLD, 독립 청구 NO_GO를 유지한다. Mac은 [PR67 검토](../current/PR67_FINAL_REVIEW.ko.md)에서 fixture 수명 경쟁을 재현하고 실제 403 응답까지 가로채기를 유지하도록 수정했다. 원래 실패 CI의 정확한 IPC 순서는 소급 미관측이다. 실제 자료 수락/로그인/유료 호출/실체인 실행/배포/자동 병합은 0건이다.

검증 실행 및 exact commit/원격 CI는 [PRODUCT_VERIFICATION.ko.md](PRODUCT_VERIFICATION.ko.md)에 기록한다.
