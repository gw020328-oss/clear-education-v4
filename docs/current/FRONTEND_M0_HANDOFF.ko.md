# Claude Code 프런트엔드 M0 시작 문서

이 문서 하나를 새 작업의 시작점으로 사용한다. 저장소는 [clear-education-v4](https://github.com/gw020328-oss/clear-education-v4), 통합 PR은 [#30](https://github.com/gw020328-oss/clear-education-v4/pull/30), 대상은 `develop`이다. 제품 기준 commit은 `6d941a1fe0669b89730da1472d23ecd7caab22f4`, 초기 MVP 문서 기준은 `7bf622901919199ff6aaf00aaf077ef64a704a79`이다. M0의 정확한 최종 HEAD/병합 커밋은 PR의 검증 기록과 Git 이력을 확인해 작업 메모에 고정한다. 브랜치 이름만 보고 최신 규격이라고 가정하지 않는다.

**첫 작업은 기존 웹과 새 MVP의 차이 분석·상태표·mock 설계다.** 이 PR은 M1 이후 기능 구현, 새 DB/체인, 실제 AI/Vision/Moodle/API 연결을 승인하지 않는다. M0 mock 계약은 FIXED_FOR_M0_FIXTURES이고 **소비자 합의는 아직 PENDING**이다. 실제 Moodle 연동·원천 검증 차단, grant/outbox 보류, 독립 청구 제품 전환 NO-GO를 유지한다.

## 읽는 순서와 사실 확인

1. [AGENTS](../../AGENTS.md), [협업 절차](../../CONTRIBUTING.md), [팀 인계](TEAM_HANDOFF.ko.md), [담당 계획](TEAM_PLAN.ko.md), [현재 API](API_CONTRACT.ko.md)를 읽는다. 날짜별 과거 상태를 현재 구현과 구분한다.
2. [새 PRD](MVP_PRD_20261014.ko.md)와 [현재 구현 차이](MVP_GAP_20261014.ko.md)를 대조한다. 목표 750+·OR·후입금과 현재 800 AND 80%·선예치 경로는 다르다.
3. [M0 결정/질문](M0_DECISIONS.ko.md) → [M0 계약](M0_CONTRACT.ko.md) → [schema](../../specs/m0/schema.mjs)·[fixture](../../specs/m0/fixtures.json) → [단계별 계획](MVP_PLAN_20261014.ko.md) 순서로 읽는다.
4. [과거 성적 요구사항 보강](EXAM_HISTORY_REQUIREMENTS.ko.md)을 읽는다. 시원스쿨 전체 성적·계정/이름 화면과 수강 신청일 기준 안내는 확인됐지만 정확한 경계와 원천 검증은 미결이다. 50%·100% 출석 경로에 과거 이력을 추가하지 않는다. 기존 Vision 예제는 공식 전체 제출 요건의 충족 예제가 아니다.
5. `./tools/node specs/m0/check.mjs`로 받은 예제의 일관성을 확인한다. 실패를 무시하거나 예제의 차단값을 true로 바꾸지 않는다.

이 M0 작성 시 기준 저장소에는 `web/`가 없다. 팀원의 별도 브랜치에 화면이 있으면 그 브랜치와 기준 commit을 먼저 기록하고 차이만 분석한다. 다른 checkout을 읽거나 수정하는 권한을 이 문서에서 추정하지 않는다. 이슈 #11 F0 범위를 확인하고 M0 계획과 충돌을 기록한다. 새 프레임워크·공통 schema·패키지 선택을 몰래 확정하지 않는다.

## 첫 산출물

| 산출물 | 포함할 내용 | 이번 단계 완료의 의미 |
| --- | --- | --- |
| 화면 차이표 | 기존 화면/없음, 현재 API 의존성, 새 상태/문구/입력, 선행 M1/M2/M3/C1/C2 | 기존 ENROLLED를 새 등록 성공으로 재해석하지 않음 |
| 역할별 상태표 | 운영자 초안/질문/검토, 학생 동의/증거/보완, sponsor 재원, 고정 수령인 청구, 불확실한 작업 조회 | 화면 버튼과 실제 권한 검증은 별개라고 명시 |
| mock 설계 | 아래 fixture·명령·응답 대응, 로딩/실패/복구/기한/새로고침 | HTTP 호출·지갑 서명·유료 모델 없이 검토 가능한 화면 설계 |
| 소비자 질문 | 필드/단위/revision/역할·기존 컴포넌트 차이, 수정 제안과 영향 | 합의한 척하지 않고 Q-CONSUMER에 남김; 공통 담당 PR로 조정 |

프런트 코드가 승인되면 새 화면은 `web/`와 전용 브라우저 시험을 소유하는 제안이다. 실제 구현 착수 승인 없이 UI 파일이나 의존성을 추가할 필요는 없다. 이 인계에서 만들어야 하는 것은 읽은 결과와 mock 설계이며 완성 서비스 화면이 아니다.

## mock 데이터와 상태 표시

| 흐름 | fixture ID / 표시·허용 행동 |
| --- | --- |
| 정책 질문 | official-questions, siwon-questions. 질문/근거/미지원 표시. 미해결인 실제 조건은 게시 불가 |
| 합성 주 경로 | draft-created → draft-reviewed → approved-mock, application-draft → application. 합성 정책/동의라고 표시 |
| 자격과 재원 분리 | eligible-final + funding-unfunded/partial. ‘합성 조건 충족·재원 부족’, 청구 버튼 비활성 |
| 전액 예약 | funding-funded → funding-allocated + claim-claimable. 버튼 이름은 ‘합성 청구 시뮬레이션’; 실제 지급 가능이라고 쓰지 않음 |
| 원천 미검증 | eligibility-held + funding-funded + claim-not-claimable. 자금이 있어도 보류 |
| 문서 보완 | document-revision-2 + vision-cut. 누락 field에 보완 안내, 판독되지 않은 값을 채워 넣지 않음 |
| 판독과 진위 | vision-readable-held. 읽힌 필드/근거 영역을 보여줄 수 있으나 진위·전체 이력·주체 미확인 표시 |
| 늦은 결과/취소 | vision-late/vision-cancelled. current=false이며 현재 제출을 덮지 않음 |
| 응답 유실 | claim-pending → claim-unknown, reply-getoperation. 조회부터, 자동 새 키·재전송 없음 |
| 기한·취소 | application-cancelled, funding-reclaimed, claim-expired. 사유와 기한 표시, 재청구 자동 활성화 없음 |

fixtures의 `exchanges`는 명령 request와 MockReply의 정상/실패 예제를 연결한다. `viewIds`는 fixture 조회용 참조이며 서버 DTO가 아니다. 각 예제는 독립 snapshot으로 제공되므로 배열 전체를 실행 순서로 삼지 않는다. 위 화살표는 의도한 화면 전이이며 상태 실행기가 이미 구현되었다는 뜻이 아니다.

시원스쿨 문서 예제의 `app-siwon-precheck`는 **미게시 초안의 사전검토를 그리는 별도 가상 문맥**이다. 게시된 Application이나 실동의가 존재하지 않는다. 가상 policyHash는 초안 격리용 표식이며 실제 승인 hash로 쓰지 않는다. 실제 신청에 연결할 계약은 M1/M3 검토가 필요하다.

## M0.2 시원스쿨 화면 범위

최신 승인 목표는 **750점반 50~300% 조건·계산 지원**, **400% 조건 구조화·서류 사전검토만**이다. 100% 전용 제한 안내는 이 범위로 대체한다. 실제 정책 미확정·제품 미구현을 항상 표시한다. 500%/전강좌반/토스·오픽으로 확장하지 않는다. YBM 주 시연과 기존 과거 이력 Vision 예제를 유지한다.

[benefits.json](../../specs/m0/benefits.json)의 cases는 `EvaluateMock`/`GetApplication`의 후속 화면 모델 설계에 참고하는 스냅샷이며 새 API 응답이 아니다. 실제 메시지 wire의 변경은 공통 PR 전까지 하지 않는다.

| 화면 / 예제 | 구분할 표시·동작 |
| --- | --- |
| tier별 조건 / tier-50, tier-100-attendance, tier-100-score, tier-200-at-750, tier-300-at-850 | 각 조건 결과·필요 증거와 신뢰를 표시. 100% 두 대안과 200/300의 추가 필수 조건을 혼동하지 않음 |
| 금액 견적 | 기준액·교재/기기·고정 수수료·응시료·세금·반올림·상한과 SYNTHETIC 가정을 표시. 산술 계산값은 자격/확정액 아님 |
| 선택 / multiple-no-choice, higher-unknown | 복수 충족의 자동 max/합산 금지, 상위 미확인은 보류. 명시 선택의 revision/확인 필요 |
| 최종 금액 / official-fee-open, official-selection-open, first-score-replaced | 실제 금액/선택 규칙 미정, 최초 성적 변경은 확정 불가. 하위 지급 후 상위 차액 자동 지급 없음 |
| 합성 entitlement | policy/tier/선택·증거 revision/금액 결합 확인. allocationImplemented=false, reserved/paid=0; 현재 지급 버튼 없음 |
| 400% / tier-400-precheck-only, blog-* | URL/날짜 등 관찰·잘림/불일치/보완만. 실제 14일 연속·공개 상태·진위/가이드 준수 확인 아님. 최종 자격/계산·지급 제외 |

첫 산출물은 이 화면별 차이 분석·상태표·mock 설계다. 실제 웹 코드·공통 API/DB·계약·유료 AI를 이번 M0 인계만으로 구현하지 않는다. 새 금액을 기존 고정 100 TEST funding fixture나 V4 서명에 연결하지 않는다. Q-TIER/Q-BLOG와 소비자 합의는 PENDING/OPEN으로 남긴다.

## 공통 코드 재사용 경계

현재 공통 도구는 [wallet-client](../../src/application/wallet-client.mjs), [api-client](../../src/application/api-client.mjs), [proof-session-flow](../../src/application/proof-session-flow.mjs)다. 기존 로그인·지갑 문맥 변경·동의·안전 오류·세션 승인에 대해 [지갑 계약](PROOF_WALLET.ko.md), [흐름 계약](PROOF_FLOW.ko.md), [오류 복구](API_RECOVERY.ko.md)를 따른다.

새 mock 명령은 현재 HTTP로 전송하지 않는다. `AgreeMockTerms`를 `ApplicationTermsV4`/`TermsAcceptanceV4` 서명으로 대체하거나 새 무예치 신청을 기존 proof-session 생성 경로에 연결하지 않는다. AUTHORIZED/ACCEPTED_SYNTHETIC은 새 자격 충족·청구 가능 상태가 아니다. 향후 실제 연결에서는 공통 도구를 재사용하되 새 계약은 공통 PR에서 먼저 구현/시험해야 한다. 프런트가 별도 지갑 helper·동의 nonce·오류 규격을 복제하지 않는다.

금지 공통 수정 경로는 `src/application`, `src/policy`, `src/eligibility`, `src/*-evidence`, `contracts`, `config`, `tools`, root package/lockfile, CI, DB migration, `specs/m0`다. 필요한 변경은 사유·예제·소비자 영향으로 요청한다. 다른 담당자의 브랜치/DB/체인·원본/legacy/reference를 수정하거나 실제 데이터로 fixture를 만들지 않는다.

## 갱신과 인수

PR #30 병합 후 자기 checkout에서 `git fetch origin`으로 최신 develop을 확인한다. 미커밋 변경을 보존하고, 본인의 기능 브랜치만 합의된 develop 위로 갱신한다. 공유/게시 브랜치에 강제 rebase push하지 않는다. 아직 공개하지 않은 개인 브랜치는 충돌을 검토한 rebase, 공유 브랜치는 merge/새 브랜치와 PR 절차를 사용한다. main/develop 직접 push·강제 push·브랜치 삭제 금지. 기존 작업본을 강제로 switch/reset하지 않는다.

인수 메모에는 실제 base/head, 본 문서 버전, `check.mjs` 결과, 화면별 대응, 미해결 질문, 공통 수정 요청과 합성/실제 표시를 기록한다. 이 자료로 소비자 검토를 진행한 뒤 승인된 작은 프런트 작업을 시작한다. M0 병합만으로 소비자 수락·원천 연결·지급 구현이 완료됐다고 보고하지 않는다.

## H1 등록 이력과 목표 성적의 별도 화면

후속 승인으로 [H1 계약·상태/오류표](EXAM_LIFECYCLE.ko.md)와 [합성 예제](../../specs/m0/lifecycle.json)를 추가했다. 기존 M0 객체/version을 바꾸지 않는 별도 clear-exam-lifecycle.1 계약이며 소비자 합의는 PENDING이다. 모듈은 합성 전용 메모리 검증으로 실행 가능하지만 실제 HTTP/수집·DB·보존 복원은 없다.

첫 카드는 필요한 경로에만 ‘등록 당시 과거 이력’이며 고정 신청 기준일/기간, 수집/검증 시각, 전체성·계정 보류를 표시한다. 두 번째 ‘목표 성적 제출’ 카드는 별도 session/nonce/revision과 인정 기간을 쓴다. YBM/50%/100% 출석 대안에 baseline을 일괄 강제하지 않는다. 지원하지 않는 경로를 화면에서 삭제하거나 baselineRequired를 클라이언트가 바꾸지 않는다.

6개 fixture 흐름과 계약의 오류표로 정상·미확보·빈 목록·범위 미확인·이력 비필수·장기 보존 화면을 설계한다. 과거의 수집 TTL이 지났다는 이유로 다시 로그인/재수집을 강요하거나 조회 불가를 미응시로 표시하지 않는다. 현재 모듈의 registry는 새 프로세스에서 복원되지 않으므로 새로고침/재시작 복원은 후속 저장 계약이 필요하다. 현재 receipt를 로컬 브라우저 저장만으로 제품 검증 증거로 삼지 않는다.

목표 성적 성공만으로 baseline 보류를 숨기지 않고 두 결과를 따로 보여준다. 새 revision 중에는 이전 결과가 현재인 것처럼 표시되지 않는다. 합성 조건 충족도 실제 실명/원천 검증·환급 자격/청구 가능 표시가 아니다. 50~300% 선택/계산 및 400% 사전검토의 기존 범위를 유지한다. 제품 연결은 H2/M3 후속 승인 전까지 열지 않는다.
