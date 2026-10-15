# 제품 연결 API·저장 계약 — M3-0

2026-10-15 C1 학생 후속 Draft: [단일 HTTP·프론트 인계](MVP_SOURCE_HTTP_HANDOFF.ko.md)의 `clear-mvp-student-http.1`은 병합된 PR59/develop2bb6d29를 정상 merge해 학생 본인 신청·서버 합성 조건/정확 표시 확인·정책 변경 재확인·원자 멱등/GET복구를 추가한다. 실제 동의/게시·C2 파일/문서 검토·운영 Evidence/재원·화면은 미구현이다. F0/web은 서준형 소유로 유지한다. PR59 원문 API는 develop에 병합 완료됐고 PR61은 Draft로 유지한다. 아래 이전 Draft/C 전체 미구현 표기는 이전 단위의 기록이다.

2026-10-15 신규 Draft: [원문 HTTP·프론트 인계](MVP_SOURCE_HTTP_HANDOFF.ko.md)의 `clear-mvp-source-http.1`은 별도 loopback HTTPS에서 operator 원문 등록/조회·mock 초안·개발용 검토 기록을 연결한다. 기존 F0/web은 서준형 소유로 보존한다. 수강생 신청·동의·업로드/문서 검토 HTTP와 실제 화면 연결은 이 단위에 아직 없다. 아래 이전 미연결/예약 문구는 해당 경로 또는 이전 시점의 기록이며 새 구현 subset과 구분한다.

상태: **M3-0 합성 모듈 계약 / PR #58 develop 병합 `5f902dc`**. 버전 `clear-product-workflow.1`, 최초 기준 develop `4ae548b`(PR #54), 추적 #55·#39·#40. 기존 실행 API·application DB schema4·V4 동의/금고와 별도다. 아래 M3-1 이후의 HTTP·정책/동의·Evidence·재원 API는 여전히 제안이며 운영 구현 완료가 아니다. 소비자는 정확한 계약 이력을 반영한다.

## 단계와 구현 경계

| 단계 | 이번 산출물 / 다음 선행 |
| --- | --- |
| M3-0 | 실행 가능한 계약 validator·문서 bytes 지문·공개 원문 snapshot lookup, 별도 합성 SQLite 검토 run ledger, 제한 공개URL 수집기·비공개 원문 archive와 실패/재시작 회귀. 실제 HTTP/화면·학생 동의는 아직 없음 |
| M3-1 | 기존 지갑 세션/CSRF로 보호한 `/mvp` HTTP·정책/신청/동의 저장. 합성 동의와 실제 지갑/계약 동의 구분. source/plan·표시 DTO 승인과 변경 불변성 검토 필요 |
| M3-2 | M3-0 모듈의 HTTP·운영자 등록 UI와 AI 소비 연결, 학생 업로드 decode·byte 수명·검토/보완 연결. 개인 자료·유료 호출은 별도 승인/보관 관문 전 차단 |
| M3-3 | 성적·학습의 인증된 source adapter→영속 수락 pin→M2 입력/판정 저장. 기존 M2를 호출하기 전 신뢰·최초 성적·정정/기한을 독립 생성. LOCAL_LAB/AI 관찰을 VERIFIED Evidence로 바꾸지 않음 |
| M3-4 | F0 이후 별도 화면 adapter, 자격/재원 상태 병기. read-only 재원 어댑터 확정 전 UNKNOWN. 배정·충전 의무·지급 기능은 미구현/보류 |

## API 제안과 인증

아래는 **예약된 경로이며 아직 HTTP handler에 등록하지 않았다**. 기존 `/applications`와 F0의 엄격한 ApplicationView에 필드를 덧붙이지 않는다. origin/TLS·지갑 session·CSRF·Idempotency-Key·안전한 오류는 현재 application 서버 도구를 재사용한다. 참가자/운영자/worker 권한은 인증한 서버에서 결정하며 JSON의 actor/verified/admin을 신뢰하지 않는다.

| 경로 | 권한·요청 / 결과 |
| --- | --- |
| POST `/mvp/source-bundles/:id/snapshots` | 운영자, expectedRevision+허용 URL ID/수집 리소스 ID 또는 paste/file 보완. 새 revision/operation. 사용자 쿠키/헤더 전달 없음 |
| GET `/mvp/source-bundles/:id` | 운영자, 버전/부분 수집/필수 원천 미확보·보완 상태. unsafe HTML 렌더와 공개 blob URL 없음 |
| POST `/mvp/policies/:draftId/reviews` | 운영자, sourceBundleHash+draftRevision+정확한 표시/검토 기준 승인. 현재 bundle과 다르면 STALE. 기관 승인으로 표시하지 않음 |
| POST `/mvp/applications` | 참가자, 확정된 policyHash. 새 application/Binding 생성, 예치 불필요. 기존 ENROLLED를 재해석하지 않음 |
| GET `/mvp/applications/:id/agreement-preview` / POST `agreement` | 본인, 정확한 policy/rule/plan/display/sourceBundle·참가자/수령인/instance와 previewHash. 초기 SYNTHETIC_ACK_ONLY는 실제 동의가 아님. 실동의 서명/nonce는 M3-1 검토 후 별도 버전 |
| POST `/mvp/applications/:id/submissions` | 본인, expectedWorkflowRevision·requirement·submissionRevision+ordered manifest. 실제 파일 업로드 경로는 decode·보관 관문 전 비활성 |
| POST `/mvp/applications/:id/review-runs` / POST `:runId/cancel` | 본인, 서버의 최신 정책/원천/동의/제출 resolver로 고정한 run. 새 retry는 새 키/runId·attempt, 이전 결과 재사용 불가 |
| GET `/mvp/applications/:id` / GET `/mvp/operations/:id` | 본인/범위가 허용된 운영자. 응답 유실 후 같은 키로 operation 조회. POST 자동 재전송·새 키 자동 생성 없음 |
| POST `/mvp/applications/:id/evaluations` | 내부/검토 권한, 증거 pin과 facts/선택 revision을 DB에서 읽어 결정적 M2 호출. 브라우저가 EvaluationContext/verified 값을 제출하는 경로 없음 |
| GET `/mvp/applications/:id/funding` | 별도 read-only projection. UNKNOWN/UNFUNDED/PARTIAL/FUNDED/ALLOCATED와 약정·충전·확보·배정·예약·부족·지급·회수를 구분. 미확정 어댑터를 임의 0·지급가능으로 표시하지 않음 |

## 저장 표와 원자성

| 엔터티 | 불변/최신 키와 책임 |
| --- | --- |
| source_snapshot / source_artifact | sourceId+revision / snapshotHash, 응답 bytes·추출 텍스트·각 이미지 bytes의 개별 SHA256·MIME·length·locator. 원문은 Git/PR/CI 제외 전용 디렉터리 0700/파일0600. 같은 버전 덮어쓰기 금지 |
| source_bundle / draft | product/cohort+bundleRevision, 필요한 source ID 목록과 정확한 snapshotHash 집합. 수집불가·JS/이미지/별도가이드 누락은 pending/질문. 새 bundle은 검토 중 초안을 stale로 만들며 확정 정책은 그대로 보존 |
| policy_version / agreement | policyHash/ruleHashes와 sourceBundleHash·reviewManifestHash·plan/display/preview hash 및 participant/recipient/instance/Binding revision. 게시된 버전·동의 내용 update 금지. 새 정책에는 새 동의 |
| workflow_head | application+requirement+rule, 서버 resolver의 최신 workflowRevision와 snapshotHash. `inputHash`는 기존 submissionDigest, `manifestHash/assetsHash`는 이미지 bytes manifest로 별도 고정 |
| review_run / receipt | runId unique, snapshot+attempt/contextHash, 생성/만료 시각·RUNNING/ACCEPTED/CANCELLED/TIMED_OUT/SUPERSEDED. 성공은 context 재검사와 receipt insert를 한 BEGIN IMMEDIATE로 기록. 같은 run+같은 결과는 같은 receipt, 다른 결과는 CONFLICT |
| evidence / decision | 검증자 identity/version·원천/주체/의미/전체성·정정·기간 pin, 첫 성적 참조·최초 제출/보완 시각·facts revision. M2 입력·출력 지문과 이유를 append-only 저장. 오래된 결과는 이력으로만 보존, 현재 표시에서 제외 |
| operation | actor+route+Idempotency-Key·canonical requestHash, target ID. 동일 키/다른 요청 CONFLICT. 원자 성공 뒤 유실된 응답은 조회로 복구. tombstone 삭제로 중복 방지 이력 초기화 금지 |

앱 전체 revision watermark도 저장하여 다른 method/rule scope의 pending run이 이전 신청 revision으로 완료되지 못하게 한다.

이번 SQLite 파일명은 `workflow.sqlite`, schema1·환경 지문을 가진 **새 전용 합성 저장소**다. 기존 applications.sqlite를 열거나 migration하지 않는다. 구현은 app_heads/heads/runs 및 source snapshots/artifacts/bundles/bundle_heads subset만 포함한다. 정책/신청/동의/증거/판정의 전체 테이블과 기존 사용자 DB 이관은 후속이다. 저장소 연결 자체는 인증이 아니다. pinLatest/complete는 신뢰한 내부 resolver/worker API이며 공개 요청을 직접 넘기지 않는다. runtime context를 복사하거나 해시를 아는 것이 권한 증명이 아니다.

## 공통 ledger 호출 계약

`openReviewLedger({directory,environment,now})`의 environment는 `{instanceId,origin,mode:'SYNTHETIC'}`이며 신뢰한 호스트 설정이다. 새 DB만 사용한다. `pinLatest(snapshot)`은 내부 resolver의 단조 증가 workflowRevision을 저장하고, 같은 revision/다른 내용은 거부한다. scope는 applicationId/requirementId/ruleId/method다. 정책·동의·원천 변경은 기존 scope의 workflowRevision을 증가시키며 기존 기록을 수정하지 않는다. 앱 취소/동의 철회는 호스트가 `invalidate(applicationId)`를 호출해 재pin 전까지 모든 pending run을 차단한다.

`begin(snapshot,{idempotencyKey,runId})`는 최신 pin과 정확히 일치해야 한다. 같은 scope/같은 키는 기존 run을 조회하고 다른 요청은 CONFLICT다. 새 키와 runId로만 retry하며 새 attempt는 이전 RUNNING을 SUPERSEDED로 바꾼다. 반환은 `{context,contextHash,state,createdAt,expiresAt,summary,...GATES}`다. `complete(runId,summary)`는 내부 worker만 호출하고 최신 snapshot·현재 RUNNING/기한·contextHash를 확인해 ACCEPTED와 receipt를 원자 저장한다. 같은 완료 payload는 재조회, 다른 완료는 CONFLICT. `cancel(runId)`는 RUNNING만 CANCELLED로 전환하며 이미 수락한 receipt를 취소로 바꾸지 않는다. `get(runId)`는 만료/최신 pin을 다시 확인해 TIMED_OUT/SUPERSEDED를 반영하고, 늦은 summary를 현재로 돌려주지 않는다. `close()`는 DB만 닫으며 모델 재실행을 하지 않는다.

AI는 ledger를 직접 열지 않는다. 호스트가 begin한 `context`를 AI adapter에 전달하고, 반환된 ReviewSummary를 호스트가 complete한다. 브라우저의 JSON이나 모델 응답을 이 신뢰 API에 직접 넣지 않는다. sourceBundle 구조화는 별도 `clear-source-resolved.1 / purpose:POLICY_DRAFT`이며 문서 run의 `purpose:DOCUMENT_PRECHECK`와 혼용하지 않는다.

## AI와 bytes 결합

`src/product-workflow/contract.mjs`의 export를 따른다. `createDocumentManifest(submission,files)`는 postId/imageId 순서와 실제 bytes SHA256·MIME·length를 고정한다. metadata가 같은 다른 PNG도 다른 assetsHash가 된다. 현재 입력 검사는 **시그니처 수준**이며 완전 decode·악성 파일 안전성을 보장하지 않는다. 허용 JPEG/PNG 8MiB/장·20MP 선언치, 8장/글·14글, 합계32MiB다. 기존 글자수/이미지 metadata 검사와 원본 bytes의 연결만 준비한다. 서버 decode 전 실제 업로드·ACTUAL observer는 차단하며, 임의 변환본을 원본으로 대체하지 않는다. 추후 정제본에는 원본/정제 bytes hash+transformVersion을 추가한 새 버전이 필요하다.

RunContext는 전체 Binding, workflowRevision·agreementHash, rule/requirement/ruleHash, planVersion/planHash/displayHash/reviewManifestHash/previewHash, submissionId/revision·routeRevision, 기존 metadata inputHash, manifest와 assetsHash, method·fieldIds·promptVersion/modelVersion, runId·attempt를 결합한다. `toPrecheckContext`의 ruleVersion은 **planVersion**이며 policy.ruleVersion 상수가 아니다. `runContextHash`가 이 전체를 묶는다. 최신 resolver는 sourceBundle 변경/동의 변경/정정/재제출/취소/새 retry 때 snapshot 또는 workflowRevision를 바꾼다.

AI는 이 context와 현재 bytes를 확인하고 기존 엄격 locator(`post/.../text/start/end`, `post/.../image/id`)를 유지한다. Gemini 평가의 L1/image row2를 제품 locator로 자동 승격하지 않는다. 기존 WeakMap acknowledgment/envelope는 새 프로세스에 복사해 복구할 수 없고 실동의로 쓰지 않는다. 공통 DB에는 ReviewSummary(상태·허용 사유·필드 ID·원 결과 지문)만 저장한다. 추출 이름/점수/원문 quote·raw 모델 출력·파일명·URL·bytes는 이 ledger에 저장하지 않는다. 실제 원본/모델 결과는 로컬 trusted 작업 메모리, 최대30분 또는 성공/오류/취소 종료 시 폐기하는 후속 adapter 책임이다. 브라우저 localStorage에 저장하지 않는다. 강제 종료·외부 라이브러리 복사본까지 완전 삭제됐다고 주장하지 않는다.

## URL 원문과 보완

`source-contract.mjs`의 SourceSnapshot/SourceBundle/resolveSourceBundle을 따른다. sourceType은 PUBLIC_URL/PASTE/FILE이고 institutionId/productId/cohortId를 고정한다. collectedAt·expiresAt(시연30일), 요청/최종URL·HTTP 상태·COLLECTED/PARTIAL/FAILED·추출버전·한계와 artifact별 raw/text/image 지문을 결합한다. HTML raw와 추출 텍스트 hash를 혼용하지 않는다. 원본 보관이 없거나 hash가 다르면 lookup 실패로 보류한다. 원문 만료/삭제 시 초안은 SOURCE_UNAVAILABLE로 보완하며, 확정·동의 자료의 운영 보관/아카이브 정책은 OPEN이라 실제 정책 공개를 차단한다. 운영자 등록/확정이 공식 발행자 진위·기수 적용성·계약/기관 승인 증명은 아니다.

처음 allowlist는 기존 근거의 YBM 상품 페이지, 시원스쿨 상품 페이지·공지901, 명시 Naver 가이드다. exact HTTPS URL만 허용하고 이미지·redirect도 별도 등록 URL만 같은 검사로 요청한다. URL 사용자가 임의 hostname/path/port를 추가하는 기능은 없다. 계정/암호·임의 포트·file·loopback/private/link-local/metadata 주소 거부, DNS public address 확인 후 해당 주소에 연결을 고정하고 TLS hostname을 검증한다. redirect 각 단계 재검사·동일 origin으로 제한, 최대2회/8리소스·HTML2MiB/이미지8MiB·총16MiB, 요청10초/전체30초. 쿠키/사용자 header·script·form·자동 링크 추적 없음. 자동 텍스트 추출은 휴리스틱임을 남기고 JS/필요이미지 누락을 완전 확보로 표시하지 않는다. 보완 paste/file은 별도 새 source revision이다.

AI는 common getSnapshot/getArtifact lookup으로 텍스트 blocks와 이미지 bytes를 받는다. 각 artifact hash/length, snapshotHash·bundle revision·product/cohort를 재검사한다. source의 텍스트/이미지 지시문은 모두 비신뢰 데이터다. 필요한 source ID가 없거나 부분수집이면 NEEDS_SUPPLEMENT, 모두 읽혀도 READABLE_UNVERIFIED이며 자동 정책 게시/동의는 없다.

## 상태·오류와 소유

합성 신청 AGREED와 실제 consentVerified를 분리한다. 문서 결과 CHECKED/MISSING/NEEDS_REVIEW/UNREADABLE/POLICY_OPEN 및 필드별 REASON_CODES는 contract export가 정본이다. 만료/취소/중단·stale 결과는 값을 채택하지 않고 보완/새 retry를 안내한다. 새 제출은 submissionRevision 증가, source/plan 변경은 workflowRevision 증가, 이전 run은 SUPERSEDED. 서버 재시작 후 RUNNING은 만료 전 그대로 조회하며 자동 모델 재호출하지 않고, 300초 뒤 TIMED_OUT. 새 retry만 새 run/attempt로 시작한다.

공통 소유: src/product-workflow, specs/m3, API/DB/정본문서/rootCI. AI 소유: src/ai-policy의 source 소비 adapter, src/document-precheck의 bytes/run 연결 adapter와 전용 tests/docs. 기존 공통 타입을 AI가 복제/변경하지 않는다. F0 원격 codex/frontend-shell의 엄격한 view와 list/get adapter를 확인했으며 새 화면/경로는 미연결, 소비자 수락은 PENDING이다. 허용된 세션 외 동료에게 메시지를 보내거나 web/를 변경하지 않는다.

실명인증·기관 협의/공식 적용성·실제 source 검증은 후속, 예치율/풀/배정 순위/충전·회수 정책 OPEN이다. 자격/산술 후보와 재원은 별도다. 400% 사전검토만/자동 자격·지급 금지,500%제외,grant/outbox HOLD·독립claim NO-GO 및 기존 금고/DB/체인/키 보존을 유지한다. 실제 AI 호출·YBM 재로그인·공개 체인·실자금·배포·자동 병합은 이번 작업에 포함되지 않는다.

## 원문 → M1 Source pin의 명시적 매핑

호스트의 독립 M1 Source pin은 sourceId/institutionId/productId/cohortId와 capturedAt=collectedAt을 대조한다. rawHash는 유일한 RESPONSE_BODY artifact.sha256, normalizedHash는 textArtifactId의 EXTRACTED_TEXT.sha256, normalizerVersion은 extractionVersion이다. 텍스트가 없으면 normalizedHash/normalizerVersion 둘 다 null이다. locators는 resolve가 반환한 정확한 text block locator다. snapshotHash/bundleHash는 이 M1 지문과 별도로 보존한다. 기관 범위/원문 bytes의 일치가 발행자 진위·적용성·기관 승인은 아니다. PUBLIC_URL/PASTE/FILE provenance를 지우거나 SYNTHETIC으로 재표시하지 않는다. M1 origin/applicability는 신뢰 호스트가 별도로 제공하는 미확인 주장이고, 소비자가 응답으로부터 자동 repin/승격하지 않는다. 이미지-only·미수집 자료는 텍스트 quote를 만들어 채우지 않고 보완 질문으로 남긴다.

lookup은 snapshot을 await 직후 고정 복사하고 각 artifact bytes를 복사·대조한다. 전체 lookup 종료 시 만료도 다시 검사한다. 외부 callback이 같은 mutable 객체를 재사용해도 이미 확인한 scope/지문을 바꿀 수 없다. 실제 archive는 별도 sources.sqlite를 사용하며 30일 만료 뒤 조회 차단과 명시적 purge를 제공한다. purge는 논리적 삭제이며 SQLite/디스크 잔재 완전 삭제 보장은 아니다. 확정 정책의 장기 보관/아카이브·운영 개인자료 수명은 후속 관문이다.

## 현재 실행·검증 범위

공통 모듈 구현은 private-db/review-ledger/source-store/public-fetch/source-collector와 contract/source-contract다. collectSourceSnapshot은 exact 허용 URL의 원본 bytes와 명시 이미지 요청 결과를 resourceRequests로 남긴다. 실패 요청도 URL/HTTP 상태가 snapshotHash에 포함된다. 자동 JS 실행/이미지 발견은 없고 HTML 결과는 PARTIAL이다. UTF-8 정규화가 불가능하면 raw는 보존하고 텍스트는 미확보로 남긴다. 원문 실제 사이트 수집은 이번 시험에서 실행하지 않았으며 합성 transport·고정 TLS/lookup 옵션 검증만 했다.

`./tools/npm run test:product-workflow`와 `./tools/npm run demo:product-workflow`가 새 합성 DB에서 동작한다. CI는 네트워크 tripwire를 추가한다. 데모는 원문 보완/필수 가이드 누락→run의 보류 요약 수락→DB 재개봉/동일 receipt 복구까지이며, 정책 승인/실제 학생 동의/HTTP 업로드/조건 판정 저장/재원 read 연결은 아직 아니다. 데모의 ACCEPTED는 보류 요약을 단회 저장했다는 뜻이다. 기존 application·금고 모듈과 root 의존성/lockfile을 변경하지 않았다.

SourceSnapshot.resourceRequests는 `{resourceId,role:PAGE|IMAGE,requestedUrl,finalUrl,httpStatus,status:COLLECTED|FAILED}`의 최대8개 배열이다. PUBLIC_URL은 page와 명시 이미지의 모든 시도를 포함하고 PASTE/FILE은 빈 배열이다. 실제 보관 artifact가 없는 COLLECTED 표시는 거부하며, FAILED 리소스가 있으면 전체 COLLECTED를 거부한다. exact source version에 실패 URL도 결합되므로 다음 수집/보완에서 누락 여부를 비교할 수 있다. archive는 시연용120 snapshot 상한을 두며, 버전 tombstone은 purge로 초기화하지 않는다.

통합 검토 보정: 기본 HTTPS transport는 page·image의 응답 스트림 전체에 하나의 16MiB 수신 예산을 공유한다. 실패한 응답에서 읽은 bytes도 차감하며 초과 chunk는 보관하지 않고 스트림을 닫는다. 예산 소진 뒤 후속 리소스는 요청하지 않고 FAILED/RESOURCE_FAILED로 남긴다. 전송 계층에서 이미 전달된 마지막 chunk의 초과분까지 네트워크 수신을 되돌릴 수 있다는 보장은 아니다. raw+추출 text+image의 보관 합계16MiB 검사는 이 수신 예산과 별도로 유지한다. 실제 URL 호출 없이 합성 스트림과 collector 회귀로 검사한다.

계약 초기 커밋4018e32, 기관/저장 후속91430c6, resourceRequests 및 최종 consumer 계약48d2117을 AI에 전달했다. AI #57은 별도 Draft 의존 PR이며 이 PR에 자동 포함하지 않는다. 해당 모듈 소비자의 실제 최종 시험/CI는 자신의 PR에서 확인한다. Moodle 새1502 실측21/21은 Draft #56의 근거이고 그 PR 역시 자동 병합하지 않는다.
