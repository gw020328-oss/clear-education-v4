# Windows 수집 도구 기술 검증 — 2026-10-13

**판정: Windows 이식 후보는 유지하되 제품 GO는 보류한다.** 현재 STWO의 Node WASM은 재작성 없이 사용할 가능성을 뒷받침하는 Mac 합성 결과가 있다. Windows의 실제 로딩·prove/verify, ACL/Job/Chrome 실행은 이 Mac 세션에서 미실행이다. Windows용 실행 가능한 합성 진단 소스를 준비했으며 결과가 와야 첫 gate를 판정할 수 있다. Windows 수집 도구만 대상이고 서버/DB/체인의 Windows 호환성을 주장하지 않는다.

기준: `3f8ef79` worktree, Node 24.21.0/npm 11.19.0, attestor-core 5.1.4, lockfile의 zk-symmetric-crypto 5.1.6. 실제 계정·기존 쿠키·증명·브라우저 프로필을 사용하지 않았다. 기존 Mac 제품 모듈 수정은 없다.

## 실행 사실

| 검사 | 결과 | 근거/한계 |
|---|---|---|
| STWO AES128/AES256/ChaCha20 각 prove/verify | PASS, Mac arm64 | 합성 16/16/64바이트 입력, Node WASM 경로 |
| 각 알고리즘 plaintext/ciphertext/nonce/counter/proof 변조 거부 | PASS, Mac arm64 | 총 15개 거부; 원천 HTTP/YBM 자격 증명 아님 |
| 고정 Node/zk 패키지 | PASS, Mac | 합계 20 PASS, `mac-synthetic-report.json` |
| Windows 고정 ZIP/EXE SHA256 원천 확인 | PASS, 공개 원천 읽기 | 공식 SHASUMS256을 읽어 `runtime.json`에 고정. Windows 다운로드·실행은 미실행 |
| Windows STWO·Chrome pipe·Job·ACL·lock·junction 합성 진단 | NOT_RUN | `bootstrap.ps1`, `diagnose.ps1`, `JobRunner.cs`, `chrome-probe.mjs` 준비. 이 Mac에는 pwsh/dotnet/Windows 연결이 없어 PS/C# 컴파일도 미검증 |
| Windows Server CI | NOT_RUN | workflow 초안 준비. 부모 세션이 통합·실행한 후 별도 결과로 기록 |
| 팀원 Windows 11 PC | NOT_RUN | 원격 실행 권한/연결 없음. README의 두 명령으로 최소 보고서 생성 |
| gnark/OPRF Windows | BLOCKED | 현재 설치 graph에 gnark 네이티브 bin 없음. STWO PASS를 OPRF PASS로 해석하지 않음 |
| 실제 Windows YBM 수집·공식 proof·지급 | NOT_RUN | 제품 저장/수명 경계와 실제 참여 필요 |

## 모듈별 수정 경계

| 현 코드 | Windows에서 필요한 일 | 재사용할 부분 |
|---|---|---|
| `src/mac-collector/launch.mjs` | darwin-arm64 gate, `/bin/sh`, ulimit, lockf를 OS별 실행 backend로 분리. Windows process handle/Job/잠금 사용 | 옵션 파싱·합성 기본값·기존 Mac 실행 경로 |
| `chrome.mjs` | 설치 Chrome 탐색, 상속 pipe 확인, shell gate 대신 suspended create→Job assign→resume, Windows 환경 TEMP/TMP | CDP 메시지 제한/다운로드 거부·전용 프로필·허용 원천 중계 |
| `process-identity.mjs`, `browser-recovery.mjs` | UID/ps/sysctl/negative PID 대신 SID, process creation FILETIME, executable identity, boot/session generation, handle 소유권 | PID만 믿지 않는 정책과 불확실할 때 보수적 차단 |
| `storage.mjs` | 0700/0600·getuid·O_NOFOLLOW의 기능 대응을 ACL/재분석점/파일 handle 검사로 구현. 경로 문자열 `/` 분해 제거 | TTL 24시간, 정상/오류 삭제, 다음 실행 전 정리, 서버 메모리 staging |
| `worker.mjs` lifecycle | Ctrl+C/창 닫기·forced kill·전원 종료 후 정리, 초기화 중단/브라우저 생성 전후 실패 | 초기화/종료 순서와 cleanup 실패 처리 |
| `src/ybm-collector/run.mjs` | Mac `startChrome` 직접 import를 플랫폼 adapter로 주입 | 동일 client·허용 원천·proof/owner binding |
| `independent-verifier.mjs` | `/usr/bin:/bin` PATH 제거 대신 Windows 최소 환경/SystemRoot·TEMP 요구 검증, 고정 execPath/IPC/timeout 종료 확인 | 입력 제한·독립 verifier·원문 없는 오류 전달 |
| package/CI | Windows SHA256 고정 Node ZIP/EXE·npm, 한글/공백 경로, general user 배포·종료 | lockfile·합성 네트워크 tripwire |
| `src/application/store.mjs` | getuid/권한 의존 존재. 사용자 수집기 목표에서 서버 Windows 실행을 제외 | 서버는 현재 지원 환경에 유지 |

## 저장·수명 설계와 통과 gate

1. **위치/권한:** 제품 후보는 Known Folder LocalAppData의 `CLEAR/collector-v4` 전용 경로. 사용자 SID owner, protected DACL과 사용자 full-control을 기본으로 하고 SYSTEM/관리자 접근의 허용 범위를 별도 명문화한다. 부모 경로·volume·reparse tag·file ID·hardlink count를 handle 기반 확인한다. 문자열 검사 후 파일을 여는 시간차 공격을 이 진단은 해결하지 않는다. 잘못된 ACL이나 reparse/junction/동기화 위치는 실패로 닫는다.
2. **암호화/백업:** volume의 암호화 완료와 protection active를 읽기 전용 확인한다. 일반 사용자에서 조회가 불가능하면 자동 통과하지 않는다. Windows Home Device Encryption 포함 실제 지원 SKU와 확인 방법을 확정한다. OneDrive 알려진 경로 검사와 기기 소유자의 타사 백업/동기화 확인을 함께 요구한다. 전역 암호화·백업·보안 정책을 수정하지 않는다. Volume snapshot, pagefile, 제3자 백업, SSD 복구 불가능성은 보장하지 않는다.
3. **소유권/종료:** native helper가 Chrome/worker를 CREATE_SUSPENDED로 생성하고, KILL_ON_JOB_CLOSE 및 breakaway 없는 Job에 배치한 뒤 resume한다. 이 진단은 TerminateJobObject 후 active process=0을 조회하여 정상/오류 정리 전제만 검사한다. host 자체 강제 종료 뒤 KILL_ON_JOB_CLOSE와 다음 시작 복구는 별도 제품 gate다. Taskkill image명·PID-only·전역 Chrome 종료는 사용하지 않는다. 기존 Chrome PID+creation time을 메모리에서 비교해 보존을 검사한다.
4. **locking/재시작:** FileShare.None은 같은 프로세스의 두 번째 open 거부와 release 후 재open을 진단한다. 독립 프로세스 동시 실행, 강제 종료 후 lock release, 파일 교체 경쟁, PID 재사용·boot 변경·손상 metadata·과거 형식 복구는 제품 시험에 추가한다. PID 재사용 검사는 synthetic identity를 바꾸거나 process generation handle을 유지한 상태로 다른 PID 세대를 넣고 종료를 거부해야 한다.
5. **수명:** 정상/오류 종료 즉시 process tree 종료 확인 후 임시 자료 삭제, 실행 중 24시간 최대 TTL, host 강제 종료/전원 종료 후 다음 실행에서 새 수집 전에 정리한다. crash dump·TEMP/TMP·cache·downloads·profile 모두 세션 위치에 묶는다. 앱 미실행 중 정시 삭제 또는 완전 보안 소거를 약속하지 않는다. 회복 불가능하게 소유권이 불명확하면 새 수집을 차단한다.

진단의 새 ACL 설정은 합성 파일만 쓰는 새 GUID 폴더에 한정된다. PS의 경로 검사와 recursive remove는 제품용 race-resistant 저장 구현이 아니다. 제품 전체성/최고점 차단 또는 Mac 보호 요구를 해제하지 않는다.

## 첫 2~3일 판단과 11월 7일

첫 gate는 팀원 Windows 11에서 고정 Node/3개 STWO 알고리즘/독립 검증기 IPC/Chrome pipe가 통과하는지다. 현재 진단은 앞의 STWO·Chrome·기본 OS 기능을 자동화했고, 실제 `independent-verifier`의 Windows 최소 환경/IPC는 다음 adapter 단계에서 추가한다. ACL·암호화 확인 방법과 Job/Chrome sandbox 조합이 일반 계정에서 성립해야 제품 이식 GO다. 어떤 gate도 단순 권한 검사 삭제로 통과시키지 않는다.

Windows 이식만 집중 개발 10~15작업일이라는 기존 추정은 **첫 gate가 바로 통과하고 기존 STWO를 유지하는 경우**에만 유지할 수 있다. 현재 실제 Windows 미실행과 native 저장/복구 요구를 반영하면 **12~18 엔지니어 작업일**을 계획 범위로 잡는 편이 타당하다: 기반 gate/adapter 1~2일, 저장/ACL/handle 경계 3~4일, Chrome/Job/lifecycle 3~4일, verifier·패키징·CI 2~3일, 팀원/비개발자·강제종료 회귀와 수정 3~5일. 일부 작업은 겹칠 수 있으나 외부 기기 대기시간은 별도다. 현재 spike는 이 공수 전체의 완료가 아니다.

10월 14일~11월 6일에는 평일 18일이 있다. 따라서 Windows 담당이 전담하고 10월 15~16일에 첫 Windows gate가 통과하며, 10월 23일 전후에 저장/프로세스 실패 복구가 준비되면 Windows 합성 배포·제한된 실제 참여 검증을 11월 7일 목표에 포함하는 것은 조건부 가능하다. 반대로 10월 16일에도 STWO/Chrome/암호화 검사가 막히거나 gnark/OPRF Windows native 개발이 새로 필요하면 Windows 제품 약속은 NO-GO로 두고 Mac 경로와 Windows 합성 진단만 유지한다.

새 추가 지급 서명 없는 청구 구조의 증거 predicate·개인정보 보호 nullifier·새 계약/adapter·신뢰 registry/epoch·독립 수집·통합 회귀 공수는 위 12~18일에 **포함하지 않는다**. 특히 OPRF/TOPRF 선택은 Windows 동시 출시 위험을 올린다. A와 결합한 정확한 총 범위/GO는 통합 보고서에서 해당 증거를 대입해야 한다.

## 원천

- [Node 24.21.0 공식 SHA256 목록](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt): bootstrap의 ZIP 및 node.exe 고정값, 2026-10-13 HTTPS 읽기 확인.
- [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects): child의 기본 Job 상속, nested Job, KILL_ON_JOB_CLOSE와 tree 종료 설계 근거. 실제 Chrome sandbox 조합은 별도 실측.
- [Microsoft 파일 생성·공유 모드](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files): FileShare.None 후보와 두 번째 open 거부 시험.
- [Microsoft 파일 보안·접근권](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights), [reparse points](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points): POSIX chmod/UID를 삭제하는 대신 Windows 권한·링크 경계가 필요한 근거.
- [Get-BitLockerVolume](https://learn.microsoft.com/en-us/powershell/module/bitlocker/get-bitlockervolume?view=windowsserver2025-ps): volume/protection 상태 읽기. 키 보호자/복구 정보는 공개 보고서에 넣지 않는다.
- [Chrome remote debugging 변경](https://developer.chrome.com/blog/remote-debugging-port): 별도 user-data-dir 사용 근거.
- 설치된 `zk-symmetric-crypto/lib/stwo/operator.js`, `s2circuits-wrapper.js`, `gnark/utils.js`, `lib/config.js`: STWO Node WASM 로드 및 gnark의 플랫폼 binary 요구를 소스에서 확인. gnark loader는 `win32-x86_64-libprove.so`/`libverify.so` 형식 경로와 `import.meta.url.replace('file://','')`를 사용하며 별도 URL/path 및 binary 호환성 검증이 필요하다. 설치 graph에 bin이 없다는 사실은 upstream에 Windows 구현이 영원히 없다는 주장이 아니다.

소스 파일 목록은 이 폴더의 `runtime.json`, `bootstrap.ps1`, `diagnose.ps1`, `JobRunner.cs`, `job-tree-probe.mjs`, `crypto-probe.mjs`, `chrome-probe.mjs`, `network-guard.mjs`, workflow 초안, README, 이 보고서와 Mac 합성 결과다. 부모 세션이 공통 CI/통합 문서를 별도로 검토·커밋한다.
