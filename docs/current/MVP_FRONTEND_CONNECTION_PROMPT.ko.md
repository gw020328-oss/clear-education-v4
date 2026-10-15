# Claude Code용 C1/C2 프론트 연결 작업 지침

2026-10-15. 이 파일 전체를 프론트 작업 세션에 전달한다. 단일 진입점은 `docs/current/MVP_SOURCE_HTTP_HANDOFF.ko.md`이며 최신 병합 SHA/검증 기록도 그 문서를 우선한다. 이 지침 작성만으로 팀원 브랜치 수정·병합이나 실제 개인자료 사용을 승인한 것은 아니다.

## 읽는 순서와 소유 범위

1. 저장소 `AGENTS.md`, `docs/current/MVP_SOURCE_HTTP_HANDOFF.ko.md`의 맨 위 최신 상태와 C1·최신 C2 절, `docs/current/MVP_DOCUMENT_HTTP_CONTRACT.ko.md`를 읽는다. 과거 날짜의 미구현/Draft 기록보다 최신 절을 우선한다.
2. [PR60 리뷰](https://github.com/gw020328-oss/clear-education-v4/pull/60#pullrequestreview-5532163559)의 정책 오류 1~4, API/선택 규칙 5~6, UX·레퍼런스와 이번 지침을 함께 적용한다. 최신 PR60 head가 달라졌으면 자기 변경을 먼저 확인한다. 이 링크는 기존 리뷰 근거이며 백엔드 담당이 팀원에게 추가 연락했다는 뜻이 아니다.
3. 브라우저 전용 `src/application/wallet-client.mjs`, `src/application/api-client.mjs`, `src/product-workflow/student-http-client.mjs`, `src/product-workflow/document-http-client.mjs`의 공개 함수를 읽는다. 운영자 화면 연결 시에만 `src/product-workflow/http-client.mjs`를 추가한다.
4. `specs/m3/student-http-responses.json`, `specs/m3/document-http-responses.json`으로 응답 형태를 확인하고, `specs/m3/document-http-fixtures.json`에서 공개 합성 접수 입력만 소비한다. 예제 ID/주소/hash/시각을 현재 서버의 값으로 하드코딩하지 않는다. fixture JSON은 정적 API URL이 아니므로 프론트 빌드에 필요한 공개 샘플만 포함한다.
5. 의미가 불명확할 때 서버의 `src/product-workflow/student-http-service.mjs`, `document-http-service.mjs`, `src/application/http.mjs`를 읽기 전용으로 대조한다. `tests/product-workflow/document-http.test.mjs`, `document-https.test.mjs`는 경계의 실행 근거다.

`web/`, 지갑 UI, F0 adapter는 서준형 소유다. 자기 브랜치와 미커밋 변경을 보존하고 사용자 승인된 프론트 범위에서만 수정한다. 백엔드/정책/DB/금고/공통 client 계약을 임의로 바꾸지 않는다. 독립 청구 작업의 다른 작업본·소유 파일도 건드리지 않는다. API 의미가 부족하면 사용자 경유로 질문한다.

## 먼저 환경과 계약을 확인한다

- 최신 origin/develop에 인계 문서의 PR63 병합 커밋이 포함됐는지 확인한다. 포함되지 않았으면 백엔드가 가용하다고 가정하지 않는다. 자신의 변경은 보존하며 필요한 기반 반영은 정상 이력 병합으로 수행한다.
- 새 무가치 TEST 지갑 공개 주소와 새 환경 이름으로 `tools/mvp-document-dev.mjs`의 init/start를 사용한다. 명령 예시는 단일 인계의 최신 C2 실행 절을 따른다. 기존 source/C1 DB를 변환하거나 기존 사용자 DB/키/체인을 가져오지 않는다.
- `https://127.0.0.1:9443` 같은 출처에서 빌드된 화면과 API를 사용한다. `web/dist`가 없으면 API만 제공되며 자산은 시작 시 읽으므로 빌드 변경 뒤 정상 재시작한다. 별도 5173 CORS 우회·TLS 검증 해제·운영 배포를 하지 않는다. 신규 환경의 CA 신뢰는 사용자가 검토한다.
- `/__dev/config`에서 studentHttpVersion=`clear-mvp-student-http.1`, documentHttpVersion=`clear-mvp-document-http.1`, studentApplicationHttpImplemented/studentSubmissionHttpImplemented와 syntheticDocumentSubmissionReady를 확인한다. 이 값은 host의 기능 설치 여부이며 특정 신청이 준비됐다는 보장은 아니다. 신청의 document-preview와 응답의 current/capability도 검사한다.
- documentSubmissionReady/realDataAllowed/imageDecodeReady=false를 유지한다. 일반 source/C1 host는 C2 경로가 없으므로 404를 업로드 성공으로 처리하지 않는다. 체인/RPC/금고는 이 서버가 제공하지 않는다.
- 기존 walletClient의 nonce→서명→verify, 세션 재개/만료/logout을 재사용하고 그 request를 C1/C2 client에 주입한다. HttpOnly Secure SameSite 쿠키, x-wallet/x-chain-id, 쓰기의 x-csrf-token, 명시 Idempotency-Key를 사용한다. 서명 거절/계정·체인 변경 시 오래된 요청·표시를 무효화한다. 쿠키를 JavaScript에서 읽거나 CSRF를 임의로 만들지 않는다.

## 단계별 연결

### 1. 현재 신청과 정확한 C1 합성 확인

C1은 기존 F0 ApplicationView와 별도 DTO다. `policies()`→`create({policyHash})` 또는 본인 list/get→`preview(applicationId)` 순서로 연결한다. 정책은 서버 응답에서 고른다. 합성 C2 host의 정책은 `student-third-demo`, revision 2이며 정확한 hash는 서버 응답이 기준이다. 기존 정책 신청이 POLICY_CHANGED라면 사용자가 명시적으로 최신 정책을 선택한 뒤 새 표시를 확인한다. 자동 정책 선택·자동 ACK는 금지한다.

C1 preview의 조건·기한·계산 기준·예외/공제·미확정 내용을 표시하고 사용자 확인으로만 다음 body를 보낸다.

```js
{ expectedRevision: shown.expectedRevision,
  previewHash: shown.previewHash, acknowledgement: 'SYNTHETIC_ACK_ONLY' }
```

C1 displayHash는 표시 DTO 지문이고 previewHash는 신청/Binding/현재 revision을 포함하는 확인 지문이다. POST는 previewHash를 받는다. 숫자 초 단위 시각을 기존 F0의 문자열 시각으로 무조건 캐스팅하거나 같은 schema에 끼워 넣지 않는다. DRAFT/ACKNOWLEDGED_SYNTHETIC/POLICY_CHANGED/POLICY_UNAVAILABLE를 그대로 해석한다. ACKNOWLEDGED_SYNTHETIC은 실제 CONSENTED/ENROLLED가 아니다.

### 2. 별도 문서 기준과 두 번째 합성 확인

`documentClient.preview(applicationId)`의 documentRequirements, reviewPreview 전체 기준·제약, C1 확인과 연결 상태를 표시한다. C2 정책/원문이 준비되지 않으면 DOC_CONFIGURATION_REQUIRED 또는 SOURCE_EXPIRED로 보류한다. documentRequirements에 없는 성적·학습 조건을 완료 처리하지 않는다.

```js
{ expectedWorkflowRevision: shown.expectedWorkflowRevision,
  documentPreviewHash: shown.documentPreviewHash,
  acknowledgement: 'SYNTHETIC_DOCUMENT_ACK_ONLY' }
```

expectedWorkflowRevision은 C2 head이고 C1 expectedRevision/c1WorkflowRevision과 다르다. C2 documentPreviewHash, reviewPreview.previewHash 및 plan displayHash, C1 displayHash/previewHash는 각각 다른 값이다. 서버가 반환한 정확한 필드만 사용한다. ACK 결과의 documentAcknowledgmentHash는 다음 제출에 사용하며 C1 ACK나 임의 hash로 대체하지 않는다. 문서 확인 후 C2 revision이 증가하므로 preview를 다시 조회한다. 두 ACK 모두 합성 확인이며 실제 법적 동의·실명 증명이 아니다.

### 3. 공개 합성 파일 접수와 검토

실제 개인파일 선택 입력을 활성화하지 않는다. 공개 fixture JSON의 ready-text/missing/image/unreadable/conflict만 선택하게 하고 합성임을 표시한다. 텍스트/정형 내용은 서버 fixture가 제공하며 임의 텍스트를 요청에 추가하지 않는다.

```js
{ expectedWorkflowRevision: current.expectedWorkflowRevision,
  expectedSubmissionRevision: latestSubmissionRevision, // 최초 0, 이후 서버의 최신 제출 revision
  documentAcknowledgmentHash: ack.result.documentAcknowledgmentHash,
  fixtureId: selectedFixture.fixtureId, files: selectedFixture.files }
```

파일은 `{postId,imageId,name,mediaType,base64}`만 허용된다. 최대4개·각64KiB·총256KiB·JSON384KiB·수신10초, canonical base64와 제한 ASCII basename 1~80자이며 경로/중복 파일·이름/허용되지 않은 bytes·MIME는 거부된다. PNG/JPEG 형식을 지원하지만 현재 제공된 이미지 fixture는 PNG다. arbitrary PNG/JPEG 업로드 지원으로 표현하지 않는다.

접수 후 반환 submissionId/submissionRevision/workflowRevision을 사용해 아래 run을 시작한다. body에 PASS/score/verified/actor/Binding/context/plan/source pin을 추가하지 않는다.

```js
{ expectedWorkflowRevision: submitted.workflowRevision,
  submissionId: submitted.submissionId,
  expectedSubmissionRevision: submitted.submissionRevision,
  method: selectedSupportedMethod }
```

현재 CODE는 합성 텍스트 규칙 검사, TEXT_AI/VISION은 `mock-document.1` 고정 관측이다. 실제 Gemini/Claude/OpenAI 호출·OCR·전체 이미지 decode·진위 판정은 연결되지 않았다. 이미지가 있으면 method와 관계없이 IMAGE_NOT_DECODED 보류다. ready-text의 CHECKED도 합성 사전검사일 뿐이다. ACCEPTED는 최소 요약의 저장 완료이며 자격/재원/지급 승인이 아니다.

### 4. 결과·보완·복구

- run의 state와 summary.reviewStatus를 구분한다. RESERVED/RUNNING은 대기/실행, ACCEPTED는 저장 완료, CANCELLED/TIMED_OUT/INTERRUPTED/SUPERSEDED는 중단·만료·재시작·옛 기준이다. current=false의 summary는 null이며 과거 성공을 현재 결과로 복구하지 않는다.
- MISSING/UNREADABLE/NEEDS_REVIEW/POLICY_OPEN 및 MISSING_INPUT/UNREADABLE/CONFLICT/NEEDS_SUPPLEMENT/IMAGE_NOT_DECODED를 실제 서버의 고정 이유로 표시한다. 서버가 날짜 부족을 판정하지 않았는데 ‘작성일이 없다’고 꾸미지 않는다. 합성 이미지 판독 미지원은 그 제약을 안내한다.
- 보완은 사용자의 명시 제출→새 key/최신 revision→새 run이다. 새 요청 세대/신청/지갑을 대조해 늦은 응답이 새 화면을 덮지 못하게 한다. 기존 결과는 이력이다.
- POST/DELETE 응답 유실·network timeout은 성공/실패를 단정하지 않고 해당 operation 또는 actor/route/key GET으로 확인한다. C1 create/agreement/policy-selection과 C2 document-agreement/submissions/review-runs/cancel/delete의 복구 경로를 섞지 않는다. GET 404도 자동 POST 재전송 근거가 아니다. key를 새로 만들기 전 사용자가 새 시도를 선택해야 한다.
- 브라우저 요청 abort와 저장된 run 취소는 다르다. 명시 cancel은 빈 body, raw DELETE는 body 없이 CSRF/key로 호출한다. 이미 ACCEPTED인 receipt를 cancel 성공처럼 덮어쓰지 않는다. raw DELETE는 이력/멱등 tombstone을 지우지 않는다.
- raw는 1800초 상한·검토 종료/logout/취소/보완/삭제/종료에서 정리되고 만료는 진행 중 관측도 중단한다. rawAvailable=false이면 재제출이 필요하다. 서버 재시작은 저장된 receipt만 읽으며 미완료 작업은 INTERRUPTED로 남고 자동 파일/모델 재실행을 하지 않는다. 클라이언트도 자동 실행하지 않는다.

오류 분기: 401 재로그인,403 권한/CSRF/출처,404 없음/범위밖/미설치,409 stale·표시변경·설정/원본 미준비·busy/limit·키충돌,410 원문만료,413 크기,408 수신시간,422 파일/합성제한·시계오류. 상세 코드는 단일 인계 표를 따른다. 오류를 빈 목록·가짜 성공·mock fallback으로 숨기지 않는다.

## 정책과 UX

PR60 리뷰에 따라 정책 오류부터 수정하고 진행 현황·서류 보완 두 화면의 시안을 먼저 공유한다. 정보 배치 확인 후 다른 화면에 적용한다. 흰 배경·진한 본문·절제된 강조색·여백으로 현재 상태→확정 여부→다음 행동 하나→조건 목록을 우선한다. 토스 TDS의 Top/ListRow 위계와 GOV.UK Task list/Check answers 흐름을 참고하되 패키지 도입·프레임워크 교체를 요구하지 않는다. 주요 공제·제약을 확인 전에 숨기지 않는다.

400%는 PRECHECK_ONLY/서류 사전검토만, 자동 자격·지급 불가다. 500%는 제외한다. 예치율/보관율/배정/충전/회수는 OPEN이며 300% 또는 400% 최대액 전액 예치를 강제하지 않는다. 계산 예시/약정 금액 후보·자격 판정·재원 확보·배정·지급 가능 여부를 분리하고 UNKNOWN을 0원이나 지급 가능으로 바꾸지 않는다. 무가치 TEST와 가정 입력값을 표시한다. 시험 인정 기간과 자료 제출 기간은 원문/서버 정책 기준으로 구분한다. 합성 EXPLICIT_SINGLE_TIER_NO_TOPUP 선택과 단순 탐색 탭을 구분하며 공식 선택 규칙은 OPEN이다. 원천·동일인 미확인 보류, grant/outbox HOLD, independentClaim NO_GO, paymentAllowed=false를 유지한다.

## 수용 검사와 결과 보고

- 인증 거절·역할403/타인404·지갑/체인 변경·세션 만료/logout, 키보드·좁은 화면·로딩/없음/오류를 검사한다.
- C1 최초 신청/중복/명시 정책 변경·새 표시 ACK와 C2 별도 ACK를 검사한다. 다른 hash·오래된 revision을 성공으로 표시하지 않는다.
- 다섯 fixture, 파일 bytes 거부/제한, 이미지 판독 보류, 보완 후 옛 결과 stale, 중복 클릭·응답 유실 GET 복구, 명시 cancel/delete, raw TTL·재시작을 실제 합성 HTTPS에서 확인한다. mock 단위 시험과 서버 연결 시험 결과를 구분한다.
- server-only service/example/pins/DB/collector/Node 모듈·개인키·CA private key·원본을 번들에 포함하지 않는다. 파일/텍스트/base64·서명/token/CSRF/키·모델 원출력을 localStorage/sessionStorage/IndexedDB/service-worker cache/로그·오류수집에 저장하지 않는다. 허용한 공개 fixture 입력 외 민감 내용을 스냅샷에 넣지 않는다.
- 실제 Reclaim/YBM/Moodle/학교·유료 모델·실학생 자료·새 금고/issuer·main 배포는 켜지 않는다. 미구현 항목은 준비/보류로 남긴다. 완료 보고에는 정확 backend SHA, 자기 frontend SHA, 연결한 DTO/경로, 실행한 시험, 남은 미연결·제약을 기록한다.

## C3 후속 연결 추가 — 별도 Draft의 제공 범위 확인 후 적용

C2 PR63은 develop890ad93cfb3677c5b4107428095c6f0b15efa9a4에 병합됐다. 새 C3는 이슈65의 Draft 단위이므로 develop 가용성을 따로 확인한다. 위 C1/C2 범위·PR60 정책/UX 지침은 그대로 유지하며 C3 명령을 기존 F0/C2 DTO로 치환하지 않는다.

읽는 순서에 `docs/current/MVP_EVIDENCE_HTTP_CONTRACT.ko.md`→`src/product-workflow/evaluation-http-client.mjs`→`specs/m3/evaluation-http-responses.json`을 추가한다. YBM/시원스쿨 host fixture는 서버 전용이므로 example/pins 모듈을 번들에 넣지 않는다. `evaluation-preview.requirements[].fixtures`의 ID와 의미만 화면에 표시한다.

1. 별도 새 evaluation 개발 host의 version/합성 capability·profile·PUBLIC_SYNTHETIC_SCENARIO를 확인하고 C1 신청/정확 ACK를 연결한다. 이 환경은 C2 third-policy 문서 host와 다르며 임의 개인자료/검증 receipt 입력을 지원하지 않는다.
2. preview의 workflowRevision과 requirement.expectedEvidenceRevision을 사용해 `{expectedWorkflowRevision,expectedEvidenceRevision,fixtureId}`만 수락 요청한다. fixture-ready는 명시 공개 합성 assertion이며 실제 원천 인증이 아니다. review-unverified는 UNKNOWN을 유지하고 C2 CHECKED를 대체 입력으로 보내지 않는다.
3. 최신 preview의 tier별 계산·공식 선택 OPEN·합성 EXPLICIT_SINGLE_TIER_NO_TOPUP와 제한을 보여준 뒤 사용자의 명시 선택으로 `{expectedWorkflowRevision,selectionPreviewHash,tier,acknowledgement:'SYNTHETIC_SELECTION_ONLY'}`를 전송한다. C1/C2 표시 hash를 쓰지 않는다.
4. `{expectedWorkflowRevision}`로 평가하고 operation.result의 decisionId/current/result를 읽는다. M2 rules/tiers/quote/settlement/entitlement와 outer fundingStatus/gates를 구분한다. FINAL_SYNTHETIC도 실제 자격·배정·청구가 아니다. UNKNOWN/MISSING/보완 이유를 유지하고 임의 점수·확인 상태를 채우지 않는다.
5. 보완은 최신 preview와 새 key로 fixture 재수락→재평가한다. 같은 시험 정정과 다른 시험 교체 거부를 구분한다. 과거 result=null/historicalResult는 이력 영역에만 표시하고 늦은 응답이 현재 화면을 덮지 않게 한다. 정책/ACK 변경은 준비 불가이며 기존 증거 재수락을 자동 시도하지 않는다.
6. 합성 최종화는 보완 기한 뒤에만 현재 workflow/facts/selection revision을 확인하고 `SYNTHETIC_FINALIZATION_ONLY`로 명시 실행한다. 기한/시각은 브라우저가 바꾸지 않는다. 일반 CLI는 evidenceUntil 1시간 전부터 경과 시간을 재생하고 학습 종료/보완 종료까지 기다려야 한다. 빠른 합성 완주는 서버 시험 demo의 역할이며 UI 가짜 성공으로 대신하지 않는다.
7. 유실 응답은 evaluation-operations의 명령명/동일 key GET으로 복구한다. 목록 최근100 receipts/50 decisions는 전체 이력이 아니다. 새로고침/재시작은 저장 결과를 읽으며 POST/모델/평가를 자동 재실행하지 않는다. C3 cancel API는 없다.

수용 검사에 YBM 합성 보류→보완→후보/명시 최종화→재시작 동일 저장결과, 시원스쿨 OR·이력UNKNOWN·200/300 계산 후보·400 PRECHECK_ONLY·500 거부, 최초 시험 교체 거부/같은 시험 정정, 중복/응답유실·새 선택/정책 변경에 따른stale를 추가한다. 실제 Reclaim/Moodle/Vision 연결·프론트 사용성 완료로 표현하지 않는다. C3 파일/프론트 구현은 백엔드 담당이 대신 수정하지 않는다.
