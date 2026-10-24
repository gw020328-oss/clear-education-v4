# PR100 초기 CI 설치 단계 보정

2026-10-19. B 실행 구현 `9607f4762842c520bbb6b08d9359483adcc0a7b4`와 공개 패킷 `b70c87cafe83befa82e23903125f2a7a18d5c8a6`를 보존한다. 이번 보정은 전용 workflow의 의존성 설치와 그 검증 기록만 대상으로 하며 B 인터페이스/API 소스/정책/nonce/current/금액/서명/복구 guard를 변경하지 않는다. 새 기능 확대 없이 한 신청의 정상 TEST 경로 연결을 우선한다.

초기 [push 실행](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39224877608)과 [PR 실행](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39224912351)은 각각 B20 PASS 뒤 API/E1/E3 단계에서 251 PASS / 1 FAIL로 끝났다. `tests/bootcamp-store/consumers.test.mjs`가 실제 case를 등록하기 전에 HackerRank verifier의 `@reclaimprotocol/attestor-core` import를 찾지 못했다. 로컬의 275 PASS와 원격 252개 집계 차이는 해당 모듈의 24개 case 대신 모듈 로딩 실패 1개가 집계된 결과다. API 권한 검사나 B 실행 시험 실패로 해석하지 않는다.

새 B workflow는 root package graph만 설치했고, 공통 public workflow가 설치하던 `src/hackerrank-evidence`의 별도 고정 graph를 빠뜨렸다. 같은 lockfile로 `./tools/npm --prefix src/hackerrank-evidence ci --ignore-scripts --no-audit --no-fund`를 추가한다. 의존성 버전/lockfile, 검사 범위와 거부 조건은 바꾸지 않는다. 기존 로컬 설치를 재사용하지 않는 별도 공개 소스 복제본에 root+HackerRank graph를 설치하여 같은 API275 명령으로 확인한다.

root가 검토한 `source-pins.json` v1은 덮어쓰지 않는다. 새 `source-pins-v2.json`은 v1 파일 SHA를 불변 입력에 포함하고 workflow·pin 소비 검사 변경 및 이 기록을 별도로 고정한다. B 실행/타입 소스는 v1 지문 그대로이고 memory v4 및 API17 source도 불변이다. 기존 실패 실행을 무작정 재실행하지 않고 보정된 새 HEAD의 CI를 확인한다. 최종 remote 결과는 PR100 본문과 checks를 따른다.

정상 조립은 기존 PORTS 계약의 owner bootstrap→실제 current/nonce 확인→seal→현재 adoption/API commit→dispatch→canonical accept→별도 fixed claim 순서를 유지한다. 현재 packet에는 필수 reader/issuer/receipt 포트가 있으며 실제 API의 단일 application 연결은 API 담당 작업이다. 새 takeover/reorg/backend-stop 범위는 이 보정에서 추가하지 않는다. develop/main 병합·배포는 없다.
