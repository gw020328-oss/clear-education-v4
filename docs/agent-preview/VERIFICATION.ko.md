# 담당 B 첫 인수 — 2026-11-03

기준 origin/develop e7f77ed, 브랜치 codex/agent-preview-core. 변경 범위는 src/agent-preview, tests/agent-preview, packages/clear-core, examples/clear-core, docs/agent-preview뿐이다. 기존 runtime·제품 정책·루트 package/lock/CI를 수정하지 않았다.

## 재현

저장소 지정 Node 24.21.0과 npm 11.19.0을 PATH에서 사용하고 아래 명령을 실행한다. 로컬에서는 기존 주 작업본의 고정 Node 경로를 PATH에만 추가했다. 전역 runtime은 변경하지 않았다.

```sh
./tools/npm ci --ignore-scripts --no-audit --no-fund
./tools/node --import ./tests/agent-preview/network-block.mjs --test tests/agent-preview/core.test.mjs tests/moodle-review/bootcamp.test.mjs tests/ai-review-precheck/grounding.test.mjs
./tools/node --test tests/agent-preview/package.test.mjs
./tools/node --import ./tests/agent-preview/network-block.mjs examples/clear-core/repository-demo.mjs
./tools/npm pack ./packages/clear-core --ignore-scripts --pack-destination /tmp
```

신규 core 29 + 기존 Moodle 59 + 기존 grounding 10 = 98개 성공. 별도 tarball 클린 설치 1개 성공, 총 99개. core/기존 모듈 검사는 fetch/TCP/HTTP/UDP 차단 preload를 사용한다. 패키지 검사는 비어 있는 캐시와 클린 디렉터리에서 npm offline 설치 후 같은 네트워크 차단으로 예제를 실행한다. 의존성 준비의 최초 offline npm ci는 ganache 캐시 부재로 실패했고 정상 npm ci로 공개 레지스트리에서 고정 의존성을 설치했다. 실제 서비스 API는 호출하지 않았다.

현재 공통 CI에는 이 새 경로의 검사 명령이 없다. 루트 CI 소유자에게 위 2개 test 명령 추가를 인수해야 한다. PR 공통 CI 성공은 새 99개 검사의 CI 실행을 의미하지 않는다.

## 인수 및 남은 작업

- 완료: 원문 위치/해시 DTO, 네 capability manifest, 엄격한 계획 검사, 8개 합성 시나리오, 변조/권한/외부참조/의존/누락 거부, 독립 설치 패키지와 예제.
- 완료: 선택된 기존 Moodle 활동·과제 모듈과 회고 grounding의 공개 인공자료 실행. 조건 제거 시 실제 모듈 호출 집합 감소 확인.
- 준비: Gemini 구조화 요청 본문/스키마와 정확한 지문. 실제 전송·응답검사·승인 소비는 미구현. 비용 검토 및 새 입력별 승인 전 호출 불가.
- 미완료: HackerRank 공식 SDK 기반 합성 서명 시연 연결, 모듈 (2)~(4)의 설치 패키징, 실제 Gemini 해석의 다양한 표현 평가, 프론트/HTTP 인수. 현재 제한 문법은 범용 자연어 AI를 대신하지 않는다.
- 기존 정상 4조건/100 TEST·입력별 회고 승인·기존 S4 원문 접근은 변경하지 않았다. 실제 수집·지급·로그인·공개 배포·자동 병합 없음.
