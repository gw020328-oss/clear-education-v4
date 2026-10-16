# 일반 수강 후기 검토 어댑터 — 2026-10-16

2026-10-17 LOCAL 연결 후속: fixed common commit31879659를 정상 merge하고 [LOCAL 소비 어댑터](REVIEW_PRECHECK_LOCAL_BRIDGE.ko.md)를 추가했다. FIXTURE/grounding 경로는 보존하며 새319개 오프라인 검증과 실제API/모델 미실행을 구분한다. 전체 수락/HTTP/DB는 미구현이다.

2026-10-16 오프라인 개선 후속: [보완 사유·근거 위치 v2](REVIEW_PRECHECK_GROUNDING_V2.ko.md)를 추가했다. 저장 응답 후처리 개선과 새 실제 모델 성능을 구분하며 v2 유료 호출은0이다. 아래 기존 실행 기록은 보존한다.

2026-10-16 후속: 사용자가 새 합성8건 평가를 승인했고 생성8/countTokens8회를 모두 사용했다. 결과와 보완 사유·위치 한계는 [실제 평가 보고](REVIEW_PRECHECK_ACTUAL_20261016.ko.md)를 우선한다. 아래 미승인/미호출 문구는 승인 전 준비 기록이다. 새 승인은 소진됐으며 추가 호출은 허용하지 않는다.

기준 develop `4756589`(PR67), 브랜치 `codex/ai-review-precheck`. **합성 모듈/오프라인 검증 완료, 실제 Gemini·Moodle 후기 API 미검증, 제품 HTTP 미연결**이다. 일반 구현 권장 Sol/Medium이며 위임 설정도 해당 값으로 전달받았다. 현재 턴에서 런타임 모델 ID를 별도 조회하거나 바꾸지 않았다.

최신 범위는 YBM750+ 및 시원스쿨50~300%의 일반 수강 후기다. 읽기 전용으로 참고한 PR70 작업본의 `docs/current/MVP_DECISIONS_20261016.ko.md`가 과거400% 블로그 사전검토 문서보다 우선한다.400/500%는 범위 밖이고 신규 블로그 검토는 구현하지 않는다. 기존 원문·예제의400% 경로를 삭제하거나 정책을 변조하지 않았다. 새 어댑터는 REVIEW requirement만 받으며 BLOG는 모델 호출 전에 거부한다.

## 구현과 재사용

- `src/document-precheck/review/review.mjs`는 기존 `reviewWorkflowDocument`, `precheckCode`, in-process bound policy와 M1/M3 RunContext를 소비한다. application/subject/recipient/policyVersion/hash, requirement/rule/plan/display/preview/manifest/sourceBundle, submission/route revision, original bytes, method/fields/prompt/model/run/attempt를 기존 검증기로 연결한다. 공통 스키마·DB·HTTP·application/evaluation·package/lock/CI·web/contracts/자금·독립 청구 코드는 변경하지 않는다.
- 확정된 bound plan만 코드로 검사한다. 문자·UTF-8 byte는 제출 텍스트에 대해 기존 결정적 코드를 사용한다. OCR 문자열 길이를 원문 바이트 수로 대체하지 않는다. 정책 해석 OPEN이면 POLICY_OPEN이며 새로운 사진·분량·날짜 조건을 만들지 않는다. 합성 fixture의4 codepoints/10bytes는 학원 조건이 아니다. 실제 YBM 필드/분량·사진 및 시원스쿨200byte 계산/107일 anchor·시간대·양끝 해석은 기존 미결 상태다. **실제 반별 확정 정책 preset은 이번 결과에 없다.** 기존 공식 출처 applicability=OPEN을 강제로 SYNTHETIC_ONLY로 바꾸지 않는다.
- CODE와 TEXT_AI/VISION 관찰을 함께 집계한다. 기존 정확한 텍스트 quote/span·image locator·필드 allowlist·출력 schema 검증 후에만 원천 fixture와 비교한다. 미제출은 모델 호출0, 잘못된 결과·timeout/cancel은 보류다. 부정적 후기나 자료의 합성 표지만으로 필드를 보류하는 규칙은 없다. 문서 내 명령은 데이터로 전달하고 지시를 따르지 않도록 명시하며 권한 필드는 출력 schema가 거부한다. 실제 모델의 주입 저항 성능은 미측정이다.
- 정상 텍스트는 PRECHECK_REQUIREMENTS_MET, 확정 항목 누락은 NEEDS_SUPPLEMENT, 충돌·불명확·판독불가·미확정은 UNDETERMINED로 구분한다. 여러 사유는 함께 보존한다. Vision은 기존 IMAGE_NOT_DECODED 제한을 그대로 유지하므로 이미지 포함 검토의 전체 통과를 주장하지 않는다.
- source facts와 AI observation은 분리하며 일치해도 publication/author/publishedAt/modifiedAt/publicAvailability는 UNVERIFIED다. 불일치는 CONFLICT를 반환하고 하나를 선택하지 않는다. NOT_FOUND와 UNAVAILABLE는 구별하되 문서 내용이 정상이라면 원천 오류 때문에 문서 내용 자체를 누락으로 바꾸지 않는다. 이때도 게시 확인은 미완료다.
- session은 신뢰한 host의 `resolveCurrent()`를 시작/완료/조회에서 비교한다. 오래된 policy/run/submission revision/sourceBundle/sourceRun 결과는 거부한다. 늦은 응답은 STALE이고 보완 후 최신 결과를 덮지 않는다. 동일 run 재사용/receipt 복사는 거부한다. **메모리 내부 검사이며 인증·영속 CAS·서명/진위 검증기가 아니다.** C2의 host 권한/ledger 수락을 대체하지 않는다. 반환 current는 발급 시점 값이므로 소비 시마다 isCurrent와 공통 latest resolver/CAS를 다시 확인해야 한다.
- 결과에는 원문·quote·추출값·이미지·키·URL을 넣지 않는다. 임시 관찰 참조는 완료 후 해제하고 이미지 복사본 삭제는 기존 어댑터에 맡긴다. JS 문자열/GC·강제종료·호출자 보유본의 물리적 삭제를 보장하지 않는다. C2 공개 합성 fixture 접수 제한·수명·realDataAllowed=false·decode 제한을 유지한다.

## 공통 담당자에게 필요한 인터페이스 제안

이 절은 **합의 전 로컬 proposal**이며 기존 endpoint/Reason/schema에 전송하지 않는다. Moodle 실제 API가 제공하지 않는 필드를 지어내거나 기존 fact 수집기를 새로 만들지 않는다.

1. 공통 host가 인증된 Moodle 후기 receipt를 먼저 검증하고 본인 계정·강좌·게시글·가시성/권한/삭제·수정 시각과 source-run을 신청에 결합해야 한다. AI는 URL/token/API를 직접 열지 않는다. 게시·작성자 상태를 이미지로 인증하지 않는다. 실제 Moodle receipt export가 확정되면 이 로컬 projection의 이름/필드부터 합의한다.
2. 읽기 전용 `clear-review-source-fixture.1` 입력은 FIXTURE만 허용하며 `runContextHash/sourceBundleHash/sourceBundleRevision/sourceRunId/fields[{fieldId,state,value}]`다. value는 AVAILABLE일 때만 문자열이며 NOT_FOUND/UNAVAILABLE에는 null이다. fieldId는 정책에 이미 선언된 observation profile 내에서만 허용한다. context hash는 무결성 연결일 뿐 권한 증명이 아니다. 실제 API receipt를 이 FIXTURE 입력에 넣고 실제 검증으로 표기하면 안 된다.
3. projection은 원본 receipt의 mapping/출처/권한 검증을 대신하지 않는다. 실제 도입 시 공통 source-run receipt hash·필드별 출처 locator/관찰시각·계정/강좌/게시글 mapping을 인증된 host에서 pin해야 한다. 현재 sourceRunId는 합성 ID이고 API가 발급한 사실로 주장하지 않는다. 값 비교는 정확한 문자열 비교뿐이다. 날짜/대소문자/표시명 정규화가 필요하면 명시 버전 규칙을 먼저 확정해야 한다.
4. 새 결과는 `clear-review-precheck-proposal.1`의 transient local DTO다. 공통 ReviewSummary에 바로 넣을 수 없다. 공통 consumer는 source 상태/내용 상태를 구분해 표시하고 runContext/source projection digest를 CAS에 포함하는 버전 변경을 검토해야 한다. 기존 공통 sourceBundle은 약관 원문과 연결되므로 후기 API receipt와 같은 bundle로 조용히 해석하지 않는다. 별도 사실 receipt binding 계약이 필요하다.
5. 날짜는 `date-range.mjs`의 순수 epoch-seconds/명시 boundaries 검사만 준비했다. 실제 rule에 연결하지 않았다. 기존 ReviewPlan은 날짜 check kind를 지원하지 않으므로 정확한 정책 source/anchor/timezone/기간·경계·source field와 pin을 담는 후속 계약 합의가 필요하다. OCR 날짜나 임의107일 상수를 연결하지 않는다. 범위 OPEN/시각 미제공은 각각 POLICY_OPEN/UNDETERMINED다.
6. 현재 CI glob에는 `tests/ai-review-precheck/*.test.mjs`가 없다. 소유 경계를 지켜 root CI를 수정하지 않았다. 공통 담당자는 위 네트워크 차단 시험 명령을 기존 합성 AI 검사에 추가하는 변경을 별도로 검토해야 한다. 이번 PR의 신규25개 로컬 통과를 GitHub CI의 신규 coverage로 표시하지 않는다.

source facts, AI observations, eligibility, funding, payment를 합치지 않는다. 점수·출석·최종 환급 자격·예치 배정/회수/PG·72/120시간 제안은 판단하거나 상수화하지 않는다. automaticEligibility=false/paymentAllowed=false, 독립 청구 NO_GO, grant/outbox HOLD를 유지한다.

## 평가와 재현

`tests/ai-review-precheck/`는 신규25개 시험과8개 development corpus를 제공한다. 정상/부정적 의견/필수누락/충돌/흐림/잘림/미제출0회/과거policy·run·revision·source 재사용/보완 후 최신/악성지시/timeout·cancel·ACTUAL 차단을 포함한다. **unit의 Vision 이미지는 signature-only header이며 semantic 결과는 scripted MOCK**이다. 별도 renderer가 Gemini 평가 준비용 실제 PNG4개를 생성하며 사람이 육안으로 정상·blur·잘림·BETA/ALPHA 충돌 카드를 확인했다. 모델은 이 PNG를 아직 읽지 않았다. blur/잘림은 합성 변환이며 실제 학생 사진 분포를 대표하지 않는다.

8개 gold replay는 후처리 계약 시험이지 모델 정확도나 holdout 성능이 아니다. 사례/정답과 source conflict 비교값을 분리했다. Gemini에는 gold/API 비교값을 전송하지 않는 fixture 변환을 준비했다. 같은 corpus를 보고 조정한 뒤 독립 holdout이라고 표시하지 않는다. 실제 평가 시 raw literal 정확도·정상 자료 false hold·필수 누락·판독불가 보존·주입으로 값 변경·API 충돌 탐지·후처리 결과를 따로 보고한다. Vision raw 정상이라도 C2 전체 decode 제한은 별개다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/*.test.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/document-precheck/*.test.mjs tests/ai-policy/*.test.mjs tests/product-workflow/*.test.mjs
python3 tests/ai-review-precheck/render-evaluation.py artifacts/review-precheck-evaluation
./tools/node tests/ai-review-precheck/prepare-evaluation.mjs
./tools/node tools/verify-workspace.mjs
```

고정Node24.21.0을 기존 설치 경로의 PATH로 사용했다. 의존성은 기존 설치본을 가리키는 Git 제외 node_modules/ethers 링크만 사용했다. Python은 Codex bundled runtime/Pillow를 사용하며 Monaco 글꼴을 로컬에서 읽는다. 전역 설치·루트 package/lock 변경은 없다. 생성 PNG/base64·dry-run manifest는 Git 제외 artifacts에 있다.

검증: 신규25/25 PASS, 기존 AI/document/product-workflow 회귀237/237 PASS(별도 실행 결과 포함), verify:workspace PASS(원본191개·의존 그래프 보존). 추가한 타신청 거부 시험의 최초 fixture가 applicationId hash 형식을 위반해1건 실패했고, 합성 hash로 고친 뒤 신규25개 전부 통과했다. runtime link가 디렉터리 전체 symlink였을 때 workspace 검사 실패를 확인하고 Git 제외 디렉터리 내부 ethers 링크로 교정한 뒤 통과했다. 실제 API 시험0, 유료 호출0. CI 최종 상태는 PR에서 별도 확인한다.

유료 평가안은 [REVIEW_PRECHECK_EVALUATION_PLAN.ko.md](REVIEW_PRECHECK_EVALUATION_PLAN.ko.md)에 있다. 기존5/5 예산은 소진 상태이며 새 승인 전 실제 호출·키 조회를 수행하지 않는다.
