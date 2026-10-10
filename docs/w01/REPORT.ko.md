# W01 작업본 준비 결과

2026년 10월 10일 · 추천 모델 **GPT-6.1 Sol / medium** · 이유: 작업 범위와 보존 기준이 명확한 기반 준비. 추천은 실제 모델 자동 전환을 뜻하지 않는다.

**W01 준비 완료.** 새 작업본에서 의존성 설치와 환경 검증을 마쳤다. 원본 프로젝트와 실험에는 쓰지 않았고 기능 구현은 시작하지 않았다.

## 새 작업 위치와 Git

- 작업본: `/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4`
- 별도 로컬 Git 저장소: 위 디렉터리의 `.git/`
- 브랜치: `codex/clear-education-v4`
- 원본에는 자체 `.git/`이 없어 worktree 대신 독립 저장소를 만들었다. 홈 디렉터리 Git을 작업 범위로 사용하지 않았다.
- 원격 저장소 연결·push·배포는 하지 않았다. 보존된 legacy 코드와 W01 설정을 초기 기준점으로 저장한다.
- 작업본의 줄바꿈 설정을 LF로 고정하되 `legacy/`와 문서 스냅샷은 Git의 줄바꿈 변환을 끄고 바이트를 그대로 저장한다. 전역 Git 설정은 바꾸지 않는다.

## 원본 보존

원본 프로젝트의 코드·package/lockfile·출력 schema 중 191개를 `legacy/`에 복사하고 읽기 전용으로 두었다. 복사 목록은 [source-copy.json](source-copy.json)에 있다. 각 파일의 SHA-256은 원본·복사본·작업 종료 시 원본에서 일치했다. 기존 v3 계약을 포함해 참고 코드의 내용은 바꾸지 않았다.

전체 원본 프로젝트 26,857개 항목과 실험 경로 92,550개 항목의 경로·mode·크기·mtime·ctime으로 계산한 메타데이터 지문도 작업 전후 같았다. [작업 전](preservation-before.json), [작업 후](preservation-after.json) 기록에서 확인할 수 있다. 실험 증명·쿠키·키의 내용은 열거나 복사하지 않았다. 비공개 실험 파일 전체의 바이트 해시를 검사했다고 주장하지 않는다.

설치 패키지·과거 출력·raw·private·runtime·tmp·symlink는 복사하지 않았다. 코드 외 JSON은 package/lockfile과 schema로 제한했다. 자격 증명처럼 보이는 문자열이 탐지된 `stage14/tests/no-network-cap.mjs` 1개는 복사 대상에서 제외했다. 원본은 그대로 있다. 따라서 `legacy/`는 과거 모든 실험을 재실행하기 위한 완전 복제본이 아니다.

PRD·기술 설계·구현 계획·감사 보고서 4개는 `docs/reference/`에 스냅샷으로 두고 해시를 기록했다. 이 스냅샷의 과거 상태 설명은 W01 완료 상태를 대신하지 않는다.

## 고정 도구와 환경

Node **24.21.0**, 그 공식 배포에 포함된 npm **11.19.0**을 작업본 전용 `.toolchain/`에 설치했다. 전역 런타임은 변경하지 않았다. [Node 공식 릴리스 목록](https://nodejs.org/en/about/previous-releases)의 LTS 계열을 선택하고 [공식 SHA-256 목록](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt)과 다운로드 파일을 비교했다. `.nvmrc`, `.node-version`, engines, packageManager, toolchain 설정과 실행 wrapper가 정확한 버전을 고정한다.

ethers **6.17.0**, ganache **7.9.2**, solc **0.8.30**과 원본 lockfile의 전이 의존성 그래프를 유지했다. `npm ci --ignore-scripts`로 새 작업본에 354개 패키지를 설치했다. 과거 실행기의 `test` 대신 W01 검증 스크립트만 등록했다. Ganache 체인 기동·네이티브 모듈 호환성과 배포용 의존성 검토는 아직 수행하지 않았다. Reclaim SDK와 PostgreSQL은 각각 W02·W06에서 경로를 확인해 고정한다.

| 환경 | schemaVersion | 예정 chainId | 상태 |
| --- | --- | --- | --- |
| local-synthetic | 4 | 431701 | 합성 로컬 준비 |
| local-real-ybm | 4 | 431702 | 실제 YBM 로컬 준비 |
| remote-synthetic | 4 | 431703 | 원격 합성 체험 준비 |

환경별 instanceId·DB 이름·체인 상태·자료·개인 설정·원본 mount 경로를 분리했다. 상태는 `PREPARED_NOT_STARTED`, 서비스 시작은 비활성이다. 실제 DB·키·노드·tmpfs·호스팅은 아직 없다. 데이터와 개인 설정 경로는 권한 0700으로 준비하고 Git에서 제외했다.

환경별 pending manifest는 배포 전 초안이며 계약·genesis·배포 블록·해시·release 서명은 null, URL 목록은 비어 있다. `usableForClaim=false`로 두었다. W01의 환경 설정은 CoursePolicyV4/RuntimeConfigV4 구현이나 실제 DeploymentManifestV4의 대체물이 아니다.

원본 보존 최대 24시간·발급 후 삭제·tmpfs 필수·디스크 대체 금지, 잔여 자료의 마감 후 최대 30일을 준비 설정에 명시했다. raw-proof 폴더는 빈 mount 예정 위치이며 실제 증명을 저장할 수 있는 준비된 저장소가 아니다. 보존 작업과 암호화·백업 경계는 뒤 단계에서 구현·검증해야 한다. 반 운영기간과 제출 날짜는 여전히 미확정이다.

## 검증 결과

[verification.json](verification.json)의 7개 검증 항목이 통과했다.

- 191개 참고본 내용·읽기 전용 상태·목록 일치, 문서 스냅샷 해시, 원본 lockfile 그래프 보존.
- 환경별 식별자·chainId·DB·데이터 경로 격리와 Git 제외, 배포 전 manifest의 청구 비활성.
- 잘못된 설정 3종 거부: instanceId 중복, pending manifest 청구 활성화, 원본 mount 경로 누락.
- 설치된 정확한 의존성 버전, ethers의 알려진 해시 값, 기존 stage15 계약의 메모리 컴파일.
- 원본·실험 메타데이터 지문 및 선택한 원본 코드 191개 해시 불변.

계약을 배포하거나 체인을 기동하지 않았다. 제품 A01–A18/U01–U06 검증, 새 YBM 증명 생성, 공개 체인 거래, 유료 호출, 테스트 사이트 배포는 수행하지 않았다.

## 다음 작업

**W02 ProofAdapter 기술 확인 — 추천: GPT-6 Astra / high.** 두 원천 증명의 출처·신뢰 경계와 신청·수취 지갑 문맥 결합을 확인해야 하기 때문이다. provider/SDK·브라우저 생성 경로·신선도·안정적인 시험 식별값을 확인해 10월 13일의 기술 통과 기준으로 연결한다. W02 기능 구현은 이번 W01 범위에 포함하지 않았다.
