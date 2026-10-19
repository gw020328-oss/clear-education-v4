# Mac hard-kill CI 시험 수명 검토와 보정

2026-10-19. 기준 develop `97d5024ebb1a8371ae8a996cf76624af9e067269`. 별도 `codex/mac-hardkill-trial-lifecycle` 작업이며 E3/API 작업본과 제품 저장·Chrome·worker·launcher 코드를 변경하지 않는다. 요청 설정은 GPT-6 Astra / High이고 실행 모델 설정을 코드나 안내 문구로 변경했다고 주장하지 않는다.

## 확인된 실패와 미확정 범위

PR89 head `fb9e6d3a9f35c8d12b80f0c84e01d8a6db9aeda1`의 [push Mac job](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142228451/job/117718818737)은 legacy-missing 5회 합산 시험이 60,230.65ms에서 취소됐다. 전체 62개 중 61 통과, 0 assertion 실패, 1 취소다. 같은 변경의 [PR Mac job](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142236991/job/117718844553)은 62/62이며 legacy 5회 합산 28,135.81ms다. 실패 실행의 앞 네 phase도 더 느렸지만 내부 trial/단계 로그가 없어 누적 예산 초과와 특정 lifecycle 지연을 구별할 수 없다. 당시 정확한 정체 위치와 원인은 **미확정**이다.

이번 변경은 확인된 시험 harness 공백을 고친다. 과거 CI가 이 공백 때문에 실패했다고 확정하지 않는다. 기존 Cookie 403 인터셉트 수명 수정과 별개이며 해당 검사는 위 두 실행에서 모두 통과했다. 기존 CI rerun은 하지 않는다.

## 변경 범위와 시험 계약

- [native 시험](../../tests/mac-collector/hard-kill.test.mjs): 앞 4개 phase 각 1회와 legacy-missing 1/5~5/5를 서로 다른 순차 trial로 실행한다. **기존 5회 전체 60초에서 각 trial 60초로 예산의 단위가 변경된다.** launcher 단계는 20초를 유지한다. 성공까지 retry, 새 skip, 숫자 timeout 상향은 없다. 실패·취소 뒤 후속 trial은 `NOT_RUN_PREVIOUS_TRIAL_FAILED`로 실패하며 새 root/process를 만들지 않는다. 미실행분은 통과가 아니다. 기존 비-Mac 플랫폼 skip은 보존한다.
- [supervisor](../../tests/mac-collector/fixtures/hardkill-supervisor.mjs): exit/error를 즉시 관찰하고 종료 결과를 저장한다. 생성한 자식의 종료 상태, 정확한 예상 명령, 부모 PID, detached 그룹, UID, boot, 시작 시각을 결합한다. Node preload에는 trial 고유 root 이름을 포함한 import URL을 넣는다. 자기 등록은 생성 기록에 결합된 exec 전환/lockf 자식만 소유 목록에 추가한다. PID-only 또는 조회한 한 행만으로 새 소유권을 인정하지 않는다.
- 대기에는 monotonic deadline을 적용하고 resolve/reject 시각도 다시 확인한다. 동기 process 조회가 event loop를 점유해 timer callback보다 Promise 완료가 먼저 처리돼도 기한 뒤 성공은 거부한다. native `ps`/`sysctl` 호출은 각 1.5초, KILL, 제한된 출력 버퍼를 사용한다. 이는 제품 process 조회의 timeout을 변경한 것이 아니다.
- macOS `ps`는 `LC_ALL=C`에서 한글 경로를 M- 표기로 변환했다. 초기 native 등록 실패를 이 차이로 확인했고, **시험 조회만 `en_US.UTF-8`로 고정**해 정확한 실행 인수 비교를 유지했다. 명령 prefix/basename 허용으로 검증을 느슨하게 하지 않았다.
- [preload observer](../../tests/mac-collector/fixtures/hardkill-lifecycle-observer.mjs): 실제 제품 launcher가 만드는 worker에 시험 preload를 주입하고 각각의 생성 관계를 기록한다. 실제 `fs.rm(session)` 호출 직전에 프로필과 기록된 Chrome 세대가 모두 부재인지 검사한다. 조회/취소/생존 확인 실패 시 삭제를 호출하지 않는다. 호출 전/완료 후 사건이 모두 있어야 native trial을 통과한다.
- [legacy pipe holder](../../tests/mac-collector/fixtures/hardkill-lifecycle-holder.mjs): 구버전 spawn-before-record의 미기록 Chrome을 결정적으로 구성한다. 별도 시험 자식이 새 합성 Chrome의 CDP pipe를 소유하고 Browser.getVersion 응답까지 확인한다. collector worker를 죽여도 pipe가 함께 닫혀 전제가 사라지지 않는다. 디버그 포트, 실제 로그인/원천은 없다. 복구 직전에 browser.json 부재와 정확한 소유 Chrome의 생존을 다시 확인한다. 자연 종료로 전제가 사라지면 성공으로 인정하거나 재시도하지 않는다.
- [runner](../../tests/mac-collector/fixtures/hardkill-lifecycle-runner.mjs): launcher, lockf/worker 그룹, pipe holder, Chrome 그룹을 별도로 정리한다. UID·boot·시작 시각·명령·프로필을 검증하고 TERM → bounded wait → 재검증 → KILL → 부재 확인을 따른다. PID 재사용/다른 프로필/알 수 없는 그룹 구성원을 만나면 신호 전송을 거부한다. 전체 Chrome 종료 명령은 없다.

## 취소·정리·진단의 의미

cleanup은 본문과 after hook이 공유하는 단일 Promise다. 취소 latch는 새 spawn과 삭제를 차단한다. 생성자는 먼저 종료하고, 진행 중 본문 작업이 끝났는지 확인하고, 소유 Chrome 부재를 확인한 다음 root 삭제를 시작한다. root 생성은 소유 경로를 확보하기 전에 비동기 cleanup과 엇갈리지 않도록 동기 할당하고, 후속 I/O는 단계의 절대 기한과 취소 검사 아래 둔다.

삭제 전 query/identity/종료 확인 실패는 삭제 금지와 root 보존이다. **삭제 호출 이후** I/O timeout·stat 실패는 `ROOT_REMOVE_RESULT_UNKNOWN`이다. OS의 진행 중 삭제를 되돌렸거나 root가 온전히 보존됐다고 주장하지 않는다. 늦은 완료는 이미 실패한 정리를 `REMOVED`나 성공으로 바꾸지 못한다. 프로세스 종료를 확인한 뒤 삭제를 시작하는 순서는 동일하다.

공개 진단은 고정 phase/trial/stage/event/error code와 monotonic 경과 시간만 출력한다. 전체 `ps`, PID, root 경로, argv, exception 원문, Chrome 응답, 쿠키는 출력하지 않는다. 생성 관계와 삭제 관찰에 필요한 합성 내부 기록은 새 private test root에만 두고 정상 정리 시 제거한다. Node 시험 러너 자체가 출력하는 소스 위치는 진단 payload와 구분한다.

프로세스 조회와 kill 사이의 OS 수준 경쟁을 완전히 제거한 pidfd 보장이나 디스크 완전 삭제를 주장하지 않는다. 검사 직전 재검증과 exact profile/세대 결합, 실패 시 삭제 금지가 이 시험의 경계다.

## 검증 기록

[Chrome 없는 주입 검사](../../tests/mac-collector/lifecycle-harness.test.mjs) 37/37 통과. 빠른/기존 exit, 생성 오류, 종료 무응답, monotonic 기한 뒤 완료, abort/late 완료, cleanup 공유, 후속 spawn 차단, 초기 생성 결합의 명령/부모/그룹/UID/boot/start/profile 거부, TERM 무응답의 KILL 승격, launcher 종료 후 worker 잔존, query 오류·무응답, PID 재사용, 다른 프로필, 실제 삭제 observer의 순서/거부, 삭제 시작 뒤 결과 미확정을 포함한다.

초기 native 실행은 첫 trial의 초기 명령 결합에서 실패했고 후속 8개는 NOT_RUN으로 차단됐다. 원인 코드 계측을 추가한 진단 실행에서도 같은 `CHILD_BINDING_COMMAND`를 확인했다. 두 실행의 임시 root는 정리됐다. 공개 경로와 같은 고정 Node로 만든 Chrome 없는 자식의 정확한 argv 비교를 통해 C 로케일의 한글 변환을 확인했다. UTF-8 수정 후 고정 native 9/9 통과, 25,678.53ms. 이 9회 안에서 legacy 5회가 모두 실제 생존 전제·복구·삭제 observer·재생성 부재를 통과했다. 앞선 실패를 성공으로 덮거나 우연히 맞는 전제를 고르는 retry를 하지 않았다.

최종 전체 Mac 검사 103/103 통과(27,865.50ms, 실패·취소·skip 0). 이 분모에는 최종 코드의 native 9회와 주입 검사 37개가 포함되므로 중복 합산하지 않는다. 기존 정상 쿠키, altered Cookie 403, 패키지/공식 고정 Node 압축 해제 실행도 통과했다. 실행 후 이 harness의 임시 root 0개·프로세스 0개를 확인했다. 최종 exact head/원격 필수 검사는 PR에 기록한다. local 성공을 원격 CI 성공 또는 E3 runtime intake 수락으로 대신하지 않는다.

## 유지되는 경계

제품 코드, CI, package/lock, API/DB, 원천, 지급 정책, 금고·체인·키, 프론트, legacy/원본은 보존한다. 실제 로그인·원천 수락·allocation·지급 서명·지급 거래는 이 단위에서 0이다. 400% 자동 자격·지급 금지, 500% 제외, 멘토 미결 정책, Moodle·원천 검증 차단, grant/outbox 보류, 독립 청구 NO-GO를 유지한다. 별도 TEST 개발 승인과 운영 활성화를 혼동하지 않는다. main/develop 병합·배포는 하지 않는다.
