# STWO 인접 버전 호환 시험

로그인·공식 attestor 접속 없이 공식 npm 배포물 5.1.6/5.1.7의 WASM을 비교한다. 입력은 고정 합성 key/nonce/plaintext이며 실제 계정 자료를 읽거나 저장하지 않는다. 네트워크 차단 도구를 먼저 로드한다. 3개 알고리즘 × 2개 생성기에서 증명 6개를 메모리에 만들고 각 검증기로 총 12번 검증한다. 출력은 버전·성공 여부·오류 존재 여부·바이트 수뿐이다.

공식 npm `dist.integrity` 검증을 마친 두 패키지의 압축 해제 디렉터리를 5.1.6, 5.1.7 순서로 넘긴다. 자동 다운로드·설치·재시도는 없다. 실행은 고정 Node 24.21.0에서 `./tools/node spikes/stwo-compatibility/compare.mjs <5.1.6-directory> <5.1.7-directory>`다. 스크립트가 package 버전과 WASM SHA-256을 다시 검사한다. `result.json`은 Mac arm64의 공개 합성 실행 기록이다.

세 알고리즘 모두 동일 버전끼리는 통과하고 교차 버전은 거부됐다. [공식 수정 ec397434](https://github.com/reclaimprotocol/zk-symmetric-crypto/commit/ec3974348444ad85adfe5e21c5152f69c7b93722)는 public input과 암호화 trace의 결합을 보강하며 proof encoding 변경과 prover/verifier WASM 동시 갱신을 명시한다. 엔진 enum 2와 JavaScript 함수 서명이 같아도 wire compatibility가 같지는 않다.

| 버전 | npm gitHead | npm SHA-512 integrity |
| --- | --- | --- |
| 5.1.6 | `394f777fa404ef184652b6efc5aa60884dd55c7e` | `sha512-7D0Dlp4LYGj/ODB1gUMugsuGn80w7Ac4GthpzNqKoHKotTsMtlAPbNrUSU3hdkqNGxa5Jz8LXgVP5RhdHeADZA==` |
| 5.1.7 | `11ab427ab8382227f1b18b2a9caa876253c38784` | `sha512-jGvolBL5zRp9jp2Yhl+et6jRpYG7M/G9uoFrHChCuRkceCjzhnQwAyeNMAiEmUOTNWc4Am8mrXNMA4BJWvV52g==` |

5.1.7의 embedded resource commit은 npm gitHead와 다른 `7e9026fd556fb68e5268e0237b8d3d6c8ea9f4b1`이다. 세 commit의 SnarkJS·gnark resource tree/개별 blob은 동일하다. 현재 설치 경로의 SDK·TLS·STWO loader/WASM 지문은 [실행 지문](../../docs/current/BOOTCAMP_ZK_EXECUTION_FINGERPRINTS_V1.json)을 따른다.

이 시험은 원격 배포 버전, 실제 r9 원인, TLS 전체 handshake 또는 악의적인 custom prover에 대한 보안 감사를 입증하지 않는다. 현재 패킷 경로의 별도 회귀는 `tests/hackerrank-evidence/zk-compatibility.test.mjs`가 담당한다.
