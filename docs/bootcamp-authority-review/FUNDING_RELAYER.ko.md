# 공용 재원·복구·가스 대납 경계

## 1. 공용 풀 회계의 의미

R2의 B/R/A/O/U/S를 같은 `(chainId,instanceId,vault,token,blockNumber,blockHash,ledgerSequence)` snapshot에서 계산한다. DB ledger는 해당 canonical chain checkpoint까지의 영향이 원자 반영된 sequence여야 한다. 체인확인과 DB current가 서로 다른 시점이면 확정 snapshot으로 게시하지 않고 재시도/UNKNOWN 처리한다.

- B: 확인 정책을 통과한 실제 TEST 잔액. native gas·미확정 tx·다른 token/환경은 제외.
- R: 전액배정되어 살아 있는 의무의 잠긴 합계. 승인 전 RESERVED, ACCEPTED 미지급, 정정 후 UNRESOLVED_RESERVED도 포함. 만료 표시만으로 R에서 빼지 않는다.
- O: 확인된 미지급 의무 전체이며 **R에 해당하는 의무를 이미 포함**. 조건 판정의 amountCandidate만으로 확정 의무를 만들지 않는다. 등록 의무가 되는 정확 business transition은 별도 승인 관문이다.
- A=B−R, U=O−R, S=max(0,U−A). 이 불변식 안에서는 S=max(0,O−B)와 같으며 O+R로 부채를 이중 계산하지 않는다.
- B≥R≥0, O≥R; 한 canonical application의 생존 의무≤1, 의무당 생존 allocation≤1; 금액은 정확 100000000 atoms. applicationId/obligationId를 바꿔 같은 등록을 다시 만드는 것도 DB business enrollment 유일키로 막는다.

**체인이 R의 최종 안전장치여야 한다.** DB에서만 예약하고 계약에서 free balance를 누구나 다시 쓰게 두지 않는다. 별도 TEST pool의 `reserveTarget` 후보가 app 등록·recipient/policy/mapping/decision·amount를 확인하고 `balance−reserved≥100000000`인 경우에만 한 번 전액 잠근다. 서버의 예상 잔액이나 사전 eth_call 성공은 transaction 경쟁의 결과를 보장하지 않는다. 두 병렬 100 예약에 A=100이면 하나만 성공해야 한다.

예약은 조건 확인/결과 동의의 고정 target과 연결된다. R2 정상 흐름의 사전 예치와 신청 전액 확보가 최종 decision보다 앞서는 경우, ‘app 예산 확보’와 ‘동의 target에 결합된 FULLY_ALLOCATED’를 구분해야 한다. **decision hash가 없는 잠금을 P0의 최종 allocation으로 표시하면 안 된다.** 구현 선택은 (a) 별도 app hold→최초 decision target lock의 명시 전이 또는 (b) immutable decision이 생긴 뒤 final allocation이다. 어느 쪽이든 잠긴 자금을 R에서 이중 계산하지 않고 최초 target만 고정하며, 정정 후 재결합은 별도 gate다. API 현재 소유자의 P3 full-allocation 전제와 합의 후 명세를 고정한다.

## 2. 금액 전이 예제 (설계 산식, 거래 아님)

| 단계 | B | R | O | A | U | S | 의미 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 정상 사전예치/두 의무 | 200 | 0 | 200 | 200 | 200 | 0 | TEST 표기; 내부 atoms는 ×1000000 |
| app A 전액예약 | 200 | 100 | 200 | 100 | 100 | 0 | app B의 예약순서는 별도 정책 |
| 부족 예외 snapshot | 120 | 100 | 200 | 20 | 100 | 80 | A의 예약100을 유지; B만 부족 대기 |
| A가 청구·확정 | 20 | 0 | 100 | 20 | 100 | 80 | B/R/O에서 A의100을 함께 제거. 이미 지급한 의무를 재등록 금지 |
| B를 위한80 충전 확정 | 100 | 0 | 100 | 100 | 100 | 0 | 산식 부족만 해소; B를 자동 합격/배정한 것은 아님 |
| B current/기한/동의 재검사 뒤 배정 | 100 | 100 | 100 | 0 | 0 | 0 | 명시 승인한 배정순서/명령만 적용 |
| B 청구·확정 | 0 | 0 | 0 | 0 | 0 | 0 | terminal tombstone은 지우지 않음 |

이 표의 부족 snapshot은 앞 정상 단계에서 임의로 자금을 빼는 전이를 뜻하지 않는다. 별도 부족 시나리오의 시작 상태다. `unsigned-design-vectors.json`에도 분리해 기록한다. confirm된 입금으로 S=0이 되어도 이의·기한·source current가 부적합하면 승인/송신은 계속 BLOCKED다. 예치율110%/20% 또는 상용 배정순서는 채택하지 않는다.

## 3. 정정·미해결과 자금 해제

기존 allocation을 새 decision hash로 덮어쓰지 않는다. ACCEPTED 전 정정이면 app epoch를 먼저 체인에 반영해 옛 서명 사용을 차단하고 기존 잠금은 UNRESOLVED로 유지한다. 새 decision/consent를 만들 수 있지만 그 자체로 예약 재사용·추가 의무·두 번째100을 만들 수 없다. 취소 tx 응답 유실/미확정 상태에서도 예약을 풀지 않는다.

원자 `replaceAllocation`은 나중에 가능한 선택지이지만 (i) 구 승인 불가능이 확인됨 (ii) 이미 ACCEPTED/PAID 아님 (iii) 구 target 해제와 새 target 잠금이 같은 chain transaction (iv) 같은 obligation/app 금액의 보존 (v) 새 동의 target 필요를 함께 충족해야 한다. **구 target 해제권한과 미해결 귀속이 OPEN이므로 현재 구현 권고는 replace/release를 막는 것**이다. 승인이 먼저 채굴됐다면 그 권리를 그대로 두고 새 결과를 별도 분쟁 기록으로 다뤄야 하며, 새 지급으로 자동 보정하지 않는다.

`reclaimExpired`는 기존 V4/Lab의 목적에 한정된 권한이다. 새 계약에 `withdrawAvailable`를 넣는 것도 A가 있다고 자동 정당화되지 않는다. 미배정 O·환급/예치 소유권·미해결 우선권이 OPEN이다. 후속 fixture 단계는 출금/회수 엔드포인트 없이 잠금·거부만 시연하고, 이로 인한 자금 잠김을 공개해야 한다. 이를 상용 자금 정책으로 쓰지 않는다.

## 4. 부족·충전·중복·reorg 인수

1. 사전예치 거래를 canonical receipt/event와 exact token balance delta로 확인한다. arbitrary tx hash/from/to/chain/log만으로 성공 처리하지 않는다. 소수·수수료형·rebasing token은 고정 TEST 코드 밖이며 지원 주장 금지.
2. confirmed snapshot의 부족은 해당 unallocated obligation/target을 FUNDING_PENDING queue에 묶는다. queue는 priority가 아닌 후보 집합이다. 현재 R2 reference도 미배정 전체를 반환할 뿐 배정순서를 결정하지 않는다. 자동 FIFO/새 ID순 배정을 암묵 도입하지 않는다.
3. incident는 stable logical ID와 snapshot 원인·영향 queue를 ledger에 기록한다. 중복 retry는 동일 incident, ACK는 읽음/처리 인지일 뿐 자금확보 아님. 동일 부족이 실제 해소됐다 재발한 새 incident와 구 retry를 구분한다. 외부 연락은 별도 승인 전 실행하지 않는다.
4. 충전 intent/operationId는 app별 owed amount가 아니라 풀 입금 command를 가리킨다. 같은 ID/같은 body는 한 결과; 같은 ID 다른 body는 충돌. tx 교체도 같은 logical operation으로 기록한다. 여러 `Transfer` 이벤트나 응답 재전달을 잔액에 반복 가산하지 않고 실제 block state B와 대조한다.
5. 입금 확정 뒤 **기존 R은 보존**하고 S를 재계산한다. 이후 target current/CAS, source trust/mapping, 동의/기한/분쟁, 이미 ACCEPTED/PAID 여부를 재검사한다. 결정/서명이 만료됐으면 새 승인 절차가 필요하며 충전이 만료를 연장하지 않는다.
6. DB 명령+outbox는 transaction 안에서 생성하되 chain 송신은 원자라 부르지 않는다. 방송 전에 logical command·tx nonce·정확 calldata intent를 영속화한다. 응답 유실이면 contract의 operation/nonce/app/right와 canonical receipt를 조회하고 UNKNOWN 상태를 보존한다. 새로운 obligation/approval nonce를 생성해 ‘재시도’하지 않는다.
7. canonical event 인덱스는 `(chainId,contract,blockHash,txHash,logIndex)`로 dedup하고 논리 app/right는 별도 유일키다. 재조직 시 checkpoint부터 chain-derived state를 되돌려 재적용한다. DB immutable evidence/decision/서명 발급 이력은 삭제하지 않는다. 제거된 입금/배정/승인/지급을 CONFIRMED로 유지하지 않는다.
8. claim이 reorg에서 빠졌다고 새로운 의무를 추가하지 않는다. 같은 app/right의 canonical unpaid 상태가 복구되면 기존 권리로만 재전송 가능성을 확인한다. 입금만 빠지고 B<R처럼 보이면 block/ledger가 섞였거나 무결성이 깨졌는지 먼저 확인한다. 부족의 정상 대응과 무결성 사고를 구분하고 새로운 승인/배정을 차단한다. 이미 확정된 다른 claim을 전체 pause하는 자동 복구는 없다.

직접 donation으로 실제 B가 늘어도 그 자금의 출처/귀속 승인이 생긴 것은 아니다. A는 산식 잔액이며 사용 권한과 구분한다. 미확인 donation은 별도 unattributed 기록으로 두고, 인정할 예치 종류가 정해지기 전 새 배정의 근거로 자동 사용하지 않는다.

새 reader는 explicit confirmations/finality policy ID·block hash·genesis·deployment/code·instance를 pin해야 한다. 기존 Lab의 confirmations 2–100 범위는 실험 설정이며 새 운영 확정 수의 승인값이 아니다. 같은 block에서 읽은 뒤 hash 재검사하는 방식을 재사용할 수 있으나 이것만으로 절대 finality가 생기는 것은 아니다.

## 5. 기존 가스 대납의 확인된 부분과 새 bridge의 빈칸

[V4 claim L100–105](../../contracts/CourseRefundVaultV4.sol#L100)는 msg.sender를 수령인으로 쓰지 않고 enrollment.learner에게 지급한다. 따라서 relayer/다른 제출자의 front-running이 recipient를 바꾸지는 못한다. [R2 기존 relayer 시험 L5–17](../../tests/product-workflow/bootcamp-r2-existing-relayer.test.mjs#L5)은 새 메모리 EVM에서 다음을 측정하도록 작성돼 있고 R269d6dc8 기록은 그 1건 PASS를 보고한다.

- relayer native balance 감소 = claim receipt.fee > 0.
- learner native balance 불변, learner ERC20 TEST 증가, relayer TEST=0.
- 다른 신청 totalReserved와 unsettled 상태 보존.
- 같은 claim 재실행은 CLAIM_STATE 거부.

관측 구간은 authorizeGrant가 끝난 **뒤의 claim 1회**다. 전체 onboarding/approval/등록 gas가 무료라는 검사가 아니다. 이번 리뷰에서는 이 시험을 재실행하지 않았다. 기존 V4의 고정 기한·issuer 승인·EXAM nullifier를 새 부트캠프 서명/취소/공용 풀 전체 지원으로 확장해 말하지 않는다.

P4-03은 허용 contract/method/chain/value=0/정확 calldata를 서버 저장 명령에서만 읽는 제한 relayer부터 구현한다. recipient/amount calldata를 사용자 임의 입력으로 받거나 임의 `eth_sendTransaction` 중계를 제공하지 않는다. tx nonce는 chain+relayer address별 DB lease로 직렬화하고 여러 worker/restart/replacement를 같은 logical operation에 연결한다. 가스 상한·예산 초과는 재시도/알림 상태이지 TEST 지급액 차감이나 수령인 교체 권한이 아니다.

claim은 저장된 right만으로 any caller 실행 가능해야 하며 claim 호출에 새 authorization 서명이나 active oracle key를 요구하지 않는 것이 권고안이다. 서버가 멈춰도 체인·실행기한·가스 공급이 살아 있으면 다른 제출자가 기존 고정 권리를 실행할 수 있다. 새 승인이나 무료 relayer의 영구 가용성까지 보장하지 않는다. participant 지갑 연결·관측/동의 승인 서명은 남는다. native TEST gas와 ERC20 TEST는 화면/metric에서 별도로 표시한다. AA·embedded wallet·paymaster·session key·custody·외부 가입을 도입하지 않는다.
