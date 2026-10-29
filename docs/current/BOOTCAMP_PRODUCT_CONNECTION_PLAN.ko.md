# 제품 정상 흐름과 후속 개발 계획

## 2026-10-29 현행 인계

**참가자 Privy 내장 EOA·운영자 MetaMask로 정상 100 TEST 수령을 먼저 완주한다.** 이번 문서 반영은 후속 기능 착수나 새 실제 로그인/유료 호출 승인이 아니다. 팀원 `web/`/PR60을 덮어쓰지 않고 최신 자산·커밋·검사 결과를 인수한다.

확인된 develop은 `d44b01216241d120064145016a99d73b1b361e34`이며 PR120/123은 병합됐다. PR125는 미병합 Draft다. 코드 검토 기준 `d8dd973dad8e9f56e9eb5a8045eb16e1f4271a56`에는 독립 제품 패널의 신청·원천 승인·V2 등록·동일 판정 동의·영수증 연결이 있다. 팀원 최신 `web/`에 이 SDK/패널을 인수하는 작업과 실제 완주는 별도다. 운영자 인증은 사용자 스크린샷, 참가자 인증은 사용자 완료 보고이며 새 제품 HR/V2 서명·100 TEST를 검증한 것은 아니다.

공식 Attestor의 WebSocket과 공개 `/address`가 HTTP403을 반환한다. 응답은 `awselb/2.0`/HTML이며 과거 성공 SDK/endpoint/연결 설정과 비교했지만 서비스 측 거부 정책은 미확정이다. 재로그인부터 요구하지 않는다. 기존 실패 실행과 인증 호스트는 보존한다. 해당 코드 HEAD의 CI9/9와 로그인 없는 회귀228/228은 성공했으나 실제 시험 준비 완료와 구분한다. Privy 의존성 audit31패키지(high17/moderate14) 및 Zod3·viem peer 잔여 위험도 유지한다. 최신 문서 후속 HEAD/CI는 [PR125](https://github.com/gw020328-oss/clear-education-v4/pull/125)에서 따로 확인한다.

사용자는 운영자 MetaMask를 AI 외부 전송/비용 승인자로 지정했다. 이 지정은 현재 회고 입력·모델·비용·기한을 확인한 1회 직접 승인과 별개다. 과거 서명·증명·AI 승인·소비된 run을 새 실행에 재사용하지 않는다. 자세한 실행 관문은 [실행 인계](PRODUCT_WALLET_RUN.ko.md), SDK 상태는 [Privy 연결](EMBEDDED_WALLET_PRIVY.ko.md)을 따른다.

### 지갑과 증빙의 세 주체

| 값 | 현재 코드 의미 | 화면·연결 규칙 |
| --- | --- | --- |
| `participantWallet` | 참가자가 증빙 관측 요청에 서명하는 지갑 | 신청·정책·nonce·만료·expectedClaimOwner에 결합된 원천 요청을 승인한다. |
| `expectedClaimOwner` | 수집기가 이번 증명에 만든 임시 EOA | 두 proof의 owner·signed request context·동일 HackerRank username을 검증한다. 학생 주소로 치환하지 않는다. |
| 수령인 | 신청과 별도 V2 등록으로 고정한 TEST 수령 주소 | 원천 요청 서명을 수령인 등록이나 지급 동의로 재사용하지 않는다. |

`src/hackerrank-evidence/request.mjs`, `collector.mjs`, `verifier.mjs` 및 `src/embedded-wallet/approvals.mjs`가 근거다. 학생 개인키를 서버에서 수집하지 않는다. pair proof의 수집/검증/제품 소비 코드는 존재한다. [PRODUCT_STORE](../bootcamp-store/PRODUCT_STORE.ko.md)는 PR80 초기 합성 저장 이력이며 현재 전체가 미구현이라는 뜻이 아니다. [r20 기록](BOOTCAMP_NORMAL_RUN_READINESS.ko.md)의 이전 V1 실제 성공과 이번 Privy/V2 미완주를 구분한다.

### 기존 판정 근거 GET 인계

`api.decisionEvidence(app,{decisionId:view.target.targetDecisionId})`는 기존 `GET /bootcamp/v3/applications/:app/decision-evidence/:decisionId`를 사용한다. decisionId 생략형 GET도 있다. 응답 manifest의 decision ID/revision/hash를 화면 판정과 대조한다. HackerRank checks의 `certificateName`, `issuerStatus`, 두 proof hash/issuedAt, `achievementAt`을 표시할 수 있으며 현재 achievementAt은 null이다.

계정 증명/인증서 증명/연결 검증을 구분하고 `verification`(sourceStatus/participantBinding/requestBinding/integrity/freshness), `reference`(RECORDED/UNAVAILABLE), `availability`(유효·만료·삭제·교체 등)를 함께 읽는다. 해시 존재만으로 연결 성공을 표시하지 않는다. 저장된 당시 검증 기록이며 `sourceCurrentness=UNKNOWN`, 원문 HTTP=false, 독립 재검증/실시간 원천 확인=false다. 표시 근거가 부족하면 확인 필요로 남기고 검증 요약 DTO를 별도 확정한다. [S4 계약](BOOTCAMP_S4_DECISION_EVIDENCE.ko.md)을 그대로 따른다.

### 재원·가스·현금화

V2는 지정 depositor의 `approve → fund(operationId, amount)`로 내부 balance를 갱신한다. 금고로 ERC20 `transfer`만 보내면 정상 예치 회계가 아니라 surplus로 구분되므로 직접 송금 충전 안내를 하지 않는다. CLEAR 운영자 SIWE 역할과 depositor 권한은 별개이며, 현재 normal-chain은 별도 시험 예치자로100 TEST를 준비한다. 정상 완주에는 이 재원을 사용한다. 충전 UI·권한 조회/DTO·operationId·영수증·확정 회계는 후속이다. 현 화면 문구는 “현재 화면에서는 재원 충전을 지원하지 않습니다”다.

금고→학생의 기존 제한된 지급 대납과 학생→외부 주소 송금, CLEAR 중단 후 직접 청구의 가스는 별개다. 현 SDK 어댑터는 임의 거래 전송을 제공하지 않는다. 후속에는 네이티브 시험 가스/독립 제출자, SDK·인증·RPC·호스팅 의존성을 검증하며 모든 송금 무료나 AA/paymaster 채택을 약속하지 않는다. 원화 현금화는 상용 미구현·미검증이며 SDK 선정만으로 국내 오프램프 지원을 확정하지 않는다.

### 승인된 후속 순서·완료 조건

| 순서 | 범위 | 완료 조건·미확정 |
| --- | --- | --- |
| 1. 정상 완주 | Attestor403·SDK 잔여 검토, 최신 프론트 인수, 참가자 Privy/운영자 MetaMask | 새 신청/원천·입력별 AI 승인·V2 등록·동일 판정 양측 동의·정확100 TEST canonical receipt/Transfer/잔액·중복 거부. INCLUDED/finalized=false를 최종 확정으로 표시하지 않음. |
| 2. 판단 근거 표시 | 기존 decision-evidence GET 인계는 정상 완주와 병행 가능 | 판정 대상과 verification/reference/availability 일치, 해시와 실제 검증 의미 구분. 새 원문 공개 없음. |
| 3. Moodle·회고 보완 | 정상 완주 후 제한 재조회와 회고 수정 후 새 증거/판정 | 대상 조건·횟수/주기·운영창·다음 확인 시간·권한 계약 확정. 기존 만료/동의/재검증 정책 유지. Reclaim/AI를 모든 재조회에 자동 실행하지 않음. |
| 4. 중단 대응 | 별도 수락·전액 배정·미청구 권리로 직접 청구/새 브라우저 복구/자산 이동 | 기존 권리·예약·중복 방지, 필요한 독립 데이터/가스/SDK·인증·RPC·호스팅 의존성과 실제 receipt 확인. 이미 지급한 신청의 재청구와 구분. |
| 5. 운영자 충전 | depositor 권한 및 approve/fund 계약 인수 후 UI | chain/instance/vault/token/decimals·operationId·거래 영수증과 내부 회계 확인. 운영자 세션 주소만 추가해 완료 처리하지 않음. |

현재 `normal-source-sequence`는 단회 수집이며 회고 준비/정확 승인 대기 후 이어간다. 화면 GET polling은 저장 상태 조회이고 Moodle 재수집이 아니다. 아직 “곧 다시 확인합니다”를 약속하지 않는다. 내부 이의/평가/review-revalidations POST는 현재 제품 호스트 허용 목록과 normal-client 사용자 요청에 없다. `review-revalidations`는 신뢰된 평가 결과 기록이며 학생의 재실행 요청 API가 아니다. 아래 R0/R1/R2는 후속 계약·구현 분리 기준으로 유지한다.

미해결 종료 후 재개/구제는 정책 공백이다. 기존 신청에 연결된 새 검토 사건/증거/판정, 재개 권한·기한·예약금·수락권리·중복 방지를 포함한 제안부터 한다. 사람 검토·임의 수동 지급·무조건 재신청·종료만으로 예약 해제는 확정 정책이 아니다. 원래 검토창/수락 권리 보호를 줄여 정상 완주의 장애를 없애지 않는다. 어느 후속 기능도 현재403 해결·정상 완주의 선행 조건으로 새로 끼워 넣지 않는다.

개발용 외부 지갑은 사용자의 명시 선택으로만 허용하며 SDK 장애의 자동 fallback은 아니다. 안내는 “이번 시험의 신청과 TEST 수령에는 이 주소가 사용되며 내장 계정과 별개입니다”로 한다. 내장 전환 시 기존 신청·수령인·서명을 자동 치환하지 않는다.

## 2026-10-28 이전 계획 이력

2026-10-28. 사용자 승인 범위는 프론트 지침 정리와 후속 개발 계획 반영이다. 이 문서는 새 실제 로그인·유료 호출·호스트 활성화나 후속 구현의 실행 지시가 아니다.

## 2026-10-28 병합·구현 이력

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

현재 목표는 참가자 Privy Google 내장 EOA·기존 주소 복원·명시적 수령인 확인, 운영자 MetaMask·같은 판정 직접 확인, 기존 서비스 거래 제출/가스 부담이다. PR125의 독립 연결 준비와 제품 실제 완료를 구분한다. 당시 준비 이후 인증 전용 SIWE 완료 보고를 받았으나 새 제품 HR/V2·100 TEST 및 중단 직접 청구/자산 이동은 미검증이다. AA/Paymaster 확장은 보류한다.

현재 시험은 서로 다른 참가자·운영자 주소와 분리된 브라우저 프로필을 사용한다. 우리 노트북 시연은 추천안이며 대회 장비 규정은 별도 확인한다. `web/src/demo/`는 명시적 합성 모드로 유지할 수 있으나 실제 장애/미활성화 때 자동 전환하지 않고 실제 서명/쓰기/지급과 격리한다. 합성 표시·성과를 구분하고 디자인 변경은 코드 리뷰 완료로 간주하지 않는다.

## 인계 갱신 조건

PR120의 검증 HEAD·CI8/8·merge SHA·제품 노출 메서드는 인수했다. 본부는 이 기준으로 [복사 지침](BOOTCAMP_FRONTEND_CLAUDE_PROMPT.ko.md), 이 계획 및 Issue106 상단을 함께 갱신한다. 화면과 API 인수 후에만 새 origin/chainId/RPC·사용자 행동을 안내한다. `PREPARED_NOT_ACTIVATED`는 준비 화면이며 성공/합성 자동 대체로 바꾸지 않는다. Issue106은 제품 실제 완주 전까지 OPEN이다.
