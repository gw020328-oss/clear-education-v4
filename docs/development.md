# 개발 가이드

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

기준 결과: 36개 통과. 전체 제품의 인수 테스트가 아니라 격리된 ProofAdapter 실험입니다. [세부 범위](../spikes/w02-proof-adapter/README.ko.md)

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
