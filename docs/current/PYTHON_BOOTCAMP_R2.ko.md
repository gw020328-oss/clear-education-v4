# Python 부트캠프 MVP 추가 계약·실행 계획 revision 2

2026-10-17 사용자 추가 승인에 따른 정본이다. P0 `03fa64324ef9cc2ce4fb442a612329a7b1285677`/PR78의 네 조건 AND·100 TEST(100000000 atoms, decimals6)와 기존 P1/P2를 유지한다. [P0 정책·기록](PYTHON_BOOTCAMP_P0.ko.md)은 그대로 기초 계약이다. 이 문서와 [추가 계약 JSON](../../specs/bootcamp/p0-addendum-r2.json)은 `clear-bootcamp-mvp-addendum.2`/계획 revision2다. 아래 기능은 **실제 MVP 개발 백로그**이며 문서/합성 산식 예제로 구현 완료를 주장하지 않는다. P3/P4/P5를 계획에서 제외하던 종전 범위 문구는 이번 단계별 개발 승인으로 갱신한다. 상용 실자금·배포·자동 병합은 승인 범위 밖이다.

## 버전·이행·소유

P0 policy/record/observation v1의 field·enum·hash·amount·기존 예제 의미를 바꾸지 않는다. 새 운영 projection/event/지급승인 설계는 별도 v2 envelope다. 기존 endpoint에 v2 상태를 바로 보내거나 v1 consumer에 새 enum을 섞지 않는다. 지급승인의 아래 필드는 **필수 설계 조건이며 최종 EIP-712 type/ABI가 아니다**. P4 경계 리뷰에서 서명 byte encoding과 on-chain 상태를 고정해야 한다.

| 소비자/단계 | 실제 변경과 이행 조건 | 단일 소유 |
| --- | --- | --- |
| P1/P2 producer | 기존 evidence/candidate v1 유지. 기존 합성/실제 표시·request/mapping/expiry 관계 보존. raw/개인자료 event에 넣지 않음 | Reclaim/Moodle/AI 전용 담당 |
| P2 ledger | 단일 evidence/decision DB·nonce/CAS/current 인수 계속. v2 event/projection 대비 decision ID/revision/hash·불변 참조 유지 | 기존 API·저장 세션 |
| P3 schema migration | 기존 DB를 읽고 안전한 별도 migration/version negotiation 설계. immutable decision을 고쳐 상태를 주입하지 않고 v2 부속 consent/objection/event/projection을 참조. 실패 rollback·재시작·이전 v1 조회 회귀 필수 | API·저장 세션 |
| 학생/운영자 화면 | 동일 ledger sequence/decision/hash 기반 v2 DTO, role/field allowlist·오래된 view 재확인. 연결 전 mock/proposed 명시 | 기존 web 담당; 이 세션은 인계만 작성 |
| P4 authorization/contract | 신규 domain/type·nonce/expiry·정정/취소·재원 불변식 Astra/High 실질 검토 후 격리 TEST 구현. 기존 v4 grant를 새 oracle 승인으로 이름만 바꿔 사용 금지 | 자금/권한 담당 작업 단위 미배정 |

API/DB·producer·web 소유 파일을 통합 세션에서 중복 수정하지 않는다. 새 세션/하위 에이전트는 만들지 않는다. 기존 진행 턴은 중단하지 않고 exact 고정 commit으로 다음 작업 단위에 전달한다. API Sol/High, Reclaim Astra/High, Moodle/AI Sol/Medium 요청을 유지한다. P4 코드 작성/검토에는 Astra/High를 실제 지정해야 하며 문서의 추천만으로 실행 모델을 바꿨다고 말하지 않는다.

## A. Oracle bridge와 서버 신뢰

흐름은 Moodle 관측·Reclaim 출처 증명·AI 원문 근거 → 신뢰한 producer 검증 → 규칙엔진의 current decision → 동의/이의/기한·배정 재검사 → 제한된 지급승인 → worker/relayer 제출 → chain 확인이다. Reclaim은 외부 출처의 서명된 증거이고 이 전체 oracle 역할을 대신하지 않는다. AI는 원문 검토 관측만 제공하며 지급 키·승인 서명·송금 권한을 갖지 않는다.

승인은 domain `chainId/verifyingContract/instanceId/version`과 message `applicationId/policyHash/runtimeMappingHash/decisionId/decisionRevision/decisionHash/recipient/token/amountAtoms/allocationId/consentSetHash/deadlinePolicyHash/eligibilityRoute/nonce/issuedAt/expiresAt/signerKeyId/authorizationEpoch`를 반드시 결합한다. 개인 원문·Moodle ID·인증서 식별자·계정 주소를 calldata에 복사하지 않는다. opaque commit으로 가리키되 사전값을 알 수 있는 단순 hash를 개인정보 익명화로 주장하지 않는다.

| 검증 위치 | 필수 검사 |
| --- | --- |
| source/규칙엔진 | 서명·source/participant/request binding·실제 신선도·정확 mapping·네 조건 AND·현재 decision/원문 접근 수명. UNKNOWN은 기한/동의로 승격 금지 |
| 승인 ledger transaction | actor/session 재인증, current decision/epoch CAS, 동일 수령인·금액·배정, 양측의 동일결과 동의 또는 명시 고정된 무유효이의 기한 경로, 미해결/유효 정정 차단, nonce·승인/outbox 원자 기록 |
| signer | 검증된 ledger 명령만 허용, 등록 keyId/trust epoch·목적·환경 고정, 임의 body 서명 금지. secret은 전용 서명 경계에 보관하고 AI/브라우저/로그/PR·event에는 전달 금지 |
| relayer | 승인 hash와 저장 명령 고정, 서명자 허용목록·chain/address/token/amount/expiry·예약 상태 재검사, 일관된 nonce/tx 복구. 수신자/금액 재작성 금지 |
| 계약 | domain·허용 signer/epoch·정확 app/recipient/amount·nonce 단회·expiry·배정 및 중복/settled·승인/취소 경합의 확정 규칙. 체인이 해석할 수 없는 동의/기한 사실을 검증했다고 주장하지 않음 |

동의와 이의의 원문 사실 판단·새 승인의 발급/거부는 서버에 남는 신뢰다. signer 키 유출 시 위조 승인 위험이 남으므로 rotation/revocation·유출 대응·중단 범위와 기존 권리 보호를 P4에서 고정한다. 서버가 틀린 사실을 서명할 수 있다는 신뢰를 제거한 trustless/완전 독립청구로 소개하지 않는다.

정정은 새 evidence/decision과 새 consent target을 만들고 미송신 승인을 stale 처리한다. **이미 서명해 외부로 나간 승인에는 DB stale만으로 취소 효과가 없다.** 승인/정정/취소와 송신의 race는 on-chain epoch/revocation/직렬화 등 검토한 방식과 채굴 순서별 규칙을 먼저 확정한다. 결정 전에는 새 signer/authorization/outbox를 켜지 않는다. 같은 승인 재제출은 같은 논리 작업/수령인으로만 복구하고 다른 body·다른 app·새 key로 이중 지급하지 않는다. 응답 유실은 체인 조회로 기존 tx/nonce를 찾고, reorg/확정 수·기한 이후 전송 규칙을 테스트한다.

이미 전액 배정되고 on-chain 승인까지 확정된 권리의 실행은 새 승인을 받는 과정과 분리한다. 서버 중단 후 다른 제출자가 계약의 같은 수령인에게 실행할 수 있는지 인수한다. 새 승인 취득은 서버와 signer 가용성에 의존한다. 기존 v4는 기한·issuer 의존이 있으며 영구권리·무조건 실행 보장이 아니다. 확정 권리의 해제/회수·미해결 자금 귀속은 OPEN이다.

## B. 재원 정상 경로와 부족·복구

주시연 정상 경로는 운영자의 사전 예치 → 확인된 잔액 → 해당 신청 전액 예약/배정 → 조건과 동일결과 확인 → 제한 승인 → TEST 지급 확정이다. 부족은 별도 예외 시나리오로 시연한다. 110%/20%는 멘토 예시이며 정책 상수·예치율로 채택하지 않는다.

회계 snapshot은 동일 chain/blockHash/ledgerSequence에서 산출한다. `confirmedBalance B`, 살아 있는 `reserved R`, 확인된 미지급 의무 `O`(예약 의무 포함), `available A=B-R`, `unallocated U=O-R`, `shortfall S=max(0,U-A)`를 정수 atoms로 표시한다. `B>=R>=0`, `O>=R`, 의무당 살아 있는 배정 최대1개, 배정의 정확 app/decision/recipient/amount, 지급/회수된 금액 재예약 금지가 불변식이다. O와 R을 합쳐 부채를 이중 계산하지 않는다. chain reorg/미확정 입금은 B에 넣지 않는다. 다른 환경/토큰 잔액을 합치지 않는다.

부족시 대상 신청/청구만 FUNDING_PENDING으로 두고 부족액·영향 대기열·알림 상태를 운영자에게 표시한다. 이미 배정된 청구의 예약을 빼앗거나 전체 풀 pause를 기본 동작으로 삼지 않는다. 부족이 아닌 signer 침해 등 비상정지는 별도 권한/기존 권리 영향 리뷰가 필요하다. queue entry는 obligation/application/decision/hash/recipient/amount와 연결하고 확정 순서나 우선순위를 암묵 구현하지 않는다. 상용 배정순서/충전의무/미해결 자금 귀속은 OPEN이며 격리 시연에서 사용할 순서도 명시 승인·pin 전에는 자동 배정하지 않는다.

알림은 `shortfallIncidentId/fundingSnapshotId/status(OPEN/ACKNOWLEDGED/RESOLVED)`와 안전한 요약을 ledger에 기록한다. 동일 부족 재시도에서 알림을 중복 생성하지 않고 ACK는 자금 확보/해결이 아니다. 외부 메일/메신저 발신은 별도 승인 없이는 하지 않는다. 충전 거래 확인 → 새 balance snapshot → 기존 배정 보존 → 대기열의 current/기한/조건/동의 재검사 → 중복 없는 배정·승인/재개 순서다. 충전 버튼/tx 제출만으로 부족 해결·지급 완료를 표시하지 않는다.

## C. 두 화면의 공통 DTO와 권한

`clear-bootcamp-operations-projection.2`는 구현 예정 별도 DTO다. **완료/보완/재검증/미해결/지급대기/지급완료**를 주시연에서 모두 표현한다. evidence/funding/payment 상태축은 분리한다. 예를 들어 조건 완료+재원 부족은 COMPLETE/FUNDING_PENDING/BLOCKED이며 지급완료가 아니다. 결과가 바뀌면 이전 동의/지급승인을 다시 쓸 수 없음을 양쪽 화면이 같은 revision으로 보여준다.

| 공통/추가 view | 필수 필드/권한 |
| --- | --- |
| 공통 pin | ledgerSequence, applicationId, decisionId/revision/hash, runtimeMappingHash, projectionVersion, asOf/blockRef, current/staleReason, safe reason codes |
| 학생 본인 | 네 조건·근거 접근 가능 여부/만료·보완/재검증 안내, 본인 동의·이의 상태/기한, 본인 지급대기 이유/금액/tx·확정. 타 학생/풀 상세/서명키 노출 금지 |
| 운영자 해당 강좌 | 완료/보완/재검증/미해결/지급대기/완료 목록·정확 결과 확인, B/R/A/O/U/S와 fundingSnapshotId, 부족 알림/대기열·충전/tx 상태. 최소 역할 범위와 pagination·동일 snapshot 적용 |
| 허용 write | 기존 권한 있는 actor의 동일결과 확인·근거 있는 이의/객관오류 처리·보완 요청, 운영자 충전 intent/확인·알림 ACK. 서버 CAS·인증/CSRF·고정 명령 멱등 필요 |
| 금지 write | 임의 반려·점수/자격 덮어쓰기·수령인 교체·미해결 강제 통과·예약 몰수. UI 버튼 숨김을 서버 권한검사로 대체 금지 |

상태 목록/field는 live endpoint enum이 아니다. P3 API 소유자가 상세 transport/role DTO와 스키마 migration을 고정한 뒤 web 담당에게 실제 연결 명세/합성 예제를 인계한다. 이 통합 세션은 web 파일을 수정하거나 화면 구현 완료로 기록하지 않는다. 운영자 화면을 부록으로 빼지 않고 P5 필수 인수로 둔다.

## D. 지갑과 가스 UX의 실제 지원 범위

참가자는 수령 지갑 연결과 필요한 조건 동의·계정 통제/수집 요청·지갑 승인 서명을 계속 수행한다. 서버 relayer가 native TEST 가스를 부담할 수 있어도 지갑 생성/연결이 불필요해지는 것은 아니다. ERC20 TEST 지급액과 chain native gas를 구분해 표시한다. 기존 wallet helper의 계정/체인 변경·disconnect·거절·만료/재확인을 유지한다. 신규 AA/embedded wallet/paymaster/외부 가입/세션키/custodial key는 도입하지 않는다.

| 지원 범위 | 근거/인수 |
| --- | --- |
| 기존 v4 fixed-recipient 대리 claim | `CourseRefundVaultV4.claim`은 caller를 수령인으로 쓰지 않는다. 새 격리 메모리 EVM 검사에서 제3자 relayer의 native balance 감소·learner의 native balance 불변·learner의 TEST 증가·relayer TEST 0·다른 예약 보존·재청구 거부를 확인한다 |
| 기존 v4 제한 | EXAM grant·고정 기한·issuer 서명이며 새 decision/consent/취소 필드가 없다. 새 부트캠프 bridge 호환/서버 중단 전체 경로/운영 wallet 제품을 검증한 것이 아니다 |
| 새 MVP P4 | source→decision→consent/deadline→새 authorization→relayer→tx 확정 전체 연결과 사용자 지갑/가스 안내를 구현·실측해야 지원으로 표시. 현재 NOT_IMPLEMENTED |

## E. 실측 event와 산식

`clear-bootcamp-metric-event.2`의 최소 event는 eventId(원래 명령/transaction과 함께 영속 생성), scenarioRunId, 가명 applicationRef, decisionRevision/hash, operationId, eventType, startedAtMs/endedAtMs, 가명 actorRef, provenance다. 실제 계정명·원문·proof·서명·쿠키·지갑·개인 URL은 넣지 않는다. run 안의 시간은 단조 시계를 사용하며 복구를 위한 UTC 기록과 clock epoch를 별도 내부 관리한다. 서로 다른 epoch를 더해 지연을 만들지 않는다.

동일 eventId/동일 canonical body는 재전송으로 한 번만 집계한다. 같은 ID의 다른 body는 충돌이다. 논리키(run/app/decision version/hash/operation/eventType)가 같은데 새 eventId를 붙인 중복도 거부/조사하고 자동 완료 수를 늘리지 않는다. worker 재시도 attempt와 logical operation 완료를 분리한다. 정정은 새 decision version/hash로 기록하되 같은 업무 전체 시작/끝은 하나의 case run으로 유지한다.

| 지표 | 산식/주의 |
| --- | --- |
| 조건검증 지연 | 해당 case의 첫 검증 시작부터 마지막 검증 종료까지 wall time. 항목별 지연도 별도 제공; 병렬 구간 단순 합산 금지 |
| 전체 지연 | 동일 run의 CASE_STARTED→CASE_FINISHED. 마지막 tx확정까지 완료 조건 고정; 미완료/구간누락은 N/A |
| 자동/수동 | dedup된 AUTO_OPERATION_COMPLETED 수·HUMAN_WORK_INTERVAL 논리 개입 수. 성공 전체건수/재시도 수와 혼용 금지 |
| 사람 실제 작업시간 | actor별 실제 작업 interval의 합집합 길이를 합산한 person-ms. 대기는 제외; 같은 사람이 겹쳐 기록한 구간 중복 합산 금지 |
| 대기시간 | WAIT_INTERVAL의 case wall-time 합집합. 사람 작업시간과 별도 표시하고 서로 겹치면 두 값을 더해 전체 지연으로 만들지 않음 |
| 보완/재검증/실패 | 각각 고유 logical event 수; 실패 후 성공도 실패 이력 보존 |
| 수작업 대비 개선 | 같은 case/조건/근거/완료범위의 별도 수작업 baseline 실제 person-ms와 비교: `(baseline-personMs - automatedFlow-humanPersonMs)/baseline-personMs*100`. 표본수·환경·측정 run·사람수와 구간 누락을 기록. 음수도 보존 |

누락값은 null/N/A이며 0ms로 채우지 않는다. synthetic example과 MEASURED_ISOLATED_TEST를 섞지 않는다. baseline 비교 동등성·완전한 계측 확인 전에는 개선율 N/A다. 70%/150건 과거·멘토 숫자를 이번 성과로 복제하지 않는다. 공개 reference 산식 테스트는 측정 성과가 아니다. 개인정보 없는 event도 접근/보존 정책을 P3에서 정하고 공개 URL로 학생을 역추적하지 않게 한다.

## 실제 구현 백로그와 인수 순서

| ID/순서 | 구현 단위·담당 | 완료에 필요한 근거/현재 상태 |
| --- | --- | --- |
| P0-R2 | 통합: 추가 계약·상태/이벤트/지갑 범위·이행 인수 | 이 문서/JSON/설계 벡터·v1 회귀. 제품 구현 아님 |
| P1 | Reclaim Astra/High: 두 signed source+request binding | PR79 head `0da3abe89e2361ac75c19a331e7910afa7ecc70a`, 합성102·CI6 성공. 공식 hosted proof0/default blocked. 실제 signer/recipe/수집 경계 미결 |
| P2 | API Sol/High + Moodle/AI Sol/Medium: 네 조건 ledger 통합 | nonce/evidence 원자수락·current/CAS/restart·원문수명·검증 mapping·source/AI 분리. 진행 중; 새 계획 때문에 취소하지 않음 |
| P3-01 | API: 동의/이의·정정과 고정 기한 정책 | 같은 decision 전액배정 전제, 양측동의/무유효이의기한·유효오류·미해결·반복요청의 인수. 기한 상수/미해결 종료·자금귀속 설계 OPEN. 안전한 차단/ledger는 먼저 구현 가능 |
| P3-02 | API→기존 web 담당: 두 화면 공통 projection/role DTO | 위 6표시·동일 sequence/hash·이력/재시작·타인거부·오래된 view/CAS. 실제 화면 소유자 인계가 별도 필요 |
| P3-03 | API+통합: metrics 저장/집계·수작업 baseline protocol | 안정 event ID·명령과 원자기록·dedup·active/wait 분리·N/A·동등 baseline/실측 출처. 현재 설계 산식만 있음 |
| P4-01 | 자금/권한 담당 Astra/High: oracle authorization·signer lifecycle | 위 A의 domain·정정/취소/유출/승인 race·온체인 guard 검토 후 TEST 구현. Sol/High 문서로 코드 검토를 대체하지 않음 |
| P4-02 | 같은 담당: 재원 ledger·알림/영향 queue·복구 | B/R/A/O/U/S·예약 보호·이중배정 방지·충전 확인·current 재검사·crash/retry/chain reorg. 예치율/배정순서/자금귀속 OPEN |
| P4-03 | 같은 담당+API→web: worker/relayer TEST 지급·가스 UX | 최소 기존 대리 실행 경로부터 검증, 신규 bridge exact version/고정 수령인·가스 주체·tx 확정/유실복구. native gas와 ERC20 TEST 표시 |
| P5 | 통합+API+기존 web: 3분 두화면 E2E | 아래 여섯 시나리오·정확 commit/tx·실측/합성 출처·baseline N/A 규칙. 현재 미실행 |

P5 시연은 ① 정상 양측 동일결과 동의→TEST확정 ② 유효이의 없는 고정기한→동일 권리 실행 ③ source 정정→새 version·옛 동의/승인 차단 ④ 부족알림·영향 queue→충전확인→예약보호/재개 ⑤ 잘못된 proof/source/request 결합→거부 ⑥ 미해결 이의/UNKNOWN→지급차단을 모두 인수한다. 학생/운영자 두 화면과 같은 ledger/version·tx확정·지연/개입 실측을 3분 흐름에 담되 없는 관측은 N/A다. 기간압축은 OFFLINE_TEST_ONLY이며 실제 증명시각을 바꾸지 않는다.

P3/P4의 기한·권리해제·정정 이후 확정 권리·서명자 취소/교체·배정순서·미해결 자금 귀속을 구체 설계 관문으로 남긴다. 이 관문이 기존 P1/P2 개발을 막지는 않는다. 실질 키/서명/자금 작업은 다음 Astra/High 단위에서 검토를 마친 뒤 격리 TEST로 진행한다. 현재 grant/outbox HOLD·paymentAllowed=false·productionEnabled=false·독립청구 NO_GO와 개인자료 제한은 유지한다. Chainlink/GPT-4o/Polygon/AA는 자동 채택하지 않는다.

## 이번 revision 검증 범위

기존 P0 20개+추가 설계 벡터9개+기존 v4 relayer 부분검사1개 **30/30**, 관련 workflow/AI/document 회귀 **319/319** 통과했다. 원본/legacy191개·고정 의존성 graph·diff 검사도 통과했다. 가스 검사는 새 메모리 EVM의 기존 v4 부분 경로이며 새 bridge 지급0·실제 외부 RPC0·새 개인/공식 proof0·유료 모델호출0이다. r2-reference는 금액/계측 설계 oracle이고 서명·자금 저장·승인/취소·배정/송신을 구현하지 않는다. 성과 개선율은 실제 baseline/완전한 계측의 동등성 확인 전 N/A다. 원격 CI와 실제 후속 dispatch는 정확 head 기준의 후속 기록을 따른다.
