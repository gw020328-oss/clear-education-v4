# 제품 정상 흐름과 이의·재검증 연결 계획

최신 실행 결과: 독립 제품 화면 연결·로컬 준비 검사는 완료했지만 공식 Attestor WebSocket의 HTTP403으로 로그인 창 준비 전에 중단됐다. 실제 신청/증빙/AI/지급은 미실행이다. [실행 인계](PRODUCT_WALLET_RUN.ko.md)를 따른다.

2026-10-29 제품 연결 후속: 양측 인증 확인 완료(운영자 스크린샷/참가자 사용자 보고). 독립 제품 패널에서 기존 normal-client의 신청·원천 승인·V2 수령 지갑 등록·동일 판정 동의·영수증을 연결한다. 실제 제품 호스트 활성화/증빙/지급 완료는 별도이며 인증 시험 성공으로 간주하지 않는다. 운영자 MetaMask를 AI 비용·외부 전송 승인자로 사용자가 지정했고 정확한 입력의 직접 승인 관문은 유지한다. web/PR60은 수정하지 않는다.

## 2026-10-29 Privy 연결 준비 후보

최신 develop `d44b01216241d120064145016a99d73b1b361e34` 기준 `codex/bootcamp-privy-sdk`/PR125에서 [Privy 연결 준비](EMBEDDED_WALLET_PRIVY.ko.md)를 진행한다. 사용자 확정은 **참가자=Privy Google 내장 EOA, 운영자=MetaMask 유지**다. 운영자 내장 지갑 준비는 과거 기록이며 완료 조건이 아니다. 이번 사용자가 지정한 MetaMask 주소를 명시 allowlist와 새 세션에 연결하고 과거 주소/권리/서명을 치환하지 않는다. 독립 /onboarding·/operator, 정확한 SIWE/HR/V2·서버 revoke 경계, 181/181 합성 시험과 SDK bundle이 준비됐다. 참가자 실제 Google/지갑 생성/읽기 RPC는 확인했고 재로그인 동일 주소는 사용자 보고다. 새 조합 실제 SIWE·HR/V2·100 TEST는 미검증이다. web/PR60·제품 CSP·DB/체인은 보존하고 공통 HTTP의 선택적 쿠키 namespace만 추가했다. 최신 프론트 인수와 의존성 audit 검토가 남아 Draft다.

정상 완주 다음에 별도 **수락·전액 배정·미청구 권리**로 CLEAR 프론트/백엔드/승인 서버/relayer 중단 직접 청구 및 다른 본인 시험 주소로 자산 이동을 검증한다. 신청 ID/chain/contract/ABI/필요 승인 데이터의 사전 독립 보관, 새 브라우저/세션 만료 후 접근·복구, CLEAR origin 의존성을 확인한다. 키 내보내기/복구가 필요하면 사용자가 비공개 UI에서 직접 수행하며 키/복구 문구/원본 개인정보를 수집하지 않는다. 독립 대납 또는 네이티브 시험 가스의 출처·소비를 확인하고 직접 청구와 무료 청구를 구분한다. CLEAR 중단과 Privy/Google/RPC/독립 페이지 호스팅 중단을 별도 보고하며 Geth/RPC는 유지한다. 수락 전 신청까지 독립 처리한다고 주장하지 않는다. 모두 미검증이며 정상 연결 PR에 광범위 복구 기능을 섞지 않고 후속 작은 시험/PR로 분리한다. R0~R2와 r20 V1은 별도 기록이다. 아래 날짜별 설명은 당시 상태다.

2026-10-28. 사용자 승인 범위는 프론트 지침 정리와 후속 개발 계획 반영이다. 이 문서는 새 실제 로그인·유료 호출·호스트 활성화나 후속 구현의 실행 지시가 아니다.

## 현재 기준

확인한 develop은 `a395c6daac5220c38f6cadbbc8a4affa892e0a6a`다. PR115 V2 등록, PR116 S3 내부 체인 연결/조회, PR117 S4 근거 조회와 PR120 제품 호스트 V2 등록 GET/POST·S3 조회 GET이 병합됐다. PR120 검증 HEAD `cd659370a6264b1fa8592c85f7585ae125ee9275`의 CI 8/8 성공 후 develop `a395c6daac5220c38f6cadbbc8a4affa892e0a6a`에 정상 병합됐고 병합 트리는 검증 HEAD와 같다. [최종 E5 B 74/74·API/store 774/774](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40679016882), [E5 46/46·E4 164/164](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40679016840), [PR 공개/합성/Mac](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40679016836), [push 공개/합성/Mac](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40679011653)을 확인했다. 정확한 경로·client·초 경계 보정과 이전 실패 이력은 [S5 호스트 인수 기록](BOOTCAMP_S5_HOST_MOUNT.ko.md) 및 [PR120](https://github.com/gw020328-oss/clear-education-v4/pull/120)을 따른다. 호스트 인수 문서의 Draft/병합 대기 표현은 당시 기록이다.

**내부 구현 / 제품 호스트 노출 / 실제 사용자 시험**을 각각 보고한다. PR120 병합은 이의 접수 쓰기·평가·실질 재검증 요청 연결 완료를 뜻하지 않는다. 기존 r20은 V1 실제 성공 기록이며 새 V2 제품 화면 완주의 근거로 재사용하지 않는다.

## 진행 순서와 소유 범위

| 단위 | 담당 | 의존성·완료 기준 |
| --- | --- | --- |
| S5-H 호스트 연결 | 기존 S5 세션 | 완료: PR120 최종 HEAD CI8/8·실질 리뷰 후 develop 병합, 검증/merge 트리 일치·노출 경로 인수. 새 이의 실행 기능은 포함하지 않음 |
| S5-F 화면 인수 | 서준형/Claude, 본부 인수 | 최신 프론트 브랜치/커밋·develop 반영·`web/` 절대 경로·공개 자산 변경/digest·검사 결과·미연결 항목 전달. 기존 PR60/로컬 변경 보존 |
| S5-E 정상 제품 완주 | 본부·프론트 | S5-H/F 인수 후 새 신청의 실제 네 조건 → 이번 입력 AI 승인 → 별도 V2 등록 서명 → 동일 판정 양측 직접 동의 → 정확100 TEST·canonical 영수증·중복 거부. INCLUDED/finalized=false 구분 |
| R0 사용자 요청 계약 | 통합 설계·프론트 협의 | 문서/화면 준비는 병행 가능. 이의/다시 확인 요청과 내부 평가 결과 기록을 분리하고 역할·상태·허용 메서드·평가 authority·필요한 원천/비용 승인을 확정 |
| R1 접수·평가 연결 | 후속 백엔드 단위 | 정상 완주 이후 착수. 검증된 사용자 요청만 제품 호스트/client에 연결하고 평가 공급 경로를 구현·검증. 내부 관리 API 전체 공개 금지 |
| R2 실질 재검증·정정·종료 | 후속 백엔드, 프론트 상태 연결 | R0/R1 이후. 새 근거/객관 오류의 검증된 평가 → 필요한 원천 재취득/AI 승인 → 판정 정정/미해결 → S3 체인 반영. 1회·원래 전체 상한·수락 권리 보호 검증 |

새 PR 단위에서 구현 범위·의존성·모델을 정한다. 일반 API 연결은 Sol/Medium, 자금·권한·증명·민감정보 수명·어려운 동시성 검토는 Astra/High를 검토한다. 이번 문서 변경의 권장 설정은 Sol/Medium이다. 이 계획의 순서 변경이나 새로운 실제 시험은 별도 확인된 준비 상태를 근거로 안내한다.

## 현재 코드로 확인한 이의·재검증 공백

| 내부 경로/포트 | 현재 의미 | 제품 연결에서 남은 일 |
| --- | --- | --- |
| POST `…/review-objections` | reason/evidenceId와 현재 판정 CAS에 결합된 접수. 응답 `chainStatus:NOT_OBSERVED` | 최소 사용자 요청 client/제품 호스트 경로·사유/접수 상태 계약 |
| POST `…/objection-assessments` | assessmentId/objectionId로 신뢰된 포트의 평가 결과 조회·기록 | 평가 주체·권한·불변 결과 참조·공급 경로 확정. 학생의 판정 값 직접 제출로 대체 불가 |
| POST `…/review-revalidations` | assessmentId로 검증된 NEW_EVIDENCE/OBJECTIVE_ERROR 평가를 기록 | 사용자 재검증 요청과 실제 원천 재수집·검사 실행을 별도로 연결. AI 재호출 버튼 API가 아님 |
| GET `…/review-chain` | 접수 이후 체인 반영/경합 상태 | PR120으로 이 GET만 제품 노출 완료. 쓰기 접수를 대신하지 않음 |

`…`는 `/bootcamp/v3/applications/:app`이다. 사유 코드는 현재 `SOURCE_MISMATCH`, `EVIDENCE_MISSING`, `DECISION_TARGET_ERROR`, `UNRESOLVED_QUESTION`이며 사용자 문구·새 요청 DTO는 R0에서 정한다. 구현 전 임의 endpoint를 프론트 계약으로 만들지 않는다.

`src/bootcamp/execution-development.mjs`의 `assessmentPorts`는 현재 `SYNTHETIC_TEST_SOURCE`에서만 주입할 수 있다. `tools/bootcamp/live-context.mjs`의 실제 normal-host에는 이의/재검증 평가 공급 연결이 없다. 따라서 내부 S3 합성 성공을 실제 평가 authority 연결 완료로 표시하지 않는다. 이 제한을 단순 제거하거나 운영자 브라우저 입력을 신뢰된 평가로 간주하지 않는다. 기존 회고 reflection-approval은 최초 해당 입력의 승인이지 재검증 입력에 대한 포괄 비용 승인이 아니다.

R0에서 요청·접수/대기·평가·재검증 진행·정정·미해결·체인 반영 상태와 원래 판정/근거 참조를 정의한다. 내부 평가 포트를 누가 어떤 검증 결과로 채우는지, 새 원천 취득과 nonce/세션 연결, 변경된 AI 입력의 외부 전송·호출 한도 승인, 같은 결과 재기록의 멱등성을 확인한다. 지급 전에 접수된 이의와 이미 전송된 ACCEPT의 경쟁은 원자적이지 않으며 먼저 수락된 권리를 회수하지 않는다.

## 후속 단위의 최소 검증

- 인증·역할·신청 소유자·과정 운영자·CSRF·CAS·멱등성, 타인 근거/오래된 판정 거부.
- 사용자 요청과 평가 결과의 신뢰 경계, 임의 assessmentId/결과 주입·중복/교차 신청 재사용 거부.
- 접수와 canonical 반영 대기/실패/reorg 구분, 기존 승인 무효화·정정 후 재게시/동의·미해결 지급 차단.
- 원천 재취득·실질 재검증 횟수와 원래 120초/1회/600초 상한 유지, 취소·만료·중복·경합 및 수락 권리 보호.
- 사용자 재검증 요청만으로 유료 AI가 재실행되지 않음. 새 입력 승인을 이전 실행/승인으로 대신하지 않음.
- 합성/실제 시험을 구분하고 원문·쿠키·토큰·키·실제 서명을 공개 기록에 남기지 않음.

## 지갑·시연·합성 모드

현재 목표는 참가자 Privy Google 내장 EOA·기존 주소 복원·명시적 수령인 확인, 운영자 MetaMask·같은 판정 직접 확인, 기존 서비스 거래 제출/가스 부담이다. PR125의 독립 연결 준비와 제품 실제 완료를 구분한다. 실제 SIWE/HR/V2·새100 TEST 및 중단 직접 청구/자산 이동은 미검증이다. AA/Paymaster 확장은 보류한다.

현재 시험은 서로 다른 참가자·운영자 주소와 분리된 브라우저 프로필을 사용한다. 우리 노트북 시연은 추천안이며 대회 장비 규정은 별도 확인한다. `web/src/demo/`는 명시적 합성 모드로 유지할 수 있으나 실제 장애/미활성화 때 자동 전환하지 않고 실제 서명/쓰기/지급과 격리한다. 합성 표시·성과를 구분하고 디자인 변경은 코드 리뷰 완료로 간주하지 않는다.

## 인계 갱신 조건

PR120의 검증 HEAD·CI8/8·merge SHA·제품 노출 메서드는 인수했다. 본부는 이 기준으로 [복사 지침](BOOTCAMP_FRONTEND_CLAUDE_PROMPT.ko.md), 이 계획 및 Issue106 상단을 함께 갱신한다. 화면과 API 인수 후에만 새 origin/chainId/RPC·사용자 행동을 안내한다. `PREPARED_NOT_ACTIVATED`는 준비 화면이며 성공/합성 자동 대체로 바꾸지 않는다. Issue106은 제품 실제 완주 전까지 OPEN이다.
