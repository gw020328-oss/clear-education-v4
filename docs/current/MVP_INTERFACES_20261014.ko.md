# MVP 공통 인터페이스 초안

2026-10-15 [TEST 재원 실험 계약](TEST_FUNDING_LAB.ko.md)에서 PER_APPLICATION_TEST_ADAPTER의 고정 fixture/직접 거래 동의·충전 operation·전액 배정·단회 지급·확인 블록 조회를 구현한다. 별도 실험 ABI이며 제품 wire/DB/ABI나 PG 보관 어댑터로 채택한 것이 아니다. 기존 v4 API는 보존한다. 공통 금액은 약정/누적 충전/현재 확보/배정/현재 예약/부족/지급/회수를 구분한다.

H2 실행 결과: [검증 기록](history-intake-verification.json)에 새 실제 등록 문맥 증명·독립 검증·영속 접수/재개봉 성공과 빈 계정 응답 미지원/UNKNOWN을 분리했다. 로컬 모듈 연결은 완료했고 웹/기관 동의·원천 완전성/동일인·자격/지급은 미완료다. 검토 PR: [#33](https://github.com/gw020328-oss/clear-education-v4/pull/33), [#34](https://github.com/gw020328-oss/clear-education-v4/pull/34), [#35](https://github.com/gw020328-oss/clear-education-v4/pull/35).

2026-10-14 H2 승인 후속: [등록 접수·원천 경계](HISTORY_INTAKE.ko.md)에 변경점과 단위별 완료 기준을 정의한다. H2a 원천 범위 검토 → H2b 영속 단회 접수 → H2c 수집기 연결 순서다. 실제 미확인 전체성/실명/공식 기간은 UNKNOWN이고 기존 지급·Moodle·400%·NO-GO 차단을 유지한다. H1 합성과 기존 HTTP/DB를 바꾸지 않는 별도 로컬 접수 경계다.

2026-10-14 H1 후속: [등록 이력 → 목표 성적 계약](EXAM_LIFECYCLE.ko.md)의 합성 전용 스키마·검증·메모리 영수증을 추가했다. PR #32의 실제 표 공증 보고와 전체성/신청자 결합 미완료를 구분한다. 기존 M0 명세 전용 범위는 유지하고 H1만 별도 실행 가능한 합성 단위다. 실제 수집 통합·영구 보존·제품 자격/지급은 미구현이며 기존 차단을 유지한다.


2026-10-14 M0 추가: [합성 계약](M0_CONTRACT.ko.md)·[결정/미결 질문](M0_DECISIONS.ko.md)·[프런트 시작 문서](FRONTEND_M0_HANDOFF.ko.md)를 우선한다. 첫 mock의 필드·예제는 FIXED_FOR_M0_FIXTURES이며 소비자 합의는 PENDING이다. 아래 넓은 설계의 wire/ABI·실제 조건은 여전히 미동결이다. 제품 기능과 M1 이후 구현은 포함하지 않으며 실제 Moodle·원천 검증 차단, grant/outbox 보류, 독립 청구 NO-GO를 유지한다.

버전 `mvp-interface.20261014.draft.2`, 상태 **DRAFT_INTERFACE / NOT_IMPLEMENTED / NOT_FROZEN**. 기준 develop `6d941a1fe0669b89730da1472d23ecd7caab22f4`. [정본 PRD](MVP_PRD_20261014.ko.md)의 설계 계약이며 [현재 API](API_CONTRACT.ko.md)·DB schema 4·EIP-712 V4를 변경하지 않는다. 아래 타입/명령은 제안이며 호출 가능한 새 API가 아니다. 이름·wire encoding·limits·서명/ABI는 freeze 관문에서 확정한다.

## 버전과 값의 규칙

모든 객체는 `schemaVersion`, `recordId`, `revision`, `createdAt`, `dataMode`를 갖고 알 수 없는 필드를 거부한다. `dataMode`는 증거별 `SYNTHETIC / LOCAL_LAB / LIVE_SOURCE`로 분리하며 서버가 검증 경로에서 결정한다. LIVE_SOURCE는 자격/지급 허가가 아니다. 한 신청의 서로 다른 모드가 섞이면 화면과 평가 결과에 모두 표시하고 live 판정으로 승격하지 않는다.

ID·지문은 canonical serialization/정규화/도메인 분리를 버전으로 고정한다. 금액은 토큰 최소 단위의 10진 문자열, 비율은 정수 분수 또는 bps와 반올림 방식, 시간은 UTC 초, 달력일은 IANA timezone과 `[start,end]` 또는 `[start,end)` 경계를 함께 가진다. 부동소수점 금액·암묵적 로컬 시간·단위 없는 비율은 거부한다. 한도(파일 크기·페이지·행·정책 깊이·노드·배치 수)와 오류코드는 구현 PR 전에 고정해야 하며 모델이 고를 수 없다.

## 정책·원문·동의

| 객체 | 필수 결합/내용 | 권한과 검증 |
| --- | --- | --- |
| SourceDocument | sourceId, institution/product/cohort, URL, retrievedAt, contentHash, sourceVersion, normalizedContentHash/normalizerVersion, textBlock/span 또는 table 행·열·header locator, 적용 기간·문서 역할 | 수집 서버가 지문 생성. 댓글/PII 제외, 새 원문은 새 버전. 공개 저장소에 HTML 전체 복제 안 함 |
| PolicyDraft | draftId/revision, sourceSetHash, AST, evidenceRequirements, amountRule, deadlines, unresolvedQuestions, unsupportedRules, modelRunId | 모델은 초안만. 운영자 수정도 근거/가정/사유를 기록. 누락 source locator는 게시 차단 |
| PolicyVersion | policyId/version/hash, compilerVersion, evaluatorVersion, trustProfileHash, AST, sourceSetHash, amountRule, deadlines, publicationMode | `DRAFT→REVIEWED→COMPILED→PUBLISHED_DEMO` 또는 별도 관문 뒤 `PUBLISHED_EXECUTABLE`. 기존 버전 내용 변경 금지 |
| ApplicationAgreement | applicationId, participantWallet, recipient, policyHash/version, selectedRoute 또는 허용 경로 집합, amountInputCommitment, amountRuleHash, termsHash, chain/instance/contract profile, consentDigest/nonce/expiry | 학생 동의와 게시된 정책 정확히 대조. 계정 인증과 정책 동의, proof owner 위임은 별도. 기존 V4 서명 재사용 안 함 |

SourceDocument의 raw 지문과 모델에 실제 제공한 정제본 지문은 별도로 남긴다. 표의 행/열 관계를 보존하고 근거 위치의 범위 유효성과 의미 지지를 각각 검사한다. 최신 날짜라는 이유만으로 추가 공지를 자동 우선하지 않는다. 모델 실행 버전은 추출 이력에 남기되 동일 실행 정책을 매 관찰 호출마다 새 정책으로 만들지 않는다.

정책 AST는 `ALL(children)`, `ANY(children)`, 타입이 정해진 `RULE(ruleId, metric, operator, expected, evidenceRequirementId, periodId, sourceRefs)`로 제한한다. 임의 JavaScript/문자열 식 실행은 없다. ANY 안의 경로를 각각 완결된 ALL로 만든다. 공통 조건은 경로 밖 ALL에 둔다. 순환·빈 ALL/ANY·중복 ruleId·알 수 없는 연산·모순 기간·조건과 무관한 필수 파일은 컴파일 실패다.

기간은 최소 `enrollment`, `learning`, `eligibleExam`, `historyCoverage`, `submission`, `supplement`, `allocation`, `claim`을 구분한다. 학습 시작 기준(결제/첫 수강 등), 마지막 인정일 포함 여부, 보완 가능한 항목, 기한 경계와 서버/체인 시계 차이는 정책에 명시한다. 기존 T+3/T+10을 새 학원 규정으로 자동 복사하지 않는다. 실제 성적 날짜를 바꾸는 대신 인정 기간 밖 결과를 그대로 보여준다.

금액 규칙은 `currency/token/decimals`, 근거가 고정된 기준액 입력, 할인·교재비 등 공제 항목, 세금/수수료 적용 순서, 정수 반올림, 상/하한을 포함한다. 어떤 항목이 적용되는지는 원문에서 확정한다. 예시 산식은 타입 구조 설명일 뿐 공식 환급액이 아니다. null 수수료/기준액, 음수·초과 공제·0 지급액은 지급용 컴파일을 거부하는 MVP 제안이며 값이 불명확하면 질문한다. 계산된 `entitlementAmount`와 입력 지문을 동의/판정/배정에 결합한다. 서버가 임의 금액을 체인에 제출할 수 있는 신뢰는 감추지 않는다.

학생이 경로를 사전 선택해야 하는지는 원문 확인 항목이다. 미선택 허용 정책은 통과한 경로 ID를 판정 결과에 고정하고 두 경로 중복 지급을 금지한다. 사전 선택 필수 정책은 학생 동의에 경로를 고정한다. 정책이 허용하지 않은 경로 변경은 새 동의 없이 하지 않는다.

## 증거와 평가

| 객체 | 최소 필드 | 수락 규칙 |
| --- | --- | --- |
| EvidenceRequirement | requirementId, acceptedKinds, ruleIds, subjectBinding, sourceTrustProfile, period, freshness, requiredAuthenticity, requiredCompleteness, permittedReviewAuthority | 필요한 필드와 보증 수준은 정책이 결정. 모델/업로더가 낮출 수 없음 |
| EvidenceEnvelope | evidenceId/revision, applicationId, policyHash, requirementId, subjectBindingId, sourceId/version, sourcePolicyHash, observedAt, coveredPeriod, payloadCommitment, verifierVersion, dataMode | 별도 인증된 검증기만 VERIFIED 기록. caller의 verified/complete/pass를 신뢰하지 않음 |
| EvidenceAssertions | binding, authenticity, completeness, freshness, integrity 각각 `VERIFIED / UNVERIFIED / REJECTED / NOT_REQUIRED`, reasons, verifier run reference | NOT_REQUIRED는 정책상 필요 없다는 뜻만. completeness에는 범위/목록/페이지/종료 근거가 필요 |
| EligibilityDecision | decisionId/revision, applicationId, policyHash, evaluationProfileHash, evidenceSetHash/revisions, selectedRoute, ruleResults, entitlementAmount, decisionStatus, finalizationStatus/correctionUntil, reasons, evaluatedAt | 결정적 평가기 결과. 서명/체인 제출 가능 여부는 별도. 원천 변경이면 새 평가 revision |

각 RULE은 `MET / NOT_MET / UNKNOWN`이다. ALL은 모두 MET일 때 MET, NOT_MET이 하나라도 있으면 NOT_MET, 나머지는 UNKNOWN이다. ANY는 완결된 한 경로가 MET일 때 MET이다. 충분히 검증된 모든 대안이 NOT_MET이면 NOT_MET, 통과 대안 없이 UNKNOWN이 있으면 UNKNOWN이다. 잘못된 주체·정책 결합, 공통 또는 선택 경로의 필수 진위/완전성 미확인 및 상충 자료는 선행 검증에서 `ON_HOLD`로 차단한다. 논리식의 false 단락 평가가 누락 검사를 숨기지 않게 사유를 모두 보존한다. 정책 위반을 확정할 자료가 없으면 ‘조건 미충족’으로 단정하지 않는다.

`decisionStatus`는 `COLLECTING / NEEDS_SUPPLEMENT / ON_HOLD / NOT_MET / ELIGIBLE`이며 재원 상태를 포함하지 않는다. 학습기간 진행 중의 하위 결과 IN_PROGRESS는 COLLECTING으로 표시하고 미래 날짜를 결석 처리하지 않는다. finalizationStatus는 PROVISIONAL/FINAL이며 정정 기간·원천 revision·이의 범위가 고정되기 전 자격 결과는 PROVISIONAL이다. 배정에는 ELIGIBLE+FINAL만 허용한다. ELIGIBLE이라도 합성 결정은 live 입력으로 사용하지 못한다. 판정 정정은 배정 전 finalization의 freshness·정정 절차와 연결한다. 이미 확정·배정한 권리에 매번 새 원천 서명을 요구하거나 모델 재실행으로 취소하지 않는다. 확정 후 원천 오류/사기는 별도 분쟁 문제로 기록하며 지급을 없던 일로 만들지 않는다. 지속적인 사후 취소가 필수인 상품은 이 불변 예약 모델과 충돌하므로 해결 전 NO-GO다.

### Reclaim와 전체 이력

단일 시험 존재용 증거는 동일 원천 행의 시험 종류/일자/점수/유효 상태와 신청자/owner 결합을 검증한다. `EXISTS_QUALIFYING_EXAM`, `HIGHEST_IN_PERIOD`, `NO_EXAM_IN_PERIOD`, `NO_SCORE_ABOVE_IN_PERIOD`는 서로 다른 조건이다. 존재 증거만으로 나머지 세 조건을 승인하지 않는다. 최고점/부재는 원천이 보증한 계정·기간·시험 상태 범위, 페이지 전부, 종료/건수, 정정·취소 정보가 필요하다. 기존 B2a는 이 부분의 합성 경계이며 실제 원천 보증은 계속 BLOCKED다.

[과거 이력 근거 보강](EXAM_HISTORY_REQUIREMENTS.ko.md)에 따라 YBM/Reclaim 계정 전체 조회의 후보를 먼저 조사한다. 원천 전체성이 확인된 단일 서버 응답의 공증 또는 동일 계정/기간/스냅샷에 결합된 모든 페이지가 후보이며, 별도 서명 manifest API의 부재만으로 불가능하다고 단정하지 않는다. 클라이언트 complete/count/hash는 원천 보증을 대체하지 않는다. 현행 2개 증거 쌍은 전체 이력/무응시 검증이 아니며 실제 검증 전 차단한다. Moodle의 별도 export 요건은 유지한다.

사업별 중복키는 동일 원천 시험의 재발급·다른 지갑·신청에서도 안정적이어야 한다. 신청 ID/발급시각으로 키를 바꿔 재사용을 허용하지 않는다. 개인식별값의 단순 공개 hash를 쓰지 않는다. PR #21의 로컬 native OPRF 결과를 공식 hosted 제품 증거로 사용하지 않는다. trustProfile에는 witness/verifier 배포 지문·epoch/키 정책·원천 parser revision을 pin하고 알 수 없는 변경은 보류한다.

H1의 별도 `LifecycleSession/Submission/Receipt/Evaluation`은 [계약](EXAM_LIFECYCLE.ko.md)의 목적/정책/참가자/수령인·기간·세션 결합을 따른다. 기존 Evidence.validUntil을 baseline의 영구적인 사후 평가 TTL로 해석하지 않는다. 수집 시 신선도와 보존 영수증의 무결성/revision 확인은 별도다. 새 HTTP/DB·기존 Evidence 자동 변환은 미구현이다.

### Moodle 일별 기록

`LearningRecord` 제안 필드: institutionId/courseId/moduleId/contentVersion, subjectBindingId, policyHash, sourceRecordId/revision, observedAt, durationMs, effectiveMs, mediaCoveredMs, lastPositionMs, providerProgressBps/progressRuleVersion, speedCompliance, normalCloseAcknowledged/closedAt, creditedDay/timezone, correctionStatus. ‘시간’, ‘영상 구간’, ‘활동 완료율’, ‘일별 출석’을 상호 대체하지 않는다. 진도율 분모/분자·중복 구간 처리와 일별 인정 규칙은 원천 계약에 고정한다.

계정 연결은 인증된 Moodle 사용자와 학생의 신청을 연결한 별도 절차다. 브라우저가 임의로 제출한 userId를 허용하지 않는다. 실험 `local_clearwatch_read`는 토큰 주체의 `$USER` 기록을 읽으므로 운영자 토큰에 임의 학생 ID를 붙이는 방식으로 전환하지 않는다. 읽기 권한/동의/토큰 보관 및 기관 매핑은 제품 연결 전 관문이다.

한 날짜의 여러 강의는 정책에 따라 일수 1일로 집계하며 이미 인정된 강의를 다시 열어 새 날짜를 만들지 않는다. lastaccess·마지막 수정시각을 출석일로 추정하지 않는다. 누락일은 전체 조회가 검증된 경우에만 미충족, 조회 실패/페이지 불완전/정정 중은 보류다. 출처 revision이 바뀌면 재평가하되 중복 적립하지 않는다. `humanAttentionProven=false`, 원천 단독 `paymentAuthorized=false`를 유지한다. 세부 명세는 담당 검토와 freeze 때 확정한다.

### 제출 파일·Vision

후기/블로그의 상세 정본은 [REVIEW_PRECHECK](REVIEW_PRECHECK.ko.md)다. 새 ReviewRuleCheckDraft 필드는 문서 제안이며 현재 HTTP/schema에 전송하지 않는다. 현행 5장 제한으로 글당 8장/14글을 처리할 수 없으므로 글 단위 묶음·전체 자원/비용 한도를 별도 버전에서 확정해야 한다. 실제 WORD 양식 필드 미확인을 DOCX 지원으로 해결했다고 하지 않는다.

`DocumentSubmission`: applicationId/policyHash/requirementId/documentType, fileId/revision, privateFileHash, mimeType, size, pageCount, submittedAt, dataMode. 제출 파일/파일 지문은 공개 체인에 올리지 않는다. 허용 파일형식·size/page 제한, 격리·저장/삭제·접근권한을 구현 전에 고정한다. 모델이 URL을 임의로 fetch하거나 파일 내 코드를 실행하지 않는다. 첫 합성 업로드는 PNG/JPEG 후보이며 공식 제출 형식이 아니다. 8MiB/20MP/5장/decode 30초는 담당의 시험 전 상한 제안으로, freeze 때 메모리/비용 검증 후 확정한다. magic bytes·실제 decode·위장 MIME·회전/리사이즈·EXIF 제거를 검사하고 원본/모델입력 지문과 표시 좌표 변환을 연결한다. 기존 JSON 64KiB API에 이미지 base64를 밀어 넣지 않으며 업로드 권한·비공개 저장·클라우드 전송 동의/보존/삭제는 별도 API 설계 대상이다.

`VisionObservation`: submission binding, modelRunId/model/version/promptVersion, executionMode(`MOCK / ACTUAL_MODEL`), fieldSchemaVersion, fields[{name,value|null,readStatus,sourcePage,bbox}], extractionReasons. bbox는 원본 좌표계/정규화 단위를 명시하고 범위·페이지·입력 지문을 검증한다. 근거 좌표가 유효해도 내용 정확성은 평가해야 한다. 이름 유사도를 동일인 판정으로 사용하지 않는다.

`DocumentPrecheck`: observationHash, rulesVersion, `PRECHECK_REQUIREMENTS_MET / NEEDS_SUPPLEMENT / UNDETERMINED`, reasonCodes, fieldResults. `MISSING_DOCUMENT / MISSING_FIELD / UNREADABLE / MISMATCH / INCOMPLETE_HISTORY / AUTHENTICITY_UNVERIFIED`를 분리한다. 최종 EvidenceAssertions의 진위/완전성은 Vision이 VERIFIED로 바꾸지 못한다. 미제출은 모델 호출 없이 처리, timeout/오류/비정상 JSON/모델 버전 불일치는 UNDETERMINED다. 재제출은 새 revision이며 늦게 도착한 과거 분석은 현재 결과를 덮지 않는다. job binding에는 routeSelectionRevision도 포함한다. QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED는 검토 outcome과 별개이며 성공한 job도 UNDETERMINED일 수 있다. 같은 학생/신청/제출 revision/requirement/extractor profile/멱등키는 같은 job, 다른 입력은 conflict다. 학생 간 파일 hash cache를 공유하지 않는다. 모델 응답 유실은 먼저 job을 조회하고 중복 유료 호출하지 않는다. 재시도 횟수/비용 상한은 freeze 전에 정한다. 사용자 수동 수정은 별도 주장으로 남기며 원본 관찰값·검증값을 덮지 않는다.

학습 account binding은 PROPOSED→VERIFIED→REVOKED 및 독립 version을 갖는다. 변경/해제는 진행 중 취득을 중단하고 과거 evidence를 새 주체로 재해석하지 않는다. source registry의 HTTPS origin/함수/method·응답 크기·timeout을 고정하고 redirect/응답 URL을 따라가지 않는다. Moodle read의 이중 JSON decode를 bounded schema로 검사한다. read-only 취득은 exchange/begin을 호출하지 않아 학생의 재생 세션을 끊지 않는다.

현재 local_clearwatch_read에는 원천 sourceRevision/일관된 manifest·pages·전체 기간 보증·공식 progress·속도 준수 요약이 없다. 반복 read가 같거나 수집자가 hash를 계산했다는 이유로 COMPLETE/sourceRevision을 만들지 않는다. 새 source export는 독립 pin된 inventory와 current revision, coverage/observedAt/validUntil, page hash/offset/count/terminal 및 명시적 NO_RECORD·NOT_CREDITED·UNAVAILABLE/UNKNOWN을 제공해야 한다. 앞뒤 manifest 재확인은 원천의 snapshot/변경탐지 보증을 보조하며 이를 대신하지 않는다. 부분 실패/숨김/삭제를 0시간·미출석으로 보정하지 않는다.

LearningRecord에는 providerInstanceId, allowed/excluded/required activity inventory와 mappingVersion, mediaVersion/sourceRuleVersion, sourceRecordRef/recordRevision, effectiveMs/mediaCoveredMs/lastPositionMs, providerProgressBps/meaningVersion, speedCompliance를 분리한다. 응답에 없는 기관/course/subject는 독립 registry/인증 주체에서만 채운다. 실험 activity policyHash는 제품 policyHash와 다른 지문이므로 명시적 매핑을 검증한다. closedAtMs=0/빈 creditDay는 null/미확정으로 변환하고 초·밀리초/반올림을 버전화한다. 허용 강의 전체가 필수 완강 목록은 아니며 모의시험은 별도 필수 evidence다.

학습 날짜 집합은 정책의 시작일·timezone·N일 달력에서 만들고 endExclusive를 고정한다. 86400초×N으로 로컬 날짜를 대체하지 않는다. 유효시간 90%·진도60%·배속1.4 등의 원문 대조값도 해당 기관의 필드 의미·초단위 절삭/혼합배속·종료/교차일 처리와 매핑 확정 전 실정책으로 활성화하지 않는다. coverage/duration을 공식 진도로 생성하지 않는다.

## 재원과 청구의 상태 및 불변식

**신규 계약 설계 후보**다. 현 `CourseRefundVaultV4` 변경 또는 실자금 권리 변경이 아니다. 이번 TEST 어댑터는 신청별 전용 재원으로 공용 풀 경쟁을 제외한다. 상용 구조·PG 보관·배정 순서·전용 허용은 미정이다. fundingReference는 등록 시 고정한 chain/instance/token/contract와 신청을 가리킨다.

| funding 상태 / 명령 | 전제·전이 | 취소/재시도·불변식 |
| --- | --- | --- |
| UNFUNDED→PARTIAL / topUp(applicationId, amount) | 고정 sponsor가 신청별 잔액 증가. allocationUntil 이내 실제 수령액을 검증 | PARTIAL은 청구 불가. 재시도 전에 tx receipt/이벤트 확인. 같은 tx를 DB에 중복 반영하지 않음 |
| UNFUNDED/PARTIAL→FUNDED / topUp | 전액 이상 확인. 초과액은 unallocated로 분리 | 자격이 없어도 단순 충전 기록은 가능. FUNDED는 배정/청구 가능 아님 |
| FUNDED→ALLOCATED / allocate | 고정 검증기의 ELIGIBLE+FINAL 검증, 기한, entitlementAmount 정확히 일치, 전액 전용 예약을 한 거래에서 확인 | 같은 allocation 동일 내용은 멱등, 다른 금액/정책/수취인은 거부. 두 allocation 경쟁은 하나만 성공 |
| ALLOCATED→PAID / claim | 신청 미지급·유효 기한·검증된 claim authorization 및 전체 금액 존재 | 누구나 전달 가능한 relayer 후보라도 고정 recipient만 수령. 재진입·중복/다른 신청 재사용 거부. 상태와 전액 송금 원자적 |
| UNFUNDED/PARTIAL/FUNDED→CANCELLED | 배정 전 취소 규칙이 약정에 고정되어 있을 때만. 제안: 학생의 명시적 취소 동의 또는 만료 | sponsor 임의 취소로 이미 배정된 권리를 제거하지 않음. 취소 중 충전/배정 경쟁도 한 terminal 결과로 직렬화 |
| 미배정 잔액 회수 | allocationUntil 이후 또는 학생이 약정에 따라 명시 취소한 뒤 고정 refundRecipient로 미배정 잔액만 회수하는 후보 | 총 잔액에서 reserved를 뺀 한도. 재원 약속이 보증되지 않는다는 사실 표시. allocationUntil 이전 sponsor 임의 출금은 금지하는 후보를 채택해 배정 직전 회수를 막음. 실제 약정은 freeze 때 확정 |
| ALLOCATED→RECLAIMED | 제안: `chainTime > claimUntil`에서 sponsor가 미지급 예약액 회수 | `chainTime <= claimUntil` claim과 경계가 겹치지 않음. 지급 후/다른 신청 회수 거부 |
| 미배정 기한 종료→EXPIRED | allocationUntil까지 전액 미확보/배정 실패 | 자격은 ELIGIBLE일 수 있으나 청구 불가. 자동 연장/부분 지급/다른 신청 전용 없음. 미지급 사유 기록 |

`CLAIM_PENDING / TX_UNKNOWN / REORG_PENDING`은 관측 상태이며 체인 PAID와 다르다. 제출 시간 대신 고정 confirmation 정책과 blockHash를 확인한다. 재조직으로 사라진 이벤트는 완료를 되돌려 재조회하며 중복 송금 대신 동일 신청의 체인 상태부터 확인한다. 실패한 토큰 전송은 정산 상태까지 rollback되어야 한다. fee-on-transfer/rebasing 등 지원하지 않는 토큰은 거부하고 MVP는 지정 TEST 토큰에 한정한다.

항상 `contractBalance >= sum(reserved)`, 신청별 예약은 `0 또는 entitlementAmount`, PAID와 RECLAIMED는 상호배타, 한 신청의 성공 지급 횟수는 최대 1이다. 부족 충전/취소/회수로 기존 예약을 줄이지 않는다. 학생 수령인 변경은 MVP에서 미지원이며 새 약정/권리 정리 설계가 필요하다. 배정 이후 증거 오류/철회에 관리자 임의 동결권을 새로 만들지 않는다. finalization/정정 의미와 원천의 보증을 freeze에서 맞추지 못하면 제품 claim을 열지 않는다.

allocate(applicationId)는 유효한 자격 자료를 가진 누구나 호출 가능하게 하는 목표다. 운영자가 대상/금액을 고르는 allocation 서명은 추가 지급 승인권이므로 독립 청구 조건을 충족하지 않는다. claim은 relayer 없이도 호출 가능해야 한다. 다만 sponsor가 아직 입금하지 않은 재원을 조달할 의무/보장을 체인이 만들어내지는 않는다. 동의에 fundingNotGuaranteedBeforeReservation을 명시한다. 같은 사업의 새 계약·지갑/OPRF 키 회전으로 spent 범위를 초기화하지 않으며 검증된 자격의 예약과 reuse lock은 원자 처리한다. 임의 nullifier 선점은 거부한다. 만료 미지급 예약의 재신청/시험 재사용 정책은 별도 미확정으로 두며 자동 unlock하지 않는다.

기한 후보는 evidenceSubmitUntil≤supplementUntil≤eligibilityFinalizeUntil≤allocationUntil≤claimUntil−minClaimWindow다. 실제 길이·동등 경계는 원문/약정 검토 후 확정한다. minClaimWindow 없이 마지막 순간 배정해 청구 기회를 없애지 않는다. 확정할 때 증거 freshness를 검사하고 배정 후 이미 고정된 권리에는 짧은 proof TTL을 다시 적용하지 않는다. 버전별 비업그레이드형 계약 또는 기존 신청에 영향을 못 주는 별도 배포가 후보이며, 관리자 sweep/pause/verifier 교체로 기존 청구를 막는 숨은 권한을 넣지 않는다.

신규 계약은 policyHash 외에도 amountRule/입력 결합, 검증기와 rule profile, trust config, consent 및 evidenceSet commitment를 검증 경로에 결합해야 한다. 오프체인 결과만 서명한다면 결과 서명자를 신뢰한다는 한계를 명시한다. 검증기의 규칙 실행 또는 적합한 증거 검증 없이 해시만 비교하는 것으로 독립 청구를 달성하지 못한다.

## M0.2 benefit 확장과 기존 타입의 관계

[확정된 M0 합성 profile](M0_CONTRACT.ko.md)의 BenefitPolicy/BenefitCase/ChallengePrecheck를 먼저 따른다. 750점반 50~300% 조건·금액 계산은 개발 목표, 400%는 조건 구조화·서류 사전검토만이다. 제품 API·ABI는 계속 미구현이다. 기존 YBM형 PolicyBody의 대안 수를 환급률 개수로 사용하지 않으며 공통 요구 + tier별 제한된 대안/금액 profile로 분리한다. 500%·전강좌반·토스/오픽은 제외한다.

후속 실행 타입은 tier별 조건 결과·필요 증거 신뢰와 미확정 질문, 산술 견적/최종 entitlement를 분리해야 한다. selectedTier/selectionRevision, 최초/평가 성적 ref, factsRevision/hash, amountRuleVersion/input hash, entitlementAmount를 policy/subject/recipient/instance와 함께 결합한다. 다른 제출로 최초 성적을 교체하거나 같은 revision의 내용을 바꾸지 않는다. 복수 충족의 선택/우선순위가 OPEN이면 정산 보류이며 상위 UNKNOWN에서 하위 금액 자동 확정 금지다. 하위 정산 뒤 상위 차액 자동 지급도 지원하지 않는다.

금액 profile에는 기준액, 교재/기기 공제, 정확한 수수료 입력, 응시료 가산의 적용/금액, 세금, 정수 반올림·상한을 따로 둔다. M0의 TEST 고정 수수료 예제는 ‘약 3%’ 공식의 구현이 아니다. 미확정은 null/AMOUNT_OPEN. 400%는 금액/최종 자격 profile에 넣지 않고 별도 ChallengePrecheck에서 내용 관찰만 한다. 가이드 본문 확보는 정책 해석/적용·게시 원천 검증 완료가 아니다. [후기 검토 DTO 제안](REVIEW_PRECHECK.ko.md)에 따라 ruleId/policyVersion/sourceReference/evidenceReference·검토/보완/원천 상태를 분리하며, 미결/원천 미검증을 VERIFIED로 바꾸지 않는다. 기존 ChallengePrecheck의 가이드 미확보 상태는 과거 fixture로만 유지한다. 실제 최종성/동의/원자 배정 구현은 M1/M2/M3/C1/C2에서 소비자 검토 후 진행한다.

## 명령·권한·오류의 경계

실제 HTTP 경로는 아직 미정이다. 먼저 `CreatePolicyDraft / ReviewPolicy / PublishPolicy / AgreeApplication / SubmitEvidence / Evaluate / TopUp / Allocate / Claim / Cancel / Reclaim` 명령의 schema와 capability를 구현 PR에서 고정한다. 운영자는 초안/게시, 학생은 자기 신청/동의/제출, 검증 서비스는 검증 결과, sponsor는 자기 재원, 청구 검증기는 고정된 청구 규칙만 담당한다. 검증 서비스에 임의 정책 변경 권한을 주지 않는다.

쓰기에는 subject+command+idempotencyKey와 canonical body hash를 저장한다. 같은 키/같은 입력은 같은 operationId, 다른 입력은 CONFLICT다. optimistic revision, DB transaction/unique 제약, 만료 nonce·단회 소비를 사용한다. DB와 체인이 원자적이라고 가정하지 않는다. 제출/승인/충전 응답 유실은 UNKNOWN으로 기록하고 조회 후 재시도한다. 자동 재서명·새 키 생성·정책 변경은 하지 않는다. 작업자는 자기 schema/DB를 별도로 만들고 공유 DB를 수정하지 않는다.

오류는 `INVALID_INPUT / BINDING_MISMATCH / VERSION_CONFLICT / SOURCE_UNVERIFIED / HISTORY_INCOMPLETE / UNSUPPORTED_RULE / NEEDS_SUPPLEMENT / FUNDING_INSUFFICIENT / DEADLINE_EXPIRED / ALREADY_SETTLED / OUTCOME_UNKNOWN`의 명세 후보로 한다. 세부 코드 mapping은 기존 안전한 오류 전달 계약과 함께 freeze한다. raw source/모델 응답/토큰/개인정보를 화면 오류·로그로 복사하지 않는다. 목록 부재는 미생성 증거가 아니며 조회 pagination/범위 완전성을 명시한다.

## 역할별 초안의 명칭 대응

| 담당 초안 | 공통 명칭/의미 후보 | 미결 경계 |
| --- | --- | --- |
| Moodle LOCAL_LMS_RECORD / INSTITUTION_LMS_RECORD | dataMode LOCAL_LAB / LIVE_SOURCE + evidenceProfile에 원래 원천 구분을 보존 | LIVE_SOURCE가 기관 승인·진위 검증을 자동 뜻하지 않음. assurance/sourceTrustProfile 별도 |
| Moodle PASS/IN_PROGRESS/NOT_REQUIRED | 학습 rule MET / 학습 진행 중 / 정책에 해당 없음 | 전체 eligibility·funding으로 직접 변환 금지. future day를 missing으로 처리하지 않음 |
| Moodle effectiveMs/mediaCoveredMs/providerProgressBps | 동일 단위/의미 필드명 채택 후보 | 현재 read에 progress/speed/revision 없는 예시는 UNKNOWN/ON_HOLD로 유지 |
| AI allOf/anyOf, sourceSnapshot/reviewOutcome | ALL/ANY, SourceDocument, DocumentPrecheck | 실제 JSON 키/normalizer/locator/한도 freeze는 후속. 부속 예시는 실행 schema 아님 |
| claim ELIGIBLE_FINAL / RESERVED_FULL | decisionStatus ELIGIBLE + finalizationStatus FINAL / funding ALLOCATED | 조건 충족과 정정 최종성·전체 재원 예약을 별도 검증 |
| claim SPENT/EXPIRED_RELEASED | PAID/RECLAIMED, settlement 관측 상태 별도 | 만료 미배정 EXPIRED와 이미 배정 후 회수를 구분 |

독립 source schema와 제품 envelope를 무손실 mapping하는 구현이 필요하다. 이름만 바꿔 인증·완전성을 올리거나 담당 JSON에 공통 필드가 없는데 현재 제품 schema 통과라고 보고하지 않는다. 세 담당 대조 기록과 미결 충돌은 [차이·근거](MVP_GAP_20261014.ko.md)에 있다.

## Interface freeze 조건

공통 담당이 schema·HTTP·DB·서명 인코딩·claim ABI를 단일 PR로 정리하고 각 소비자 영향과 fixture를 검토한다. 다음이 모두 있어야 `FROZEN_FOR_SYNTHETIC`으로 바꿀 수 있다: 세 담당 검토 수신/충돌 해소, 정책별 미확정 목록, 단위·enum·필수/nullable·한도·오류 mapping, 상태 전이/권한·멱등 예제, 식별/원천/수령인 결합, 동의 버전·중복 범위, 취소/회수/기한, 데이터 저장/삭제, 구버전과 분리한 합성 계약 시험.

실제 제품 freeze는 여기에 원천 신뢰·계정 연결·실제 형식·공식 witness·개인정보/배포 관문을 추가한다. 합성 freeze가 실제 Moodle·원천 검증 차단 또는 독립청구 NO-GO를 해제하지 않는다. 미지원 경로는 보류 상태로 남긴다.
