# 해커톤 TEST 운영 정본 — E0 / 계획 revision4

2026-10-18. 사용자 확정 decision revision1·운영 profile **`clear-hackathon-test-operations.1`**을 저장소에 반영한다. 기존 P0 frozen03fa643, R2, R3/733fe69의 정책·기록·예제·이력은 보존한다. 이번 승인은 **기존 미완료 인수부터 격리 TEST 자동 지급 연결까지 단계별 실제 개발**이다. 정책 선택의 재승인을 기다리며 허용된 단계를 멈추지 않는다. 정본 고정·코드 인수·실제 원천·지급 완료는 별도로 보고한다.

## 승인 원본과 우선순위

1. [해커톤 TEST 정책 확정 decision revision1](../../../../output/planning/CLEAR_해커톤_TEST정책_확정_2026-10-18.md): 최우선 승인 원본.
2. [팀원공유 통합계획 revision2](../../../../output/planning/CLEAR_팀원공유_통합개발계획서_2026-10-18.md): 범위·역할·인수 분류.
3. [본부 비교표 최신 11절](../../../../output/planning/CLEAR_본부전달_개발계획비교_2026-10-18.md): 과거 추천/미결정보다 새 결정 우선.

이 세 링크는 저장소 밖 **로컬 workspace 원본**이며 원문을 덮거나 공개 저장소에 복사하지 않았다. [입력 manifest](../../specs/bootcamp/hackathon-test-inputs.json)의 workspace 상대 경로·SHA256으로 구별한다. 원문의 ‘정책 확정’은 기존 코드와 ABI가 이미 구현됐다는 뜻이 아니다.

기계 판독 정본은 [operations profile](../../specs/bootcamp/hackathon-test-operations-v1.json), E0 논리 예제는 [reference contract](../../specs/bootcamp/hackathon-test-contract.mjs)다. profile hash는 `p0Hash('HACKATHON-TEST-OPERATIONS', profile)`로 고정한다. 이는 source/사용자 인증·서명·DB·지급 검증기가 아니다. 예제의 assertion을 browser가 보내는 verified flag로 수락하지 않는다.

## 범위와 이전 미결정의 갱신

필수 주시연은 기존 가상 Python P0의 Moodle 활동 완료·본인 과제 SUBMITTED·회고 세 topic 원문 근거·HackerRank Python(Basic) 보유 인증 **ALL/AND → 100 TEST**다. decimals6/100000000 atoms, 합격 시각과 signed timestamp 구별, 실제/합성 표시와 source/participant/request 결합을 유지한다. 고객 실제 조건 매핑과 별도 ID/version의 두 번째 합성 정책을 병행하고, 미지원 조건을 빼고 고객 전체 환급 성공이라 말하지 않는다. Vision은 합성 이미지의 명시 요소/위치 선택 확장, 새 블로그·새 사이트·복잡한 OR/면제 연산자는 핵심 E2E 선행 필수가 아니다.

| 이전 관문 | 이번 TEST 정책으로 확정 | 아직 구현·인수가 필요한 사항 |
| --- | --- | --- |
| G1 / R3 | canonical block/transactionIndex 순서. 먼저 accept된 고정 수령인/금액 권리 보존 | 정정/취소·키폐기와 양쪽 채굴순서·reorg 실제 검사 |
| G2 시간/미해결 | 확인120초·새 근거 재검증1회·첫 시작부터600초. 수락 전 미해결 종료/같은 기수 재원 복귀, 수락 후 claim 만료/회수 없음 | review window/current consent·epoch 무효화+종료/예약/의무 원자 전이 |
| G3 역할 | 등록·배정 / signer / key-admin / relayer를 별도 키 권한으로 분리. 앱 동의는 서버 검증 | 전용 TEST 주소·키 수명/허용목록·종료 권한의 contract enforcement |
| G4 자금 | 정상 전액 사전 확보. 부족 시 두 신청100씩, 초기150+추가50. 현재 MET 수락 ledger sequence 순 전액 배정 | 한 app 한 의무, 동시 배정/정정·예약보호·충전확인·복구 |
| G5 환경/확정 | 새 격리 persistent EVM 필수, backend 중지 후 chain 유지. 로컬 후 Sepolia 정상1건 추가 목표 | exact chain/genesis/instance/code/token/domain·reader, public finalized/canonical receipt |
| G6 실제 증거 | 실제 Moodle·HackerRank를 한 신청/지갑에 연결한 실제 수락1건부터 | 안전한 collector·공식 signer/recipe/request·원문 수명·실제 source/AI 품질 |

위 ‘정책 확정’을 OPEN으로 되돌리지 않는다. 배포 주소·type/encoding·키 저장·프로세스 등 기술 선택은 담당자가 경계 검토 후 고정하고, 확정 정책과 충돌하는 선택만 별도 결정으로 올린다. 상용 예치율·원화/PG/메인넷·기수 간 전용·운영자 출금·토큰 경제·AA/paymaster·별도 인간 최종 검토자는 이번 범위 밖이다.

## 120초·1회·600초의 정확한 관계

현재 MET + 해당 판정에 결합된 전액 배정 + 판정 공개를 모두 확인한 첫 시점에 절차를 시작한다. 재원 대기는 그 이전의 별도 상태다. `firstStartedAt`은 한 지급 건에서 영속 고정하고 `reviewCapAt=firstStartedAt+600`을 새 판정/통신 재시도/중복 요청으로 초기화하지 않는다. source 현재성·lease는 대기 중에도 별도로 검사한다.

새 현재 판정의 `publishedAt+120` 이상에서 기한 경로를 사용할 수 있지만, **최초 accept는 원래 reviewCapAt보다 엄격히 앞서야 한다.** 새 판정에 120초 전부를 확보하지 못하면 그 판정의 기한 경로를 단축하지 않는다. 원래600초 안에 양측이 새 판정에 새 동의한 조기 경로는 가능하며 자격·source·이의·배정 검사를 생략하지 않는다. 어떤 새 decision ID/revision/hash에도 옛 동의를 재사용하지 않는다.

내용 있는 미평가 이의와 유효한 미해결 이의는 조기/기한 경로 모두 차단한다. 접수와 유효성은 별개, 검증된 중복/무관 요청은 같은 결과로 처리하고 기한을 늘리지 않는다. 자동 확인할 수 없는 문제를 동의/침묵/시간으로 통과시키지 않는다. 새 최종 인간 심판 역할은 만들지 않는다.

새 근거/객관적 오류를 반영하는 재검증은 같은 지급 건에서1회다. 동일 요청·운송 오류 재시도·일상 수집은 이 횟수를 소모하지 않는다. 다만 수집 결과 새 판정이 생기면 exact target 재공개/새 동의 또는 새120초와 기존600초를 적용한다. 1회를 썼거나600초가 지났다고 새로운 원천 변화·만료·유효 오류의 무효화를 무시하지 않는다. 1회 후 새 유효 오류·상한 내 미해결·기한 내 갱신하지 못한 만료는 UNRESOLVED 종료다.

최초 accept에서 contract가 authorization expiry, 원래600초 cap, source의 검증된 valid-until 경계를 모두 검사하도록 인수한다. 서버가 일찍 서명했다는 이유로 늦은 accept를 허용하지 않는다. 실제 signed/source 시각을 scenario 시계로 덮어쓰지 않으며 빠른 clock advance는 OFFLINE_SYNTHETIC_TEST_ONLY다. 검증기의 exclusive 유효기한 의미를 보존하고 단순 acquiredAt 갱신으로 증거 수명을 연장하지 않는다.

## 예약·종료·확정 권리

한 canonical application에 같은100 TEST 의무는 하나다. 미배정 대기열은 **현재 유효 MET의 서버 수락 ledger sequence**로 정렬한다. 새 판정은 그 sequence를 쓰며 클라이언트 클릭 시각·임의 ID순을 쓰지 않는다. 기존 배정에 새100을 추가하거나 기존 target을 조용히 덮어쓰지 않는다. 재검증 target 교체는 옛 외부 승인 무효화·한 의무/예약 보존·새 동의 target을 함께 다루는 명시 원자 전이로 설계/인수한다. 이는 새로운 상용 환수/출금 권한이 아니다.

`B≥R≥0`, `O≥R`, `A=B-R`, `U=O-R`, `S=max(0,U-A)`이며 O는 R을 포함한다. 잠재 전체 노출액은 O와 구분한다. 미확정 입금/충전약속·미확인 토큰은 B에 넣지 않는다. 부족은 해당 미배정 queue/부족액·운영 알림으로 표시하고 이미 예약된 신청을 침해하거나 전체 풀 pause를 기본으로 삼지 않는다. 충전은 운영자 역할이 하며 확인 후 current/동의/이의/기한을 다시 검사한다. ACK/tx 제출만으로 해결·배정·지급 완료가 아니다.

수락 전 미해결 종료는 **contract가 미수락·유효한 종료조건·종료 권한을 검사하고**, 옛 authorization epoch/state 무효화 + 예약을 같은 기수 가용 재원으로 해제 + 의무 상태 변경을 원자 처리해야 한다. DB stale/타이머만으로 해제하지 않는다. accept가 먼저면 종료/해제를 거부하고, 종료가 먼저면 옛 승인이 나중에 accept되지 못한다. chain 관측/DB checkpoint/reorg는 같은 canonical 결과로 복구한다.

수락 후에는 TEST claim의 자동 만료·운영자 회수·현재 signer/epoch 재검사·새 서버 승인/재서명을 추가하지 않는다. 단회 claim은 누구나 제출해도 고정 수령인에게만 지급한다. backend 중단 후 chain을 유지해 별도 제출자로 직접 청구를 검증한다. native gas와 ERC20 TEST는 별도 자산/계측이다. 체인·토큰·가스 가용성 의존은 남고 상용 영구권리로 전용하지 않는다. token/기수 출금 기능은 없다.

## 버전·이행·활성화 계약

기존 P0 policy/records/관측 v1, R2 projection/event와 R3 JSON의 bytes/hash/ABI를 바꾸지 않는다. 새 TEST 절차/배정/승인/실행은 profile hash·정확 runtime/환경·source mode를 참조하는 별도 versioned envelope다. 기존 evidence의 MET/false gate는 기존 의미로 보존하고, 인수된 TEST 경로의 실행 권한은 별도 activation/execution view로 표현한다. 기존 v1에 `paymentAllowed=true`를 끼워 넣지 않는다.

E2 unsigned 초안의 finite `claimUntil` 요구와 미확정 deadline 예제는 **기존 초안의 의미**로 보존한다. 새 profile의 accepted claim 만료 없음·120/600 경계와 충돌하는 예제를 live 기본값으로 쓰지 않는다. E2가 새 type/deadline version/필드·ID/domain 이행안을 명시 고정하고 구형 payload 재사용/오인 수락을 거부해야 한다. E0의 논리 required bindings는 profile hash·app/decision ID/revision/hash·recipient/100 TEST/token/allocation·consent/deadline window·source validUntil·nonce/key/epoch/domain이며 최종 EIP-712 ABI 선언이 아니다.

activation namespace `clear-hackathon-test-activation.1`은 E1(privacy/auth/current/CAS), E2(exact unsigned encoding), E3(절차/동의/이의), E4(역할·금고·서명/예약), E5(worker·복구)의 exact commit/검증·profile/runtime/source mode pins를 모두 참조해야 한다. source assertion·hash 형식만 맞다고 verifier나 signer가 활성화되지 않는다. 현재 기본은 미활성이고 **승인된 TEST 경로는 해당 인수 후 활성화할 수 있다.** 과거 포괄 HOLD를 영구 개발 중지로 적용하지 않는다. 기존 경로 HOLD·C2 개인자료 제한·productionEnabled=false는 유지한다.

단계별 격리 test harness는 최종 지속 실행 activation과 구분한다. E4의 payout signer/contract harness는 E1/E2 및 E3 경계 인수 후 허용된 TEST 작업이며, 전체 E5가 끝나기 전이라는 이유만으로 그 검증을 금지하지 않는다. 미완료 선행 단위 위에서 지속 signer/worker를 켜지는 않는다. 기존 source attestor/참가자 승인 합성 시험과 payout signer 권한도 구분한다.

원문은 최대1800초와 auth/raw/query lease의 최소값, Moodle300초·Reclaim 두 proof900초를 보존한다. 내부 candidate의 논리 새 읽기까지 만료/권한/close와 결합하고 이미 읽은 JS string의 물리 삭제를 보장하지 않는다. 원문·claim·쿠키·키를 DB event/공개 문서/fixture/chain에 복사하지 않는다. signer/key-admin/allocator/relayer를 분리하고 AI에 송금 권한을 주지 않는다. 앱 양측 동의의 서버 검증과 온체인 양측 wallet signature 검증을 혼동하지 않는다. 새 승인/거부·미관측 source 진실의 oracle 신뢰는 남는다.

## E0~E7 단일 소유와 인수 순서

| 단계 | 단일 소유/요청 설정 | 실행과 인수 | 다음 단계 조건 |
| --- | --- | --- | --- |
| E0 | 통합 Sol/High — docs/current·specs/bootcamp·교차 인수 | 이 profile·입력 hash·P0/R2/R3 대응·논리 예제·현재 표 고정 | exact commit을 E1/E2에 전달 |
| E1 | 기존 API Astra/High 민감 경계 — clear-bootcamp-api-store | be0b699의 미커밋 consumer/operations/r2-ledger/시험 보존. candidate raw 사본·lease 축소/철회·목록 반환 직전 auth/scope/current/CAS·rollback/restart 반례로 인수 | 소유 feature commit·Draft PR·필수 검사/실제 분모 확보 |
| E2 | 기존 Reclaim Astra/High — clear-hackerrank-bootcamp | cf0ae1e의 unsigned 초안 보존·field/domain/ID/정수/기한·JS/독립ABI/Solidity hash 인수. profile과 다른 old deadline을 version 구분 | exact type/예제·old payload 거부·새 profile 이행안 인수 |
| E3 | 기존 API Sol/High + 기존 web 소유자 |120/1/600·새 동의·재검증/미해결/종료 DTO·재원대기·동일 ledger/version·metrics 구현 | E1/E2 인수 후 실제 dispatch. web은 DTO/복붙 인계만 |
| E4 | 기존 Reclaim Astra/High | 새 단일기수 TEST 금고·전액/sequence 배정·종료권한·epoch/accept 경합·분리역할·signer 연결 | E1/E2/E3와 exact 인터페이스 경계 인수 전 signer 비활성 |
| E5 | API Sol/High 일반 실행, Reclaim Astra/High 자금·어려운 복구 경계 | durable outbox/worker/relayer/reader·단회/nonce·응답유실/restart/reorg·backend만 중지/chain 유지·직접 claim | E4 contract/runtime 인수 후 송신 경로 연결 |
| E6 | 통합/API·기존 Moodle/AI Sol/Medium 각 소유 경로 | 실제 한 참가자의 Moodle·HackerRank/신청/지갑→두 화면→로컬 지급, 부족150+50·정정·종료·중단·계측 | 사전 준비는 E0 후 병행, 실제 source/trust/수집/수명과 E5 각각 인수 |
| E7 | 기존 담당·기획/화면 소유자 | 로컬 인수 후 Sepolia 정상1건·탐색기, 고객 조건 매핑·별도 합성 정책1개·Vision 선택 | 전용 시험 keys/RPC/gas, public finalized와 canonical receipt 대조 |

E1/E2는 본부가 이번 새 승인으로 기존 세션에 직접 재개 지시했고 active 시작을 확인했다. 과거 usage_limit는 코드 실패가 아니며 새 사용 가능 상태로 재개한다. 같은 제한이 재발하면 그 새 오류를 기록하고 근거 없이 반복하지 않는다. 새 세션/하위 에이전트/턴 중단은 하지 않는다. 역할 경로 밖 파일·기존 사용자 DB/키/chain/volume을 덮거나 reset하지 않는다. 검토용 임시 integration checkout은 원본을 복사/수정하지 않고 고정 이력으로 구성한다.

원문 실제 계정/새 로그인·추가 유료 평가·외부 자원은 안전한 수집/실행 준비 후 필요한 사용자 행동/예산만 확인한다. 공개 합성·소유 격리 Moodle은 승인 범위에서 실행한다. 상용 배포·자동 merge/main 반영·타인 연락/새 유료 가입은 하지 않는다. 공개 Sepolia 정상1건은 로컬 인수 뒤 승인된 추가 목표이며 준비가 된 때 인프라 제약을 구체적으로 보고한다.

## 완료 증거와 현재 상태

E0 정책과 E1/E2 기반을 인수했고 E3 구현·E4 비지급 경계 준비를 진행했다. E3의 로컬 구현 검증은 끝났으나 아래 Mac 필수 검사 실패로 인수는 보류한다. E6 source/AI 사전준비도 아래 범위로 인수했으며 전체 E6 수락은 아니다. 미커밋 초안·당시81개 보고·과거 unsigned hash 초안을 최종 인수 완료로 세지 않는다. 이후 dispatch·환경/실패/시험/정확 HEAD는 [실행 인수표](hackathon-test-intake.json)와 PR exact-head 결과로 갱신한다. 정책 확정·UNIT/REFERENCE·SYNTHETIC_INTEGRATION·REAL_SOURCE·LOCAL_CHAIN·TESTNET_E2E 분모를 분리한다.

필수 인수는 양측 동의/120초 지급,1회/600초·옛 동의 거부, meaningful unassessed 이의 차단, 종료와 accept 양순서·epoch/예약/의무 원자성,150+50·다른 예약 보존·중복 의무 거부, 금액/수령인/chain/decision/nonce 변조, 원문/권한 철회, backend 중단 직접 claim, 응답유실/reorg, 두 화면/version·tx확정과 실제 처리/사람개입/가스 계측이다. 미측정 baseline/개선율은 N/A. P0를 고객 실제 환급 사례로 소개하지 않는다.

E0 로컬 검증: 새 운영 reference12 + 기존 P0 reference20 + R2 reference9 = **41/41 PASS**. 120초/600초 경계, 새 판정의 옛 동의/짧아진 기한 거부, 미평가 이의·source 만료·1회 후 오류, MET sequence·150+50 산식과 기존9개 frozen spec 지문을 검사했다. 원본/legacy191개·고정 dependency graph와 diff도 통과했다. 이는 논리 reference이며 실제 서명/contract/원문/DB·지급 인수 결과가 아니다. E1/E2 새 코드 시험을 이 수에 합산하지 않는다.

E0 고정 `67b6a0731f97df98fda7820ab24ed85a57796a83`/profileHash `0x47a18b20a02a8acf89160c50601b8a2625bcae432292d9cf6d4644af0a2fdb98`의 exact-head CI6/6을 확인했다. E1 PR84/head `6b4b0cf2d847937aebc6da69f9e7df62e926fa50`은 전용111·CI6/6과 원문/최종권한 회귀를 교차 확인해 다음 TEST 단계의 기반으로 인수했다(실제 source 수락0·지급 미활성). E2의 새 v3와 공통 CI 진입점도 아래 exact head로 인수했다. 네 기존 세션에 E0 exact commit을 명시해 전달하고 E1/E2 Astra High, Moodle/AI E6 준비 Sol Medium 시작을 확인했다. E2의 과거 작업 응답은 이번 완료로 세지 않고 현재 소유 초안으로 바로잡았다. source/AI 준비는 전체 E6 완료가 아니다.

E0 reference 표시 보강: 새 판정의 published+120이 첫 시작+600과 **정확히 같아도**, 최초 accept가 cap보다 엄격히 앞서야 하므로 기한 경로에는 유효한 수락 시점이 없다. 새 양측 동의의 조기 경로만 cap 이전에 가능하다. profile/기존 v1 의미는 바뀌지 않았고 해당 경계를 추가한 새 reference12/12가 통과했다.

## E1/E2 교차 인수·공통 encoding 고정

E1 PR84/head6b4b0cf와 E2 PR85/head `d9407b06b8a13122a489193119c1899929f83fe4`의 exact-head CI를 각각6/6 확인했다. 별도 detached checkout에서 E0 인수기록 ae88b76과 두 구현을 normal merge하여 **272/272 PASS**(E1 전용111 + v3 구조/예제119 + purehash1 + E0/P0/R2 reference41)를 확인했다. temporary integration head `7a7153fb7e38e7fa647a0bbbdc5a45fc34d6235e`, 외부RPC/실제source/지급0이다. ephemeral pure hash helper는 실행됐으며 새 지급 contract 인수가 아니다. 임시 checkout은 검증 후 정리한다.

[공통 소비자 pins v1](../../specs/bootcamp/hackathon-test-consumer-pins-v1.json)은 E2의 `clear-bootcamp-test-payment-authorization.3`, `BootcampTestPaymentAuthorizationV3`, domain `ClearBootcampTestPayment/3`·salt(instance), 순서 있는24필드·typeHash와 source artifact SHA를 E3/E4의 고정 입력으로 인수한다. 기존 v2의 유한 claimUntil/75초 예제는 그대로 보존하고 새 경로에 재사용하지 않는다. 이 고정은 unsigned encoding의 소비자 합의이며 실제 signer/chain 권한이나 source 검증이 아니다. 기존 proposal artifact의 당시 상태 표기는 고쳐 쓰지 않고 이 별도 pin이 인수 사실을 나타낸다.

E3는 v1 ID→durable opaque registry, 실제 current evidence의 earliest exclusive bound→E2 sourceWindow, 최초 start/publication/count·새 동의·의미 있는 이의→trusted current state, E4의 exact confirmed allocation/key/epoch/domain을 명시 adapter로 연결한다. server snapshot을 browser body/receipt hash로 대체하지 않는다. 불변 decisionHash는 그대로 운반하고 wrapper.current를 별도 검사한다. nonce/source/권한/current/CAS의 재검사와 저장은 E1 단일 ledger 관례를 보존한다.

consentSetHash의 canonical recipe는 E3가 두 역할의 실제 인증 receipt·exact decision/recipient/token/amount/allocation·profile/기본 review window를 묶어 고정한다. 나중에 결정되는 authorization nonce/issuedAt/expiresAt를 동의 본문에 미리 요구하거나, consentSetHash와 final deadlinePolicyHash를 서로 포함시키는 순환 hash를 만들지 않는다. route2의 빈/부분 동의도 명시 tagged set과 이의 snapshot으로 구별한다. E4는 signed hash만 보지 않고 등록된 app/target/firstStart/cap/source cutoff·역할·reserved amount와 비교해야 한다.

E3의 funding/chain provider는 기본 NOT_IMPLEMENTED/blocked이며 trusted port의 fixture를 실제 배정으로 표시하지 않는다. E4 경계 설계·type/role test 준비는 E1/E2 후 병행할 수 있고, payout signer/등록·송신 활성화는 E3 경계 인수 뒤에 한다. 수락 전 current/기한 차단과 수락 후 고정 claim 권리를 두 화면/worker에서도 분리한다. accepted claim에는 원문 lease·현재 source/key/epoch/새 동의를 다시 요구하지 않는다. 실제 자금/서명/종료·복구는 E4/E5 인수 결과를 따로 기록한다.

## E3/E4 시작·E6 사전준비 인수

공통 pin commit `67c7bc8450484fb4d5545c6e36a672e497467174`은 exact-head CI6/6을 확인했고 E3 Sol/High와 E4 Astra/High에 전달했다. E3는 같은 ledger의 절차/동의/이의·v3 adapter를 구현 중이다. E4는 지급 함수가 없는 역할·재원·예약·종료 component 준비이며 E3 경계 인수 전 payout signer는 계속 비활성이다. 새 세션/서브에이전트·진행 턴 중단·main/develop merge는 없다.

Moodle PR87/head `22640db091d5d3ac5d8a3535280b393d6f618d65`는 전용 source/lease14·offline250 보고와 문서/metadata/CI6/6을 확인해 **새 소유 격리 원천의 사전준비**로 인수했다. 새 loopback18768/environment `e6-20261018-run1`/mappingRevision1은 기존 lab과 다르다. 보고 checkpoint에서 지정 활동·과제·회고를 보존하고 소유 container stop/start 후 재수집을 확인했으며 활성 token0·collector handle 폐기다. 이 관측을 영구 ready나 공통 API/전체4조건 수락으로 전용하지 않는다.

source의 비동기 `getRaw`는 매번 실제 probe하고 기존 receipt·관측시각·expiry를 연장하지 않는다. 기존 E1 offline-only 동기 getter에 그대로 끼우지 않는다. 후속 E6에서 API 소유자가 auth/scope/current/CAS·비동기 원문 접근을 명시 연결한다. source의 매 호출60초 credential은 사용자 auth/raw/query lease와 별개이며, 사전준비 기본 query45초는 승인된120초 확인창을 대체하지 않는다. 실제 route에는 source300초와 사용자 최소 lease 안에서 충분한 새 query를 준비하고 옛 decision/source 시각 갱신으로 수명을 늘리지 않는다.

AI PR86/head `d7a6f302378818430212aabeec2a9ddb8c55156d`는 집중8·회귀411 보고와 문서/CI6/6을 확인해 **borrowed lease 오프라인 사전준비**로 인수했다. `release`는 borrowed 참조만 놓고 shared owner의 dispose와 구분한다. HTML 원문 UTF-16 위치와 normalized 위치, producer domain hash와 raw UTF-8 SHA256을 구분한다. lease 축소/철회·새 source/decision·늦은 응답은 무효화하며 재검증 횟수나600초가 그 무효화를 막지 않는다. 실제 공통 연결·실제 모델 품질은 N/A, 새 키 조회·유료 호출0이다.

두 전용 검사는 기본 원격 CI 자동 대상과 분리해 표시한다. 다음 AI 단위는 개인정보 없는 고정8사례 corpus/gold·prompt/profile/hash·현재 공식 모델/가격·요청/토큰/US$0.05 상한 제안의 승인용 준비다. 실제 generation/countTokens·키 읽기는 승인 전 실행하지 않는다. 전체 E6는 E3~E5 및 실제 source/trust·안전한 collection과 별도 인수한다.

## 2026-10-19 교차 검토·필수 Mac 검사 보류

E3 PR89/head `fb9e6d3a9f35c8d12b80f0c84e01d8a6db9aeda1`은 전용47(로컬 관련592에 포함)을 통과했다. 교차 검토에서 stable allocation, 공개 baseline과 최신 chain CAS 구분, 승인된 종료조건 전 취소의 예약 해제 금지, 배정 전에 필요한 opaque ID bootstrap 순환을 수정했다. bootstrap은 단일 registry의 ID만 먼저 발급하고 절차 창·동의를 시작하지 않는다. E4 등록→전액배정 확인→API 공개→chain startReview 순서를 따른다.

E4 비지급 준비 PR88/head `d287b3789a678a1e6984b583e4c85859e9e97a22`은50개·CI6/6으로 준비 범위만 인수했다. 같은 판정 ID의 새 revision/hash도 target 교체로 구분한다. 전체 E4의 signer/accept/claim과 지속 runtime은 아직 미구현이다. [경계 인수표](../../specs/bootcamp/hackathon-test-boundary-intake-v1.json)에13개 source/artifact SHA와 제안 연결을 고정하되, E3 필수 검사 때문에 payout harness 허용은 false다.

별도 조합의 사전 공개430/430과 최종 E3 필드명 명확화 뒤 관련47/47을 구분한다. 조합 head·입력·범위는 실행 인수표에 있다. 변경은 내부 snapshot hash의 authorization→authorizationPort 명칭과 합성 예제 재생성이다. 실제 source 수락/외부RPC/지급승인 서명/수령인 지급0이며 실제 E3→chain adapter 인수는 아니다. 원본191개/고정 graph도 통과했다. 임시 checkout의 전체 node_modules symlink 때문에 최초 Git ignore 보존 검사가 실패했고, 소유 임시 디렉터리와 package별 링크로 바꿔 통과했다. 제품 코드나 dependency graph 오류로 세지 않는다.

PR89는 원격5/6이다. push run `39142228451`/Mac job `117718818737`의 `SIGKILL legacy-missing`이60000ms로 취소됐다(pass61/fail0/cancel1). 동반 PR Mac의62/62 성공은 실패를 상쇄하지 않는다. 원래 PR67의 cookie403 fixture 수명 경쟁과 이번 강제종료 검사 timeout은 구분한다. E3 인수·payout signer를 보류하고 기존 API 세션의 별도 Astra/High 읽기 전용 단위에서 원인을 분석한다. 이 단계에서는 CI rerun·Mac 시험 재실행·제품 코드 수정을 하지 않았다.

AI PR86의 추가 승인 계획/차단 실행기 head `e9ea4547d795ee833a8175c02c0cc23b21a7d823`은 새 runner19·관련437·CI6/6으로 준비만 인수했다. 고정8건 corpus/gold와 요청·budget/checkpoint를 만들었으나 새 사용자 승인, countTokens 과금 및 출력/thinking 결합 상한 확인이 남아 실제 모델 호출·키 조회0, 품질N/A다. 과거 일반후기8건 승인을 새 Python 평가에 전용하지 않는다. 승인 원본3개 SHA도 고정 입력과 동일함을 다시 확인했다.

### 2026-10-19 — Mac 시험 수명 보정 이력 인수

PR90 `41354e0283709f74dd64a9dc6435703c804853c6`의 실제 변경과 최종 반례를 검토하고 exact-head 원격 필수 6개 성공을 확인했다. 전체 Mac 105/105에는 native 9회와 주입 검사 39개가 포함된다. 기록된 Chrome 그룹이 점유돼 있으면 본체 부재·보조 프로세스의 프로필 인수 누락·PGID 재사용에도 삭제를 거부하고, 불명확한 소유자에게 종료 신호를 보내지 않는다. 과거 정체 위치는 미확정이며 이전 실패 실행을 재실행해 대체하지 않았다. legacy 5회 합산 60초를 각 trial 60초로 바꾼 예산 단위 변경도 명시한다. 자세한 근거는 [Mac 검토](MAC_HARDKILL_CI_REVIEW.ko.md)에 있다.

공통 브랜치에 해당 이력을 정상 병합했다. E3 소유자에게도 동일 이력 병합과 새 head 필수 검사 확인을 요청했다. E3 최종 인수와 E4 양성 지급 harness 허용은 이 확인 뒤에 기록한다. develop/main 병합·배포는 수행하지 않는다.

본인 HackerRank Python(Basic) 인증 보유 계정이 있다는 사용자 답변은 수집 준비에만 반영했다. 식별자·증명·로그인은 수집하지 않았고 원천 신뢰나 지급 조건을 활성화하지 않았다. 안전한 수집·요청/지갑 결합 준비 후 실제 연결을 진행한다.

### 2026-10-19 — E3 최종 인수와 E4 메모리 시험 허용

E3 PR89 `c3b71c710f558529680e255222857f0e81fe1dcb`은 기존 구현 `fb9e6d3`와 검토된 Mac `41354e0`을 부모로 한 정상 병합이다. 새 exact-head 필수 CI6/6, 미해결 리뷰 대화0, 경계표 E3 source/artifact8개 SHA 동일을 root가 확인했다. 공통 `aed466074b046834838a7c727afe7f2106c893ab`도 CI6/6이다. 과거 실패 실행은 역사 기록으로 보존하며 정체 원인은 계속 미확정이다.

[경계 인수표](../../specs/bootcamp/hackathon-test-boundary-intake-v1.json)는 새 격리 메모리 EVM의 E4 양성/반례 harness를 허용한다. 정확24필드·새 TEST 키·실측 runtime/domain/token/역할·내부 current/CAS 재검사와 실제 accept/claim·회계·선후 순서를 검증한다. E3는 TEST fixture 포트 기반이며 실제 원천 수락이나 E5 canonical reader 연결은 아직 아니다. 이 인수는 persistent signer·지속 체인·실제 source·상용 활성화가 아니다.

E4 실행 준비 PR93 `9dd69ca47e41d2b419b961ede30eafd00c3585e7`은 별도 실행 계약과 기본 차단 signer의 새66개 검사만 완료했다. E3 새 head를 추가 병합한 후보는 `ab02b2846c224d8f28cd7bf497aa9582b955c909`이며 해당 CI와 양성 실행 결과를 별도 인수한다. 이전22개 미실행 계획을 완료 결과로 세지 않는다. 기존 PR88 비지급 준비50개와 artifact도 보존한다.

E4 새 양성 단위는 기존 Reclaim 세션에 Astra/High로 전달했고 시작을 확인했다. E3 이력 병합 후 실행 준비 `ab02b28`의 exact-head CI6/6과 E4/E2 소유 파일 보존도 확인했다. 66개 compile/차단 검사를 반복하지 않고 새 메모리 EVM 양성·반례를 추가한다. 기존 API 세션은 E5 읽기 전용 준비만 완료했으며 구현·트랜잭션은 시작하지 않았다. [E5 복구 경계 사전 검토](HACKATHON_TEST_E5_BOUNDARY_PREPARATION.ko.md)는 동기 DB/RPC 분리, immutable intent와 정확 전송 자료, worker fencing, INCLUDED/FINALIZED·reorg 재기준 및 accepted-first 직접 청구의 인수 조건을 정리한다. E4 최종 포트 인수 전 완료 구현으로 세지 않는다.

### E4 첫 실행 묶음과 E5 복구 검토 checkpoint

E4 새 memory suite 최초 실행은36개 중32통과/4실패(약91초), 취소·skip0이다. 같은 실행의37새instance·32서명생성/22반환/10폐기·6accept/3claim은 그 실행의 계측이며 이전 단일 성공이나 기존66과 합산하지 않는다. 실제 원천/외부RPC/persistent chain0이다. 실패는 부족 거부 사유가 estimateGas 오류에 가려진2건, 실패 거래의 새 블록으로 옛 stage CAS가 올바르게 거부된1건, ethers Result Proxy 값 비교1건이다. 원래로그 지문을 인수표에 보존했고, 근거에 맞춘 시험 수정 전 이 묶음을 수락하지 않는다. 새 checkout의 metric 부모 디렉터리 생성 문제도 root 검토에서 확인했다.

E5 추가 Astra/High 읽기 전용 검토는 관측 generation과 실제 contract epoch/worker fence를 분리하고, 이미 외부로 나간 거래를 DB 세대 변경으로 취소했다고 주장하지 않도록 정리했다. 등록/배정이 reorg로 사라져 고정 공개 시각을 복원할 수 없으면 RECOVERY_BLOCKED이며120/600을 새로 시작하지 않는다. FINALIZED 충돌은 자동 재기준화가 아니다. 내구 envelope·blockHash 결합·원천/동의의 새 계보 membership과 결정적 중단 반례를 [E5 사전 검토](HACKATHON_TEST_E5_BOUNDARY_PREPARATION.ko.md)에 추가했으나 구현/실행 인수는 아직 아니다.

### 2026-10-19 — E4 최종 인수·E5 개발 범위

E4 PR93 `17dca2eea07f50e4e15c3dc11f8b57169c7d3f9b`은 로컬/PR/push 새48개 모두 통과, 원격 필수 CI6/6, 리뷰대화0으로 다음 TEST 개발의 기반으로 인수했다. 같은 실행의42서명생성/31반환/11폐기, 정상 수락14(단계13+계약직접1)·고정토큰 청구11(단계10+계약직접1)을 구분한다. 단계 청구10에는 의도적으로 후속 조회 ACK가 거부된 확정 거래1이 포함된다. 주입코드 probe 청구1은 snapshot 복구되며 정상 지급에 합산하지 않는다.

첫 원격 `a53cbaa`의 E4 46/47·workflow589/590 실패도 보존했다. 동시 두 wrapper의 성공 응답0과 성공한 claim receipt 계측이 함께 있었으며 최초로그에 내부거부 문자열은 없었다. 계약 동시성은 status1/status0 거래·수취100·회계0으로 검사하고, 조회 중 block 진행을 결정적으로 주입해 거래확정과 STAGE_CHAIN_MOVED가 함께 성립하는 별도 반례를 추가했다. CAS를 완화하거나 기존 실패 실행을 재실행하지 않았다. 실행 상세는 해당 head의 `docs/hackathon-test-vault/MEMORY_STAGE.ko.md`와 memory-stage-verification.json에 있다.

root는 새 E4와 현재 공통/Moodle/AI 준비를 별도 임시 작업본에서 정상 이력 병합했다. 조합 `aeb53ee8ffb0b04618fdb854938f61db7234e9ae`의 E3전용47+E4메모리48=95/95, 취소/skip0, 원본191·graph·diff PASS, 공개이력356commits/1885blobs/findings0이다. 기존430·새95·개별 회귀66은 다른 실행 범위이며 합산하지 않는다. 실제 source·public RPC·persistent chain은0이고 실제 E6 adapter 인수는 아니다. 임시 SDK 링크는 검사 후 제거했으며 tracked tree는 clean이다.

[별도 E5 개발 인수](../../specs/bootcamp/hackathon-test-e5-development-intake-v1.json)는 새 소유 격리 persistent local EVM·API outbox/worker·실행 reader·private durable envelope·backend-stop 직접 claim의 TEST 개발/검증만 허용한다. 기존 memory boundary-v1 scope/SHA와 default signer 차단은 보존하고 변경된 source에는 새 검토된 버전 입력을 사용한다. 실제 인터넷 원천·기존 사용자 키/환경·유료 모델·공개체인·production·main/develop 병합은 이 단위에 없다. E5 구현·지속 runtime의 최종 인수는 아직 false다.

### E5-A API 메타데이터 로컬 검토와 memory 호환 입력v2

API 소유 `d534f4bc3fbf56845239853cc947a496a97847a2`는 새44+기존E1/E3 158=202/202, 강제종료5지점·독립process lease1승/1거부·migration rollback2지점을 통과했다. root는 store 연결부와 새 원장/port/operation/worker/readback을 읽었다. 기본 UNCONFIGURED, 구성 후 METADATA_ONLY이고 모든 executionAuthorized/dispatchAuthorized는 false다. HTTP 실행경로·sign/broadcast/rebase는 아직 없다. source expiry 무효화는 command rollback과 분리하고, worker heartbeat는 업무sequence와진행중cap의원래만료를연장하지않는다.

E3 지문8개 중 store.mjs 연결부1개만 변경됐다. [memory 호환 입력v2](../../specs/bootcamp/hackathon-test-memory-source-intake-v2.json)는 이 후보의 source SHA를 memory-only 호환시험용으로 고정한다. 과거 boundary-v1 자체 SHA/scope와 E2/준비 입력은 보존한다. E4 소비자가 새 파일hash를 명시적으로 인수하고 정상 이력 통합·memory48 및새metadata/기존회귀·exactCI를 완료한 뒤에만 통합 결과를 수락한다. 후보는 현재 local commit이며 아직 source PR/CI 공개 인수가 아니다.

E5-B에는 실제 E3 현재 승인·서명/dispatch handshake, worker takeover 뒤원래SEALED자료를재서명없이연결할명시적binding, ACCEPT 후자동고정claim과별도claim상태/영수증복구가필요하다. claim에는onchain opId가없으므로일반operation mapping으로완료를판정하지않는다. accepted claim에새source/지급승인을요구하지않으며, 정상자동지급과intentional backend-stop 후직접claim을별도로검증한다.
