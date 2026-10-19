# LOCAL 후기 receipt 소비 어댑터 — 2026-10-17

**OFFLINE_MOCK_CONNECTION / LOCAL_HOST_IMPLEMENTATION_PENDING / NO_PRODUCT_ACCEPTANCE.** 기존 PR72와 작업본/브랜치를 재사용했고 공통 fixed commit `31879659e11d9cbfa0aa88e48d825047080f4e39`를 정상 merge했다(merge commit `672681c`). 공통 정본은 `docs/current/REVIEW_BRIDGE_V1.ko.md`와 `src/review-evidence/common/contract.mjs`다. 고정 contract/example/인수 test 파일은 fixed commit과 byte 변경이 없고 별도 복사본을 만들지 않았다. dependency 이력의 공통 문서/spec/test 변경과 아래 AI 소유 직접 변경을 구분한다. develop/main에는 병합하지 않는다.

요청/권장 설정은 Sol/Medium 일반 소비자 구현이다. 현재 턴의 실제 런타임 ID 독립 확인/전환은 하지 않았다. 추가 Gemini 생성/countTokens·키 조회·실제 Moodle API 요청은 모두0이다. 과거 실제 Gemini8건 및 Moodle 담당13건을 이번 시험 분모에 합산하지 않는다.

## 실행 인터페이스

신규 파일은 `src/document-precheck/review/local-projection.mjs`다. 기존 FIXTURE DTO/`review.mjs`와 grounding v1/v2·소진된 평가 원장/실행기는 보존했다. 새로운 LOCAL projection을 FIXTURE나 약관 sourceBundle에 넣지 않는다.

```js
const session = createLocalReviewProjectionSession(
  () => ({ context: trustedCurrentContext, projection: trustedCurrentProjection }),
  { nowMs: trustedClock }
);
const result = await session.review(
  { context, policy, submission, files, projection, sources },
  mockObserver,
  { signal, timeoutMs: 1000 }
);
const currentView = session.consume(result);
```

resolver/clock는 인증된 host의 동기 callback이며 browser 요청에서 그대로 구성하지 않는다. policy는 기존 in-process bound policy handle, submission/files는 기존 C2 원문/원본bytes다. observer는 기존 modelVersion/method/fieldIds/prompt profile과 일치하는 MOCK만 허용한다. ACTUAL 실행은 호출 전에 거부한다. 기본1000ms/최대30000ms이며 실제 observer timeout은 남은 projection lease보다 길어지지 않는다.

1. `validateLocalReviewSources`가 공통 `validateReviewProjection`과 기존 C2 `verifyDocumentManifest`를 실행한다. `projection.submittedSources`의 title/text 두 sourceId를 ephemeral `{sourceId,kind:TEXT,text}`와 정확히 대응하고 UTF-8 bytesDigest를 재계산한다. C2 해당 post의 **변환하지 않은 title/text와 문자열까지 같아야** 한다. NFC/LF 정규화 후 text/hash를 함께 바꿔도 원문과 다르면 거부한다. 추가/누락/중복 source·다른part/post/이미지bytes 교체를 허용하지 않는다.
2. 시작/실제 mock dispatch 직전/완료/결과 구성 직후/consume에서 host 최신 context·projection을 공통 `assertReviewProjectionCurrent`로 대조한다. projectionHash가 receipt/registry/query/sourceRunId/generation/attempt/normalization/원문ref/lease를 모두 고정한다. host가 projection을 바꾸거나 lease가 끝나면 옛 결과는 STALE다. clock 역행도 차단한다. 최초 입력이 오래됐으면 모델 호출 전 오류이고, 실행 뒤 변경은 STALE 기록이다.
3. 기존 `createReviewPrecheckSession`→`reviewWorkflowDocument`를 재사용해 M1/C2 binding·policy/rule/plan/display/preview/manifest·submission/input/assets·run/attempt·관찰 필드·정확 quote/locator를 검사하고 결정적 CODE와 관찰을 함께 검토한다. 이때 sourceFacts는 null이며 LOCAL projection을 FIXTURE로 변환하지 않는다. 새 날짜/사진/분량 규칙을 추가하지 않는다.
4. 유효한 모델 출력에 대해서만 transient `groundLocalReviewObservations`를 계산한다. TEXT_AI의 C2 locator/quote를 projection의 원문 text sourceId/hash·UTF-16 start/end에 대조한다. 조합문자/서로게이트가 있는 원문에서도 정규화 본문의 offset/quote를 대용하지 않는다. null에는 evidence=null/NO_LEGIBLE_EVIDENCE를 유지한다. VISION은 실제 manifest의 post/image/sha256/assetsHash를 가리키는 IMAGE_ASSET만 만든다. 이는 원본파일 결합일 뿐 내부행/영역·decode·문자인식·원문 byte 수 검증이 아니다.
5. 최소 반환은 공통 `clear-review-bound-observation.1`이며 `validateBoundReviewObservation`을 통과한다. runContextHash/sourceProjectionHash/sourceReceiptHash/sourceStatus, contentStatus/outcome/current, 기존 REASON_CODES, observationResultHash와 BRIDGE_GATES만 담는다. 원문·후보값·quote·모델응답·파일bytes는 반환 summary에 없다. grounding은 결과 hash를 만들 때만 쓰며 내부 record 저장소에 붙이지 않는다. 공개 helper의 상세 반환은 transient 진단용이므로 DB/로그에 저장하지 않는다. 기존 workflow의 owned image copies wipe와 개인정보 제한을 유지한다. 호출자 보유 bytes나 JS 문자열/GC의 물리적 삭제는 보장하지 않는다.
6. 반환의 current는 발급 시점 snapshot이다. 소비자는 `consume`/`isCurrent` 및 향후 공통 host CAS를 반드시 사용해야 한다. 오래된 receipt를 복사해 새로 수락할 수 없고, 한번 stale로 관측한 receipt는 이전 projection이 다시 나타나도 되살리지 않는다. cancelled/timeout/model failure는 기존 고정 이유의 NEEDS_REVIEW이며 성공으로 변환하지 않는다. source/context가 바뀐 취소는 STALE다. 실제 영속 수락/CAS/DB·권한 세션은 이 모듈에 없다.

## 원천과 내용 상태

| sourceStatus | contentStatus 예 | 결과 의미 |
| --- | --- | --- |
| OBSERVED_TARGET | CHECKED | host가 준 LOCAL projection의 관측 대상과 내용 사전검토가 결합됨. 게시·실명·기관 인정·자격/지급 완료가 아님 |
| UNAVAILABLE | CHECKED | 내용 자체는 사전검토 충족 가능. sourceReceiptHash/sourceRevision/normalization=null, SOURCE_UNVERIFIED 이유. 과거 성공 receipt fallback 없음 |
| 어느 쪽이든 | MISSING/UNREADABLE/NEEDS_REVIEW/POLICY_OPEN | 자료 누락/판독불가/충돌·보완/정책 미확정은 sourceStatus와 별개 |
| 옛 projection/run/lease | STALE/current=false | 과거 메타데이터와 원천상태의 이력일 뿐 현재 성공으로 소비 불가 |

LOCAL provenance를 SYNTHETIC Evidence로 바꾸거나 정책 sourceBundleHash를 후기 receipt hash로 치환하지 않는다. synthetic bound-policy **실행**과 LOCAL shape의 **mock host projection** 시험이다. 실제 source wrapper/acquisition·registry·normalizer/내용 일치·lease 발급은 이 어댑터가 실행/인증하지 않았다. 공통 fixed vector의 plan hash는 wire 예시이므로 helper metadata 검사에만 쓰고, 실행 시험의 query/projection은 실제 기존 합성 bound-policy fixture에서 별도로 구성했다.

## 검증

네트워크 차단 상태로 새 LOCAL16개+fixed contract4개=20/20 PASS, 기존 FIXTURE/grounding/AI/C2/공통 회귀를 합친 **319/319 PASS**, verify:workspace PASS(원본191개·의존 그래프 보존), diff-check PASS다. fixed commit 조상 확인 및 contract/example/인수 test와 fixed SHA 간 diff0을 확인했다. 로컬 결과이며 최신 remote CI는 PR72의 정확한 head와 함께 별도로 확인한다. 새 담당 test 경로는 기존 root CI glob 밖이므로 CI 성공을 LOCAL16개 실행으로 표시하지 않는다.

시험은 UNAVAILABLE+CHECKED·MISSING/UNREADABLE/CONFLICT/OPEN 구분, 옛 receipt/registry/query/generation/attempt/run/submission/input/assets/normalizer/hash, 원문 source bytes·part·ID·NFC 대체, image bytes 교체, 원본 UTF-16 인용, dispatch 직전 expiry·완료 후 lease·clock 역행·취소/timeout·host revocation, 보완 후 최신 UNAVAILABLE 결과에 옛 성공이 도착하는 경우, 복사/replay/ACTUAL 차단을 포함한다. 결과 summary의 raw 부재·고정 gates 및 기존 owned image copies wipe도 확인했다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/*.test.mjs tests/ai-policy/*.test.mjs tests/document-precheck/*.test.mjs tests/product-workflow/*.test.mjs
./tools/node tools/verify-workspace.mjs
git diff 31879659e11d9cbfa0aa88e48d825047080f4e39 -- src/review-evidence/common/contract.mjs specs/m3/review-bridge-example.mjs tests/product-workflow/review-bridge-contract.test.mjs
```

고정 Node24.21.0은 기존 설치본을 PATH로 사용했고 전역 설치·package/lock 변경은 없다. 로컬 로그는 Git 제외 `artifacts/review-local-projection-tests.txt`다. 개인자료·실제 증명·키·토큰을 읽거나 공개 fixture로 복사하지 않았다.

## 필요한 공통 연결 / 남은 관문

- host는 registry/query/acquisition과 실제 원천 내용을 검증해 projection을 발급해야 한다. 이 소비자는 **신뢰한 최신 projection과의 pin 대조**만 하며, facts/receipt 원문이 입력에 없으므로 sourceReceiptHash나 normalization hash의 진위를 독립 검증하지 못한다. host 입력과 current resolver를 함께 조작하는 공격자를 해시만으로 막는 인증기로 설명하지 않는다.
- host projection의 expiresAtMs에 raw/auth lease/query의 최솟값이 반영되어야 한다. lease 발급자·freshness 검증·정책 비활성 이벤트·logout/원문 삭제·crash gap·두 DB mutation coordinator·영속 correlation ledger/단회 CAS/HTTP/DB 수락은 공통 후속이다. 전용 endpoint나 별도 registry/normalizer를 복제하지 않았다.
- 기존 C2 TEXT_AI locator는 `post/.../text/start/end`만 지원한다. title은 현재 원본 hash와 제출 결합을 검사하되 title 내부 AI quote 실행 경로를 새로 만들지 않았다. title 관찰이 필요하면 공통 locator 계약 합의가 먼저다. 정규화→원문 offset map과 image 내부 region도 현재 미지원이다.
- 공개 상세 grounding helper는 현재 lookup/lease를 스스로 발급하지 않는다. 호스트가 현재로 수락한 in-memory 문서에만 적용하고 원문을 계속 보유하는 저장 경로로 바꾸지 않는다. v2 prompt/schema 실제 모델 품질은 여전히 미검증이고 이전 유료 승인 소진 상태다. 이번 연결을 이유로 새 예산을 사용하거나 키를 조회하지 않는다.

400/500 제외, 예치율/배정/충전/PG/회수/분쟁시간 OPEN, grant/outbox HOLD·독립청구 NO_GO·paymentAllowed=false·C2 합성-only/개인자료 제한은 그대로다. 공통 schema/contract/registry/normalizer/ledger/HTTP/DB/web/CI/package/독립청구를 직접 수정하지 않았다. 전체 수락·운영 서비스 구현 완료를 주장하지 않으며 PR72는 Draft·자동 머지 금지다.
