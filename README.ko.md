# CLEAR v4 별도 작업본

W01 환경 준비용 저장소다. 기존 프로젝트와 실험 원본은 원래 위치에 보존하고, 선택한 코드 191개를 `legacy/`에 바이트 그대로 복사했다. 코드 참고본은 읽기 전용이며 출력·증명·쿠키·키·설치 패키지·실험 원본은 복사하지 않았다. JSON은 package/lockfile과 출력 schema만 허용했다. 자격 증명처럼 보이는 문자열을 포함한 과거 시험 스크립트 1개도 복사 대상에서 제외했다. 이는 전체 과거 실험의 실행 가능한 복제본이 아니다.

2026-10-10 W02 업데이트: [ProofAdapter 기술 확인](docs/w02/REPORT.ko.md)의 오프라인 시험 36개 통과. 실제 YBM 연결은 provider 작성 세션 오류와 미확인 브라우저 binding 때문에 미완료다. 코드는 `spikes/w02-proof-adapter/`에 격리했다. Reclaim 콘솔 로그인은 사용자가 완료했으며 YBM 로그인·새 증명 생성은 아직 하지 않았다.

W02 후속: Chrome에서도 세션 오류 재현. 수동 builder의 서버 DNS 주소 부재를 확인했다. [진단 및 대체 경로](docs/w02/SESSION_DIAGNOSIS.ko.md)를 참고한다. 두 브라우저 로그인은 완료됐다.

새 기능은 `src/`, `contracts/`, `tests/`에서 시작한다. W01에서는 기능을 구현하지 않았고 기존 재현 실행기도 실행하지 않았다.

## 실행

작업본 루트에서 다음 명령을 사용한다. 전역 Node 25 대신 작업본의 Node **24.21.0**과 npm **11.19.0**을 사용한다. [Node 공식 릴리스 목록](https://nodejs.org/en/about/previous-releases)에서 24 계열 LTS를 확인하고 [공식 배포 체크섬](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt)과 내려받은 macOS arm64 파일을 비교했다. 바이너리는 Git 제외 디렉터리 `.toolchain/`에 있다.

```sh
./tools/node --version
./tools/npm --version
./tools/npm ci --ignore-scripts
./tools/npm run prepare:workspace
./tools/npm run verify:workspace
./tools/npm run verify:dependencies
```

다른 컴퓨터에서는 `.nvmrc`에 지정된 정확한 Node와 packageManager의 npm을 설치한다. `tools/node`, `tools/npm`은 그 버전의 PATH 실행 파일도 허용하며 다른 버전은 거부한다. 고정한 ethers 6.17.0·ganache 7.9.2·solc 0.8.30 및 전이 의존성은 원본 lockfile 그래프를 유지했다. 새 SDK와 PostgreSQL 버전은 W02·W06에서 확인해 고정한다. 의존성 검증은 ethers 연산·기존 계약의 메모리 컴파일이며 Ganache 체인 기동이나 배포 호환성 검증은 아직 아니다.

## 환경 준비

| 환경 | dataMode | 예정 chainId | 데이터 경로 |
| --- | --- | --- | --- |
| local-synthetic | SYNTHETIC | 431701 | data/local-synthetic/ |
| local-real-ybm | REAL_YBM | 431702 | data/local-real-ybm/ |
| remote-synthetic | SYNTHETIC | 431703 | data/remote-synthetic/ |

각 환경은 schemaVersion 4, 서로 다른 instanceId, DB 이름, 개인 설정·체인 상태·출력 경로를 갖는다. chainId는 이 프로젝트의 전용 체인을 위한 예정값이며 체인 기동 후 RPC가 실제 반환하는 값과 일치하는지 확인해야 한다. 실제 DB·키·노드·tmpfs·배포·접속 주소는 아직 없다. manifest는 `PENDING_DEPLOYMENT`이며 계약 주소·genesis·build·서명은 null이다. 실측값을 만들기 전에 가짜 지문을 넣지 않는다.

원본 증명 저장은 tmpfs 필수·디스크 대체 금지·최대 24시간·패킷 발급 시 삭제로 선언했다. 잔여 서비스 자료는 최종 청구 마감 후 최대 30일이다. 이는 정책 준비이며 삭제 작업·암호화·백업 경계 구현 완료를 뜻하지 않는다. 날짜는 미확정이며 서비스 시작은 비활성 상태다.

## 작업 안내

W01 추천 모델: **GPT-6.1 Sol / medium** — 범위가 명확한 작업본·도구 준비.

다음 W02 추천 모델: **GPT-6 Astra / high** — YBM 두 원천 증명의 신뢰 경계와 신청·지갑 문맥 결합 확인. 모델을 자동으로 변경하지 않는다. 단계별 전체 권고는 [구현 계획](docs/reference/IMPLEMENTATION_PLAN.ko.md)에 있다.

[W01 결과](docs/w01/REPORT.ko.md), [복사 목록과 원본 해시](docs/w01/source-copy.json), [기술 설계](docs/reference/DESIGN.ko.md), [PRD](docs/reference/PRD.ko.md)를 참고한다.
