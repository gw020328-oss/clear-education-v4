# 표준 Reclaim 비공개 전체 표 wrapper — 격리 실험

2026-10-16. 이슈 #68. 기준 develop `4756589659a40c8f8fe45452a698b8a56487628c`(PR67). PR66은 M1 그래프/ABI/L1 가용성 경계 조사였고 최종 `580a99a`의 CI는 모두 PASS다. 이번 변경은 별도 목적 회로·실제 로컬 ZK proof이므로 새 Draft PR로 분리한다. PR66의 mock 반환 계약을 실제 증명 검증기로 재사용하지 않는다.

**결론: 맞춤 attestor 확장 없이 표준 서명을 비공개 witness로 검증하는 최소 경로는 구현 가능하다. 공개 합성 signer + 전체 표 fixture에서 실제 blinded UltraPlonk proof 생성·독립 검증과 변조 거부를 실행했다. 실제 공식 YBM proof의 wrapper 검증·사업 범위 원천 중복 방지는 아직 완료하지 않았다.**

현재 범위: 예치 정책 OPEN, **400% 전용 블로그 챌린지·사전검토 화면까지 제외**, 500% 제외, grant/outbox HOLD, 제품 independentClaim NO_GO 유지. 목표는 YBM750+·시원스쿨50~300%·일반 후기 AI/Vision 검토다. 아래 v1 측정과 verification.json은 과거 실험 기록이며 소급 수정하지 않는다.

2026-10-16 후속: [가변 표 parser·공식 signer 준비·재사용 방지 v2](v2/README.ko.md)는 별도 Draft 연구 단위다. native 컴파일/ACVM 구성요소와 호스트 검증을 실제 통합 ZK 성공으로 합산하지 않는다. v1의 49c37f8 성공 기록을 보존한다. 제품 src/API/DB/web/금고/Windows 변경 없음. 별도 package/lock과 격리 workflow만 추가한다. 실제 로그인·과거 비공개 proof/키/쿠키 읽기·유료 prover·공개 RPC/거래·실자금·운영자 연락/맞춤 배포 없음.

## 이미 성공한 실제 경로를 출발점으로 삼는다

- [W02 실제 검증](../../docs/w02/ybm-proof-verification.json): 새 접수·성적 공식 증명, 독립 서명 검증, 신청/수령인·동일 시험 연결 성공. 이를 미완료로 되돌리지 않는다.
- [PR32 전체 표 실측](../../docs/spikes/history-proof/verification.json): 실제 3행 전체 표 공식 서명, 별도 프로세스 검증, 서명 후 행 삭제/변조 거부 성공. 계정 전체 이력/누락 없음까지 증명한 것은 아니다.
- [H2 실측](../../docs/current/history-intake-verification.json): 새 문맥 증명·공식 서명·영속 접수/재시작 조회 성공. 비어 있는 계정 의미와 coverage는 UNKNOWN이다.
- 학원 학습 API는 상용 전제, 이번 출석은 Moodle 담당 소유다. 실명 KYC는 학원 수강생/본인확인 연동 경계로 남기고 성적 wrapper의 선행 조건으로 확대하지 않는다. 시험 계정 접근과 신청 owner 결합은 실명 동일인 보장이 아니다.

## 1. 어떤 필드가 실제로 서명되는가

고정 `@reclaimprotocol/attestor-core 5.1.4`의 설치 소스 `lib/index.js`와 기존 캐시 upstream `bc36dac3657fc46b79b4ecd545262c32440b05a6`를 대조했다.

- claim identifier = Keccak256(`provider + LF + parameters + LF + canonical(context)`). context는 JSON 정규화되지만 parameters는 전달 문자열 바이트를 사용한다. 회로는 정확한 canonical params 한 개를 고정한다.
- attestor claim 서명 = EIP-191 개인 메시지 서명(`identifier + LF + lowercase(owner) + LF + timestampS + LF + epoch`). identifier·서명 모두 원천 안정 ID가 아니다.
- provider의 정규식 named capture 결과가 `context.extractedParameters`로 들어가고 providerHash도 채워진다. 호출자가 넣은 일반 context는 요청 결합값이며 원천 사실이 아니다. 고정 policy가 실제 named capture를 반환하는지 별도로 검사한다.
- 기존 단일 성적 추출은 exam_type, exam_date, registration_number, total_score다. 수험번호는 6~10자리이며 시험일+종류와 함께 정규화할 수 있다. 현재 확인된 정책/실측 근거에는 사업용 고엔트로피·불변 원천 비밀 ID가 없다. 다른 미확인 YBM 필드가 절대로 없다는 주장은 하지 않는다.

[공식 claim 구현](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/utils/claims.ts), [원천 검증 후 문맥 구성](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/assert-valid-claim-request.ts).

### 같은 행 결합: scalar wrapper를 채택하지 않은 이유

`receipt.test.mjs`는 **현재 stock scalar policy**를 그대로 사용해 첫 행 날짜/수험번호와 두 번째 행 950점을 선택 공개하면 실제 SDK receipt validator가 결합된 capture를 반환하는 반례를 재현한다. 원문 바이트는 바꾸지 않았다. 이는 합성 receipt 단계 반례이며 실제 공식 서명을 위조했다는 뜻이 아니다. 사전 고정 XPath만으로 hostile redaction의 같은 행 구조가 항상 검증되는 것으로 가정하면 안 된다.

대신 기존 `historyParams()`를 정확히 pin한다. 표 내부의 `*` 가림을 허용하지 않는 whole-table 정규식은 같은 행 혼합을 거부한다. 회로는 `history_html`을 비공개로 재구성하며 한 `<tr>`의 날짜·수험번호·점수를 동시에 검사한다. 첫 행 700점/다른 행 950점에서 950점만 빌리는 공격은 서명 재검증에서 실패한다. 이 실험은 선택한 표 안의 행 결합만 다루며 페이지 외 전체성/다른 표·필터·최고점은 해결하지 않는다.

## 2. 실제 ZK wrapper와 공개/비공개 경계

`build-circuit.mjs`는 정확한 canonical JSON과 **두 행의 제한된 합성 HTML 문법**을 `circuit/src/main.nr`로 생성한다. Noir witness에서 다음을 직접 제약한다.

1. 표의 해당 행 날짜(달력/윤년/한국 자정·미래일 거부), 6자리 수험번호, 3자리 5점 단위 점수·최소 점수·인정 날짜 범위.
2. 전체 표가 든 서명 문맥, 정확한 whole-table URL/GET/추출 정책/providerHash.
3. Keccak claim identifier를 재계산하고 EIP-191 preimage와 secp256k1 서명을 검증. 서명자 공개키는 프로그램 상수, epoch는 합성 1로 고정.
4. 사전 등록 공개 record digest와 owner, 검증 시각/정책을 공개 입력에 결합. timestamp는 private이며 30분 freshness를 제약.

호스트에서 계산한 `qualified=true`나 digest만 회로가 믿는 구조가 아니다. 원문 표·날짜·점수·수험번호·claim identifier·서명은 private witness다. 공개값은 등록 digest 32바이트, owner 20바이트, threshold/from/until/now 4개 = field 56개다. 등록 digest에는 민감 원천값이 들어 있지 않다. 공개 proof에 저엔트로피 원천 해시를 추가하지 않는다.

**이 회로의 한계:** HTML 두 행/6자리/특정 마크업, 첫 행 선택, 합성 signer/epoch만 지원한다. 실측 3행 YBM 문법/임의 LC·RC/주변 셀/서명자 registry를 지원하는 범용 parser가 아니다. 실제 원문을 읽어 정적인 회로 상수에 박는 방식으로 확장하면 안 된다. 실제 source bytes의 모든 개인 필드는 private 배열로 처리하고 parser/길이/인덱스를 제약해야 한다. 기존 수신 proof의 caller context도 이 새 문법과 다르므로 그대로 넣을 수 있다고 주장하지 않는다.

### 도구 선택과 개인정보

- 별도 npm lock: Noir/noir_wasm `1.0.0-beta.3`, Barretenberg `0.82.2`. 글로벌 Rust/Node 설정을 변경하지 않았다.
- 이 고정 버전의 일반 UltraHonk API를 ZK로 가정하지 않고 **blinded UltraPlonk**를 선택했다. [해당 버전 witness/quotient blinding 구현](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/barretenberg/cpp/src/barretenberg/plonk/proof_system/prover/prover.cpp)을 확인했다. 오래된 실험용 고정 버전이며 제품 릴리스/감사 완료를 뜻하지 않는다.
- 공개 universal CRS만 별도 GET으로 내려받아 길이/SHA256을 고정한다. 이는 proof를 원격 prover에 전송하는 과정이 아니다. 다운받은 CRS의 독립 ceremony 감사는 수행하지 않았다.
- 그 뒤 proof 생성·검증은 기존 network guard 아래 실행한다. proof/witness를 서버로 보내지 않는다. witness는 메모리에서 사용하며 파일에 저장하지 않는다. 공개 합성 proof·program·Solidity만 ignored artifacts에 저장한다. 실제 자료의 OS 메모리/크래시/로그 수명 경계는 별도 통합 관문이다.
- attestor는 원래 whole-table 원문을 본다. wrapper는 attestor로부터 원문을 숨기지 않고 **공개 체인/검증자에게 원문을 공개하지 않는 것**을 목표로 한다. 개인 PC에서 증명하면 CLEAR 서버에 원문을 보낼 필요가 없는 설계다.

## 3. CLEAR session 없는 요청 구성

`requestFor()`는 사전에 고정된 공개 등록 record에서 stock SDK name/params/owner/context를 구성한다. CLEAR의 새로운 instruction/session/추가 지급 서명은 없다. 기존 제품 authority 검사를 삭제하지 않았으며 제품 수집기와도 아직 연결하지 않았다.

대체 authority는 **미리 확정된 등록과 프로그램**이다: application, 상품이 정한 reuseScope, recipient, owner, chainId, 검증 contract, policy hash/인정기간/threshold, program profile을 등록 digest에 결합한다. 실제 registry는 사용자 제출 proof에서 가져오면 안 된다. 로컬 harness는 배포 시 expected public-input hash와 직접 verifier codehash를 고정하고, proof가 제시한 다른 owner/수령인/정책/시각/입력 개수 또는 교체된 프로그램을 거부한다. public input을 자유롭게 받는 일반 verifier만 호출하는 것은 지급 authority가 아니다.

현재 등록은 공개 합성 fixture다. 실제 등록 root/체인 조회·owner 승인·registry epoch/프로그램 key 배포·source 수집기 런타임·금고 spent 처리는 미구현이다. proxy는 지원하지 않는다. 실제 체인에서는 verifier now도 호출자 임의 값이 아니라 block time과 제한된 허용창으로 검증해야 한다. 데모 harness는 고정 시각 하나만 허용한다.

CLEAR가 없어도 신규 요청을 구성할 수 있다는 것과 YBM/공식 attestor가 계속 응답한다는 것은 다르다. 새 취득에는 사용자 로그인·원천·공식 witness·공개 등록/정책 접근이 필요하다. 이미 발급된 proof의 로컬 검증에는 원천 재접속이 필요 없다. sponsor의 실제 지급 가능 재원은 별도다.

## 4. 사업 범위 nullifier: 정확히 남은 장애물

| 후보 | 실험/판정 |
| --- | --- |
| 서명 자체 | 재발급 timestamp 변경으로 signature가 바뀜. 중복 우회 반례 |
| claim identifier | context/등록 owner가 바뀌면 바뀜. 원천 불변 ID로 사용할 수 없음 |
| 공개 H(scope, 시험일, 수험번호) | 수험번호 일부를 아는 1,000개 후보 사전에서 원문 복구. 개인정보 조건 위반 |
| 사용자 임의 salt/owner 비밀키 | salt/키를 새로 만들어 동일 원천의 다른 값 생성. 우회 반례 |
| 신청 ID 기반 단회 처리 | 같은 신청의 재청구는 막을 수 있지만 다른 지갑/다른 신청의 같은 원천 중복은 별도. 대체 성공으로 세지 않음 |
| 검증된 고엔트로피 안정 source secret | 현재 확인된 YBM 필드에는 근거 없음. 원천 제공/안정성·관계 검증 필요 |
| 안정된 키의 OPRF/비공개 중복 registry | 후보지만 키/가용성/원천 binding을 검증하는 별도 서비스가 필요. ZK wrapper만으로 생기지 않음 |

nullifier API는 안전하지 않은 값으로 대체하지 않고 명시적으로 BLOCKED를 반환한다. scope는 상품/회차가 정하는 범위다. 전체 학원/상품에 전역 동일 nullifier를 강요하지 않고 정당한 타 상품 재사용을 임의 차단하지 않는다. scope에 신청/수령인/정책 revision을 섞어 같은 상품 중복을 우회하는 변경도 금지해야 한다.

따라서 **공식 attestor의 맞춤 배포 허락은 wrapper 자체의 필수 조건이 아니다.** 하지만 현재 확인된 저엔트로피 원천만으로 완전한 사업 범위의 비공개 중복 방지까지 해결했다는 결론은 낼 수 없다. 새 원천 필드 또는 별도 안정 비밀/중복 등록 신뢰가 필요하며, 어떤 기관 지원이 필요한지는 그 대안 선택에 따라 달라진다.

## 다른 후보의 결정

- Reclaim + Noir 목적 회로: 이번 최소 구현 경로. 공급자/Amoy를 바꾸지 않고 먼저 측정했다.
- RISC Zero: 일반 Rust parser/JSON·서명 검증을 고정 image ID로 묶는 후보다. 이번에는 Rust/risc0 툴체인이 없고 단일 경로에 집중하여 실행하지 않았다. 공식 [EVM template](https://github.com/boundless-xyz/risc0-foundry-template)은 실제 Groth16 시험에 x86 Docker 또는 Bonsai 경로를 설명한다. Apple Silicon 로컬 가용성/메모리·해당 stack benchmark를 이번 Noir 결과로 대체하지 않는다. devmode·remote prover 미사용.
- [Primus DVC 설명](https://github.com/primus-labs/zkTLS-tutorial#advanced-material-private-data-verification-and-computation----build-zktls-with-zkvm), [Noir 예제](https://github.com/primus-labs/zktls-verification-noir): private computation 구조의 참고다. 후자는 Primus attestation/Aztec `4.2.0-aztecnr-rc.2`에 대한 예제이고 Reclaim/YBM/Amoy 호환 완료 근거가 아니다. 도입·체인 이동을 결정하지 않았다.

## 재현과 검증 기록

저장소 고정 Node 도구를 사용한다. root와 collector의 기존 lock 설치 후:

```sh
./tools/npm --prefix spikes/reclaim-private-wrapper ci --ignore-scripts --no-audit --no-fund
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test spikes/reclaim-private-wrapper/*.test.mjs
./tools/node spikes/reclaim-private-wrapper/prepare-crs.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs spikes/reclaim-private-wrapper/prove.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs spikes/reclaim-private-wrapper/evm-check.mjs
```

`main.nr`를 고친 경우 generator를 먼저 고쳐 다시 생성해야 한다. test/prove는 source drift를 거부한다. EVM 검사는 현재 회로 지문·report·Solidity 지문을 대조하여 이전 회로의 산출물 혼용을 거부한다. 메인 제품 test/deps는 변경하지 않는다.

- 30개 오프라인 검사: 정규화/원천 정책, caller context, 재발급/지갑·salt 반례, 사전대입, 실제 회로 witness 긍정·변조·다른 행·날짜/기간·미래/만료·서명·다른 정책/수령인 거부.
- 별도 `prove.mjs`: 실제 blinded proof 생성/검증, proof bit와 public input 변조 거부. 모든 부정 사례마다 비싼 proving을 반복한 것은 아니며, 30개 중 회로 부정 사례는 ACVM constraint 실행이다.
- `evm-check.mjs`: 생성한 실제 Solidity verifier와 고정 입력 harness를 새 메모리 chain431798/Shanghai에 배포해 proof 검증·변조/다른 binding/코드 교체 거부. 공개 거래나 Amoy 배포는 아니다.
- 원본/legacy 191개·공개 참고문서4개 보존 PASS. 기존 실제 proof/개인 자료는 열지 않았다.

로컬 최종 측정은 `verification.json`에 기록한다. setup/컴파일/첫 verifier 준비가 포함되는 구간을 별도 표시한다. 추정 벤치마크가 아니며 Windows/브라우저/모바일 수치가 아니다. CI 결과는 Draft PR의 최종 head checks를 따른다.

## 실제 시험까지 남은 일과 최소 사용자 행동

1. 기존 실측 source policy는 유지하면서 실제 3행/가변 마크업·6~10자리·다른 context를 **비공개 bounded parser**로 수용한다. 합성/변조 corpus와 회로 리뷰: 개발 추정 2~4일.
2. 공식 witness 공개 registry/epoch/서명자 키와 프로그램 VK·등록 root를 고정하는 실제 adapter, 재현 빌드·key audit: 추정 1~3일. 운영자 맞춤 배포 대신 공개 기존 trust를 소비한다.
3. 새 whole-table proof를 관리형 PC 메모리에서 wrapper로 전달하고 원문·witness 저장 없이 종료하는 collector 통합/실측: 추정 1~2일 + 사용자 1회 로그인. 품질/실측 결과에 따라 달라지는 추정이다.
4. source nullifier의 안전한 원천/별도 서비스 결정은 별도 미결이다. 앞의 기간에 해결된다고 포함하지 않는다. 다중 조건(출석/후기 등), 실제 재원·spent registry/금고 연결도 별도다.

**현재 사용자에게 새 로그인이나 파일 제출을 요청하지 않는다.** 1~3의 준비가 끝나면 새 실제 YBM 전체 표 proof 1건을 위해 로그인 목적·원천/공식 attestor로 이동하는 표·개인 PC 메모리 사용/삭제·예상 5~10분을 먼저 설명하고 연결한다. 과거 원문 proof/키/쿠키를 보내 달라고 하지 않으며 공개 RPC/원격 prover에는 원문을 보내지 않는다. 이 시험이 성공해도 nullifier·전체 상품 독립청구를 자동 GO로 바꾸지 않는다.

### 최종 로컬 실측·직접 리뷰

Apple Silicon arm64, 논리 CPU10개, RAM16GiB, prover1thread에서 컴파일651ms·witness49ms·증명43,173ms·첫 검증20,789ms였다. 증명2,144bytes + 공개 입력1,792bytes, 해당 Node 프로세스 최대 RSS1,945,488KiB(약1.86GiB)다. 증명 시간에는 backend/키 초기화가 포함되며 CRS는 사전 캐시였다. witness·proof 변조는 거부됐다. 최종 생성 verifier runtime11,050bytes, 로컬 Shanghai EVM의 harness 포함 검증 gas464,508. Amoy 실제 배포·가스 실측은 하지 않았다.

주 세션이 직접 회로 제약/UTF-8 바이트 offset/서명 preimage/원천 policy/같은 행 연결/등록 입력 pin/CRS 지문/산출물 혼용·공개 출력/실제와 합성 표기를 리뷰했다. 초안의 scalar 방식은 기존 행 혼합 반례 때문에 폐기했고 whole-table 방식으로 교체했다. 초기 UTF-8 문자열 인덱스 혼동은 byte offset으로 수정하고 긍정 witness를 통과시켰다. 최종 proof와 EVM report의 Solidity 지문이 같은 것을 확인했다. 독립 사람 승인이나 보안 감사가 아니며, 실사용을 허용하는 코드 경로는 추가하지 않았다.
