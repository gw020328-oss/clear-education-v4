# C3 합성 증거 수락·M2 평가 저장 계약

2026-10-15 계약 선행 단위. 기반 develop PR63 merge `890ad93cfb3677c5b4107428095c6f0b15efa9a4`. 요청 설정 GPT-6.1 Sol / High, 실제 런타임 ID 독립확인 없음. 단일 프론트 진입점은 [HTTP 인계](MVP_SOURCE_HTTP_HANDOFF.ko.md)다. 새 PR은 Draft/병합 미승인이다.

## 기존 목표와 이번 차이

PRD의 YBM 한 경로→시원스쿨 설정 기반 확장, 증거/조건/금액/최종성/재원 분리와 현재 M1/M2 계약을 따른다. C1은 합성 조건 ACK/본인 신청, C2는 등록 fixture bytes와 문서 사전검토, M2는 caller-pinned Evidence/Context를 평가하는 순수 함수다. 아직 HTTP에서 server binding으로 수락한 증거·최초 시험·선택·평가 결과를 원자 저장하는 계층이 없다.

이번 `clear-mvp-evidence-http.1`은 새 합성 전용 환경에서 C1을 재사용하고 새 단일 SQLite에 증거 영수증/선택/합성 정정 종료/평가 snapshot·최소 operation을 저장한다. M2 평가기·금고·독립 청구·기존 DB schema·web는 변경하지 않는다. YBM/시원스쿨은 같은 서비스에 host profile만 바꿔 연결한다. 공식 정책 확정이 아닌 기존 M1의 SYNTHETIC_ASSUMPTION·2030년 합성 일정이다.

## 신뢰와 고정 입력

- 본인 participant 세션·CSRF·동일출처/loopback HTTPS를 사용한다. body는 fixture ID·기대 revision·명시 선택/확인만 받는다. 점수/PASS/verified/Evidence/Context/Binding/source pin·model receipt를 받지 않는다.
- host가 고정한 공개 fixture와 정책 hash를 대조한다. 수락 시 실제 서버 C1 application/subject/recipient/instance/policy/product/cohort·ACK와 host의 institution/provider/course/계정 결합 및 sourceRevision을 구성한다. `VERIFIED_SYNTHETIC`은 공개 인공 assertion의 검증이며 실제 원천·동일인 검증이 아니다.
- C2 CHECKED/ACCEPTED를 Evidence로 import하지 않는다. 후기 사전검토에 대응하는 fixture는 authenticity/semantics UNKNOWN을 유지한다. 완주 시험의 별도 후기 승인 fixture는 명시된 인공 합성 assertion이며 AI 관측을 승격한 값이 아니다. BLOG는 M2의 원천 미확인 보류를 그대로 유지한다.
- 시간·점수·학습·이력은 host 공개 fixture만 소비한다. CLI는 고정 합성 일정에 상대 시간을 적용하고 이 시계를 config에 명시한다. 실제 날짜/자료를 시연에 맞춰 바꾸지 않는다. 시험/HTTPS demo의 시간 이동은 신뢰한 시험 host 주입이며 브라우저용 시각 변경 API는 없다.

## 상태와 원자성

신청별 C3 workflowRevision, factsRevision, selectionRevision을 분리한다. evidenceId는 요구조건별 안정 ID, evidence revision은 명시 보완마다 증가한다. 수락 영수증과 evaluation snapshot은 불변이고 같은 actor/app/kind/key·같은 body는 같은 operation이다. 다른 body는 충돌이다. BEGIN IMMEDIATE 안에서 세션/CSRF·현재 C1 ACK/정책·기대 revision을 재검사하고 evidence/heads/command 또는 evaluation/result/command를 함께 저장한다. 평가 자체는 동기 순수 함수라 별도 worker/두 DB 분산 수락이 없다. C1은 읽기만 하며 host 단일 실행 잠금을 전제한다.

최초 제출 시각과 최초 시험 참조는 서버가 첫 수락에서 고정한다. 첫 시험과 다른 시험 fixture로 교체하면 거부한다. 같은 시험의 명시 정정은 새 evidence revision으로 기록하되 최초 시험 참조를 보존한다. 정책/ACK 변경은 C3 epoch/facts/선택을 무효화하며 과거 영수증/최초 기록을 지우지 않는다. 이전 자료를 새 동의로 자동 재수락하지 않는다.

명시 tier 선택은 정확한 표시 preview hash와 `SYNTHETIC_SELECTION_ONLY`를 요구한다. 공식 선택 규칙은 OPEN이며 합성 EXPLICIT_SINGLE_TIER_NO_TOPUP만 시험한다. 최종성은 별도 `SYNTHETIC_FINALIZATION_ONLY` 명령과 정확한 현재 facts/selection revision 및 합성 정정 종료 기한을 요구한다. 최종화 후 새 보완/선택을 차단한다. 이것은 제품 권리/지급 확정이 아니다.

현재 조회는 최신 C1/정책·C3 epoch/revision과 대조하고 old result는 current=false로 표시한다. 저장된 과거 snapshot은 `historicalResult`로만 반환하며 현재 result는 null이다. GET/재시작은 모델·평가·증거를 재실행하지 않고 저장된 결과만 읽는다. 응답 유실은 GET operation/actor-route-key 복구, 자동 POST/새키 생성 금지. 시계 역행은 본인 권한 확인 후 차단한다.

## 구현된 HTTP

본인 `/mvp/applications/:applicationId` 아래 다음을 제공한다. 상세 DTO는 구현/실행 응답과 함께 고정한다.

| 경로 | 입력 / 의미 |
| --- | --- |
| GET `/evaluation-preview` | 현재 C1 ACK/정책·C3/facts/selection revision, requirement별 fixture catalogue·source/지원범위, 선택 표시 hash |
| POST `/evidence-receipts` | expectedWorkflowRevision, expectedEvidenceRevision(최초0), fixtureId → 서버 구성 Evidence/영수증 |
| GET `/evidence-receipts`, `/:receiptId` | 본인 수락 이력·revision/current·합성 관찰/신뢰 상태 |
| POST `/evaluation-selection` | expectedWorkflowRevision, selectionPreviewHash, tier, acknowledgement=SYNTHETIC_SELECTION_ONLY |
| POST `/evaluation-finalization` | expectedWorkflowRevision, expectedFactsRevision, expectedSelectionRevision, acknowledgement=SYNTHETIC_FINALIZATION_ONLY |
| POST `/evaluations` | expectedWorkflowRevision → 현재 서버 증거/context로 M2 실행·불변 결과/근거·계산·최종성 저장 |
| GET `/evaluations`, `/:decisionId` | 현재/과거 결과, evidenceSet/context hash·평가 시각·원래 판정/계산 근거 |
| GET `/evaluation-operations/:id`, `/:kind/:key` | evidence/selection/finalization/evaluations 명령 복구 |

기존64KiB JSON 상한, actor/route/key 멱등 및 고정 오류만 사용한다. 파일/raw/키/서명/실계정 입력이나 provider 호출이 없다. 한 환경의 수락/명령/결과 개수에 제한을 둔다. localhost 합성 개발 환경이며 운영 evidence 수락 capability는 false다.

## 필수 검증과 남은 범위

YBM 최초 접수→부족/미확인→명시 보완→선택→M2 후보→합성 정정 종료→저장 결과/재시작을 완주한다. 시원스쿨은 같은 인터페이스에서 OR/이력 UNKNOWN/200·300·400/500 및 금액 후보/상위 미확인 보류를 대조한다. 소유권/CSRF/위조 입력·정책/ACK 변경·최초 시험 교체/정정·중복/동시 CAS·응답 유실/재시작·원자 rollback·stale/시계 역행을 검사한다.

실제 Reclaim/Moodle/Vision→운영 Evidence bridge, 실제 동의/원천·동일인·게시 검증, 개인정보 수명·최종 권리/재원/청구는 미완료다. 예치/보관/배정/충전/회수 OPEN, 자격재원분리,400% PRECHECK_ONLY·500% 제외, grant/outbox HOLD, independentClaim NO_GO·paymentAllowed=false를 유지한다.

## 구현 확정과 재현

하위 이슈65 / `codex/mvp-evidence-evaluation-http`, 위 표의 경로를 구현했다. kind는 실제 명령 경로명 `evidence-receipts / evaluation-selection / evaluation-finalization / evaluations`이다. source/C1/C2 operation 경로와 섞지 않는다. 목록은 receipts 최근100개, evaluations 최근50개이며 전체 이력 완전성을 주장하지 않는다. 환경 전체 상한은 evidence1000/decisions500/commands2000, JSON64KiB다. receipt/selection/finalization/decision/command는 UPDATE trigger로 불변을 유지하고 삭제 API는 제공하지 않는다.

증거 fixture는 서버 전용 `specs/m3/evaluation-http-example.mjs`와 검토된 `evaluation-http-pins.json`에서만 구성한다. 브라우저는 preview.requirements[].fixtures의 ID와 상태만 사용한다. `score-ready/corrected/other-exam`, requirement별 ready/unverified/missing이 있다. `review-ready`는 공개 합성 승인 assertion이며 실제 후기를 승인하는 기능이 아니다. `review-unverified`는 C2 관측과 같은 미검증 의미를 시험할 뿐 C2 receipt import가 아니다. C3 host는 YBM 또는 시원스쿨 profile 하나를 설치하며 C2 third profile과 동시에 켜지 않는다. C2와 C3의 신청·정책을 이름만 같게 치환하지 않는다.

preview는 workflowRevision/factsRevision/selectionRevision, C1 ACK/Binding/표시 지문, source requirement·fixture·기대 evidence revision, tier별 quote/amount·deadlines, 현재 선택/최종성/최초 참조, selectionPreviewHash를 반환한다. `scenarioTime`은 현재 합성 시각이며 시간의 자연 경과만으로 표시 hash가 매초 바뀌지 않도록 선택 hash 바깥에 둔다. Evidence의 collectedAt/수락 당시 freshness·서버 acceptedAt은 분리한다. 초기 제출은 서버의 첫 수락 시각이며 기한 뒤 첫 제출을 과거로 보정하지 않는다.

성공 명령은 `{operationId,applicationId,kind,state:RECORDED,current,result,...gates}`. receipt result에는 recordId/receiptId,workflowRevision,current,createdAt,fixtureId,provenance,c1AcknowledgmentHash,evidence/evidenceHash,exam이 있다. Evidence/Context는 응답의 조회 근거이며 요청 권한 입력이 아니다. decision result는 decisionId,workflowRevision,current,createdAt,result/historicalResult,snapshot/snapshotHash,resultHash다. snapshot에는 고정 context/evidence/selection·C1 ACK·policy/sourceSet/rule hashes·amount가 있다. 현재면 result만, 이력이면 historicalResult만 제공한다. current는 최신 저장 revision/C1 문맥이라는 뜻이며 현재 시각으로 다시 평가했다는 뜻이 아니다. 같은 workflow revision의 새 평가 키도 이미 저장된 decision을 참조해 재실행하지 않는다. 보완·선택·명시 합성 최종화 뒤에만 새 평가 revision이 생긴다.

후기·학습·점수 관찰, 합성 원천/의미 assertion, rule state, tier별 quote, settlement/entitlement, fundingStatus와 모든 지급 gate를 분리한다. M2 FINAL_SYNTHETIC도 proofVerified/productEligible/paymentAllowed/claimAuthority=false다. 과거 result는 historicalResult로만 보여주며 현재 선택의 결론에 합치지 않는다.

정확 정책 hash/fixture configuration은 DB 환경 지문에 고정한다. C1 비활성/정책 변경/새 ACK이면 과거 결과와 readiness를 내려놓는다. 이번 고정 host에서 새로운 policy hash는 DOC/C3 확인을 자동 복원하지 않으며 EVAL_CONFIGURATION_REQUIRED다. 새로운 검토 설정은 새 합성 환경에서 시작한다. 기존 DB 자동 이관/재수락/기존 최초 시험 삭제는 없다. 필요하면 별도 명시 마이그레이션 설계를 받아야 한다.

오류:401 인증,403 역할/CSRF/출처,404 본인 범위 밖/없음,409 MVP_STALE/IDEMPOTENCY_CONFLICT/EVAL_CONFIGURATION_REQUIRED/EVAL_DISPLAY_CHANGED/EVAL_LIMIT/EVAL_FINALIZED/EVAL_PERIOD/EVAL_ACQUISITION_TIME/EVAL_FIRST_SCORE_LOCKED,413 BODY_SIZE,422 EVAL_INPUT/EVAL_SYNTHETIC_ONLY/EVAL_TIER/MVP_CLOCK. raw provider/경로/stack을 반환하지 않는다. 실패·응답 유실은 GET 복구하며 새 POST를 자동 만들지 않는다. 예약 worker가 없으므로 C3 전용 cancel API도 없다. 네트워크 취소가 DB rollback을 뜻하지 않는다.

```sh
./tools/node tools/mvp-evaluation-dev.mjs init --name evidence-ybm-demo --profile ybm --port 9443 --chain-id 431701 --operator "$CLEAR_MVP_OPERATOR" --participant "$CLEAR_MVP_PARTICIPANT"
./tools/node tools/mvp-evaluation-dev.mjs start --name evidence-ybm-demo
./tools/node --import ./tests/ybm-collector/network-guard.mjs specs/m3/evaluation-http-demo.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs specs/m3/evaluation-http-demo.mjs --siwon
```

새 환경 `var/mvp-evaluations/<name>`만 사용하며 같은 검증 CA/HTTPS·서명 세션을 재사용한다. 일반 CLI의 합성 시계는 초기화 때 해당 profile의 evidenceUntil 1시간 전에서 시작해 실제 경과 시간만큼 증가하고 재시작 시 되돌아가지 않는다. 학습 fixture는 합성 학습 종료 전 수락할 수 없고 최종화는 합성 보완 기한 뒤다. 빠른 완주 재현은 demo/회귀의 **신뢰한 시험 host 시계 주입**이며 브라우저에서 기한/시각을 바꾸는 API는 없다. auth 세션 만료는 실제 시각을 사용한다. 일반 host의 시간 대기나 기한 오류를 가짜 성공으로 우회하지 않는다.

브라우저 전용 adapter는 `src/product-workflow/evaluation-http-client.mjs`이고 request를 기존 walletClient에서 주입한다. 공개 실행 응답은 `specs/m3/evaluation-http-responses.json`에 있으며 임시 주소/포트/ID·지문은 현재 값으로 재사용하지 않는다. server-only example/pins/service/DB/Node 모듈은 번들에 포함하지 않는다.

C3 최종 리뷰 보완: 인증된 요청에서 정책/ACK 문맥 불가 또는 변경을 관측하면 invalidated를 영속 기록하고 head/facts/selection revision을 증가시킨다. 이후 같은 정책을 다시 켜더라도 과거 decision을 current로 자동 복원하지 않는다. 기존 snapshot/최초 시험은 보존하며 이번 고정 합성 host는 새 검토 환경을 요구한다. 외부 정책 시스템의 모든 비활성/재활성 이벤트를 감시하는 기능은 아니다. 이 경계는 새 합성 DB 회귀에서 실패를 재현한 뒤 보완했다.

검증: 최종 관련361/361(M1/M2 27·C3 HTTP19/TLS3 포함), 기존 개발환경33/33, 원본legacy191개 지문/의존성 graph 보존·diff PASS. C3의 HTTPS 두 profile은 새 TEST 지갑 서명과 CA 검증을 사용한다. 원자 rollback은 새 합성 DB의 중간 INSERT 실패 주입이며 실제 사용자 DB 강제종료 실측이 아니다. 최종 원격 CI는 연결 Draft PR의 exact head를 따른다.
