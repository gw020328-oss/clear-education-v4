# P2 저장 검증 기록

2026-10-17. P0 base `03fa64324ef9cc2ce4fb442a612329a7b1285677`. 아래 시험은 새 임시 디렉터리·인공 지갑·합성 자료만 사용했다. Node24.21.0 및 기존 pinned dependencies를 재사용했고 설치/전역 변경은 하지 않았다.

실행 코드 commit·최종 test/CI 숫자는 제출 전 기록한다.

- 전용 진입점: `./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/bootcamp-store.test.mjs`.
- 회귀: 같은 guard 아래 `tests/product-workflow/*.test.mjs tests/application/*.test.mjs`.
- 원본 보존·의존성: `./tools/npm run verify:workspace`, `./tools/npm run verify:dependencies`.
- 공개 이력: `./tools/node tools/check-public-content.mjs HEAD`, diff whitespace 및 문서 상대 링크 검사.

인수 범위는 [PRODUCT_STORE.ko.md](PRODUCT_STORE.ko.md)의 합성 단일 ledger다. 실제 provider/서명 검증/새 개인자료·C2 relay·P3/P4/P5·배포/병합은 실행하지 않는다. 기존 금고·DB·체인·키는 변경하지 않는다. Mac recovery CI가 성공해도 과거 실패 원인 미확정은 유지한다.
