# Claude Code 프런트엔드 M0 시작 문서

이 문서 하나를 새 작업의 시작점으로 사용한다. 저장소는 [clear-education-v4](https://github.com/gw020328-oss/clear-education-v4), 통합 PR은 [#30](https://github.com/gw020328-oss/clear-education-v4/pull/30), 대상은 `develop`이다. 제품 기준 commit은 `6d941a1fe0669b89730da1472d23ecd7caab22f4`, 초기 MVP 문서 기준은 `7bf622901919199ff6aaf00aaf077ef64a704a79`이다. M0의 정확한 최종 HEAD/병합 커밋은 PR의 검증 기록과 Git 이력을 확인해 작업 메모에 고정한다. 브랜치 이름만 보고 최신 규격이라고 가정하지 않는다.

**첫 작업은 기존 웹과 새 MVP의 차이 분석·상태표·mock 설계다.** 이 PR은 M1 이후 기능 구현, 새 DB/체인, 실제 AI/Vision/Moodle/API 연결을 승인하지 않는다. M0 mock 계약은 FIXED_FOR_M0_FIXTURES이고 **소비자 합의는 아직 PENDING**이다. 실제 Moodle 연동·원천 검증 차단, grant/outbox 보류, 독립 청구 제품 전환 NO-GO를 유지한다.

## 읽는 순서와 사실 확인

1. [AGENTS](../../AGENTS.md), [협업 절차](../../CONTRIBUTING.md), [팀 인계](TEAM_HANDOFF.ko.md), [담당 계획](TEAM_PLAN.ko.md), [현재 API](API_CONTRACT.ko.md)를 읽는다. 날짜별 과거 상태를 현재 구현과 구분한다.
2. [새 PRD](MVP_PRD_20261014.ko.md)와 [현재 구현 차이](MVP_GAP_20261014.ko.md)를 대조한다. 목표 750+·OR·후입금과 현재 800 AND 80%·선예치 경로는 다르다.
3. [M0 결정/질문](M0_DECISIONS.ko.md) → [M0 계약](M0_CONTRACT.ko.md) → [schema](../../specs/m0/schema.mjs)·[fixture](../../specs/m0/fixtures.json) → [단계별 계획](MVP_PLAN_20261014.ko.md) 순서로 읽는다.
4. `./tools/node specs/m0/check.mjs`로 받은 예제의 일관성을 확인한다. 실패를 무시하거나 예제의 차단값을 true로 바꾸지 않는다.

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

시원스쿨 화면에는 ‘750점반 100% 경로 제한 시연·상품 전체 환급액 판정 아님’을 표시한다. 다른 혜택/상위 환급률 가능성을 확인하지 않은 사용자를 자동으로 100% 최종 정산하지 않는다. 최초 제출 성적·비중복·선택/우선순위는 Q-TIER OPEN이며 임의 max/OR로 금액을 고르지 않는다. 50/200/300/400% 등의 추가 화면·schema·계산기는 이번 범위에 포함하지 않는다.

## 공통 코드 재사용 경계

현재 공통 도구는 [wallet-client](../../src/application/wallet-client.mjs), [api-client](../../src/application/api-client.mjs), [proof-session-flow](../../src/application/proof-session-flow.mjs)다. 기존 로그인·지갑 문맥 변경·동의·안전 오류·세션 승인에 대해 [지갑 계약](PROOF_WALLET.ko.md), [흐름 계약](PROOF_FLOW.ko.md), [오류 복구](API_RECOVERY.ko.md)를 따른다.

새 mock 명령은 현재 HTTP로 전송하지 않는다. `AgreeMockTerms`를 `ApplicationTermsV4`/`TermsAcceptanceV4` 서명으로 대체하거나 새 무예치 신청을 기존 proof-session 생성 경로에 연결하지 않는다. AUTHORIZED/ACCEPTED_SYNTHETIC은 새 자격 충족·청구 가능 상태가 아니다. 향후 실제 연결에서는 공통 도구를 재사용하되 새 계약은 공통 PR에서 먼저 구현/시험해야 한다. 프런트가 별도 지갑 helper·동의 nonce·오류 규격을 복제하지 않는다.

금지 공통 수정 경로는 `src/application`, `src/policy`, `src/eligibility`, `src/*-evidence`, `contracts`, `config`, `tools`, root package/lockfile, CI, DB migration, `specs/m0`다. 필요한 변경은 사유·예제·소비자 영향으로 요청한다. 다른 담당자의 브랜치/DB/체인·원본/legacy/reference를 수정하거나 실제 데이터로 fixture를 만들지 않는다.

## 갱신과 인수

PR #30 병합 후 자기 checkout에서 `git fetch origin`으로 최신 develop을 확인한다. 미커밋 변경을 보존하고, 본인의 기능 브랜치만 합의된 develop 위로 갱신한다. 공유/게시 브랜치에 강제 rebase push하지 않는다. 아직 공개하지 않은 개인 브랜치는 충돌을 검토한 rebase, 공유 브랜치는 merge/새 브랜치와 PR 절차를 사용한다. main/develop 직접 push·강제 push·브랜치 삭제 금지. 기존 작업본을 강제로 switch/reset하지 않는다.

인수 메모에는 실제 base/head, 본 문서 버전, `check.mjs` 결과, 화면별 대응, 미해결 질문, 공통 수정 요청과 합성/실제 표시를 기록한다. 이 자료로 소비자 검토를 진행한 뒤 승인된 작은 프런트 작업을 시작한다. M0 병합만으로 소비자 수락·원천 연결·지급 구현이 완료됐다고 보고하지 않는다.
