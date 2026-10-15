# C2 합성 파일 접수·문서 검토 HTTP 구현 계약

2026-10-15 / 합성 C2 구현·Draft 검토 / 상위 #55, 하위 #62. C1 선행 PR61 최종 head `95b397cc662b255fc777afc898e7b56cc6a444d9`, develop merge `0590fd0728ce3a4525129cbad753c3ba9b2f781b`. C2 branch `codex/mvp-document-http`. 구현 코드 `0a9945b98a190ae43abeedd15d169be91c2eb988`, 시작 정리/공개 fixture 입력 시험 `04efb92acf7ad890f3571fc8ef443d8e0498fde4`, Draft PR63. 아래 endpoint는 명시 documentMode 합성 host에서 동작하며 운영 documentSubmissionReady=false다.

## 범위와 기존 모듈

기존 초대 participant 세션·loopback HTTPS/Host/Origin/CSRF, `student-http-service`, `createDocumentManifest/validateSnapshot/createRunContext`, `openReviewLedger`, `reviewWorkflowDocument`와 `compileBoundReviewPolicy/createReviewPreview`를 연결한다. 기존 F0의 엄격 DTO와 student/source adapter는 보존하고 별도 document HTTP/client namespace를 추가한다. web/·지갑 UI·PR60은 서준형 소유다.

첫 C2는 서버에 등록된 공개 합성 fixture의 **정확한 텍스트·실제 bytes만** 접수한다. client의 dataMode=SYNTHETIC 선언만으로 실제 서류를 허용하지 않는다. host fixture registry의 metadata 및 내용 hash와 수신한 파일 전체를 대조한다. 불일치·임의 텍스트/파일은 worker/영속 저장 전에 고정 오류로 거부한다. 실제 개인자료·학교/YBM/Moodle·원천 URL·유료 모델은 호출하지 않는다. 파일명은 표시용 입력 검증 후 버리며 hash로 경로를 만들거나 읽지 않는다.

API version `clear-mvp-document-http.1`, capability는 `documentHttpVersion`, `syntheticDocumentSubmissionReady`, `documentSubmissionReady:false`, `realDataAllowed:false`, `imageDecodeReady:false`다. 기존 C1의 documentSubmissionReady=false는 운영/임의 파일 접수 불가 의미로 유지한다. 새 capability는 준비된 host 합성 policy/plan·fixture·source archive가 정확히 연결된 신청에만 true다. 준비되지 않은 기존 C1 신청은 DOC_CONFIGURATION_REQUIRED로 차단한다. capability는 신청의 REVIEW/BLOG requirement별로 제공하고, 성적·학습 조건까지 완료됐다고 표시하지 않는다.

## C1과 검토 기준의 결합

1. 기존 C1 policy hash를 문서 plan이 추가된 새 policy hash로 조용히 바꾸지 않는다. host가 독립적으로 검토한 bound policy·source/capability/sourceBlock/manifest pins를 등록한다. 요청·캡처·모델 응답으로 승인 pin을 자동 생성하지 않는다. 고정 공개 합성 예제의 기대 지문은 서버용 fixture에 명시한다.
2. C2 전용 합성 정책 revision은 bound policy의 정확한 draft/sources를 C1 compiler에 제공한다. 기존 정책을 사용한 신청은 명시 policy-selection→C1 새 표시→새 SYNTHETIC_ACK_ONLY가 필요하다. 새 C2 전용 정책으로 처음 신청하는 경우도 C1 확인이 먼저다. 기존 확인 이력은 불변이다.
3. C1 preview와 `createReviewPreview`의 previewHash/displayHash는 서로 다른 DTO다. C2 document-preview에 실제 검토 기준·plan·sourceBundle·C1 확인 hash·Binding을 함께 표시하고 별도 SYNTHETIC_DOCUMENT_ACK_ONLY를 영속 기록한다. C1 확인을 문서 기준 확인이나 실제 동의로 가장하지 않는다.
4. 서버 전용 resolver는 매 호출/worker 완료/GET 결과에서 본인 신청·현재 C1 revision/ack·bound policy·document ack·source archive 원문/기한·plan pin을 확인한다. Binding·subject/recipient·policy/rule/plan/display/manifest/preview/sourceBundle·submission revision은 서버가 구성한다. body의 score/verified/PASS/actor/Binding/runContext/plan pin은 허용하지 않는다. 기존 C1 workflowRevision과 별도로 document head의 단조 workflowRevision을 두고 C1 revision/ack·source/plan 또는 제출 지문이 바뀌면 증가시킨다. expectedWorkflowRevision은 이 문서 head 버전이며 C1 버전도 DTO에 별도 표시한다.
5. RunContext.agreementHash는 C1 ack와 C2 document ack의 결합 지문이다. plan displayHash 및 review previewHash는 기존 AI adapter가 검증하는 정확한 값이고 C1 display/preview hash는 document ack에 별도 보존한다. 두 hash를 이름만 같게 치환하지 않는다.

## 최소 HTTP와 요청

모든 경로는 `/mvp/applications/:applicationId` 아래, participant 본인만(타인404/operator403), 기존 same-origin 세션·CSRF·Idempotency-Key를 적용한다. GET에는 CSRF를 요구하지 않되 세션/소유권을 검증한다. 기존 /mvp/student-operations 및 source operations와 별도다.

| 경로 | 입력 / 결과 |
| --- | --- |
| GET `/document-preview` | 서버의 현재 C1 revision/ack·Binding·검토 기준 DTO/지문·sourceBundle 및 합성/미확인 표시. 미준비면409 |
| POST `/document-agreement` | expectedWorkflowRevision, documentPreviewHash, acknowledgement=SYNTHETIC_DOCUMENT_ACK_ONLY. 정확한 표시 확인 append, actor/route/key operation 반환 |
| POST `/submissions` | expectedWorkflowRevision, expectedSubmissionRevision(최초0), documentAcknowledgmentHash, fixtureId, files[{postId,imageId,name,mediaType,base64}]. 정형 입력은 fixture registry와 정확히 대조. 실제 수신 bytes로 manifest/assetsHash·inputHash·새 server submissionId/revision 생성 |
| GET `/submissions` 및 `/submissions/:submissionId` | 본인 버전/manifest 지문·상태·rawAvailable/기한·이전 결과 stale. 파일명/텍스트/bytes·data URL은 반환하지 않음 |
| POST `/review-runs` | expectedWorkflowRevision, submissionId, expectedSubmissionRevision, 허용 method(CODE/TEXT_AI/VISION). 최신 resolver에서 context/attempt/runId 생성, 새 작업은 새 key. body 결과/pin 거부 |
| GET `/review-runs/:runId` | 현재 run/보류 이유·최소 ReviewSummary. old receipt는 immutable 이력이며 current=false일 때 현재 결과를 채우지 않음 |
| POST `/review-runs/:runId/cancel` | 빈 body. 본인·CSRF. RUNNING만 취소, 이미 수락한 receipt를 취소로 재작성하지 않음 |
| GET `/document-operations/:operationId` 및 `/document-operations/:kind/:key` | actor/route/key 복구. kind는 document-agreement/submissions/review-runs/cancel의 고정 allowlist. POST 자동 재호출·새 key 생성 없음 |
| DELETE `/submissions/:submissionId/raw` | 본인·CSRF 및 멱등 key. 보유 메모리 폐기/작업 중단. 제출/receipt/중복 방지 tombstone은 보존하며 다음 수락을 차단 |

정확한 JSON keys는 document-http-service의 exactKeys가 정본이며, 실행 합성 request 파일 document-http-fixtures.json과 검증 HTTPS 응답 document-http-responses.json을 같은 버전으로 제공한다. path/UUID를 body에서 대체하거나 임의 파일 경로를 받지 않는다. 문서 파일 다운로드/공개 blob·운영자 개인파일 조회 API는 제공하지 않는다.

## 파일·메모리·수명

- 첫 구현은 PNG/JPEG만, 최대4파일·각64KiB·합계256KiB·JSON body384KiB·수신10초다. 기존 공통 상한(8MiB/파일·32MiB/묶음)보다 좁은 HTTP 상한이다. base64는 canonical 형식/예상 decoded 길이를 할당 전에 확인하고 MIME과 실제 signature를 검사한다. filename은 제한 ASCII basename(1~80자, slash/backslash/NUL/점 경로·선행 점 거부), 같은 post/image ID·중복 filename·중복 파일 bytes를 거부한다. archive/압축·SVG/PDF·원격 URL은 받지 않는다.
- full image decode를 도입하지 않는다. width/height는 합성 fixture의 선언값이며 실제 decode 검증으로 표시하지 않는다. manifest.validation은 SIGNATURE_ONLY_NOT_DECODED, 이미지 파일이 있으면 method와 무관하게 HTTP 결과에 IMAGE_NOT_DECODED를 유지하며 전체 문서의 CHECKED 수락을 거부한다. 기존 adapter의 CODE 텍스트 검사 통과와 전체 이미지 판독 완료를 구분하고, C2 wrapper가 원 결과 지문·제약을 결합한 최소 summary를 만든다. 텍스트 전용 CODE의 CHECKED도 합성 사전검사일 뿐이다. metadata/hash 결합을 이미지 안전성·진위·전체 내용 판독 보장으로 승격하지 않는다.
- 업로드 바디 수신 슬롯은 전역2/actor1, decoded raw 합계1MiB를 넘기기 전에 거부한다. 수신 중의 encoded/parsed/owned/adapter 복사본도 이 작은 상한과 별도로 제한하며 무제한 대기열을 두지 않는다. 검증 전 임의 body를 DB/로그에 쓰지 않는다. 기존 handler는 body를 먼저 읽으므로 C2 전용 경로에서는 context/participant·소유권·CSRF 및 수신 슬롯 검사를 body 수신 **전**에 추가하고 close/timeout/오류에서 해제한다. 기존 auth/source/C1 경로의64KiB 상한을 전역으로 늘리지 않는다.
- 파일·게시글 텍스트는 임시 파일 없이 전용 프로세스 메모리에만 둔다. 학생 raw를 SQLite/파일/공개 정적 자산에 쓰지 않으므로 업로드 경로 traversal·symlink·부분 파일 rename/cleanup 대상 자체가 없다. 기존 새 전용 DB의0700/0600·NOFOLLOW·단일 hard link·환경 지문 검사는 유지한다. 파일 경로를 인자로 받는 재개 기능을 만들지 않는다.
- 소유 raw buffer는 접수 후 최대1800초, 검토 성공/실패/취소/logout·명시 삭제/대체·종료에서 즉시 폐기한다. 다중 method 검토는 해당 run이 소유한 복사본만 사용하고 run 간 파일 재사용을 보장하지 않는다. 새 run에 raw가 없으면 재제출을 요구한다. 정상 logout 경로는 document host의 세션 종료 hook으로 해당 actor의 대기/보유 raw를 즉시 폐기하며, adapter 완료 시 재인증으로 logout 이후 수락도 차단한다. 제한 타이머와 접근 시 TTL 검사를 모두 두며 프로세스 hard-kill 후 JS/OS 잔재 완전 삭제는 보장하지 않는다. base64/JSON 문자열·라이브러리 독립 복사본의 물리 지우기를 주장하지 않는다. 합성 fixture만 강제하는 개발 경계이며 실제 개인자료 수명 정책은 미확정이다.
- run은 공통300초 이하, worker timeout은30초 이하, 현재 단일 개발 listener의 잠금 아래 실행한다. 외부 분산 worker/다중 host는 지원하지 않는다. 새 context를 pin하기 전 모든 stale raw/run을 무효화하고 이전 결과가 새 revision 화면을 덮지 못하게 한다.

## 저장·원자성·재시작

새 `document-workflow` 디렉터리의 전용 command/submission/ack metadata DB와 기존 review ledger를 사용한다. C1 DB를 직접 SQL로 수정하지 않고 신뢰 내부 resolver를 통해 본인 상태만 읽는다. 저장값은 actor/route/key/requestHash, 불변 C1/C2 ack/plan/source/Binding 지문, submission ID/revision/manifest, run ID/contextHash/attempt, 최소 summary/reason/status/timestamps다. 원문 게시글 텍스트·파일명·base64/bytes·추출 이름/점수/quote·모델 raw·cookie/token/서명·provider error는 저장하지 않는다.

두 DB를 하나의 transaction인 것처럼 주장하지 않는다. command reservation에 안정적인 target/run ID와 request/context 지문을 먼저 저장하고 ledger pin/begin/complete의 불변 결과를 기록한 뒤 command를 확정한다. 같은 키는 같은 target을 가리킨다. completion 직전 세션/CSRF·현재 C1/C2/source/submission을 재검사하고 동기 CAS→ledger 수락 사이에 await를 넣지 않는다. 개발 host 잠금으로 타 worker의 병행 수락을 허용하지 않는다. 두 DB 사이 crash 경계를 구성한 합성 시험이 필수다.

GET 복구는 **이미 저장된** run/receipt만 화해하며 모델/업로드를 자동 재호출하지 않는다. 재시작 후 raw는 없다. 이미 ACCEPTED인 receipt는 같은 context/current 검사 후 재조회한다. 미시작 reservation/미완료 RUNNING은 INTERRUPTED(또는 기한 뒤 TIMED_OUT)로 보류하고 새 합성 파일 재제출·새 key retry를 요구한다. SQLite에 raw가 있다고 가정해 worker를 재개하지 않는다. 실패·취소·기한·logout 중 늦은 결과는 현재로 수락하지 않으며 소유 복사본을 정리한다. 모든 기록 시각/조회는 clock 역행을 fail closed한다.

새 submission은 revision을 증가시키고 이전 raw/run을 supersede한다. C1 policy-selection/비활성·동의/plan/source 변경·source 만료도 wrapper resolver가 ledger invalidation/current=false로 반영한다. ACCEPTED receipt는 수정하지 않고 최신 pointer만 바꾼다. actor/route/key tombstone은 지우지 않는다. command/submission/run 수 상한은 구현 config에 고정하며 상한 초과를 DB 초기화로 해결하지 않는다.

## 상태·오류·의미

상태: submission RECEIVED/RAW_UNAVAILABLE/SUPERSEDED/DELETED, run RUNNING/ACCEPTED/CANCELLED/TIMED_OUT/INTERRUPTED/SUPERSEDED. ReviewSummary는 기존 CHECKED/MISSING/NEEDS_REVIEW/UNREADABLE/POLICY_OPEN 및 REASON_CODES만 사용한다. IMAGE_NOT_DECODED·누락/충돌·원천 미확인·기준 OPEN은 값을 지어내 채우지 않고 보완으로 표시한다. ACCEPTED는 검토 요약의 단회 저장이다.

고정 오류: 기존401/403/404/409 IDEMPOTENCY_CONFLICT/MVP_STALE·422 MVP_CLOCK에 DOC_CONFIGURATION_REQUIRED, DOC_DISPLAY_CHANGED, DOC_SYNTHETIC_ONLY, DOC_MEDIA, DOC_FILE_NAME, DOC_FILE_SET, DOC_RAW_UNAVAILABLE, DOC_BUSY, DOC_LIMIT, DOC_CANCELLED를 추가한다. body size413, 수신 timeout408/고정 메시지, 입력422/현재상태409를 구분한다. 원본 filename/경로/내용·stack/provider 상세를 HTTP나 로그로 돌려주지 않는다.

운영 userConsentVerified/identityVerified/sourceVerified/policyPublished/productEligible/paymentAllowed=false. 예치/보관/배정/충전OPEN·자격재원분리·400%사전검토만/자동자격지급금지·500%제외·원천동일인보류·grant/outboxHOLD·독립claimNO_GO를 유지한다. 실제 정책 게시/실동의·개인자료/decode·운영 Evidence/M2/재원·화면 수용은 후속 관문이다.

## 수용 검사와 인계

새 합성 DB/TEST지갑으로 본인 접수→수신 bytes/hash manifest→CODE/mock TEXT_AI/VISION→누락/판독불가/충돌 이유→명시 보완 재제출→옛 run stale→단회 수락/같은키 GET/재시작 복구를 검증한다. 타 학생404/operator403, CSRF/Host/Origin/TLS, body권한 주입, plan/preview/C1 ack 변경, 중복/경로/MIME/크기/시간/병행·부분요청/취소/logout/late/TTL/restart 두DB 중간 상태 및 DB/로그의 raw 부재를 포함한다. 통과 검사 수를 중복 합산하지 않는다.

C2 실행은 새 합성 환경을 명시 생성하는 별도 개발 진입점을 사용하고 기존 var/source-demo·C1 환경/DB를 자동 변환하지 않는다. 새 환경에서도 loopback HTTPS9443과 기존 세션을 재사용하고 C2 host 설정이 없으면 capability=false다.

단일 `MVP_SOURCE_HTTP_HANDOFF.ko.md`에 exact backend SHA/PR·TLS9443/세션·별도 adapter·DTO/오류·capability/보완·stale/멱등/restart·미완료/Claude Code 지침을 갱신한다. 실제 web 연결은 담당자에게 사용자 경유로 인계한다. 이번 C2 PR은 develop 대상 Draft·attach·최종 CI/리뷰 준비까지만이며 자동 병합하지 않는다.


## 구현 검증·운영과 구분한 한계

구현은 별도 document-http-service/client, 제한 body 수신/세션 종료 hook, 전용 CLI와 서버용 example·고정 독립 pins·공개 합성 fixture/응답이다. C1/source/F0 DTO와 web/는 변경하지 않았다. 새 document-http.sqlite의 commands/ACK·submission 내용은 불변이며 raw 삭제 flag만 변경한다. 명시 raw 삭제는 현재 ledger를 invalidate해 이미 저장된 요약도 이력으로 둔다. 같은 raw를 다른 키로 다시 삭제해도 document revision을 재증가시키지 않는다.

관련309/309(이 단위 C2 HTTP21+TLS2+공통 client DELETE1 포함), 기존dev33/33·TLS demo 통과, 의존성/원본legacy191개/diff PASS. 최종 원격 head CI는 PR63 Checks를 정본으로 확인한다. 두 DB crash 검사는 새 합성 SQLite에 중간 상태를 구성한 것이며 실제 사용자 DB/강제종료 실측으로 주장하지 않는다.

정규 개발 CLI는 현재 시계를 사용한다. 공개 fixture 원문은 2026-10-15 00:00 UTC부터30일이며 만료 시 시작/조회가 차단된다. 갱신하려면 예제/독립 기대 pins를 새 버전 PR로 검토하며 자동 repin하지 않는다. 합성 TLS 데모/회귀는 고정 fixture 시계를 명시 주입하므로 날짜에 의존하지 않는 합성 재생이고 실제 원문 신선도 증거가 아니다. document policy/fixture/model 설정 지문 변경은 같은 DB를 자동 이관하지 않고 새 합성 환경을 요구한다. 일반 파일/실제 개인정보·완전 decode·실동의/정책 게시·운영Evidence/M2/재원·실화면은 미완료다.

수명 보완 코드 `24e75f2f467805162aac814c921f1c1c50bfd802`는 pending upload 슬롯에도 abort signal을 결합해 logout/종료·C1 기준 변경 시 수신을 중단한다. C1 idempotent ACK 재생으로 기준이 그대로면 raw를 폐기하지 않는다. 관련 회귀2개를 포함한 최종 로컬 합계는309/309다.
