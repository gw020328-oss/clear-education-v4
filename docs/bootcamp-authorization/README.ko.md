# E2 unsigned 지급승인 인수

이 모듈은 승인 문서의 **서명 전 구조·해시·서버 snapshot 일치**만 검사한다. source/실제 동의/서명/체인 현재성/지급 권한을 검증하지 않는다. 모든 반환은 usableForIssuance=false, paymentAllowed=false, grant/outbox HOLD다.

## 보존된 v2 제안

`schema.mjs`, `encoding.mjs`, `UnsignedHashProbe.sol`은 R3 `733fe693f4fd2e16977b0c52ef88e35ee9687f2c` 이후 작성된 기존 미커밋 초안을 인수한 **v2 역사본**이다. 2026-10-18 TEST 정책 이전의 `claimUntil` 포함 deadline record와 G2~G6 OPEN 표시를 보존한다. 이를 새 프로필의 accepted 권리 만료나 운영 정책으로 사용하면 안 된다. 새 정책과 호환되는 후속 type은 별도 version/path로 제안하며, 공통 freeze/제품 import는 통합 인수 전 하지 않는다.

- domain name ClearBootcampPayment/version2/chainId/verifyingContract/salt(instanceId).
- `BootcampPaymentAuthorizationV2`의 필드18개, domain5개. 정확 순서는 [encoding-proposal.json](encoding-proposal.json).
- uint256/uint64/uint8은 canonical decimal string/BigInt. 0/leading zero/overflow/unsafe number/unknown field·route/null 거부. v1 revision은 명시 safe-integer 변환만.
- server-owned registrations의 kind+logicalId→opaque bytes32 일대일 매핑. browser 값으로 registry/snapshot을 만들면 이 경계를 위반한다. registry 생성·DB·영속 uniqueness는 미구현이다.
- policy/decision SHA256를 bytes32로 운반한다. EXAM nullifier 위장 또는 원문 ID의 단순 공개 hash 변환을 하지 않는다.
- deadlineRecord의 내부 target/time consistency는 실제 on-chain immutable binding 검증이 아니다. default UNCONFIGURED, target 일치도 UNSIGNED_DRAFT_BLOCKED다.
- [unsigned-example.json](unsigned-example.json)의 ID/주소/시각/75초 maxTTL은 **발명한 구 v2 검사 fixture**다. TEST 지급 TTL·실제 키·운영값으로 채택하지 않는다.

## v2 실행 근거

기존 로그 `.toolchain/bootcamp-authorization/tests-first.log`에서 전용43 + P0 20 + R2 9 = **72 PASS/0 FAIL**을 확인했다. 새 인수 시 같은 검사를 이유 없이 반복하지 않았다. JS TypedDataEncoder, 독립 literal ABI/keccak, Solidity pure helper를 기본값+모든23필드 mutation에서 대조했다. 새로운 메모리 EVM에서 pure probe 배포1건·pure eth_call72회이며 authorization signature0/payment transaction0/external RPC0이다. 임시 EVM transaction account만 메모리에서 사용했고 oracle/relayer 키·기존 사용자 키는 생성/읽지 않았다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/bootcamp-authorization/*.test.mjs tests/product-workflow/bootcamp-p0-contract.test.mjs tests/product-workflow/bootcamp-r2-contract.test.mjs
```

구 v2 helper에는 pure 함수3개만 있고 accept/claim/role/key/funding 상태는 없다. 이 EVM 시험은 새 금고 지급 시험이 아니다. 이 디렉터리의 후속 결과 문서가 새 TEST 정책 인수와 실제 미결을 별도로 기록한다.
