# 개발 현황

공개 근거 확인: **2026-10-12 02:40 UTC (11:40 KST)**. 원격 브랜치·PR·정확한 커밋의 CI와 공개 보고서를 대조했다. 실제 YBM 로그인·증명 생성이나 과거 407개 시험을 이번 문서 작업에서 재실행한 것은 아니다.

## 원격 반영 범위

| 대상 | 확인한 상태 |
| --- | --- |
| main | [`375051e00f8f45a8266a6158024c84d3898b11c9`](https://github.com/gw020328-oss/clear-education-v4/commit/375051e00f8f45a8266a6158024c84d3898b11c9), 개발 기준본. 아래 PR #1~#4 결과는 미반영 |
| develop | [`366417e3fd7b0cc64ed905cd65a4880955313419`](https://github.com/gw020328-oss/clear-education-v4/commit/366417e3fd7b0cc64ed905cd65a4880955313419), PR #4 병합 커밋. 아래 최신 구현·실제 진단 결과는 이 브랜치 기준 |
| 열린 PR | 확인 시점 0개. 이 현황 갱신용 PR을 만들기 전의 조회 결과 |

| 병합 PR (모두 develop 대상) | 범위 | 병합 커밋 |
| --- | --- | --- |
| [#1](https://github.com/gw020328-oss/clear-education-v4/pull/1) | W02 검증·Mac 저장 경계·협업 CI | `dd7ec920fafbaf44ee9ac848f6fabb9ee5e7a467` |
| [#2](https://github.com/gw020328-oss/clear-education-v4/pull/2) | Mac 전용 YBM 접속 경로 | `dc08a37e8f37387daf1159a85a2dd6087e8f538f` |
| [#3](https://github.com/gw020328-oss/clear-education-v4/pull/3) | 신청·수취 지갑 결합과 실제 원천 형식 진단 | `d880fd65a99109c6802df364fdb40c44d60c0247` |
| [#4](https://github.com/gw020328-oss/clear-education-v4/pull/4) | 동일 client 새 증명 생성·독립 검증, 검증 프로세스 시작 실패 정리 수정 | `366417e3fd7b0cc64ed905cd65a4880955313419` |

PR #4는 2026-10-12 02:20:18 UTC에 병합됐다. 로컬 진단과 develop 병합은 서비스 배포나 main 통합 완료를 뜻하지 않는다. 과거 보고서의 `merged:false`·Draft·미병합 표기는 작성 당시 기록으로 보존하며, 현재 병합 여부는 위 PR을 기준으로 읽는다.

## 완료·진행·미검증

| 영역 | 확인한 결과와 근거 | 남은 범위 |
| --- | --- | --- |
| 기존 Stage14/15·YBM·Amoy | [감사 기록](reference/AUDIT.ko.md)의 저장된 로컬 시제품·실제 YBM 1쌍·과거 로컬 포크 결과 | v4 제품 통합, 현재 공개 배포·실제 지급의 근거가 아님 |
| W01·W02 A/B | [환경 준비](w01/REPORT.ko.md), [ProofAdapter 107개](w02/W02A_REPORT.ko.md), [원천 추출·격리 62개 합성 시험](w02/W02B_REPORT.ko.md) | 합성 시험 자체는 실제 계정 수집·지급을 검증하지 않음 |
| Mac 저장·복구 | [관리형 저장과 합성 패키지](w02/MAC_STORAGE_REPORT.ko.md), [종료·복구 보정](w02/PR1_FIX_REPORT.ko.md) | OS 흔적의 완전 삭제, 모든 기기 호환성은 보장하지 않음. 기존 ZIP은 합성 전용 |
| W02 실제 형식 진단 | [공개 기록](w02/ybm-binding-verification.json): `3b62622`에서 본인 실제 원천의 같은 시험 연결·진단 신청/지갑 결합·프로필 정리 | 이 단계 자체의 proof 생성·서명 검증·지급은 false였음 |
| W02 새 증명·독립 검증 | [보고서](w02/YBM_PROOF_REPORT.ko.md)와 [기계 판독 기록](w02/ybm-proof-verification.json): `1a99de4`에서 본인 접수·성적 claim 2건(1쌍)의 생성·독립 검증 성공 | 메모리의 로컬 진단 authority·새 테스트 지갑 범위. 제품 DB·예치·영속 nonce 소비 API는 후속 |
| 제품 자격·지급 | 진단 경로와 제품 신청·정책·서버 검증 상태를 연결할 단계 | 목록 완전성·최고점 선택·800점 AND 시드 수강률 80% 판정·지급 미완료 |
| 타 사용자·제품화 | [Mac MVP 완료 기준](current/MAC_MVP.ko.md)과 기존 [합성 ZIP 안내](current/MAC_TOOL_GUIDE.ko.md) | 타 사용자 자기 PC/계정 실제 수집 최소 1건, 별도 비개발자 2명의 합성 사용성 시험, 실제 기능 배포 미완료 |

실제 성공 실행 코드는 [`1a99de4bfcb60bc486e420b12aab33550f927d2e`](https://github.com/gw020328-oss/clear-education-v4/commit/1a99de4bfcb60bc486e420b12aab33550f927d2e)다. 해당 보고서는 동일 Attestor client, 공식 claim 서명·identifier·owner·신청/수취 지갑 결합·정확한 params/context·신선도·두 원천 시험 연결, 정상 종료·프로필 삭제를 성공으로 기록한다. `listComplete`, `highestScoreAssessed`, `eligibilityAssessed`, `payment`는 false다. 원본 증명이나 개인정보를 다시 열어 검증한 것이 아니라 [develop 기준의 공개 기록](https://github.com/gw020328-oss/clear-education-v4/blob/366417e3fd7b0cc64ed905cd65a4880955313419/docs/w02/ybm-proof-verification.json)을 확인했다.

공증자 서명 claim 검증을 전체 TLS/ZK transcript 재검증·추가 TEE 검증·실명 본인확인으로 설명하지 않는다. 추가 TEE는 [승인된 Mac MVP 범위](current/MAC_MVP.ko.md)에서 후속 보장으로 분리했으며 기존 TEE 시험이 통과한 것은 아니다.

## 시험 수와 정확한 커밋의 CI

[PR #4 공개 기록](w02/ybm-proof-verification.json)의 초기 `localTests.total`은 400개, 이후 `preMergeReview.localTests.total`은 407개다. 후자는 수집기 153, Mac/무결성/공개 이력 48, ProofAdapter 107, 원천/격리 62, 저장 준비 37의 해당 검토 실행 결과다. 400과 407, 과거 단계 수, 실제 claim 2건을 서로 더해 새로운 총계·정확도·완성률로 쓰지 않는다. 최신 407개 기록의 검토에서는 새 로그인·증명 생성을 하지 않았다.

| CI 근거 | 정확한 대상 | 결과와 한계 |
| --- | --- | --- |
| [실제 성공 실행 코드의 PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38194206010), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38194203348) | `1a99de4bfcb60bc486e420b12aab33550f927d2e` | 성공. 실제 계정 결과는 별도의 위 공개 실행 기록이며 CI로 입증하지 않음 |
| [PR #4 최종 PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38195044654), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38195040083) | `0a08b4ef518abc1255da9ee1314a724fbaae2294` | Public content history, Public synthetic tests, Mac synthetic recovery 성공. PR CI는 attempt 1에서 Mac 작업 실패, attempt 2에서 최종 성공. push CI도 성공 |
| main·develop 현재 tip | 위 `375051e`·`366417e` | 각 커밋의 check-runs 0건·status 항목 0건. PR head의 성공을 병합 커밋 자체의 CI 성공으로 옮겨 적지 않음 |

[현재 workflow](../.github/workflows/public-synthetic.yml)는 develop/main 대상 PR과 `codex/**` push에서 실행한다. 공개·합성 검사이며 실제 YBM 로그인·공개 체인 지급·배포 검사가 아니다. PR #4 최종 `0a08b4e`는 검증 프로세스 시작 실패 정리 수정 커밋이며, 그 커밋에서 실제 YBM 성공을 다시 실행했다는 기록은 없다.

## 다음 단계

1. 진단용 신청·테스트 지갑과 제품 동의·신청·고정 수취 지갑·정책의 차이를 정리하고 연결한다.
2. 서버 검증 상태·영속 nonce 소비·중복 방지, 인정 시험/최고점 선택과 800점 AND 시드 수강률 80% 평가를 구현·검증한다.
3. 새 제품 신청 문맥의 새 실제 증명을 이용해 예치·로컬 1회 지급·독립 청구를 통합 검증한다.
4. 중복·변조·기한·장애 복구와 원본 삭제 뒤 직접 청구를 검증한다.
5. 타 사용자 자기 PC·계정의 실제 수집 최소 1건과 별도 비개발자 2명 합성 과업 시험을 진행한다.

이는 앞으로의 작업이며 이번 현황 문서 갱신에서 구현·로그인·지급·배포를 실행한 것이 아니다. 실제 증명 시연과 합성 사용자 체험은 별도 결과로 보고한다. 수동 provider 작성 도구의 과거 오류는 직접 생성 경로 전체의 현재 차단 조건이 아니다.

## 후속 범위

실명 본인확인, 실제 학원 API, 원화 지급, 공개 Amoy 지급, 여러 교육기관 지원과 실제 도입·예치 의향 검증은 후속 과제다. [원래 PRD](reference/PRD.ko.md)와 [최신 Mac MVP 변경](current/MAC_MVP.ko.md)을 함께 읽는다. 날짜별 계획은 완료 사실이 아니다. 전체 통합 검증 뒤 develop → main PR로 반영하며 자동 병합하지 않는다.
