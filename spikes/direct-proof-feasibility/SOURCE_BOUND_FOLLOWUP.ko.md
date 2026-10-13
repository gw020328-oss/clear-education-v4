# 동일 시험 결합·안정 nullifier 후속

후속: [공식 attestor 소스 확장 통합 시험](ATTESTOR_EXTENSION.ko.md)에서 로컬 TLS 원천부터 native OPRF·attestor 서명까지 연결했다. 아래는 그 전 단계의 결과와 키/정규화 신뢰 가정이다. 공식 hosted 배포·실제 YBM은 여전히 미검증이다.

2026-10-13. 최신 develop `77d1c4b`(PR #27까지)를 `f75c5b9`로 반영했다. **합성 검증과 로컬 OPRF 구현은 전진했지만, 실제 공식 증명으로 두 문제를 해결한 상태는 아니다. 제품 NO-GO를 유지한다.** 기존 반례 보고서와 `BoundedAdapter.sol`은 당시 한계를 재현하는 자료로 보존한다.

## 문제별 결과

| 문제 | 이번 구현·확인 | 아직 해결하지 못한 부분 |
| --- | --- | --- |
| 같은 시험의 날짜·번호·점수 결합 | SDK `responseMatches`가 가림 없는 연속 행 접두부를 요구한다. 원래 행 혼합 반례, 두 행의 핵심 셀 공개 조합 256개, 경계 가림 147개를 거부했다. attestor 확장 모형은 원본 전체 DOM의 실제 행 시작 위치와 일치하는 바이트만 읽고 해시 치환 영역과 겹치면 거부한다. | 고정된 합성 HTML 형식만 시험했다. 순수 HTTP regex만으로 임의 HTML 문맥·OPRF 치환 출처를 전부 증명하지 못한다. 실제 YBM TLS와 공식 attestor가 확장 검사를 수행했다는 서명이 없다. |
| 동일 시험의 안정 nullifier | 공식 gnark native 구현으로 정규 시험 ID의 사업별 OPRF를 실제 계산했다. 새 blinding, 다른 지갑/신청·선택 메타데이터·점수/공백 변경에서 동일값, 다른 사업/시험에서 다른값을 확인했다. 전체 필드 원소를 32바이트로 인코딩하고 키가 바뀌면 거부한다. | 정규 ID가 실제 원본에 속한다는 공식 증명과 OPRF 계산의 결합이 없다. 공개값이 없는 로컬 정규화 입력은 stock HTTP TOPRF 회로의 TLS 원문 substring이 아니다. 공식 서버의 확장 배포·키 pin/운영·재발급/회전 검증이 필요하다. |

`record-policy.mjs`는 **공식 attestor 내부에 들어갈 수 있는 확장 원형**이다. TLS verifier가 아니며 클라이언트의 body/metadata/context를 받는 제품 API로 사용하면 안 된다. 입력이 실제 인증된 원문이라는 신뢰는 외부 의존성으로 남아 있다. `assertStockClaimUsableForDirectClaim`은 항상 BLOCKED로 거부하며 기존 금고/collector/API를 바꾸지 않았다.

## 왜 파서만 고치지 않았는가

기존 XPath는 클라이언트가 만들 공개 범위를 정할 뿐 검증자가 그 행 선택을 강제하지 않았다. 새 후보는 검증자가 검사하는 패턴에 `<tr>`부터 종류·날짜·번호·점수까지의 구조를 직접 넣고, 그 사이 `*`나 임의 `.*`를 허용하지 않는다. 비공개 값은 capture하지 않는다.

SDK 5.1.4는 이전 client version의 검증에서 연속 `***`를 삭제하는 경로도 갖는다. 그러면 구조 패턴을 써도 삭제된 행 경계를 건너붙일 수 있다. 새 후보는 별도의 `***` 존재 조건을 정책에 포함한다. 그 조건을 제거한 시험에서는 옛 버전에서 행 혼합 수락을 재현했고, 조건이 있으면 정상/공격 모두 이전 경로에서 거부된다. 이는 구버전 지원이 아니라 보수적 차단이다. 이 조건은 원문·해시 치환의 출처 검사를 대신하지 않는다.

전체 원문을 받는 확장 원형은 parse5의 실제 행 시작 위치와 원문 바이트를 대조해 주석/스크립트 속 행 모양 문자열을 거부한다. 변환 범위는 TLS/OPRF 검증기가 전달해야 하며 사용자 제공 빈 배열을 믿으면 안 된다. 반환 fact는 원문 날짜·번호·점수·이름을 포함하지 않는다. **attestor는 해당 원문을 본다.** attestor에게도 원문을 숨기는 요구까지 충족하려면 별도의 비공개 의미 검증 회로가 필요하다.

## 재사용 금지 범위와 키 정책

제안하는 범위는 **동일 사업 프로그램 안에서 같은 시험 한 번**이다. 여러 신청/지갑/발급시각/증명 입력으로 다시 쓰는 것을 막고, 서로 다른 정당한 프로그램까지 전역으로 막지는 않는다. 제품 정책 변경 승인이 아니다.

1. 정규 시험 ID 후보는 `YBM_TOEIC_EXAM_V1 + 원문 날짜 + 원문 수험번호 문자열`이다. 지갑·신청·score·row index·임의 salt·발급시각을 넣지 않는다. 숫자로 변환해 선행 0을 버리지 않는다. 실제 YBM에서 날짜+번호가 유일하고 재발급에도 같은지 아직 확인해야 한다. 접수 증명과의 관계·등록 상태·취소도 별도 관문이다.
2. 배포 설정의 256bit businessScope와 정규 ID를 고정 형식으로 비공개 SHA256 전처리한 32바이트를 OPRF 입력으로 넣는다. domain은 `CLEAR_EXAM_REUSE_V1`이다. gnark domain 길이 상한 31바이트 때문에 사업 scope를 domain 문자열에 직접 붙이지 않는다. **중간 SHA256은 공개하지 않으며 nullifier로 쓰지 않는다.** 공개값은 실제 keyed OPRF 전체 출력이다. 입력·키를 임의로 고르는 참가자 callback은 허용하지 않는다.
3. 확장 evaluator의 scope/key/operator는 배포 설정에 고정한다. stock SDK의 짧은 `binaryHashToStr` 값에 재해시/0-padding한 것을 받지 않는다. native big.Int의 선행 0만 복원하는 정수 직렬화는 이와 다르며 출력의 엔트로피를 늘렸다고 주장하지 않는다.
4. 사업이 끝날 때까지 OPRF 키를 고정한다. 서명 witness 키의 변경과 OPRF 키 변경은 별개다. 키 교체는 같은 시험에 다른 nullifier를 만드는 것이 실측됐으므로 자동 수락하지 않는다. 키 손실/폐기는 신규 청구를 차단한다. 회전하려면 기존 spent 상태와 새 식별자의 관계를 검증하는 별도 이관 증명이 필요하다.
5. 온체인 연결 시 동일 사업의 모든 adapter는 하나의 영속 spent registry를 사용해야 한다. 새 계약을 배포해 spent를 초기화하거나 key ID별 새 namespace를 열면 우회된다. 프로그램 scope/key/sourcePolicy는 신청자가 선택한 context에서 읽지 않고 예치/배포 정책과 대조한다. 이 registry/새 지급 계약은 이번 구현에 포함하지 않았다.

## 실제 native OPRF 관찰과 추가 차단 조건

`oprf-native-check.mjs`는 SDK 5.1.6이 지정한 upstream commit `394f777fa404ef184652b6efc5aa60884dd55c7e`의 Mac arm64 바이너리·리소스 4개를 Git blob 지문으로 검사하고 독립 임시 폴더에서 실행한다. 설치된 collector 패키지는 수정하지 않는다. 매번 임시 1-of-2 키를 메모리에서 만들고 한 share만 사용하며 키/입력/출력은 보고서에 쓰지 않는다. 분산 threshold 신뢰성을 검증한 시험은 아니다. 원본 report에 아티팩트 SHA256도 기록했다.

**고정 바이너리의 `finaliseOPRF`에 서로 다른 키의 정상 응답과 기대 public key를 넣어도 거부되지 않는 관찰**이 나왔다. 같은 commit의 [Go 소스](https://github.com/reclaimprotocol/zk-symmetric-crypto/blob/394f777fa404ef184652b6efc5aa60884dd55c7e/gnark/utils/toprf.go)는 share 공개키 재구성 대조를 갖는다. 이 소스와 배포 바이너리의 관찰 차이는 해결되지 않았다. 모든 배포 버전의 취약성을 확인했다거나 공식 attestor 증명을 위조했다는 뜻은 아니다. 원형에는 native 호출 전 공개 share와 고정 공개키의 바이트 일치를 검사하는 **threshold=1 전용** 방어를 넣었다. 일반 threshold 모드, DLEQ/회로 전체 보안 감사, 재현 가능한 바이너리 빌드는 남아 있다.

현재 SDK의 일반 TOPRF는 [`reclaim-toprf` domain과 attestor init 공개키](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/client/create-claim.ts)를 사용한다. STWO default TOPRF maker는 없으며 native gnark는 이번 Mac 실험에서 준비해 실행했다. 과거 `NATIVE_LIBRARY_NOT_PACKAGED` 관찰을 이번 성공으로 덮어쓰지 않는다. Windows native 성공도 아니다.

`oprf-raw`라는 서버 측 계산 경로도 [실제 소스에 있다](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/oprf-raw.ts). 그러나 [검증 흐름](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/assert-valid-claim-request.ts)은 caller marker의 위치를 처리하고 입력 길이만큼 출력 문자열을 잘라 바꾼 뒤 provider 검사를 한다. 정규 시험 선택·사업 범위·전체 출력·키 fingerprint 결합을 자동 제공하는 YBM 전용 확장이 아니다. 공식 hosted attestor의 해당 기능/키 설정 가용성은 이번에 호출해 확인하지 않았다. [공식 TOPRF 설명](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/docs/claim-creation.md)은 일관된 은닉값의 목적이며 이 적용 경로의 실증을 대신하지 않는다.

## 검증 범위

| 계층 | 결과 |
| --- | --- |
| 합성 원문·공격적 가림·scope/key/출력 검사 | `record-policy.test.mjs` 17개 PASS. 197개 점수, 256개 공개 조합, 147개 경계 가림을 포함 |
| 설치 SDK의 실제 HTTP provider 검사 | 위 시험에 포함. 클라이언트 XPath만 검사한 것이 아니며 원래 공격 receipt를 검증 함수에 직접 입력 |
| 공식 native OPRF 계산 | Mac arm64 9개 기대 관찰 PASS. 키 불일치 미거부 반례가 포함되므로 안전성 9개 PASS로 읽지 않음 |
| 실제 YBM TLS·공식 새 attestor 서명 | NOT_RUN |
| TLS 암호문→정규 ID→사업 OPRF 관계의 ZK 회로 | NOT_IMPLEMENTED; native OPRF 계산 성공과 구분 |
| 새 fact의 온체인 검증/중복 registry/지급 | NOT_RUN / NOT_IMPLEMENTED |
| 기존 Windows 전달 파일 | `f13df04` ZIP/SHA256/source manifest와 소스 대응 보존. 다시 생성하지 않음 |

develop 동기화 회귀는 학습 증거 131개, 지갑 proof 승인 63개, `verify:workspace` PASS였다. 새 provider 회귀를 공개 합성 CI에 추가했으며 실제 CI 상태는 PR checks를 따른다.

재현:

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test spikes/direct-proof-feasibility/record-policy.test.mjs
# 선택: Mac arm64. 고정 공개 native 자료 약 35MB 다운로드, 합성 키/자료만 사용.
./tools/node spikes/direct-proof-feasibility/oprf-native-check.mjs
```

## 공유 코드 통합 전 제안 인터페이스와 다음 조건

공통 collector/API를 변경하지 않았다. 통합 전에 공식 attestor 확장 또는 별도 검증 회로가 다음을 **서버에서 계산해 서명/증명한 출력**으로 제공해야 한다: `sourcePolicy`, `businessScope`, `keyFingerprint`, 고정 길이 `nullifier`, 조건 충족, 신청/owner/수취인 binding, 신선도. 클라이언트 context 값을 재서명하는 것으로 대체하면 안 된다. 현재 반환 fact에는 신청/owner/수취인 binding·서명조차 없으므로 그대로 청구할 수 없다.

가장 작은 외부 의존 경로는 공식 attestor의 TLS 인증 뒤 **치환 전 원문**에서 선택/정규화/조건을 검증하고 고정 키 OPRF 전체값을 계산하는 확장이다. 공식 운영자가 이 기능을 제공해야 하며 CLEAR가 새로운 필수 지급 서명자가 되는 안은 채택하지 않았다. attestor가 원문을 보는 것이 허용되지 않으면 TLS 원문 바이트·같은 레코드·조건·정규화·고정 OPRF 키를 함께 검증하는 새 회로/공식 지원이 필요하다.

두 경로 모두 실제 새 증명에서 원문이 public params/context/calldata에 없는지, 재발급·다른 지갑·선택 입력·키 변경·같은/다른 사업을 검사한 뒤 정확한 공식 verifier ABI로 read-only 검증부터 해야 한다. 기존 800점 AND 80%/최고점·전체 목록 정책, 학습 원천, 독립 수집, 금고 이전/동의 관문도 남아 있다.

해커톤 내 현재 가능한 대안은 **실제 지급과 분리한 합성 시연**이다. native OPRF와 공격 거부를 보여주고 공식 증명/온체인 항목을 미구현으로 표시한다. 기존 issuer 방식이나 공개 성적·단순 hash로 몰래 대체하지 않는다. 실제 제품 전환은 외부 지원이 확인되기 전에는 일정 확약이 불가능하다.
