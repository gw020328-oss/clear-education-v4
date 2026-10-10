# CLEAR v4 작업본 지침

- 각 작업 단위 시작 전에 추천 모델·추론 수준·이유를 사용자에게 표시한다. 추천과 실제 실행 설정을 구분한다. W01: GPT-6.1 Sol / medium, W02: GPT-6 Astra / high. 이후 작업은 docs/reference/IMPLEMENTATION_PLAN.ko.md 표를 따른다.
- 이 디렉터리만 Git 범위로 사용한다. 홈 디렉터리 Git 및 원본 프로젝트에는 쓰지 않는다. 원본과 과거 실험 경로는 docs/w01/source-copy.json 및 preservation-before.json에 있다.
- legacy/는 변경하지 않는 코드 참고본이다. 자동 실행하지 않는다. 신규 구현은 src/, contracts/, tests/에 작성하고 v2/v3 데이터·서명·패킷을 v4로 재사용하지 않는다.
- W01은 환경 준비까지만 승인되었다. W02 이후 기능 구현은 해당 요청을 받으면 시작한다. 공개 체인 거래·실제 증명 생성·유료 호출·배포는 W01 검증에 포함하지 않는다.
- 이후 사용자 요청으로 W02 기술 확인을 진행했다. 현재 docs/w02/verification.json의 실제 연결 차단 조건을 먼저 확인한다. 사용자의 Reclaim 콘솔 로그인은 완료되었으므로 다시 같은 로그인을 요구하지 않는다. 실제 YBM 로그인·새 증명 생성에 사용자가 필요한 시점에 안내한다. 합성 spike 성공을 실제 연결 성공으로 기록하지 않는다.
- W02 후속에서 Chrome 로그인도 사용자가 완료했다. 세션 오류는 두 브라우저에서 같으며 수동 builder의 backend DNS A/AAAA 부재를 확인했다. docs/w02/SESSION_DIAGNOSIS.ko.md를 참고하고 반복 로그인을 해결책으로 요구하지 않는다. AI builder는 입력 화면만 확인했으며 등록·비용·실제 데이터 흐름은 미검증이다.
- 실행은 tools/node 또는 tools/npm을 사용한다. 전역 Node 버전과 전역 패키지를 변경하지 않는다. legacy/package.json의 test는 과거 재현 실행기이며 새 프로젝트의 검증 명령이 아니다.
- private/, data/, var/, .toolchain/는 Git에 넣지 않는다. 실제 증명·쿠키·개인키를 읽거나 로그·보고서·fixture에 복사하지 않는다. 합성 시험과 실제 YBM 환경을 혼용하지 않는다.
- config/manifests/*.pending.json은 배포 전 자리표시자다. 청구용 manifest로 사용하지 않는다. 실측 배포 지문 및 release 서명 없이 usableForClaim을 켜지 않는다.
- var/*/raw-proof 디렉터리를 디스크 원본 저장소로 사용하지 않는다. tmpfs와 보존 경계 검증 전에는 실제 증명을 수집하지 않는다. 실패한 tmpfs를 디스크로 대체하지 않는다.
- 환경별 chainId·instanceId·DB·키·데이터를 분리한다. 열린 권리가 있는 체인 reset이나 instanceId 재생성을 수행하지 않는다.
- 문서상 완료와 실제 검증 완료를 구분한다. 제품 코드와 저장 경계가 아직 없으면 준비 설정만으로 완료했다고 주장하지 않는다.

- W02 경로 정정: 다른 세션의 공식 Attestor 동일 client 경로에서 실제 YBM 증명 생성·연결 성공을 확인했다. docs/w02/REPORT.ko.md 마지막 절을 우선한다. 수동 builder 오류나 빈 콘솔 provider 목록을 전체 연결의 필수 장애물로 취급하지 않는다. 직접 경로의 신청·지갑·TEE·저장 경계 적합성 검토가 다음이며, 과거 진단 스크립트를 원본 위치에서 재실행하지 않는다.

- W02 v4 적용 설계 검토 완료: docs/w02/V4_ROUTE_DESIGN.ko.md 및 v4-route-review.json을 따른다. 직접 Attestor 경로는 조건부 후보이고 실제 수집은 비활성이다. 다음 W02 A는 공개·합성 TEE/owner/context 호환성 시험이다. 기존 TEE 요구를 묵시적으로 낮추지 말고, 원본 실행기·디스크 브라우저 프로필을 재사용하지 않는다. 이번 설계 요청은 제품 구현·실제 로그인을 실행한 것이 아니다.
