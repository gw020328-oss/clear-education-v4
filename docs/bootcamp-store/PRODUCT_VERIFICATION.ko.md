# P2 저장 검증 기록

> PR80 첫 단계 기록. 후속 R2/E1 검증과 미결은 [R2_VERIFICATION.ko.md](R2_VERIFICATION.ko.md)를 따른다.

2026-10-17. P0 base `03fa64324ef9cc2ce4fb442a612329a7b1285677`. 아래 시험은 새 임시 디렉터리·인공 지갑·합성 자료만 사용했다. Node24.21.0 및 기존 pinned dependencies를 재사용했고 설치/전역 변경은 하지 않았다.

실행 코드 commit: `f1efbee6af817083269c518c82fe29501d5b8554`. 이후 이 파일의 검증 기록만 갱신했다. PR은 P0 위에 쌓인 develop 대상 Draft이며 PR78 선행 인수가 필요하다. 최종 원격 head와 CI 실행 링크/성공 여부는 PR 본문에 기록한다.

- 전용 진입점: `./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/bootcamp-store.test.mjs`.
- 회귀: 같은 guard 아래 `tests/product-workflow/*.test.mjs tests/application/*.test.mjs`.
- 원본 보존·의존성: `./tools/npm run verify:workspace`, `./tools/npm run verify:dependencies`.
- 공개 이력: `./tools/node tools/check-public-content.mjs HEAD`, diff whitespace 및 문서 상대 링크 검사.

| 검사 | 실제 결과 |
| --- | --- |
| 최종 새 P2 ledger/HTTP/경쟁·복구 | **58/58 PASS**, network guard 적용. 두 SQLite handle 및 독립 두 프로세스의 CAS 경쟁, nonce/evidence/decision/command 뒤 4지점 SIGKILL과 hot journal/restart/retry 포함 |
| 기존 workflow+authentication 회귀 | 작업 중 **348/348 PASS**(당시 신규 P2 56개 포함). 이후 P2의 pending revoke/최종 guard·SIGKILL 경계만 보강하고 새 P2 전체58개를 최종 재검증. 기존 API 코드에는 변경 없음 |
| 원본/legacy 보존 | PORTABLE_CONTENT PASS, 원본191개·공개 reference4개·profile3개 지문 유지 |
| 의존성 | ethers6.17.0/ganache7.9.2/solc0.8.30 고정 graph PASS, reference contract 메모리 compile, deployed=false/chainStarted=false |
| 구현 commit 공개 이력 | 274 commits / 1525 blobs / findings0. 최종 문서 commit도 push 전 별도 스캔 |
| 변경 경계/정적 검사 | P0 이후 contracts/legacy/기존 src/application·product-workflow·전용 Moodle/AI/specs·docs/current/package/CI diff 없음. diff whitespace·문서 상대 링크 PASS |

등록 fixture의 reflection 원문에 별도 sentinel을 넣고 SQLite bytes에 원문/입력 body가 남지 않는지 확인했다. 실제 proof·계정·토큰·키로 이 검사를 실행하지 않았다. 소유 합성 worker만 SIGKILL했고 기존 실행 프로세스는 종료하지 않았다.

수락과 거부의 경계는 권한/CSRF/타 지갑, old session request, 논리 source·mapping/trust/receipt/lease 변경, raw/query/auth expiry, clock rollback, request replacement·CAS, old receipt/current 복원 불가, certificate signed freshness, original quote/span, 초과 raw expiry와 임의 verified 플래그, producer timeout/취소/동기 recheck 거부를 포함한다.

348개 회귀에서 기존 Ganache native binding 부재로 순수 JS fallback 안내가 있었지만 시험은 통과했다. 설치나 rebuild를 하지 않았고 이를 Mac 과거 실패 원인의 확정/수정으로 기록하지 않는다.

인수 범위는 [PRODUCT_STORE.ko.md](PRODUCT_STORE.ko.md)의 합성 단일 ledger다. 실제 provider/서명 검증/새 개인자료·C2 relay·P3/P4/P5·배포/병합은 실행하지 않는다. 기존 금고·DB·체인·키는 변경하지 않는다. Mac fixture 수명 경쟁의 재현·수정과 원래 실패 CI의 정확한 IPC 순서 미관측을 구분한다([PR67 검토](../current/PR67_FINAL_REVIEW.ko.md)). 이번 작업에서 Mac 원인 진단을 다시 실행하지 않았다.
