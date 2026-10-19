# E4 별도 TEST 실행 계약 — 컴파일·기본 차단 준비

2026-10-19. **컴파일·ABI·음성/기본 차단 모듈 검사만 완료했다. 실행 계약 배포, 유효 지급승인 서명, accept/claim 양성 실행은 모두0이다.** 권장/요청 설정은 Astra / High이며 실제 런타임 모델 ID를 독립 확인하지 않았다.

PR88 `d287b3789a678a1e6984b583e4c85859e9e97a22`의 준비 계약·artifact·50개 시험·CI6/6 근거는 변경하지 않았다. 새 브랜치는 `codex/hackathon-test-execution-preparation`이며 E3 PR89의 `fb9e6d3a9f35c8d12b80f0c84e01d8a6db9aeda1`을 `b58ab767e2c80050fcbfddf1505ea0e458be2cd9`로 정상 merge했다. 이 commit은 **자료/코드 인수 pin**이다. E3 전체 경계의 최종 수락 pin은 아직 null이며, 코디네이터가 정확한 head를 명시하기 전에는 활성화하지 않는다. E3 CI의 Mac supervisor 후속은 다른 소유자 범위다.

직접 변경은 새 `src/hackathon-test-vault` 실행 소스2개, 새 `tests/hackathon-test-vault` 준비 시험/빌더, 이 전용 문서들에 한정된다. E3 공통 API/DB/CI 등은 이력 merge로 들어온 파일이며 E4가 직접 수정하지 않았다. 기존 준비 source/reader/build/50개 시험과 E2 .3를 그대로 보존하려고 별도 실행 class로 분기했다. 같은 준비 bytecode의 activation 스위치·상속 upgrade가 아니다.

## 소스 구현과 미실행 경계

`HackathonTestVaultExecution.sol`은 새 deployment/runtime/instance를 요구하는 후보 코드다. 이번 단계에서는 배포하지 않았다. [컴파일 artifact](execution-artifact.json)의 runtimeTemplateHash는 immutable 설정을 채우기 전 값이며 실제 deployed code hash가 아니다.

- 기존 고정 ClearTestToken의 exact runtime code·100000000 atoms/decimals6, P0 policy/profile, 고정 recipient·한 allocation/의무, 150+50 전액 예약 회계와 역할 분리를 유지한다. registrar, signer, key-admin, relayer, depositor, terminator는 분리한다. 새 키 주소/ID 재사용 및 폐기 tombstone은 그대로다.
- `accept(op,message,signature,expectedVersion)`은 relayer만 제출한다. registrar가 이미 등록·전액 예약·공개·동의 결합하고 **같은24필드 전체 digest를 prepare**한 현재 target만 가능하다. 최신 chain version, current MET, source cutoff, 이의/새 오류, epoch, key/revoke, nonce 미소비, fixed recipient/token/100/allocation, 원래600, issued/expiry, route1 양측 동의 또는 route2 공개 후120초를 다시 검사한다. strict65-byte/low-s/v27·28/nonzero recovery 후 등록 signer를 대조한다.
- 최초 수락은 nonce 소비+고정 AcceptedRight 저장+ACCEPTED 전이를 한 transaction에서 수행한다. R/O/B는 수락만으로 변하지 않는다. 실패 시 전체 rollback되며 signing은 nonce를 소비하지 않는다.
- `claim(applicationId)`는 누구나 제출하고 저장된 recipient/token/100만 사용한다. 현재 key/revoke/pause/source/epoch/새 서명/최초 accept expiry를 읽지 않는다. ACCEPTED→SETTLED와 B/R/O 각각100 감소 뒤 exact token 전송을 확인하며 실패는 전체 rollback이다. 재진입 guard·SETTLED tombstone으로 중복 지급을 차단하도록 구현했다. 이 동작은 **소스/컴파일 검토 상태**이며 실제 전송 성공을 주장하지 않는다.
- `_mutable`은 QUEUED/RESERVED/REVIEW만 허용한다. accepted-first 이후 정정/종료는 권리를 바꾸지 못한다. terminate-first는 옛 준비물/epoch를 무효화한다. terminator는 기존3조건(원래cap 경과, 1회 재검증 뒤 새 유효 오류, cap 경과+source 미갱신)만 사용한다. 단순 취소·재원 대기·임의 reason/receipt는 종료 권한이 아니다.
- withdraw/upgrade/recipient 변경/claim expiry 설정/activation 함수는 없다. claim은 서명 인수를 받지 않는다. source·동의 사실은 인증된 내부 controller assertion이며 온체인 hash/event가 원천이나 앱 인증을 대신하지 않는다. deadline canonical SHA 계산은 E2/E3 책임이고 registrar의 exact prepared digest와 명시 시간 필드 재검사가 계약 경계다.

## signer adapter가 실제로 하는 일

`execution-signer.mjs`는 **운영 signer 구현이 아니다.** `createExecutionSignerAdapter().sign()`은 항상 BLOCKED를 반환하며 설정·callback·keyProvider 속성/getter까지 읽지 않는다. 호출자가 enabled/verified/E3 승인 플래그나 receiptHash를 주어도 서명 경로가 없다. 현재 단계의 외부 설정으로 차단을 해제할 수 없다.

별도 `auditExecutionCandidate`는 E3 예제와 가상의 chain 관측 사본을 대조하는 순수 검사다. 맞아도 `BLOCKED / UNSIGNED_SYNTHETIC_CONSISTENCY_ONLY`이며 signing authority/chain authentication이 아니다. 다음 불일치를 거부한다.

- E1/E2/E3 source pin, 필수 E3 내부 revision/ledgerSequence/snapshot CAS 및 재계산한 current commitment
- E3 단일 durable registry의 등록 app/decision/allocation opaque ID와 logical target·수취인·금액·source·decision 수락 sequence
- 고정 E2 inspector의 current state/sourceWindow/lease·기한·현재 key/nonce/epoch·이의·동의 검사
- canonical 동의 scope/set의 정확 field/type/order/hash. scope의 decisionRevision은 E3 실제 코드대로 decimal string, 시각은 safe JSON number다. nonce/issued/expires/deadlineHash를 scope에 추가하지 않아 순환을 막는다.
- 가상 runtime의 chain/genesis/deployed code/token code/instance/domain/type/role/선택 signer pin, exact checkpoint+app version, 등록·확인 배정·prepared digest/nonce·현재 상태/계정 회계

E3 저장 inspection의 `verified` 플래그는 권한으로 쓰지 않고 E2 검사를 새로 실행한다. 임의 hash의 형식 일치는 source/authentication 증거가 아니다. 이 감사 입력을 받는 HTTP 경로는 만들지 않았다. 실제 E3 내부 capability 조회→최종 내부 CAS 재검사→키 제공자 호출→서명 결과 검증/폐기 lifecycle은 최종 인수 이후 구현·양성 검증해야 한다. 현재 callback이나 키 제공자가 없는 차단을 완료된 signer로 보고하지 않는다.

## E3 등록 순서와 E5 연결

E3 `registerCurrentMetForE4`/`inspectRegistrationForE4`가 publication 전 durable opaque ID를 발급한다. E4는 registry를 만들거나 복제하지 않는다. 등록→전액 배정→publication→startReview→현재 동의 commitment 결합→E3 unsigned 준비→chain exact digest 준비→최종 E3/chain 재검사 순서가 필요하다. 같은 판정 ID에 새 revision/hash를 쓰는 정정도 같은 app/allocation/100/R/O와 원래 firstStart를 보존한다.

publication의 allocationVersion은 **동의 scope baseline**이다. 이후 startReview/bindConsents/observe/prepare로 올라간 최신 chain CAS와 같을 필요는 없다. 감사기는 최신 chain version이 baseline 이상이고 별도의 expected latest chain CAS와 정확히 같은지 확인한다. 준비된 E3 payload의 epoch와 chain epoch는 정확히 같아야 하므로 epoch를 증가시키는 관측/동의 결합은 unsigned 발급 전에 완료해야 한다. `prepareUnsigned`는 version만 증가시키며, E3 내부 snapshot CAS는 그 최신 확인 checkpoint를 반영한 조회로 다시 잡는다. 이 준비 코드가 비동기 RPC와 동기 E3 snapshot을 이미 연결한 것은 아니다.

E5는 별도 실제 reader에서 canonical block/tx/log·등록/전액 배정·app version/epoch·key/nonce를 확인하고, 비동기 RPC 결과를 DB transaction 밖에서 준비한 뒤 인증된 동기 snapshot과 CAS를 공급해야 한다. PR88 `reader.mjs`는 준비 runtime 전용으로 유지한다. 실행 runtime reader, reorg/receipt 복구, outbox, persistent chain/backend-stop direct claim은 아직 없다.

## 필요한 실제 runtime pin

현재 [artifact](execution-artifact.json)의 `runtimePin=null`이다. 다음 값은 후속 승인된 새 deployment에서 실측해야 하며 예제 hash를 사용하면 안 된다.

| 분류 | 필요한 pin/관측 |
| --- | --- |
| 이행 인수 | E1/E2와 최종 승인된 E3 exact head, E4 실행 소스/artifact exact head |
| 체인/배포 | chainId, genesisHash, 새 vault address, 실제 deployed code hash, 배포 tx/canonical checkpoint, 새 instance/domain salt |
| 자산/정책 | 고정 TEST token address·exact code hash·decimals6, P0 policy, runtimeMappingHash, operations profile |
| 서명/역할 | registrar/signer/key-admin/relayer/depositor/terminator 분리, 선택 keyId→정확 signer 주소·active/revoked, .3 domainSeparator/typeHash |
| 매 요청 | E3 source/current/동의/이의/등록의 인증된 내부 CAS, chain latest checkpoint+app version, stable allocation100, prepared digest, nonce available, key/epoch/pause |

EIP-170 runtime **24,080 / 24,576바이트**(여유496). creation26,870 + constructor320 = **initcode27,190 / 49,152바이트**. solc0.8.30, optimizer200, Shanghai, viaIR/무제한 contract-size 우회 없음. compiler warning0. 남은 크기 여유가 작으므로 후속 변경에서도 정상 한도 검사를 유지한다.

## 검증·리뷰·미실행 계획

이번 새 시험은 **66 PASS / 0 FAIL**: 컴파일/ABI/artifact/기존 지문 보존6 + signer 기본 차단/음성·unsigned 일관성60. 유효 signer/signature 양성 대조가 아니다. PR88의50개를 합산하지 않는다. 새 테스트는 전용 폴더에서 명시 실행하며 공통 CI/workflow/기존 진입점은 직접 수정하지 않았다. 원격 CI 통과를 이66개 실행 근거로 대신하지 않는다.

최초 signer 시험은 scope.decisionRevision의 실제 문자열 형식을 number로 잘못 가정해 후속 검사가 가려졌다(31 PASS/29 FAIL). E3 source/예제의 exact type으로 고쳤고, 앞단 shape/accepted-right 거부 코드2개의 기대값도 실제 경계에 맞췄다. 재실행60 PASS, 최종 compile와 통합한66 PASS를 기록했다. 실패 이력을 지급 동작 실패로 세지 않는다.

직접 소스 리뷰에서 accept의 relayer/CAS/현재성/정확 digest/strict signature/nonce 순서, claim의 저장 권리·현재 조건 독립성과 effects-before-transfer/rollback, 미수락 종료와 역할 분리를 대조했다. 컴파일 AST/ABI 검사는 wire·호출 경계의 정적 증거이고 금고 동작 테스트나 독립 보안 감사가 아니다.

[양성 시험 계획](execution-positive-plan.json)은 모두 NOT_RUN이다. E3 최종 정확 인수 head를 전달받기 전에는 실행하지 않는다. 실행 계약 EVM 배포0, 지급 .3 서명0, 유효 signer 양성0, accept0, claim0, 새 persistent chain0, 외부 RPC0, 실제 source0, 키 읽기0이다. 개인 계정·과거 proof·.env를 읽지 않았다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/hackathon-test-vault/execution-compile.test.mjs tests/hackathon-test-vault/execution-signer.test.mjs
./tools/node tests/hackathon-test-vault/execution-artifact.mjs --write
```
