# Windows 수집 도구 기술 검증 — 2026-10-13

**판정: Windows 11 일반 계정에서 기본 합성 호환성을 확인했으며 제품 GO는 계속 보류한다.** 팀원 최종 실행은 **36 PASS / 0 FAIL / 2 BLOCKED / 5 NOT_RUN**이다. 서버 CI 대비 실제 Windows 11 대상 확인과 기존 Chrome PID/시작 시각 보존 2개가 추가 통과했다. 암호화 상태 확인·Windows native OPRF·제품 저장/복구 관문은 남아 있다. Windows 수집 도구만 대상이며 서버/DB/체인의 Windows 호환성을 주장하지 않는다.

최초 spike 기준: `3f8ef79` worktree, Node 24.21.0/npm 11.19.0, attestor-core 5.1.4, lockfile의 zk-symmetric-crypto 5.1.6. 실제 계정·기존 쿠키·증명·브라우저 프로필을 사용하지 않았다. 기존 Mac 제품 모듈 수정은 없다.

## 실행 사실

| 검사 | 결과 | 근거/한계 |
|---|---|---|
| STWO AES128/AES256/ChaCha20 각 prove/verify | PASS, Mac arm64 | 합성 16/16/64바이트 입력, Node WASM 경로 |
| 각 알고리즘 plaintext/ciphertext/nonce/counter/proof 변조 거부 | PASS, Mac arm64 | 총 15개 거부; 원천 HTTP/YBM 자격 증명 아님 |
| 고정 Node/zk 패키지 | PASS, Mac | 합계 20 PASS, `mac-synthetic-report.json` |
| Windows 고정 ZIP/EXE SHA256 원천 확인 | PASS, 공개 원천 읽기 | 공식 SHASUMS256을 읽어 `runtime.json`에 고정. 후속 Windows Server 및 팀원 PC에서 다운로드·실행 PASS |
| Windows STWO·Chrome pipe·Job·ACL·lock·junction 합성 진단 | PASS, Windows Server 2022 x64 | CI에서 PS/C# 컴파일·실행 포함 확인. 한글/공백 프로필 정리도 PASS |
| Windows Server CI | 34 PASS / 2 BLOCKED / 7 NOT_RUN | `windows-server-ci-report.json`; 암호화/gnark BLOCKED, Win11·기존 Chrome 보존·강제종료/TTL 등 NOT_RUN |
| 팀원 Windows 11 PC | 36 PASS / 0 FAIL / 2 BLOCKED / 5 NOT_RUN | `windows11-teammate-report.json`; CLIENT build26200 x64, 기존 Chrome 보존 포함 |
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

Windows 이식만 집중 개발 10~15작업일이라는 기존 추정은 **첫 gate가 바로 통과하고 기존 STWO를 유지하는 경우**에만 유지할 수 있다. Windows Server 합성 성공 후에도 남은 Windows11 암호화 확인·native 저장/복구 요구를 반영하면 **12~18 엔지니어 작업일**을 계획 범위로 잡는 편이 타당하다: 기반 gate/adapter 1~2일, 저장/ACL/handle 경계 3~4일, Chrome/Job/lifecycle 3~4일, verifier·패키징·CI 2~3일, 팀원/비개발자·강제종료 회귀와 수정 3~5일. 일부 작업은 겹칠 수 있으나 외부 기기 대기시간은 별도다. 현재 spike는 이 공수 전체의 완료가 아니다.

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

## Windows Server 실행 근거

[GitHub 실행 38336271261](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38336271261), 소스 `4a8b0c3`, Windows Server build20348. 정제된 실제 JSON을 `windows-server-ci-report.json`에 보관한다. CI 시작 때 기존 Chrome 프로세스가 없어 기존 창 보존은 NOT_RUN이다. `device-encryption-active`와 `gnark-windows-native-binary`가 BLOCKED인 상태의 합성 검사 성공이며 실제 로그인 허가가 아니다.

## 팀원 Windows 11 결과 — 2026-10-13 수신

원본 [최소 JSON](windows11-teammate-report.json)의 필드와 값을 보존했다. 저장소 규칙에 따라 개행은 LF로 정규화한다. 저장소 파일 SHA256: `ae086c0ddae6ef67b4b448a38ffd4a8cb7bfee8d91eeab2306e9fcd1161d8acc`. 수신 원본(CRLF) SHA256: `d81b6e7afb9246e1a48a258bbace888126a9a2c5fae65fe0ffc1a282b9b5e922`. JSON이 확인하는 환경은 CLIENT/build26200/win32/x64, 합성 전용이며 `realYbm=false`, `productionReady=false`다. Windows 11 Home·일반 계정·Chrome 154는 팀원이 별도로 전달한 환경 정보다.

검증한 전달 ZIP의 기록은 source `f13df04bd4050bf934f476479b6c7d6dc1ff0764`, ZIP SHA256 `fa74fa319952d1dcc22c01ca761feb95b9e43ad7890647c67e653860537c623d`다. 이 연결은 전달 이력에 따른 것이며 보고서 자체에 소스 지문이 들어 있는 것은 아니다. 전달 ZIP과 package-manifest는 보존하며 이번 소스 수정의 재검증 결과로 오인하지 않는다.

- STWO 3개 알고리즘의 증명/검증 3개와 변조 거부 15개 모두 PASS. 원천 결합·실제 YBM·OPRF 검증 성공을 뜻하지 않는다.
- Chrome pipe·합성 CDP 왕복·정상 exit0·기존 Chrome PID/시작 시각 보존 PASS. 한글/공백 프로필 정리는 exit0, 필수 3개 검사, 실제 폴더 삭제를 모두 요구하는 수정된 진단에서 PASS다.
- `device-encryption-active`: BLOCKED/`READ_ACCESS_OR_MODULE_UNAVAILABLE`. 조회 불가이며 암호화가 꺼졌다는 뜻이 아니다. Home/일반 계정에서 사용할 확인 방법은 미결이다.
- `gnark-windows-native-binary`: BLOCKED/`SEPARATE_OPRF_GATE`. STWO와 별도의 Windows native OPRF 관문이다.
- NOT_RUN 5개: 타사 동기화/백업 소유자 확인, Job host 강제 종료 복구, PID 재사용 공격, 실행 중 24시간/재시작 정리, reparse race/hardlink 공격이다.

팀원은 루트 경로 143자에서 bootstrap 3회 실패, Node ZIP 37,618,919바이트 및 SHA256 일치, 26자 경로로 옮긴 뒤 성공을 보고했다. Node 내부 npm의 긴 경로와 Expand-Archive 제한으로 진단한 관찰이며 최종 JSON에는 bootstrap 실패 이력이 포함되지 않는다. 따라서 0 FAIL은 **짧은 경로의 최종 진단** 기준이다. 이번 수정은 짧은 폴더 안내, 검증된 ZIP의 압축 해제 전 경로 길이 검사, 실패 단계별 안전한 코드/복구 안내를 추가한다. 원본 JSON의 PASS 옆 `SERVER_CI_IS_NOT_WINDOWS11`은 당시 표시 결함으로 보존하고 이후 생성 보고서는 PASS에 코드를 붙이지 않는다.

실기기 STWO/Chrome/기본 OS 관문은 진전됐지만 독립 verifier IPC·암호화·제품 수명/복구·native OPRF는 남는다. 기존 12~18 엔지니어 작업일 계획을 이번 결과만으로 축소하지 않는다. PR 병합은 기술검증 기록과 합성 진단의 통합이며 실제 수집/지급 활성화가 아니다.
