# GitHub 협업 운영

작업 브랜치에서 검증 가능한 단위로 커밋·푸시하고, PR 검토를 거쳐 `develop`에 통합합니다. 전체 통합 검증 뒤 `develop` → `main` PR로 제출·시연 기준을 갱신합니다. 현재 `main`은 완성 서비스가 아닌 개발 기준본입니다.

## 최초 전환 기준

2026년 10월 11일 확인 당시 원격 `main`과 `codex/clear-education-v4`는 `375051e00f8f45a8266a6158024c84d3898b11c9`였습니다. 기존 PR·브랜치 보호·ruleset·미커밋 변경은 없었습니다. `develop`은 이 원격 `main` 커밋에서 생성했으며 로컬 개발 변경을 먼저 포함시키지 않았습니다.

검토 대상인 기존 작업 커밋은 W02 A `66866c2`, W02 B `2c16023`, OS 저장 진단 `31e10cf`, Mac 관리형 저장·패키지 `0ba422e`입니다. 협업 안내와 공개 합성 CI를 추가해 같은 작업 브랜치의 Draft PR로 제시합니다. 기존 개발 브랜치를 삭제하지 않고 기본 브랜치 `main`도 유지합니다. 이 전환에서 제품 기능을 추가하거나 PR을 병합하지 않습니다.

## 보호와 검토 기준

`main`과 `develop`에는 PR 경유, 승인 1건, 변경 후 기존 승인 무효화, 검토 대화 해결, 강제 푸시·삭제 금지를 적용합니다. 관리자에게도 규칙을 적용하고 우회 권한을 추가하지 않습니다. 최종 푸시자와 별도 승인자를 추가로 요구하는 규칙이나 CODEOWNERS는 이번에 도입하지 않습니다.

공개 합성 CI의 `Public content history`, `Public synthetic tests`는 실제 성공과 GitHub Actions 앱을 확인한 뒤 필수 검사로 등록합니다. 기준 브랜치 최신 상태에서도 검사해야 합니다. `verify:workspace`는 원본/공개용 지문을 분리하고 새 복제본에서도 실행하도록 수정하여 기존 `Public synthetic tests`에 포함했습니다. 새 필수 검사 이름을 추가하거나 보호 조건을 낮추지 않습니다. 실제 로그인 의존 검사는 공개 CI에 넣지 않습니다. 적용 상태와 최신 검사 결과는 GitHub의 보호 설정 및 PR Checks를 기준으로 확인합니다.

사용자 승인으로 `puppy57201-stack` 계정에 Write 권한 초대를 발송했습니다. **초대 수락과 Write 권한 확인 전에는 승인 필수 조건을 충족할 팀원이 확보된 것으로 세지 않습니다.** 초대 대기를 이유로 관리자 우회나 승인 조건 해제를 하지 않습니다. 아직 다른 리뷰어 지정이나 별도 메시지는 보내지 않았습니다.

PR 작성자는 자신의 PR을 승인하는 사람으로 계산하지 않습니다. 리뷰어는 실제 완료 범위·시험·원본 보존·남은 과제를 확인합니다. 실제 YBM 수집·지급은 미완료이며 저장 경계/합성 검증 성공과 구분합니다.

## 검사와 민감정보

현재 파일뿐 아니라 푸시할 커밋 이력의 금지 자료 경로와 알려진 자격 증명 패턴을 검사합니다. 검사 로그에는 발견된 값 자체를 남기지 않습니다. 실제 성적·원문 증명·쿠키·키·브라우저 프로필은 포함하지 않고 배포 ZIP은 Git에서 제외합니다. 자동 검사는 탐지 보조 수단이며 자료 검토를 대체하지 않습니다.

CI는 읽기 전용 권한, 고정된 Action commit SHA, 고정 Node와 lockfile, 설치 스크립트 비활성화를 사용합니다. 배포·공개 체인 거래·유료 API·실제 계정 로그인은 실행하지 않습니다. Mac 브라우저 통합 시험은 로컬 결과로 별도 표시합니다. 자세한 실행 범위는 [개발 가이드](development.md)에 있습니다.

[GitHub 브랜치 보호 안내](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [보호 설정 API](https://docs.github.com/en/rest/branches/branch-protection).
