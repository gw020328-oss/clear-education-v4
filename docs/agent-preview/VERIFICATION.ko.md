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

## 0.1.1 검토 보정

1차 head 9884929에서 배열의 추가 enumerable field 및 undefined 필드가 해시에서 생략되는 문제가 검토에서 발견됐다. 지급은 계속 false였지만 strict DTO/VERIFIED 계약에 맞지 않아 수정했다. hash/validatePlan/executePublicDemo의 clone 전 plain JSON 검사로 거부한다.

수정 검증: 네트워크 차단 core 41개(기존 29 + 집중 회귀 12), 클린 tarball 설치/실행 1개 성공. 설치한 패키지에서도 보고된 배열 권한/외부참조 및 draft undefined 재현이 거부된다. 기존 Moodle59/grounding10은 이 수정에서 반복하지 않았다. 배포물 버전은 @clear/preview-core 0.1.1이며 실제 API/로그인/서명은 여전히 미실행이다.

## PR166 core 0.1.2 후보 보정 (2026-11-05, B)

기준 `93c849b7027dca75877f878ba39534ef062582c9`. E 반례를 새 테스트 4개 묶음으로 추가했을 때 기존 11개 통과/새 4개 실패를 확인한 뒤 수정했다. 부정·선택·횟수·시간·요일/ISO 기한·동일 capability 복수 의무는 정확한 원문/span과 검토 hash에도 실행이 거부된다. `빠짐없이 완료`, `강의 수강 후기 작성`의 오보류를 해소하되 별도 수강+후기 의무는 계속 보류한다.

Node 24.21.0에서 네트워크 차단으로 아래 62개 모두 통과했다. 원본 모델 행의 JSON 왕복/hash/guard 보존, caller 객체 비동결·내부 복사본 동결, 변조·구버전 draft 거부, ACTUAL 호스트 진입 후 미응답 실패의 호출 여부 unknown도 포함한다. 임시 클린 폴더의 0.1.2 tarball을 오프라인 설치하여 버전·모델 draft v2·부정문 실행 거부·기존 합성 예제를 확인했다.

```sh
./tools/node --import ./tests/agent-preview/network-block.mjs --test \
  tests/agent-preview/core.test.mjs \
  tests/agent-preview/gemini-response.test.mjs \
  tests/agent-preview/condition-structuring.test.mjs \
  tests/agent-preview/package.test.mjs
```

로컬 로그: `/private/tmp/clear-b-pr166-before.log`(수정 전), `/private/tmp/clear-b-pr166-regression.log`(62/62). E의 이전 127개 검증 전체는 반복하지 않았다. 프롬프트/응답 schema/모델/bodyHash 관련 소스와 D HTTP 파일은 변경하지 않았다. 실제 Gemini·Moodle·Reclaim 호출, 지급, merge 또는 배포는 수행하지 않았다. draft/hash와 nullable provenance의 소비자 인수 사항은 `FRONTEND_HANDOFF.ko.md`의 PR166 보정 후보 절에 기록했다.

추가로 E의 `output/handoff/CLEAR_PR166_REVIEW_2026-11-05/reproduce.mjs`를 `EXPECT_FIXED=1`로 현재 후보에 실행해 **36/36 통과**했다(`/private/tmp/clear-b-pr166-e-fixed.log`). 처음 후보의 34/36에서 누락된 `과제는 선택입니다`를 추가하고, 호스트 예약 코드 `APPROVAL_REQUIRED_OR_SPENT`는 전송 전 거부(false), 그 밖의 미응답 실패는 unknown(null)으로 계약을 구분한 뒤 62개 및 독립 36개를 재확인했다. E 재현 스크립트는 수정하지 않았다. 62개와 36개에는 의미상 중복 사례가 있으므로 독립 검증 범위로 표기하고 사례 수를 합산하지 않는다.

## 0.2.0 독립 모듈 예제

고정 Node/npm 환경에서 다음 명령을 실행한다. 첫 설치는 공개 npm 의존성을 받을 수 있어야 한다. 캐시를 준비한 뒤에는 깨끗한 폴더에서 같은 설치 명령에 `--offline`을 추가할 수 있다.

```sh
repo="$PWD"
delivery="$(mktemp -d)"
./tools/node packages/clear-core/pack-modules.mjs "$delivery"
trial="$(mktemp -d)"
cp examples/clear-core/modules-demo.mjs tests/agent-preview/network-block.mjs "$trial/"
cd "$trial"
npm install --ignore-scripts --no-audit --no-fund "$delivery/clear-preview-core-0.2.0.tgz"
"$repo/tools/node" --import ./network-block.mjs modules-demo.mjs
```

예제는 같은 패키지의 루트 조건 DTO, Moodle 두 결과, Reclaim 합성 서명과 변조 서명, 회고 세 위치와 요청 지문, 정산 판정과 S4 view의 일치 및 지급 차단을 검사한다. 의존성 준비는 시연 실행과 분리한다. 제품 연결점과 지원 범위는 FRONTEND_HANDOFF.ko.md에 기록했다.

로컬 고정 Node 24.21.0에서 캐시를 채운 후 새 폴더에 offline 설치했다. 286개 npm 의존성 설치와 네트워크 차단 예제의 전체 assertion이 통과했다. SDK는 설치 스크립트를 끈 환경에서 선택적 RE2 native 모듈 대신 내장 경로를 사용했으며 합성 서명 검증 및 변조 거부가 성공했다. JSON 출력만 필요하면 예제 실행에 `LOG_LEVEL=error`를 설정한다.

## 0.3.1 generateContent 응답 호환성

Gemini A/B는 각각 응답을 받았으나 기존 어댑터가 GEMINI_RESPONSE_PARTS로 거부했다. 원본이 보존되지 않아 어떤 분기가 실패했는지는 확인할 수 없다. [Google generateContent 응답 명세](https://aistudio.google.com/api-reference/generate-content)는 Content.role의 생략 또는 빈 값과 Part의 thoughtSignature 및 thought 메타데이터를 정의한다. 기존 role 필수 검사와 text 단일 키 검사가 공식 형식도 거부함을 합성 사례에서 재현했다.

수정은 STOP 후보 한 개의 최종 text part 한 개에서만 위 메타데이터를 허용한다. 실제 thought, 도구 및 미디어 데이터, 여러 part, 잘린 응답, 기존 JSON·원문·검토 지문 위반은 계속 거부한다. 서명 메타데이터는 결과 DTO에 전달하지 않는다. 새 모델 호출 없이 검증했으며 기존 승인은 이미 소비됐다.
