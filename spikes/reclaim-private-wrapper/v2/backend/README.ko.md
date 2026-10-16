# v2 네이티브 증명 경로와 실패 원인 분리

2026-10-17. PR73 `089d6efa677a85af4c5a8c6159f313f563e6411e`의 동일 2,048바이트 private parser를 사용한다. PR69 v1의 서명 결합 합성 증명과 PR73의 호스트/ACVM 검증을 보존한다. 이 후속의 결과 수치는 [verification.json](verification.json)을 따른다.

**범위는 공개 합성 표의 parser 구성요소다. 모든 입력이 private이고 public input은 0개다.** 따라서 임의의 유효한 표를 아는 것도 이 회로를 만족한다. 증명 성공은 공식 원천 인증·특정 신청·지갑·정책·중복 방지에 대한 증명이 아니다. 공식 signer를 호스트에서 검증하는 것과 같은 증명 안에서 서명을 검증하는 것을 구분한다. 독립 청구 NO_GO, 지급 HOLD를 유지한다.

## 서로 다른 세 문제

| 문제 | 확인한 근거 | 조치와 한계 |
| --- | --- | --- |
| bb.js WASM 회로 크기 계산 | 원래 v2 bytecode 지문을 확인한 재현에서 최대 65,536페이지/4,096MiB, `bad_alloc`, `acir_get_circuit_sizes` abort. allocator 출력 당시 3,119.31MiB | 네이티브 bb 0.82.2 OLD_API로 우회. 실패한 할당의 크기/단편화는 미측정이며 정확히 4GiB를 사용했다는 뜻은 아님. Noir 컴파일러의 과거 WASM trap까지 같은 원인으로 확정하지 않음 |
| 네이티브 G1 다운로드 실패 | 동일 버전 소스에서 OLD_API는 전달된 `-c` 대신 전역 `CRS_PATH`를 사용. 기존 262,144 용량도 이번 회로에 부족 | child 환경에서 HOME을 상속하지 않고 cwd의 `.bb-crs`를 사용. 공개 G1을 2^21+1점으로 별도 확보·해시 검증. prove 중 네트워크를 OS에서 차단하며 암묵 다운로드에 의존하지 않음 |
| 회로/백엔드/검증기 호환 | native gate count 1,837,617, ACIR opcode 1,527,243. 동일 program에서 OLD_API UltraPlonk 생성·별도 검증 | CLI의 기본 `Scheme is: ultra_honk` 문구는 선택된 OLD_API의 알고리즘을 나타내지 않음. dispatch는 `prove_output_all_ultra_plonk`/`verify_ultra_plonk`. 로컬 Solidity 결과는 별도 기록 |

공개 원천: [OLD_API dispatch](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/barretenberg/cpp/src/barretenberg/bb/main.cpp), [CRS 기본 경로](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/barretenberg/cpp/src/barretenberg/api/init_srs.cpp), [G1 크기와 다운로드](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/barretenberg/cpp/src/barretenberg/api/get_bn254_crs.cpp), [UltraPlonk 구현](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/barretenberg/cpp/src/barretenberg/api/api_ultra_plonk.cpp). 설치된 bb.js의 `BarretenbergWasmMain.init`에서도 기본 최대 2^16페이지를 확인했다.

초기 gate 조사 때 native가 홈에 새로 만든 공개 Grumpkin cache는 생성 시각·파일 지문을 확인해 해당 파일만 작업 artifact 폴더로 옮겼다. 기존 사용자 cache는 삭제하지 않았다. 후속 실행기는 HOME을 재정의하지 않고 최소 환경에서 제외한다. Grumpkin 데이터는 이번 UltraPlonk prove/verify의 필수 pin 목록에 포함하지 않는다.

## 재현 경로

기존 root/collector/wrapper lockfile 의존성과 고정 native compiler가 준비된 Apple Silicon Mac에서 실행한다. Linux/Windows native 지원으로 확대하지 않았다. 공통 CI·패키지는 변경하지 않는다.

```sh
# 공개 도구와 공개 universal setup만 명시적으로 다운로드한다.
./tools/node spikes/reclaim-private-wrapper/v2/backend/native.mjs prepare
# 고정 공개 합성 fixture의 witness 생성 → native proof → 별도 verify → 변조 검사 → Solidity export
./tools/node spikes/reclaim-private-wrapper/v2/backend/native.mjs prove
# 직전 성공 run의 proof를 새 인메모리 EVM에서 검증한다. 공개 RPC·지갑 없음.
./tools/node --import ./tests/ybm-collector/network-guard.mjs spikes/reclaim-private-wrapper/v2/backend/evm.mjs
# 가벼운 회귀: 기존 CI에 포함되는 wrapper 루트 시험
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test spikes/reclaim-private-wrapper/*.test.mjs
# 실제 Mac OS 네트워크/폴더 밖 쓰기 차단 확인
./tools/node --test spikes/reclaim-private-wrapper/v2/backend/sandbox.test.mjs
# 원인이 다른 변경을 검증할 필요가 있을 때만 WASM 실패 재현
./tools/node --import ./tests/ybm-collector/network-guard.mjs spikes/reclaim-private-wrapper/v2/backend/wasm-repro.mjs
```

`prepare`는 공식 release의 관찰 바이트 SHA256과 G1/G2 크기·SHA256을 검사한다. 이는 발행자 서명이 아니다. `prove`는 고정된 source/program/binary/CRS를 확인하고 새 run 폴더를 만든다. native child는 2 threads, 600초 제한, 9GiB RSS 표본 상한이며 종료까지 기다린다. RSS 표본은 전체 프로세스 트리의 엄격한 메모리 quota가 아니다. 네트워크와 run 폴더 밖 쓰기는 `sandbox-exec`로 차단한다. 네트워크·외부 쓰기 거부를 실제 합성 시험으로 확인한다. 이 sandbox는 읽기 격리/zeroization 보장이 아니다.

`prove_output_all`에는 이 버전에서 `-w` 옵션이 없어 `target/witness.gz`를 읽는다. 실행기는 **공개 합성 witness만** 해당 파일에 쓰고 native 종료 후 finally에서 삭제한다. 실제 claim/witness를 받는 CLI나 live mode는 없다. 이 구현을 실제 개인정보용 메모리 전용 경로로 재사용해서는 안 된다. 실행기가 저장하는 program/proof/VK/측정 자료는 gitignore된 연구 artifact이며 공개 원천과 합성 데이터만 사용한다.

별도 `OLD_API prove -w -`는 [get_bytecode.hpp](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/barretenberg/cpp/src/barretenberg/api/get_bytecode.hpp)의 stdin 분기로 raw witness를 받을 수 있는 소스상 후보다. 이번 증명은 그 경로로 실행하지 않았으며 live 메모리 전달 성공으로 기록하지 않는다. 같은 소스는 파일 경로를 내부 shell 명령에 넣으므로 실행기는 따옴표·역슬래시·달러·backtick·개행이 있는 작업 경로도 실행 전에 거부한다.

검증키는 이 정확한 parser 프로그램의 관찰 지문으로 고정한다. 변조된 키와 잘린/늘어난 증명은 native 호출 전에 거부한다. 직접 잘린 증명을 구형 native verifier에 넣으면 abort가 발생한 것을 발견했으며 이를 성공한 거부 검증으로 세지 않는다. 정상 길이의 앞/뒤 바이트 변조는 native의 정상적인 검증 실패(exit1)로 확인한다. public input 변경 검사는 이 구성요소에 적용되지 않으며 EVM에서는 예상하지 않은 public input을 거부하는지만 검사한다.

두 독립 생성의 raw VK는 1,779바이트 중 11바이트가 달랐지만 115개 field 표현은 같았다. 차이는 마지막 비활성 pairing accumulator의 16개 u32 인덱스 영역에만 있었다. [verification_key.hpp](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/barretenberg/cpp/src/barretenberg/plonk/proof_system/verification_key/verification_key.hpp)와 [인덱스 타입](https://github.com/AztecProtocol/aztec-packages/blob/v0.82.2/barretenberg/cpp/src/barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp)의 정확한 배치를 확인했다. `canonicalKey`는 길이와 accumulator/recursive 두 flag가 모두 0인지 먼저 검사하고 그 64바이트만 0으로 만든 뒤 **키 전체 SHA256**을 고정값과 비교한다. 다른 회로나 활성 재귀 키에 적용하는 범용 정규화가 아니다. native verify와 Solidity export는 이 정규화한 키를 사용한다. 원시 키 차이에 따라 달랐던 Solidity key hash도 정규화한 값으로 고정하며 새로운 proof로 native/EVM 수락을 확인한다.

## 채택하지 않은 실험 보존

- `../compact/`: 비공개 trim offset witness와 순차 바이트 비교. 합성 witness 실행은 성공했으나 압축 ACIR 19,783,445 / 해제 466,872,998바이트로 원래 16,747,358 / 394,614,745보다 커졌다. WASM allocator 3,394.94MiB에서 실패. 채택하지 않았다.
- `../field-code/`: 제한된 태그 누적값을 u64 대신 Field로 표현. 압축 16,593,712 / 해제 390,105,437바이트로 약 1% 감소했지만 allocator 3,102.13MiB에서 실패했다. 전체 negative 동등성/안전성 검토를 완료하지 않았고 채택하지 않았다.

두 variant는 측정/반례 보존용이며 제품이나 기본 증명 경로에서 import하지 않는다. 새로운 원인/가정 없이 같은 실패를 반복하지 않는다.

## 다음 통합 관문

1. 서명된 가변 canonical JSON의 private preimage, 공식 signer membership, 정확한 표와 parser를 **한 회로**로 연결한다. 호스트 adapter 성공으로 대체하지 않는다.
2. 기존 회로의 중복 시험/속성·원천 행 marker와 호스트 동등성 차이, 실제 표 용량/문법을 해결한다. 이번 native 성공은 이를 수정한 결과가 아니다.
3. 신청/수취 지갑·정책·신선도와 개인정보를 공개하지 않는 안정적인 원천 재사용 방지, verifier release/키 수명을 구현·검토한다.
4. 관리형 collector와 실제 private witness 처리 경계를 연결한 뒤에만 새 실제 YBM 수집을 요청한다. 현재 로그인 요청 없음.

YBM750+, 시원스쿨50~300%, 일반 후기 AI/Vision 범위를 유지한다. 400/500% 제외, 예치율·배정·PG·회수·분쟁 정책 OPEN. 실제 YBM·새 공식 claim·공개 체인 실행은 없으며 제품 지급은 HOLD다.
