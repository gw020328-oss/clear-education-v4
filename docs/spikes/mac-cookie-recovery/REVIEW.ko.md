# Mac 합성 쿠키 검사: 초기 탭 경합 재현과 수정

2026-10-15. 사용자 승인으로 #48 Mac 실패를 별도 develop 기반 브랜치에서 조사했다. 공통 담당과 `src/mac-collector/synthetic.mjs`, `worker.mjs`의 고정 오류 목록, `tests/mac-collector/`의 좁은 소유 범위를 합의했다. root CI/package·기존 Chrome 복구/프로세스 소유 규칙은 변경하지 않았다. 병합은 공통 담당이 수행한다.

## 확인된 결함과 역사적 실행의 한계

기존 검사는 `Target.getTargets`의 첫 page에 붙어 `Page.navigate`를 호출하고, 그 결과를 검사하지 않은 채 `/check` 수신 Boolean만 기다렸다. 초기 탭에 다른 탐색이 끼어들면 CDP 명령은 정상 응답 객체를 반환하면서 `errorText=net::ERR_ABORTED`를 담을 수 있다. 검사 페이지의 스크립트가 실행되지 않아도 원래 코드는 10초 뒤 `SYNTHETIC_COOKIE_CHECK_FAILED`로만 보고한다. 탐색 실패와 쿠키 불일치를 구분하지 못하는 결함이다. [공식 Page 프로토콜](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Page.pdl)의 navigate 반환 필드와 일치하며, 아래 실제 Chrome 실험으로도 확인했다.

통제된 실제 Chrome 실험에서 검사 HTTP 요청을 보류한 후 같은 초기 탭을 about:blank로 탐색시켰다. 관측은 root 요청1/check 요청0, `ERR_ABORTED`, 최종 BLANK였다. 회귀에서는 CDP Fetch의 요청 중단 이벤트로 순서를 고정한다. sleep/CPU 부하에 의존하지 않고 **과거 checker가 실패하고 새 checker가 성공하는 같은 초기 탭 경합**을 검사한다. 과거 코드의 검증용 사본은 `fixtures/synthetic-startup-legacy.mjs`에만 있으며 배포 패키지에 포함하지 않는다.

**#48의 원래 실패도 이 경합이었다고 확정할 수는 없다.** 당시 로그는 navigation 결과·root/check 도달·cookie mismatch를 남기지 않았다. 이번에는 재현 가능한 초기 탭 소유/탐색 결함을 고쳤으며, 원래 CI의 인과를 소급 확정하거나 모든 Mac 실패를 해결했다고 표시하지 않는다.

| 실행 | 확인된 사실 | 이번 변경과의 관계 |
| --- | --- | --- |
| #48 head49f453eee6b70369dff6fba10803587ae4a11916, push38675871275, job116229219442 | SIGKILL 복구2/5, BROWSER_CHECK:SYNTHETIC_COOKIE_CHECK_FAILED, 50/51 통과 | 새 Chrome 쿠키 단계까지 진입. 정확한 탐색/쿠키 원인은 미확정 |
| 같은 head의 PR38675877446 | Mac 포함3job 통과 | 실패 원인 수정의 증거로 사용하지 않음 |
| #45 b731096, push38672082566/job116217386392 | CANCELLED, log not found | 원인을 위 경합과 연결할 자료 없음 |
| 과거 #32/#34 | 일반 종료 실패·별도 BROWSER_TIMEOUT 등 | 기존 조사 기록 보존, 동일 원인으로 묶지 않음 |

#48 runner는 macos-15-arm64, macOS15.7.9/24G830, image20260907.0337.1, Node24.21.0이다. 원래 로그에는 실제 Chrome 버전·일시 프로필/프로세스 상세가 없다. 현재 로컬 실제 Chrome155.0.8059.41/Apple Silicon/Node24.21.0에서 조사했으며 CI의 브라우저 버전과 같다고 가정하지 않는다.

## 수정과 보존 경계

- [Target.createTarget](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Target.pdl)에 검사 URL을 직접 전달해 전용 page를 한 번 생성한다. 기존 시작 탭의 늦은 navigation이 검사 문서를 덮어쓰는 의존성을 제거했다. 기존 탭을 다시 탐색하거나 실패를 재시도해 통과시키지 않는다.
- CDP target 생성 성공만으로 통과하지 않는다. 이전과 같이 새 합성 HttpOnly/SameSite=Strict 쿠키가 같은 loopback 서버 `/check`로 정확하게 되돌아와야 한다. 첫 불일치는 실패로 고정하고 후속 정답으로 덮어쓰지 않는다.
- 쿠키 수신 대기는 **동일한 10초 상한**을 유지한다. 페이지 미도달, 페이지 도달 후 receipt 없음, 쿠키 불일치, 브라우저 조기 종료, target 부재를 고정 코드로 구분한다. worker는 이 고정 코드만 출력하며 URL·path·header·cookie·예외 원문을 출력하지 않는다.
- 성공/실패/취소 후 browser.close와 loopback server.close를 기다린다. 실제 Chrome 회귀는 테스트의 정리 함수가 개입하기 **전에** 해당 profile을 쓰는 프로세스가 0개인지 확인한다. profile 삭제는 기존 worker의 소유 확인 후 정리 책임을 유지한다.
- `startChrome`, `browser-recovery`, lock/UID/실행파일/profile/PID 검증, 종료 확인 전 삭제 금지, 실제 사용자 브라우저/프로필, 기존 DB/키/체인은 수정하지 않았다. 테스트 의존 주입은 신뢰한 함수 호출에만 있으며 CLI/env/외부 입력 옵션이 아니다.

## 진단과 검증

원래 checker에 비식별 단계 관측만 추가한 별도 ignored probe에서 30회/동시4 실행은29성공·1BROWSER_TIMEOUT이었다. 그 첫 probe에는 CDP 세부 단계가 없어 시간 초과 명령은 특정하지 못했다. 단계 관측을 보강한20회/동시2 실행은 모두 통과했다. **반복 성공을 원인 해결로 사용하지 않았고**, 이 후에는 무근거 반복 대신 위 이벤트 순서 기반 재현으로 전환했다. 모든 probe는 새로운 합성 profile이며 정상/오류 후 소유 프로세스와 임시 디렉터리를 정리했다. BROWSER_TIMEOUT은 이번 수정의 해결 주장 범위 밖이다.

새 portable 시험8개는 target ACK만으로 성공하지 않는지, missing/wrong cookie, 첫 실패 후 정답 재시도, 페이지 미도달/receipt 누락, 취소/조기 종료/target 부재와 정리를 검사한다. 가상 타이머로 정확한10초 실패를 확인한다. 실제 Chrome 시험3개는 수정 전 실패/후 성공 경합, 실제 Cookie header 변조 거부, target 생성 후 취소·프로세스 종료를 확인한다. 최초 음성 대조 fixture는 response interception에서 Set-Cookie를 제거했지만 Chrome이 이미 쿠키를 처리해 기대한 실패를 만들지 못했다. 이후 `/check` 요청의 Cookie header를 명시적으로 변조하도록 수정했고 실제 거부를 확인했다. 제품 검사를 완화하지 않았다.

```sh
./tools/node --test tests/mac-collector/synthetic.test.mjs
./tools/node --test tests/mac-collector/synthetic-chrome.test.mjs
./tools/node --test tests/mac-collector/*.test.mjs
./tools/node tools/check-public-content.mjs HEAD
```

portable8 + 실제 Chrome3의 집중11개와 기존 강제 종료/복구·패키징을 포함한 전체 Mac62개가 모두 통과했다(실패/skip0). 전체 실행은 약37.8초였으며 반복 성공을 원인 증거로 사용하지 않는다. 최종head 원격CI 결과는 PR에 기록한다. 새 파일은 기존 `tests/mac-collector/*.test.mjs` glob에 포함되므로 Mac CI가 자동 실행한다. portable 시험은 다른 플랫폼에서 단독 실행할 수 있고, 실제 Chrome3개는 darwin/arm64 밖에서는 skip이며 그 skip을 실제 검증으로 세지 않는다. 추가 root CI 편입은 공통 담당 소유다.

Moodle #41→#45→#48→#52의 자체 평가/원천 코드와 이 변경은 독립적이다. 실제 로컬 Moodle15+6 성공은 그대로 보존한다. 기관/실신원·장기이력·운영 HTTPS·제품 자격/지급 완료로 승격하지 않는다. 정책OPEN,400% 자동자격/지급 금지,500% 제외,grant/outboxHOLD·독립claimNO_GO·원천신뢰 gate를 유지한다. 관련 PR 최종 병합은 공통 담당의 최신 develop/전용시험/CI/리뷰 판단에 따른다.
