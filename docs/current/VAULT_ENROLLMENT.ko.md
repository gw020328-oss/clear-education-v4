# 배포 금고 설정·최종 동의·예치 확인

B1 후속: [제품 증명 세션](PROOF_SESSIONS.ko.md)은 발급/지갑 승인 때 현재 예치·grant·settled·준비금과 제출 기간을 재검증한다. 아래 schema 2 설명은 PR #8 당시 기준이며 현재 schema 3이 같은 환경의 v1/v2 상태를 보존해 이관한다. 제품 proof 수락·발급/outbox·청구 연결은 여전히 후속이다.


2026-10-12 PR #7을 최종 검토하고 develop에 병합했다. 병합 커밋은
`b1229e51b703f0eabfe230ac96460378fcc8381d`다. 신청/인증 58개 재검증,
최신 push/PR CI 3종 성공, 기준 브랜치 일치, 미해결 리뷰 대화 0건을 확인했다.
이후 최신 develop에서 `codex/vault-final-consent`를 시작했다.

## 범위

W07 금고와 W06의 최종 동의·예치를 연결했다. 여기서 **실제 설정**은
자리표시자나 요청 본문의 값이 아니라 배포된 계약에서 읽고 검증한 설정이다.
이번 검증의 배포는 매 시험 새로 만드는 메모리 내부 EVM이며 토큰은 무가치 합성 TEST다.
기존 로컬 체인·공개 체인·실제 자금·YBM 계정에는 연결하지 않았다.
합성 날짜/금액을 운영 정책으로 승인한 것이 아니며 정책 컴파일러의 SYNTHETIC/publishable=false를 유지한다.

| 상태 | 의미 |
| --- | --- |
| DRAFT | 신청 생성, 동의 전 |
| TERMS_ACCEPTED | 기존 ApplicationTermsV4 신청 조건 확인, 계약 동의 필요 |
| CONSENTED | 고정 배포/설정에 대한 새로운 TermsAcceptanceV4 동의 저장 |
| FUNDING_PENDING | 운영자의 예치 거래 준비/재시도. 거래 전송·성공 증거는 아님 |
| ENROLLED | 정확한 금고 거래·이벤트·준비금과 정규 체인 블록을 대조해 예치 확인 |

funded는 확인된 ENROLLED에서만 true이며 모든 제품 응답은 paymentAllowed=false다.
ENROLLED와 fundingEvidence는 해당 블록의 예치 기록이다. 이후 claim/reclaim·체인 변경을 추적하는
실시간 잔액/권리 상태는 아니다. 제품 proof/권한/청구 연결 전에 현재 체인 재검증과 상태 동기화가 필요하다.

## 계약과 설정 신뢰

`contracts/CourseRefundVaultV4.sol`은 새 v4 비업그레이드 계약이다. 관리자 설정 변경·수취 지갑 변경·
권한 취소·임의 출금 함수가 없다. `ClearTestToken.sol`은 고정 공급량·6 decimals·수수료/리베이스/추가 발행 없는
시험 토큰이다. 금고 생성자는 이 토큰의 정확한 runtime code hash만 허용한다.
일반 ERC-20/가치 있는 토큰 호환성을 주장하지 않는다.

RuntimeConfig에는 configVersion=4, instanceId, cohortId, policyHash, token, sponsor, issuer,
outageSigner, amount, enrollmentStart/Until, normalSubmitFrom/At, supplementEndAt, claimUntil을 저장한다.
cohortId는 정책 cohortId 문자열의 ethers.id(UTF-8 keccak256)다.
장애 확인 권한도 바뀔 수 없도록 설계 스냅샷의 필드에 outageSigner를 추가하여 해시에 포함했다.
runtimeConfigHash는 필드 순서를 고정한 `keccak256(abi.encode(RuntimeConfig))`다.
T+3일·T+10일 관계를 생성자에서 검사한다. issuer/outageSigner 키 보관·릴리스 승인은 후속 운영 범위다.

`buildVault()`는 고정 solc 0.8.30, optimizer runs=200, EVM shanghai로 메모리에서 컴파일한다.
소스·컴파일 설정이 바뀌면 코드 지문도 달라지므로 다른 금고를 기존 것으로 인정하지 않는다.
`createVaultReader(provider, pin)`의 provider와 pin은 서버 신뢰 설정으로만 받는다.
chainId/genesisHash/vaultAddress/deploymentTxHash를 고정하고 다음을 확인한다.

- 배포 receipt 성공/주소/정규 블록, 금고·토큰 runtime bytecode hash
- 온체인 RuntimeConfig와 해시, 6 decimals, ClearRefund domain separator
- 읽기 시작/끝의 블록 hash 일치

요청자가 RPC URL·계약 주소·임의 설정을 제출하는 경로는 없다. 바인딩 시 서비스 환경 chain/instance,
정책 hash/cohort/amount/전체 기간/decimals, 로그인 운영자와 온체인 sponsor 일치를 검사한다.
한 cohort는 하나의 불변 runtime만 연결하며 이후 해당 cohort의 다른 정책 버전 등록도 막는다.
다른 배포를 같은 cohort에 덮어써 중복 범위를 초기화하지 않는다.
판정은 **신뢰하는 로컬 RPC**를 전제로 한다. 악성 RPC의 모든 응답 조작에 대한 독립 합의 증명은 아니다.

## 최종 동의와 저장

EIP-712 domain은 ClearRefund/version 4/chainId/verifyingContract/salt(instanceId)다.
TermsAcceptanceV4는 applicationId, learner, policyHash, runtimeConfigHash, nonce, signedAt, expiresAt을 결합한다.
Solidity digest와 ethers 인코딩의 일치를 시험한다. 로그인 서명과 기존 ApplicationTermsV4는 재사용할 수 없다.
EOA의 65-byte, low-S 서명만 지원하며 스마트 계정은 후속이다.

본인·로그인 세션·신청에 연결한 일회 challenge는 최대 600초이며 등록 종료+1초로 제한한다.
서명/nonce 확인·CONSENTED 기록은 한 DB transaction에서 수행한다.
동일 제출은 멱등 반환하며 다른 최종 서명은 기존 동의를 덮어쓰지 못한다.
`walletClient.finalConsent(applicationId, reviewedRuntime)`는 먼저 화면에서 확인한 전체 배포 설정을 받고,
서버 challenge의 runtime/domain/정책/수취인/타입을 대조한 뒤 서명한다.
서명 중 계정·체인 변경 시 제출을 폐기한다. 실제 확장 지갑/사용자 화면 검증은 아직 아니다.

DB schema 2는 이전 schema 1의 세션·신청·신청 동의 digest를 보존하며 추가 테이블을 원자적으로 생성한다.
다른 환경이나 알 수 없는 schema version은 거부한다. 서비스 중지 후 버전을 전환해야 하며
구버전/신버전 서버를 같은 DB에 혼합 운영하지 않는다.
기존 정책·신청 identity와 신규 runtime 불변 제약, 신청별 funding PK, SQLite IMMEDIATE transaction을 사용한다.
네트워크 대기는 transaction 밖에서 수행하고 재진입 시 세션·역할·동의 digest를 다시 검사한다.

예치 거래를 재시작 후 복원하려면 **최종 계약 typed payload와 최종 서명**이 필요하므로 이 둘을 DB에 보존한다.
이것은 PR #7의 신청 동의 digest-only 저장과 의도적으로 다르다. 로그인/신청 조건 서명,
개인키·원본 proof·쿠키는 DB에 보존하지 않는다. 최종 서명은 sponsor만 실행 가능하고
정책/지갑/금고/금액/만료가 제한된 권한이며 공개 예치 거래에도 포함된다.
일반 신청 응답에는 최종 서명을 넣지 않고 sponsor의 거래 준비 응답에만 calldata로 제공한다.
DB는 전용 0700 디렉터리/0600 파일 경계를 유지한다. 암호화·백업·최종 마감+30일 삭제 운영은 후속이다.

## 예치와 복구

1. 운영자 sponsor가 token/spender/정확한 amount를 확인하고 자신의 지갑에서 allowance를 승인한다.
2. funding-intent가 고정 금고의 enrollAndFund calldata를 반환한다. API는 지갑 키나 송신 권한을 가지지 않는다.
3. sponsor 지갑이 거래를 보내고 transactionHash를 funding-confirmation에 제출한다.
4. 서비스는 정규 receipt 성공, sender/to/value/calldata, Enrolled와 정확한 Transfer 이벤트,
   해당 블록의 learner/consentDigest/미정산 등록, balance>=totalReserved를 확인하고 ENROLLED를 기록한다.

서버는 거래를 자동 전송하지 않는다. 운영자 확장 지갑의 승인/송신 UI는 후속이며 합성 시험은 메모리 signer로 수행한다.
무승인 allowance·잔액 부족·revert·미채굴·다른 신청 거래·토큰 단순 송금은 ENROLLED로 승격하지 않는다.
계약은 수취 지갑과 applicationId/nonce를 고정하고 등록+전액 이체가 한 거래에서 성공해야 한다.
실패 시 nonce·등록·준비금도 되돌린다. 실패한 예치는 남은 동의 유효기간 내 동일 거래로 재시도할 수 있다.

거래 성공 후 DB 기록 전에 서버가 중단되어도 지갑의 같은 transactionHash로 확인을 다시 요청한다.
그 hash는 운영자 지갑 기록에서 복원해야 하며 현재 자동 이벤트 검색/송신 outbox는 없다.
미예치 동의가 만료된 경우 서버 시각뿐 아니라 체인 시각도 만료 이후이고 해당 application의
등록이 없음을 읽은 뒤 새 challenge를 발급한다. 이전 최종 권한과 미소비 challenge를 교체한다.
이미 채굴된 예치는 갱신으로 지우지 않고 FUNDING_RECOVERY_REQUIRED로 기존 거래 확인을 요구한다.
확인 시 블록 hash를 재검사하지만 공개 체인 finality/지속 reorg 감시를 구현한 것은 아니다.

## 계약 내부의 권리 보존

예치만 가능하고 출금 경로가 없는 불완전한 금고를 만들지 않도록 W07 기본 권리 함수도 포함했다.
issuer의 EligibilityGrantV4는 설정·수취인·금액·기한·grantId·시험 nullifier를 결합한다.
한 신청의 최초 digest를 고정하고 동일 digest 재전달만 허용한다. grantId 및 같은 금고의 시험 nullifier 재사용을 막는다.
정상 구간에서 verifiedAt/issueBy를 검사하고, 고정 outageSigner가 정상 제출 기간 내 발생을 서명한 경우에만
T+3일까지 보완 권한 발급을 허용한다. T+10 시각에는 고정 learner만 지급 수취인이며 누구나 relay할 수 있다.
T+10 이후 sponsor 회수만 가능하고 지급·회수는 신청별 단회, 준비금 감소와 정확한 이체가 원자적이다.

이 함수들은 **합성 서명으로만 계약 단위 검증**했다. 실제 proof → 자격 판정 → 반별 HMAC nullifier →
영속 발급/outbox → 독립 청구 패킷/클라이언트는 연결하지 않았다. issuer 서명 생성 API도 추가하지 않았다.
따라서 계약 시험 통과를 제품 환급·독립 청구 완료로 보고하지 않는다.

## API 추가

기존 HTTPS/Origin/Host/세션/CSRF와 고정 오류 응답 경계를 유지한다.

| 경로 | 권한·입력 |
| --- | --- |
| POST /runtimes | sponsor 운영자, {policyHash}; 온체인 설정 바인딩 |
| GET /runtimes/:policyHash | 인증 사용자, 고정 설정 읽기 |
| POST /applications/:id/final-consent-challenge | 본인 참가자, 빈 객체 |
| POST /applications/:id/final-consent | 본인 참가자, {nonce, signature} |
| POST /applications/:id/funding-intent | sponsor 운영자, 빈 객체 |
| POST /applications/:id/funding-confirmation | sponsor 운영자, {transactionHash} |

## 검증 및 다음 경계

`./tools/npm run test:vault`는 새로 배포한 메모리 체인·합성 토큰·무작위 임시 EOA와 임시 DB만 사용한다.
금고/서비스/지갑/HTTP/변조 RPC·재시작·만료/등록/청구/회수 경계 **78개**가 통과했다.
고정 Ganache의 Node 24용 native uWS 부재 안내는 JS fallback이며 시험 skip으로 처리하지 않았다.
기존 577개를 포함한 **총 655개(실패/skip 0개)**와 workspace/local/dependencies 검사가 모두 통과했다.
원본/legacy 191파일과 고정 의존성 그래프를 보존했다. 원격 CI 최종 결과는 새 PR Checks를 따른다.

담당자 자체 검토에서 만료 동의 갱신, 채굴 후 DB 복구, RPC 대기 후 재인증,
동일 cohort의 정책/금고 교체 방지, 최종 서명 저장 경계, 거래·이벤트·준비금 검증을 확인했다.
독립 외부 보안 감사를 받은 계약은 아니다. 새 PR은 develop 대상이며 자동 병합하지 않는다.

다음은 W08 제품 proof 세션과 영속 nonce/검증 필드 전달, W09 반별 시험 중복·발급 outbox다.
실제 날짜/금액 승인, 운영 배포 지문과 release 서명, 실제 지갑 UI·proof/청구 연결이 준비된 뒤
새 제품 문맥의 실제 동의·예치·YBM 실행으로 진행한다. pending manifest는 그대로 unusableForClaim이다.

- [EIP-712](https://eips.ethereum.org/EIPS/eip-712): domain 분리와 typed struct 인코딩.
- [Solidity 0.8.30 security considerations](https://docs.soliditylang.org/en/v0.8.30/security-considerations.html): 외부 호출과 상태 변경 경계 검토 기준.
