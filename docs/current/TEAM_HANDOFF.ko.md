# CLEAR 팀원·LLM 인계

2026-10-18 승인 TEST 운영 정본: [해커톤 TEST 운영/E0·계획 revision4](HACKATHON_TEST_OPERATIONS.ko.md), profile `clear-hackathon-test-operations.1`을 우선한다. P0/v1·R2/R3는 보존하며 120초·1회·600초,150+50 TEST·현재 MET ledger순, 미수락 원자 종료·수락권리 만료/회수 없음이 확정됐다. 기존 미완료 인수→격리 TEST 지급 연결을 단계별 실행하며, 과거 HOLD를 영구 개발 중지로 해석하지 않는다. production/main·자동 merge·상용 자금은 제외한다. 정책 확정과 실제 인수/활성화는 분리한다.

2026-10-17 추가 승인·계획 revision2: [MVP 보완 계약·실행 백로그](PYTHON_BOOTCAMP_R2.ko.md)를 우선한다. 기존 P0 동결03fa643과 네 조건/100 TEST·P1/P2는 유지한다. Oracle 승인·부족알림/영향 대기열·학생/운영자 두 화면·기존 relayer 가스 UX·실측 이벤트를 P3→P4→P5의 실제 구현 범위에 추가했다. 별도 v2 envelope/이행 인수이며 기존 v1 wire·ABI는 바꾸지 않는다. 현재 지급/production을 켜지 않으며 P4 권한·자금 코드는 Astra/High 경계 리뷰 후 격리 TEST로 진행한다. 아래의 종전 P3/P4/P5 계획만 정리한다는 문구는 이 추가 승인 이전 범위다.

2026-10-17 새 P0 정본: [CLEAR Python 부트캠프 정책·기록 계약](PYTHON_BOOTCAMP_P0.ko.md)을 따른다. 활동완료·과제제출·회고3항목·HackerRank Python(Basic) 보유형 인증의 AND, 고정100 TEST/decimals6/100000000 atoms다. 실제 Moodle ID는 소유 fixture 검증 전null/ready=false이며 증명시각을 합격시각으로 바꾸지 않는다. P1/P2 연결만 구현하고 P3/P4/P5는 관계·관문/인수부터 정리한다. 제품 API/DB는 별도 기존 세션 단일 소유, 이 통합 세션은 docs/동결계약·교차인수만 담당한다.

2026-10-16 후기 연결 계약 Draft: [Moodle 후기→C2/AI 공통 계약](MOODLE_REVIEW_C2_CONTRACT.ko.md)은 develop4756589와 미병합 PR71/72를 대조한 제안이다. registry·별도 사실 receipt/본문 지문·C2 revision/run 결합·원자 수락/원문 수명 후속을 정의한다. 제품 HTTP/DB 연결·LOCAL 수락·합성-only 제한 해제는 없으며 신규400/500 제외·grant/outbox HOLD·독립청구 NO_GO를 유지한다.

2026-10-15 최신 C3 Draft: 선행 PR63은 develop890ad93에 병합됐고, 이슈65의 별도 합성 증거 수락→M2 평가→불변 결과/보완·재시작 조회를 구현했다. [단일 HTTP 인계](MVP_SOURCE_HTTP_HANDOFF.ko.md)와 [C3 계약](MVP_EVIDENCE_HTTP_CONTRACT.ko.md)을 따른다. 기존 F0/운영 API와 다른 namespace이며 실제 자격·지급/원천·개인자료는 미완료다. web/PR60·독립 청구 파일은 각 담당 소유다.

2026-10-15 C2 최신: Draft PR63/코드0a9945b에서 합성 fixture 실bytes 접수·별도 문서 확인·검토run/보완·멱등/restart를 구현했다. [단일 인계 최신 C2절](MVP_SOURCE_HTTP_HANDOFF.ko.md)과 [상세 계약](MVP_DOCUMENT_HTTP_CONTRACT.ko.md)을 따른다. 운영 documentSubmissionReady=false·full decode/실동의/개인자료/재원 미완료, web/는 서준형 소유다. 아래 계약 단계/미구현 문구는 이전 기록이다.

2026-10-15 최신: PR61은 최종head95b397c의 필수CI 통과 후 develop0590fd0에 정상 병합했다. 추가 push Mac 검사는 종료 미확정으로6/6 성공을 주장하지 않는다. C2는 하위#62·[구현 계약](MVP_DOCUMENT_HTTP_CONTRACT.ko.md)을 정리한 단계이며 endpoint/파일접수는 미구현이다. [단일 인계](MVP_SOURCE_HTTP_HANDOFF.ko.md)를 시작점으로 삼는다. 아래 Draft 표기는 이전 기록이다.

2026-10-15 C1 학생 후속 Draft: [단일 HTTP·프론트 인계](MVP_SOURCE_HTTP_HANDOFF.ko.md)의 `clear-mvp-student-http.1`은 병합된 PR59/develop2bb6d29를 정상 merge해 학생 본인 신청·서버 합성 조건/정확 표시 확인·정책 변경 재확인·원자 멱등/GET복구를 추가한다. 실제 동의/게시·C2 파일/문서 검토·운영 Evidence/재원·화면은 미구현이다. F0/web은 서준형 소유로 유지한다. PR59 원문 API는 develop에 병합 완료됐고 PR61은 Draft로 유지한다. 아래 이전 Draft/C 전체 미구현 표기는 이전 단위의 기록이다.

2026-10-15 신규 Draft: [원문 HTTP·프론트 인계](MVP_SOURCE_HTTP_HANDOFF.ko.md)의 `clear-mvp-source-http.1`은 별도 loopback HTTPS에서 operator 원문 등록/조회·mock 초안·개발용 검토 기록을 연결한다. 기존 F0/web은 서준형 소유로 보존한다. 수강생 신청·동의·업로드/문서 검토 HTTP와 실제 화면 연결은 이 단위에 아직 없다. 아래 이전 미연결/예약 문구는 해당 경로 또는 이전 시점의 기록이며 새 구현 subset과 구분한다.

2026-10-15 통합 검토: [제품 API·저장 계약](PRODUCT_WORKFLOW_CONTRACT.ko.md)의 M3-0 합성 모듈은 PR #58로 develop `5f902dc`에 병합됐다. Moodle1502 실측 인계 PR #56은 `edb3efc`로 병합됐다. AI 소비자 PR #57은 이 기준을 이력 반영했으며 최신 병합 여부·CI는 해당 PR을 따른다. 기존 v4 API/DB·프론트 view는 유지하고 새 /mvp HTTP·실제 정책/동의·업로드/decode·운영 Evidence·M2 판정 저장·재원/화면 연결은 후속이다. 통합 검증 근거는 [현황](../status.md)의 최신 절을 우선한다.

2026-10-15 최종 소비자 통합: M1/M2 #43/#46, AI 준비/소비자 #42/#47, Moodle 준비/일별/export/로컬 #41/#45/#48/#52, Mac 보정 #53은 develop에 병합됐다. 이 변경 #51은 충돌 필드 보류·정확한 계획/표시 기준의 정책 해시 결합·평가 원장과 실제 소규모 재평가를 추가한다. [최신 통합 현황](../status.md)과 [결합 경계](../ai-vision/POLICY_BINDING.ko.md)를 따른다. 합성 소비자 적합성은 확인했으나 운영 동의·Evidence 수락/DB·실제 기관 연결은 완료되지 않았다. clearapi1502 실제 재검증·AI 정상 자료 과잉 보류와 기존 정책/자격/지급 차단을 유지한다. 아래 날짜별 계획은 당시 범위다.

2026-10-15 M2: [경로·증거·금액 후보 평가](MVP_EVALUATOR.ko.md)의 `clear-mvp-evaluation.1`은 M1 계약을 소비하는 별도 순수 합성 모듈이다. 증거 상태·OR·명시 선택·최초 제출·정정/최종성과 금액 후보를 분리하며 실제 자격/지급은 false다. HTTP/DB/금고와 기존 차단 조건을 유지한다.

2026-10-15 M1: [공통 정책·증거 계약](MVP_POLICY_CONTRACT.ko.md)의 `clear-mvp.1`은 별도 버전 합성 컴파일/소비자 준비 계약이다. YBM형·시원스쿨형·제3 합성 프로필을 같은 제한된 엔진에서 설정으로 실행한다. 기존 M0·HTTP/DB/금고를 보존한다. M1/M2 승인으로 이번 범위 구현을 진행하되 아래 과거 미착수 문구는 당시 기록이다. 공식 조건·예치 정책 OPEN, Moodle/원천 BLOCKED·grant/outbox HOLD·독립 청구 NO-GO·Mac 원인 미확정은 유지한다.

2026-10-15 최신 후속 [TEST 재원 실험](TEST_FUNDING_LAB.ko.md): 기존 v4 경로를 보존하고 spikes/funding-lab의 새 인메모리 체인만 사용한다. 합성 fixture 자격과 실제 원천 검증을 분리한다. 테스트/시연 명령은 test:funding-lab / demo:funding-lab이며 사용자 DB·체인·키를 가져오지 않는다. 기존 grant/outbox 보류·독립 청구 NO-GO·Moodle/원천 차단·400% 금지·Mac 원인 미확정을 유지한다.

2026-10-14 H2 후속: [격리 등록 접수](HISTORY_INTAKE.ko.md)는 H1의 두 목적을 별도 영속 ledger/독립 검증/관리형 수집기에 연결한다. 기존 H1 SYNTHETIC 및 HTTP/DB 계약은 보존한다. 로컬 모듈 연결과 실제 웹/기관 등록·자격 완료를 구분하며 미확인 전체성/신원/공식 기간은 UNKNOWN이다.

2026-10-14 후기/블로그 문서 후속: [사전검토 명세](REVIEW_PRECHECK.ko.md)에 확인된 공식 조건, 미결 해석, 코드/텍스트/Vision/원천 역할, 후속 DTO와 수용 기준을 모았다. 가이드 본문은 확보했지만 정책 적용/게시 검증은 미확인이다. AI/Vision 주 시연은 합성 블로그 자료, 400%는 구조화/사전검토만이다. 이번 후속은 코드/schema 변경 없이 PRD·계획·인계만 갱신하며 기존 H1·Moodle·지급 차단을 보존한다.

2026-10-14 M0 추가: [합성 계약](M0_CONTRACT.ko.md)·[결정/미결 질문](M0_DECISIONS.ko.md)·[프런트 시작 문서](FRONTEND_M0_HANDOFF.ko.md)를 우선한다. 첫 mock의 필드·예제는 FIXED_FOR_M0_FIXTURES이며 소비자 합의는 PENDING이다. 아래 넓은 설계의 wire/ABI·실제 조건은 여전히 미동결이다. 제품 기능과 M1 이후 구현은 포함하지 않으며 실제 Moodle·원천 검증 차단, grant/outbox 보류, 독립 청구 NO-GO를 유지한다.

2026-10-14 인계 우선순위: [새 정본 PRD](MVP_PRD_20261014.ko.md) → [구현 차이/근거](MVP_GAP_20261014.ko.md) → [인터페이스 초안](MVP_INTERFACES_20261014.ko.md) → [단계별 계획·소유경로](MVP_PLAN_20261014.ko.md). 현재 구현 기준은 develop `6d941a1`(PR #21·#29 포함)이다. 아래 800점 AND 80%/최고점·선예치 보존 요구는 기존 코드/검증의 사실이며 새 MVP 변경 설계를 금지하지 않는다. 이번 문서는 기능 착수 지시가 아니다. 실제 Moodle 제품 연동·원천 검증 차단, grant/outbox 보류, 독립 청구 제품 NO-GO를 유지한다. 아래 역할/다음 작업/입구 프롬프트는 과거 계획이며 새 승인 단위에 맞춰 사용한다.

공통 세션 흐름(2026-10-13): [이슈 #28](https://github.com/gw020328-oss/clear-education-v4/issues/28), [클라이언트 흐름 계약](PROOF_FLOW.ko.md). PR #27 병합 `77d1c4b` 위에서 생성·검토·지갑 승인·세션/결과 조회·취소와 응답 유실 복구를 구독 가능한 상태로 연결했다. F0 화면은 별도이며 HTTP/DB/정책/금고/Moodle 계약을 변경하지 않는다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류·독립 청구 제품 전환 NO-GO를 유지한다.

공통 증명 세션 승인(2026-10-13): [이슈 #26](https://github.com/gw020328-oss/clear-education-v4/issues/26), [지갑 승인 도구](PROOF_WALLET.ko.md). PR #25 병합 `51ee66b` 위에서 기존 B1 서명/HTTP 계약을 재사용하는 `authorizeProofSession`을 추가했다. 검토한 문맥·독립 owner 공개키·중단/만료·응답 유실을 검사한다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류는 유지하며 HTTP/DB/정책/금고/화면은 변경하지 않는다.

학습 provider 후속(2026-10-13): [이슈 #24](https://github.com/gw020328-oss/clear-education-v4/issues/24), [Moodle 연결 명세](LEARNING_PROVIDER.ko.md). PR #23 병합 `7ee183d` 위에서 기존 B3를 재사용하는 합성 시드 provider를 추가했다. 기관·강좌·계정·필수 활동 매핑 및 완료/수정 시각의 의미를 고정하며 실제 Moodle 취득은 구현하지 않는다. 800점 AND 80%·최고점과 기존 HTTP/DB/UI는 유지한다. 원천 검증 차단·grant/outbox 보류 및 별도 독립 청구/Windows 검증 범위를 변경하지 않는다.

공통 오류 복구(2026-10-13): PR #20 병합 `4a0cdc6` 위에서 [이슈 #22](https://github.com/gw020328-oss/clear-education-v4/issues/22), [전송·복구 계약](API_RECOVERY.ko.md)을 추가했다. 기존 import/HTTP message를 유지하며 안전한 상세 코드·중단/시간 초과·쓰기 결과 확인 안내를 전달한다. 프론트 담당자는 공통 전송기의 새 필드를 확인한다. 서버/DB/화면·지급 기능을 추가하지 않으며 실제 원천 차단과 grant/outbox 보류를 유지한다.

2026-10-13 범위 변경: [최신 계획](TEAM_PLAN.ko.md)에 따라 공통 개발을 계속하되 CLEAR 추가 지급 서명의 grant/outbox와 종속 UI/API 확대는 새 구조 검증 전까지 보류한다. 현 금고·HMAC 구조를 최종안으로 고정하거나 PRD의 800점 AND 80%/최고점 정책을 변경하지 않는다. PR #19는 develop에 병합 완료(`3f8ef79`)이며 보존한다. 별도 증거 기반 청구·Windows 검증 worktree는 이 작업에서 수정하지 않는다.

B3의 현재 단위: [이슈 #13](https://github.com/gw020328-oss/clear-education-v4/issues/13), [학습 입력 계약·합성 adapter](LEARNING_EVIDENCE.ko.md). 필수 강의·기간·페이지/버전/출처 pin·정정/실패/중단을 검증하고 기존 평가기에 연결한다. 실제 제공자/API·인증·계정 매핑은 미확인으로 BLOCKED이며 제품 DB/HTTP/UI는 추가하지 않는다. 기존 실제 YBM 전체성 차단도 유지한다.

B2b 추가(2026-10-13): [이슈 #18](https://github.com/gw020328-oss/clear-education-v4/issues/18), [제품 수집·독립 검증·단회 수락 계약](PRODUCT_PROOF.ko.md). B2a는 PR #17로 병합됐다. 합성 driver의 제품 owner 연결, 서버 고정 합성 원천 서명/owner 서명의 별도 프로세스 검증, schema 4의 세션별 결과 단회 수락과 내부 snapshot 조회를 구현했다. 실제 YBM 원천 전체성·실수집·자격/지급은 계속 차단한다. proofSourceSigner는 서버/DB 환경에 고정하며 null인 기존 설정을 자동 활성화하지 않는다. 서준형의 F4는 새 evidence/result API와 과거 수락 영수증의 의미를 확인한다. B2b 병합 여부는 연결 PR을 따른다.

B2a 추가(2026-10-13): [이슈 #12](https://github.com/gw020328-oss/clear-education-v4/issues/12), [전체 시험 목록·최고점 증거 계약](EXAM_EVIDENCE.ko.md). B1은 PR #16으로 develop에 병합됐다. 새 원천 inventory의 범위·페이지 지문·건수·종료·상태 대조와 최고점의 합성 검증을 구현했다. 실제 YBM inventory/계정·기간 포괄성은 미확인으로 실평가를 차단한다. B1 DB/HTTP나 기존 실수집기는 변경하지 않으며, B2b는 신뢰한 manifest pin의 실제 출처와 검증 결과 단회 수락을 먼저 해결해야 한다. B2a 병합 여부는 연결 PR을 확인한다.

B1 추가(2026-10-12): [이슈 #15](https://github.com/gw020328-oss/clear-education-v4/issues/15), [제품 세션·영속 nonce 계약](PROOF_SESSIONS.ko.md). 생성/조회/지갑 승인/취소와 현재 예치 재검증을 구현했다. AUTHORIZED는 지갑 결합 승인이고 실제 증명 수락은 B2b, 시험 중복/outbox는 B4다. SQLite schema 3으로 v1/v2를 이관한다. 서준형의 F4는 이 계약과 공통 오류 복구 계약과 이번에 추가한 [proof 승인 helper](PROOF_WALLET.ko.md)를 확인한다. 병합 여부는 연결 PR을 따른다.


이 문서는 새 팀원과 그 LLM이 같은 기준으로 개발을 시작하기 위한 입구다. **제품 코드 기준은 PR #8 병합 `841052a`, 문서 포함 기준은 PR #5 병합 `9397e62` (2026-10-12)**다. 이후 작업을 시작할 때는 원격 `develop`과 관련 PR을 다시 확인한다. 이 인계 문서 자체는 기능 구현이나 배포 승인이 아니다.

C1 후속: [로컬 합성 HTTPS 실행 환경](LOCAL_SYNTHETIC.ko.md)이 추가됐다. 아래 제품 기능 표는 기존 기준이고, 실행 구성은 C1 안내를 따른다. F0 참가자 화면은 별도 작업이다.

## 읽는 순서

1. [AGENTS.md](../../AGENTS.md): 작업·자료 취급·Git 규칙. 날짜가 붙은 과거 기록은 최신 승인과 구분한다.
2. 이 문서 → [역할·PR 계획](TEAM_PLAN.ko.md) → [현재 API 계약](API_CONTRACT.ko.md).
3. [Mac MVP](MAC_MVP.ko.md), [개발 환경](../development.md), [협업 절차](../../CONTRIBUTING.md).
4. 맡은 기능의 소스·시험과 상세 문서. 원래 설계는 [reference](../reference/DESIGN.ko.md), 구현 사실은 현재 소스와 검증 기록을 확인한다.

[첫 프롬프트](TEAM_START_PROMPT.ko.md)를 새 대화에 붙여 넣으면 첫 작업 F0을 시작할 수 있다. 이 문서 PR을 `develop`에 병합한 뒤 사용하는 순서다.

## 무엇을 만드는가

CLEAR는 지갑으로 신청·동의하고, 교육 이수와 TOEIC 조건을 검증해 미리 예치된 환급금을 청구하도록 만드는 서비스다. 민감한 학습·성적 원문을 공개하지 않으면서 신청·수취 지갑·정책·시험·지급 권한을 연결해야 한다. 현재 첫 대상은 Apple Silicon Mac + Chrome과 무가치 TEST 토큰이다.

정책 평가기는 정해진 기간의 전체 시험 목록에서 최고점을 선택하고 **TOEIC 800점 이상 AND 시드 이수율 80% 이상**을 평가한다. 목록 불완전·자료 충돌은 보류한다. 자세한 기간·동점·반올림 규칙은 [정책 평가기](POLICY_EVALUATOR.ko.md)를 따른다. 이 로직이 구현됐다는 사실만으로 실제 사용자 자격을 판정할 수 있는 것은 아니다.

## 현재 가능한 것과 아직 없는 것

| 영역 | 확인된 구현 | 남은 연결 |
| --- | --- | --- |
| Mac 수집 경계 | 관리형 프로필·worker·종료/재시작 정리, 합성 배포 ZIP | 제품 화면에서 안전하게 호출·배포·운영 |
| YBM | 본인 계정에서 새 증명 2건 생성, 별도 프로세스의 공식 서명·원천·진단 신청/지갑 결합 검증 | 제품 DB 신청/영속 nonce 연결, 전체 시험 목록 완전성·최고점 검증 |
| 정책 PR #6 | SYNTHETIC 정책 컴파일·해시·결정적 평가 | 실제 시드 API·검증된 실제 입력 |
| 인증·신청 PR #7 | 지갑 인증, 신청 조건 동의, SQLite 영속 상태 | 실행 가능한 웹 UI·개발 서버 구성 |
| 금고 PR #8 | 배포 설정 검증, 최종 계약 동의, 예치 준비·확인·재시도 | 현재 체인 상태 재동기화, 제품 증명/권한 발급 연결 |
| B1 제품 증명 세션 | DB 영속 세션·지갑 결합 nonce 단회 소비, 현재 예치/제출 기간 재검증 | 실제 수집·검증 결과 수락, 시험 중복/outbox, F4 화면 |
| 청구 | 금고 계약의 권한·청구·회수 합성 시험 | 제품 outbox, 청구 패킷·배포 manifest·독립 복구 클라이언트 |

현재 정책은 `SYNTHETIC`, `publishable=false`; 제품 응답은 `paymentAllowed=false`다. 실제 YBM 진단 성공은 제품 자격·지급 성공이 아니다. 실제 전체 목록·최고점·자격·지급은 아직 확인되지 않았다. 실제 YBM 실행 근거와 단계별 시험 수는 [개발 현황](../status.md)과 [공개 검증 기록](../w02/ybm-proof-verification.json)에 있다. PR #8의 655개 통과는 당시 기록이며 새 checkout의 실행 결과로 보고하지 않는다.

## 어디를 수정하는가

| 경로 | 역할 / 권장 담당 |
| --- | --- |
| `src/application/`, `tests/application/` | 인증·신청·HTTP·DB·최종 동의·예치 / 백엔드 |
| `src/policy/`, `src/eligibility/`, `tests/policy/` | 정책 정규화·컴파일·평가 / 백엔드 |
| `src/vault/`, `contracts/`, `tests/vault/` | 배포 검증·서명 인코딩·금고 / 백엔드 |
| `src/mac-collector/`, `src/ybm-collector/` | 민감 수집·프로세스 경계 / 백엔드 |
| `src/application/wallet-client.mjs`, `src/application/api-client.mjs` | EIP-1193 지갑·동일 origin API/복구 도구 / 공통 인터페이스, 변경 전 양쪽 영향 확인 |
| `web/` (신설 제안) | 참가자·운영자 화면과 브라우저 시험 / 프론트엔드 |
| `spikes/`, `docs/w01/`, `docs/w02/` | 실험·검증 이력. 제품 구현과 구분 |
| `legacy/`, `docs/reference/` | 보존 대상. 새 기능 때문에 변경하거나 지문을 갱신하지 않음 |

`createApplicationServer()`는 서버 팩터리이며 C1의 `dev:init`/`dev:start`가 독립 환경 초기화와 실행을 제공한다. 루트 `npm start`나 완성된 참가자 화면은 없다. 웹 프레임워크·번들러는 F0에서 작은 범위로 선택하고 선택 이유를 기록한다. C1은 `web/dist` 빌드를 같은 HTTPS origin에서 제공한다. Node/DB/수집 모듈을 브라우저 번들에 포함하지 않는다.

## 새 작업 환경

전체 Git 이력을 복제하고 최신 `origin/develop`에서 `codex/<작업명>`을 만든다. 개인별 checkout·DB·테스트 지갑·체인 instance를 분리한다. 타인의 개발 DB·기존 테스트 체인을 복사하거나 초기화하지 않는다. Write 권한이 없다면 저장소 초대 수락/접근 상태를 확인하고, LLM이 권한을 임의 변경하지 않는다.

Node **24.21.0**, npm **11.19.0**을 준비한다. 저장소의 `./tools/node`, `./tools/npm`을 사용한다. 로컬 전용 `.toolchain` 또는 정확한 버전의 PATH 환경을 사용하고 시스템 전역 버전을 바꾸지 않는다. 실제 설치·OS 제약은 [개발 가이드](../development.md)를 따른다.

```sh
./tools/node --version
./tools/npm --version
./tools/npm ci --ignore-scripts
./tools/npm run verify:workspace
./tools/npm run test:policy
./tools/npm run test:applications
./tools/npm run test:vault
./tools/npm run test:proof-sessions
```

수집·전체 합성 시험에는 별도 의존성 설치가 필요하다. 명령은 개발 가이드와 [CI](../../.github/workflows/public-synthetic.yml)를 확인한다. `verify:workspace:local`은 별도 로컬 준비·권한 검사다. Linux에서 Mac 시험이 생략된 것을 Mac 검증 통과로 쓰지 않는다. 프론트 실행 명령은 F0에서 추가하고 문서에 기록한다.

## 두 LLM이 반드시 유지할 경계

- 로그인, 신청 조건 동의, 최종 계약 동의는 서로 다른 서명이다. 계정·체인이 바뀌면 진행 중 결과를 버리고 다시 연결한다. 최종 동의 전 실제 금고 설정을 사용자에게 보여준다.
- `ENROLLED`는 특정 블록에서 확인한 예치 기록이다. 현재 잔액·미사용 권리·지급 가능 상태로 해석하지 않는다. 이후 proof/발급에는 현재 체인 재검증이 필요하다.
- 원문 proof·성적·쿠키·비밀번호·개인키·프로필을 Git/Issue/PR/fixture/로그에 넣지 않는다. `private/`, `data/`, `var/`, `.toolchain/`은 공유하지 않는다. 합성 데이터만 공개한다.
- 최신 Mac 관리형 저장 승인은 과거 필수 tmpfs/추가 TEE 방침을 이 경로에서 대체한다. 정상/오류 종료 즉시 정리, 실행 중 최대 24시간, 강제 종료 후 다음 실행 전 정리 예외를 따른다. 무디스크·완전 삭제·추가 TEE 검증 완료를 주장하지 않는다.
- 최종 계약 payload·서명은 예치 복구를 위해 DB에 보존하는 의도된 예외다. 로그인/신청 조건 서명·개인키·원문 proof까지 보관 범위를 넓히지 않는다.
- pending manifest로 청구를 허용하지 않는다. `SYNTHETIC` 제한이나 지급 차단을 프론트 편의로 해제하지 않는다.
- 실제 로그인·증명·공개 체인 거래·유료 호출·배포는 합성 개발의 자동 후속이 아니다. 해당 작업의 사용자 지시와 준비 조건을 확인한다.

## 작업을 마칠 때

담당 범위, 변경 API/상태, 실행한 검사와 미실행 검사, 의존 PR, 알려진 제약을 PR에 남긴다. 상태·계약이 바뀌면 관련 인계 문서도 같은 PR에서 고친다. 날짜가 있는 과거 검증 기록은 덮어쓰지 않는다. 다음 LLM은 대화 기억 대신 최신 코드·문서·PR에서 이어간다.


2026-10-17 후속: [후기 bridge v1 고정 계약·소비/인수](REVIEW_BRIDGE_V1.ko.md), 고정 commit31879659e11d9cbfa0aa88e48d825047080f4e39를 기준으로 기존 Moodle/AI 세션에 전용 어댑터 구현을 각각 Sol/Medium으로 전달했다. 공통 제한 HTML/registry/메모리 lease adapter는 통합 소유이며 현재 제품 수락·HTTP/DB 연결/운영 권한은 열지 않는다. 양쪽 구현/실제와 합성 검증·남은 관문은 PR71/72/74의 exact head 기록을 따른다. develop/main 미병합 유지.
