# M0 공통 합성 계약과 인수 예제

`clear-m0.1`, **FIXED_FOR_M0_FIXTURES / NOT_RUNTIME / CONSUMER_AGREEMENT_PENDING**. 기준 제품 commit `6d941a1fe0669b89730da1472d23ecd7caab22f4`, 선행 설계 commit `7bf622901919199ff6aaf00aaf077ef64a704a79`. PR #30의 M0 추가분이다. [결정 등록부](M0_DECISIONS.ko.md) · [프런트 시작점](FRONTEND_M0_HANDOFF.ko.md).

이 문서와 [schema.mjs](../../specs/m0/schema.mjs), [fixtures.json](../../specs/m0/fixtures.json)이 **첫 합성 mock의 필드·예제 기준**이다. 더 넓은 [인터페이스 초안](MVP_INTERFACES_20261014.ko.md)의 모든 후보를 구현/동결한 것이 아니다. 기존 [HTTP API](API_CONTRACT.ko.md), DB, 서명, `CourseRefundVaultV4`, proof flow와 서로 다른 namespace다. 새 API URL·배포 계약·컴파일러·평가기·명령 실행기는 없다.

## 타입·단위·한도

기계적으로 정확한 필드 목록/enum은 schema의 `$defs`를 따른다. 모든 object는 모든 선언 필드를 요구하고 추가 필드를 거부한다. nullable 필드는 생략 대신 null을 쓴다. 알 수 없는 값은 0/빈 문자열/성공으로 바꾸지 않는다. 버전 변경은 별도 `contractVersion`과 예제 검토를 요구한다.

| 공통 표현 | 고정 범위 / 의미 |
| --- | --- |
| marker | 상태 객체/명령/응답은 `contractVersion=clear-m0.1`, `mode=SYNTHETIC`, `authority=MOCK_ONLY`. Source·하위 규칙에는 자체 origin/basis와 상위 문맥이 있음 |
| ID / revision | 소문자 영문 시작, 영문·숫자·점·하이픈 1~64자. revision 정수 1~2147483647. 운영 주소/지갑이 아닌 mock 참조 |
| hash | `0x`+소문자 hex64. 합성 데이터 외에 개인정보 단순 hash를 공개하지 않음 |
| 시간 | UTC 정수 초 0~4102444800, 기간 `[from,until)` + `Asia/Seoul`. 달력일과 기한 포함 여부는 아래 절 참조 |
| 금액 | 소수 없는 1~30자리 10진 문자열, 선행 0 금지(0 자체 허용), TEST 6 decimals. JS float 연산 금지. 승인된 지급액은 양수 |
| 정책 크기 | 원천 최대 16, 대안 1~4, 규칙 1~64, 요구 1~32, 질문 최대 32. 공통 ALL + ANY(각 ALL)의 두 단계, 중복/미참조 거부 |
| 비율 / 점수 | BPS 정수 0~10000, SCORE 0~990. 일수 1~366. DAILY_TIME/DAILY_PROGRESS는 BPS+days, EXAM_GTE/HISTORY_NO_HIGH_SCORE는 SCORE, 나머지는 BOOLEAN+threshold null |
| 관찰 / 파일 | 필드 최대 32, 문자열값 최대 120자, page 1~5, bbox `[left,top,right,bottom]` 0~1·양의 면적. 원문 불가독은 value=null. 파일 메타데이터 8MiB/20MP/5장 상한 |
| 요청 / 재시도 | mock JSON 64KiB 이하를 프런트 adapter의 설계 상한으로 삼음. M0 검사기는 파일 전체/전송 byte limit을 강제하는 서버가 아님. 쓰기 자동 재시도 0회, 실제 모델 호출/비용 0 |

| 타입 | 필수 내용·nullable / 정상과 보류 예제 ID |
| --- | --- |
| Source | institution/product/cohort(nullable), capturedAt, rawHash, normalizedHash/normalizerVersion(함께 null 허용), URL(nullable), locator, origin, applicability. `ybm-snapshot`, `siwon-snapshot`은 OPEN. `synthetic-source`는 별도 인공 약정 |
| Question | category, field, routeIds, text, choices, status, resolution(nullable). OPEN의 resolution은 null. 근거 미확인 답변은 OPEN 유지 |
| PolicyDraft | draftId/revision/state, body, reviewerRef/aiRunId(nullable). `draft-created`, `official-questions`, `draft-reviewed` |
| ApprovedPolicy | policyHash/version, draftId/revision, 불변 body, approvedBy. compilerVersion=M0_NOT_IMPLEMENTED, publication=MOCK_CATALOG_ONLY, executable=false. `approved-mock`만 존재 |
| Requirement / Rule / Route | 요구 종류·주체/진위·기간/전체성·신선도·원천 신뢰·필드·지원 여부와 규칙의 타입/값·근거 연결. 질문/unsupported가 남으면 승인 예제 생성 불가 |
| Application | 정책/주체/수령인/instance 결합, revision, 선택 경로(nullable), termsHash, consentRef(nullable), state. MOCK_NO_SIGNATURE, 재원 미보장=true. `application-draft`→`application`; 실제 서명 아님 |
| SubjectBinding | provider instance와 불투명 source account 참조, 신청·binding revision·검증/만료 시각. PROPOSED/VERIFIED/REVOKED. `subject-binding`의 VERIFIED도 인공 검증 |
| Evidence | 공통 결합 + evidenceId/revision, requirement/source revision(nullable)/trust profile, 시각, coverage/coveredPeriod(nullable), assertions, payloadHash/verifierRef/supersedes(nullable). `evidence-exam`, `evidence-learning` 등 |
| DocumentSubmission | 공통 결합·submission/route revision, requirement/file 참조·private hash·형식/크기·보존시각·전송동의. `document`, `document-revision-2`는 실제 파일 없음·외부 전송 불가 |
| ModelRun | aiRunId/jobId, 원본/모델 입력 hash, transform/prompt/extractor version, modelVersion=null, MOCK, attempt=1, cost=0. `model-run` |
| DocumentPrecheck | 공통 결합·submission/route revision·job/run/input binding, 관찰 필드, jobState, outcome/reasons/current. 진위/전체성/주체는 항상 UNVERIFIED. `vision-readable-held`, `vision-cut`, `vision-late`, `vision-cancelled` |
| Eligibility | decision revision·증거 ID/revision 집합·평가시각·선택 경로(nullable)·규칙별 결과·상태·최종성·amountAtoms(nullable). `eligible-final`과 `eligibility-held`; paymentAllowed=false |
| Funding | 공통 결합·revision, 상태, 잔액/예약/지급/반환/누적 입금/권리 금액, allocation/decision ID(nullable), 고정 환불처, releaseReason(NONE/학생 취소/배정 만료/청구 만료), 관측시각/상태. `funding-*` |
| Claim | 공통 결합·claim/allocation ID(nullable), state, amount, canSimulateClaim. NO_CHAIN_MOCK / independentProduct=NO_GO. `claim-*` |
| Fault / MockReply | code·operationId(nullable)·outcome·nextAction·autoRetry=false. 응답은 requestId, operationId/revision(nullable), state, viewIds, fault(nullable), nextCursor(nullable), complete. `fault-unknown`, `reply-allocation-blocked` |

`MockReply.viewIds`는 같은 fixture catalog 안에서 읽어오는 예제 참조다. 새 서버가 이 ID를 wire response로 제공한다는 뜻이 아니다. 각 exchange는 독립적인 사전조건을 가진 스냅샷 예제이며 전체 command 배열을 순서대로 실행하는 스크립트가 아니다. 시원스쿨 문서 fixture의 app-siwon-precheck는 미게시 초안의 가상 진단 문맥이며 실제 신청/동의 객체가 아니다. reply revision은 해당 명령의 수정 대상 draft/application/funding/job의 관측 revision이다. 다른 집계의 revision과 혼합 비교하지 않는다.

ApprovedPolicy의 예제 hash는 `SHA256(prefix + canonical({body,policyVersion,compilerVersion}))`다. prefix는 `CLEAR-M0-POLICY` 다음 LF(0x0a) 한 바이트다. UTF-8, 객체 키 사전순 정렬, 배열 순서 보존, 공백 없는 JSON; 이 합성 profile은 안전 정수·일반 문자열만 다룬다. 구현은 check.mjs를 따른다. 범용 canonical JSON/Unicode 정규화 규격이나 실행 compiler가 아니다. hash는 무결성 식별자이며 규칙 집행/서명이 아니다. sourceIds는 이 catalog에서 불변 원천을 가리킨다. 제품에서는 원천 집합 지문·정규화 버전·검증기/동의 인코딩을 M1에서 확정해야 한다.

## 명령·조회·권한과 화면 행동

모든 명령 이름은 mock dispatch 메시지다. HTTP method/path가 없으며 기존 wallet.request로 전송하지 않는다. 읽기에도 본인/운영자 범위가 필요하다. 역할 선택 UI는 합성 시연용이며 인증 구현이 아니다. 제품에서 actor·owner·신뢰 설정은 서버/검증 문맥이 결정해야 하며 클라이언트 payload로 받지 않는다.

| 명령 / 조회 | 허용 주체·선행 상태 | 응답 예제 / 화면 행동 |
| --- | --- | --- |
| CreateDraft, AnswerQuestion | 운영자. 원천 참조/제품 또는 열린 질문·답변의 근거 분류만 입력 | draft-created / official-questions. 답변 저장과 외부 사실 확인을 분리; AI가 승인하지 않음 |
| ApproveDraft, PublishMockPolicy | 운영자. 검토한 draft revision, 적용 질문/unsupported 해소, 금액·기한 유효 | draft-reviewed / approved-mock. 합성 목록 게시만, 실정책 게시 버튼 없음 |
| CreateApplication, AgreeMockTerms | 학생 본인. 게시된 합성 hash, 표시한 정확한 termsHash 검토 | application-draft / application. 동의 표시는 합성, 지갑 서명·예치 없음 |
| SubmitMockEvidence | 학생 본인. AGREED·기한 내·필요한 requirement에 허용된 fixtureId 선택 | evidence-exam. verified 필드 직접 제출 불가, fixture 선택은 실제 취득 권한 아님 |
| SubmitMockDocument, StartMockPrecheck | 학생 본인. 필요 문서·새 submission revision / 검토할 정확한 submission+route revision | document-revision-2·vision-cut / vision-readable-held. 입력 형식 미확인은 보완, 판독돼도 원천 검증은 보류 |
| CancelOperation | 자기 작업 소유자. 진행 중 mock job만 취소 요청 | vision-cancelled. 기다림 중단과 실제 원격 취소 확정을 구분; 이미 수락된 증거/권리 삭제 아님 |
| EvaluateMock | 본인 또는 지정 mock 평가기. 선택한 증거 revision과 정책 고정 | eligible-final / eligibility-held. 재원 부족으로 자격 결과를 바꾸지 않음 |
| SimulateTopUp | 고정 sponsor. 미취소·미만료, 배정 기한 이내 | funding-partial. 임의 다른 신청에 전용 불가; 실제 토큰 승인/거래 없음 |
| SimulateAllocate | 합성 역할 누구나 전달 가능. ELIGIBLE+FINAL, 약정/중복 범위 일치, 전액/기한 | funding-allocated 또는 reply-allocation-blocked. 관리자 승인 버튼으로 대체하지 않음 |
| SimulateClaim | 누구나 전달 가능하되 고정 수령인만 대상. 전액 예약·미지급·청구 기한 | claim-pending→claim-unknown 또는 claim-paid. UNKNOWN은 완료 표기/재송금 금지 |
| CancelApplication | 본인 학생. 아직 배정 전이며 취소 약정에 명시 동의 | application-cancelled. sponsor에게 임의 취소권 없음 |
| SimulateReclaim | 고정 sponsor. 아래 회수 조건 충족; 환불처 변경 불가 | funding-reclaimed. 만료 관측 전 활성화 금지 |
| GetApplication | 본인 또는 이 합성 사업 운영자. 신청 범위 검사 | application + 별도 eligibility/funding/claim. 각각의 상태와 확인시각 표시 |
| GetDraft, ListMockPolicies | 운영자 초안 / 인증된 합성 참가자 게시 목록 | draft-reviewed / approved-mock. limit 1~20, nextCursor/complete. 목록에서 안 보임은 미생성 증명 아님 |
| GetOperation | 해당 작업 소유자 | reply-getoperation. 응답 유실 후 상태 확인 우선; UNKNOWN이면 동일 작업 대기 |

쓰기 입력은 `requestId`, `expectedRevision`, `idempotencyKey`, 정확한 args를 요구한다. 생성만 expectedRevision=null; 기존 객체 쓰기는 검토한 양의 revision. 읽기는 expectedRevision/idempotencyKey=null. requestId는 시도별 추적 ID이고 멱등 키는 같은 의도의 재시도에서 고정한다. 범위는 인증 actor + instance + 대상 + command + key이며 canonical args와 expectedRevision을 비교한다. 같은 키/같은 입력은 같은 operation/result, 다른 입력은 IDEMPOTENCY_CONFLICT. 재조회 후 변경을 다시 검토하면 새 의도·새 key를 사용한다. 이 영속 원장은 미구현이며 mock 예제만 있다.

VERSION_CONFLICT는 최신 상태 재조회·다시 검토, BINDING_MISMATCH/FORBIDDEN은 중단, MISSING_DOCUMENT/MISSING_FIELD/UNREADABLE은 보완, SOURCE_UNVERIFIED/HISTORY_INCOMPLETE/UNSUPPORTED_RULE/QUESTION_OPEN은 해당 근거 확보까지 보류다. FUNDING_INSUFFICIENT는 충전 확인 대기, DEADLINE_EXPIRED/ALREADY_SETTLED는 terminal 조회, C0_BLOCKED는 제품 경로 비활성이다. OUTCOME_UNKNOWN은 operation 조회이며 새 키 생성·자동 서명/유료 호출/재송금 금지다. 모든 Fault는 autoRetry=false. INVALID_INPUT/MISMATCH/STALE_RESULT/AUTHENTICITY_UNVERIFIED의 상세 안전 code는 schema enum을 따른다. 원천·모델 raw 오류/PII는 표시하지 않는다.

## 시원스쿨의 제한 시연과 금액 미결

시원스쿨 750점반 100% 경로는 `(출석 100일 AND 후기) OR (750점 이상 성적 AND 과거 2년 관련 이력 AND 후기)`의 질문/문서 사전검토 시연이다. Vision 판독으로 진위·전체 이력·주체를 확인하지 못하면 보류한다. **상품 전체 환급액 판정이 아니며 다른 환급률 가능성을 자동으로 100% 최종 정산으로 낮추지 않는다.** 최초 제출 성적·다른 혜택/비중복·선택/우선순위·상위 tier 미확인 처리는 [Q-TIER](M0_DECISIONS.ko.md)에 남긴다. 단순 OR/max로 최종액을 정하지 않으며 해당 범위가 확정될 때 최종 금액과 배정액의 결합을 다시 검토한다. 현재 확장은 미승인이고 새 타입/금액 계산기를 추가하지 않는다. 아래 100 TEST는 별도 가상 YBM형 주 예제의 약정으로, 시원스쿨 공식 환급률이나 원화 환급액이 아니다.

## 자격·재원·청구 합성 약정

가상 시계 T=`1898521200`(2030-03-01 00:00 KST), 학습 창 `[T,T+90일)`. 이 고정 KST 예제의 하루는 86400초다. 다른 지역 달력 규칙으로 일반화하지 않는다. evidenceUntil=T+90일, supplementUntil=T+91일, finalizeUntil=T+92일, allocationUntil=T+93일, claimUntil=T+100일. 제출/보완/배정/청구 명령은 각 기한 **이하**에 허용, 회수는 기한 **초과**에 허용. 학습 기록의 endExclusive와 제출 마감 포함은 별개다. 최소 청구 창 604800초를 요구한다. 이는 학원 공식 규정과 무관한 S-3 합성 선택이다.

기간 중 미래 날짜는 IN_PROGRESS, 미제출/필드 부족은 NEEDS_SUPPLEMENT, 불완전 원천·주체 불명·알 수 없는 규칙은 ON_HOLD. 확인된 자료로 조건이 거짓일 때만 NOT_MET이다. 공통 규칙 모두와 한 완결된 대안의 MET가 필요하다. 선택하지 않은 OR 경로의 불필요한 과거 이력을 강제로 요구하지 않는다. 본 profile의 실제 평가기는 없다. `eligible-final`은 규칙 실행으로 얻은 결과가 아니라 인공 결과를 일관되게 연결한 fixture다.

확정은 T+92일의 지정 단계에서만 모델링한다. 그때 source/account/policy/recipient 결합·증거 유효기한/최대 나이·정정 종료를 검사하는 설계다. 배정 전 새 자료/철회가 들어오면 구 revision을 폐기하지 않고 supersedes 및 새 판정을 만들며, 현재 FINAL revision이 아니면 배정 불가다. 배정 뒤 이미 확보한 권리에는 proof TTL이나 재모델 실행을 다시 적용하지 않는다. 확정/배정 원자성·정정 경합·분쟁 권한은 실제 원천/C0와 함께 구현 전에 검토한다.

재원 약정은 다음과 같다.

- 등록과 자격은 예치 없이 존재할 수 있다. sponsor가 입금하지 않을 가능성과 배정 전 재원 미보장을 동의에 표시한다.
- 신청별 잔액에서 권리액 100 TEST를 한 번에 예약한다. 부분 지급·예약 금지. 초과 입금은 미예약액이며 다른 신청에 돌리지 않는다.
- 누구나 고정 검증 결과를 전달해 배정할 수 있는 설계다. 운영자의 대상/금액 선택 서명은 추가 승인권이므로 이 약정/독립 청구 목표와 다르다. 현재 fixture의 검증자는 인공이며 체인이 규칙을 검증하지 않는다.
- 학생은 배정 전 취소할 수 있다. 취소와 충전/배정은 직렬화해 단 하나의 결과만 허용해야 한다. 취소 후 충전·배정 불가. sponsor는 취소 후 미예약 잔액을 고정 환불처로 회수한다.
- allocationUntil 초과 시 미예약액만 회수할 수 있다. 배정 기한 전 sponsor 임의 출금 금지. 이미 배정한 reserved는 claimUntil 이하에서 회수 불가. claimUntil 초과 시 미지급 reserved도 회수한다. PAID와 RECLAIMED는 같은 예약에서 상호배타다.
- `잔액 + 누적 지급 + 누적 반환 = 누적 입금`, `예약 ≤ 잔액`, `예약 ∈ {0, 권리액}`. 지급은 고정 수령인에게 한 번만. claim/회수/토큰 실패의 원자성 및 체인 reorg는 후속 계약 검증 대상이다.
- 자격 충족이더라도 기한까지 재원 부족이면 EXPIRED/청구 불가. 자동 연장 없음. 새로운 기한·정책·수령인은 기존 권리 덮어쓰기 없이 새 약정이 필요하다.
- 배정 뒤 짧은 증거 TTL 만료는 청구 취소 사유가 아니다. 만료 후 원천 시험의 재사용/spent 해제는 자동 허용하지 않는다. cross-contract/epoch 안정 중복키는 C0 OPEN이다.

funding.observation의 UNKNOWN/REORG_PENDING과 claim PENDING/UNKNOWN은 송금 완료가 아니다. 후속 체인 adapter의 확인 블록 수·최종성·blockHash/reorg 처리는 OPEN이며 M0에서 임의로 1블록 확인을 채택하지 않는다. C1을 시작하려면 격리 TEST 신뢰 모형과 계약 검증 계획을 먼저 승인해야 한다. 해시/서명만 붙여 독립 청구가 완성됐다고 주장하지 않는다.

## 원천·AI·개인정보 경계

SubjectBinding은 인증된 원천 계정 주체와 신청의 연결이다. 사용자가 제출한 userId, 화면의 로그인 표시, 동일 이름·지갑만으로 VERIFIED가 되지 않는다. 변경/해제는 새 bindingRevision을 만들고 진행 job을 무효화한다. 기존 evidence를 새 계정에 재결합하지 않는다. 별도 Moodle 실험의 `$USER` 기반 읽기를 운영자 토큰+임의 학생 ID로 바꾸지 않는다. 실제 인증/동의/토큰·신뢰 registry/기관 매핑은 Q-L이 열릴 때까지 미구현이다.

Vision의 판독은 내용 관찰이다. 문서 진위, 빠진 페이지/과거 이력 전체성, 실제 신청자의 것인지는 별도다. 읽을 수 있는 합성 745점이 있더라도 세 assertion은 UNVERIFIED이며 paymentAllowed=false다. 파일 속 지시·URL·스크립트는 정책/도구 권한이 될 수 없다. 실제 모델 입력에는 최소 필요한 부분만 승인된 경로로 보내야 하며 원문과 변환본 hash/transform version을 분리한다.

job의 고정 키는 application/policyHash·version/subject binding revision/recipient/instance/requirement/submission revision/route revision/input hashes/extractor profile/aiRunId다. input 수정·재제출·경로 변경·계정 변경 후 늦은 결과는 STALE_RESULT이며 현재 화면/자격에 적용하지 않는다. 작업 취소와 네트워크 대기 중단도 실제 원격 결과 취소를 보장하지 않는다. 재시도는 기존 job 조회부터 시작한다. M0에는 실제 호출·자동 retry·유료 비용이 없다. 실제 extractor/model/prompt version·가격·반복 상한은 A/V 착수 전 별도 결정한다.

합성 파일은 실제로 존재하지 않는다. 첫 업로드 설계의 허용 형식은 PNG/JPEG, 최대 5개 이미지 합계 8MiB·합계 20MP, 개별 decode 제한 30초다. schema의 byteLength/pixels/pageCount는 제출 묶음의 합계이며 mimeType은 묶음 안에서 동일한 PNG 또는 JPEG 형식이다. 혼합 형식 묶음은 이 제한된 profile에서 미지원이다. schema는 집계 metadata 상한만 검사하며 MIME sniffing·압축 폭탄·리사이즈·EXIF 제거·메모리 상한을 구현하지 않는다. PDF는 별도 parser/제한 검토 전 미지원이다. 모델에 주민번호·계좌·쿠키·proof 원문을 보내지 않는다.

신규 문서의 mock 보존 상한은 제출부터 24시간, 정상/오류 처리 종료 또는 사용자 삭제 시 더 이른 삭제다. 파일/모델 입력을 public storage·localStorage·체인·로그에 남기지 않는다. process crash/백업/공급자 보존·삭제 확인은 Q-PRIVACY이며 실제 수집 허용을 뜻하지 않는다. 기존 Mac 승인 저장 정책은 그대로 유지한다. 실제 전송에는 제공자/지역/이용 목적/보존 조건·동의와 예산 확인이 필요하다. 단순 공개 hash로 민감한 점수/계정 재식별을 막았다고 주장하지 않는다.

## 고정 범위와 남은 관문

| 항목 | M0에서 고정한 것 | 다음 관문 |
| --- | --- | --- |
| mock 데이터·명령 | 이 schema의 필수/nullable·단위·enum·한도·예제 ID·안전 표기 | 소비자 검토 후 변경은 version+fixture+검사 함께 |
| 첫 합성 약정 | 100 TEST·고정 시계·전액 예약·역할·취소/회수 경계 | 실행 compiler/evaluator/원자성/체인 adapter는 M1 이후 별도 승인 |
| 화면 착수 | 차이 분석·상태표·mock 설계에 사용 가능 | 실제 web 구현 범위 및 기존 API와의 전환은 담당 합의 필요 |
| wire/서명/DB/ABI | 미구현, NOT_FROZEN | 단일 공통 PR에서 소비자 영향/회귀 검증 |
| 공식 조건·원천 계정/전체성·실제 모델 | OPEN / BLOCKED | 등록부 질문별 공식 근거와 실제 검증 |
| 독립 청구·실제 지급 | NO-GO, grant/outbox 보류 | C0 통과 및 별도 구현·검증 승인 |

검사 명령은 `./tools/node specs/m0/check.mjs`. 구조, 참조, 예제 hash/결합·금액 회계·FINAL 입력·명령 모양과 변조 거부를 검사한다. 지정 JSON Schema 키워드만 지원하며 범용 validator·정책 평가·원격 인증·경합/멱등 원장·실제 AI/지급을 검증하지 않는다. 기존 CI에는 이 명령을 추가하지 않았으므로 M0 변경 시 수동 필수 검사로 실행한다. 실행 결과와 최종 HEAD는 PR 검증 기록에 남긴다.
