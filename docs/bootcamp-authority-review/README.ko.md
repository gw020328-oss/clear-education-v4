# P4-01 권한·재원 경계 설계 리뷰

2026-10-17. **판정: 새 부트캠프 지급 bridge는 기존 V4/FundingLab의 설정 변경으로 지원할 수 없다. 별도 v2 권한·배정 상태가 필요하며, 현재 signer/outbox를 활성화할 수 없다.** P1/P2 증거·저장 개발은 계속할 수 있다. 이 결과는 설계와 기존 소스/ABI 분석이며 새 지급 구현·감사 완료 판정이 아니다.

요청 Astra/High, 실제 런타임 모델 ID 독립 확인 불가. 기존 PR79 `0da3abe89e2361ac75c19a331e7910afa7ecc70a`를 보존하고 리뷰 전용 `codex/bootcamp-authority-review`에서 R2 `69d6dc80caaf2bde963385e176068e3a0293e6b3`를 정상 이력 병합했다. 병합 기준은 `318f296ca424c7bbe4cf1321b9ceea555c8936c0`이며 P0 v1 `03fa64324ef9cc2ce4fb442a612329a7b1285677`의 정책·기록 계약은 그대로다. 이번 직접 변경은 이 디렉터리뿐이다.

- [권한 필드·검증 위치·취소 경합](AUTHORIZATION.ko.md)
- [공용 재원 회계·복구·relayer](FUNDING_RELAYER.ko.md)
- [P4-01/02/03 구현 단위·결정 관문·공격 인수](IMPLEMENTATION.ko.md)
- [서명 없는 설계 시나리오](unsigned-design-vectors.json), [컴파일/ABI 지문](source-inspection.json), [검증 범위](verification.json)

## 진행을 막는 구체적 발견

아래 P1/P2는 발견의 중요도이며 개발 단계 P1/P2와 다르다. 기존 합성 계약의 명시된 목적을 결함이라고 바꾸는 것이 아니라 **새 R2 지급에 재사용할 때 생기는 차단 사항**이다.

| ID / 중요도 | 재현 가능한 조건·영향 | 근거와 권고 |
| --- | --- | --- |
| A01 / P1 | 새 decision/mapping/동의/배정 정보를 V4 Grant의 off-chain JSON에만 덧붙이면 계약은 이를 검사하지 않는다. 오래된 결과의 issuer 서명도 V4 조건만 맞으면 승인 가능 | [V4 L17–21,32–35,86–98](../../contracts/CourseRefundVaultV4.sol#L17), [JS type L13–22](../../src/vault/encoding.mjs#L13). 새 v2 domain/type·별도 계약, 기존 examNullifier/runtimeConfigHash에 새 의미를 숨겨 넣지 않음 |
| A02 / P1 | DB decision을 stale로 바꿔도 이미 유출/전달한 서명에는 효과가 없다. relayer만 중단해도 제3자가 `authorizeGrant` 호출 가능. 기존 issuer 교체/취소 함수도 없음 | [V4 L86–98](../../contracts/CourseRefundVaultV4.sol#L86). app epoch와 signerKeyId 등록/폐기의 on-chain 검사를 **최초 승인**에서 수행. 확정 권리 claim에서 current epoch/key를 다시 검사하지 않는 안 권고 |
| A03 / P1 | 취소가 먼저 채굴된 경우와 승인 후 취소가 채굴된 경우를 같은 DB 규칙으로 처리하면 권리 탈취 또는 옛 서명 실행 중 하나가 생김 | 기존 grantDigest는 처음 승인 뒤 변경 불가(L89). 새 설계도 canonical 채굴 순서를 권리 확정 기준으로 택할지 결정 필요. DB 정정 시각이 먼저라는 이유만으로 후속 체인 취소가 우선할 수 없음 |
| A04 / P1 | 기존 `reclaimExpired`를 복사하면 새 정책에 없는 확정 권리 회수 권한과 T+10 만료를 도입 | [V4 L48,100–110](../../contracts/CourseRefundVaultV4.sol#L100), [FundingLab L118–123](../../spikes/funding-lab/FundingLab.sol#L118). 권리 실행기한·해제/미해결 귀속 OPEN. 새 경로에서 회수/자동 만료를 열지 않음; 영구권리라고도 단정하지 않음 |
| F01 / P1 | FundingLab의 `syntheticEligible`와 `held[app]`를 공용 oracle/pool로 소개하면 실제 자격 검증과 풀 중복배정을 빠뜨림 | [FundingLab L5–6,37–54,73–94](../../spikes/funding-lab/FundingLab.sol#L37). 생성자 fixture는 신뢰한 합성 입력; 실제 proof·decision·issuer 없음. R2 공용 풀은 별도 상태/회계 필요 |
| F02 / P1 | 새 decision/obligation ID로 같은 신청의 100 TEST 의무를 다시 만들거나 DB 예약만 바꿔 자금을 중복 사용 | [R2 L43–47](../current/PYTHON_BOOTCAMP_R2.ko.md#L43), [referenceFunding L13–21](../../specs/bootcamp/r2-reference.mjs#L13). application 단위 생존 의무/배정 유일성·settled tombstone 필요. 정정 시 기존 예약을 UNRESOLVED로 보존하고 대체 정책 전 새 배정 금지 |
| F03 / P2 | 서로 다른 block/ledgerSequence의 B와 R/O를 합치거나 tx hash만 보고 충전을 완료 처리하면 과대 A/이중 충전/유실 복구 오류 | [V4 reader L18–21,23–38](../../src/vault/reader.mjs#L18), [Lab reader L15–34](../../spikes/funding-lab/reader.mjs#L15). V4는 canonical receipt 확인이나 별도 confirmation 수 없음; Lab은 고정 n의 확인 깊이 검사. 새 chain 정책/동일 snapshot·reorg cursor가 필요 |
| A05 / P1 | compromised signer가 새 recipient/amount/app을 서명하거나 같은 app에 새 key/nonce로 두 번째 승인 | V4는 enrollments의 learner/config.amount/settled로 범위 제한(L90–97,102–104). 새 bridge도 독립 등록·전액 예약된 target만 허용해야 함. signer가 등록/배정/수령인 변경까지 겸하면 blast radius 제한이 무력화됨 |

## 기존 ABI와 상태 전이의 실제 차이

| 항목 | CourseRefundVaultV4 | FundingLab | R2에 필요한 추가 경계 |
| --- | --- | --- | --- |
| 도메인 | ClearRefund / 4 / chainId / contract / salt=instance | configHash에 chain/contract/config 결합; oracle 서명 없음 | 별도 name/version2/instance, 구 V4 서명 거부 |
| 초기 자금 | sponsor의 `enrollAndFund`가 매 신청 amount를 transferFrom하며 즉시 예약 | register 후 app별 topUp/held | 공용 사전예치와 독립 의무·정확 target 전액 예약 |
| 자격 | immutable issuer의 EXAM grant | 생성자 syntheticEligible | 네 source 검증→rule engine→decision/동의/기한을 발급 서버가 판단 |
| 확정·청구 | grantDigest 1회 고정, any caller→fixed learner, claimUntil | allocate 후 any caller→fixture recipient, claimUntil | 제한 승인 accept와 settled 권리의 독립 claim, 취소/rotation 경합 명세 |
| 중복 | consent nonce·grantId·examNullifier, app.settled | operationId body·app settlement | app 권리 유일성+allocation+nonce/approval digest, key교체/정정/재시작 간 유지 |
| 회수 | 기한 뒤 sponsor 회수(승인된 미청구도 포함) | 취소/기한 후 미배정 및 만료 배정 회수 | OPEN. 기존 회수 API는 새 경로에 이식 금지 |

`source-inspection.mjs`는 두 기존 계약을 solc0.8.30으로 메모리 컴파일해 실제 ABI selector·입력 tuple과 runtime code hash를 추출한다. 기존 Grant ABI에 새 필드가 없고 revoke/rotate 함수가 없음을 검사했다. 계약 배포·EVM 트랜잭션·키 생성/읽기·새 서명은 이 로컬 리뷰에서 실행하지 않았다. R2 relayer 검사는 기존 코드/기록을 읽은 근거이며 이번에 재실행한 측정으로 쓰지 않는다.

P1 PR79의 합성102·당시 CI6, 공식 proof0/default blocked는 그대로 보존한다. 현재 source 신뢰 미결을 지급 설계가 대신 통과시키지 않는다. 기존 C2 개인자료 제한·grant/outbox HOLD·paymentAllowed=false·productionEnabled=false·독립 NO_GO를 유지한다. 이 권고는 CLEAR 추가 지급승인이 없는 trustless 청구 완성이 아니라 **R2가 추가한 제한된 서버 oracle 승인**의 신뢰 경계를 명시한 것이다. 원천 서명과 CLEAR 지급승인을 혼동하지 않는다.


## 재현·검증의 분모

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs docs/bootcamp-authority-review/source-inspection.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test docs/bootcamp-authority-review/review-check.test.mjs tests/product-workflow/bootcamp-p0-contract.test.mjs tests/product-workflow/bootcamp-r2-contract.test.mjs
```

리뷰 산출물14 + P0 reference20 + R2 reference9 = **43 PASS / 0 FAIL**. 새 bridge 채굴/서명/취소 동작 시험은0이고, 40개 adversarial case는 후속 필수 인수 목록이다. 기존 P1 시험102·기존 R2 가스시험1을 이번 분모에 다시 더하지 않는다. 공통 CI에는 새 리뷰 test를 편입하지 않았다. push/PR로 실행되는 기존 공통 CI의 합성 key/EVM fixture는 기존 회귀이며 새 bridge 동작 검증이 아니다. 정확 commit과 결과는 Draft PR에 기록한다.
