# 격리 Moodle: 실제 짧은 재생과 인증 API 연결

2026-10-15, [#40](https://github.com/gw020328-oss/clear-education-v4/issues/40)의 로컬 실제 원천 연결 단계다. 공통 M1/M2가 합쳐진 develop `1f98d5f`를 이력 병합했고, 아직 Draft인 L1 [#45](https://github.com/gw020328-oss/clear-education-v4/pull/45)와 합성 export [#48](https://github.com/gw020328-oss/clear-education-v4/pull/48)의 코드를 이력으로 재사용한다. 제품 HTTP/DB, 공통 schema/evaluator, root dependencies/CI 및 다른 담당 작업본은 수정하지 않았다.

실제 새 Moodle에서 테스트 계정으로 브라우저 영상을 재생하고, 저장된 DB 기록을 인증 REST로 읽어 `LOCAL_LMS_RECORD` facts와 `LOCAL_LAB` 일일 평가로 연결했다. 정책은 **별도 명시한 1일·9000BPS 데모**다. 실제 학원 정책·기관 연동·90/100일 이력·사람의 집중·전체 환급 자격·지급 검증이 아니다. 400% 자동 판정/지급은 금지, 500% 제외, 정책 OPEN·grant/outbox HOLD·독립 claim NO_GO·실원천/제품 gate를 유지한다. 기존 vault/TEST 실험실도 변경하지 않았다.

## 실제 관측 결과

전체 실행 [15개 사례](local-api-report.json)와 최종 코드의 [업그레이드 후 확인 6개](local-api-post-upgrade-report.json)가 PASS다. 5활동/3페이지를 인증 API로 읽었다. 과거 첫 실행은 토큰 만료를 정상 거부했으나 harness가 더 구체적인 오류명을 기대해 14개 통과 뒤 실패했다. 기대를 generic access rejection까지 허용하도록 고쳤고 **새 계정·새 강좌 run2**에서 15개를 실행했다. 첫 실행의 DB 기록과 비공개 진단은 보존했다.

| 실제 재생 | 벽시계 경과 | DB/API 유효시간 | 미디어 커버리지 | 원천 날짜 credit |
| --- | ---: | ---: | ---: | --- |
| 정상 1배속 | 31,837ms | 29,987ms | 30,000ms | 2026-10-15 |
| 2배속 | 16,557ms | 14,992ms | 30,000ms | 없음 |
| 일시정지 포함 | 36,876ms | 29,985ms | 30,000ms | 2026-10-15 |

일시정지 구간의 유효시간 증분은 0ms였다. 두 완료 기록은 같은 날짜이므로 일일 날짜 수는 1이다. 오늘 기간이 열려 있어 평가 결과는 **IN_PROGRESS**이며 최종 PASS/전체 자격을 선언하지 않는다. 공식 진도율은 `null`, 배속 준수는 `UNKNOWN`이다. 커버리지를 공식 진도율로 대체하지 않는다. 2배속은 이번 데모의 시간 조건에 미달한 것이며 공식 배속 준수 위반 판정이 아니다.

재열기·응답 유실 후 재조회에서 credit는 늘지 않았다. 페이지 사이 실제 DB 가시성 정정 시 부분 export를 폐기했고, 숨긴 활동은 `UNAVAILABLE`로 보류했다. 승인한 복구 revision에서 날짜 중복 없이 재평가했다. 다른 계정/강좌·잘못된/만료된 토큰·읽기 토큰의 쓰기 함수 호출은 거부됐다. 스냅샷 만료 사례만 실제 snapshot에 **주입한 가상 시계**이며 기다린 실시간 만료 실험은 아니다.

## 원천과 신뢰 범위

- 새 project `clear-moodle-local-api40`, `127.0.0.1:18765`만 공개. 별도 PostgreSQL 네트워크/볼륨이며 DB host port는 없다. 원본 Moodle/DB/키/컨테이너를 시작·중지·변경하지 않았다. 다른 기존 컨테이너는 그대로 유지했다.
- Moodle `215f44380bdc3ccf852a3a22e34f8423ff64033a`(4.5.15), Video Checkpoints `67fb5233070f49653c0bd8209338c34b8fe61177`(1.0.6), `clearwatch/clearapi` DB version `2026101501`. Docker image digest는 [compose](../../spikes/moodle-local-lab/compose.yml)에 고정한다. 제공된 public 영상 SHA-256은 `fce0617c5c8279f0483dff43006b465d8e277001a2115ac9b6bf854f28bacac6`다. [소스 고지](../../spikes/moodle-local-lab/NOTICE.md)와 GPL 원문을 포함했다.
- `clearwatch`는 기존 브라우저 telemetry의 서버시간 상한/세션/순번/동일 요청 재시도 제어를 유지한다. 실제 학습 state가 바뀔 때 같은 learner lock·DB transaction 안에서 export generation과 제한된 사유 audit를 갱신한다. 단순 pause heartbeat·재열기·동일 재시도가 attendance를 추가하지 않는다.
- `clearapi`의 identity/manifest/page는 로그인한 토큰 주체의 등록된 own 계정만 읽는다. 클라이언트가 userid를 고를 수 없다. active enrollment, course capability/context, 계정 등록, 읽기 기한을 확인한다. 별도 서비스의 허용 함수는 이 3개뿐이며 upload/download 권한이 없다. export cache/audit 메타데이터는 지연 생성하지만 읽기가 학습 state/출석을 쓰지는 않는다.
- pinned Moodle core가 서비스 사용자 `validuntil`을 함수 선택에 적용하는 조건 때문에 미래 기한이 있는 사용자도 함수 목록에서 제외됐다. core를 고치거나 restrictedusers를 끄지 않았다. 서비스 사용자 기한은 NULL, 실제 토큰 기한(+1시간)과 플러그인 accessUntil(+1시간)을 별도로 강제했다. REST protocol capability도 두 계정의 강좌 context에만 부여했다. 토큰 생성/전역 REST 권한은 부여하지 않았다. 실제 토큰 만료·플러그인 기한 거부와 원래 기한의 **연장 없는 복구**를 확인했다.
- Moodle PostgreSQL driver의 내부 savepoint 때문에 REPEATABLE READ 변경은 실패했다. driver를 우회하지 않고, config/policy/file metadata/전체 state를 **한 SELECT의 MVCC 시점**으로 읽는다. playback writer와 같은 learner lock을 쓴다. 권한 검사는 각 요청에서 별도로 실행한다. 설정 변경을 발견하면 UNAVAILABLE 또는 새 revision으로 처리한다. DB관리자에 대한 불변 감사나 모든 권한 변경의 직렬화 보장은 아니다.
- source snapshot을 캐시하고, 각 manifest/page 요청에서 현재 지문을 다시 확인한다. 변경되면 옛 revision 요청은 거부한다. 행 수/offset/page hash/terminal/manifest hash/source version을 고정하고 마지막 manifest를 재확인한다. source hash와 normalized facts hash는 다른 도메인이다. SHA-256 지문은 서명이 아니다.
- 관측 초는 source의 `ceil` 상한으로 명시하고 그 초까지 client가 기다린다. 행의 ms 정수는 반올림하지 않는다. coverage는 해당 데모 기간의 현재 시점까지만 제공한다. 누락된 90/100일이나 미지원 필드를 채우지 않는다.
- 독립 CLI pin과 운영자가 고정한 institution/instance/course/account/activity/media registry를 대조한다. API 응답을 trusted pin으로 자동 승인하지 않는다. 이번 테스트 계정 통제는 실제 신청자 신원 확인과 다르다. LAB_CORRECTION은 정확한 새 revision의 명시적 승인, 미설명 OBSERVED_CHANGE는 UNKNOWN이다. DB관리자의 audit 변조·원천 신뢰·장기 보존/분쟁 복구는 후속 설계다.

## 수집기와 공통 평가의 연결

[local-http](../../src/learning-evidence/moodle-mvp/local-http.mjs)는 정확한 loopback URL, POST body 토큰, 고정 3함수, cookie 없음, redirect 거부, 256KiB 응답 상한, 자격증명 취득/네트워크 timeout·취소·고정 오류 코드만 제공한다. 늦은 tokenProvider 결과는 버리지만 공급 함수 내부 작업을 강제 종료하지는 못한다. 이 HTTP 검증은 운영 HTTPS/TLS·secret store·기관 토큰 수명 설계의 완료 근거가 아니다.

[normalizer](../../src/learning-evidence/moodle-mvp/local-normalize.mjs)는 교차 binding·현재 revision·페이지 변조/누락·중복 활동·미승인 source version을 보류하고 부분 facts를 반환하지 않는다. NO_RECORD는 실제 조회 성공 후 명시한 부재이고 UNAVAILABLE은 별도 상태다. clearwatch 온라인 프로토콜을 이번 lab의 STREAMING 의미로만 매핑하며 물리적 스트리밍/다운로드 금지/집중의 증명으로 해석하지 않는다.

[daily](../../src/learning-evidence/moodle-mvp/daily.mjs)는 공통 순수 core를 재사용하는 별도 `assessLocalLabDailyLearning` 입구를 추가했다. 원래 synthetic 입구는 LOCAL을 계속 거부한다. LOCAL 입구는 승인된 로컬 시간/날짜 의미 버전과 EFFECTIVE_TIME_RATIO·speed NOT_REQUIRED만 허용한다. 브랜드/환급률/90·100일 분기를 core에 넣지 않았다. 필요한 공식 진도·속도 의미가 없는 정책은 승인할 수 없다. 실제 facts를 SYNTHETIC으로 바꾸거나 공통 Evidence의 VERIFIED_SYNTHETIC으로 포장하지 않는다. 제품 수락·단회 증명·M2 전체 자격·지급 경로를 연결하지 않았다.

## 새 환경 재현

Node는 repository의 pinned 24.21.0, Docker는 현재 lab 기록에서 server 29.2.0을 사용했다. 아래 명령은 **빈 작업본에서만** 실행한다. 기존 실험실/DB를 복사하거나 같은 project를 reset하지 않는다. 다른 프로젝트와 포트가 충돌하면 별도 설계 후 바꾼다. bootstrap은 marker/config/container/volume가 있으면 거부한다.

```sh
mkdir -p var/moodle-local-api
chmod 700 var/moodle-local-api
git clone --no-checkout https://github.com/moodle/moodle.git var/moodle-local-api/moodle
git -C var/moodle-local-api/moodle checkout 215f44380bdc3ccf852a3a22e34f8423ff64033a
git clone --no-checkout https://github.com/EduardoKrausME/moodle-mod_videocheck.git var/moodle-local-api/videocheck
git -C var/moodle-local-api/videocheck checkout 67fb5233070f49653c0bd8209338c34b8fe61177
git -C var/moodle-local-api/videocheck apply "$PWD/spikes/moodle-local-lab/videocheck-clearwatch.patch"
./tools/node spikes/moodle-local-lab/bootstrap.mjs --public-package /ABSOLUTE/PUBLIC_PACKAGE
CLEAR_PLAYWRIGHT_PATH=/ABSOLUTE/PLAYWRIGHT ./tools/node spikes/moodle-local-lab/run-local.mjs
./tools/node spikes/moodle-local-lab/verify-after.mjs
./tools/node spikes/moodle-local-lab/cleanup.mjs
```

Video Checkpoints upstream URL은 제공 패키지의 provenance를 사용한다. 이번 실행은 제공된 **공개 tracked 소스만** 새 clone으로 만들고 config/untracked 파일·원본 DB는 복사하지 않았다. bootstrap은 commit과 정확한 적용 patch도 대조한다. Playwright는 별도 설치된 번들 runtime의 module 경로를 받으며 root dependency를 추가하지 않는다. 설치는 랜덤 테스트 비밀번호/토큰을 생성한다. runtime은 ignored `var/moodle-local-api`(700), 비밀 파일/fixture는 600이다. 비밀번호/토큰을 명령 인자·URL·출력/보고서에 넣지 않는다.

다시 실제 재생을 실험하려면 기존 결과를 보존하고 registry의 date/period/policy 및 증가한 runRef를 새 데모로 고정한 뒤 setup으로 **새 사용자·강좌**를 만든다. 과거 runRef 재사용/기록 삭제는 허용하지 않는다. cleanup 뒤 기존 계정/서비스를 자동 재활성화하거나 토큰 기한을 연장하는 기능은 없다. 기존 marker가 있는 곳에 bootstrap을 반복하지 않는다. 최종 bootstrap의 추가 충돌 방지는 정적 검토/Node syntax 확인이며 깨끗한 신규 설치 전체를 또 반복한 결과로 주장하지 않는다.

종료 [실측 기록](local-api-cleanup-report.json): 테스트 서비스 2개 토큰 폐기/비활성화, 합성 계정 4개 suspend·세션 종료, 남은 토큰0, 학습 state 6행 동일 보존, 폐기한 토큰의 실제 API 거부 확인, 이번 컨테이너만 stop, 볼륨 보존. runtime의 비공개 비밀/DB는 로컬에 남아 있으며 Git/public 보고서에 포함하지 않았다.

## 회귀와 CI 해석

```sh
./tools/node --test tests/moodle-local/*.test.mjs tests/moodle-mvp/*.test.mjs tests/moodle-preparation/*.test.mjs tests/mvp-policy/*.test.mjs tests/policy/*.test.mjs tests/learning-evidence/*.test.mjs
./tools/node tools/verify-workspace.mjs
./tools/node tools/check-public-content.mjs HEAD
```

최종 로컬 회귀 362개(새 LOCAL 28개 포함)가 모두 통과했다. PHP 18파일 syntax 검사도 통과했다. 이것은 기존 Mac/제품/계약 전체 CI의 대체가 아니다. 기존 root CI를 소유 경계에 따라 수정하지 않았으므로 새 LOCAL 28개와 실제 Docker 15개/사후6개는 원격 CI 자동 수행 대상이 아니다.

선행 #45 최신 `227d37f`는 새head CI6개 PASS다. 과거 `b731096` push Mac job은 CANCELLED·log not found로 원인 미해결이다. #48 최신 `49f453e`는 PR run38675877446의 3job PASS, push run38675871275의 Mac 1job FAIL(`SYNTHETIC_COOKIE_CHECK_FAILED`, SIGKILL 복구2/5, 50/51)이므로 총5PASS/1FAIL이다. 이 실패 로그를 공통 담당에게 전달했고 수정·무근거재실행은 하지 않았다. 통과한 다른 run으로 실패 원인을 해결했다고 표시하지 않는다. 모든 PR은 Draft, 자동 병합 없음이다.
