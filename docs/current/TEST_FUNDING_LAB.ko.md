# 부분 충전·전액 배정 TEST 실험

2026-10-15, 기준 develop `ef138da`, `test-funding-lab.1`. 멘토 답변 전 승인된 격리 실험이다. 기존 `CourseRefundVaultV4.enrollAndFund`, application DB/schema, 기존 신청/동의/키/체인은 보존한다. 실제 PG 보관·정산, 원화 변환, 공개 RPC/실자금 배포, 제품 grant/outbox 구현은 없다.

## 경계와 재사용

M0는 상태·금액 예제만 있고 신규 재원 계약은 없었다. 기존 v4는 등록과 전액 입금이 결합돼 새 부분 충전에 그대로 사용할 수 없다. 기존 TEST 토큰, 정수/지문 검증과 M0 금액 계산을 재사용한다. 기존 v4 회귀를 유지하고 새 계약·reader·실행기는 `spikes/funding-lab/`, 시험은 `tests/funding-lab/`에 둔다. 제품 HTTP/DB 또는 새 UI 계약을 동결하지 않는다.

`PER_APPLICATION_TEST_ADAPTER`는 이번 실험에서만 선택한 방식이다. 공용 준비금·상품별 PG 보관과 동일 구현이 아니다. 등록/동의, 합성 자격, 재원, 청구 관측을 별도 필드로 반환한다. 약정액·누적 충전액·현재 확보액·배정액·현재 예약액·부족액·지급액·회수액을 구분한다. PG 잔액·예산·충전 예정은 온체인 확보액에 포함하지 않는다.

## ABI와 권한 검토

- 생성자: TEST 체인 31338 및 정확한 기존 ClearTestToken 코드만 허용. 새 인메모리 Ganache, 새 무가치 TEST/지갑만 사용한다. chainId 검사만으로 임의 배포가 안전해지는 것은 아니며 공개 배포 도구는 제공하지 않는다.
- 생성 시 최대 32개의 인공 약정/자격 fixture를 고정한다. application/learner/recipient/policy/amount/decision commitment/tier를 고정하며 400·500은 거부한다. fixture 제공자인 배포자를 신뢰한다. 실제 원천 자격 검증·독립 청구 검증기가 아니다.
- `register(applicationId, agreementHash)`: 고정 learner의 직접 거래로 약정 동의. 입금은 요구하지 않는다. 해시는 chain/instance/contract/config/fixture를 포함한다. 기존 v4 서명·nonce를 재사용하지 않는다.
- `topUp(applicationId, operationId, amount)`: 고정 sponsor만 신청별 충전. operationId는 동일 요청 재전송 시 중복 차감/반영하지 않고 다른 신청/금액이면 거부한다. 실제 수령액의 정확한 증가를 확인한다.
- `allocate(applicationId)`: 누구나 호출. 등록·고정 FINAL_SYNTHETIC fixture·기한·해당 신청의 약정액 전액 확보를 모두 검사한다. 추가 운영자 승인/서명 없음. 부분 배정/부분 지급/신청 간 이동/예약 축소 API 없음.
- `claim(applicationId)`: 누구나 전달하되 고정 recipient에게 전액 1회. 같은 지급 재시도는 추가 지급 없이 기존 상태를 유지한다. 이미 배정된 권리를 새 서명/검증자 변경/관리자 pause로 다시 잠그지 않는다.
- `cancel(applicationId)`: 배정 전 learner만. `recoverUnallocated`: 취소 후 또는 배정 기한 뒤 sponsor만 미예약액을 고정 refundRecipient로 회수. `reclaimExpired`: 청구 기한 뒤 미지급 예약액만 같은 회수처로 전송. 모두 실험 가정이다.
- 합성 기한: 등록·충전·배정은 `time <= allocationUntil`; 청구는 `time <= claimUntil`; 예약액 회수는 `time > claimUntil`. minClaimWindow를 명시하고 `claimUntil >= allocationUntil + minClaimWindow`를 요구한다. 실제 사업 기한/회수 권한을 확정하지 않는다.

항상 `실제 잔액 >= 총 현재 확보액 >= 총 예약액`, 신청별 예약은 `0 또는 약정액`, PAID/RECLAIMED 상호배타. 전송 실패는 상태·충전 operation·예약 변경까지 원자적으로 롤백한다. 무단 직접 토큰 전송은 신청 확보액으로 계산하지 않으며 sweep 기능도 없다. 지원하지 않는 fee/rebase/hook 토큰을 허용하지 않는다.

## 체인 관측·복구 계약

읽기 어댑터는 고정 chain/genesis/contract/runtime code/instance/config와 confirmation 수를 확인한다. 모든 상태는 같은 블록에서 읽고 완료 후 canonical block hash를 재확인한다. receipt와 거래 목적지·호출값·발신자·실행 성공·블록/확인 수를 대조한다. 이벤트를 누적 더해서 잔액을 계산하지 않는다. 응답을 잃으면 동일 operationId 또는 신청 상태를 재조회한다. RPC 오류/미확인/재조직은 UNKNOWN 또는 거부이며 추정 PAID가 아니다. 영속 실험 체인·외부 DB가 없으므로 새 reader로 재개하는 복구와 기존 체인 손실을 구분한다.

## 계산과 시뮬레이션

M0의 `siwon-demo-amount.1` 정수 산식을 공유한다. 50/100/200/300만 계산하며 400은 PRECHECK_ONLY, 500은 범위 밖이다. OFFICIAL_OPEN/null/공제·세금·반올림 미확정은 금액 확정 불가다. YBM형은 명시적 합성 약정액을 사용하고 실제 상품 산식을 만들지 않는다.

보관율 시뮬레이션은 계약·입금과 연결되지 않는 순수 계산이다. 수강 인원·환급 인원/구간별 금액·부대금액·보관 bps·여유/추가 충전 bps와 각각의 기준액, 별도 추가 충전액(additionalTopUpAtoms)을 모두 입력해야 한다. 비율 충전액과 별도 입력액은 합산하며 후자는 비율 0으로 두고 단독 비교할 수도 있다. 제품 기본값/권고치는 없다. 60%·55%·5%·15%는 멘토 질의용 가정이며 상품별/개인 예상 성적별 차등 예치 정책이 아니다. 예측과 온체인 지급 가능액을 분리한다.

## 멘토 답변 필요

1. 공용 준비금 vs 신청별 충전 vs 상품별 PG 보관의 관계와 기수/상품 간 전용 허용 여부.
2. 배정 순서(선착순 포함), 보관·충전 시점/의무·한도, 부족 시 책임·추가 보장.
3. 지연·취소·회수·최소 청구 기간·만료 후 미지급 권리와 재신청/증거 재사용.
4. 실제 상품별 산식·공제·응시료·세금/반올림·상위 tier 미확인 처리와 적용 기수.
5. 실제 원천 검증자/신뢰와 독립 청구 구조, PG→온체인 연결·정산 권한.

400% 자동 자격·지급 금지, Moodle·원천 검증 차단, grant/outbox 보류, 독립 청구 제품 전환 NO-GO, Mac 실패 원인 미확정을 유지한다. 합성 TEST 지급 성공은 이 관문을 해제하지 않는다.

## 재현과 적용 범위

- `./tools/npm run test:funding-lab`: 계약·조회·금액·시뮬레이션의 합성 시험. 전송 실패/재진입은 새 테스트 노드에만 토큰 코드를 주입해 방어를 검사한다. 그 토큰은 계약 생성자에서 허용되지 않으며 운영용 fault switch는 없다.
- `./tools/npm run demo:funding-lab`: 새 메모리 체인에서 부족→40 TEST→60 TEST→전액 배정→단회 지급 및 재조회/재시도, 타 신청 예약 보존 결과를 출력한다. 종료하면 이 실험 체인만 폐기한다. 실제 원천·PG·원화·기존 체인에는 접속하지 않는다.
- 보관율 비교는 `simulation.mjs`의 입력을 바꾸는 순수 계산이다. 환급 인원은 구간별 중복 없는 집계 가정이고 개인 예상 성적별 예치 모델이 아니다. 보관/추가 충전은 내림, 여유 목표는 올림이며 기준액(REVENUE/LIABILITY)을 명시한다. 이는 시뮬레이션 산술 규칙이지 실제 약정의 반올림 정책이 아니다.

새 실험은 M1 전체 정책 컴파일·M2 실제 자격·M3 제품 등록/웹 동의·전 사업 동일 시험 nullifier를 구현하지 않는다. 생성자 fixture의 FINAL_SYNTHETIC은 배포자가 입력한 사실이며 원천을 검증한 결과가 아니다. reader를 새로 만들어 같은 체인에서 조회하는 복구를 검증하며, 노드 자체의 영구 저장·장애 복구나 악성 RPC의 상태 증명은 지원하지 않는다. operationId는 재시도 시 같은 값을 유지해야 한다. 새 ID는 새 충전이므로 caller의 지속적 ID 보존은 제품 연결 전 별도 계약이다.

## 검증 결과 — 2026-10-15

[재현 기록](test-funding-lab-verification.json): 코드 `390eccd`에서 새 시험 28개, 기존 v4 금고 회귀 78개, M0 예제 및 workspace 원본·legacy 191개 보존 검사가 통과했다. TEST 시연은 합성 조건 충족/재원 0 → 40 TEST → 60 TEST 추가 → 100 TEST 전액 배정 → 고정 수령인 1회 지급이다. 응답 유실 후 새 reader로 충전 사실을 확인하고 같은 operation을 재전송해도 추가 반영하지 않았다. 다른 신청의 100 TEST 예약은 보존됐다.

같은 100명·가상 TEST 수강료·환급 구간·부대금액을 놓고 보관 60%와 55%, 여유 5%·비율 충전 15%를 비교한 결과도 기록했다. 이 숫자는 질의용 입력이다. 제품 기본값·상용 위험 추정·실제 지급능력·개인 예상 성적별 차등 예치 결과가 아니다. 별도 추가 충전액과 각 비율의 기준액을 바꿔 재계산할 수 있다.

실패 검증: 충전 승인/전송 실패·무반영 반환, 재진입, 동일 operation 충돌, 중복/동시 배정·청구, 취소/배정 경쟁, 배정·청구/회수 기한 양쪽 경계, 틀린 chain/config/code/receipt, 확인 수 미달·응답 유실·재조직을 포함했다. 이후 전체 CI 결과는 연결 PR의 최종 head를 기준으로 확인한다.
