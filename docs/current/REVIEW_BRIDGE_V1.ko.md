# 후기 연결 고정 계약 v1 · 담당별 소비/인수

2026-10-17. 요청 Sol/High, 실제 런타임 모델 ID 독립 확인 없음. 이 문서는 PR71·72·74 최신 연결 계약 리뷰 뒤 양쪽 담당에게 전달하는 **내부 모듈 계약**이다. 제품 LOCAL 수락·HTTP/DB·운영 권한을 열지 않으며 develop/main 병합 승인이 없다. 기존 [PR74 계약 제안](MOODLE_REVIEW_C2_CONTRACT.ko.md)의 미구현/미지원 설명은 아래 고정 계약과 각 후속 구현 증거로만 갱신한다. 기존 proposal fixture를 제품 wire로 재해석하지 않는다.

## 검토 기준과 고칠 모순

| PR / 검토 head | 확인 | 이번 고정점 / 담당 |
| --- | --- | --- |
| PR71 `45a682fc5efcbd474903241ae06f596da9b4cd3e` | 실제 격리 합성 Moodle13/13, LOCAL facts v1은 source HTML·query/run 상관관계만 제공. reader의 확인은 실행 안에 있지만 반환 pin receipt가 없음 | facts v1은 보존하고 새 query/acquisition envelope를 Moodle 전용 wrapper에서 반환. query의 reader/site_info 관측 reader·실제 facts를 한 실행에 묶고 hash 발급. Moodle 담당 |
| PR72 `bdbd7ccdadd161f3141a30244e89279ff8fa7776` | FIXTURE source 입력과 LOCAL receipt는 호환되지 않음. grounding은 원문 quote·UTF-16 span/UTF-8 hash만 검증. 실제 v2 모델 성능 미검증 | 별도 LOCAL projection 버전 소비 어댑터·결과 binding. sourceStatus/contentStatus 분리, 원문 근거 위치 보존. AI 담당 |
| PR74 `61aee6f00eb862ec56a89f839257b543cc1cb62c` | plain text-only fixture를 실제 HTML에 적용할 수 없음. acquisition sidecar가 fixture-only. 원천 bundle/정규화·두DB 원자성 오인 위험 | 새 공통 contract/소비 예시 고정. 제한된 HTML profile·registry/내용 결합·원문 lease 어댑터는 공통 담당만 구현. 제품 수락/ledger는 계속 미구현 |

세 PR은 Draft·미병합이다. 참조 실측/모델 평가 수를 이번 새 시험 수에 합산하지 않는다. 불완전 페이지/권한/삭제 placeholder를 게시 부재로 판정하는 새 API나 사진 가상정책을 추가하지 않는다.

## 코드·버전 정본

고정 코드는 `src/review-evidence/common/contract.mjs`, 공개 소비 벡터는 `specs/m3/review-bridge-example.mjs`, 인수 전제 검사는 `tests/product-workflow/review-bridge-contract.test.mjs`다. PR74의 계약 고정 commit을 양쪽 작업 브랜치의 공통 의존으로 정상 merge해 같은 파일을 import한다. **파일을 복사해 담당별로 수정하거나 specs v1 proposal을 각자 확장하지 않는다.** 공통 경로 충돌은 수정하지 말고 통합 담당에게 보고한다. develop/main merge나 강제 push·보호 우회는 없다.

| 버전 | 입력/역할 | 발급·검증 함수 |
| --- | --- | --- |
| `clear-review-query.1` | exact RunContext hash·registryHash, PR71의 exact pin, sourceRunId/generation/attempt, host issued/expires epoch ms | `createReviewQuery`, `reviewQueryHash`, `assertReviewQueryCurrent` |
| `clear-review-acquisition.1` | queryHash·pinHash·expected/observed reader ID, factsHash·sourceRevision·observed ms·expiry·run/generation/attempt | `createReviewAcquisition`, `validateReviewAcquisition`, `reviewAcquisitionHash` |
| `clear-review-source-projection.1` | 별도 sourceReceiptHash, 원문/정규화 metadata, C2 submission/input/assets ref·raw source IDs/hash, sourceStatus | `validateReviewProjection`, `reviewProjectionHash`, `assertReviewProjectionCurrent` |
| `clear-review-bound-observation.1` | exact RunContext·projectionHash·sourceReceiptHash/sourceStatus, 별도 contentStatus/outcome·기존 고정 reason codes·resultHash | `validateBoundReviewObservation` |

`bridgeHash(kind,value)`는 `CLEAR-REVIEW-BRIDGE-${kind}.1` domain과 기존 canonical/digest를 사용한다. raw bytes SHA-256은 기존 `bytesDigest`, Moodle sourceRevision은 PR71과 같은 `digest('CLEAR-MOODLE-REVIEW-FACTS.1',source)`다. hash는 상관관계/변조 대조이며 인증·실명·기관 인정·서명 증명으로 부르지 않는다.

모든 새 record는 `BRIDGE_GATES`: realDataAllowed/usableForAcceptance/identityVerified/automaticEligibility/productEligible/paymentAllowed=false, academyAcceptance=UNKNOWN, grant/outbox=HOLD, independentClaim=NO_GO. dataScope는 ISOLATED_SYNTHETIC_ACCOUNT이며 LOCAL provenance를 SYNTHETIC Evidence로 바꾸지 않는다. 실제 개인 계정·C2 임의 업로드 제한을 열지 않는다.

## Moodle 담당의 고정 인수 계약

기존 `readReviewFacts`와 DTO는 보존한다. 새 전용 wrapper의 제안 서명은 다음과 같다(함수 이름은 담당 모듈에서 명시).

`readReviewAcquisition({client,context,query,getCurrentQuery,getCurrentContext,getCurrentPin,signal,now}) -> {facts,acquisition}`

- query는 host가 발급하고 pin은 query.pin을 복제해 사용한다. 임의 browser pin/verified를 승인하는 endpoint는 없다. 시작/완료 시 `assertReviewQueryCurrent(query,reviewQueryHash(await getCurrentQuery()),now())`와 기존 context/pin 재검사를 한다. query generation·attempt/run·registry/reader 변경·expiry/취소는 발급 전에 거부한다.
- 관측 reader는 실제 같은 read 실행의 `core_webservice_get_site_info.userid`에서 가져온다. expected reader를 observed 값으로 복사하지 않는다. wrapper 내부의 trusted client proxy로 그 응답을 포착하거나 기존 내부 구현을 재사용할 수 있다. 별도 사용자 API/재검증 기능을 새로 만들지 않는다.
- 성공한 facts에 `createReviewAcquisition({facts,query,observedReaderId})`를 적용한다. `sourceReceiptHash = reviewAcquisitionHash(acquisition)`. facts 원문은 메모리에만 있으며 acquisition에는 raw body/토큰/URL을 넣지 않는다. recipient/본인 확인은 기존 Binding과 registry의 host 상관관계뿐이다.
- 기존 함수 allowlist/localhost·권한/응답 한도·두 번 읽기·페이지 제한·같은 초 수정·최신성/cancel 정책을 유지한다. 사실 receipt의 consistency는 TWO_READS_NON_ATOMIC, reader 가시성은 AUTHENTICATED_READER_ONLY다.
- 권한/페이지/삭제/인증 실패는 성공 acquisition을 발급하지 않는다. 기존 고정 오류를 유지하고 raw 오류/token을 노출하지 않는다. 공통 host가 새 query generation의 UNAVAILABLE projection을 만들며 과거 성공 receipt로 fallback하지 않는다.
- synthetic/offline 성공·wrong reader/query generation/pin/registry/expiry/late/cancel/facts 변조 거부를 검사한다. 실제 재시험이 필요하면 기존 격리 합성 lab의 소유 리소스만 사용하고 실제/합성 결과 분모·정리를 별도로 기록한다.

Moodle 담당은 normalizer/registry/공통 contract/ledger/HTTP/DB/web를 수정하지 않는다. root package/CI도 이번 작업에 추가하지 않는다.

## AI 담당의 고정 인수 계약

기존 FIXTURE projection은 그대로 유지하고 별도 LOCAL 소비 어댑터를 만든다. 입력은 host가 전달한 `{context,policy,submission,files,projection,sources}`와 trusted current resolver다. public 예시의 projection/sources를 사용한다. UI가 source/receipt/hash/current를 선택하는 새 API는 없다.

- 시작/완료/결과 소비 전 projection을 exact context와 검증하고 `assertReviewProjectionCurrent`로 host의 현재 projectionHash/lease를 대조한다. receipt hash·registry/query/generation·run/attempt·submission/input/assets·normalizer가 바뀌면 이전 결과를 최신으로 수락하지 않는다.
- `projection.submittedSources`는 `{sourceId,postId,part,title|text,kind:TEXT,sha256,locationBasis:ORIGINAL_SUBMISSION_UTF16}`의 참조다(`part`만 title 또는 text). 별도 ephemeral `sources`는 `{sourceId,kind:TEXT,text}`이며 C2의 **변환하지 않은 해당 title/text**여야 한다. bytesDigest를 재계산해 projection pin 및 C2 post와 대조한다. 정규화된 Moodle 본문을 같은 sourceId로 바꿔 넣지 않는다.
- sourceStatus는 OBSERVED_TARGET 또는 UNAVAILABLE다. UNAVAILABLE는 sourceReceiptHash/sourceRevision/normalization=null이고 과거 성공을 재사용하지 않는다. 내용이 CHECKED일 때도 출처가 UNAVAILABLE일 수 있으며 PRECHECK_REQUIREMENTS_MET는 내용 사전검토만 뜻한다. 전체 원천 인증/자격 완료가 아니다.
- 기존 fixed bound policy/C2 manifest/필드 allowlist·MOCK 제한을 재사용한다. 새로운 사진/날짜 조건이나 문서 도구 실행을 추가하지 않는다. 원문 source ID/hash에서만 quote/UTF-16 span을 검증하고, 정규화 비교의 위치를 원문에 전용하지 않는다. IMAGE_ASSET는 파일 결합이며 내부 위치/내용 검증이 아니다.
- 최종 최소 record는 clear-review-bound-observation.1로 sourceProjectionHash/receiptHash를 결합하고 `validateBoundReviewObservation`을 통과해야 한다. contentStatus는 기존 상태 + STALE, reasons는 기존 REASON_CODES만 쓴다. raw quote/후보값/원문/모델응답을 결과 DB/로그에 저장하지 않는다. 상세 grounding은 transient 소유 자료다.
- 늦은 결과/보완 후 옛 결과·source 실패와 content 정상의 구분·receipt/원문/normalizer 변조·명시 source hash·누락/불명/충돌을 오프라인으로 검증한다. 실제 Gemini 승인 소진 상태이므로 유료 호출/키 조회 없이 진행한다. 공통 contract/registry/normalizer/ledger/HTTP/DB/web는 수정하지 않는다.

## 공통 어댑터의 고정 구현 경계

계약 고정/dispatch 이후 통합 담당이 최소 `src/review-evidence/common/normalizer.mjs`와 `bridge.mjs`를 구현한다. 공통 소유 경로는 이 디렉터리, docs/current, 공통 specs/m3·tests/product-workflow다. 동작은 registry/context/pin/acquisition 검증→원문 내용 대조→raw input refs/projection 발급까지다. source/AI 전용 모듈을 복사하거나 네트워크·모델·ledger·HTTP/DB 수락을 미리 구현하지 않는다.

`clear-review-html-subset.1`은 HTML DOM 실행/일반 sanitizer가 아닌 **명시한 제한 문법의 inert tokenizer/tree projector**다. 허용 태그: p/div/br 및 span/b/strong/i/em/u. 태그는 lowercase, inline 태그는 속성 없이 중첩 가능. div의 속성은 정확한 class="text_to_html" 한 개만 예외 허용한다. p는 inline/text/br만, div/root는 block children 또는 inline/text children 중 하나만 허용한다. block 사이 들여쓰기 공백은 구조적 공백으로 제거하며 본문 내부 공백/NBSP는 보존한다. div block wrapper는 추가 줄을 만들지 않고 p/inline div의 끝은 LF 한 개, 전체 끝의 구조적 LF 한 개만 제거한다. authored LF는 임의 trim하지 않는다. br는 LF다. entity는 amp/lt/gt/quot/apos/nbsp와 유효 Unicode numeric reference만 허용한다. NUL/잘못된 Unicode/control·comment/doctype·script/style·a/img/iframe·모든 기타 태그/속성·불균형/혼합 block는 RB_HTML_UNSUPPORTED로 거부한다. 크기128KiB·깊이32·노드2048 상한, 외부 URL/실행/리소스 로드는0이다. 이 문법 밖 실제 Moodle 표현은 연결 성공으로 기록하지 않고 지원 범위를 보고한다.

plain2는 기존 NFC/CRLF→LF profile, Moodle0/Markdown4는 계속 미지원이다. 제목은 plain으로 처리한다. HTML/원문은 rawBodyHash로 따로 고정하며 NFC/LF는 동일성 비교에만 사용한다. 정규화→원문 offset map은 미지원이고 AI는 원본 C2 sources만 받는다. tags/links/images 대응이나 기존 업로드/decode 제한 확대는 없다.

registry는 기존 전체 Binding·SourceBinding·reader/target·requirement/post·normalizer·freshness/검토 actor의 exact record를 clone/freeze해 ticket을 발급한다. C2 inputHash/assetsHash·revision을 다시 검사하고 raw expires/auth lease와 query expiry의 최소값을 사용한다. 작은 adapter의 current resolver는 인증된 host callback에만 의존하며 **DB CAS/감시/원자 수락/전역 정책 비활성 이벤트를 구현했다고 표현하지 않는다.** 영속 correlation ledger·C2 mutation coordinator/crash gap·운영 freshness/메타데이터 보관/실동의는 계속 차단 관문이다.

## 소비 예시·검증·병합 순서

`reviewBridgeExample()`는 동일 context/submission/files/registry/query/facts/acquisition/projection/unavailable/sources/nowMs를 반환한다. facts는 HTML `<p>…<br>…</p>`이고 sources는 원본 C2 title/text, projection의 normalization은 공통 HTML profile이다. 고정 commit의 예시는 기대 DTO 벡터이며 실제 parser·API·모델 실행 성공을 주장하지 않는다. adapter 구현 뒤 이 기대 벡터와 실제 projection을 대조한다.

고정 계약 인수 명령: `./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/review-bridge-contract.test.mjs`.

통합 순서: 공통 fixed commit 정상 이력 반영→Moodle·AI 전용 어댑터 각각 Draft→공통 제한 HTML/registry/lease adapter 별도 검증→양쪽 exact commit을 통합 작업 브랜치에서만 연결 시험→전체 수락/HTTP/DB는 별도 승인/작은 PR. develop/main PR 병합은 이번 범위가 아니다. source 전용 실제 로컬 시험과 공통/AI 오프라인 합성 시험, 실제 Gemini 품질을 분리한다.

400/500 신규범위 제외, 예치율/배정/충전/PG/회수/분쟁시간 OPEN, grant/outbox HOLD·독립청구 NO_GO·paymentAllowed=false. 팀원 web/와 독립 청구 작업은 변경하지 않는다.
