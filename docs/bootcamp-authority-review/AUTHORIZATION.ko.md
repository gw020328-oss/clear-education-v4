# 제한 승인 v2의 제안 경계

이 문서는 최종 EIP-712 type/ABI 또는 활성화된 signer 설정이 아니다. R2 필수 필드의 타입·위치·비교 대상과 후속 구현 결정을 구체화한다. 지급 서명·키·calldata는 만들지 않는다.

## 1. 신뢰가 끝나는 곳

source producer는 출처·참가자·요청·신선도를 검사하고, 규칙엔진은 네 조건 AND와 정확 evidence revision으로 decision을 만든다. API의 발급 transaction은 actor 권한, current decision/mapping/source trust, 같은 recipient/100 TEST/전액배정, 동일 결과의 동의 또는 승인된 기한 경로, 미해결 오류 부재를 다시 검사한다. AI는 입력 관측자이고 지급 키/함수 권한이 없다. Reclaim 증명은 이 전체 판정의 한 입력이다.

oracle 서버는 동의·이의의 사실, 원천 진실, 발급/거부·가용성을 통제한다. 잘못 서명한 유효 승인을 계약이 원문 없이 판별할 수 없고 signer 유출 시 조작된 사실이 승인될 수 있다. chain은 허용된 signer와 고정 app/recipient/amount/예약/epoch/time/중복만 검증한다. 이 잔여 신뢰를 문서·UI에서 감추지 않는다.

## 2. 최소 타입·검증 위치 제안

EIP-712 표준 도메인에 임의 `instanceId` 필드를 추가하지 않고 `salt: bytes32 = instanceId`로 표현한다. 표준은 재사용 방지를 제공하지 않으므로 소비 상태가 별도 필요하다. [EIP-712 domain 및 replay 고려사항](https://eips.ethereum.org/EIPS/eip-712#definition-of-domainseparator).

| 필드 | 제안 type/encoding | 서버·signer 비교 | 계약 비교/저장 |
| --- | --- | --- | --- |
| domain name/version | string, 새 `ClearBootcampPayment` / `2` 후보 | 배포 manifest에 pin; V4 `ClearRefund/4` 사용 금지 | 코드 상수/정확 domain separator |
| chainId | uint256; wire decimal string | 신뢰 RPC의 chain·genesis·deployment/code pin | block.chainid |
| verifyingContract | address | allowlisted 비업그레이드 TEST 계약 주소/code | address(this) |
| instanceId | bytes32 nonzero, domain salt | 환경별 고유 등록값; reset 재사용 금지 | immutable instance |
| applicationId | bytes32 nonzero opaque app key | v1 ID→동일 business enrollment의 고정 매핑; 임의 재발급 금지 | 등록된 app, recipient, lifetime settled tombstone |
| policyHash | bytes32 | **기존 P0 SHA256 의미 그대로**; 다른 hash로 재계산 금지 | 등록 target/config의 동일 bytes32 |
| runtimeMappingHash | bytes32 | current 승인된 실제 mapping과 CAS; synthetic/live 모드 분리 | allocation target의 pin; chain은 mapping 진실을 판정하지 않음 |
| decisionId | bytes32 nonzero opaque 고정 매핑 | v1 decision의 ID와 일대일 대응 | allocation target와 동일 |
| decisionRevision | uint64 > 0, decimal string | exact revision/hash/current; 안전 범위 검사 | allocation target revision과 동일 |
| decisionHash | bytes32 | 변경 없는 v1 digest; mutable projection은 제외 | allocation target와 동일, 원문 재평가는 안 함 |
| recipient | address nonzero | 신청 때 연결한 수령 지갑; sender/body의 임의 주소 금지 | 등록 app의 고정 recipient; vault/token 자체 수령인 거부 |
| token | address | 고정 TEST code/address/decimals6 | immutable token, 실제 code 정책 |
| amountAtoms | uint256, decimal string | 고정 `100000000`, float/단위혼동/범위초과 거부 | exact amount 및 allocation.amount |
| allocationId | bytes32 nonzero | **확인된** 전액예약의 ID와 target; DB 예정만으로 서명 금지 | live 예약/app/target/amount/token/recipient, 다른 승인에 소비 금지 |
| consentSetHash | bytes32 nonzero | 아래 route별 증거 집합의 canonical commitment | allocation/accepted target digest에 결합; 동의 사실을 계약이 검증했다고 하지 않음 |
| deadlinePolicyHash | bytes32 nonzero | 승인된 기한 규칙·버전, per-decision anchor/time record와 일치 | immutable deadline record와 일치; 숨겨진 기간 상수 금지 |
| eligibilityRoute | uint8, 후보 1=양측동의,2=무유효이의기한 | 승인된 경로만, UNKNOWN/UNRESOLVED 통과 금지 | 1/2 allowlist. route2 최소 eligibleAfter를 block.timestamp로 검사 |
| nonce | bytes32 nonzero | 발급 command ID에 1회 배정, 재시작/유실에도 유지 | domain 내 usedNonce→digest/app 저장. 동일 digest 재시도는 재지급 없음; 다른 body는 거부 |
| issuedAt/expiresAt | uint64, epoch초 decimal string | 실제 시계, 최대 TTL과 원천/승인 유효 상한의 min, future 거부 | issuedAt <= block.timestamp < expiresAt, TTL 상한, allocation authorizeUntil 이하 |
| signerKeyId | bytes32 nonzero | immutable key-version 식별자/목적/환경 allowlist | keyId→address/validFrom/validUntil/revoked registry. 최초 승인 때 현재 상태 검사 |
| authorizationEpoch | uint64 > 0 | 제안: **app별** epoch와 current revision CAS; global key epoch와 혼용하지 않음 | allocation/app의 current epoch와 exact match; 감소/재사용 금지 |

위 타입의 uint64는 전체 범위가 JS safe integer보다 크다. transport는 decimal string/BigInt로 처리하고 숫자 자동 변환을 피한다. v1의 숫자 필드는 v1 검증기를 거친 안전 정수만 명시 변환한다. ID 매핑은 원문/저엔트로피 계정의 무염 hash를 공개하지 않는 opaque 식별자다. recipient와 거래 금액은 지급체인에서 공개되며 개인정보 완전 비공개를 약속하지 않는다.

모든 필드 순서·primaryType·enum·domain·encoding은 다음 P4-01에서 freeze 후 JS/Solidity digest 대조로 인수한다. `abi.encodePacked`로 동적 문자열을 붙이지 않는다. 기존 v1 policy/decision hash는 bytes32로 **그대로 운반**하고, 새 typed-data digest만 EIP-712 방식으로 만든다. 최종 원문/개인 필드·인증서/계정 URL을 calldata에 넣지 않는다. 이 리뷰의 unsigned vectors는 실제 typed-data payload가 아니다.

### 기한과 동의 집합의 비어 있는 부분

`expiresAt`은 **최초 승인 등록 마감**이고 claim 만료가 아니다. route2의 eligibleAfter(이의 기한이 끝나 실행 가능해지는 시각)와 확정 권리의 claimUntil은 별도 의미다. 기존 V4의 normalSubmitAt+3/+10일을 복사하지 않는다.

권고안은 allocation이 immutable `DeadlineRecord`를 참조해 policyHash와 anchor, eligibleAfter, authorizeUntil, claimUntil을 갖는 방식이다. 서명된 allocationId/deadlinePolicyHash가 그 record와 연결되고 signer/contract가 같은 값을 검사한다. 아직 claimUntil/권리해제 정책이 OPEN이므로 실제 record 값/기본값을 만들지 않는다. record를 on-chain에 두지 않는 안이라면 이에 상응하는 signed absolute time 필드를 새 타입에 **추가**해야 한다. deadlinePolicyHash만 비교하면서 block time은 아무것도 검사하지 않는 구현은 부족하다.

route1 consentSet은 두 **서로 다른 역할의 권한 있는 actor**가 같은 decision ID/rev/hash, application, recipient, token, amount, allocation 및 기한 규칙을 확인한 immutable receipt 집합이다. 역할 순서·중복 거부·receipt version·확인시각과 권한 snapshot을 canonical encoding으로 고정한다. route2에는 없는 양측동의를 가짜로 만들지 않는다. route discriminator, 존재하는 확인, 통지/기한 anchor, 객관오류/이의 평가 snapshot을 담는 별도 tagged variant로 정의하고 그 hash를 필수 consentSetHash 슬롯에 결합할 것을 제안한다. 명칭·구조는 P3 소유자와 freeze가 필요하다. 단순 이의 접수는 자동 연장 사유가 아니지만 미평가/미해결 상태를 ‘유효이의 없음’으로 간주하지 않는다.

## 3. 권리 상태와 채굴 순서 — 권고안 B

부트캠프에는 **서명 등록(accept)과 고정 권리 실행(claim)을 분리**하는 안을 권고한다. 함수명은 제안이며 구현하지 않았다.

1. `REGISTERED`: 같은 business enrollment에 단 하나의 app key·고정 recipient/policy/amount. oracle signer가 임의 app을 등록하지 못하게 역할 분리.
2. `RESERVED`: 공용 풀에서 정확한 decision target에 100 TEST 전액 잠금. 이후 동일 결과 동의 가능. 예약만으로 지급권리는 아님.
3. `SIGNED_OFFCHAIN`: 발급 ledger 상태일 뿐 chain 권리 아님. 서명이 외부로 나갔으면 서버 삭제만으로 없애지 못함.
4. `ACCEPTED`: `acceptAuthorization`가 domain/signature/key/app epoch/예약/time/중복을 전부 검사하고 digest와 고정 수령권리를 저장. 같은 canonical chain에서 뒤의 취소는 이 권리를 바꿀 수 없음. 외부 UI의 CONFIRMED는 별도 finality 정책 이후.
5. `PAID`: any caller의 `claim(app)`이 stored recipient에게 exact TEST를 전송. 효과를 먼저 기록하고 nonReentrant/exact transfer 실패 시 전체 revert. 새 oracle 서명·현재 key/app epoch를 다시 요구하지 않음.
6. `UNRESOLVED_RESERVED`: ACCEPTED 이전 정정/취소로 app epoch를 증가시키고 기존 target 승인만 막은 상태. 자금은 예약으로 남음. 자동 해제·새 배정·수령인 교체 없음. 해제/대체 정책이 정해져야 다음 전이 가능.

### 취소 수단 비교

| 선택안 | 장점 | 부족/권리 영향 |
| --- | --- | --- |
| A: 짧은 TTL + DB stale/relayer 검사 | 구현이 단순 | 외부 서명은 TTL 동안 제3자 제출 가능. 취소가 아니므로 단독 채택 불가 |
| B: app epoch + immutable keyId/revoke + 2단계 accept/claim | 앱 정정과 키 사고를 분리, accepted 권리를 서버 중단/rotation에서 보호 | epoch 취소가 승인보다 먼저 채굴돼야 차단. 현재 확정 순서의 권리 보호를 명시 수용해야 함. 권고 |
| C: digest별 revoke 목록 | 특정 서명만 차단 | 발급했지만 기록/회수가 누락된 서명 및 재발급 전체 취소가 어려움; app epoch와 중복 상태 증가 |
| D: claim 때마다 live epoch/key 검사 또는 global pause | 나중에도 정지 가능 | 이미 확정된 권리가 서버 판단/키 교체에 따라 정지됨. R2의 기존 권리 보호와 충돌하므로 기본 채택 금지 |
| E: 승인 후 고정 challenge 기간→finalize | tentative 단계에서 오류를 처리할 시간 제공 | 새 기간·도전권자·증거/기한/최종성 정책이 필요. 서버 veto를 무기한 연장하면 독립 실행을 막음. 별도 승인 전 미도입 |

key registry는 `validFrom <= issuedAt <= block.timestamp < validUntil`과 현재 revoked 여부를 최초 accept에서 검사하는 안을 권고한다. 과거 issuedAt만 보고 폐기된 키를 허용하지 않는다. 동일 keyId를 폐기했다 다시 활성화하는 경로도 만들지 않는다.

키 rotation은 새 immutable keyId를 만들고 기존 key의 **새 accept** 허용 여부를 명시적으로 종료한다. 단순히 새 키 추가만 하면 구 키 서명은 여전히 유효하다. 선택한 activation/revocation transaction이 chain에 반영되기 전에는 취소 완료로 표시하지 않는다. keyId를 다른 주소로 덮어쓰거나 app epoch를 key rotation마다 재설정하지 않는다. 등록/폐기 관리자는 oracle 서명자와 다른 목적의 권한이어야 하며 인원·승인절차는 OPEN이다. 새 키/registry는 이 작업에서 만들지 않았다.

### canonical 채굴 순서별 결과

| 순서 | 필수 결과 (권고안 B; 아직 미구현) |
| --- | --- |
| 서명 발급 → DB만 stale → 옛 accept | chain epoch/key/시간이 그대로면 **수락 가능**. 안전하다고 주장하면 실패 |
| 정정 요청 → epoch bump 채굴 → 옛 accept | epoch mismatch 거부. 기존 예약은 유지; 새 decision에 자동 재사용 금지 |
| 옛 accept 채굴 → epoch bump/DB정정 → claim | accepted target 보존, fixed recipient claim 가능. 정정 기록이 이미 생긴 권리를 몰수하지 않음 |
| accept와 revoke가 같은 블록 | transactionIndex 순서로 결정. 요청/서명/서버 wall-clock 순서가 아님 |
| key revoke 채굴 → 그 key의 최초 accept | 거부. 새로운 keyId·nonce로도 동일 app 이중 권리는 만들 수 없음 |
| accept 채굴 → key revoke → claim | stored right 실행. revoke는 이미 저장된 권리의 회수가 아님 |
| expiresAt 도달 → 첫 accept | exclusive expiry로 거부. 만료 직전 채굴된 accept의 claim은 별도 실행기한 정책 |
| 첫 accept 성공·응답 유실 → 같은 digest 재전송 | 저장 digest 조회/동일 결과. 시간/key가 나중에 바뀌어도 이미 저장된 결과 조회는 가능; 새 권리 생성 없음 |
| 같은 app/nonce 또는 allocation에 다른 digest 제출 | 충돌 거부. 새 key·nonce·decision revision으로 tombstone 우회 불가 |
| accept/claim이 제거되는 reorg | canonical state 재구성. 사라진 tx를 확정으로 유지하지 않음. 같은 logical command/승인 재사용만 검토; 새 의무/nonce 무작정 생성 금지 |

**2단계만으로 대기기간이 생기지는 않는다.** 별도 guard가 없으면 accept 다음 transaction이 같은 블록에서 claim할 수 있다. 서버가 몇 confirmation을 기다리는 것은 any-caller claim의 on-chain 제약이 아니다. 최소 블록 지연/도전기간을 요구한다면 E안 또는 명시 실행 guard를 별도로 고정해야 하며, 확정 수는 절대적인 reorg 불가 보장도 아니다.

**결정 관문:** ‘DB 정정이 먼저 일어나면 항상 옛 승인이 무효’와 ‘이미 승인된 권리를 사후 취소하지 않음’을 비동기 체인에서 동시에 무조건 보장할 수 없다. B에서는 accept와 revoke의 canonical 순서를 수용한다. 이를 수용하지 않으면 E의 명시 challenge/finalize 규칙이 필요하다. 취소 서명/tx를 높은 gas로 보내는 것은 순서 보장이 아니다. 서버 중단 후 실행 가능성은 이미 ACCEPTED인 권리와 계약 기한/체인/토큰 가용성에 한정하며, 새 승인 획득은 계속 서버에 의존한다.

## 4. 발급과 서명 사이의 원자성 한계

DB transaction과 외부 signer/HSM·chain을 하나의 원자 transaction이라고 하지 않는다. 제안 순서는 (a) exact target/current epoch/예약을 CAS하고 nonce+unsigned command를 원자 기록 → (b) signer가 command digest/purpose/keyId를 검증해 같은 digest만 서명 → (c) 서명 저장과 outbox 연결을 원자 기록 → (d) relayer가 current 상태·chain을 다시 읽고 제출이다. (b) 이후 crash로 서명 저장에 실패해도 서명이 만들어졌을 가능성이 있으므로 ‘미발급’으로 가정해 nonce/예약을 재사용하지 않는다. command를 서명 가능 상태로 만든 뒤의 정정은 보수적으로 외부 서명 가능성을 취급한다.

승인 등록 전 필요한 원천 신선도/접근 수명은 발급 TTL 상한에 반영하고 단순 오래된 decision timestamp로 갱신하지 않는다. 한 번 ACCEPTED로 저장된 권리는 원천 lease가 나중에 만료되었다는 이유로 삭제하지 않는다. 정확한 수락 시점과 source freshness 종료의 관계를 G2에서 고정한다.

각 단계의 중복은 operationId+immutable body/digest로 복구하며 signer가 HTTP 임의 body를 서명하지 않는다. signing 목적과 native-gas relayer 키를 분리한다. relayer 유출은 native gas 소진/지연 위험이지만 고정 권리의 수령인을 바꾸지 못해야 한다. signer 유출은 사실조작 위험이므로 기존 예약/recipient와 독립 등록권한이 피해를 제한할 뿐 제거하지 않는다. unknown source·미완료 개인자료 관문을 우회하는 비상 서명 경로는 만들지 않는다.
