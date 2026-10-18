# E4 TEST 금고 준비 컴포넌트 인수

2026-10-19. **등록·전액예약·정정·unsigned 준비·미수락 종료·canonical reader 구현 및 독립 시험 완료. E3 경계 인수 전 payout signer/accept/claim 미활성.** source0/model0이며 실제 source 또는 지급 성공으로 표현하지 않는다.

E0 소비자 pin `67c7bc8450484fb4d5545c6e36a672e497467174`을 새 `codex/hackathon-test-vault-boundaries` branch에 정상 merge `beb8617`로 인수했다. E2 PR85/head `d9407b06b8a13122a489193119c1899929f83fe4` 및 v2/v3 artifact는 그대로 보존한다. 기존 PR79/81, CourseRefundVaultV4/FundingLab, 공통 API/DB/specs/current docs, producer/web/root graph/workflow는 직접 수정하지 않았다.

## 현재 ABI와 신뢰 경계

[컴파일 ABI·소스 artifact](preparation-artifact.json), [E3 내부 포트·교체 DTO](PORTS.ko.md), [미실행 인수 계획](acceptance-plan.json)을 따른다. artifact의 runtimeTemplateHash는 immutable 값이 채워지기 전 템플릿 hash여서 실제 배포 code pin이 아니다. runtime reader는 실행 시 exact deployed code hash를 별도로 고정한다.

- 새 `HackathonTestVaultPreparation`은 **accept/claim/withdraw/upgrade/activate 함수가 없다**. payoutEnabled=false 상수이며 이번 배포본에서 스위치로 지급을 켤 수 없다. 이후 E3 인수 뒤 새 실행 계약/새 instance/manifest로 활성 경로를 검증한다. 이 단계의 준비 bytecode를 제품 금고로 배포하지 않는다.
- 기존 고정 ClearTestToken의 **exact runtime code**만 허용한다. decimals6/100000000 atoms, 단일 P0 policy/cohort/runtime mapping·instance 고정. signer가 임의 app/recipient/amount/policy/budget/cap을 만들 수 없다. TEST 보충 입금은 허용된 non-payout fixture 거래이며 수령인에게 지급하는 거래는 없다.
- registrar/allocator, 승인 signer 주소, key admin, relayer, depositor, terminator 역할은 서로 다른 주소다. fixture transaction account만 새 memory chain에 만들고 private key를 읽거나 내보내지 않는다. keyId→주소 및 사용한 주소는 tombstone이며 revoke 후 같은 ID/주소로 재등록할 수 없다. 운영 signer/daemon은 없다.
- E2 .3 typeHash/domain/24필드는 변하지 않았다. prepareUnsigned는 current registered target/procedure/source/allocation/consent/epoch/key/time을 대조한 뒤 **전체 unsigned digest**를 등록한다. deadlinePolicyHash의 E2 canonical SHA256 계산 및 앱 동의 set recipe의 진실은 E3 내부 검증 책임이다. contract는 명시 time 필드를 직접 검사하므로 hash만 읽고 기한 검증이라 하지 않는다.
- source/currentMET·앱 두 역할의 동의·유효/미평가 이의·새 유효 오류는 registrar의 내부 receipt assertion이다. event/hash가 원천을 인증하지 않는다. E2 사전 검사와 E3 최종 current/auth/CAS 인수 없이 이를 지급 권한으로 노출하지 않는다.
- 준비 cohort는 최대64 canonical app으로 제한해 queue 탐색 gas를 bounded로 둔다. 등록·새 판정 acceptanceSequence는 단조 증가해야 하며 미등록 off-chain queue 완전성은 trusted controller가 보장한다. 추가 source/different commercial policy나 무한 cohort 지원을 주장하지 않는다.

## 회계·정정·종료

B는 계약이 exact token transfer로 확인한 credited balance다. R은 전액 예약, O는 R을 포함한 의무다. B≥R≥0/O≥R, A=B−R/U=O−R/S=max(0,U−A). 직접 token donation은 surplus이며 B로 자동 승격하지 않는다. 최초 register가 O+=100, allocate는 O를 늘리지 않고 R+=100. 150+50 시나리오에서 첫100을 보호하며 두 번째는 부족50 때문에 대기한다.

현재 유효 MET·source/이의 확인 대상 중 최소 server ledger sequence만 전액 배정할 수 있다. 부분 지급/다른 예약 차용/운영자 출금/기수 간 전용은 없다. source 만료나 DB stale은 R/O를 제거하지 않는다. funding wait는 firstStart=0이며600을 시작하거나 단순 대기로 의무를 소멸시키지 않는다.

현재 판정 교체는 **같은 application/recipient/allocationId/100/R/O/firstStart**를 보존한다. 새 decision/revision/hash/sequence/source target, epoch+1/version+1, 이전 consent/prepared digest 제거를 원자 반영한다. 현재 판정이 바뀐 뒤 새 공개/startReview·새 동의 결합이 필요하다. 유효 오류는 재검증을 요구하고 최대1회, 내용 있는 미평가 이의는 target replacement로 조용히 버릴 수 없다. 1회 후 새 검증 오류는 terminal latch가 되어 재수집으로 지울 수 없다.

`TargetReplaced`는 전후 decision/revision/hash/sequence/epoch/version/sourceReceiptHash, stable allocation, 원래 firstStart, operationId를 제공한다. reader는 성공 receipt·registrar·calldata·OperationApplied·각 로그의 tx/block/index·canonical block을 대조한다. **publication baseline보다 previous epoch/version이 커지는 것은 정상**이며 latest chain CAS와 구분한다. 자세한 최소 DTO/비교 규칙은 PORTS를 따른다.

미수락 종료는 별도 terminator가 다음 중 하나를 충족해야 한다: 원래600 cap 도달, count1 후 기록된 새 유효 오류 latch, cap 도달 및 source 만료. 임의 reason/receipt만으로 해제할 수 없다. 조건 확인→epoch 증가/옛 준비물 삭제→그 app의 R 해제→O 감소→TERMINATED tombstone이 한 chain transaction이다. 같은 operationId 재시도는 효과1회, 다른 payload 재사용·terminal app 재등록은 거부한다.

최초 수락 기한의 준비 검사: issued≤now<expires≤min(firstStart+600,sourceValidUntilExclusive), current route2 published+120≤issued이며 published+120<원래 cap. publication은 확정 allocation/target 기록보다 앞설 수 없고 firstStart=0 sentinel을 실제 시작으로 쓸 수 없다. actual accept가 생기는 후속 계약에서도 이 검사를 다시 해야 한다.

## 검증과 코드 리뷰

최신 관련 로컬 실행의 **49 distinct PASS / 0 FAIL**:

| 분모 | 결과 | 실행 범위 |
| --- | --- | --- |
| contract/component38 | PASS | fresh memory EVM: TEST deposit/approve·등록·전액예약·관측·정정·준비·키/역할·종료; unsigned field24/domain5 변조 포함 |
| reader10 | PASS | runtime/code/genesis/.3 domain/type pins, stable allocation 교체 receipt, publication vs latest CAS, 응답 유실 재조회·reorg·잘못된 tx/log 거부 |
| ABI/source artifact1 | PASS | 실제 compile artifact와 저장한 ABI/source hashes 일치, 지급 함수 없음 |

처음 component33, 이벤트/reader 추가 후40, 보강 후46개가 통과했고 이후 reader/domain·publication 및 artifact를 별도 검증했다. 중복 실행을 새 테스트 수에 더하지 않는다. 최초 compiler 시도에서 Solidity 변수 선언 구문 오류1건을 고쳤으며 체인 시험 실패로 세지 않는다. native µWS/bigint 미지원 경고는 기존 Node24의 JS fallback으로 통과했고 설치 graph를 바꾸지 않았다.

직접 리뷰에서 별도 key-role 충돌/폐기 주소 재사용을 차단했고, 미평가 이의가 target 교체로 사라지는 경로를 막았다. 관측 변경 시 chain consent commitment도 무효화하되 같은 판정의 유효 앱 receipt는 E3 재검사 뒤 재결합할 수 있도록 포트를 분리했다. reader는 primary event뿐 아니라 OperationApplied의 tx/block/index도 검사하고, runtime code 외에 .3 domain/type도 대조한다. publication anchor를 latest CAS로 착각하지 않는 반례를 추가했다. 독립 보안 감사 또는 아직 없는 지급 계약의 최종 검토가 아니다.

기존 guarded product-workflow CI glob에 전용 `hackathon-test-vault-preparation.test.mjs` 진입점을 추가했다. E0/E2를 이 wrapper에서 중복 import하지 않는다. 정확한 PR HEAD의 원격 CI 결과는 PR 본문을 따른다. CI는 이49개를 반복 실행할 뿐 원천/서명/지급 분모를 늘리지 않는다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/hackathon-test-vault-preparation.test.mjs
./tools/node tests/hackathon-test-vault/artifact.mjs --write
./tools/node tools/verify-workspace.mjs
```

## 이번에 실행하지 않은 것

E2의 과거 pure helper 배포1/90calls와 이번 E4의 **새 memory chain 컴포넌트·TEST 입금 거래**는 다른 실행이다. 이번에는 authorization .3 서명0/accept0/claim0/수령인 지급0/실제source0/model0/외부RPC0다. StrictECDSA는 독립 pure primitive의 길이/high-s/v/zero recovery 거부만 실행했으며 유효 지급승인 서명·malleability 양성 대조를 했다고 주장하지 않는다. 준비 계약이 exact fixed token code만 받으므로 악성 callback token을 실제 수락한 reentrancy 공격 시험도 하지 않았다. 이후 지급 경로의 exact outgoing transfer/reentrancy/nonce 소비는 별도다.

enum ACCEPTED/SETTLED는 후속 보호 상태의 이름만 예약했다. 준비 계약은 이 상태로 전이할 수 없다. accept-first/terminate-first 실제 양순서, accepted 권리의 current key/epoch/source/새 서명/claim expiry 무관성, anycaller fixed-recipient exact transfer1회·settled tombstone은 E3 인수 뒤 실제 실행 계약에서 검증한다. 현재 테스트에 임의 storage를 주입해 accepted 성공으로 셈하지 않는다. 과거 P4의40개 향후 반례 계획도 실행 완료 수가 아니다.

E5 persistent chain/backend 별도 lifecycle·별도 직접claim·DB outbox restart/CAS·공개 finalized 인수는 미실행이다. reader 결과는 canonical INCLUDED/관측이며 FINALIZED가 아니다. memory evm_snapshot/revert는 현재 fixture에만 적용했다. 기존 사용자 chain/키/DB/volume을 초기화하지 않았다. E3 exact head/consent recipe/DTO를 받으면 같은 승인 범위에서 후속 signer/accept/claim 검증을 이어간다.
