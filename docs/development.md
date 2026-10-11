# 개발 가이드

## 협업 절차

작업은 최신 `origin/develop`에서 만든 개별 브랜치에서 진행합니다. Codex 브랜치는 `codex/작업명`이며 검증 가능한 단위마다 커밋·푸시합니다. 작업 PR은 `develop`을 대상으로 하고, 통합 검증 뒤 별도 `develop` → `main` PR을 만듭니다. `main`은 현재 개발 기준본이며 완성 서비스가 아닙니다. [기여 안내](../CONTRIBUTING.md)

## 런타임

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
| `Public synthetic tests` | 의존성·메모리 컴파일, ProofAdapter 107개, 원천/연결/저장 62개, 저장 준비 37개, 관리형 저장 단위 13개 |

추가 로컬 명령:

```sh
./tools/npm --prefix spikes/w02-collector-boundary ci --ignore-scripts
./tools/npm --prefix spikes/w02-collector-boundary test
./tools/npm --prefix spikes/w02-storage-preparation test
./tools/node --test tests/mac-collector/storage.test.mjs
./tools/node --test tests/public-content.test.mjs
./tools/node tools/check-public-content.mjs HEAD
```

CI는 Linux의 합성 시험만 포함합니다. 실제 Chrome 실행/프로세스 정리 4개 통합 시험은 Apple Silicon Mac에서 `./tools/node --test tests/mac-collector/lifecycle.test.mjs`로 별도 실행합니다. 실제 YBM 로그인·증명, TEE 실측, 유료 API, 실제 개인키, 공개 체인 지급, 컨테이너 생성 및 배포 패키지 업로드는 CI에 넣지 않습니다. CI의 초록색 상태는 전체 제품 완료를 뜻하지 않습니다.

필수 검사 등록은 실제 GitHub 실행 성공 이후에만 적용합니다. 협업 전환과 검토 규칙은 [GitHub 운영 안내](github-collaboration.md)를 따릅니다.

## 전체 개발 환경 준비

```sh
./tools/npm ci --ignore-scripts
./tools/npm run prepare:workspace
./tools/npm run verify:workspace
./tools/npm run verify:dependencies
```

- `prepare:workspace`: Git에서 제외된 환경별 작업 디렉터리 준비
- `verify:workspace`: 환경·설정·파일 경계 검사
- `verify:dependencies`: 고정 의존성과 기존 계약의 메모리 컴파일 확인

`verify:workspace`는 이전 참고 문서 링크 수정에 따른 W01 지문 불일치로 현재 실패합니다. 또한 특정 초기 작업 브랜치와 로컬 준비 경로를 가정하므로 이번 필수 CI에서 제외합니다. 기존 원본 지문을 성공값으로 바꾸지 않으며, 원본/배포 참고본 지문 구분은 후속 정리 대상입니다.

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
