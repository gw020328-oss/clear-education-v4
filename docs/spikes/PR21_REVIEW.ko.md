# PR #21 최신 develop 반영 및 코드 검토

2026-10-13. 검토 대상은 `01e4cd2`의 PR 변경 전체(격리 계약/runner, SDK predicate 실험, 공개 읽기 전용 verifier 조회, Windows bootstrap·프로세스·저장·보고서, ZIP 생성, CI, 보고서)다. 주 세션이 직접 검토했으며 별도 사람의 승인이나 독립 보안 감사를 뜻하지 않는다.

## develop 반영

`origin/develop`의 `4a0cdc6`(PR #20, 합성 학습 증거 계약)을 `b806bf5` merge commit으로 반영했다. 충돌은 없었다. 공개 합성 workflow에 학습 증거 시험과 PR #21의 직접 증명 시험이 모두 남아 있음을 확인했다. 학습 증거 회귀70개와 verify:workspace는 로컬에서 통과했다. 이번 PR의 제품 코드 차이는 여전히 없으며 새 학습 증거 코드는 develop에서 들어온 변경이다.

## 수정한 발견 사항

| 우선순위 | 문제와 발생 조건 | 수정·재현 |
| --- | --- | --- |
| P2 | Chrome 통신 오류 또는 비정상 종료가 `closed=true`를 만들면 정상 종료를 PASS로 기록했다. 통신만 닫힌 살아 있는 프로세스도 직접 종료를 생략했다. | 통신 상태와 실제 exit code/signal을 분리했다. 정상 exit0만 PASS이며 살아 있으면 종료를 요청하고 최종 자손 종료는 기존 Job host가 확인한다. 기존 구현의 제어 흐름을 합성 fixture에 넣으면 pipe error·exit1·signal exit·malformed transport 4개에서 회귀 검사가 실패했고, 수정 후 정상/오류/중단/무응답6개 모두 통과했다. |
| P2 | Chrome 실행/보고서가 실패해도 `unicode-space-profile-job-cleanup`을 무조건 PASS로 기록했다. 폴더 삭제보다 먼저 PASS가 기록되어 삭제 실패도 반영하지 못했다. | Chrome exit0, 필수3개 검사의 완전한 PASS 보고서, 실제 폴더 삭제 확인을 모두 요구한다. 누락·빈 보고서·중복 ID·검사 FAIL·잘못된 scope·비정상 exit·삭제 실패를 거부하는 PowerShell fixture9개를 Windows CI에 추가했다. |

수정 위치: `chrome-session.mjs`, `chrome-probe.mjs`, `report-status.ps1`, `diagnose.ps1`; 회귀: `chrome-session.test.mjs`, `report-status.test.ps1`. 정상 경로와 기존 Job containment/민감 자료 보호 기준은 유지한다. 과거 Windows Server 보고서는 당시 코드의 관찰 기록으로 보존하며 새 코드 결과로 덮어쓰지 않는다.

## 나머지 검토 결과와 한계

- 새 Solidity adapter는 가짜 witness 사실 모델이고 등록·회수·원천 privacy를 구현하지 않았다는 제한이 명시돼 있다. 원천에 결합된 안정 nullifier와 행 관계 미해결은 이미 NO-GO로 기록되어 있으며 제품 허용 경로가 없다. 이 제한을 해제하지 않았다.
- 읽기 전용 verifier runner의 RPC 메서드는 조회 allowlist에 한정되며 지갑·전송 메서드를 사용하지 않는다. 코드/ABI/epoch 관찰을 실제 새 proof 성공으로 승격하지 않는다.
- Windows Job host의 suspended 생성→Job 배치→resume, 전체 종료 확인 후 삭제 순서와 개인 Chrome 프로필 분리를 확인했다. host 강제 종료·24시간·PID 재사용·reparse race 등 문서에 남은 제품 관문은 여전히 미실행이다.
- ZIP은 커밋한 진단 소스와 고정 collector lockfile만 포함한다. 제품 데이터·프로필·런타임/의존성은 포함하지 않는다. 변경 후 ZIP을 다시 생성하고 최신 package-manifest의 sourceCommit/SHA256으로 구분한다.
- 수정 후 격리 기술검증 범위에서 추가로 확인된 미해결 코드 결함은 없다. 실제 Win11 일반 사용자·기존 Chrome 창 보존·암호화/백업 설정은 팀원 결과가 필요하다.

## 검증과 PR 상태

로컬: 학습 증거70 PASS, workspace 지문 PASS, 새 Chrome 오류 회귀6 PASS. Windows PowerShell fixture9개 및 실제 Windows Server의 STWO/Chrome/Job/ACL 전체 진단은 갱신된 `.github/workflows/windows-synthetic.yml`에서 실행한다. 최신 실행의 실제 성공 여부는 [PR #21 checks](https://github.com/gw020328-oss/clear-education-v4/pull/21/checks)를 따른다.

사용자 지시에 따라 팀원 결과 전까지 Draft 유지, develop/main 병합은 보류한다. 최신 develop 반영과 코드 검토·수정은 병합 승인이 아니다.

## 팀원 결과 수신 후 병합 전 검토 — 2026-10-13

앞 절의 Draft/팀원 대기는 당시 상태다. 사용자가 팀원 결과 반영, bootstrap/표시 수정, 시험·리뷰 후 문제가 없으면 PR #21 병합을 명시적으로 요청했다. 최신 develop `768bab5`는 `0f2f6e5`에 반영되어 있다. 제품 전환/배포 승인은 아니며 `realYbm=false`, `productionReady=false`와 제품 NO-GO를 유지한다.

팀원 Windows11 최종 36 PASS / 0 FAIL / 2 BLOCKED / 5 NOT_RUN과 한계는 [평가](../../spikes/windows-compatibility/ASSESSMENT.ko.md)에 반영했다. 원본 JSON의 잘못된 표시 코드도 그대로 보존한다. 검증 당시 ZIP/source 지문과 후속 수정 소스를 구분한다.

주 세션이 이번 diff의 경로 검사·실패 전파·표시·공개 데이터 범위를 직접 리뷰했다. 별도 사람 승인이나 독립 보안 감사는 아니다.

- SHA256 검증된 ZIP의 최종 파일/디렉터리 길이를 읽기 전용으로 검사하고 길면 압축 해제 전에 중단한다. ZIP을 신뢰하기 전에 압축 해제하지 않으며 부분 런타임을 자동 삭제하지 않는다. 짧은 새 폴더로 재실행하도록 안내한다.
- bootstrap 오류는 실패 단계 코드와 고정 안내만 추가한다. 예외 원문을 코드로 쓰지 않으며 알 수 없는 입력도 출력하지 않는다. 불완전한 npm 파일을 실행하기 전에 확인한다.
- Windows11 클라이언트 PASS에는 서버 오류 코드가 없고 Windows10/서버에는 해당 NOT_RUN 이유가 남는다. 암호화 조회 불가를 PASS로 바꾸지 않는다.
- 새 Windows PowerShell 회귀는 실제 합성 ZIP의 짧은 경로 압축 해제, 긴 파일/디렉터리 경로 거부, 검사 중 대상 폴더 미생성, 오류 코드/안내와 비공개 문자열 누출 방지를 확인한다. 기존 Chrome 보고서 9개에 대상 OS 경계 5개를 추가했다. 공통 CI 영향은 Windows 합성 job의 bootstrap 전 회귀 추가다. HTTP/API/DB/금고 계약 변경은 없다.

로컬 Chrome lifecycle 6개 및 workspace 보존 검사가 통과했다. 이 Mac에는 Windows PowerShell이 없어 PowerShell 회귀·실제 고정 Node bootstrap·Windows 전체 합성 진단은 변경 HEAD의 Windows CI로 확인한다. 최종 CI 결과와 병합 상태는 PR #21 본문/checks를 따른다. 이전 HEAD의 Chrome CI 간헐 실패는 원인 미확정 이력이며 이번 bootstrap 수정으로 해결했다고 주장하지 않는다.

Windows CI 최초 후속 실행에서 새 ZIP fixture가 PowerShell 5.1의 `ZipArchiveMode` 형식을 찾지 못했다. `System.IO.Compression`을 명시적으로 로드하도록 helper와 시험을 수정했다. [실패 이력](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38369336612)은 보존하며 수정 커밋의 CI로 다시 확인한다.
