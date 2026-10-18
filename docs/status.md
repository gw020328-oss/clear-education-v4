# 개발 현황

## 2026-10-18 공개 현황

원격 확인 **2026-10-18 12:11 KST**. main은 [`72fe051`](https://github.com/gw020328-oss/clear-education-v4/commit/72fe051c1aad6b99def4d864cd2e3841308e857c), develop은 [`9c542c3`](https://github.com/gw020328-oss/clear-education-v4/commit/9c542c38892d0a5d5e71fcbe4f87f1017d8fe843)이며 어제 이후 새 기능 병합은 없다. main의 공개 코드·의존성·기존 설치/실행 방법은 그대로다.

새로 열린 [#78 부트캠프 계획](https://github.com/gw020328-oss/clear-education-v4/pull/78), [#79 HackerRank 오프라인 증거](https://github.com/gw020328-oss/clear-education-v4/pull/79), [#80 합성 증거 ledger](https://github.com/gw020328-oss/clear-education-v4/pull/80), [#81 지급 권한·풀 재원 경계 리뷰](https://github.com/gw020328-oss/clear-education-v4/pull/81)는 **develop/main 미병합**이다. 계획·합성 producer·설계 리뷰를 현재 main에서 실행 가능한 기능이나 최종 정책·실제 지급으로 안내하지 않는다. #79는 기본 UNCONFIGURED_BLOCKED·새 실제 공식 proof 0, #80은 기본 DISABLED/합성 인수·실제 수락 불가이며, #81은 새 지급 키/서명/거래를 구현한 PR이 아니다.

확인한 최신 head는 #78 `733fe69`, #79 `0da3abe`, #80 `66893ea`, #81 `c9c0ee0`이며 각 PR/push의 공개 이력·합성 시험·Mac 복구 CI가 성공했다. CI 성공은 병합·운영 기능·실제 자격/지급 검증이 아니다. 일부 PR의 base diff에는 미병합 선행 기능 이력이 포함되므로 문서만 바꾼 PR로 취급하지 않는다.

[Moodle #71](https://github.com/gw020328-oss/clear-education-v4/pull/71)의 격리 fixture와 [AI #72](https://github.com/gw020328-oss/clear-education-v4/pull/72)의 Python 회고 세 항목 MOCK 검토도 미병합이다. 실제 기관/본인·전체 AND·지급이나 실제 Python 회고 모델 품질 성공으로 확대하지 않는다. 아래 2026-10-17의 main 재현 경로와 develop C1~C3 상태는 그대로 유지하며, 이번 문서 작업은 로그인·실제 proof·새 유료 모델 호출을 수행하지 않았다.


## 2026-10-17 공개 현황

확인 시각 **2026-10-17 11:08 KST**. main은 [`58261aa`](https://github.com/gw020328-oss/clear-education-v4/commit/58261aa2465bfc4b34d181dde2757add6eec7283)이며 제공 코드·의존성·기존 시작 명령은 그대로다. main에서 재현하는 경로는 기존 ProofAdapter 합성 테스트 36개와 문서 CI다. 아래 새 기능 코드는 main에 포함되지 않는다.

develop은 [4756589659a40c8f8fe45452a698b8a56487628c](https://github.com/gw020328-oss/clear-education-v4/commit/4756589659a40c8f8fe45452a698b8a56487628c)(PR #67 병합)이다. [고정 커밋의 HTTP 인계](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/current/MVP_SOURCE_HTTP_HANDOFF.ko.md)와 [C3 계약](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/current/MVP_EVIDENCE_HTTP_CONTRACT.ko.md)을 참고하면 원문/학생 신청·합성 표시 확인·C2 합성 문서 검토·C3 고정 fixture 수락과 M2 결과 영속 조회가 구현됐다. **develop 기준, main 미반영**이며 실제 동의·운영 원천/신원·개인자료·최종 자격/지급·팀원 화면 통합은 미완료다. 과거 공개 현황에서 열린 PR로 적은 #41~#48은 현재 develop에 병합됐다.

[격리 Moodle 1502 재시험](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/moodle/RETEST_1502.ko.md)은 새 합성 계정/강좌를 실제 로컬 브라우저/API에서 확인한 저장 결과 21/21 PASS다. 실제 학원·장기 학습·집중·전체 환급 자격의 증거가 아니다. [Gemini 재평가](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/ai-vision/GEMINI_RECOVERY_EVALUATION.ko.md)는 합성 자료 3사례에 실제 생성 5회, v4 작은 비교 3/3 기록이며 실제 학생 문서·진위/전체 이력 성능이 아니다. 이번 자동화는 로그인·API 재실행·새 유료 호출을 하지 않았다.

[#67 최종 head `973ac05`](https://github.com/gw020328-oss/clear-education-v4/pull/67)의 [PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38751820489)·[push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38751808131)는 세 검사 모두 SUCCESS다. 반면 [#61](https://github.com/gw020328-oss/clear-education-v4/pull/61)의 push Mac은 CANCELLED로 6/6 성공이 아니다. 정확한 head의 CI와 병합 커밋·실제 서비스 검증을 구분한다. source/identity·grant/outbox HOLD, 독립 청구 NO_GO, 지급 불가, 400% 사전검토 전용·500% 제외를 유지한다.

열린 개발 PR은 [#60](https://github.com/gw020328-oss/clear-education-v4/pull/60) · [#66](https://github.com/gw020328-oss/clear-education-v4/pull/66) · [#69](https://github.com/gw020328-oss/clear-education-v4/pull/69) · [#70](https://github.com/gw020328-oss/clear-education-v4/pull/70) · [#71](https://github.com/gw020328-oss/clear-education-v4/pull/71) · [#72](https://github.com/gw020328-oss/clear-education-v4/pull/72) · [#73](https://github.com/gw020328-oss/clear-education-v4/pull/73) · [#74](https://github.com/gw020328-oss/clear-education-v4/pull/74) · [#75](https://github.com/gw020328-oss/clear-education-v4/pull/75)다. 모두 확인 시점 미병합이며 해당 연구/프론트/후기 연결 성과를 main 제공 기능으로 안내하지 않는다. 아래 이전 날짜의 기준 커밋과 열린 PR 표는 당시 기록이다.


## 2026-10-15 공개 현황

원격 확인: **2026-10-15 11:52 KST**. 기본 브랜치 main의 제공 범위와 develop에서 진행한 구현·실험을 구분한다. 아래 저장된 실제 실행·시험 결과를 이번 문서 작업의 재실행으로 표현하지 않는다.

| 브랜치 | 확인한 커밋과 제공 범위 |
| --- | --- |
| main | [`2af7736d650ae75d7de9caad6c8d71c88ac45421`](https://github.com/gw020328-oss/clear-education-v4/commit/2af7736d650ae75d7de9caad6c8d71c88ac45421), [CI 구성 PR #49](https://github.com/gw020328-oss/clear-education-v4/pull/49) 병합. 기존 코드·의존성·README 사용법 그대로, ProofAdapter 합성 테스트 36개가 공개 재현 경로 |
| develop | [`5eb651a8664ea81a203431d7a8f9a24ab3972f55`](https://github.com/gw020328-oss/clear-education-v4/commit/5eb651a8664ea81a203431d7a8f9a24ab3972f55), [진행 문서 PR #44](https://github.com/gw020328-oss/clear-education-v4/pull/44) 병합. [해당 커밋의 상세 현황](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/status.md)은 develop 기준이며 main 기능·배포 완료가 아님 |

### develop에서 확인한 진행 — main 코드에는 미반영

- 제품 증명 세션·합성 결과 단회 수락과 별도 로컬 등록 이력 접수·실제 수집기 연결이 병합됐다. [등록 접수 설명](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/HISTORY_INTAKE.ko.md), [비식별 실행 기록](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/history-intake-verification.json), [PR #35](https://github.com/gw020328-oss/clear-education-v4/pull/35). 저장된 실제 성공은 표 증명·공식 서명·독립 검증·접수/DB 복구 범위다. 전체 이력·신원·제품 자격·지급은 미확인이다. 빈 응답 관찰은 인증된 미응시 결과나 성공한 타 사용자 수집이 아니다.
- [TEST 재원 실험 PR #36](https://github.com/gw020328-oss/clear-education-v4/pull/36)은 새 인메모리 체인과 인공 자격 fixture에서 부분 충전·전액 배정·고정 수령인 단회 지급을 검증했다. [실험 설명](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/TEST_FUNDING_LAB.ko.md), [저장된 합성 기록](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/test-funding-lab-verification.json). 실제 원천 자격·PG·원화·실자금·제품 지급 성공이 아니다.
- 확인 시점 [#41](https://github.com/gw020328-oss/clear-education-v4/pull/41), [#42](https://github.com/gw020328-oss/clear-education-v4/pull/42), [#43](https://github.com/gw020328-oss/clear-education-v4/pull/43), [#45](https://github.com/gw020328-oss/clear-education-v4/pull/45), [#46](https://github.com/gw020328-oss/clear-education-v4/pull/46), [#47](https://github.com/gw020328-oss/clear-education-v4/pull/47), [#48](https://github.com/gw020328-oss/clear-education-v4/pull/48)은 열린 개발 PR이다. 검사 성공이나 PR 생성만으로 main/develop 반영을 주장하지 않는다.
- 실제 Moodle·원천 자격 검증 BLOCKED, grant/outbox HOLD, 독립 청구 제품 NO-GO, 400% 자동 자격·지급 금지를 유지한다. 실제 자격/지급 통합·사업 단위 시험 재사용 방지·타 사용자 실제 수집·비개발자 합성 사용성·운영 배포는 후속이다. Mac CI 최초 timeout의 원인도 미확정이다.

### main 문서 PR 검증

[Main documentation CI](../.github/workflows/main-docs-ci.yml)는 공개 Git 이력, 문서 링크·제목·자동화 문서 전용 변경 범위, 기존 main ProofAdapter 합성 테스트를 검사한다. 구성 PR의 정확한 head `4c69067267dd981a5e413a7e0f3a5ec5470ea1e1`에서 [PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38673134697)와 [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38672583222)의 Public content history/Public synthetic tests가 모두 통과했다. 이는 실제 YBM·지급·배포 검증이 아니다. 이후 문서 PR은 각 최신 head의 전체 CI와 문서 범위를 다시 확인한다.

## 이전 main 기준의 기록

아래 기록과 다음 단계는 당시 main 코드의 범위이며 최신 develop의 구현 상태와 구분한다. 이 문서 갱신은 develop 기능 코드를 main에 가져오거나 기존 실행 방법을 변경하지 않는다.

기준: 2026.10.10. 아래는 단계별 검증 범위를 구분한 기록입니다.

| 영역 | 확인한 결과 | 아직 확인하지 않은 범위 |
| --- | --- | --- |
| 기존 Stage14/15 | AI·검토·서명·예치·직접 청구 로컬 시제품과 과거 실행 기록 | 실제 YBM 통합 환급 서비스 |
| 기존 YBM 진단 | 실제 계정 1개, 응시자·성적 증명 1쌍 연결 | v4 새 신청·지갑 연결, 다계정 안정성, 실명 인증 |
| 기존 Amoy 실험 | 과거 상태의 로컬 포크에서 검증 계약 호환성 | 공개 체인 거래·지급, 현재 배포 상태 |
| W01 | 별도 작업본, 코드 참고본 191개, 환경·의존성 준비 | 제품 구현 완료 |
| W02 | 오프라인 합성 시험 36개 통과 | 실제 증명 생성, TEE, 자격 판정, 지급, DB 동시성 |

각 시험의 수를 합산해 정확도나 제품 완성률로 사용하지 않습니다. 상세 근거는 [감사 기록](reference/AUDIT.ko.md)과 [W02 결과](w02/REPORT.ko.md)에 있습니다.

## 다음 단계

1. 기존 실제 YBM 성공 경로와 새 버전의 TEE·지갑·문맥 호환성 확인
2. 수집 클라이언트 격리, 최소 정보 추출, 임시 저장·삭제 경계 구현
3. 새 실제 증명을 새 신청에 연결하고 800점·시드 수강률 80% 판정과 로컬 지급 검증
4. 중복·변조·기한·장애·직접 청구 및 삭제 검사
5. 비개발자 최소 2명의 사용성 시험

실제 증명 시연과 합성 자료를 사용한 사용자 체험은 별도 결과로 보고합니다. 수동 provider 작성 도구의 오류는 기존 직접 생성 경로 전체가 실패했다는 의미가 아닙니다.

## 후속 범위

실명 본인확인, 실제 학원 API, 원화 지급, 공개 Amoy 지급, 여러 교육기관 지원과 실제 도입·예치 의향 검증은 후속 과제입니다. [PRD](reference/PRD.ko.md)
