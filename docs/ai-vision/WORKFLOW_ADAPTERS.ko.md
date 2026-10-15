# M3 AI 소비 adapter — 합성 모듈

통합 검토: 공통 PR #58 병합 `5f902dc38f5f050e7907f815d7e98b0d8d028aaf`를 이력 반영했다. 누적 응답 수신 예산 보정을 포함한 공통38개와 AI/정책 회귀를 함께 실행해308/308(실패·skip0), 새 합성 DB 호스트 연결·데모·mock7/7·binding 예제 byte 대조·workspace 보존이 통과했다. 실제 유료/모델/URL 호출은0이다. PR #57의 최종 head/CI·병합 상태는 GitHub PR을 따른다. 아래 최초 의존 이력과 구현 경계를 보존한다.

최초 기준 develop `4ae548b`(PR #54)와 공통 계약 `4018e32693efe990d70cef5f2524984efab5f977`·후속 `91430c6`·consumer export 동결 `48d211774d6c78bd2332738c500cc590264c1a48`을 정상 이력 반영한 의존 구현이다. 공통 `src/product-workflow`·API/DB/collector/정본문서/CI는 담당의 직접 수정 없이 의존 이력만 반영했다. #55/#39 연결 범위이며 계약 병합 상태는 공통 PR의 최신 기록을 따른다.

## 문서 bytes/run → 최소 ReviewSummary

`reviewWorkflowDocument({context,policy,submission,files}, mockAdapter, options)`는 신뢰한 호스트가 발급한 RunContext와 검토된 in-process bound policy를 받는다. context hash는 권한 증명이 아니다. 호스트가 신청/참가자·동의·최신 revision·run 발급 권한을 판단하고, 반환된 summary를 공통 ledger의 complete/CAS로 단회 수락한다. 이 adapter는 ledger를 직접 열거나 최신 상태를 추측하지 않는다.

실제 policy/rule/plan/display/reviewManifest/preview pin을 맞추고 `verifyDocumentManifest`로 post/image 순서·MIME·길이·원본 bytes SHA256을 검증한다. 기존 metadata inputHash는 `submissionDigest`로 유지하고 assetsHash를 별도로 결합한다. `toPrecheckContext`의 ruleVersion은 planVersion이다. CODE는 bound plan을 사용하며 TEXT_AI/VISION은 선언한 method/필드/prompt·modelVersion과 맞는 MOCK callback만 호출한다. ACTUAL observer는 호출 전에 거부한다.

mock 요청에는 정확한 원본 바이트의 adapter 소유 복사본과 assetsHash/runContextHash가 들어간다. callback이 복사본을 바꾸면 결과를 반환하지 않는다. 기존 post/image locator와 TEXT_AI의 정확한 UTF16 span/quote 검증을 유지하며 Gemini 평가의 L1/image row 같은 위치를 자동 변환하지 않는다.

반환은 공통 ReviewSummary의 version/runContextHash/resultHash/reviewStatus/outcome/reasons뿐이다. resultHash는 해당 context와 일시적인 검토 결과의 지문이며, DB 요약에 이름·점수·quote·원문·모델 raw 출력·파일명·URL·bytes를 넣지 않는다. field 이유가 32개를 넘으면 고정 전역 보완 사유로 축약한다. 요약에 담지 않는 원 관찰값을 보존하는 저장소를 이 모듈이 새로 만들지는 않는다.

현재 manifest 검사는 **SIGNATURE_ONLY_NOT_DECODED**다. Vision에 파일이 있으면 IMAGE_NOT_DECODED를 남기고 CHECKED를 허용하지 않는다. 이것은 OCR/완전 decode/진위 보장이 아니다. CODE의 문자수·제출 파일수 충족도 게시·작성자·자격·지급 검증이 아니다. 모든 권한 제한은 공통 GATES가 별도로 유지한다.

입력·context를 async 호출 전에 캡처한다. adapter 소유 원본/observer 복사본은 성공·오류·취소·timeout의 finally에서 zero-fill한다. 30초 이하 mock timeout을 사용하며, 관측된 작업시간이 공통 run 300초 또는 raw 30분 한도를 넘으면 TIMED_OUT으로 보류한다. 선택적 시험 clock `nowMs`는 밀리초이며 공통 source/ledger의 초 단위 now와 구분한다. caller 원본은 호스트가 폐기해야 한다. JS 문자열·GC, 외부 라이브러리가 따로 만든 복사본, abort를 무시하는 callback, 강제 종료 후 완전 삭제를 보장하지 않는다. 실제 디스크 업로드·개인자료 처리·외부 전송을 활성화하지 않는다.

호스트가 완료 직전 최신 context/취소/기한을 다시 확인해야 한다. adapter 반환 후 정책·제출이 바뀌거나 늦게 반환된 summary도 공통 CAS가 거부해야 하며, 기존 WeakMap ack/envelope를 직렬화해 복원하지 않는다.

## 시험과 남은 연결

전용 시험은 실제 byte 교체, callback의 임의 변환, 정책 pin/관찰 범위 불일치, ACTUAL 거부, 누락·판독불가·충돌·민감 출력 제거, 취소/timeout zero-fill, async 입력 변경과 벽시계 상한을 검사한다. 실제 공통 전용 합성 SQLite 호스트와 연결해 CODE summary 단회 수락·동일 재조회·다른 결과 거부·재시작 복구, 지연 Vision 결과의 최신 revision CAS 거부도 검사한다. 기존 application DB를 열거나 새 API를 추가하지 않는다.

## source bundle → 조건/필요 증거 초안

`proposeSourceBundle({bundle,expectedBundleHash,draft,sources,capabilities,runId}, lookup, options)`는 공통 resolveSourceBundle과 private store형 getSnapshot/getArtifact/getCurrentBundleHash/now(초)를 소비한다. URL fetch/링크 추적·별도 수집기·ledger를 만들지 않는다. source purpose는 POLICY_DRAFT이며 문서의 DOCUMENT_PRECHECK와 혼용하지 않는다. source run context 지문은 bundleHash·템플릿·독립 source/capability pin·prompt/model/관찰 필드와 runId를 묶는 일시적 지문이고 권한/영속 수락 증명이 아니다.

호스트의 M1 Source pin은 기관/상품/반/sourceId, capturedAt=collectedAt, rawHash=고유 RESPONSE_BODY.sha256, normalizedHash=지정 textArtifactId.sha256, normalizerVersion=extractionVersion, 정확한 text line locators와 일치해야 한다. Source origin/applicability를 합성으로 바꾸거나 모델/수집 결과에서 자동 repin하지 않는다. 원본 snapshotHash/bundleHash는 별도로 유지한다. sourceType PUBLIC_URL/PASTE/FILE와 revision·시각·범위·수집 요청별 상태를 provenance로 남기며 URL/원문은 공통 private 원본 저장소의 snapshotHash로 참조한다.

텍스트는 기존 엄격한 proposePolicy를 호출해 지원 템플릿 slot·원문 인용에만 근거한 OFFICIAL_DRAFT/OFFICIAL_OPEN 후보와 OPEN 질문을 만든다. 선택적인 model `evidenceNeeds`는 `{requirementId,fieldIds,grounds}` 배열이다. 기존 requirement의 허용 필드와 정확한 sourceId/locator/240자 이내 인용 포함을 검사하고 NEEDS_OPERATOR_REVIEW/sourceVerified=false의 필요 증거 초안으로만 반환한다. 원문 의미가 증거 요건을 지지하는지는 운영자 검토 대상이다. 없는 증거 형식·새 predicate·미수집 가이드 문구를 추정하지 않는다.

Vision은 지정한 fieldIds의 별도 MOCK 관찰이며 이미지 artifact locator/hash를 정확히 사용해야 한다. 이미지 관찰값을 M1의 텍스트 quote로 만들지 않는다. image-only는 draft=null/sources=[]/capabilities=null로 관찰·coverage만 반환하고 공식 규칙을 만들지 않는다. raw provider의 image row/L1 위치는 artifact locator로 자동 승격하지 않는다. 이미지 copy 변환/추가 필드/모델 권한 선언을 거부한다. IMAGE_NOT_DECODED·누락 텍스트·미실행 Vision·JS/필요 이미지/guide·resourceRequests FAILED는 별도의 coverage 보완 진단으로 남는다. 수집 완료도 진위/전체성/적용성/기관 승인/학생 동의가 아니다.

모델 전후 호스트의 최신 bundleHash와 끝 시점 원문 만료를 검사한다. 달라지면 proposal/evidenceNeeds/vision 관찰을 내보내지 않는다. 호출자 템플릿과 이미 확정/동의된 정책은 바꾸지 않는다. 읽은 범위는 정확한 line locator이며 64개 text block 범위나 소비 합계16MiB를 넘으면 조용히 잘라 PASS하지 않고 보류한다. 원문 lookup과 관찰의 전체 deadline은 최대30초이고 callback timeout도 최대30초다. adapter 소유 lookup/image/observer 복사본은 finally에서 zero-fill하며 종료 후 늦은 callback은 결과를 복구하지 않는다. 공통 resolver 내부 복사본·호스트 원본·외부 라이브러리/JS 문자열의 완전 삭제까지 보장하지 않는다.

원문 결과는 transient operator 검토 자료다. 문서 ReviewSummary와 달리 제한된 초안/인용/관찰을 포함하므로 무조건 workflow receipt DB에 저장하지 않는다. 실제 원문 전체를 Git/CI에 복사하지 않고 합성 fixture와 locator만 시험한다. source private store와의 통합 시험은 재수집 bundle 갱신 시 대기 초안이 stale 되는지 확인한다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/document-precheck/workflow-adapter.test.mjs
```

실제 HTTP/학생 UI·실동의·운영 업로드/decode·Evidence 수락은 미구현이다. 유료 호출은 0이며 기존 승인량을 재사용하지 않는다. 예치 정책 OPEN,400%사전검토만/500%제외,원천·동일인 미확인 보류,grant/outbox HOLD·독립claim NO-GO를 유지한다.
