# clearapi1502 실제 로컬 재시험

2026-10-15, 기준 develop `4ae548b`(#52/#53/#54 포함). 새 합성 계정·강좌 run4에서 실제 브라우저 영상 재생 → DB → 최소 권한 인증 REST → `LOCAL_LMS_RECORD` → `LOCAL_LAB` 일별 평가 **21/21 PASS**를 확인했다. 실행 commit은 `3d73b45a3ef4c58ab51e42a3ebd74ed9f33f9516`, 한국 시간 16:31–16:33이다. [실측·정리·선행 실패 JSON](local-api-1502-retest-report.json)을 근거로 사용한다. [기존 15+6](LOCAL_API_LAB.ko.md)은 clearapi1501의 과거 기록이다.

## 소스와 관측 경계

실제 DB source version은 clearwatch `2026101501`, clearapi `2026101502`다. Moodle `215f44380bdc3ccf852a3a22e34f8423ff64033a`, Video Checkpoints `67fb5233070f49653c0bd8209338c34b8fe61177`, 적용 patch SHA-256 `38b420b658547982ffe3a856310c07dcc5285b8325fa6267ec61439c3dc99291`과 공개 30초 영상 지문은 이전 pin과 일치한다.

마지막 source revision은 `r92`, 5활동/3페이지다. source manifest 지문은 `90eb7f8de55e0169796d613265945fae2417352207d138de28005b0ab35d2ec2`다. 전체 하한 `1792049594`, 상한 `1792049595`, coverage 끝 `1792049594`, 만료 `1792049894`를 기록했다. 실제 API 재조회에서 캐시가 원래 하한·상한·만료를 보존함을 확인했다.

## 실제 재생과 결과

| run4 실제 재생 | 벽시계 경과 | DB/API 유효시간 | 미디어 커버리지 | 날짜 credit |
| --- | ---: | ---: | ---: | --- |
| 정상 1배속 | 31,729ms | 29,955ms | 30,000ms | 2026-10-15 |
| 2배속 | 17,456ms | 14,991ms | 30,000ms | 없음 |
| 일시정지 포함 | 36,759ms | 29,980ms | 30,000ms | 2026-10-15 |

중지 구간 유효시간 증분은 0ms다. 두 정상 완료는 같은 날짜이므로 credit 날짜는 하나다. 데모 기간이 열려 있어 결과는 **IN_PROGRESS**다. 공식 진도율 `null`과 배속 준수 `UNKNOWN`을 유지했다.

실제 identity 응답 뒤 caller registry/sourcePin을 바꿔도 수집 시작 당시 pin을 유지했고, 수집 후 cleanup 중 취소하면 facts를 폐기했다. 현재 revision 중간 정정의 부분 export 폐기, UNAVAILABLE/NO_RECORD 구별, 재열기·응답 유실 뒤 중복 credit 방지, 다른 계정·강좌·잘못된/만료된 토큰·쓰기 함수 호출·플러그인 읽기 기한 거부도 확인했다. 읽기 기한은 원래 값으로 복구했으며 연장하지 않았다.

## 오프라인 검사와 실제 실행의 구분

LOCAL39 + 일별/driver/M2 60 = **99 PASS**, 네트워크 없는 고정 이미지의 순수 PHP clock **9 PASS**다. workspace 검사는 고정 Node 24.21.0에서 PASS다. 기간 종료 직전/정각/직후, 처리 중 경계 통과, 반올림 전 시계 역행 및 monotonic 300초 상한은 오프라인 fixture로 확인했다. 실제 OS 시계를 변경하거나 300초를 기다리지 않았다. snapshot 만료도 실제 snapshot에 가상 시각을 주입한 사례다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/moodle-local/*.test.mjs tests/moodle-mvp/*.test.mjs
php tests/moodle-local/observation-window.php
./tools/node tools/verify-workspace.mjs
```

이번 checkout에는 고정 Node가 없어 동일 버전인 공통 checkout의 `/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/tools/node`를 사용했다. 전역 Node를 바꾸지 않았다. PHP9개는 테스트 디렉터리와 clock 클래스만 read-only로 마운트한 고정 이미지에서 `--network none`으로 실행했다. 처음의 Node 경로/컨테이너 테스트 경로 오류는 검사 시작 전 실패이며 실제 회귀 실패와 구분한다.

## 선행 실패와 보존

run3은 `6ff4ead186cb37a7ff2b47f13800ae7efbe12309`에서 API/관측/캐시 등 6개 통과 뒤 브라우저 로그인 이동 대기가 실패했다. 영상 재생/학습 행은 0개였다. 해당 합성 계정의 Moodle 실패 이벤트는 `AUTH_LOGIN_FAILED=3`이고 강제 비밀번호 변경·프로필 미완성 상태는 아니었다. 정확한 원인은 미확정이다. 새 계정 비밀번호의 DB 해시 일치 사전 검사, 비밀값 없는 로그인 실패 분류와 시도별 결과 보존을 추가한 뒤 새 run4에서 한 번 실행해 21개가 통과했다. 이 성공을 run3의 원인 해결 증거로 해석하지 않는다. 두 시도 모두 JSON에 남겼다.

두 시도는 각각 이번 run의 서비스 1개·합성 사용자 2개만 정리했다. 각각 토큰0·세션0과 폐기 토큰의 실제 API 거부를 확인했다. 기존 6학습 행·과거 계정·서비스는 전후 동일했고, run4의 새 3학습 행도 삭제하지 않았다. 이전 fixture/registry/비밀 입력을 복구하고 컨테이너 두 개를 중지했다. 볼륨과 비공개 진단은 로컬에 보존했으며 다른 `stream-db`는 계속 실행 중이었다.

## 승인된 기존 환경에서의 재현

이미 이번 근거가 충분하므로 관련 변경이 없으면 반복 실행하지 않는다. 다음 명령은 사용자가 승인한 격리 project의 보존 재시험용이다. baseline이 있으면 같은 시도를 덮어쓰지 않는다. 추가 원인 검증이 필요하고 승인 범위에 속할 때만 `--attempt 2`처럼 별도 번호를 쓴다. 기존 상태가 정확히 6학습 행인 환경만 허용하므로 이번 성공 후 9행이 된 환경에서는 그대로 재실행할 수 없다.

```sh
CLEAR_PLAYWRIGHT_PATH=/ABSOLUTE/PLAYWRIGHT ./tools/node spikes/moodle-local-lab/retest-1502.mjs --preserve-prior-six-rows
```

이 결과는 격리된 로컬 합성 계정과 명시한 1일·9000BPS 데모의 검증이다. 실제 기관 HTTPS·공식 출석 의미·동일인·90/100일 전체 실측·운영 Evidence/DB 수락은 후속이다. 정책 OPEN, 자격과 재원 분리, 400% 자동 지급 금지, grant/outbox HOLD와 독립 claim NO_GO를 유지한다. 역사적 Mac 실패 원인은 미확정이며 이번 재시험의 성공으로 해소했다고 표시하지 않는다.
