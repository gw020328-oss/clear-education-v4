# CLEAR 문서

2026-10-28 현황: [develop S4 병합과 제품 호스트 #120의 CI 차단](status.md#2026-10-28-s4-병합제품-호스트-ci-차단-현황)을 반영했습니다. 내부 V2/S3 구현·제품 호스트 노출·실제 제품 완주를 구분하며, #120의 로컬 HTTPS 성공을 전체 CI 통과로 표시하지 않습니다.

2026-10-27 현황: [develop의 V2 등록·S3 이의/정정 통합과 미병합 S4](status.md#2026-10-27-v2-등록s3-통합과-s4-진행-현황)를 반영했습니다. 새 검증은 합성 원천·격리 TEST 범위이며, 기존 실제 r20·main 제공 기능·제품 프론트 실제 완주와 구분합니다.

2026-10-26 현황: [develop #102 통합과 실제 r20의 로컬100 TEST 수령 기록](status.md#2026-10-26-develop-통합실제-r20-로컬-test-현황)을 반영했습니다. 실제 HackerRank·로컬 Moodle 데모·AI·양측 동의의 연결 결과는 INCLUDED/finalized=false이며, main 기능 반영·제품 프론트·원격 기관 Moodle·상용 배포 완료와 구분합니다.

2026-10-25 현황: [실제 r15의 BIND 중단·합성 복구 권한 재현과 수정](status.md#2026-10-25-r15-중단복구-권한-재검사-현황)을 반영했습니다. 실제 지급 완료·원인 확정·수정 후 실제 재시험과 구분하며, 미병합 #102의 로컬/CI 결과를 현재 제공 기능으로 표시하지 않습니다.

2026-10-24 현황: [r9 원격 ZK 검증 중단·STWO 버전 호환성 조사](status.md#2026-10-24-r9-중단stwo-호환성-현황)를 갱신했습니다. 미병합 #102의 로컬 검증·CI 성공과 원격 배포 호환/실제 재시험 미확정을 구분하며, 기존 제공 코드와 사용법은 유지합니다.

2026-10-23 현황: [시험 클라이언트 준비·실제 원천 요청 전 실패·수정 후 미재시험](status.md#2026-10-23-시험-클라이언트원천-실패-현황)을 구분했습니다. HackerRank #103은 API 작업 브랜치에만 병합됐으며 develop/main 기능 반영이나 전체 시연 완료가 아닙니다.

2026-10-21 현황: [미병합 TEST 연결·실제 합성 AI 평가와 남은 원천 차단](status.md#2026-10-21-미병합-연결평가-현황)을 갱신했습니다. 격리 체인의 합성 원천 지급과 공개 합성 8건 평가(7 PASS·1 보완)는 실제 원천 전체 시연·제품 지급 완료와 구분합니다. 기존 코드와 사용법은 유지합니다.

[2026-10-19 미병합 준비·CI 현황](status.md#2026-10-19-미병합-준비ci-현황)은 새 E1~E6 TEST 준비·Mac 시험 보강과 실패/후속 성공을 구분합니다. 열린 의존 PR과 TEST 운영 제안을 현재 제품 인수나 실제 지급 완료로 해석하지 않습니다.

[2026-10-18 미병합 작업 현황](status.md#2026-10-18-미병합-작업-현황)은 새 부트캠프·HackerRank·ledger·권한 리뷰 PR과 Moodle/AI 갱신을 현재 병합 코드와 구분합니다. CI 성공만으로 운영 원천·지급·모든 로컬 시험 coverage 완료를 주장하지 않습니다.

최신 develop 진행은 [2026-10-17 원격 확인](status.md#2026-10-17-원격-확인)을 우선합니다. [C3 합성 증거/평가](current/MVP_EVIDENCE_HTTP_CONTRACT.ko.md), [원문·C1·C2 HTTP 인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md), [격리 Moodle](moodle/LOCAL_API_LAB.ko.md), [AI workflow adapter](ai-vision/WORKFLOW_ADAPTERS.ko.md)는 각 구현 범위와 운영 차단을 함께 확인합니다. 과거 문서의 Draft/미구현 표현을 현재 병합 상태와 구분합니다.

2026-10-15 11:22 KST 최신 원격 상태: `develop` [21776f5](https://github.com/gw020328-oss/clear-education-v4/commit/21776f53d7660597b94a37c89139316e43eeb673)(PR #36 병합), `main` `375051e` 미통합. [최신 현황·PR·CI](status.md#2026-10-15-원격-확인)를 먼저 읽습니다. 아래 날짜별 기준과 시험 수는 당시 기록입니다.

- [등록 이력 → 목표 성적의 합성 계약](current/EXAM_LIFECYCLE.ko.md), [별도 영속 접수·수집기 연결](current/HISTORY_INTAKE.ko.md), [비식별 실제 실행 기록](current/history-intake-verification.json): PR #31~#35가 develop에 병합됐습니다. 표 증명·접수 성공과 전체 이력·신원·제품 자격·지급을 구분합니다.
- [부분 충전·전액 배정 TEST 실험](current/TEST_FUNDING_LAB.ko.md), [저장된 합성 검증](current/test-funding-lab-verification.json): PR #36 병합. 실제 원천·PG·원화·제품 지급 통합은 포함하지 않습니다.
- Moodle·AI/Vision·공통 정책 계약의 진행 PR은 최신 현황에서 확인합니다. 실제 Moodle/원천 자격 검증 BLOCKED, grant/outbox HOLD, 독립 청구 제품 NO-GO를 유지합니다.

2026-10-14 M0 추가: [합성 계약](current/M0_CONTRACT.ko.md)·[결정/미결 질문](current/M0_DECISIONS.ko.md)·[프런트 시작 문서](current/FRONTEND_M0_HANDOFF.ko.md)를 우선한다. 첫 mock의 필드·예제는 FIXED_FOR_M0_FIXTURES이며 소비자 합의는 PENDING이다. 아래 넓은 설계의 wire/ABI·실제 조건은 여전히 미동결이다. 제품 기능과 M1 이후 구현은 포함하지 않으며 실제 Moodle·원천 검증 차단, grant/outbox 보류, 독립 청구 NO-GO를 유지한다.

2026-10-14 목표 설계의 시작점: [정본 PRD](current/MVP_PRD_20261014.ko.md) → [현재 구현 차이·근거](current/MVP_GAP_20261014.ko.md) → [DRAFT_INTERFACE](current/MVP_INTERFACES_20261014.ko.md) → [단계별 개발 계획](current/MVP_PLAN_20261014.ko.md). 기준 develop `6d941a1`. 새 요구는 설계이며 현재 코드·실제 수집/지급 차단을 변경하지 않습니다. 과거 reference와 아래 날짜별 기록을 최신 목표/완료 사실로 혼동하지 않습니다.

새 팀원과 LLM은 [팀 인계](current/TEAM_HANDOFF.ko.md) → [역할·PR 계획](current/TEAM_PLAN.ko.md) → [현재 API 계약](current/API_CONTRACT.ko.md) 순서로 시작합니다. [첫 작업 프롬프트](current/TEAM_START_PROMPT.ko.md)는 F0 합성 화면 PR을 위한 복사용 메시지입니다. 인계 기준은 PR #8 제품 코드와 PR #5 문서가 병합된 `9397e62`이며, 아래 날짜가 있는 현황은 당시 스냅샷입니다.

2026-10-12 14:11 KST 확인: PR #1~#4·#6~#8은 develop (`841052a`)에 병합됐고 main (`375051e`)에는 아직 반영되지 않았습니다. 최신 상태·정확한 근거 커밋·CI는 [개발 현황](status.md)을 먼저 확인하세요. 실제 YBM 증명 1쌍의 생성·독립 검증 기록과 제품 자격·지급 완료를 구분합니다.

## 처음 보는 분

| 문서 | 내용 |
| --- | --- |
| [프로젝트 소개](../README.md) | 목적·기능·테스트 시작 방법 |
| [아키텍처](architecture.md) | 데이터 흐름과 기술별 역할·신뢰 경계 |
| [개발 현황](status.md) | 확인한 결과, 미완료 범위, 다음 단계 |
| [개발 가이드](development.md) | 설치·환경 준비·테스트·문제 해결 |

## 제품과 구현 설계

- [최신 Mac MVP 범위](current/MAC_MVP.ko.md): 승인된 저장·TEE 변경, 실제/합성 완료 기준과 목표 일정
- [합성 ZIP 사용 안내](current/MAC_TOOL_GUIDE.ko.md): 기존 Mac 저장 경계 도구의 실행·정리·한계
- [PRD](reference/PRD.ko.md): 원래 MVP 규칙과 완료 기준; 변경 범위는 위 Mac MVP 문서 우선
- [기술 설계](reference/DESIGN.ko.md): 서명·지급 권한·저장·복구
- [구현 계획](reference/IMPLEMENTATION_PLAN.ko.md): 단계와 의존 관계
- [기존 구현 감사](reference/AUDIT.ko.md): 기존 코드와 저장된 실행 근거

## 최신 제품 기반 구현 (develop)

- [C1 로컬 합성 HTTPS 개발 환경](current/LOCAL_SYNTHETIC.ko.md): 독립 TEST 체인·DB·인증서·지갑 초기화, 재시작, 프론트 빌드의 동일 origin 제공. 이슈 #10의 연결 PR에서 병합 상태를 확인합니다.

- [합성 정책과 결정적 자격 평가](current/POLICY_EVALUATOR.ko.md): PR #6, 기간 내 최고점·800점 AND 시드 80%·결측/충돌 보류. SYNTHETIC 전용.
- [지갑 인증·신청 동의·SQLite 영속 상태](current/WALLET_APPLICATIONS.ko.md): PR #7, 로그인/신청 동의 nonce 원자 소비·재시작 복원.
- [금고 설정·최종 동의·예치 확인](current/VAULT_ENROLLMENT.ko.md): PR #8, CONSENTED→FUNDING_PENDING→ENROLLED와 복구. 메모리 EVM/무가치 TEST 검증.
- [제품 proof 세션·영속 nonce](current/PROOF_SESSIONS.ko.md)와 [합성 결과 단회 수락](current/PRODUCT_PROOF.ko.md)은 develop에 병합됐습니다. 사업 단위 시험 nullifier·제품 자격/지급·타 사용자·운영 배포는 후속이며, grant/outbox와 독립 청구 제품 전환은 보류합니다. 과거 보고서의 당시 후속 항목은 최신 현황과 함께 읽습니다.

## 실험 기록

- 최신 W02: [동일 client 새 YBM 증명 생성·독립 검증](w02/YBM_PROOF_REPORT.ko.md), [공개 검증 기록](w02/ybm-proof-verification.json): 실제 성공 실행 `1a99de4`, 최종 수정 `0a08b4e`, PR #4 develop 병합
- 선행 W02: [신청·지갑 결합과 원천 형식 진단](w02/YBM_BINDING_REPORT.ko.md), [진단 기록](w02/ybm-binding-verification.json), [YBM 접속 경로](w02/YBM_ROUTE_REPORT.ko.md)
- Mac 저장 경계: [구현·합성 패키지 결과](w02/MAC_STORAGE_REPORT.ko.md), [PR #1 종료·복구 보정](w02/PR1_FIX_REPORT.ko.md)

- W01: [환경 준비 결과](w01/REPORT.ko.md)
- W02: [합성 검증 결과](w02/REPORT.ko.md), [검증 상태 JSON](w02/verification.json)
- [기존 YBM 경로의 v4 적용 설계](w02/V4_ROUTE_DESIGN.ko.md)
- [수동 provider 작성 도구 진단](w02/SESSION_DIAGNOSIS.ko.md)

W01·W02 문서는 당시의 작업 기록입니다. `merged:false`·Draft 표기는 과거 기록으로 보존하며 현재 병합 여부는 [개발 현황의 PR 링크](status.md)를 따릅니다. 400/407/519/577/655개 시험은 각 단계의 저장된 실행 기록이며 더하지 않습니다. 최신 PR #8 기록의 총계는 655개(실패/skip 0개)이며 이번 문서 작업의 재실행 결과가 아닙니다. 이번 문서 확인은 실제 로그인·증명 재실행이 아닙니다. 오래된 판단과 후속 정정이 함께 있는 문서는 최신 정정 절과 검증 상태를 먼저 확인하세요. 외부에 제공하지 않는 실험 원본은 ‘비공개 로컬 자료’로 표시합니다.

## 문서 구성 참고

소개·시작 방법·기능·상세 문서를 구분하는 구성은 아래 공식 안내와 공개 프로젝트를 참고했습니다. 해당 프로젝트의 기술 선택이나 보안 보장을 CLEAR가 그대로 갖췄다는 뜻은 아닙니다.

- [GitHub: About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)
- [Scaffold-ETH 2](https://github.com/scaffold-eth/scaffold-eth-2)
- [Reclaim Onchain Starter Kit](https://github.com/reclaimprotocol/reclaim-onchain-base-starterkit)
