# Mac stale recovery EPERM 진단

2026-10-19. `DIAGNOSTIC_COVERAGE_ADDED_ORIGINAL_CAUSE_UNCONFIRMED`.

## 원본 실패와 재실행 기록

- 실패 head: `636817f679e009a6ad3194b7c549606cd24d112f` (AI PR #98).
- 원본 push run `39219934005`, attempt 1, Mac job `117952603977`, 2026-10-19 17:02:29~17:04:15 KST. [원본 attempt](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39219934005/attempts/1).
- 실패 시험은 기존 `SIGKILL leaves profile; next launcher stops owned Chrome and deletes old session first (3/5)`이며 1823.223209ms 뒤 worker exit 1(기대 0), `STALE_RECOVERY:EPERM`이었다. 전체 105개 중 104 PASS / 1 FAIL이다.
- 별도 신규 `SIGKILL legacy-missing (1~5/5)`는 모두 PASS다. 실제 합성 Chrome cookie round trip 시험도 PASS였다. 이들을 원본 실패 시험과 혼동하지 않는다.
- AI 담당자가 최초 syscall의 원인 확정 전에 실패 job을 1회 재실행했다. attempt 2 / Mac job `117954326684`는 성공했다. [재실행 attempt](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39219934005/attempts/2). root는 원인 없는 재실행을 지침 위반으로 인정했고 이 성공을 해결 증거로 인수하지 않았다. 두 결과를 모두 보존한다. 이번 단위는 추가 rerun을 하지 않는다.
- 원본 로그는 root가 보존한 로컬 파일을 읽었으며 Git에는 그 내용 대신 SHA-256만 기록한다.

## 확인한 범위와 한계

기존 Mac 검토 head `41354e0283709f74dd64a9dc6435703c804853c6`과 실패 head 사이에 `src/mac-collector/`, `tests/mac-collector/`, 패키지 도구, Mac CI workflow, 저장 정책·toolchain 설정 차이가 없다. 이 사실이나 다른 PR의 성공만으로 실패를 넘기지 않는다.

기존 worker catch는 상위 phase와 허용된 error code만 출력한다. `STALE_RECOVERY`는 `clearAbandoned` 전체를 포함하며 `EPERM`은 다음 경로에서 전파될 수 있다.

| 경로 | 거부가 날 수 있는 동작 | 새 진단 경계 |
| --- | --- | --- |
| root/session 검증·목록 | directory lstat, readdir | ROOT_VALIDATE / ROOT_LIST / SESSION_VALIDATE |
| session metadata 오류 후 browser record 검사 | lstat | SESSION_METADATA |
| 이전 owner 신원 확인 | ps/sysctl 또는 존재 확인 kill(pid, 0) | OWNER_PROCESS_QUERY / OWNER_BOOT_QUERY / OWNER_EXISTENCE_PROBE |
| browser metadata | browser.json readFile | BROWSER_METADATA_READ |
| browser process 확인 | process table 조회 | BROWSER_PROCESS_QUERY |
| 검증된 browser group 종료 | process.kill(-pgid, TERM/KILL) | BROWSER_SIGNAL_TERM / BROWSER_SIGNAL_KILL |
| 검증 후 session 삭제 | removeSession 내 검증·recursive rm | SESSION_DELETE |

원본 error의 syscall/resource, process table 또는 profile 상태는 저장돼 있지 않다. 1823ms라는 시간만으로 삭제 또는 kill 오류를 확정할 수 없다. PID/PGID 재사용, 파일 접근 제한, Chrome 종료와 filesystem 동작의 경합은 원본에서 확인되지 않은 가설이다. 실제 profile DB·쿠키·계정·개인키는 조사하지 않았다. **최초 실패 syscall과 근본 원인은 미확정**이다.

## 변경 내용

`recovery-diagnostics.mjs`는 원래 error를 그대로 재전파하면서 최초로 포착한 고정 stage/resource-kind와 허용된 syscall만 WeakMap에 보관한다. 중첩 경계는 최초 경계를 덮어쓰지 않는다. syscall이 없거나 허용 목록 밖이면 `UNREPORTED`이며 실행 파일을 포함한 spawn syscall은 `spawn`으로만 표시한다. syscall은 관측 error 필드의 제한된 값이며 stage에서 추측해 채우지 않는다.

이는 계측 경계까지 전파된 error.syscall을 식별한다. Node 내부 recursive rm의 선행 syscall 전체를 추적하거나 실제 OS의 가장 첫 실패를 확정하는 기능은 아니다.

worker는 기존 phase/code와 별도로 이 세 필드만 출력한다. error message, stack, path, command, PID/PGID, metadata, cookie는 출력하지 않는다. 패키지에도 새 helper를 포함하고 manifest 지문을 검사한다. 진단용 fault fixture는 패키지에 넣지 않는다.

프로세스 identity·UID·PGID·실행 파일·profile 검증, signal 직전 재검사, 종료 관측, namespace/path 검증은 변경하지 않았다. timeout, 반복 횟수, skip, exit 기대값, rm 옵션도 유지한다. EPERM을 무시하거나 filesystem 재시도를 추가하지 않는다. 이는 진단 보강이며 추측에 기반한 동작 수정이 아니다. 추가 await가 실행 타이밍에 영향을 줄 수 있으므로 이후 정상 통과도 과거 race의 해결 증거가 될 수 없다.

## 검증

제어 반례는 root 목록, session 삭제, browser metadata 읽기, owner 존재 probe, process table 조회, TERM, KILL에서 EPERM을 주입한다. 원래 오류가 그대로 거부되고 경계가 구분되는지 확인한다. worker 수준 반례에서는 exit 1, 기존 session 보존, 새 session 미생성, 비밀값 미출력도 검사한다. TERM/KILL 반례는 오류 후 재시도·추가 escalation을 하지 않는지 확인한다. hostile syscall/error 필드로 진단에 원문을 주입할 수도 없다.

관련 storage/startup/recovery 42개 통과. 변경 뒤 전체 Mac 검사는 한 번 수행했으나 요약 없이 exit 137로 중단됐다. 첫 before-record 시험 PASS만 로그에 있으며 전체 통과가 아니다. 이 중단의 주체·원인도 미확정이고 동일 검사를 바로 재실행하지 않았다. 남아 있던 이 실행의 synthetic worker 1개는 session owner identity·시작 시각·UID·정확한 scratch worker command를 다시 대조한 뒤 TERM으로 종료했고, 해당 worker 소멸 및 결합된 session 삭제를 확인했다. 사용자 Chrome이나 다른 작업의 프로세스를 종료하지 않았다.

종료137의 확인 근거는 실행 도구의 `exit_code:137`과 부분 로그다. 도구는 별도 signal 필드를 반환하지 않았고 timeout/자원 제한 원인도 보고하지 않았다. 이 단위가 전체 실행에 종료 명령을 보낸 기록은 없다. kernel/OOM 또는 외부 종료 주체의 근거는 확보하지 못했으므로 exit 137만으로 SIGKILL 발신자·메모리 부족·도구 시간 제한을 확정하지 않는다.

정확한 결과와 로그 SHA는 `MAC_STALE_RECOVERY_EPERM_VERIFICATION.json`에 기록한다. 새 head 원격 CI는 정상 push/PR 경로로 수행하며 기록 시점에는 대기 상태다. 어떤 PASS도 원본 cause 확정으로 기록하지 않는다.

## 보존 및 인수 경계

기존 scratch를 재사용하고 `codex/mac-stale-recovery-eperm`을 실패 head에서 만들었다. 이전 Mac branch와 API `4dec3bd94ad786d2f1b52d00b5bfa1eab8f82ec0` 작업본은 보존한다. AI 소스·원장, 기존 사용자 금고·DB·체인·키는 변경하지 않는다. draft PR만 만들며 main/develop 병합·배포·새 유료 평가를 하지 않는다.

멘토 미결 정책, 400% 자동 자격·지급 금지, 500% 제외, Moodle·원천 검증 차단, grant/outbox HOLD, 독립 청구 NO-GO, Mac 실패 원인 미확정을 유지한다. 이후 같은 오류가 생기면 새 고정 진단으로 최초 경계를 확인하고 그 근거에 맞는 최소 수정을 검토한다. 원인 없는 동일 검사 반복으로 해결 처리하지 않는다.
