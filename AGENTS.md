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

- W02 A 완료: docs/w02/W02A_REPORT.ko.md 및 w02a-verification.json 참조. 기존 36개+신규 71개 합성 시험 통과. direct-route.mjs는 실제 adapter나 nonce 소비기가 아니다. 다음은 W02 B 합성 원천 추출·연결 격리·저장 경계 시험. MVP의 TEE를 추가 보장으로 분리하는 안은 제안 상태이며, 명시적 기술 결정 없이 기존 필수 TEE 차단을 끄지 않는다. 실제 로그인은 아직 필요하지 않다.

- W02 A 보존 검사: 원본·legacy 소스 191개는 W01과 일치. verify:workspace는 이전 375051e 문서 링크 정리 이후 참고 문서 4개의 W01 지문 불일치로 실패한다. 이번 작업에서 기준 지문을 바꾸지 않았으며, 후속 정리 시 원본 지문과 배포용 참고 문서 지문을 구분한다.

- W02 B 합성 시험 완료: docs/w02/W02B_REPORT.ko.md 및 w02b-verification.json 참조. 신규 62개+회귀 107개 통과. 공식 HTTP provider를 인공 receipt로 검사했으며 실제 Attestor 수집이 아니다. 첫 매치 가림으로 전체 목록 완전성을 주장하지 않는다. Chrome 합성 프로필은 디스크 Cookie DB를 만들어 실제 수집에 부적합하며 제거했다. tmpfs 수명 검사는 통과했지만 Docker noswap 미지원·host/VM 경계가 남아 live 차단 유지. 다음은 OS별 브라우저/서버 저장 경계와 명시적 TEE 결정, 그 후 W02 C 로그인 안내다.

- 저장 경계 준비 후속: docs/w02/STORAGE_PREPARATION.ko.md와 storage-preparation-verification.json 참조. 사용자 답변은 수집 기기 미정이다. 새 spikes/w02-storage-preparation의 읽기 전용 preflight·계획과 37개 시험은 완료했으나 대상 OS/기기 미선택, Linux probe의 swap·고정 Node, host/browser 검토가 남아 있다. 진단 통과도 실제 수집 허용이 아니며 live=false를 유지한다. 현재 Mac의 FileVault/encrypted swap을 무디스크 보장으로 해석하거나 Time Machine/전역 swap을 변경하지 않는다. 기기 선택 뒤 실제 구성과 합성 브라우저 검증, TEE 결정 후 로그인 안내한다.

## 2026년 10월 11일 승인된 최신 범위

- 원래 세션에서 직접 확인한 사용자 승인에 따라 현재 Mac의 관리형 민감정보 저장을 MVP 기준으로 채택했다. Linux PC·전역 무디스크·필수 추가 TEE는 이 경로의 선행 조건이 아니다. 과거 strict tmpfs/TEE spike와 보고서는 보존하며, 통과한 것처럼 고치지 않는다.
- 공식 공증자 서명이 검증된 zkTLS 경로를 사용하고 추가 TEE 보장은 후속이다. 서명·원천 정책·신청/수취 지갑 결합·신선도·중복 차단은 그대로 필요하다.
- 사용자 답변으로 정상/오류 종료 즉시 삭제, 실행 중 24시간 상한, 강제 종료/전원 종료 후 다음 실행 전 정리 예외가 승인되었다. 이는 디스크 흔적의 완전 삭제나 앱 미실행 중 정시 삭제를 보장하지 않는다.
- 신규 구현은 별도 작업본에서 진행한다. 첫 배포 대상은 Apple Silicon Mac 및 설치된 Chrome. 본인 새 YBM 증명→로컬 지급 후 타 사용자 자기 PC/계정 실제 수집 최소 1건, 별도 비개발자 합성 사용성 시험 2명을 구분한다. 실행 가능한 도구와 설치/사용 안내를 준비한다.
- 실제 로그인은 저장·수집 경로 준비 후 사용자에게 안내한다. 합성 시험/패키지 준비와 실제 로그인·증명·지급 완료를 구분한다. 유료 구매·공개 체인 거래·제3자 연락은 포함하지 않는다.
- 최신 정책은 config/mac-managed-storage.json 및 docs/current/MAC_MVP.ko.md를 따른다. docs/reference와 기존 config/environments는 W01 설계 스냅샷이며 새 live release 지문이 아니다.

- Mac 저장 경계 구현: docs/w02/MAC_STORAGE_REPORT.ko.md와 mac-storage-verification.json 참조. 신규 17개+보정 후 재시작 반복 10회 및 압축 해제 패키지 실행 통과. src/mac-collector는 현재 합성 localhost 시험만 허용한다. 공식 동일 client 수집·실제 adapter·지급은 미연결이다. 사용자 실제 로그인은 연결과 합성 리허설 후 안내한다. 새 앱 경로만 Time Machine에서 제외했고 원본/실험 메타데이터와 원본/legacy 191개 지문은 보존했다.

## GitHub 협업 규칙

- 이후 새 작업은 최신 origin/develop에서 codex/작업명 브랜치를 만든다. 현재 전환 작업은 codex/clear-education-v4를 보존한다. 의미 있는 단위로 검사·커밋·해당 작업 브랜치 푸시를 수행하며 main/develop에 직접 푸시하거나 force push하지 않는다.
- 작업 PR은 develop 대상이며 미완료·검토 대기는 Draft다. 전체 통합 검증 뒤 develop→main PR로 반영한다. 파일 선별 복사가 아닌 이력 병합이며 main은 현재 완성 서비스가 아닌 개발 기준본이다.
- PR 생성 후 attach_artifact로 연결한다. 사용자 승인 없이 PR 병합·브랜치 삭제·팀원 초대/권한 변경·검토 우회를 하지 않는다. 이번 승인된 초대는 puppy57201-stack Write 1건이다.
- CI는 .github/workflows/public-synthetic.yml의 공개/합성 경로만 실행한다. 실제 로그인·증명·유료 API·공개 체인 지급·민감 키를 넣지 않는다. 실제 CI 성공 및 검사 이름 확인 뒤에만 필수 보호 검사로 등록한다.
- 푸시 전 tools/check-public-content.mjs로 도달 가능한 이력을 검사하고 값 대신 경로/규칙만 보고한다. 자동 검사만으로 민감정보가 없다고 단정하지 않는다. 협업 규칙은 CONTRIBUTING.md와 docs/github-collaboration.md를 따른다.

## PR #1 검토 후 수정

- 초기화 중 중단은 진행 중 I/O가 끝난 뒤 정리하며, Chrome 시작 실패는 메모리에 잡은 자식 프로세스 그룹의 종료를 확인한 뒤 삭제한다. 초기화/Chrome 기록 저장 중 종료 신호와 오류 재현 시험을 유지한다.
- 세션 소유자는 PID와 시작 시각·부팅 식별자·UID·명령을 함께 비교한다. 과거 PID-only 기록은 실제 worker 가능성이 있으면 보수적으로 차단하고, 재사용된 무관한 프로세스를 종료하지 않는다.
- 패키지는 공식 고정 Node 아카이브를 기존 config SHA-256으로 검증하고 실행 파일·라이선스를 함께 사용한다. 새 복제본 재현 시험은 Mac에서 실행하며 배포 업로드는 하지 않는다.
- 위 과거 W01 문서 지문 실패 메모는 수정 전 이력이다. 원본 reference-inputs.json은 보존하고 별도 공개용 manifest와 기준 Git 커밋으로 검증한다. verify:workspace는 이식 가능한 CI 검사, verify:workspace:local은 로컬 권한·준비 경로를 추가 검사한다. 전체 Git 이력이 필요하다.

- PR #1 강제 종료 후속: Chrome 실행 허용 전에 대기 프로세스 그룹 기록을 닫는다. 기록 없는 과거 Chrome은 정확한 세션 프로필과 그룹 전체 소유/실행 파일 확인 후 종료한다. 조회/종료 실패 때 삭제 완료를 출력하지 않는다. browser-recovery.mjs는 패키지에 포함하며 시험 fixture는 포함하지 않는다.
- hard-kill.test.mjs의 5개 시험(구버전 경로 5회 반복), recovery.test.mjs의 11개 거부/복구 시험을 유지한다. 기존 Linux 필수 검사 외에 Mac synthetic recovery CI를 추가했다. 실제 계정·증명은 사용하지 않는다. 새 검사 추가만으로 브랜치 보호 조건을 변경하지 않는다.

- 최신 협업 정책: 사용자가 각 담당자의 병합 전 코드 리뷰 방식을 선택하여 main/develop의 필수 승인 인원을 0명으로 변경하도록 승인했다. 다른 팀원의 GitHub Approve를 별도로 요구하지 않는다. PR 경유, 기존 필수 CI·최신 기준 브랜치 검사, 검토 대화 해결, 관리자 적용, 강제 푸시·삭제 금지는 유지한다. PR #1 develop 병합도 승인되었으며 main으로의 통합은 별도 작업이다.

- W02 실제 접속 경로: docs/w02/YBM_ROUTE_REPORT.ko.md 참조. 새 src/ybm-collector는 전용 worker의 공식 Attestor 연결을 Chrome HTTPS 중계에 사용한다. 익명 YBM 공개 페이지/Chrome 접속과 정리만 실측했다. 사용자 로그인·원본 수집·새 증명·지급은 미실행이며 기본/ZIP은 계속 합성 전용이다. 로그인 전송 경로 성공을 실제 수집 전체 완료로 기록하지 않는다. 계정 재로그인은 신청/owner 결합과 원천 정책 준비 뒤 요청한다. worker에서 client를 재생성하거나 과거 프로필·증명을 재사용하지 않는다. 새 접속 시험도 CI에서는 외부 네트워크를 차단한다.

- W02 신청/지갑·추출 연결: docs/w02/YBM_BINDING_REPORT.ko.md 참조. 새 --ybm-collection-check는 사용자가 선택한 새 로컬 테스트 지갑으로 서명한 메모리 진단 명령과 원천 형식 확인이다. 배포 vault/예치/제품 동의를 가장하지 않는다. ready 전에는 수집하지 않으며 두 고정 URL/메서드만 읽는다. 실제 형식 검증 전 원천 정책은 후보 상태이고 알 수 없는 형식은 거부한다. HTML 연결 성공을 공식 증명 검증·최고점 확인·환급 자격·지급으로 기록하지 않는다. SDK proof 생성/검증은 별도 후속이다. 기존 합성 ZIP과 원본·실험 자료는 보존한다.

- W02 실제 형식 진단 후속: 동일 지문의 후보 2로 본인 로그인 후 실제 성적·접수 기록의 같은 시험 연결, 로컬 테스트 신청·수취 지갑 결합, 동일 client 및 프로필 정리를 확인했다. docs/w02/ybm-binding-verification.json 참조. 새 증명·공식 서명 검증·지급은 false다. 성적 상세 scoreDetailToeic.php는 수집 대상이 아니며 접수 목록 confirmList.php에서 confirmDetail.php를 연다. 정상 완료 시 창 종료가 오류처럼 보이지 않도록 완료 문구를 유지한다. 다음 증명 단계 추천은 GPT-6 Astra / High다.
