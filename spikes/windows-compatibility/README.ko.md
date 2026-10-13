# Windows 11 x64 수집기 호환성 — 합성 진단

이 폴더는 제품 수집기를 Windows에서 켜는 도구가 아니다. 로그인·YBM 접속·공식 Attestor 호출·실제 증명·지급 없이, 현재 고정 STWO 엔진과 Windows 보호 기능의 이식 가능성을 검사한다. Windows ARM, WSL, 확장프로그램 전환, 서버/DB/체인의 Windows 실행은 범위 밖이다.

## 실제 팀원 PC에서 실행

Windows 11 x64 Intel/AMD, 설치된 Chrome, 일반 사용자 PowerShell을 사용한다. 관리자 실행은 필요 조건이 아니다. Chrome 기존 창을 하나 열어 두면 보존 검사를 할 수 있다. 먼저 받은 ZIP을 새 폴더에 풀고, 그 폴더에서 PowerShell을 연다. 경로에 한글·공백이 있어도 된다. 전체 저장소 clone을 사용해도 같은 명령이다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\spikes\windows-compatibility\bootstrap.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\spikes\windows-compatibility\diagnose.ps1
```

`-ExecutionPolicy Bypass`는 해당 프로세스에만 적용하며 기기 정책을 변경하지 않는다. 조직 정책이 실행을 차단하면 우회 설정을 바꾸지 말고 `미실행`으로 남긴다. 첫 명령은 공식 고정 Node ZIP과 lockfile npm 의존성을 내려받는다. 전역 Node/npm을 바꾸지 않고 `.toolchain/` 및 `src/ybm-collector/node_modules/`만 사용하며 npm lifecycle script는 끈다. bootstrap의 네트워크 다운로드는 합성 진단 자체의 외부 요청과 구분한다.

두 번째 명령은 `%LOCALAPPDATA%` 아래 새 GUID 폴더만 만들고 사용자 SID 전용 ACL을 부여한다. 그 안에서 파일 잠금, junction 거부, suspended-process Job 배치·자손 전체 종료 확인, 합성 암호 증명, 새 전용 Chrome의 pipe CDP를 검사한다. 개인 Chrome 프로필은 읽지 않는다. 종료 시 Job의 활성 프로세스가 0인지 확인한 뒤 합성 폴더를 삭제한다. 종료를 확인하지 못하면 삭제 완료를 주장하지 않는다. 호스트 자체 강제 종료·전원 종료 복구는 아직 제품 구현 과제다.

공유할 파일은 **`artifacts/windows-compatibility/report-*.json`만**이다. 보고서는 검사 ID, PASS/FAIL/BLOCKED/NOT_RUN, Windows build/client/server 종류만 담는다. 사용자명·SID·컴퓨터 이름·경로·PID·프로세스 명령줄·Chrome 버전 문자열·키·쿠키·증명은 저장하지 않는다. npm 로그, 브라우저 폴더, 화면 캡처, 계정 비밀번호는 보내지 않는다. 기존 Chrome 종료나 다른 사용자의 실행과 겹치면 보존 검사가 FAIL일 수 있으므로 합성 실행 중 기존 창을 유지한다.

`BLOCKED`는 암호화 확인 권한/기능 또는 별도 gnark/OPRF 의존성 같은 미충족 조건이다. `NOT_RUN`은 실제 기기·추가 구현이 필요한 미실행이다. 이 항목들은 PASS로 바뀌지 않는다. 프로세스 종료 코드 0은 실행한 합성 검사 중 FAIL이 없다는 의미이며 제품 허용 또는 실제 Windows 11 수집 성공이 아니다.

암호화는 읽기 전용 `Get-BitLockerVolume`으로 확인한다. 일반 계정에서 확인할 수 없으면 BLOCKED로 남긴다. 암호화·보안·백업을 켜거나 끄지 않는다. OneDrive 알려진 경로 밖이라는 확인만으로 타사 백업·동기화 제외를 증명할 수 없다.

## Mac에서 재현 가능한 부분

```sh
tools/node spikes/windows-compatibility/crypto-probe.mjs
```

고정 `@reclaimprotocol/zk-symmetric-crypto` 5.1.6 STWO WASM으로 AES128, AES256, ChaCha20를 각각 증명/검증하고 plaintext, ciphertext, nonce, counter, proof 변조를 거부한다. Node 네트워크 API tripwire가 켜져 있으며 합성 입력/출력만 사용한다. 이 tripwire는 자식 Chrome을 포함한 OS 방화벽이 아니다. Chrome은 about:blank만 열고 DNS·background-networking을 제한하나 모든 OS 수준 송신 부재를 증명한 것은 아니다.

## ZIP 구조 / CI

ZIP에는 `spikes/windows-compatibility/`의 이 소스들과 `src/ybm-collector/package.json`, `src/ybm-collector/package-lock.json`만 필요하다. `node_modules`, `.toolchain`, 개인 데이터, 기존 증명은 포함하지 않는다. 루트 상대 구조를 유지한다. 실행 workflow는 `.github/workflows/windows-synthetic.yml`에 통합했다. 이 폴더의 `windows-synthetic.workflow.yml`은 대응 참고본이다. Windows Server CI 관찰은 `windows-server-ci-report.json`에 있다. Windows Server 2022 CI의 성공과 팀원 Windows 11 PC 성공을 별도로 기록한다. 이 검사는 branch protection을 자동 변경하지 않는다.

수정 범위·검증 상태·제품 이식 gate는 [ASSESSMENT.ko.md](ASSESSMENT.ko.md)를 따른다.

## 진단 보고서 오류 회귀

2026-10-13 코드 리뷰 후 Chrome pipe 오류와 비정상 종료를 정상 종료로 기록하지 않도록 보강했다. 한글/공백 프로필 정리는 Chrome 필수 검사3개·정상 종료·실제 폴더 삭제가 모두 확인돼야 PASS다. 실패 보고서를 받으면 이전 ZIP인지 최신 package-manifest의 sourceCommit으로 구분한다. [검토 기록](../../docs/spikes/PR21_REVIEW.ko.md)에 재현과 수정 범위가 있다.

```powershell
& .\.toolchain\node-v24.21.0-win-x64\node.exe --test .\spikes\windows-compatibility\chrome-session.test.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\spikes\windows-compatibility\report-status.test.ps1
```
