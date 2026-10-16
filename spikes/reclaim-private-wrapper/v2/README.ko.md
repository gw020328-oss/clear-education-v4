# 가변 비공개 표·공식 signer 준비·재사용 방지 후속

2026-10-16. PR69 `49c37f828dea64babcb31c52879baa02142ea797`에 의존하는 별도 Draft 연구 단위다. 이전 v1 두 행/6자리/합성 signer의 실제 UltraPlonk·로컬 EVM 성공은 보존한다. **v2는 호스트 검증과 별도 parser 회로 구성요소이며, 실제 YBM의 통합 ZK wrapper 성공이 아니다.**

현재 범위는 YBM750+, 시원스쿨50~300%, 일반 후기 AI/Vision 검토다. **400%는 전용 블로그 챌린지·사전검토 화면까지 제외하고 500%도 제외한다.** 예치 정책 OPEN, grant/outbox HOLD, 제품 independentClaim NO_GO다. 이 spike는 새 등록기관·KYC·지급 authority를 채택하지 않고, 제품 src/API/DB/금고/web/Windows/PR70 문서를 변경하지 않는다. 과거 v1 JSON의 `400% PRECHECK_ONLY`는 당시 실험 기록이며 소급 수정하지 않는다.

## 무엇을 구현했고 무엇이 남았는가

| 구성 | 현재 검증 수준 | 제품에 쓰기 전 남은 조건 |
| --- | --- | --- |
| 가변 표 호스트 parser | 합성 3행·헤더·공백·속성·부가 마크업, 6~10자리, 날짜 정규화·중복 행·UTF-8·상한 검사 | 실제 새 YBM 마크업 적합성은 미확인. 8,192바이트/16행/12셀/깊이16 제한 |
| 비공개 parser 회로 | 별도 ACVM 실행. 모든 원천 바이트 private, 선택한 행의 날짜/수험번호/점수 결합, 달력/UTF-8·2,048바이트/행·셀 경계 | 중복 행/속성 거부 및 모든 비선택 행 사실의 호스트 동등성 미완료. 서명된 canonical JSON preimage와 아직 단일 회로로 연결되지 않음 |
| 공식 signer 호스트 adapter | 정확한 기존 historyParams, claim identifier, EIP-191 서명 복구·주소 pin, 등록/owner/context/정책/시간 검증 | 새 공식 서명 입력 없음. 회로 signer membership·VK/release pin·실제 proof 연결은 미완료 |
| 메모리 IPC | 합성 전용 child, 원문 출력/파일 저장 경로 없음, 고정 결과만 반환, close 이후 완료, timeout/오류/취소 회귀 | 기존 관리형 collector 연결 미구현, 실제 모드 명시 차단. JS 버퍼 일부 덮어쓰기를 완전한 메모리 소거로 주장하지 않음 |
| 비공개 HMAC registry | 재발급/다른 지갑/날짜 표기/동시 등록과 상태 재시작 모델 | 운영 OPRF·영속 DB·키 보관/회전·rollback 방지 없음 |
| 등록 후 오프라인 행사 | 별도 합성 등록기관 서명 영수증+수령인 서명, 서버 종료 후 모의 행사 | 새 등록기관 신뢰 필요. 실제 EVM/재원/금고 연결 없음, 지급 false |

기존 W02 실제 두 증명, PR32 실제 3행 전체 표 공식 공증, H2 공식 검증·접수 성공은 [상위 README](../README.ko.md)의 근거를 그대로 따른다. 과거 개인 proof/키/쿠키는 읽지 않았다. 실제 당시 HTML의 바이트 크기는 공개 기록에 없어 2,048바이트면 충분하다고 가정하지 않는다. 호스트의 8KiB 상한을 회로의 2KiB 지원으로 잘못 표시하지 않는다.

## 컴파일 실패 진단과 수정

같은 Noir `1.0.0-beta.3+ceaa1986628197bd1170147f6a07f0f98d21030a`에서 비교했다. 입력은 모두 공개 합성 소스다.

| 구성 | 관찰 |
| --- | --- |
| 원본 바이트 FSM, N=64 WASM | 컴파일 성공. 실제 표 witness 성공으로 세지 않음 |
| 원본 N=1,024 WASM | 컴파일 37.47초, RSS 2,588,377,088bytes / peak footprint 3,674,921,824bytes; 844바이트 합성 3행 witness 성공 |
| 원본 N=2,048 WASM | `RuntimeError: unreachable`; 동일 반복은 중단. 내부 allocator 오류/정확한 WASM 제한 수치는 진단 로그에 없어 확정하지 않음 |
| 동일 원본 N=2,048 native | 컴파일 71.83초, RSS 2,888,990,720bytes / peak footprint 7,929,290,384bytes 성공 |
| 선택 행 위치만 저장하는 수정 N=2,048 WASM | 61.13초, RSS 2,562,637,824bytes / peak footprint 5,562,479,088bytes; 합성 witness 성공 |
| 수정+UTF-8/달력 검사 N=2,048 WASM | 다시 `unreachable`. 검사를 삭제해 통과시키지 않음 |
| 수정+UTF-8/달력 검사 N=2,048 native | 컴파일 43.74초, RSS 2,635,300,864bytes / peak footprint 5,490,776,808bytes 성공 |

위 시간은 Apple Silicon 16GiB의 개별 명령 관찰이며 다른 작업과의 자원 경쟁·캐시 영향을 통제한 벤치마크가 아니다. RSS와 macOS footprint를 섞어 동일한 메모리 지표로 표시하지 않는다. native 성공과 규모 변화에 따라 WASM의 자원 부담을 주요 원인으로 추정하되 정확한 trap 원인은 미확정이다.

64개 원천 위치 배열을 매 바이트 갱신하던 구현을 선택 행의 4개 위치만 저장하도록 줄였다. 전체 원천 바이트 순회·태그 구조 검사·선택 행 인덱스와 같은 행 결합은 유지했다. UTF-8은 호스트 decode를 믿지 않고 회로에서 overlong/surrogate/범위/불완전 시퀀스를 검사한다. 원천 문자열을 공개 상수나 호스트의 `qualified=true`로 치환하지 않았다. 단, 이는 일반 HTML parser 완성이나 완전한 YBM source 의미 검증을 뜻하지 않는다.

현재의 native 산출 ACIR은 압축 16,747,358bytes, 해제 394,614,745bytes다. bb.js0.82.2의 `acirGetCircuitSizes`도 `RuntimeError: unreachable`로 중단했다. **gate 수·v2 증명 시간·v2 Solidity 검증 수치는 없다.** native compiler가 성공했다고 prover까지 성공한 것으로 세지 않는다. 원격 prover나 더 큰 CRS를 자동 다운로드하지 않았다.

`compiler-repro/original.nr`와 `compiler-probe.mjs`에 실패 구성을 보존했다. `native-compiler.mjs`는 공식 [beta.3 release](https://github.com/noir-lang/noir/releases/tag/v1.0.0-beta.3)의 고정 아카이브/실행 파일 해시를 검사하고 저장소 `.toolchain/wrapper-v2-nargo`만 사용한다. release API에는 발행자 digest가 없었으므로 이 pin은 HTTPS로 관찰한 바이트 고정이며 서명된 공급망 보증이 아니다. 전역 Node/Rust/nargo를 변경하지 않는다. native의 prerelease `compiler_version` 거부는 별도 도구 호환 문제로 분리하고 실행 파일 지문으로 정확한 버전을 고정한다.

다음 구현 단위는 바이트마다 전체 HTML 상태기를 복제하는 방식을 **경계가 검증되는 토큰 구간 witness + 전체 바이트/UTF-8 검사**로 바꾸어 ACIR 크기를 줄이는 것이다. 토큰 힌트의 누락·겹침·가짜 경계가 회로에서 거부되어야 하며 단순 호스트 파싱 결과는 대체물이 아니다. 그 후 중복/속성 규칙과 JSON escaping→동일 서명 preimage 연결을 완성하고 prover 크기를 다시 측정한다. 다른 zkVM 비교도 대안이지만 이번에 설치/실행하지 않았다.

## 공식 서명자와 시간 경계

[공개 registry](https://api.reclaimprotocol.org/api/attestors)를 실제 HTTPS 조회해 받은 세 주소와 raw SHA256을 `registry-snapshot.json`에 보존했다. 주소 목록 이외의 epoch 유효기간은 없었다. 정확한 upstream [claimTunnel](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/handlers/claimTunnel.ts)의 epoch=1은 V1 호환 상수다. 옛 Amoy epoch1 시간 구간을 새 증명의 유효기간으로 사용하지 않는다.

- verifier가 사전에 소유한 record와 snapshot을 factory에 고정한다. proof에서 signer/registry를 받아 신뢰 목록을 교체하지 않는다.
- 정확한 canonical historyParams와 providerHash를 고정한다. 새 요청은 `{clearBinding}`만 caller context에 넣고 `extractedParameters.history_html`은 stock SDK 원천 추출 결과여야 한다. 기존 PR32의 목적/nonce context를 새 등록 context로 오인하지 않는다.
- 전체 params/context에서 identifier를 재계산하고 EIP-191 sign data로 공개키를 복구한 다음 주소가 pin된 signer인지 확인한다. owner·등록 digest·수령인·상품 범위·chain/contract·정책·시간은 등록 digest에 결합한다.
- 연구 snapshot은 조회 시점 이상, 24시간 미만에서만 사용한다. 이는 공식 key 유효기간 보증이 아닌 보수적 연구용 TTL다. 만료/목록 변경은 거부하고 재조회·검토 후 새 digest/등록을 요구한다. 키 회전/옛 키 유효기간을 자동 추정하지 않는다.
- 등록 생성 전/만료 후 및 증명 생성 전/30분 초과를 거부한다. 검증 현재 시각은 official factory의 PC 시계이며 claim이 공급하지 않는다. 제품은 합의된 등록/체인 시각과 key revocation 정책이 별도로 필요하다.
- 테스트는 synthetic signature 성공, 공식 주소를 자칭한 synthetic signature 거부, snapshot 시간 경계와 목록 변경 거부를 구분한다. snapshot 만료 거부를 공식 서명 검증 성공/실패로 세지 않는다.

공식 공개 목록 조회는 실제, 서명 성공 입력은 합성이다. **새 공식 실제 서명 검증 및 실제 ZK/EVM 결과는 미실행**이다. v1의 실제 합성 ZK/EVM 성공을 v2로 옮겨 적지 않는다.

## 원천 재사용 방지 후보와 신뢰 비용

| 후보 | 개인정보/새 신뢰 | 온라인 의존·중복 범위 | 해커톤 판단 |
| --- | --- | --- | --- |
| 공식 서명된 고엔트로피 불변 원천 ID | 공개 해시 사전대입을 피할 수 있으나 실제 해당 필드 존재/안정성/같은 시험 관계 근거 없음 | 확보 후 원천 서비스 없이 검증 가능할 수 있음 | 확인되지 않은 필드를 가정해 구현하지 않음 |
| 비공개 HMAC 중복 registry | registry가 실제 원천값을 봄. 안정 키·비공개 DB·운영자 신뢰가 추가됨 | 매 관찰은 온라인, 상품 범위+정규화 시험일/수험번호로 중복 검사 | 작은 합성 모델 구현. 실서비스 채택/개인정보 추가 제공은 승인되지 않음 |
| VOPRF + ZK 원천 결합 | 서버에게 입력을 숨길 수 있지만 blinded 입력이 공식 서명 원천과 같다는 별도 증명이 필요. 저엔트로피 입력의 무제한 질의도 막아야 함 | 최초 토큰 취득 때 서버 필요, 안정 키/범위·키 회전 검증 필요 | 암호 프로토콜·키 운영·원천 결합 추가로 공수가 큼. 기존 HMAC 모델을 OPRF 구현으로 부르지 않음 |
| 최초 증거 등록 후 영수증 행사 | 새 등록기관이 최초 증거/중복 판단을 승인하는 신뢰 추가. 그 기관이 CLEAR이면 CLEAR 의존은 등록 시점에 남음 | 영수증 확보 후에는 새 등록기관 서명/접속 없이 행사 가능; 최종 spent ledger는 계속 필요 | 아래 합성 실험 성공. 독립 청구 제품 해법으로 자동 채택하지 않음 |
| 학원 수강생 ID와 시험 계정 결합 | 학원/시험 제공자가 검증한 동일인 관계 필요. 단순 자기신고 binding은 불충분 | 최초 결합 후에도 실제 시험의 안정 키가 필요 | 서로 다른 학생 ID로 같은 시험을 쓰는 반례 확인. 임의 KYC 도입 없음 |

OPRF/VOPRF의 입력 비공개·서버 키 검증 성질은 [RFC9497 §1](https://www.rfc-editor.org/rfc/rfc9497.html#section-1)에 따른다. 이것만으로 데이터가 공식 성적에서 왔다는 의미나 source authorization가 생기지는 않는다. 후보 공수는 상대 판단이며 실서비스 구현 일정/보안 감사가 완료됐다는 뜻이 아니다.

`reuse-lab.mjs`의 HMAC 입력은 상품/회차 reuseScope + 시험종류/날짜/수험번호다. 신청/지갑/증명 서명/정책 revision은 원천 키에 넣지 않는다. 날짜 점/하이픈은 정규화하지만 선행 0 동등성은 근거가 없으므로 해당 후보를 거부한다. 다른 상품의 정당한 사용은 허용한다. 운영자가 같은 상품에 새 scope를 임의 발급하면 우회할 수 있으므로 scope 등록·변경 권한 자체도 제품의 별도 관문이다.

합성 실험에서 재발급·다른 지갑/신청·날짜 표기 변경의 같은 원천을 차단하고, 동시 두 신청 중 한 개만 수락했다. JS의 한 이벤트 루프에서 검사/기록 사이 await가 없는 모델이며 다중 서버 DB 원자성 검증은 아니다. 올바른 private checkpoint 재시작은 중복을 유지하고, 다른 키의 checkpoint는 거부한다. 그러나 같은 키라도 빈 상태/과거 checkpoint로 되돌리면 중복 수락된다. 키 교체를 새로운 독립 도메인으로 열면 역시 우회된다. 영속 DB·rollback 방지·키 이전/폐기 정책을 구현했다고 주장하지 않는다.

`registration-lab.mjs`는 공개 합성 키로 서명한 초기 등록 영수증을 발급한다. 영수증은 신청/수령인/등록 binding/상품 범위/chain/contract에 결합하고 원문·source HMAC tag를 공개하지 않는다. 영수증 취득 뒤 등록 서버를 종료해도 수령인 서명으로 **모의** 행사가 되고 새 등록기관 서명은 요구하지 않는다. 신청 ID 단회 처리는 이때의 최종 spent 처리일 뿐, 사업 범위 원천 중복 방지는 앞단 private registry가 담당한다. 최종 spent 상태를 잃으면 다시 행사 가능한 반례도 보존한다. 이는 자금/금고/공개 체인 거래가 아니고 지급은 false다.

## 메모리 경계와 로그인

`syntheticMemoryCheck`는 명시적인 합성 mode만 받는다. child는 최소 환경·무시된 stdout/stderr·IPC로 실행하며, 부모는 고정 결과 schema를 새로 구성한다. raw error/HTML/claim/signature/row count를 반환하지 않는다. 메시지를 받았더라도 실제 child close 전에는 완료하지 않는다. 실패/timeout/취소는 SIGKILL 후 close를 기다린다. JS 네트워크 tripwire는 OS sandbox가 아니며 메모리 페이지/swap/크래시 덤프의 완전 소거 보장이 아니다. 실제 저장 정책은 기존 관리형 collector의 승인 경계가 필요하다.

**현재 로그인 요청 없음.** 회로/서명 통합, backend 크기 문제, 실제 표 용량·문법, 관리형 collector 연결이 남았다. 준비 후 새 실제 시험 1건을 요청할 때 목적, YBM과 공식 attestor에 전달되는 표/접속 자료, PC 메모리 처리와 종료 삭제, 예상5~10분을 먼저 설명한다. 과거 비공개 proof/키/쿠키를 읽거나 채팅으로 받지 않고 원문/witness를 GitHub·공개 RPC/체인·원격 prover로 보내지 않는다.

## 재현과 결과 구분

root/collector/wrapper의 기존 pinned npm 설치 후:

```sh
# 네트워크 차단 host/IPC/reuse 검사. 기존 wrapper CI의 루트 test에서 자동 포함.
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test spikes/reclaim-private-wrapper/v2.test.mjs
# 공개 native compiler 다운로드만 수행. 실제 입력 없음.
./tools/node spikes/reclaim-private-wrapper/v2/native-compiler.mjs
# 별도 native compiler + 실제 ACVM 제약. 수 분/수 GiB 필요.
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test spikes/reclaim-private-wrapper/v2/circuit.test.mjs
# 알려진 backend 실패를 재현하는 명령: 성공 명령으로 표시하지 않음.
./tools/node --import ./tests/ybm-collector/network-guard.mjs spikes/reclaim-private-wrapper/v2/circuit-cost.mjs
# 필요할 때만 원본 WASM 규모 실패 재현. 2048은 해당 환경에서 실패했다.
./tools/node --import ./tests/ybm-collector/network-guard.mjs spikes/reclaim-private-wrapper/v2/compiler-probe.mjs 2048
```

host/IPC/reuse 검사와 회로 검사의 숫자는 [verification.json](verification.json)에 분리한다. 실제 proof 생성은 v1만 해당한다. native v2 회로 검사는 로컬 별도 실행이며 기존 CI가 이를 자동 실행하는 것으로 쓰지 않는다. 알려진 host/circuit 동등성 차이는 테스트에서 반례로 보존하므로 테스트 PASS가 통합 검증 GO를 의미하지 않는다. 공개 fixture에는 실제 개인 값이 없다.
