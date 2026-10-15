# M3 AI 소비 adapter — 의존 Draft

기준 develop `4ae548b`(PR #54)와 공통 계약 `4018e32693efe990d70cef5f2524984efab5f977`을 정상 이력 반영한 의존 구현이다. 공통 `src/product-workflow`·API/DB/collector/정본문서/CI를 수정하지 않는다. #55/#39 연결 범위이며 신규 계약의 최종 commit·병합 상태는 해당 PR의 최신 기록을 따른다.

## 문서 bytes/run → 최소 ReviewSummary

`reviewWorkflowDocument({context,policy,submission,files}, mockAdapter, options)`는 신뢰한 호스트가 발급한 RunContext와 검토된 in-process bound policy를 받는다. context hash는 권한 증명이 아니다. 호스트가 신청/참가자·동의·최신 revision·run 발급 권한을 판단하고, 반환된 summary를 공통 ledger의 complete/CAS로 단회 수락한다. 이 adapter는 ledger를 직접 열거나 최신 상태를 추측하지 않는다.

실제 policy/rule/plan/display/reviewManifest/preview pin을 맞추고 `verifyDocumentManifest`로 post/image 순서·MIME·길이·원본 bytes SHA256을 검증한다. 기존 metadata inputHash는 `submissionDigest`로 유지하고 assetsHash를 별도로 결합한다. `toPrecheckContext`의 ruleVersion은 planVersion이다. CODE는 bound plan을 사용하며 TEXT_AI/VISION은 선언한 method/필드/prompt·modelVersion과 맞는 MOCK callback만 호출한다. ACTUAL observer는 호출 전에 거부한다.

mock 요청에는 정확한 원본 바이트의 adapter 소유 복사본과 assetsHash/runContextHash가 들어간다. callback이 복사본을 바꾸면 결과를 반환하지 않는다. 기존 post/image locator와 TEXT_AI의 정확한 UTF16 span/quote 검증을 유지하며 Gemini 평가의 L1/image row 같은 위치를 자동 변환하지 않는다.

반환은 공통 ReviewSummary의 version/runContextHash/resultHash/reviewStatus/outcome/reasons뿐이다. resultHash는 해당 context와 일시적인 검토 결과의 지문이며, DB 요약에 이름·점수·quote·원문·모델 raw 출력·파일명·URL·bytes를 넣지 않는다. field 이유가 32개를 넘으면 고정 전역 보완 사유로 축약한다. 요약에 담지 않는 원 관찰값을 보존하는 저장소를 이 모듈이 새로 만들지는 않는다.

현재 manifest 검사는 **SIGNATURE_ONLY_NOT_DECODED**다. Vision에 파일이 있으면 IMAGE_NOT_DECODED를 남기고 CHECKED를 허용하지 않는다. 이것은 OCR/완전 decode/진위 보장이 아니다. CODE의 문자수·제출 파일수 충족도 게시·작성자·자격·지급 검증이 아니다. 모든 권한 제한은 공통 GATES가 별도로 유지한다.

입력·context를 async 호출 전에 캡처한다. adapter 소유 원본/observer 복사본은 성공·오류·취소·timeout의 finally에서 zero-fill한다. 30초 이하 mock timeout을 사용하며, 관측된 작업시간이 공통 run 300초 또는 raw 30분 한도를 넘으면 TIMED_OUT으로 보류한다. 선택적 시험 clock `nowMs`는 밀리초이며 공통 source/ledger의 초 단위 now와 구분한다. caller 원본은 호스트가 폐기해야 한다. JS 문자열·GC, 외부 라이브러리가 따로 만든 복사본, abort를 무시하는 callback, 강제 종료 후 완전 삭제를 보장하지 않는다. 실제 디스크 업로드·개인자료 처리·외부 전송을 활성화하지 않는다.

호스트가 완료 직전 최신 context/취소/기한을 다시 확인해야 한다. adapter 반환 후 정책·제출이 바뀌거나 늦게 반환된 summary도 공통 CAS가 거부해야 하며, 기존 WeakMap ack/envelope를 직렬화해 복원하지 않는다.

## 시험과 남은 연결

전용 시험은 실제 byte 교체, callback의 임의 변환, 정책 pin/관찰 범위 불일치, ACTUAL 거부, 누락·충돌·민감 출력 제거, 취소/timeout zero-fill, async 입력 변경과 벽시계 상한을 검사한다. source-bundle adapter는 공통 후속 source pin bridge 계약 기준으로 추가하며 현재 문서 시험이 원문 연결 전체 완료를 뜻하지 않는다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/document-precheck/workflow-adapter.test.mjs
```

실제 HTTP/학생 UI·실동의·운영 업로드/decode·Evidence 수락은 미구현이다. 유료 호출은 0이며 기존 승인량을 재사용하지 않는다. 예치 정책 OPEN,400%사전검토만/500%제외,원천·동일인 미확인 보류,grant/outbox HOLD·독립claim NO-GO를 유지한다.
