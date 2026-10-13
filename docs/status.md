# 개발 현황

B3 공통 작업(2026-10-13): PR #19의 develop 병합 `3f8ef79` 위에서 [학습 증거 계약과 합성 adapter](current/LEARNING_EVIDENCE.ko.md)를 구현했다. [이슈 #13](https://github.com/gw020328-oss/clear-education-v4/issues/13). 실제 제공자/API·인증·영속 연결은 BLOCKED이며 HTTP/DB/UI·정책·금고는 변경하지 않는다. CLEAR 추가 지급 서명 전용 grant/outbox 및 종속 확대는 별도 구조 검증 전까지 보류한다. 기존 실제 YBM 원천 전체성 차단을 유지하며, 최신 head/검증/병합 상태는 연결 PR을 확인한다.

B2b 구현 추가(2026-10-13): [이슈 #18](https://github.com/gw020328-oss/clear-education-v4/issues/18), [제품 수집·검증 결과 수락](current/PRODUCT_PROOF.ko.md). B2a PR #17 병합 기준 `72b057a`에서 합성 driver/owner 결합·별도 검증 프로세스·schema 4의 세션별 단회 수락을 구현했다. 실제 YBM 전체 원천·실수집·자격/지급은 계속 차단한다. 아래 표는 과거 기록이며 최신 B2b PR의 head/CI/병합 상태를 확인한다.

B2a 구현 추가(2026-10-13): [이슈 #12](https://github.com/gw020328-oss/clear-education-v4/issues/12), [전체 시험 증거 계약](current/EXAM_EVIDENCE.ko.md). B1 PR #16 병합 기준 `2c51823`에서 범위/페이지/종료/건수·접수/성적 대조와 최고점 합성 검증을 구현했다. 실제 원천 inventory와 계정/기간 전체성은 미확인으로 실제 자격 판정 차단을 유지한다. 아래 표는 과거 기록이며 새 B2a 병합·CI 상태는 연결 PR을 따른다.

B1 구현 추가(2026-10-12): [이슈 #15](https://github.com/gw020328-oss/clear-education-v4/issues/15)와 [제품 증명 세션 문서](current/PROOF_SESSIONS.ko.md)를 확인한다. C1은 PR #14로 develop에 병합됐으며 B1은 세션·승인 nonce·현재 예치 재검증을 추가한다. 아래 과거 표의 제품 proof 미구현 표시는 당시 기준이다. B1의 AUTHORIZED는 지갑 결합 승인만 의미하며 실제 proof 수락·시험 중복 차단·outbox는 미연결이다. 최신 병합/CI 상태는 연결 PR을 따른다.

공개 근거 확인: **2026-10-12 14:11 KST**. 원격 main/develop·PR·정확한 커밋의 CI와 공개 비민감 보고서를 대조했다. 아래 시험 수와 실제 증명 결과는 저장된 실행 기록이며 이번 문서 작업에서 재실행한 결과가 아니다.

## 원격 반영 범위

| 대상 | 확인한 상태 |
| --- | --- |
| main | [`375051e00f8f45a8266a6158024c84d3898b11c9`](https://github.com/gw020328-oss/clear-education-v4/commit/375051e00f8f45a8266a6158024c84d3898b11c9), 개발 기준본. 아래 develop 결과 미반영 |
| develop | [`841052a6bfc6f306d6139e63e4110a890e046e0c`](https://github.com/gw020328-oss/clear-education-v4/commit/841052a6bfc6f306d6139e63e4110a890e046e0c), PR #8 병합 커밋. 아래 최신 구현·진단 결과의 기준 |
| 열린 PR | 확인 시점 [#5](https://github.com/gw020328-oss/clear-education-v4/pull/5) 문서 갱신 Draft 1개. 이 문서의 병합 이후 상태는 PR 링크에서 확인 |

| 병합 PR (모두 develop 대상) | 범위 | 병합 커밋 |
| --- | --- | --- |
| [#1](https://github.com/gw020328-oss/clear-education-v4/pull/1) | W02 검증·Mac 저장 경계·협업 CI | `dd7ec920fafbaf44ee9ac848f6fabb9ee5e7a467` |
| [#2](https://github.com/gw020328-oss/clear-education-v4/pull/2) | Mac 전용 YBM 접속 경로 | `dc08a37e8f37387daf1159a85a2dd6087e8f538f` |
| [#3](https://github.com/gw020328-oss/clear-education-v4/pull/3) | 신청·수취 지갑 결합과 실제 원천 형식 진단 | `d880fd65a99109c6802df364fdb40c44d60c0247` |
| [#4](https://github.com/gw020328-oss/clear-education-v4/pull/4) | 동일 client 새 증명 생성·독립 검증과 시작 실패 정리 | `366417e3fd7b0cc64ed905cd65a4880955313419` |
| [#6](https://github.com/gw020328-oss/clear-education-v4/pull/6) | 합성 정책 컴파일러·결정적 시드 자격 평가 | `7e713c49c04c3f17a257acd1978a47d763c6f6a5` |
| [#7](https://github.com/gw020328-oss/clear-education-v4/pull/7) | 지갑 인증·신청 조건 동의·SQLite 영속 상태 | `b1229e51b703f0eabfe230ac96460378fcc8381d` |
| [#8](https://github.com/gw020328-oss/clear-education-v4/pull/8) | 금고 설정·최종 계약 동의·예치 확인/복구 | `841052a6bfc6f306d6139e63e4110a890e046e0c` |

PR #8은 2026-10-12 13:54:01 KST에 병합됐다. develop 병합은 서비스 배포나 main 통합 완료를 뜻하지 않는다. 과거 보고서의 Draft·미병합·다음 단계 표기는 작성 당시 기록으로 보존하며 현재 상태는 위 PR과 아래 범위를 따른다.

## 완료·진행·미검증

| 영역 | 확인한 결과와 근거 | 남은 범위 |
| --- | --- | --- |
| 기존 Stage14/15·YBM·Amoy | [감사 기록](reference/AUDIT.ko.md)의 저장된 시제품·실제 YBM 1쌍·과거 로컬 포크 결과 | 현재 v4 제품 통합·배포·실제 지급의 근거가 아님 |
| W01·W02 A/B | [환경 준비](w01/REPORT.ko.md), [ProofAdapter 107개](w02/W02A_REPORT.ko.md), [원천 추출·격리 62개](w02/W02B_REPORT.ko.md) | 합성 시험 자체는 실제 계정 수집·지급 검증이 아님 |
| Mac 저장·복구 | [관리형 저장·합성 패키지](w02/MAC_STORAGE_REPORT.ko.md), [종료·복구 보정](w02/PR1_FIX_REPORT.ko.md) | 모든 기기 호환성·디스크 흔적 완전 삭제는 보장하지 않음. 기존 ZIP은 합성 전용 |
| W02 실제 원천/증명 | [형식 진단](w02/ybm-binding-verification.json) `3b62622`, [증명 보고서](w02/YBM_PROOF_REPORT.ko.md)와 [공개 기록](w02/ybm-proof-verification.json) `1a99de4`: 본인 접수·성적 claim 2건(1쌍) 새 생성·독립 검증·프로필 삭제 성공 | 메모리 진단 신청·테스트 지갑 범위. 실제 목록 완전성·최고점·제품 자격·지급 미확인 |
| 합성 정책·자격 평가 | [PR #6 보고서](current/POLICY_EVALUATOR.ko.md): canonical 정책 hash·기간 내 단일 최고점·800점 AND 정수 시드 80%·결측/충돌 보류 | SYNTHETIC/publishable=false. 실제 원천 목록 완전성·시드 API·제품 proof 연결 미완료 |
| 지갑 인증·영속 신청 | [PR #7 보고서](current/WALLET_APPLICATIONS.ko.md): SIWE 로그인·policyHash 고정 신청·별도 신청 조건 동의·SQLite 재시작/경쟁/멱등 복구 | 합성 EOA/provider 검증. 실제 확장 지갑 UI·원격 운영·암호화/백업/삭제 운영 미검증 |
| 금고·최종 동의·예치 | [PR #8 보고서](current/VAULT_ENROLLMENT.ko.md): 배포/설정 지문 검증·TermsAcceptanceV4·CONSENTED→FUNDING_PENDING→ENROLLED·예치 거래/이벤트/준비금 확인·중단 복구 | 새 메모리 EVM·무가치 TEST 토큰 검증. 실제 금액/날짜 승인·운영 배포·실자금 예치 미실행.ENROLLED는 확인 블록의 예치 기록이며 실시간 권리 추적은 후속 |
| 권한·지급·독립 청구 | PR #8 금고의 불변 발급 권한·신청/시험 중복 차단·고정 수취인 단회 지급/회수·T/T+3/T+10을 합성 서명으로 계약 단위 검증 | 제품 proof 세션·영속 proof nonce·반별 HMAC nullifier·발급 outbox·청구 패킷/클라이언트·실제 자격/지급 통합 미완료 |
| 타 사용자·제품화 | [Mac MVP 기준](current/MAC_MVP.ko.md), [기존 합성 ZIP 안내](current/MAC_TOOL_GUIDE.ko.md) | 타 사용자 자기 PC/계정 실제 수집 최소 1건·비개발자 2명 합성 사용성 시험·실제 기능 배포 미완료 |

실제 증명 성공 실행 코드는 [`1a99de4bfcb60bc486e420b12aab33550f927d2e`](https://github.com/gw020328-oss/clear-education-v4/commit/1a99de4bfcb60bc486e420b12aab33550f927d2e)다. 동일 Attestor client, 공식 claim 서명·identifier·owner·진단 신청/수취 지갑·params/context·신선도·두 원천 시험 연결을 독립 프로세스에서 검증한 기록이다. `listComplete`, `highestScoreAssessed`, `eligibilityAssessed`, `payment`는 false다. 원본 증명이나 개인정보를 다시 읽지 않고 공개 기록만 대조했다.

PR #7의 원자 nonce 소비는 로그인·신청 조건 동의 범위이고 PR #8은 최종 계약 동의·예치 범위를 추가했다. 이를 제품 proof의 영속 nonce 소비·시험 재지급 방지·권한 발급 완료로 확대하지 않는다. PR #8 최종 계약 payload/서명은 예치 복구 목적으로 저장하지만 로그인/신청 조건 서명·개인키·원본 proof는 저장하지 않는다. 과거 PR #7의 digest-only 설명과 범위를 구분한다.

공증자 claim 검증을 전체 TLS/ZK transcript 재검증·추가 TEE·실명 확인으로 설명하지 않는다. 추가 TEE는 [승인된 Mac MVP](current/MAC_MVP.ko.md)의 후속 보장이며 과거 TEE 시험 통과를 뜻하지 않는다.

## 저장된 시험 결과와 정확한 커밋의 CI

PR #4의 초기 400개·후속 407개, PR #6의 519개, PR #7의 577개, PR #8의 **655개(실패/skip 0개)**는 각 공개 보고서에 저장된 해당 단계의 로컬 실행 총계다. 서로 더하거나 이번 문서 검증의 재실행 결과·정확도·제품 완성률로 사용하지 않는다. PR #8 신규 금고/신청/지갑/HTTP/복구 검사는 78개다. 실제 claim 2건도 시험 총계에 더하지 않는다.

| CI 근거 | 정확한 대상 | 결과와 한계 |
| --- | --- | --- |
| [실제 성공 코드 PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38194206010), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38194203348) | `1a99de4bfcb60bc486e420b12aab33550f927d2e` | 성공. 실제 계정 결과는 별도의 공개 실행 기록 |
| [PR #4 최종 PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38195044654), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38195040083) | `0a08b4ef518abc1255da9ee1314a724fbaae2294` | 세 검사 성공. PR attempt 1 Mac 실패, attempt 2 최종 성공 |
| [PR #6 CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38197019369), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38196985221) | `e29d646a306d8aadab501caeb8310d4caa4323b0` | 완료·success |
| [PR #7 CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38203645907), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38203633788) | `f22d0221709bb62dd7216cd77eb221d94282fce6` | 완료·success |
| [PR #8 CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38205187296), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38205184092) | `c31ca8dc1bd5642f70669d948c9072378abaf3ee` | 완료·success |
| 확인 시점 main/develop tip | 위 `375051e`·`841052a` | 각 check-runs 0건·status 항목 0건·Actions 실행 0건. PR head 성공을 병합 커밋 CI 성공으로 옮겨 적지 않음 |

세 검사 이름은 Public content history, Public synthetic tests, Mac synthetic recovery다. [현재 workflow](../.github/workflows/public-synthetic.yml)는 develop/main 대상 PR과 `codex/**` push에서 실행하며 develop/main push 자체는 대상으로 하지 않는다. 따라서 병합 커밋 자체의 CI는 자동으로 실행되지 않는다. 문서 PR #5의 최종 head와 CI는 [PR 본문·Checks](https://github.com/gw020328-oss/clear-education-v4/pull/5)에서 확인한다. 모든 CI는 공개·합성 검사이며 실제 로그인·실자금 지급·운영 배포의 증거가 아니다.

## 다음 단계와 남은 결정

1. W08: 진단 proof와 제품 신청/최종 계약 문맥을 연결하고 제품 proof 세션·영속 nonce·검증 필드 전달을 구현한다. 실제 원천 목록 완전성과 인정 시험 선택을 합성 선언으로 대체하지 않는다.
2. W09/W10: 반별 HMAC 시험 nullifier·영속 권한/outbox·청구 패킷/클라이언트·체인 상태 재검증을 연결한다. 예치 후 DB 중단 복구와 지급·회수/기한/중복 경계를 통합 검증한다.
3. 실제 날짜·금액 승인, 운영 배포 지문·release 서명, issuer/outageSigner 키 관리, 실제 확장 지갑 UI와 DB 암호화·백업·마감 후 삭제 운영을 확정·검증한다. pending manifest는 usableForClaim=false를 유지한다.
4. 준비된 새 제품 문맥에서 새 동의·예치·YBM 증명·실제 자격·로컬 1회 지급·원본 삭제 후 독립 청구를 검증한다.
5. 타 사용자 자기 PC/계정 실제 수집 최소 1건과 비개발자 2명 합성 과업 시험을 별도 결과로 보고한다.

이 항목들은 후속이며 이번 문서 갱신에서 실제 로그인·새 증명·자금 이동·배포를 실행하지 않았다. main 통합은 전체 통합 검증 뒤 별도 develop→main PR로 진행한다. 실명 확인·실제 학원 API·원화 지급·공개 Amoy 지급·여러 교육기관 지원은 후속이다. [원래 PRD](reference/PRD.ko.md)와 [최신 Mac MVP](current/MAC_MVP.ko.md)를 함께 읽고 날짜별 계획을 완료 사실로 해석하지 않는다.
