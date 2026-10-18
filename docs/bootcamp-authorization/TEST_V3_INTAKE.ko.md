# E2 TEST v3 unsigned 인수와 E1/E3/E4 연결 계약

2026-10-18. **서명 전 구조·서버 snapshot 일치·해시 구현 완료, 공통 consumer freeze 및 실행 권한 인수 대기.** 실제 원천/동의 검증·승인 서명·nonce 소비·금고 accept/claim 구현을 완료했다는 뜻이 아니다. 기본 UNCONFIGURED이고 성공도 UNSIGNED_PREFLIGHT_ONLY다. usableForIssuance/paymentAllowed=false, grant/outbox HOLD를 유지한다. 승인된 후속 TEST 구현을 영구 금지하는 상태가 아니다.

## 고정 입력과 보존

- E0 정상 이력 병합 입력: `67b6a0731f97df98fda7820ab24ed85a57796a83`, 이 작업본의 merge `de24bb2`. [정본](../current/HACKATHON_TEST_OPERATIONS.ko.md) 및 [기계 판독 profile](../../specs/bootcamp/hackathon-test-operations-v1.json).
- profile version `clear-hackathon-test-operations.1`, 사용자 decision revision1, 저장소 plan revision4. profile JSON의 profileId는 버전 없는 `clear-hackathon-test-operations`이며 E2 profilePin.profileId는 버전 식별자를 사용한다.
- profile hash `0x47a18b20a02a8acf89160c50601b8a2625bcae432292d9cf6d4644af0a2fdb98`. E0의 `p0Hash('HACKATHON-TEST-OPERATIONS', profile)`와 대조한다. E2는 임의 sourceCommit/hash를 자기 선언하여 통과시키지 않는다. 이것은 내용 pin 확인이며 Git 서명 검증이나 배포 상태 검증이 아니다.
- 기존 미커밋 v2 초안을 `ebda28d`에 보존했다. [v2 설명](README.ko.md)의 finite claimUntil/75초 예제와 G2~G6 OPEN은 당시 제안이다. 새 TEST 정책으로 G2~G6의 운영 선택은 확정됐으며 실제 구현·주소·역할·인수는 남는다.
- P0 frozen `03fa643`, R2, R3 `733fe69`, 기존 v1 wire/ABI·P1 PR79·P4 PR81은 보존한다. E0 파일은 merge로만 들어왔으며 직접 수정하지 않았다. 제품 consumer, HTTP/DB, contracts, web, root 의존성/CI는 수정하지 않았다.

## 명시적인 새 버전

| 항목 | 보존된 v2 | 새 TEST v3 |
| --- | --- | --- |
| primary type | BootcampPaymentAuthorizationV2 | BootcampTestPaymentAuthorizationV3 |
| domain | ClearBootcampPayment / 2 | ClearBootcampTestPayment / 3 |
| 메시지 | 18필드 | 기존 순서18 + 새6 = 24필드 |
| first-accept window | clear-bootcamp-unsigned-deadline-record.1 | clear-bootcamp-test-first-accept-window.3 |
| snapshot | clear-bootcamp-unsigned-server-snapshot.1 | clear-bootcamp-test-unsigned-snapshot.1 |
| accepted claim | 과거 finite claimUntil 예제 | claim 만료/운영자 회수/current key·epoch 재검사 없음 |

domain은 name/version/chainId/verifyingContract/salt(instanceId) 5필드다. 새 메시지에 `operationsPolicyHash`, `procedureId`, `firstReviewStartedAt`, `decisionPublishedAt`, `sourceValidUntilExclusive`, `revalidationCount`를 뒤에 추가한다. 정확 순서/타입은 [v3 제안 JSON](test-encoding-proposal-v3.json), [소스](../../src/bootcamp-authorization/test-schema-v3.mjs), [pure Solidity helper](../../src/bootcamp-authorization/TestUnsignedHashProbeV3.sol)에 있다. v2·기존 V4 Grant/examNullifier를 자동 변환하거나 재사용하지 않는다.

`deadlinePolicyHash`는 v3에서 새 first-accept window record의 canonical JSON에 `CLEAR-BOOTCAMP-TEST-UNSIGNED-FIRST-ACCEPT-WINDOW.1\n` 도메인 구분자를 붙인 SHA256다. window는 profile/app/procedure/decision ID·revision·hash/allocation/route/first start/publication/source cutoff/issued/expires/revalidation을 포함한다. snapshot의 window 내용과 해시를 다시 비교한다. claimUntil은 없으며 추가 필드로 넣으면 거부한다. 온체인은 이 SHA256 record를 JSON으로 계산하는 대신 서명된 명시 필드와 저장된 절차/배정 상태를 대조해야 한다. hash 하나를 보고 기한을 검증했다고 하면 안 된다.

uint256/64/8은 canonical decimal string, 계산은 BigInt다. 0은 revalidationCount에만 허용하고 그 값은 0 또는1이다. 다른 양의 정수의 0/음수/leading zero/overflow/number·unsafe number/null/unknown field/unknown route를 거부한다. 금액100000000·decimals6은 고정하며 recipient는 0/token/vault 주소일 수 없다. policyHash·decisionHash의 기존 SHA256 bytes32를 다시 해시하거나 EXAM nullifier로 바꾸지 않는다.

## 사전 검사와 시간 경계

`createTestDraftInspector(serverSnapshot)`가 내부 서버 snapshot을 복제·동결하고, 각 `inspect(draft,currentServerState)` 호출은 동기적으로 입력/상태를 복제한다. factory snapshot/registry를 브라우저 요청으로 구성하면 신뢰 경계를 위반한다. 현재 상태 또한 인증된 내부 서비스가 가져와야 한다. 이 모듈 자체에는 HTTP·DB·서명 검증·권한 인증이 없다.

1. 등록된 kind+logicalId → opaque bytes32를 APPLICATION/DECISION/ALLOCATION/PROCEDURE별로 고정한다. 같은 opaque ID를 다른 kind/논리 ID에 재사용할 수 없다. 원문 ID 단순 공개 hash를 만들지 않는다. durable uniqueness/registry 생성·충돌 방지와 배포 domain/genesis/code 검증은 consumer 책임이다.
2. domain·메시지24필드·logical target이 factory snapshot과 정확히 같아야 한다. 현재 상태의 app/procedure/decision revision/hash/mapping/allocation/recipient/token/amount/consent hash/deadline hash/nonce/profile/domain도 대조한다. epoch, keyId/active, nonceAvailable, current MET, exact fullAllocation, 신청별 예약잔액, 미해결/내용 있는 미평가 이의 및 newValidError를 확인한다.
3. route1은 같은 현재 판정에 대한 bothPartiesConsent가 필요하다. `consentSetHash` 일치와 내부 boolean 검사는 실제 양측 인증을 대신하지 않는다. route2는 해당 판정 published+120 이상에 발급하고 확인하며, 실제 now가 만료 전이어야 한다. 동의나 시간 경과는 source/재원/이의 검사를 우회하지 않는다.
4. `firstStart ≤ published ≤ issued < expires ≤ min(firstStart+600, sourceValidUntilExclusive)`. 최초 accept는 `issued ≤ now < expires`이고 원래600 cap/source cutoff보다 엄격히 앞서야 한다. cap+uint64 overflow를 거부한다. 새 판정 published+120이 원래 cap과 같으면 최초 수락이 가능한 시간이 없으므로 route2를 거부한다. 새 판정에도 충분한 시간과 새 동의를 확보하면 route1은 가능하다.
5. 예제 source cutoff는 Moodle 관측3개 각+300, Reclaim signed timestamp2개 각+900, rawAcquired+1800, auth/raw/query lease 종료와 검증기가 제공한 verifiedValidUntilExclusive 중 최소다. 모두 exclusive이며 issuedAt 이후의 관측/획득 시각·배열 누락·overflow·현재 state와 메시지 cutoff 불일치를 거부한다. 기존 v1 관측-age의 inclusive 판정을 바꾸지 않고 first-accept 상한을 보수적으로 산출한다. E1의 더 이른 검증기 만료는 verifiedValidUntilExclusive로 반드시 전달하고 철회도 반영해야 하며, consumer 인수 때 이 sourceWindow와 E1의 실제 exclusive bound를 대조해야 한다. 새 acquiredAt만으로 과거 관측/signed 시각을 갱신하지 않는다. 900초를 승인 TTL로 복사하지 않는다.
6. 첫 시작 시각과 재검증 횟수의 역사적 진실은 E3 영속 절차가 보장한다. E2는 trusted current state와 다르면 거부하지만, 양쪽 snapshot을 함께 조작한 가짜 역사까지 인증하지 않는다. 재검증1 이후 새 오류도 차단하며 통신 재시도는 이 모듈이 횟수를 증가시키지 않는다.
7. ACCEPTED는 동일 app/procedure/allocation/recipient/token/amount에 한해 FIRST_ACCEPT_ONLY/NOT_APPLICABLE로 반환한다. 이 반환은 청구 허용·체인 수락 검증이 아니다. 이후 key/epoch/판정/source/승인기한을 claim gate로 쓰지 않는다. 실제 claim은 저장된 고정 권리를 별도 계약 경로에서 처리한다. malformed unsigned 입력의 거부를 accepted claim 거부로 재사용하면 안 된다.

[안전한 합성 예제](test-unsigned-example-v3.json)는 발명한 주소/opaque ID/시각과 source assertion만 포함한다. 진짜 claim·개인 원문·쿠키·키·승인 서명이 없고 실행 가능한 지급승인이 아니다. clock override는 SYNTHETIC_EXAMPLE provenance에서만 허용하며 provenance 자체도 인증 도구가 아니다.

## 검증·직접 코드 리뷰

- 기존 v2 전용43 + P0 20 + R2 9 =72 PASS 기록을 확인했다. 기존 ABI/type/예제를 수정하지 않았다.
- v3 구조/변조/경계/예제 **119 PASS**. E0 운영 reference **12 PASS**는 별도이며, E0가 말한41은 P0/R2 29개를 합한 분모다. 정책 reference를 실제 source/signature 인수로 세지 않는다.
- v3 hash helper **1 PASS**: 기본값+domain5/message24의 모든29 mutation =30 vector, JS EIP712/독립 literal ABI+keccak/Solidity3방향 일치. helper는 pure 함수3개뿐이다. 새 memory EVM helper 배포1건·pure eth_call90회, 승인 서명0·지급거래0·외부RPC0. 기존 v2의 배포1건/72calls는 과거 별도 실행이다.
- 따라서 이번 v3+E0 최신 결과는 **132 PASS**(119+1+12). 보존된72와 중복 없이 함께 보면204개이며 같은 실행에서204개가 모두 재실행됐다는 뜻은 아니다. 새 suite는 공통 CI에 등록하지 않았고 로컬 명시 실행 결과다.
- 첫 v3 실행은111 PASS/2 FAIL였다. 실패는 동결된 deadlineRecord fixture를 직접 변조하려던 두 테스트의 TypeError였다. fixture를 복제해 실제 검증기 거부를 시험하도록 고쳤다. helper 비교는 첫 실행부터 통과했고 hash ABI가 바뀌지 않아 반복 배포하지 않았다.
- 직접 리뷰에서 `consentSetHash`·deadline·nonce·현재 domain 대조, 임의 profile pin 거부, newValidError/현재MET/전액배정 검사, accepted 상태의 다른 신청 혼동 거부와 key/epoch 무관 경로를 보강했다. 실제 E4의 race/reorg/서명키 수명 보안 감사를 수행한 것은 아니다.

재현 명령:

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/bootcamp-authorization/test-*-v3.test.mjs tests/product-workflow/hackathon-test-operations-contract.test.mjs
./tools/node tests/bootcamp-authorization/test-export-example-v3.mjs
```

고정 Node24.21.0, 기존 ethers6.17.0/solc0.8.30/ganache7.9.2만 사용한다. Ganache native µWS/bigint 부가 모듈 미지원 경고 후 JS fallback으로 통과했으며 재설치하지 않았다. helper EVM은 ephemeral transaction account1개만 메모리에 두고 종료한다. signer/oracle/relayer 키를 만들거나 읽지 않았다.

## 다음 인수 입력과 실행하지 않은 항목

E1/E3 담당이 새 타입을 채택하기 전 다음을 exact commit/interface로 확인해야 한다.

- source 진실·신청/참가자/요청 결합, 권한·lease 축소/철회·현재성 재검사와 이 모듈 사이의 원자성/CAS. 원천 상태는 모듈 반환 후 바뀔 수 있으므로 이 결과를 장기 캐시된 지급 허가로 사용하지 않는다.
- P0 decisionHash의 고정 bytes, runtime mapping, 서버 one-to-one registry와 불변 수령인, 같은현재판정 양측 인증 동의 set hash의 canonical 생성 방식. route2의 빈/부분 동의도 서버가 정확한 집합으로 기록한다.
- 원래 firstStart/procedure, 새 published/decision/consent, 재검증 횟수, contentful objection 판정, exact sourceValidUntilExclusive, 신청별 full allocation/nonce/key/epoch/domain. E1 전용 DTO→E2 snapshot의 adapter는 아직 없다.
- 최종 EIP712 type/field 순서와 window hash, profile/runtime/source-mode pins의 소비자 합의. 합의 전 이 제안의 상태를 COMMON_FROZEN으로 바꾸지 않는다.

E4에서는 single TEST token/cohort·100전액·현재 MET 수락 ledger sequence queue를 구현하고150+50을 검증한다. 배정 revision으로 의무100을 추가하지 않고 다른 예약과 accepted 권리를 보호한다. E2의 reservedBalanceAtoms는 **해당 allocation의 사용 가능한 예약액**이며 pool 전체 B를 넘기면 안 된다. 전역 B≥R≥0/O≥R 및 원자적 재배정·queue fairness는 여기서 검증하지 않았다.

수락 전 종료는 계약에서 NOT_ACCEPTED/종료 권한/유효 조건을 검사한 후 epoch·옛 승인 무효화 + 예약해제 + 의무 전이를 원자 처리해야 한다. DB stale/타이머는 대신할 수 없다. canonical accept-first이면 종료/해제 거부, terminate-first이면 옛 승인 거부, reorg는 재평가한다. accepted는 claim 만료·운영자 회수·새 서명·현재 key/epoch gate가 없다. FundingLab reclaimExpired를 가져오지 않는다.

등록·배정/승인 signer/key admin/relayer를 분리하고 terminator 권한도 명시한다. 새 persistent 격리 local EVM은 backend만 중지해도 유지되어야 한다. 현재 ephemeral **hash helper**는 그 E4/E5 운영 환경을 검증한 것이 아니다. 실제 source0/앱 양측 인증0/authorization 서명0/금고 accept·claim·지급0이며, 별도 P4의40개 향후 반례를 이 시험 통과 수에 넣지 않는다. E1/E2/E3 경계 인수 뒤 E4를 진행하며 E5 worker/복구·E6 실제 source/E2E·E7 공개 추가 목표는 후속이다.
