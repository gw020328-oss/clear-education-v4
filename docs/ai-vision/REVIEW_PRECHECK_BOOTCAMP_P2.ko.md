# Python 부트캠프 P2 회고 관찰 연결 — 2026-10-17

**MOCK_ADAPTER_IMPLEMENTED / REAL_MODEL_NOT_TESTED / PRODUCT_ACCEPTANCE_PENDING.** P0 fixed commit `03fa64324ef9cc2ce4fb442a612329a7b1285677`를 기존 PR72 브랜치에 정상 merge했다(merge commit `4bec9a3`). 그 의존 이력의 develop `9c542c3`/PR74 bridge를 포함하며 common/P0 파일을 직접 고치거나 복제하지 않았다. 새 세션/하위 에이전트는 만들지 않았다. 요청·권장은 GPT-6.1 Sol/Medium이며 현재 턴에서 실행 모델 ID를 독립 확인하거나 전환하지 않았다.

## 범위와 재사용

`src/document-precheck/review/bootcamp-reflection.mjs`는 P0 `p0-contract.mjs`의 frozen policy/hash/gates와 기존 `invokeMockObservation`, `validateGroundedReview`를 소비한다. 기존 EXAM/DAILY/BOOLEAN compiler, Review/C2 RunContext, FIXTURE/LOCAL 어댑터를 회고 의미로 바꾸지 않는다. capability는 정확한 `REFLECTION_REQUIRED_TOPICS.1`, criterion은 P0의 `reflection-topics`다. 세 topic ID도 frozen policy에서 읽는다.

내용 관찰은 work-performed(수행 내용), problem-solving-process(문제해결·점검 과정), learning-takeaway(배운 점)만 다룬다. 문제없음의 명시와 실제 점검 과정도 허용한다. 문제가 있었던 것처럼 쓰게 요구하거나 긍정성·성의·전반 실력을 점수화하지 않는다. 사진/Vision·최소 글자수·점수·수치·기한·서명 요건을 추가하지 않는다. 빈 입력은 모델 호출0/INPUT_UNAVAILABLE·UNCERTAIN이며 ‘미제출’ 판정으로 바꾸지 않는다. 제출 여부·Moodle 완료/과제 SUBMITTED 상태·숫자/날짜·서명 검증은 다른 producer 책임이다.

P0의 `reflection-example.json` 원문과 **새 MOCK_RECORDED** 응답만 사용했다. 기존 실제 Gemini8건은 다른 일반 후기 개발 자료이며 Python 회고 성능으로 재표기하지 않았다. 이번 추가 Gemini 생성/countTokens·키 조회·실제 API 요청은0이다. 새 유료 승인은 없고 소진된 원장을 재사용하지 않았다.

## 명시적 observation context · 내부 제안

P0 문서는 wrapper의 최소 관계를 고정했으나 실행 schema는 공통 runtime 담당의 소유다. 아래는 전용 모듈의 **검토 가능한 내부 proposal**이며 기존 endpoint/schema나 Evidence wire가 아니다. 별도 `validateReflectionContext`는 구조/고정 정책/상관관계만 확인하며 runtime compiler·인증·source/signature verifier를 복제하지 않는다.

`clear-bootcamp-observation-context.1`의 필드는 다음과 같다.

| 필드 | 이번 해석 |
| --- | --- |
| dataScope | ISOLATED_SYNTHETIC_ACCOUNT. 임의 개인정보 업로드 허가가 아님 |
| participantId/applicationId/policyHash/criterionId/capability | trusted host가 고정. 정확한 P0 policyHash/criterion/capability만 허용 |
| evidenceId/evidenceRevision | 원문이 바뀌면 host가 새 revision/head를 발급. 기존 자료에 새 판정 덮어쓰기 없음 |
| sourceId/inputHash | 원본 회고 **body만** 입력. inputHash는 변환 전 body의 UTF-8 bytesDigest. title/image는 지원하지 않음 |
| sourceVersion/sourceHash/sourceReceiptHash/sourceStatus | OBSERVED_TARGET 또는 UNAVAILABLE. UNAVAILABLE는 세 source pin 모두null이며 옛 성공을 재사용하지 않음. input body가 남아 있으면 내용 관찰은 가능 |
| runtimeMappingHash/requestHash | 실제 mapping/request의 검증은 producer/host 책임. AI가 수치 ID·request binding을 만들어내지 않음 |
| normalizerVersion/normalizedHash | 둘다null 또는 source 관측이 있는 paired pins. normalized 내용을 AI 원문으로 대체하거나 그 offset을 사용하지 않음 |
| runId/attempt/modelVersion/promptVersion/profileHash | exact MOCK adapter·prompt `clear-bootcamp-reflection-prompt.1`·profile pin. profileHash는 정책/세topic/전체 지시문 버전에 결합 |
| issuedAtMs/expiresAtMs | 실제 UTC epoch milliseconds. 양끝은 [issued,expires). 최대값은 P0 raw/request 상한의 최솟값900초. host는 실제 raw/auth/query/request/source freshness의 더 짧은 lease를 반영해야 함 |

P0의 source epoch seconds를 milliseconds로 변환하는 책임은 host에 있다. 압축 시계를 실제 원천시각·signed timestamp에 적용하지 않는다. context에 source observed timestamp/원천 검증 정보가 모두 있는 것은 아니므로 이 어댑터가 Moodle 신선도300초를 독립 검증했다고 주장하지 않는다. sourceStatus는 AI 내부 관측 상태이며 Evidence.verification의 VERIFIED_LOCAL_API/MOCK_VERIFIED로 자동 매핑하지 않는다.

호스트 연결 서명은 `createBootcampReflectionSession(() => ({context,rawAvailable}), {nowMs})`, `session.review({context,text}, mockAdapter, {signal,timeoutMs})`, `session.consume(receipt)`다. resolver는 현재 인증/소유권/정책/자료 head를 확인한 서버 callback이어야 한다. rawAvailable=true가 필요하고 철회·만료·오래된 context는 차단한다. 브라우저가 context/rawAvailable/verified를 스스로 선언하는 새 API는 없다. 이 모듈 자체가 임의 실제 개인정보인지 판별하거나 실제 동의/접근권을 인증하는 것은 아니다.

## 세 topic·원문 근거·보완

모델 경계는 `{topics:[{topicId,state,evidence}]}`만 허용한다. topic은 정확히3개씩 한번, state는 PRESENT/MISSING/UNCERTAIN/CONFLICT다. PRESENT에는 `{sourceId,quote}`가 필요하며 sourceId는 host 원문과 같아야 한다. 기존 grounding primitive가 해당 quote를 원문에서 정확하고 유일하게 찾아 UTF-16 span을 계산한다. 없는/다른 source/정규화된/중복으로 위치가 모호한 인용은 해당 topic만 UNCERTAIN/UNSUPPORTED_EVIDENCE로 바꾸며 임의 첫 위치를 고르지 않는다. 다른 정상 topic은 보존한다.

MISSING/UNCERTAIN/CONFLICT는 evidence=null이다. 각 topic의 고정 보완 문구는 ‘수행 코드·작업 설명’, ‘문제 점검·대응 또는 문제없음+점검 설명’, ‘배운/확인한 점 설명’으로 구분한다. 모델이 읽을 수 없거나 자료/사유가 불명확하면 확인된 것처럼 채우지 않는다. 잘못된 전체 output·timeout/cancel/model error는 고정 사유로 남기며 raw 오류는 공개하지 않는다. `PRESENT`의 의미 적합성은 모델 관찰이며 코드는 인용의 위치/동일성을 검증한다. 인용이 실제로 존재한다는 사실만으로 의미 판단의 정확성까지 증명하지 않는다.

반환 `clear-bootcamp-reflection-observation.1`은 context/hash, originalBodyHash, topic별 state/고정 reasonCode·supplement와 `{sourceId,start,end,quoteHash}`, contentStatus/outcome, sourceStatus/current, observationHash 및 P0_GATES다. **원문·quote·후보값·모델 전체응답은 반환 요약에 없다.** 원문과 상세 모델 인용은 해당 호출의 메모리에서만 사용하며 JS/GC·외부 호출자 보유본의 물리적 삭제는 보장하지 않는다. 기존 grounding의 최대 quote240/본문32000 기술 상한은 전송/메모리 제한이며 정책상 최소 글자수나 성의 평가가 아니다.

contentStatus CHECKED는 세 내용이 관찰된 것뿐이다. sourceStatus=UNAVAILABLE+contentStatus=CHECKED도 가능하고 **verifiedEvidenceCondition은 항상 UNKNOWN**이다. 전체4AND/실제 Evidence.condition/지급 여부를 여기서 확정하지 않는다. 실제 수락은 host가 신뢰한 source/participant/request/integrity/freshness와 허용된 AI 실행/자료/정책을 별도로 검증해야 한다. P0 Evidence/Decision·DB·ledger·transaction을 새로 구현하지 않는다.

## 현재성·수명

시작/dispatch 직전/완료/consume에서 정확 contextHash·lease/rawAvailable을 대조한다. participant/application/policy/criterion/evidence revision/sourceVersion/hash/receipt/mapping/request/input/run/attempt/model/prompt/profile/normalizer 변화로 옛 결과를 최신으로 소비하지 않는다. source lease가 먼저 끝나도록 mock timeout을 제한하고 cancel/원문 접근 철회/clock 역행도 차단한다. 새 evidence가 진행 중 옛 응답이 도착하면 STALE/current=false, locator=null로 반환한다.

동일 runId+attempt는 재사용하지 않는다. 새 attempt는 host의 새 context pin이 먼저 필요하다. 한 번 stale로 관측된 receipt는 이전 context가 다시 나타나도 살아나지 않으며 복사된 receipt를 consume할 수 없다. 이는 **in-process current 검사**이며 전역 durable nonce/ledger CAS·두DB 원자성·재시작 복구를 제공하지 않는다. 영속 수락 단계는 공통 제품 담당의 단일 transaction 책임이다.

## 검증과 실제/합성 구분

새 회고16개와 frozen P0 oracle20개를 묶은36/36 PASS. 전체 AI/document/product-workflow 회귀381/381 PASS(담당72+기존/P0/공통309), verify:workspace PASS(원본191개·의존 그래프 보존), diff-check PASS다. P0 specs/문서/인수test는 exact dependency commit과 diff0이며 의존 조상 관계를 확인했다. 모델 실제 품질/실제 source·Moodle ID·서명·DB·지급 성공이 아니다. CI의 담당 경로 glob은 기존 root CI 밖이므로 로컬 시험과 구분한다.

시험은 public 새 회고+저장 MOCK 응답 재생, topic별 누락/모호함, 명시적 문제없음+점검 과정, 부정적 의견/문서 명령, 없는/조작/다른source/중복/NFC 인용, UTF-16, conflict, source 불가+내용 정상에서도 AND UNKNOWN, 정책/자료/run/mapping/request 변경 중 late, 보완 후 최신, timeout/cancel/expiry/raw 철회/clock 역행/ACTUAL·재사용 거부를 포함한다. oracle가 MOCK producer assertion을 대조한 결과를 실제 모델이나 원천 검증으로 바꾸지 않는다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/bootcamp-reflection.test.mjs tests/product-workflow/bootcamp-p0-contract.test.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/*.test.mjs tests/ai-policy/*.test.mjs tests/document-precheck/*.test.mjs tests/product-workflow/*.test.mjs
./tools/node tools/verify-workspace.mjs
```

고정Node24.21.0/기존 의존성만 사용했으며 전역 설치·package/lock 변경은 없다. 로그는 Git 제외 `artifacts/bootcamp-reflection-tests.txt`다. 공개한 저장 응답은 MOCK_RECORDED_NOT_ACTUAL_MODEL 표기를 유지한다. 기존 실제 Gemini8건은 기존 회귀에서 별도 기록을 재생했을 뿐 새Python 회고 평가로 합산하지 않았다.

## 통합 담당에게 남기는 필드 질문·관문

1. 공통 runtime은 이 wrapper의 evidenceRevision/sourceId·epoch milliseconds/정규화 paired-null/UNAVAILABLE source pins와 Evidence·source producer의 필드 관계를 확정해야 한다. 현재 내부 proposal을 기존 C2 RunContext나 제품 wire에 조용히 넣지 않는다. 정책 revision/profile 갱신 시 기존 확인/자료/판정의 재확인과 stale 처리가 필요하다.
2. sourceReceiptHash·sourceVersion/hash·runtimeMappingHash/requestHash가 실제 source/참가자·신청·원문에 결합됐는지는 host가 확인해야 한다. 이 값과 current resolver를 같이 위조하는 공격자를 hash만으로 막는 서명 검증기가 아니다. mapping ready=false/actualIds=null인 P0 기본 예제에 실행 가능한 숫자 ID를 발명하지 않았다. Moodle 담당의 정확 report commit을 API 담당이 pin해야 한다.
3. 누가 어느 body를 읽을 수 있는지, 최소 raw/auth/source/query/request lease, invalidation·영속 correlation·CAS/중간 실패·재시작, producer를 신뢰하는 수락 권한은 제품 API/저장 담당 후속이다. AI summary는 전체 AND의 verified evidence가 아니며 조건/자격/배정/지급과 분리한다.
4. title 내부 인용/image region·사진 주필수·M1 점수 매핑은 추가하지 않았다. 실제 모델 새 회고 품질을 보려면 별도 corpus/호출/비용 승인과 실행기 pin이 필요하다. 이번에는 유료/키조회0으로 끝낸다. P3/P4/P5는 관계/설계 관문만 보존한다.

직접 변경은 담당 review module/tests/REVIEW_PRECHECK docs뿐이다. 공통 runtime/schema/registry/normalizer/contract/ledger/HTTP/DB/CI/package/web·독립청구를 직접 수정하지 않았다. dependency merge에 나타나는 공통 파일은 그 이력이다. grant/outbox HOLD·paymentAllowed=false·독립NO_GO·C2 합성-only/개인자료 제한,400/500 제외·예치/배정/충전/PG/회수/분쟁시간 OPEN을 유지한다. PR72는 Draft로 갱신하고 자동 머지·배포하지 않는다.
