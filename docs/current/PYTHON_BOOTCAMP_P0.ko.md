# CLEAR Python 부트캠프 P0 정책·기록 계약 고정

2026-10-17 추가 승인·계획 revision2: [MVP 보완 계약·실행 백로그](PYTHON_BOOTCAMP_R2.ko.md)를 우선한다. 기존 P0 동결03fa643과 네 조건/100 TEST·P1/P2는 유지한다. Oracle 승인·부족알림/영향 대기열·학생/운영자 두 화면·기존 relayer 가스 UX·실측 이벤트를 P3→P4→P5의 실제 구현 범위에 추가했다. 별도 v2 envelope/이행 인수이며 기존 v1 wire·ABI는 바꾸지 않는다. 현재 지급/production을 켜지 않으며 P4 권한·자금 코드는 Astra/High 경계 리뷰 후 격리 TEST로 진행한다. 아래의 종전 P3/P4/P5 계획만 정리한다는 문구는 이 추가 승인 이전 범위다.

2026-10-17. 사용자 승인에 따른 새 주 시연 정본이다. 요청 Sol/High(다중모듈 정책/계약), 실제 런타임 모델 ID 독립 확인 없음. 이전 당일 기획서의 내부퀴즈70점·활동2개 후보는 아래 HackerRank 보유형 정책으로 대체한다. 기존 YBM/시원 분석·연구/원문/회귀와 PR69/73/75 회로 연구는 보존한다. 이번 실제 구현 범위는 P0와 P1/P2 연결이며 P3/P4/P5는 관계·설계 관문/인수 계획까지만 정리한다. 지급·실자금·새 검증자 신뢰·production 활성화는 승인하지 않는다.

## P0 고정 정책

정책 ID `clear-python-bootcamp-demo`, version `clear-python-bootcamp-policy.1`, revision1. 단일 가상 Python 부트캠프와 **아래 네 조건 ALL/AND**다. 운영 학원 조건으로 소개하지 않는다. 정본 JSON은 [p0-policy.json](../../specs/bootcamp/p0-policy.json), 논리 target과 환경 pin은 [p0-runtime-mapping.json](../../specs/bootcamp/p0-runtime-mapping.json)이다.

| 논리 criterion / 새 capability | 고정된 의미 | 고정하지 않거나 금지한 해석 |
| --- | --- | --- |
| activity-complete / MOODLE_ACTIVITY_COMPLETION.1 | 지정 논리 활동1개의 Moodle 완료 상태. 실제 설정이 관측된 automatic completion rule과 participant/course를 결합 | 일별 수강률·영상 시청시간·집중도·실력으로 바꾸지 않음. manual 체크/설정 미확인은 자동 완료로 승격하지 않음 |
| assignment-submitted / MOODLE_ASSIGNMENT_SUBMISSION.1 | 지정 논리 과제1개의 해당 참가자 제출 상태 SUBMITTED. DRAFT는 제출 완료가 아님 | 과제 점수·합격·작품 수준 평가를 새 필수조건으로 추가하지 않음 |
| reflection-topics / REFLECTION_REQUIRED_TOPICS.1 | 회고에 수행한 내용·문제해결 과정·배운 점 세 항목을 원문 근거로 확인 | 긍정성·성의·전반 실력 점수·최소 글자수·사진/Vision을 필수로 추가하지 않음. 문제가 없었다는 명시와 점검 과정은 허용하며 문제를 지어내도록 요구하지 않음 |
| python-basic-certificate / HACKERRANK_CERTIFICATE_HOLDING.1 | 신선한 조회 시점에 본인 통제 계정과 대응하는 Python (Basic) 합격 인증이 issuer status=test_passed로 존재 | 과정 기간 중 새 합격/응시·무도움 실력·실명 확인을 주장하지 않음 |

기존 compiler/evaluator의 EXAM/BASELINE/DAILY·BOOLEAN 요구조건으로 새 의미를 위장하지 않는다. HackerRank를 TOEIC 숫자 점수로, activity를 일별 학습율로 변환하지 않는다. 위 네 capability는 별도 versioned 모델이다. P0 `specs/bootcamp/p0-contract.mjs`는 구조/관계 및 reference oracle이며 source/signature 검증기·제품 DB/HTTP 구현이 아니다. P1/P2 담당이 최소 런타임 capability/producer/consumer를 구현하고 기존 회귀를 유지한다. 브라우저가 전달한 verified/condition 플래그를 수락하는 경로는 없다.

### 인증서 의미와 증거 범위

인증서 선택은 **보유형**이다. 과거 합격 인증서를 활용하되 현재 조회한 issuer 상태·계정 통제를 확인한다. 실제 `achievementAt`/합격시각이 API에 없으면 null·원천 미제공으로 남긴다. 증명 signed timestamp는 신선도/취득의 근거이며 합격시각으로 대체하지 않는다. 현재 status 관측은 영구 유효/취소 이력 완전성 증명이 아니다.

로컬 HackerRank 가능성 실험의 요약과 실행기를 읽어 계정+인증서 각각의 서명 검증·동일 username/local proof owner·4필드 변조 거부를 확인했다. 실제 계정/인증서/원본 claim을 공개 테스트에 복사하지 않는다. 실행기의 dashboard/certificate URL과 특정 username·첫 data item 고정, trusted signer/provider/recipe·참가자 request binding·nonce/expiry/replay 미연결을 완료로 해석하지 않는다. summary의 authenticated/anonymous replay bool은 실행기가 별도로 assert하는 검사가 아니라 실측 보고 값을 요약에 넣은 것이다. 실행기를 다시 실행하거나 원본 claims/.env를 읽지 않았다.

P1은 private account/dashboard 통제 증명과 공개 certificate 증명 **둘 다** 검증해야 한다. 공개 인증서 하나만으로 신청자 소유를 확정하지 않는다. 같은 signed username·claim owner와 **한 인증서 레코드의 certificateId/name/status**를 결합한다. 요청에서 선택한 certificateId가 없고 여러 후보가 남으면 AMBIGUOUS/UNKNOWN으로 보류하고 data[0]이나 고정 username을 쓰지 않는다. 두 증명의 nonce/request·policy/criterion·participant/application/claim-owner binding이 signed 원문 또는 검증 가능한 protocol 관계에 있어야 한다. unsigned wrapper hash만 붙여 VERIFIED로 표시하지 않는다. 방법이 성립하지 않으면 requestBinding UNKNOWN·수락 비활성으로 보고한다.

### 금액·시간·환경 pin

고정 금액은 **100 TEST = 100000000 atoms**다. 현행 [ClearTestToken](../../contracts/ClearTestToken.sol)은 symbol TEST·decimals6이며 정수식 `100 * 10^6`으로 대조한다. chain/token/runtime decimals가 다르면 거부하고 조용히 재스케일하지 않는다. token 주소/chain/계약 배포·초기 배정액은 아직 정하지 않았다.

아래는 명시적인 시연 선택이며 상용 SLA/멘토 확정값이 아니다.

| 항목 | 고정값/시계 | 해석 |
| --- | --- | --- |
| 초기 자료 접수 | pinned demoStartedAt 기준 scenario초 [0,1800) | 수락 접수 시각의 시연 창. 과거 합격일의 제한으로 쓰지 않음 |
| 보완 접수 상한 | scenario초3600 미만 | 수정은 새 revision, 최초 접수 시각·과거 판단 보존 |
| Moodle 관측 신선도 | 실제 UTC epoch초 최대300초 | 오래된 API 관측을 current로 쓰지 않음 |
| Reclaim 두 signed proof 신선도 | 실제 UTC epoch초 최대900초 | 최근 수락/verify 시각만 바꿔 옛 signed proof를 새롭게 만들지 않음 |
| request expiry | 실제 UTC epoch초900초 이하 | participant request·proof 생성/수락의 만료를 강제 |
| raw 보존 상한 | 기존 C2 1800초 이하 및 auth/raw/query lease 최소값 | 취소/권한철회/만료·오류에 소유 복사본 폐기, JS/강제종료 물리적 삭제는 보장하지 않음 |
| 동의/이의/지급 시간 | 미정 null | 72/120h·자금 귀속/해제는 P3/P4 별도 관문 |

압축 clock advance는 OFFLINE_TEST_ONLY다. 실제 API의 생성·수정·제출 시각이나 signed proof timestamp를 합성 시계로 덮어쓰지 않는다. 운영 시간표는 미정이다. 실제 source 제출시각이 없으면 acquiredAt으로 역사적 제출기한 충족을 만들어내지 않는다. 이번 predicate는 조회 시점 완료/제출/인증 보유와 시연 접수 창이며 “과정 시작 뒤 새 달성”이 아니다.

논리 정책 ID와 실제 숫자 Moodle ID를 분리한다. 현재 actualIds=null/ready=false는 **미검증 상태**이며 실행 가능한 가짜 ID가 아니다. Moodle 담당이 소유 격리 합성 fixture에서 course/activity cmid·completion 설정/assignment/reflection container와 actor mapping을 최소 검증한 뒤 소유 report에 기록한다. API 담당이 그 report exact commit을 runtime mapping으로 pin한다. 환경을 재생성하면 policyHash를 몰래 바꾸는 대신 mapping hash/revision을 바꾸고 기존 evidence/decision을 stale 처리한다. 여러 회고 글은 명시 선택한 source record를 결합하고 첫 항목으로 대체하지 않는다.

## 공통 기록·불변 관계

새 namespace `clear-bootcamp-records.1`이며 기존 M1/C1/C2/C3 wire에 새 field를 몰래 넣지 않는다. 기존 participant/wallet session, Binding, source receipt/query, 원문/정규화/UTF-16 근거, immutable receipt/CAS/current 관례를 재사용한다. 기존 C2 SYNTHETIC-only/IMAGE_NOT_DECODED·개인자료 제한은 그대로다.

| 기록 | 고정 필수관계 / 의미 |
| --- | --- |
| Evidence | evidenceId/revision, participant/application/policyHash/criterion/capability, source provider/instance/record/accountBinding, acquiredAt/verifiedAt, sourceVersion/hash, runtimeMappingHash, requestHash, verification(source/participant/request/integrity/freshness), typed facts, predicate condition, private rawLocator/expiry, previousEvidenceId |
| Decision | decisionId/revision/hash, 고정 recipientRef/금액 후보, 정책, 정확 evidence ID/revision·source/mapping hash들, criterion별 상태·원문 locator, evaluatedAt, previousDecisionId, current, 조건 결과. MET는 시연 조건 결과이며 productEligible/paymentAllowed를 켜지 않음 |
| Consent | target decision ID/revision/hash, 권한 있는 actorRef/role·시각·이유/근거. 같은 current MET 결과+해당 신청의 전액 배정이 전제. 예전 결과의 동의를 새 결과에 재사용하지 않음 |
| Objection | target decision ID/revision/hash, actor/time/reason/evidence refs, 접수 processingStatus와 타당성 validityStatus를 분리. RECEIVED는 UNASSESSED이며 유효 이의가 아님. 반복/중복 요청으로 deadline을 연장하지 않음 |
| Payout intent | application·target decision/version/hash·고정 recipient·amountAtoms·해당 decision/recipient에 결합된 allocationId·idempotencyKey·txState. 자격과 배정/송신/확정은 별도. 원문·임의 서명자/송금 권한을 넣지 않음 |

`facts`는 capability별 실제 의미를 가진다. activity completion state/mode/rule hash·원천 완료시각(null 허용), assignment submission state·원천 제출시각, reflection originalBodyHash/3topic state·원문 source/span/quoteHash·run/profile, certificate class/status·account/cert proof hashes·username/certificateId/claimOwner commitment·각 signed timestamp·achievementAt(null)로 구분한다. numeric Moodle ID/원문 username·certificate 개인 연결정보는 권한 있는 내부 source receipt에만 두고 공개 fixture/요약/체인에 복사하지 않는다. P0 예제는 새 synthetic 이름/본문/commitment만 사용한다.

최소 observation context 제안 `clear-bootcamp-observation-context.1`: participantId/applicationId/policyHash/criterionId, evidenceId/revision·sourceVersion/hash·sourceReceiptHash/runtimeMappingHash/requestHash, original inputHash·normalizer/normalized hash, runId/attempt·model/prompt/profile·expiresAt/sourceStatus를 고정한다. 기존 C2 RunContext의 SYNTHETIC 전용 의미를 LOCAL로 바꾸지 않고 새 wrapper에서 참조한다. reflection 3topic의 PRESENT는 원문 quote/UTF-16 span/hash에 근거해야 한다. MISSING/UNCERTAIN/CONFLICT는 이유와 보완 안내로 남기고 sourceStatus와 분리한다. 제목 내부 인용/이미지 region은 기존 미지원 범위를 확대하지 않는다.

P0 executable oracle은 trusted producer의 condition/verification assertion을 구조적으로 대조할 뿐 실제 signature/registry 권한/원문을 검증하지 않는다. P1/P2 제품 수락은 신뢰한 producer만 입력으로 삼고 원문과 실제 predicate를 검증한다. MOCK_VERIFIED는 SYNTHETIC_FIXTURE에서만 가능하며 실증명 검증으로 표시하지 않는다. 날짜·지갑·source hash를 호출자가 함께 위조할 수 있는 fixture hash만으로 진위를 보증하지 않는다.

### 단회 수락·현재성·수명

P1 Reclaim verifier의 책임은 두 증명·trusted signer/recipe·same-record extraction·participant request binding/expiry 검증과 candidate receipt다. **전역 durable nonce 소비와 evidence/decision acceptance는 제품 API/저장 담당의 한 transaction**이다. 분리된 volatile cache만으로 crash 후 replay 방지를 주장하지 않는다. nonceHash·requestHash·proof bundle hash·participant/application/criterion/policy와 actor/route/key를 고정하고 동일 명령은 같은 target, 다른 body는 충돌이다. 동일 원문 증명의 다른 nonce/계정·다른 신청 재사용도 검증 관계에 따라 거부한다.

Evidence/Decision은 append-only다. 수정/삭제·접근불가/정책·mapping·request 변경은 head/current를 무효화하고 새 evidence revision과 decision을 만든다. 영수증/이전 판단/이전 동의는 보존하되 current 권한으로 되살리지 않는다. invalidation은 거부 명령 rollback 때문에 사라지지 않아야 한다. API/DB의 단일 ledger/CAS·transaction내 인증/소유권 재검사·중간 실패/재시작/crash gap이 인수 조건이다. source GET 성공/AI 메모리 isCurrent만으로 원자 수락을 주장하지 않는다.

原문 locator는 recordRef/fieldPath/expiry이며 로그·공개 URL·파일경로·토큰을 저장하지 않는다. 실제 source raw와 private claim 읽기는 승인된 소유 collector/verifier에서만 하고 요약/해시만 공통으로 전달한다. 생성 계정 통제는 실명/기관 인정이 아니고 Moodle/API 권한을 operator의 전체 학생 열람권으로 전용하지 않는다. raw 만료 시 current 검증/근거 접근 제한을 표시하고 이전 사본으로 몰래 처리하지 않는다.

## P3/P4/P5 관계·인수만 고정

조건 MET+current+해당 신청 **전액 배정** 뒤에만 동일 결과 동의를 기록할 수 있다. UNKNOWN 증거를 동의/침묵/기한으로 통과시키지 않는다. 이의 접수와 객관적 오류의 유효성 확인은 별도이며 새 decision은 옛 동의를 무효화한다. 보완/새 원천 오류와 반복 동일 요청을 구별하고 반복으로 기한을 무한 연장하지 않는다. 양측 동의/무이의 기한이 있어도 원천·신청/수령인 결합·중복·잔액/배정 검사는 유지한다.

자금 해제·귀속/불확정 종료·회수권·이의 중 배정/지급 경쟁과 새로운 verifier trust는 명시 설계 관문이다. 이 미결이 P1/P2 증거/이력 구현을 막지는 않는다. 72/120h, 상용 예치율·배정순서·충전의무·PG는 미정이며 P0가 임의 상수로 채우지 않는다. time 경과만으로 계약이 송금하지 않으므로 worker/keeper·송신/재시도/응답유실/확정/reorg/수동 대체 실행을 P4 인수에 포함한다. 이번에 worker·새 payer·claim 권한을 구현하지 않는다.

최종 계획의 우선순위는 **P0 → P1 Reclaim / P2 Moodle·AI·저장 병렬 → P3 동의·이의 → P4 배정/TEST 지급 → P5 E2E**다. 당일 이전 기획서의 P1/P2 이름보다 이 순서를 우선한다. P3/P4 실질 자금·권한 변경은 별도 Astra/High 검토/승인 단위다.

P5 인수는 ① 정상 자료→조건/근거→전액배정→같은결과확인→TEST거래확정 ② 원천 수정→새 evidence/판단→옛자료/동의/late 거부 ③ 재원부족→배정대기→충전→중복없는 배정/지급 및 재시작이다. 지금 세 시연이 실행 완료됐다고 기록하지 않는다.

## 소유 경로·기존 세션 재개

| 담당 / 요청 설정 | 직접 소유 | 금지/의존 |
| --- | --- | --- |
| 통합 리뷰 / Sol High | docs/current 정본·동결 specs/bootcamp·교차 리뷰/통합 인수 | 공통 제품 schema/HTTP/DB/ledger·전용 adapter 중복 수정 금지 |
| 공통 제품 API·저장 / Sol High | 별도 worktree의 제품 schema/HTTP/DB·새 capability compiler/evaluator·evidence/decision ledger/CAS·C2 무효화/crash gap | 오래된 채팅 상태를 최신 PR67 병합·PR74/본 P0부터 대조. 이 행이 공통 제품 파일의 단일 소유자 |
| Reclaim / Astra High | 별도 HackerRank branch/worktree의 전용 verifier/adapter·합성 tests/docs | 기존 PR69/73/75·미커밋 보존. YBM 회로 추가 확장보다 이번 adapter 우선. 실제 로그인/새 개인증명은 준비 뒤 필요시 사용자 확인, 원문/.env 공개/개인자료 복사 금지 |
| Moodle / Sol Medium | 기존 전용 module/spike/tests/docs의 activity·assignment·reflection API 및 sourceVersion·mapping report | 소유 격리 합성 lab만 최소 실측. 미검증 실제 ID 발명·타 볼륨/개인서비스/공통 schema/DB/CI/web 변경 금지 |
| AI / Sol Medium | 기존 PR72 전용 review module/tests/docs의 회고3topic·원문근거·보완/current binding | 제출유무/수치/서명은 코드, 주관 긍정성/성의 점수 금지. 기존 유료승인 소진·추가 호출0. 공통 schema/DB/web 수정 금지 |

모두 기존 네 세션을 재사용하고 현재 턴은 종료 후 이어간다. 새 세션/하위 에이전트를 만들지 않는다. API·Reclaim은 주 checkout을 공유하지 않는 독립 worktree/branch를 사용한다. 각 지시에 본 P0 고정 commit·문서·예제·인수·소유 경로를 포함한다. P1/P2의 schema 변경 제안은 제품 API 담당과 조율하고 통합 리뷰가 교차 검토한다. web/와 독립 청구 기존 연구 파일은 건드리지 않는다.

## 검증·완료와 남은 관문

P0 예제/새 합성 회고는 [p0-example.mjs](../../specs/bootcamp/p0-example.mjs)·[reflection-example.json](../../specs/bootcamp/reflection-example.json)이다. 실제 account/certificate/claim 연결자료를 fixture로 복사하지 않았다. `bootcamp-p0-contract.test.mjs`는 네조건AND·capability/participant 혼입·unknown source/request/freshness·old signed proof·정정/옛동의·미배정/시간fallback·접수이의 오인 거부를 검사한다. 실제 source/crypto/DB/payout 검증 수와 합산하지 않는다.

재현: `./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/bootcamp-p0-contract.test.mjs`.

실제 fixture mapping·P1 trusted signer/recipe/request binding·P2 런타임 capability/ledger/권한·원문 수명·P3/P4 미결은 각 정확 commit/시험으로 따로 인수한다. 확인할 수 없는 source/API 필드는 UNKNOWN/UNSUPPORTED다. grant/outbox HOLD·paymentAllowed=false·독립청구 NO_GO·개인자료/합성 업로드 제한을 유지하며 Draft PR만 만든다. 무조건 PR 병합/배포 승인은 없다.

P0 동결 로컬 검증: 신규20/20 포함 기존 workflow/AI/document 회귀309/309, 원본/legacy191개·의존성 graph 보존·diff PASS. signer/원천·실제 runtime mapping·DB·지급 검증을 실행한 결과가 아니다. 원격CI와 각 dispatch/인수 결과는 Draft PR exact head 및 후속 검증 기록을 따른다.

P0 고정 commit `03fa64324ef9cc2ce4fb442a612329a7b1285677`·[Draft PR78](https://github.com/gw020328-oss/clear-education-v4/pull/78)의 CI6/6을 확인했다. 기존 네 세션에 위 설정으로 실제 dispatch하고 작업 시작을 확인했다. API/Reclaim은 별도 새 worktree, Moodle/AI는 기존 전용 worktree를 사용하며 새 세션/하위 에이전트/턴중단은0이다. 이 기록은 P1/P2 검증 완료가 아니라 진행 개시 증거다. 이후 실제 검증/미구현은 각 exact head 인수 기록을 따른다.
