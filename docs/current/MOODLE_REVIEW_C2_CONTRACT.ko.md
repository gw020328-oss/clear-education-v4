# Moodle 후기 → C2 제출·AI 관찰 연결 계약 제안

2026-10-16. `clear-review-source-binding-proposal.1`, 검토 가능한 **계약/오프라인 fixture 단계**다. 제품 schema·HTTP·DB 연결이나 LOCAL 수락을 구현하지 않는다. 요청 설정 Sol/High(여러 모듈·상태/저장 계약), 실제 런타임 모델 ID는 독립 확인하지 못했다. 자동 병합 승인은 없다.

## 기준과 소유 범위

기반 develop `4756589659a40c8f8fe45452a698b8a56487628c`(PR67). 읽기 전용 참조:

- [PR71](https://github.com/gw020328-oss/clear-education-v4/pull/71), head `45a682fc5efcbd474903241ae06f596da9b4cd3e`: 격리 Moodle4.5.15·합성 계정의 실제 API13/13, 새 오프라인31+기존6. `clear-local-moodle-review.1`은 LOCAL source facts, `submissionContentBinding=NOT_ESTABLISHED`, `usableForAcceptance=false`다. 이번 작업에서 lab을 재실행하지 않는다.
- [PR72](https://github.com/gw020328-oss/clear-education-v4/pull/72), 검토 head `bc1fac3037b45cdaddb12c0eb89cf2f7b6f22f5d`: `clear-review-source-fixture.1`와 `clear-review-precheck-proposal.1`은 합성 proposal. 실제 Gemini 합성8건의 literal/null8/8은 보완사유·근거 위치 품질 통과가 아니다. 추가 호출 승인은 소진됐다. 후속 head `bdbd7ccdadd161f3141a30244e89279ff8fa7776`의 `clear-review-grounding.1`도 변경분을 읽었다. 원문 인용/명시 사유 후처리 개선이며 추가 유료 호출0·v2 실제 모델 미검증이다.
- [PR70 범위 결정](https://github.com/gw020328-oss/clear-education-v4/blob/2ec686c6e1545ed6d9bafaf19e897d7841723770/docs/current/MVP_DECISIONS_20261016.ko.md): YBM750+·시원스쿨50~300% 일반 후기가 대상이고 신규400/500%는 제외한다. PR70/71/72는 이 문서 작성 시 Draft·미병합이다. 해당 결정을 develop에 이미 반영한 것으로 표현하지 않는다.

공통 `docs/current/`와 아래 계약 fixture/검사만 이 단위에서 변경한다. Moodle 전용 모듈, AI 전용 `src/document-precheck/review/`, `tests/ai-review-precheck/`, `docs/ai-vision/REVIEW_PRECHECK*`, web/와 독립 청구 파일은 각 담당 소유다. 타 PR을 선별 복사하거나 병합하지 않는다.

## 재사용과 버전 경계

기존 M1 `Binding`(application/subject/bindingRevision/recipient/instance/policy hash·version/product/cohort)과 `SourceBinding`(institution/providerInstance/course/sourceAccount/accountBinding ID·version)을 그대로 참조한다. C1의 현재 정책/정확 표시 ACK, C2의 별도 문서 ACK·RunContext·manifest·inputHash·run/attempt와 C3의 결과 snapshot·stale 관례를 재사용한다.

C2 `RunContext.snapshot.sourceBundleHash`는 **정책 원문 묶음**이다. 후기 API 사실 receipt로 덮어쓰지 않는다. `inputHash`는 기존 `submissionHash`이며 manifest의 원본 이미지 bytes/hash와 함께 검증한다. 정규화 본문 지문으로 대체하지 않는다. 기존 `RunContext`는 SYNTHETIC/DOCUMENT_PRECHECK 전용이다. LOCAL 자료를 mode만 바꿔 넣거나 새 필드를 구버전 DTO에 추가하지 않는다.

후기 사실 receipt, C2 원문 제출, AI 관찰, 정책 조건 판정, 자격·재원·지급은 별도 기록이다. 동일한 해시를 만들 수 있다는 사실은 API 인증·실명·자료의 진실이나 학원 최종 인정을 보증하지 않는다. 이번 proposal은 항상 `contractOnly=true`, `usableForAcceptance=false`, `realDataAllowed=false`다.

## 공통 인터페이스 제안

현재 HTTP에 새 endpoint를 추가하지 않는다. 아래 DTO는 기존 C2/C3로 전송할 수 없는 별도 버전 제안이며 신뢰한 host 내부에서만 발급한다. 브라우저는 C1/C2의 본인 세션/CSRF/명시 revision·고정 fixture만 제출하고 registry/receipt/verified/current를 승인하지 못한다.

| 기록 | 필수 결합 / 의미 |
| --- | --- |
| `ReviewSourceRegistryRecord` | registry ID·단조 revision·status, 전체 M1 Binding, requirementId, SourceBinding, 별도 숫자 Moodle course/forum/post/author, provider instanceRef, readerId, C2 postId, normalizer, freshness profile, 검토 actorRef·reason·recordedAt. 자체 hash 포함 참조로 고정 |
| `ReviewSourceQuery` | host sourceRunId·단조 sourceGeneration·attempt, registry hash/revision, 전체 RunContext hash, 허용 함수/고정 provider·조회 대상. 토큰은 별도 secret resolver에서 메모리로만 전달 |
| `ReviewAcquisitionBinding` | source query의 정확한 pin hash 및 반환 facts hash. reader/pin과 같은 실행의 사실임을 host 내부 job에서 결합. fixture의 execution=CONTRACT_FIXTURE는 권한 증명이 아님 |
| `ReviewSourceFactReceipt` | LOCAL_LMS_RECORD/ISOLATED_SYNTHETIC_ACCOUNT, query/generation·registry·acquisition refs, sourceBinding/locator hash, sourceRevision, rawBodyHash, normalizer/normalizedContentHash, 원천 생성/수정 epoch seconds·관측 시작/종료 epoch milliseconds·만료, coverage/consistency/visibility, 고정 권한 차단 |
| `ReviewSourceSubmissionBinding` | receipt hash + 정확 RunContext hash + C2 submission ID/revision·route revision·inputHash/assetsHash·postId. 입력 파일/본문과 원천 내용의 어떤 부분이 대응하는지 명시 |
| `ReviewObservationReceipt` | AI result/summary hash, exact RunContext, **별도 sourceReceiptHash**, projection hash/version, model/prompt/profile, field allowlist, sourceGeneration·run/attempt·시각·상태/사유. 출처가 null이면 그 상태를 명시하고 게시 확인은 UNKNOWN |
| `ReviewCorrelationReceipt` | 사실·제출결합·관찰 receipt refs, current 판단에 사용한 host epoch/CAS versions, 변경 actor/reason/시각, 이전 receipt ref. API 게시 사실·AI 내용 관찰 상태를 각각 보존. 자격/금액/지급 결과를 생성하지 않음 |

### Registry와 계정·강좌 매핑

등록은 인증된 별도 host 절차에서 검토한 mapping만 허용한다. 서명된 C1 신청을 Moodle 실명 인증으로 확대하지 않는다. `authorId=5`와 신청 계정의 대응은 `REVIEWED_SYNTHETIC_MAPPING`일 뿐 `identityVerified=true`가 아니다. reader 계정과 글 작성 계정도 별도다. host reader가 여러 학생의 글을 볼 수 있어도 학생·운영자에게 그 권한을 그대로 부여하지 않는다.

숫자 Moodle courseId와 M1 SourceBinding.courseId(제품 course 참조)는 서로 다른 namespace다. registry가 둘의 대응을 명시한다. 동명이인 표시명·브라우저 전달 authorId·OCR 이름·AI 추정으로 연결하지 않는다. 매핑/강좌/정책/신청 subject binding이 바뀌면 새 registry revision과 재검토·필요한 ACK를 요구하고 진행/저장 결과는 stale 처리한다. 과거 receipt는 수정하지 않으며 단순 재활성화로 current를 복원하지 않는다.

PR71은 pin.readerId와 API site_info.userid를 비교하지만 반환 facts에 readerId/pin hash를 내보내지 않는다. 따라서 현재 반환값만 보고 registry reader와 실제 조회 주체의 일치를 입증할 수 없다. **후속 연결 전에 Moodle 담당과 trusted job sidecar 또는 새 facts 버전의 pin receipt를 합의해야 한다.** 이번 fixture의 acquisition sidecar는 이 미구현 인터페이스를 명시할 뿐 PR71이 이미 발급한다고 주장하지 않는다.

### 본문·게시물 지문과 정규화

- `sourceRevision`은 PR71의 `digest('CLEAR-MOODLE-REVIEW-FACTS.1', source)`다. instance/course/forum/post/discussion/author, subject/body/messageFormat, created/modified/visibility/deletion/private flags를 포함한다. 동일 초 수정도 내용 지문으로 구별한다. 시간 기반 단조 revision·원자 snapshot·서명/전체 이력 증명은 아니다.
- `rawBodyHash`는 JSON에서 디코드한 `source.body` 문자열의 UTF-8 bytes에 SHA-256을 적용한다. HTTP 응답 전체 bytes나 HTML 렌더링 지문으로 부르지 않는다. 원시 응답·토큰/헤더를 보관하지 않는다.
- 최소 profile `clear-review-plain-nfc-lf.1`: [Moodle4.5 형식 상수](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/lib/weblib.php#L34-L56)의 `messageFormat=2`(plain text)만 허용, Unicode well-formed/NUL·128KiB 한도 확인, CRLF/CR→LF, NFC, 나머지 공백·NBSP·대소문자·문장부호·앞뒤 공백을 보존한다. 제목은 plain 문자열로 같은 규칙을 적용한다. `normalizerVersion + title + body`를 domain-separated canonical digest로 결합한다.
- 정규화는 **내용 동일성 대조용**이다. 공식 분량·200byte·공백 계산 규칙이 아니고 C2 원본 inputHash를 바꾸지 않는다. 정규화 후 일치해도 원본 rawBodyHash와 inputHash는 각각 남는다.
- HTML1/Moodle0/Markdown4는 현재 `RS_NORMALIZATION_UNSUPPORTED`. 정규식 태그 삭제나 임의 entity 해석으로 동일성을 만들지 않는다. HTML 후속은 inert parser의 정확한 버전, entity/block/br/NBSP/숨김·script/style·첨부·pluginfile 링크/상대표시 처리, 한도와 테스트를 먼저 고정한다. 원문은 DOM 실행·외부 URL/이미지 로드 없이 취급하고 sanitized 표시도 원문과 별도 지문/버전을 사용한다. **PR71 실측 본문은 HTML이므로 이번 plain-text fixture 통과가 그 실측 본문과 C2의 호환 성공을 뜻하지 않는다.** HTML extractor가 합의되기 전 실제 lab 본문 연결은 미지원이다. API가 제공한 표시/가공 문자열과 Moodle DB의 작성 원본을 동일하다고 가정하지 않으며 rawBodyHash는 반환 표현의 지문만 뜻한다.
- 최소 fixture는 **제목·본문 텍스트만** 연결한다. 이미지·첨부·태그·links·사진 진위/대표사진 대응은 미지원이며 해당 내용이 있으면 coverage 오류로 보류한다. 게시물 URL/ID와 screenshot이 같다는 이유만으로 bytes 동일성을 선언하지 않는다.

### 사실 → AI projection 경계

PR72의 `clear-review-source-fixture.1`에 LOCAL receipt를 끼워 넣지 않는다. `sourceBundleHash`를 후기 facts hash로 재해석하지 않는다. 후속 공통 host는 새 projection version에서 receipt hash, field별 원천 locator(값 자체는 ephemeral), normalized content hash·normalizer, query/generation/observedAt를 고정하고 필요한 allowlist 필드만 전달해야 한다. AI 담당이 이를 소비하는 어댑터 변경을 별도 검토한다.

AI는 API/token/URL/registry에 접근하지 않는다. 모델에 실제 author ID·지갑·불필요한 계정/receipt 원문·비교 정답을 보내지 않는다. 입력 본문/이미지의 지시문은 데이터이며 도구 실행 권한이 없다. 일치는 게시·실명·내용 진실·학원 인정을 인증하지 않고, 불일치는 CONFLICT를 보존하며 API/AI 한쪽으로 조용히 덮어쓰지 않는다. 원천 실패로 본문 자체를 MISSING으로 바꾸지 않고 `contentStatus`와 `sourceStatus`를 나눠 표시한다.

PR72 후속 grounding의 TEXT_SPAN은 **변환하지 않은 제출 원문 UTF-16 offset과 원본 UTF-8 SHA-256**에 결합한다. Moodle 동일성 비교용 NFC/LF 정규화 텍스트의 offset을 C2 원문 위치로 복사하지 않는다. host가 원문 sourceId/sha256을 C2 post/inputHash에 pin하고, 정규화 텍스트를 별도 관찰 입력으로 쓸 경우에는 별도 sourceId·변환 버전/hash·위치 대응 규칙부터 합의한다. 현재 최소 계약에는 변환 offset map이 없어 원문 위치로 되돌리는 기능은 미지원이다. IMAGE_ASSET/전체 파일 hash는 이미지 내부 행/영역의 정확한 위치나 내용 진위가 아니다. grounding 반환값의 원문/quote/후보값은 임시 자료이고 공통 ledger에는 요약/hash만 저장한다.

PR72 현재 결과의 current와 메모리 isCurrent는 DB 수락 조건을 대체하지 않는다. 새 결과 envelope/검토 요약의 소비 합의와 model/prompt/profile/receipt binding이 끝나기 전 기존 C2 ReviewSummary나 C3 Evidence로 import하지 않는다. 날짜/분량/사진 조건도 확정된 정책만 검사한다.

## 상태와 변경·실패의 의미

아래 이름은 proposal 내부 상태이며 기존 C2 wire enum을 늘리지 않는다.

| 사건 | 출처 조회/결합 상태 | 현재 자료/관찰 처리 |
| --- | --- | --- |
| pin 검토 전 | UNMAPPED | 조회/AI 시작 차단 |
| host query 시작 | QUERYING, 새 generation 예약 | 이 실행용 ticket 발급. 이전 receipt는 역사적 관측으로만 표시 |
| 대상 두 번 일치·reader에 보임 | OBSERVED_TARGET_NON_ATOMIC | 새 immutable facts receipt. 전체 게시 이력/공개 인터넷 가시성 의미 아님 |
| 제목·본문만 정확 대응 | CORRELATED_FIXTURE | fixture의 메타데이터 결합 완료. 제품 수락/최종 인정 아님 |
| 동일 초 포함 수정·두 조회 불일치 | SOURCE_CHANGED | 새 generation에서 안정된 재조회·새 제출/명시 보완 필요. 기존 current 무효화 |
| invalidpostid·빈/누락 page·삭제 placeholder·숨김 | TARGET_UNAVAILABLE | 삭제 확정/미게시/부정으로 단정하지 않음. 이전 값으로 성공 fallback 금지 |
| 인증/권한 거부 | AUTH_REQUIRED / ACCESS_DENIED | 내용 MISSING과 구분, 원천 UNKNOWN. 토큰·권한 상세는 내부 제한 진단 |
| 반복 page·warnings·페이지 상한 | INCOMPLETE_QUERY | receipt 발급 금지, 단일 target/전체성 주장을 넓히지 않음 |
| 보완 submission/route/workflow·policy/ACK/registry 변경 | STALE_CONTEXT | 진행 중 취소, 옛 late result는 최신 pointer에 수락 불가 |
| 조회/모델 timeout·취소·종료 | TIMED_OUT / CANCELLED / INTERRUPTED | 원천·내용을 추정하지 않음. 유실 명령은 GET/동일키 복구부터 |
| lease/신선도 만료·logout/삭제·권한 철회 | EXPIRED / RAW_UNAVAILABLE | 원문 handle 폐기·진행 중 중단·current 사용 보류. 요약 이력과 별도 |

수정/삭제의 전역 감시를 구현한 것은 아니다. 성공 시점 이후의 변경은 관측하지 못할 수 있다. 수락 직전 제한된 재조회와 freshness 상한은 나중에 정해야 하며 “항상 현재/영구 게시”라고 표시하지 않는다. 단일 글 관측을 전체 기간의 모든 글·전체 이력 완전성으로 확대하지 않는다. query generation은 host의 단조 순서이며 Moodle sourceRevision의 단조 증가를 가정하지 않는다.

## 저장·원자 수락의 후속 설계

현재 C2 application wrapper DB와 workflow ledger는 별도다. LOCAL receipt를 하나 추가했다고 두 DB의 원자 수락이 생기지 않는다. 계약 단계에는 DB 파일·migration을 만들지 않는다. 다음 구현은 **별도 단일 correlation ledger를 수락의 유일한 commit 지점**으로 두는 후보를 먼저 검토한다. 기존 C2 상태는 참조된 선행 receipt이고 상호 DB 원자 transaction이라고 주장하지 않는다.

제안 테이블: immutable registry revisions, source queries/terminal observations, fact receipts, source-submission bindings, observation receipts, correlation receipts, actor/route/idempotency command tombstones, 최소 audit event. mutable head는 application/requirement/post scope의 epoch·workflow/submission/route·registry/sourceGeneration·run attempt/current pointer다. 원문/모델 응답/자격·지급 권한은 이 ledger에 넣지 않는다.

수락 전제와 commit 순서:

1. 본인 세션·CSRF·소유권과 현재 C1/C2 ACK·정책/plan/display·sourceBundle을 host가 확인한다. query/AI 전에 immutable snapshot/ticket을 예약하고 generation·attempt CAS를 확보한다.
2. 원천 읽기와 AI는 transaction 밖에서 실행한다. 완료 시 timeout/cancel·원문 lease·조회 freshness·registry/pin·현재 submission/inputHash/manifest와 run/attempt를 재검사한다. 필요 재조회가 실패하면 과거 성공으로 대체하지 않는다.
3. 짧은 BEGIN IMMEDIATE 안에서 **같은 authoritative correlation head**의 모든 예상 version/generation/attempt와 epoch를 다시 CAS한다. facts/binding/observation/summary/command/새 latest pointer는 같은 DB transaction에 넣는다. 실패 주입 시 전체 rollback한다. 동일 actor/route/key와 동일 body hash는 같은 target, 바뀐 body는 충돌이다.
4. C2 최신성의 소유 DB는 별도이므로 단순 precheck→다른 DB commit 사이 경쟁을 숨기지 않는다. 후속 공통 host가 C2의 모든 보완/ACK/삭제/만료 이벤트를 correlation head에서 먼저 invalidate하는 단일 mutation coordinator 또는 검증된 sequencer를 도입해야 한다. commit 후/GET에서도 현재 C2 revision을 재대조하며 crash gap은 fail closed로 복구한다. 이것이 구현·시험되기 전 live acceptance=false다. 임의 SQLite ATTACH로 운영 DB를 합치지 않는다.
5. invalidation은 성공 명령 rollback 때문에 사라지면 안 된다(PR67 근거). 무효화 epoch는 재활성화로 옛 결과를 부활시키지 않고 새 검토·ticket을 요구한다. 늦은 응답은 저장하더라도 superseded 이력으로만 보존한다. 새 보완은 최신 pointer를 바꾸되 과거 receipt 자체를 수정하지 않는다.
6. 재시작 시 RUNNING은 INTERRUPTED/재조회 필요로 정리한다. 원문 없는 과거 run을 자동 재실행/모델 호출하지 않는다. 유실 응답은 저장 command GET 복구부터 하며 원문·AI·원천을 새로 취득하는 명령은 명시한다.

해시는 변조 대조용이고 소유권·서명 검증을 대신하지 않는다. receipt/result/hash를 모두 공격자가 다시 만들 수 있는 경로는 수락 인터페이스가 될 수 없다. `assertCurrentCorrelation`은 이 전제의 **순수 fixture 벡터**이며 실제 transaction/authentication/CAS 구현이 아니다.

## 원문 접근권한과 수명

- 기존 C2 30분 raw 상한과 실행5분 상한, 본인 raw 조회·삭제·logout/만료 즉시 abort/wipe 원칙을 재사용한다. fixture의 source freshness60초는 대조용 engineering 가정이며 운영/학원 정책으로 채택하지 않는다. LOCAL 원천 freshness·재조회 시점은 미확정이면 live 차단한다.
- effective raw lease는 `min(C2 rawExpiresAt, source observation start + 승인된 source freshness, 현재 인증/권한 lease)` 이하로 제한한다. 처리 시작/비동기 완료/수락/원문 접근에서 재검사한다. 본문을 다시 읽어 원래 제출 TTL을 몰래 연장하지 않는다.
- 원천 원문/정규화 본문·AI 전송 복사본은 메모리 handle로 소유 범위를 나눠 보관하고 abort/정상/오류/만료 시 해제한다. 운영 원문 저장은 현재 금지다. JS 문자열/GC·강제종료·외부 모델 보유본의 물리적 삭제를 보장하지 않는다.
- 원문 조회는 해당 신청 소유자와 명시적으로 위임된 검토 역할만 허용하는 후속 권한 설계가 필요하다. 현 C2 operator403을 완화하지 않는다. Moodle reader 권한을 학생/운영자 권한으로 전용하지 않는다. 목록/요약은 원문·추출값·quote·모델응답·author 표시명·URL/token을 포함하지 않는다.
- 최소 영속 메타데이터의 계정/글 locator·해시도 연결 가능한 개인정보일 수 있다. 내부 전용 저장/접근·보존/삭제 정책과 감사 주체를 정하기 전 실제 개인 계정 자료를 수락하지 않는다. source token/HTTP body/로그·개인키는 registry/receipt에 저장하지 않는다.

## 오류·검증 기준

`RS_*`는 proposal 검사 코드이며 기존 HTTP의 새 응답 코드가 아니다. 제품 연결 시 고정 메시지·상태 매핑을 별도 승인하며 raw provider 오류/URL/경로/본문을 사용자에게 반환하지 않는다.

| 검사 코드/범주 | 의미 / 기대 처리 |
| --- | --- |
| RS_MAPPING / RS_ACQUISITION / RS_LOCATOR | 검토 registry·reader 실행 pin·author/course/post 대응 불일치, 발급/수락 차단 |
| RS_SOURCE_HASH / RS_RECEIPT_HASH | 관측/receipt 지문 변조, 처리 차단·고정 오류 |
| RS_GENERAL_REVIEW_ONLY / RS_POLICY | REVIEW 외 유형 또는 compiled policy/binding 불일치 거부 |
| RS_NORMALIZATION_UNSUPPORTED / RS_TEXT / RS_COVERAGE_UNSUPPORTED | 미지원 markup/불완전 Unicode/NUL/한도·첨부/태그/링크 대응 미지원, 추정 비교 금지 |
| RS_CONTENT_MISMATCH / RS_SUBMISSION | 원천과 정확 C2 내용·revision 불일치, 명시 보완/재취득 필요 |
| RS_VISIBILITY / 원천 adapter 오류 | 비가시/삭제 placeholder·불완전조회/권한거부는 UNKNOWN, 글 없음/내용 거짓으로 변환 금지 |
| RS_STALE_RUN / RS_STALE_MAPPING / RS_STALE_SOURCE | 새 revision/query generation·run 뒤 도착한 결과, 최신 pointer 갱신 금지 |
| RS_CLOCK / RS_EXPIRED | 시간 역행/미래 관측·만료/원문 lease 없음, 이전 성공 fallback 금지 |

최소 검사: 두 profile 결합·원문/정규화 분리·HTML미지원·동일 초 변경·타 계정/강좌·reader pin·삭제/숨김·페이지 완전성 과장·해시/권한 주입·clock/freshness/raw 만료·새 mapping/run/generation·보완 후 옛 결과 거부. 실제 API와 AI 모듈의 신규 검사를 여기서 중복 구현하지 않는다. 원자 rollback/동시 C2 event·취소/재시작/무효화 crash gap·접근권한의 실제 검사는 후속 연결 구현의 필수 인수 조건이다.

## 확정 가능한 기술 계약과 미결 관문

| 지금 고정할 기술 경계 | 아직 결정/구현이 필요한 것 |
| --- | --- |
| 사실/제출/관찰/정책/자격/재원/지급 분리, 별도 receipt hash·기존 Binding/RunContext 보존 | 운영 LOCAL receipt 발급 신뢰·개인 계정 연결/실동의·기관 최종 인정 |
| sourceBundle/inputHash 재해석 금지, source generation·CAS·immutable 이력·late reject | HTML extractor/attachment 대응·운영 source freshness/재조회·author pin export |
| 원문 메모리·최소권한·expiry/abort·오류의 UNKNOWN, 단일 원자 commit 요구 | C2 이벤트 sequencer/두DB crash recovery 구현·최소 메타데이터 보존/삭제 |
| 정책 미결은 POLICY_OPEN, 사진/날짜/분량 임의 생성 금지 | 실제 후기폼·byte 규칙·날짜 anchor/timezone/boundaries·공식 인정조건 |
| 400/500 신규범위 제외, 자동 자격/지급 false·grant/outbox HOLD·독립청구 NO_GO | 예치율·배정/충전/회수·PG·분쟁72/120시간·지급 실패 종료 정책 |

정책 미결을 기술 계약 확정의 핑계로 기다리지 않되, receipt/AI 일치로 미결 정책을 자동 확정하지 않는다. 새 일반 후기 카탈로그의400/500 제외는 별도 M1 설정/해시·재확인 변경으로 구현해야 하며 과거400 PRECHECK 회귀/원문을 이 PR에서 바꾸지 않는다.

## 단계별 연결 순서와 담당 인계

1. **이번 단위:** 공통 문서·독립된 합성 fixture/순수 검증을 Draft PR로 검토한다. PR71/72·공통 계약의 소유자 간 DTO 소비 합의가 남는다. 제품 HTTP/DB 변경 없음.
2. **원천 담당:** PR71의 read-only facts에 reader/pin acquisition receipt·실패 terminal/query generation·원문 수명 callback을 어떻게 연결할지 제안/검토한다. 전용 모듈 변경은 원천 담당 PR에서 한다. 종료한 lab/실계정 재실행은 별도 승인 범위다.
3. **공통 normalization/registry 담당:** 합성 plain text mapping부터 host-issued sidecar·권한/수명·HTML 미지원 상태를 붙인다. HTML 확대와 private source 설정은 별도 검토한다. 기존 C2 합성-only 업로드 제한을 해제하지 않는다.
4. **AI 담당:** 별도 사실 receipt hash/projection version을 소비하는 adapter와 결과 binding을 구현한다. PR72의 누락/판독불가 사유·근거 위치 개선 결과를 인수한다. 추가 유료 호출은 이 계약의 승인 범위가 아니다.
5. **공통 수락 담당:** 하나의 correlation ledger·C2 mutation coordinator/CAS·멱등/복구·권한 조회를 별도 작은 구현 PR로 연결한다. 실패 주입/경쟁/만료/재시작 인수 후에도 운영 Evidence 수락은 별도 신뢰 관문이다.
6. **평가/화면 담당:** sourceStatus와 contentStatus·과거/현재·보완 사유를 각각 소비하고, M2/C3로의 사실 import는 독립 청구/신뢰 인터페이스 판단 뒤 별도 승인한다. web/는 공통 담당이 수정하지 않는다. 지급·재원·main/배포는 포함하지 않는다.

## 재현과 증거

실행 명령: `./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/review-source-contract.test.mjs`.

fixture는 `specs/m3/review-source-binding-fixture.mjs`, 실행 가능한 계약 제안은 `specs/m3/review-source-binding.mjs`다. unmerged PR71/72를 import하지 않고 동일 DTO의 공개 인공 벡터만 사용한다. 새22/22은 구조/지문/현재성 전제 검사이며 실제 source authentication·DB 원자 수락·원문 수명 실행·AI 품질 검증이 아니다. 기존 CI의 product-workflow glob에 포함되며 root CI 파일/의존성은 변경하지 않는다. 실제 Moodle API13/13·Gemini8건과 합산하지 않는다.

[검증 기록](moodle-review-c2-verification.json)과 Draft PR의 정확 head CI를 함께 확인한다. 단일 팀 인계는 [MVP_SOURCE_HTTP_HANDOFF](MVP_SOURCE_HTTP_HANDOFF.ko.md)다. 문서 작성 중 PR71/72의 뒤따르는 개선은 위 고정 검토 head와 구별한다.

최종 로컬 검증: 새22/22 포함 공통 workflow/AI/document 회귀259/259, 원본/legacy191개·의존성 graph 보존 PASS, diff PASS. public history와 원격CI는 Draft PR의 정확 head를 따른다. 제품 코드·root CI·의존성 변경은 없다.
