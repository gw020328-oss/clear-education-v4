# 개발 가이드

공통 세션 흐름(2026-10-13): [이슈 #28](https://github.com/gw020328-oss/clear-education-v4/issues/28), [클라이언트 흐름 계약](current/PROOF_FLOW.ko.md). PR #27 병합 `77d1c4b` 위에서 생성·검토·지갑 승인·세션/결과 조회·취소와 응답 유실 복구를 구독 가능한 상태로 연결했다. F0 화면은 별도이며 HTTP/DB/정책/금고/Moodle 계약을 변경하지 않는다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류·독립 청구 제품 전환 NO-GO를 유지한다.

공통 증명 세션 승인(2026-10-13): [이슈 #26](https://github.com/gw020328-oss/clear-education-v4/issues/26), [지갑 승인 도구](current/PROOF_WALLET.ko.md). PR #25 병합 `51ee66b` 위에서 기존 B1 서명/HTTP 계약을 재사용하는 `authorizeProofSession`을 추가했다. 검토한 문맥·독립 owner 공개키·중단/만료·응답 유실을 검사한다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류는 유지하며 HTTP/DB/정책/금고/화면은 변경하지 않는다.

B3 후속의 [학습 provider·Moodle 연결 명세](current/LEARNING_PROVIDER.ko.md)는 기존 `./tools/npm run test:learning-evidence`로 검증한다. 새 합성 시드 provider는 B3 driver와 최소 evaluator snapshot을 유지하며 실제 Moodle 설치/토큰/외부 호출은 필요하지 않다.

공통 브라우저 오류·요청 복구 시험은 기존 `./tools/npm run test:applications`에 포함된다. [안전한 오류/시간 초과/취소/응답 유실 계약](current/API_RECOVERY.ko.md)을 확인한다. loopback HTTPS와 합성 데이터만 쓰며 UI·실제 원천·지급 검증과 구분한다.

## 협업 절차

작업은 최신 `origin/develop`에서 만든 개별 브랜치에서 진행합니다. Codex 브랜치는 `codex/작업명`이며 검증 가능한 단위마다 커밋·푸시합니다. 작업 PR은 `develop`을 대상으로 하고, 통합 검증 뒤 별도 `develop` → `main` PR을 만듭니다. `main`은 현재 개발 기준본이며 완성 서비스가 아닙니다. [기여 안내](../CONTRIBUTING.md)

## 런타임

B3 학습 입력의 합성 계약/adapter 시험은 `./tools/npm run test:learning-evidence`다. [제공자 미확인·버전/기간/완전성 경계](current/LEARNING_EVIDENCE.ko.md)를 따른다. 실제 endpoint·인증·제품 DB/HTTP/UI와 지급 구조를 추가하지 않는다. grant/outbox 전용 확대는 [최신 계획](current/TEAM_PLAN.ko.md)에 따라 보류한다.

B2b 합성 제품 수집·독립 검증·원자 수락 시험은 `./tools/npm run test:product-proof`다. [서버 원천 설정·schema 4·실경로 차단](current/PRODUCT_PROOF.ko.md)을 확인한다. 기본 C1 환경은 자동으로 제품 수집을 켜지 않으며 기존 DB/체인/키를 reset하거나 편집하지 않는다.

B2a 전체 시험 증거 계약의 합성 검증은 `./tools/npm run test:exam-evidence`로 실행한다. [원천 신뢰 경계와 재현](current/EXAM_EVIDENCE.ko.md)을 먼저 확인한다. 실제 YBM 로그인·외부 RPC·기존 DB/체인을 사용하지 않는다.

로컬 합성 HTTPS 서버·DB·TEST 체인의 초기화/실행/재시작은 [C1 개발 환경 안내](current/LOCAL_SYNTHETIC.ko.md)를 따릅니다. 프론트 `web/dist`를 같은 origin에서 제공하며, 기존 정책 선언용 환경 설정과 독립된 개발 환경을 만듭니다.

Node.js **24.21.0**, npm **11.19.0**을 사용합니다. `.nvmrc`, `.node-version`, `package.json`이 기준입니다. 런타임 바이너리는 저장소에 포함하지 않습니다.

macOS/Linux의 셸에서 실행하세요. Windows는 WSL 환경을 사용하세요. 이는 셸 안내이며 모든 운영체제의 실행 성공을 검증한 것은 아닙니다.

```sh
./tools/node --version
./tools/npm --version
```

`tools/node`와 `tools/npm`은 프로젝트의 로컬 런타임이 있으면 사용하고, 없으면 PATH의 고정 버전을 확인합니다. 버전 오류가 나면 지정한 버전을 설치하고 PATH를 확인하세요.

## 독립적으로 실행할 수 있는 테스트

```sh
./tools/npm --prefix spikes/w02-proof-adapter ci --ignore-scripts
./tools/npm --prefix spikes/w02-proof-adapter test
```

이 테스트는 루트 의존성·환경 준비·YBM 로그인 없이 실행할 수 있습니다. 패키지 설치에는 네트워크가 필요하지만 시험은 합성 자료를 사용합니다. API 키나 실제 자금을 입력하지 마세요.

현재 ProofAdapter 기준 결과: 107개 통과. 전체 제품의 인수 테스트가 아니라 격리된 ProofAdapter 실험입니다. [세부 범위](../spikes/w02-proof-adapter/README.ko.md)

## 공개 합성 CI

`.github/workflows/public-synthetic.yml`은 `main`·`develop` 대상 PR과 `codex/**` 푸시에서 실행됩니다. 저장소 읽기 권한만 사용하고 Action 버전을 commit SHA로 고정합니다. 설치는 lockfile과 `--ignore-scripts`를 사용하며 원본 증명·계정·지갑 자금은 필요하지 않습니다.

| 검사 이름 | 실행 범위 |
| --- | --- |
| `Public content history` | 공개 자료 검사기 시험 3개, 전체 도달 가능한 커밋의 금지 경로·자격 증명 패턴 검사 |
| `Public synthetic tests` | 의존성·메모리 컴파일, ProofAdapter 107개, 원천/연결/저장 62개, 저장 준비 37개, 관리형 저장 단위 16개, 초기화 중단/오류 2개, 브라우저 복구 로직 11개, 새 복제본 원본·공개 문서 지문 및 변조 거부 검사 |

`Mac synthetic recovery`는 `macos-15` Apple Silicon runner에서 합성 Chrome 수명·강제 종료 복구·패키지 실행까지 확인합니다. 새로 추가한 검사이며 기존 필수 보호 검사 이름 2개는 변경하지 않습니다.

추가 로컬 명령:

```sh
./tools/npm --prefix spikes/w02-collector-boundary ci --ignore-scripts
./tools/npm --prefix spikes/w02-collector-boundary test
./tools/npm --prefix spikes/w02-storage-preparation test
./tools/node --test tests/mac-collector/storage.test.mjs
./tools/node --test tests/public-content.test.mjs
./tools/node tools/check-public-content.mjs HEAD
```

Linux CI는 공개 합성 로직 검사를 수행하고, 별도 Mac CI가 설치된 Chrome으로 강제 종료/재시작 경계를 검사합니다. Apple Silicon Mac에서는 `./tools/node --test tests/mac-collector/*.test.mjs tests/workspace-integrity.test.mjs`로 Chrome 실행·강제 종료 후 복구, 초기화/Chrome 시작 중 중단·오류, 새 복제본 패키지 생성·압축 해제 실행까지 확인합니다. 패키지 시험은 공식 Node 배포 파일 다운로드를 위해 네트워크가 필요합니다. 실제 YBM 로그인·증명, TEE 실측, 유료 API, 실제 개인키, 공개 체인 지급, 컨테이너 생성 및 배포 패키지 업로드는 CI에 넣지 않습니다. CI의 초록색 상태는 전체 제품 완료를 뜻하지 않습니다.

필수 검사 등록은 실제 GitHub 실행 성공 이후에만 적용합니다. 협업 전환과 검토 규칙은 [GitHub 운영 안내](github-collaboration.md)를 따릅니다.

## 전체 개발 환경 준비

```sh
./tools/npm ci --ignore-scripts
./tools/npm run prepare:workspace
./tools/npm run verify:workspace
./tools/npm run verify:dependencies
```

- `prepare:workspace`: Git에서 제외된 환경별 작업 디렉터리 준비
- `verify:workspace`: 전체 Git 이력을 이용한 원본·공개 문서/legacy 지문 및 설정 검사. 브랜치 이름·로컬 준비 경로에 의존하지 않음
- `verify:workspace:local`: 위 검사에 legacy 읽기 전용 권한과 준비된 로컬 디렉터리 존재 검사를 추가
- `verify:dependencies`: 고정 의존성과 기존 계약의 메모리 컴파일 확인

`docs/w01/reference-inputs.json`의 원본 지문은 변경하지 않습니다. W01 커밋의 원본과 공개 링크 정리 커밋의 공개용 문서를 각각 검증합니다. 공개용 지문은 `docs/reference/published-fingerprints.json`에 별도로 기록합니다. CI는 전체 이력을 가져오며, 얕은 복제본은 `git fetch --unshallow` 후 다시 검사합니다. 임의로 지문만 갱신하면 기준 커밋과 달라 실패합니다.

위 명령은 전체 서비스 실행, 실제 증명 생성, 체인 배포를 의미하지 않습니다. `legacy/package.json`의 과거 실행기는 신규 프로젝트의 검증 명령이 아닙니다.

## 환경 구분

| 환경 | 용도 | 예정 chainId |
| --- | --- | --- |
| `local-synthetic` | 로컬 합성 자료 시험 | 431701 |
| `local-real-ybm` | 향후 실제 YBM 통합 시험 | 431702 |
| `remote-synthetic` | 향후 원격 사용자 체험 | 431703 |

`config/manifests/*.pending.json`은 미배포 자리표시자입니다. 실제 청구에 사용할 수 없습니다. 환경 설정은 정책 선언이며 DB·노드·삭제 작업까지 구현됐다는 뜻은 아닙니다.

## 문제 해결

| 증상 | 확인할 내용 |
| --- | --- |
| 런타임 버전 불일치 | 지정 Node/npm 버전과 PATH 확인 |
| 패키지를 찾을 수 없음 | 루트와 `spikes/w02-proof-adapter`의 설치 위치를 구분 |
| 과거 화면이 실행되지 않음 | `legacy/`는 자료 일부가 제외된 소스 참고본 |
| YBM 로그인 또는 API 키를 요구함 | 위 합성 시험 경로가 맞는지 확인. 현재 공개 테스트에는 필요하지 않음 |

자격 증명과 실행 데이터는 `.gitignore` 대상입니다. 실제 증명 수집은 준비된 저장·로그·삭제 경계를 별도로 검증한 뒤 진행합니다.

## Mac 패키지 재현

Apple Silicon Mac에서 고정 Node 버전을 PATH에 준비한 뒤 실행합니다. 숨겨진 `.toolchain` 복사나 별도 라이선스 파일 준비는 필요하지 않습니다.

```sh
./tools/node tools/package-mac-collector.mjs
```

`config/toolchain.json`의 공식 Node 배포 URL과 SHA-256을 사용합니다. 동일 검증 아카이브의 실행 파일·LICENSE를 함께 패키징하고 버전·OS·아키텍처를 확인합니다. 다운로드·검증·압축에 실패하면 기존 패키지를 교체하지 않습니다. 결과는 Git에서 제외된 `artifacts/mac-collector/`에 생성하며 자동 업로드하지 않습니다. 압축 파일은 타임스탬프 때문에 빌드마다 지문이 달라질 수 있고, 포함 파일 지문은 MANIFEST에 기록합니다.

## Chrome 강제 종료 복구

새 실행은 대기 프로세스의 그룹 번호를 `browser.json`에 저장하고 파일을 닫은 뒤에만 Chrome 시작을 허용합니다. 그 전에 부모가 죽으면 파이프 EOF로 대기 프로세스가 끝나므로 기록 없는 새 Chrome은 시작되지 않습니다. 전원이 꺼지는 경우 디스크 동기화/완전 삭제 보장을 추가한 것은 아닙니다.

이전 버전의 기록 없는 Chrome도 세션의 정확한 프로필 경로로 검색하고, 사용자·실행 파일·그룹 구성원을 확인한 뒤 종료합니다. 기록 누락·빈 파일·부분 JSON은 프로세스가 없다는 증거로 취급하지 않습니다. 프로세스 조회나 소유 확인에 실패하면 폴더 삭제를 중단합니다. 다른 프로필과 다른 사용자의 프로세스는 종료하지 않습니다.

새 `hard-kill.test.mjs`는 시작 허용 전/기록 도중/허용 후 SIGKILL과 이전 버전의 기록 없는 시작(5회)을 검사합니다. 각 재실행은 삭제 완료 출력 뒤에도 옛 프로필과 브라우저 프로세스가 남지 않는지 확인합니다. `recovery.test.mjs`는 조회 실패·다른 사용자/프로필·PID 재사용·종료 거부를 Linux CI에서도 검사합니다.

Runner 구성 근거: [GitHub 표준 runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Mac 15 Arm64 이미지](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-arm64-Readme.md).

## B1 제품 증명 세션

[세션·영속 nonce와 현재 예치 재검증](current/PROOF_SESSIONS.ko.md)을 확인한다. `./tools/npm run test:proof-sessions`는 새 격리 TEST 체인과 임시 DB/HTTPS로 실행하며 공개 합성 CI에도 포함된다. schema 3은 같은 환경의 v1/v2 DB를 원자 이관한다. 실제 proof 수집·검증 수락·outbox는 후속이다.
