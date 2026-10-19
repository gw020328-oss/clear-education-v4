# E3 검토 절차·두 역할 DTO 구현 인계

2026-10-19. 요청·추천 설정 Sol / High. 실제 런타임 모델 ID는 독립 확인하지 않았다. **단일 bootcamp DB의 절차·동의·이의·unsigned 인계를 구현한 단계**다. 실제 source/배정/체인 reader·signer·outbox·지급은 미활성이다. `SYNTHETIC_PORT_FIXTURE`를 실제 배정으로 설명하지 않는다.

고정 입력은 E1 [PR84](https://github.com/gw020328-oss/clear-education-v4/pull/84) `6b4b0cf2d847937aebc6da69f9e7df62e926fa50`, E2 [PR85](https://github.com/gw020328-oss/clear-education-v4/pull/85) `d9407b06b8a13122a489193119c1899929f83fe4`, E0 `67c7bc8450484fb4d5545c6e36a672e497467174`이다. 별도 `codex/bootcamp-e3-procedure` 브랜치에 정상 이력 병합했다. 기존 PR84 head는 보존했다. E0 [정본](../current/HACKATHON_TEST_OPERATIONS.ko.md)과 [consumer pins](../../specs/bootcamp/hackathon-test-consumer-pins-v1.json)를 소비하며 E0 reference assertion을 source/auth authority로 사용하지 않는다.

운영 profile은 `clear-hackathon-test-operations.1`, hash `0x47a18b20a02a8acf89160c50601b8a2625bcae432292d9cf6d4644af0a2fdb98`다. E2 typeHash `0x0420a07c2295bca1fc66f0033f2afa0c6e430c7d7cccb48fa23a98c84d97fa8f`, domain `ClearBootcampTestPayment/3`, primary type `BootcampTestPaymentAuthorizationV3`, window `clear-bootcamp-test-first-accept-window.3`을 보존한다. old v2 finite claimUntil 및 v1 wire/hash는 수정하지 않는다.

## 단일 DB와 절차의 영속 의미

`src/bootcamp/procedure-ledger.mjs`는 기존 DB 환경 pin을 보존한 채 e3 side schema를 원자 migration한다. 원본·사용자 DB에 실행하지 않았으며 시험은 새 합성 디렉터리만 사용했다.

| 테이블 | 의미 |
| --- | --- |
| e3_procedures | canonical application당 UNIQUE 1개. procedureId·최초 시작·원래600초 cap·한 obligation 고정 |
| e3_publications | decision당 UNIQUE 1개. 판정 공개 시각·그 판정의120초·배정 target·동의 scope |
| e3_records | 동의/이의/독립 assessment/재검증/종료 필요/종료 intent/관측 checkpoint의 append-only 이력 |
| e3_ids | kind+logical ID ↔ 전역 unique random bytes32. app/decision/allocation/procedure가 1:1이며 재시작해도 유지 |
| e3_prepared | domain+nonce당 UNIQUE unsigned target. 이후 다른 issuedAt/target으로 덮어쓰기 금지 |

모든 위 이력과 mapping은 UPDATE/DELETE trigger로 보호한다. 명령·metric·side record는 r2의 공통 증가 sequence를 공유한다. e3 writer guard는 기존 core와 r2 쓰기를 함께 보호한다. migration 실패는 전체 rollback하고 구 E1 코드로 다시 읽을 수 있다. 성공 뒤 fresh history는 구 E1 reader에서 같지만 구 writer는 거부된다. downgrade write를 허용하지 않는다. 새 코드 reopen은 필수 table/trigger와 writer=0을 검사한다.

명시적인 `publishReview`만 절차를 시작한다. view/metric 조회는 procedure/배정/승인 권한을 만들지 않는다. 현재 MET + exact full allocation + canonical UNACCEPTED 관측 + 판정 공개가 모두 필요하다. 재원 대기는 시작 전 별도 상태이며 firstStartedAt/cap을 만들지 않는다. procedureId/firstStartedAt/reviewCapAt는 새 판정·새 key·retry·재시작으로 초기화하지 않는다.

판정 공개마다 `confirmAt=publishedAt+120`, 최초 절차의 `reviewCapAt=firstStartedAt+600`을 보존한다. 조기 경로는 두 인증 역할의 같은 현재 scope 동의가 필요하다. 기한 경로는 `now>=confirmAt`과 `confirmAt<reviewCapAt`가 필요하다. published+120==cap이면 최초 accept가 cap보다 엄격히 빨라야 하므로 기한 경로의 유효 구간은 없다. 그 판정에 새 양측 동의가 생기면 cap 전 조기 경로는 가능하다. 두 경로 모두 자격·source·전액 배정·이의 검사를 유지한다.

## 재검증·이의·취소·종료

단순 source 재수집과 통신 retry는 판단 재검증 횟수를 쓰지 않는다. 새 근거/객관 오류 판단은 서버의 별도 assessment 연결부가 내놓은 exact receipt를 참조하는 `recordReviewRevalidation`으로1회 기록한다. 동일 assessment ID의 반복은 재사용하며 count를 늘리지 않는다. 판단 재검증 뒤 옛 판정으로 준비물을 만들 수 없고 새 evidence/decision과 새 공개·동의 또는 그 판정120초가 필요하다. 두 번째 새 유효 오류는 count=1을 유지하면서 `NEW_VALID_ERROR_AFTER_ONE_REVERIFICATION` 종료 필요를 남긴다. 기본 assessor는 미구현/차단이다.

이의는 허용 reason과 같은 신청의 evidence ID로 내용 있는 접수를 구성한다. 모든 유효 접수는 RECEIVED/UNASSESSED로 시작해 조기·기한 경로를 모두 막는다. 같은 actor/판정/근거/사유는 같은 접수다. 새 판정으로 이의가 자동 소멸하지 않는다. `DUPLICATE/IRRELEVANT/VALID_UNRESOLVED/RESOLVED` 분류는 서버 전용 assessor의 본인 신청·현재 판정·근거 evidence·receipt를 재검사한다. body에 outcome/verified를 넣는 API는 없다. 별도 인간 최종 심판이나 운영자 임의 반려권한을 추가하지 않았다. 실제 assessor 연결/품질 인수는 미완료다.

cap 경과·기한 내 갱신하지 못한 만료 자료·1회 뒤 새 유효 오류는 `UNRESOLVED_TERMINATION_REQUIRED`다. cap 전 신청 취소/철회는 `INVALIDATED_WAIT_FOR_TERMINATION_CONDITION`이며 최초 accept/current를 차단한다. 취소만으로 예약/의무 종료 사유를 만들지 않는다. 원래 cap이 지난 뒤에는 승인된 종료 사유로 intent를 생성할 수 있다. 만료/변화 무효화는 count나 cap 뒤에도 E1 refresh에서 계속 적용한다.

`requestReviewTermination`은 E4가 검사할 intent만 남긴다. 세 사유는 [port proposal](e4-port-proposal.json)에 고정했다. `inspectTerminationForE4`는 최신 source-head commitment와 funding/chain snapshot을 다시 확인한다. `contractExecuted/reservationReleased/epochInvalidated=false`를 유지한다. 실제 종료는 E4 contract가 미수락·권한·조건을 확인하고 **옛 epoch 무효화 + 같은 기수 예약 해제 + 의무 전이**를 원자 처리해야 한다. accepted가 먼저 관측되면 종료 intent 사용을 거부한다.

## E4 배정·교체·checkpoint 연결부

[e4-port-proposal.json](e4-port-proposal.json)은 E3 소유 제안이며 공통 최종 pin은 통합 소유다. 메서드는 동기 서버 snapshot reader다. 비동기 RPC/producer는 transaction 밖에서 실행하고, 확인한 reader checkpoint를 동기 공급해야 한다. 현재 구현이 받는 유일한 configured execution은 `SYNTHETIC_PORT_FIXTURE`; callback이 없으면 NOT_IMPLEMENTED다. HTTP에서 snapshot/actor/서버 시각/verified flag를 공급할 수 없다.

| 연결부 | 책임 |
| --- | --- |
| funding | 같은 app/recipient/100 TEST/decimals6/obligation, exact current decision·MET 수락 sequence·전액 예약. 대기 queue/shortfall과 실제 reserved target을 구분 |
| chain | canonical UNACCEPTED/ACCEPTED/TERMINATED 및 별도 claim/tx 상태. E3가 체인 진위를 형식/hash로 검증했다고 주장하지 않음 |
| authorization | 고정 domain, signer key/active, app epoch, 사용 가능 nonce와 최초 accept expiry. 실제 key/nonce authority는 E4 소유 |
| registration | publication 전 host가 선택한 allocation/obligation logical ID와 token/domain. recipient/100/policy/runtime/source는 현재 target에서 결합 |
| assessment | 본문 자유 boolean을 대신하는 별도 검증 결과. receipt ID/신청/판정/근거 evidence 결합, 기본 비활성 |

funding의 acceptanceSequence는 `r2_decisions.sequence`다. 화면의 전역 ledgerSequence를 배정 순위로 쓰지 않는다. full allocation이 옛 판정을 가리키면 view에는 실제 target을 보존하고 `matchesCurrentDecision=false`로 표시하며 새 준비를 막는다.

배정 전 bootstrap은 내부 `registerCurrentMetForE4(context,app,currentTargetCasBody,key)`와 `inspectRegistrationForE4(context,app,registrationTargetId,expected?)`로 수행한다. 등록은 인증/역할/current MET/source/sequence를 최종 재검사하고 trusted registration callback의 logical allocation ID를 단일 durable registry에 매핑한다. browser가 opaque ID를 지정하거나 mapping을 등록하는 HTTP는 없다. 이 단계는 **procedure/firstStartedAt/cap/consent를 만들지 않는다.** E4 registerCurrentMet/allocate는 이 app/decision/allocation bytes32를 먼저 사용하고, full allocation 확인 뒤 E3 publication이 같은 ID를 재사용한다. 같은 allocation logical ID를 다른 app에 별칭으로 등록하지 못한다.

최초 발급 뒤 mapping은 불변/1:1/재시작 보존이다. 정정은 새 decision mapping만 추가하고 app/allocation mapping과 기존 obligation을 유지한다. bootstrap이 존재하는 앱의 새 판정은 새 current 등록 인계가 있어야 publish할 수 있다. 등록 record에는 current policy/mapping/recipient/100/sourceWindow/수락 sequence와 host domain/token이 들어가며 내부 조회는 exact snapshot CAS도 지원한다. host는 실제 chain registration/배정 결과를 이 ID와 대조해야 한다. 단순 전액배정 fixture를 직접 쓰는 기존 단위 시험은 체인 등록을 모델링하지 않는다. [합성 인계 예제](synthetic-intake-example.json)는 bootstrap→가상 E4 register/allocate→publication→동의/unsigned→정정 bootstrap→종료 인계를 재현한다.

정정은 같은 application/obligation/**allocationId/기존100 예약**을 보존한다. 새100이나 새 allocation ID를 요구하지 않는다. 명시 replacement receipt의 from allocation/decision/hash는 공개된 이전 target과 같아야 한다. from epoch/version은 공개 baseline과 마지막 E3 관측 checkpoint **이상**이어야 하고, to epoch/version은 각각 증가해 현재 funding snapshot의 target/epoch/version과 정확히 같아야 한다. startReview/bindConsents/observe 등 같은 판정의 정상 E4 처리로 baseline보다 값이 커지는 경우를 허용한다. boolean 한 개나 receiptHash 자체를 실제 체인 증거로 삼지 않는다.

E3는 성공 명령과 함께 관측한 checkpoint를 append한다. 그 이후 입력이 낮은 epoch/version이나 잘못된 이전 target으로 후퇴하면 거부한다. 같은 판정의 단조 증가로 동의 scope를 매번 새로 만들지 않는다. 실제 E5 reader의 last-confirmed canonical checkpoint·재구성·ABI/log 검증·체인 CAS는 미구현이며 이 관측 기록으로 대체하지 않는다. 재구성 뒤 실제 reader 상태를 안전하게 이행하는 별도 계약이 필요하다. view는 checkpoint를 생성하지 않는다.

## sourceWindow·unsigned .3·내부 CAS

`currentSourceWindow`는 E1의 네 valid head와 immutable decision을 재확인하고 각 source guard가 현재 mapping/trust/lease와 같은지 검사한다. Moodle3개의 관측 acquiredAt, Reclaim2개의 signed issuedAt, 최소 auth/raw/query lease, 가장 이른 원문 획득과 verified/head validUntil을 E2 sourceWindow로 옮긴다. cutoff는 Moodle+300, 두 proof+900, raw+1800, 세 lease와 검증기 valid-until의 **가장 이른 exclusive 시각**이다. 기존 v1 age300 inclusive 기록은 고치지 않고 E3 view/준비물에서 exclusive 경계를 별도로 적용한다.

`prepareReviewAuthorization`은 서버가 route를 선택하고 현재 기록에서만 unsigned 자료를 만든다. E2의 고정24필드·type/domain을 import한다. expiry는 원래600 cap/source cutoff/E4 authorization expiry의 최소값이다. E2 `.3` inspector를 실제로 호출하되 결과는 `UNSIGNED_PREFLIGHT_ONLY`다. source 서명·동의의 온체인 wallet signature·chain·durable nonce가 형식 검사로 검증되는 것이 아니다.

`inspectPreparedForE4(context,app,preparationId,expected?)`는 내부 전용이며 HTTP route가 없다. 현재 state와 source/동의/이의/funding/key/epoch/nonce를 다시 구성하고 저장된 exact payload와 비교한 뒤 .3 inspector를 현재 시각으로 다시 호출한다. 선택 expected의 세 필드는 app revision, 전역 sequence, server snapshot hash이며 이전 server 결과와 비교한다. 반환은 full payload·등록 target/window·current state·source commitment·세 port snapshot hash·CAS다. hash 형식이 맞는 browser snapshot을 수락하는 endpoint가 아니다. E4는 송신/서명 직전 이 현재성을 재확인하고 contract의 원자 nonce/epoch/예약 검사를 수행해야 한다.

E3의 prepared nonce registry는 같은 domain+nonce를 다른 target/시각으로 덮어쓰지 못하게 한다. **체인 nonce를 소비하거나 예약한 것은 아니다.** 준비물은 signer/outbox 권한이 없다. cap/source 만료·새 판정·동의 철회·이의·key/epoch/nonce 변화 뒤에는 옛 준비물을 거부한다. accepted가 먼저면 새 preflight를 하지 않고 `NOT_APPLICABLE_ACCEPTED_RIGHT`를 반환한다.

## canonical 앱 동의 recipe

scope `clear-bootcamp-app-consent-scope.1`은 profileHash, opaque app/procedure/decision/allocation ID, policy/mapping/decision revision/hash, recipient/token/100 TEST, allocation의 publication baseline version, 최초 시작/원래 cap/현재 공개/confirmAt을 묶는다. 해당 역할의 인증된 command가 actorCommitment와 서버 recordedAt을 가진 immutable consent를 만든다. actorRole/wallet/시각은 인증 context에서 도출한다. 역할별 가장 최근 기록이 AGREE이고 현재 scope/binding이 유효할 때만 사용한다. WITHDRAW 또는 권한 철회 뒤 예전 AGREE로 fallback하지 않는다.

set `clear-bootcamp-app-consent-set.1`은 `variant`, `scopeHash`, 역할순 consents의 `{id,actorRole,actorCommitment,scopeHash,recordedAt}`, `objectionVariant`, ID순 objections의 `{id,status,assessmentId,receiptHash}`를 가진다. route1은 `MUTUAL_CURRENT_APP_CONSENT`로 두 역할을 요구한다. route2는 `DEADLINE_CURRENT_APP_CONSENT_SET`으로 빈 배열/부분 동의를 명시한다. 이의가 없으면 NO_OBJECTIONS, 존재하면 ASSESSED_RECORDS이며 unresolved/unassessed는 그 전에 차단한다.

hash는 UTF-8 `domain + '\n' + canonical JSON`의 SHA256, 0x lowercase hex다. domain은 proposal의 `consentScopeHashDomain/consentSetHashDomain`과 같다. object key는 UTF-16 정렬, array는 위 순서, 정수 JSON number·명시 null을 사용한다. locale sort를 쓰지 않는다. 최종 authorization nonce/issuedAt/expiresAt/deadlinePolicyHash를 consent scope에 넣지 않아 **consentSetHash↔final deadlineHash 순환이 없다.** final .3 window는 이미 확정한 consent set을 별도로 묶는다.

[synthetic-intake-example.json](synthetic-intake-example.json)은 새 임시 DB·인공 지갑에서 생성한 실제 E3 공개·양측 앱 동의·unsigned 준비와 종료 intent 예제다. 개인 raw/claim/cookie/key는 없다. `procedure-artifact.test.mjs`는 독립 canonical/SHA recipe와 E2 TypedDataEncoder로 hash를 대조하고 consumer pin의 E2 source SHA도 확인한다. generator는 `tests/bootcamp-store/export-procedure-example.mjs`다. 랜덤 ID·인공 지갑 때문에 재생성 bytes는 달라지며 고정 예제 자체의 hash/관계가 검증 대상이다.

## 두 화면·HTTP 인계

새 version `clear-bootcamp-review-procedure.1`, namespace `/bootcamp/v3/`를 쓴다. v1/v2를 조용히 확장하지 않는다. 호스트는 이 namespace도 기존 opt-in handler로 연결해야 하며 새 listener/배포/web 변경은 없다. 학생과 해당 course operator는 같은 app/decision/policy/mapping/ledger sequence/procedure pins를 받는다. operator DTO에는 wallet/raw/facts/locator를 넣지 않는다.

| 메서드 / :app 뒤 경로 | 입력·출력 |
| --- | --- |
| GET procedure | source current, 절차/재검증/동의/이의, funding queue·shortfall, accepted right·claim·tx의 별도 축 |
| POST review-publications | 현재 target CAS. 최초 절차 또는 새 판정 공개 |
| POST review-consents | CAS + value AGREE/WITHDRAW |
| POST review-objections | CAS + reason + 같은 신청 evidenceId |
| POST objection-assessments | CAS + assessmentId + objectionId. 내부 등록 결과를 lookup, 임의 outcome 불가 |
| POST review-revalidations | CAS + assessmentId. 검증된 새 근거 판단 결과만 lookup |
| POST unsigned-preparations | CAS만. 서버가 현재 target/route/payload를 구성, ID 반환 |
| POST termination-intents | CAS만. 승인된 종료조건에서 E4 재검사용 intent ID |
| GET procedure-operations/:id | 응답 유실 복구용 immutable target/current, payment authority=false |

registration bootstrap 및 E4 full unsigned/termination 내부 조회는 이 HTTP 목록에 없으며 서버 통합용이다.

공통 CAS는 `expectedRevision/expectedLedgerSequence/targetDecisionId/targetDecisionRevision/targetDecisionHash`다. 모든 POST는 기존 idempotency key, 인증·CSRF·origin/HTTPS/loopback·4096-byte 제한을 따른다. 완료 명령은 같은 body/key로 같은 operation을 복구한다. 실패 뒤 관측 무효화/failure metric으로 sequence가 변했으면 새 view의 CAS를 받아 재시도한다. 이 재시도는 cap/count를 리셋하지 않는다.

정상 view/metrics가 처리권한을 만들지 않는다. accepted 이후 source/lease/key/epoch가 바뀌면 evidence 축은 stale/재확인으로 바뀌어도 **chain acceptedRight는 고정 권리로 별도 보존**한다. claim 만료/운영자 회수/현재 signer·새 서명 요구는 추가하지 않는다. 실제 chain 미연결이면 acceptedRight/tx는 null/NOT_IMPLEMENTED다. 합성 source+합성 port 결과를 전체 실제 E2E로 표시하지 않는다.

## 최종 경계·미구현

E1 shared access의 최종 source/clock/revision/sequence/scope/role 검사에 E3 port/source snapshot 재검사를 추가했다. command savepoint rollback 뒤 새 관측 invalidation은 재적용해 commit한다. 실제 외부 서비스 전체를 분산 lock으로 묶지는 않는다. 신뢰된 snapshot callback은 동기·읽기 전용이어야 하며 재진입 mutation/async I/O를 해서는 안 된다. 이미 반환된 JS string/borrowed 사본의 물리 소거를 주장하지 않는다.

성공 command/procedure/consent/count/prepared nonce mapping/metric은 같은 transaction이다. 실패 event는 rollback 뒤 별도 서버 기록으로 보존한다. 동일 logical command retry의 실패를 성공이 지우지 않는다. metric은 실제 합성 서버 구간이며 사람 작업·baseline·개선율·전체 사례/P5는 미측정 null/N/A다. 일반 조회·body 검증 전 거부까지 완전한 실패 계측으로 주장하지 않는다.

E6 Moodle async getRaw의 실제 source probe는 이 E1 동기 offline getter와 drop-in 호환이 아니다. 후속 host/auth/CAS 연결, per-call60초 token과 사용자 auth/raw/query lease의 구분, 실제120초 경로에 충분한 새 query 준비가 필요하다. 옛 decision lease 갱신은 금지한다. AI borrowed release와 shared owner.dispose도 분리해 인수해야 한다. E6 준비 PR86/87은 이번 브랜치에 조기 merge하지 않았다.

실제 source/collector/assessor·E4 canonical funding/key/nonce reader·signer lifecycle·E5 outbox/worker/relayer/reorg·로컬/공개망 지급은 미구현/미수락이다. 기존 source·funding·web·frozen docs/specs는 자체 수정하지 않았다. 기존 금고·DB·체인·키와 production=false/v1 gates를 보존한다. 새 TEST 경로의 단계별 구현 승인은 유효하며 본 Draft 완료를 지속 실행 activation으로 간주하지 않는다. Mac fixture 수명 경쟁 수정과 원래 실패 CI IPC 순서 미관측을 구분한다.

정확 commit·검증·Draft/CI는 [E3_VERIFICATION.ko.md](E3_VERIFICATION.ko.md)를 따른다.
