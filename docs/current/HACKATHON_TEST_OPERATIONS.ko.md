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

현재 E0는 정책/계약을 고정하는 단계이고 E1/E2 복구 인수는 진행 중이다. 미커밋 초안·당시81개 보고·과거 unsigned hash 초안을 최종 인수 완료로 세지 않는다. E3~E7의 이후 실제 dispatch·환경/실패/시험/정확 HEAD는 [실행 인수표](hackathon-test-intake.json)와 PR exact-head 결과로 갱신한다. 정책 확정·UNIT/REFERENCE·SYNTHETIC_INTEGRATION·REAL_SOURCE·LOCAL_CHAIN·TESTNET_E2E 분모를 분리한다.

필수 인수는 양측 동의/120초 지급,1회/600초·옛 동의 거부, meaningful unassessed 이의 차단, 종료와 accept 양순서·epoch/예약/의무 원자성,150+50·다른 예약 보존·중복 의무 거부, 금액/수령인/chain/decision/nonce 변조, 원문/권한 철회, backend 중단 직접 claim, 응답유실/reorg, 두 화면/version·tx확정과 실제 처리/사람개입/가스 계측이다. 미측정 baseline/개선율은 N/A. P0를 고객 실제 환급 사례로 소개하지 않는다.

E0 로컬 검증: 새 운영 reference12 + 기존 P0 reference20 + R2 reference9 = **41/41 PASS**. 120초/600초 경계, 새 판정의 옛 동의/짧아진 기한 거부, 미평가 이의·source 만료·1회 후 오류, MET sequence·150+50 산식과 기존9개 frozen spec 지문을 검사했다. 원본/legacy191개·고정 dependency graph와 diff도 통과했다. 이는 논리 reference이며 실제 서명/contract/원문/DB·지급 인수 결과가 아니다. E1/E2 새 코드 시험을 이 수에 합산하지 않는다.
