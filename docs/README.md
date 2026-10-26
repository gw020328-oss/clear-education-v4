# CLEAR 문서

2026-10-26 현황: [develop #102 통합과 실제 r20의 로컬100 TEST 수령 기록](status.md#2026-10-26-공개-현황)을 반영했습니다. 실제 HackerRank·로컬 Moodle 데모·AI·양측 동의의 연결 결과는 INCLUDED/finalized=false이며, main 기능 반영·제품 프론트·원격 기관 Moodle·상용 배포 완료와 구분합니다.

2026-10-25 현황: [실제 r15의 BIND 중단·합성 복구 권한 재현과 수정](status.md#2026-10-25-공개-현황)을 반영했습니다. 실제 지급 완료·원인 확정·수정 후 실제 재시험과 구분하며, 미병합 #102의 로컬/CI 결과를 현재 제공 기능으로 표시하지 않습니다.

2026-10-24 현황: [r9 원격 ZK 검증 중단·STWO 버전 호환성 조사](status.md#2026-10-24-공개-현황)를 갱신했습니다. 미병합 #102의 로컬 검증·CI 성공과 원격 배포 호환/실제 재시험 미확정을 구분하며, 기존 제공 코드와 사용법은 유지합니다.

2026-10-23 현황: [시험 클라이언트 준비·실제 원천 요청 전 실패·수정 후 미재시험](status.md#2026-10-23-공개-현황)을 구분했습니다. HackerRank #103은 API 작업 브랜치에만 병합됐으며 develop/main 기능 반영이나 전체 시연 완료가 아닙니다.

2026-10-21 현황: [미병합 TEST 연결·실제 합성 AI 평가와 남은 원천 차단](status.md#2026-10-21-공개-현황)을 갱신했습니다. 격리 체인의 합성 원천 지급과 공개 합성 8건 평가(7 PASS·1 보완)는 실제 원천 전체 시연·제품 지급 완료와 구분합니다. 기존 코드와 사용법은 유지합니다.

[2026-10-19 공개 현황](status.md#2026-10-19-공개-현황)은 미병합 TEST 준비·모델 차단·비지급 경계와 Mac 검사 실패/후속 성공을 구분합니다. 외부 PR의 준비 성과는 main의 로컬 기능·사용법으로 안내하지 않습니다.

[2026-10-18 공개 현황](status.md#2026-10-18-공개-현황)에서 새 부트캠프 관련 열린 PR과 현재 main의 재현 경로를 구분합니다. 미병합 코드·설계는 외부 PR 링크로만 안내하며 main의 로컬 기능/사용법으로 표시하지 않습니다.

[2026-10-17 공개 현황](status.md#2026-10-17-공개-현황)에서 main의 기존 제공 범위와 develop의 C1~C3·Moodle·AI 진행을 구분합니다. 상세 개발 계약은 [고정 develop 커밋](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/current/MVP_EVIDENCE_HTTP_CONTRACT.ko.md)의 외부 링크로 안내하며 main에서 사용할 수 있는 로컬 파일·명령으로 표시하지 않습니다.

공개 현황(2026-10-15)은 [main 제공 범위와 develop 진행의 구분](status.md#2026-10-15-공개-현황)을 먼저 확인하세요. main의 기존 코드·설치/실행 방법은 유지했습니다. 최신 개발의 자세한 기록은 [확인한 develop 커밋의 현황](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/status.md)에 있으며 main에 없는 기능의 사용 안내가 아닙니다.

## 처음 보는 분

| 문서 | 내용 |
| --- | --- |
| [프로젝트 소개](../README.md) | 목적·기능·테스트 시작 방법 |
| [아키텍처](architecture.md) | 데이터 흐름과 기술별 역할·신뢰 경계 |
| [개발 현황](status.md) | 확인한 결과, 미완료 범위, 다음 단계 |
| [개발 가이드](development.md) | 설치·환경 준비·테스트·문제 해결 |

## 제품과 구현 설계

- [PRD](reference/PRD.ko.md): MVP 규칙과 완료 기준
- [기술 설계](reference/DESIGN.ko.md): 서명·지급 권한·저장·복구
- [구현 계획](reference/IMPLEMENTATION_PLAN.ko.md): 단계와 의존 관계
- [기존 구현 감사](reference/AUDIT.ko.md): 기존 코드와 저장된 실행 근거

## 실험 기록

- W01: [환경 준비 결과](w01/REPORT.ko.md)
- W02: [합성 검증 결과](w02/REPORT.ko.md), [검증 상태 JSON](w02/verification.json)
- [기존 YBM 경로의 v4 적용 설계](w02/V4_ROUTE_DESIGN.ko.md)
- [수동 provider 작성 도구 진단](w02/SESSION_DIAGNOSIS.ko.md)

W01·W02 문서는 당시의 작업 기록입니다. 오래된 판단과 후속 정정이 함께 있는 문서는 최신 정정 절과 검증 상태를 먼저 확인하세요. 외부에 제공하지 않는 실험 원본은 ‘비공개 로컬 자료’로 표시합니다.

## 문서 구성 참고

소개·시작 방법·기능·상세 문서를 구분하는 구성은 아래 공식 안내와 공개 프로젝트를 참고했습니다. 해당 프로젝트의 기술 선택이나 보안 보장을 CLEAR가 그대로 갖췄다는 뜻은 아닙니다.

- [GitHub: About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [Scaffold-ETH 2](https://github.com/scaffold-eth/scaffold-eth-2)
- [Reclaim Onchain Starter Kit](https://github.com/reclaimprotocol/reclaim-onchain-base-starterkit)
