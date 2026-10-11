# W02 B 합성 원천과 수집 경계 시험

실제 Reclaim HTTP provider를 호출하는 인공 receipt 시험, 독립 프로세스와 합성 TCP 연결 시험, 합성 staging 수명 주기 시험이다. 실제 YBM·TLS/zk 생성·공식 공증자 연결·제품 API·지급은 구현하지 않는다. 모든 실제 수집 차단을 유지한다.

작업본 루트에서 `./tools/npm --prefix spikes/w02-collector-boundary test`를 실행한다. 신규 62개 시험을 포함한다. `@reclaimprotocol/attestor-core` 5.1.4, ethers 6.17.0과 별도 lockfile을 사용하며 루트·기존 spike 의존성을 바꾸지 않는다. 설치 시 `--ignore-scripts`를 사용했다. 현재 정규식은 RE2 없이 native RegExp 대체 경로다.

- `extraction.mjs`: 고정 합성 HTML 문법과 실제 provider 가림·receipt 검사. 전체 목록의 완전성을 증명하지 않는다.
- `isolation.mjs`, `collector-worker.mjs`: 부모 IPC와 신청별 자식 프로세스. 브라우저/native messaging/실제 Attestor를 구현하지 않는다.
- `storage.mjs`: 합성 문자열만 허용하는 staging. 제품 raw proof API, DB 원자성, 자동 정리 서비스가 아니다. 로컬 디스크 fixture는 합성 데이터 전용이다.
- `test-storage-container.mjs`: 기존 로컬 Docker 이미지로 tmpfs 수명 주기를 검사한다. 이미지가 없으면 실패하며 pull하지 않는다. `--require-noswap`은 별도 필수 옵션 probe다. 현재 저장 경계는 미통과다.
- `test-browser-synthetic.mjs`: macOS의 별도 headless Chrome 프로필 2개와 loopback 합성 사이트를 사용한다. 디스크 Cookie DB 생성을 확인하고 제거한다. 이 경로는 실제 인증정보 수집용이 아니다.

시험 중 `.fixture-w02b-*`에는 합성 표식만 만들고 제거한다. Chrome fixture는 `.toolchain/w02b/` 아래다. 별도 probe를 중단했다면 해당 시험이 만든 프로세스·컨테이너·디렉터리만 정리한다. 기존 개인 Chrome 프로필·과거 실험 실행기는 사용하지 않는다. 소스 코드의 synthetic 제한을 없애서 실측에 사용하는 것은 허용된 이식 경로가 아니다.

[결과와 남은 조건](../../docs/w02/W02B_REPORT.ko.md), [기계 판독 기록](../../docs/w02/w02b-verification.json)을 참고한다.
