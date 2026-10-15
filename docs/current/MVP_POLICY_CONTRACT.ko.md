# M1 공통 정책·증거 소비 계약

2026-10-15 M2: [경로·증거·금액 후보 평가](MVP_EVALUATOR.ko.md)의 `clear-mvp-evaluation.1`은 M1 계약을 소비하는 별도 순수 합성 모듈이다. 증거 상태·OR·명시 선택·최초 제출·정정/최종성과 금액 후보를 분리하며 실제 자격/지급은 false다. HTTP/DB/금고와 기존 차단 조건을 유지한다.

2026-10-15, `clear-mvp.1` / `clear-mvp-compiler.1`. 기준 develop `21776f53d7660597b94a37c89139316e43eeb673`, 이슈 [#37](https://github.com/gw020328-oss/clear-education-v4/issues/37)·[#38](https://github.com/gw020328-oss/clear-education-v4/issues/38). M0 mock·기존 800점/8000bps 정책·HTTP·DB·동의·금고와 다른 namespace다. 소비자 적합성 검토는 PENDING이며 이 문서 병합만으로 동의를 얻었다고 기록하지 않는다.

목표는 여러 환급반에서 이미 지원하는 규칙을 설정으로 조합하는 모듈이다. YBM형·시원스쿨형은 첫 두 합성 프로필이며 엔진에 브랜드 분기가 없다. 제3 프로필은 700점·14일/8000bps·42 TEST 정액을 설정만 추가해 실행한다. 새 원천·새 연산은 별도 어댑터/버전·시험이 필요하다. 모든 환급 조건을 지원한다는 주장이 아니다.

## API와 고정 자료

| 경로 / 모듈 함수 | 소비 방법 |
| --- | --- |
| `src/policy/mvp/schema.mjs` | `$defs.PolicyDraft/Rule/Requirement/Binding/SourceBinding/Evidence/DocumentPrecheck/LearningRule`, 정확한 필드·enum·한도. 모든 필드 필수, 추가 필드 거부, 미확인은 null/전용 상태 |
| `src/policy/mvp/contract.mjs` | `validateContract(type,value)`는 shape만 검사. `digest(domain,value)`는 SHA256(domain + LF + canonical JSON). 기존 canonical의 객체 UTF-16 키 정렬·배열 순서·정수 JSON을 재사용. 원문/PII 단순 hash를 공개하지 않음 |
| `src/policy/mvp/compiler.mjs` | `compileMvpPolicy(draft,{sources,capabilities})`. caller가 독립 고정한 합성 원천·capability와 대조. 반환은 deep-frozen 정책/hash/sourceSetHash/ruleHashes, publishable/paymentAllowed=false. 복사본의 compiled 위장 거부 |
| `quoteMvpAmount(compiled,tier)` | 정액 TEST 또는 기존 `siwon-demo-amount.1` 정수 산술. quote와 자격/선택/재원은 별개. null·OFFICIAL_OPEN은 AMOUNT_OPEN, PRECHECK_ONLY는 금액 없음 |
| `specs/m1/examples.mjs` | `exampleDraft('ybm'/'siwon'/'third')`, `compileExample`, `exampleBinding`, `exampleSourceBinding`. 인공 값만 포함. 소비자 smoke test의 입력으로 import 가능 |
| `specs/m1/learning.schema.json`, `learning-example.json` | Moodle 기존 초안 필드를 보존한 `clear-learning-facts.1` 준비 계약. `validateLearningFactsShape`는 구조 검사만 수행. 수정된 source revision/manifest가 실제로 신뢰 가능한지 검사하는 adapter 아님 |

`PolicyDraft`는 OFFICIAL_DRAFT를 표현하지만 실행 컴파일은 거부한다. unresolved question, OFFICIAL_OPEN rule, 없는 근거 locator·다른 상품/기수·누락/중복/미참조 규칙·잘못된 단위/기간/금액도 거부한다. 근거 locator는 고정한 source 목록에 존재하는지 검사하며 의미 지지·발행자 진위·적용성은 자동 입증하지 않는다. 정규화 지문/버전은 둘 다 null이거나 둘 다 있어야 한다. sourceSetHash와 policyHash는 지문이며 서명/승인권이 아니다.

## 제한된 규칙과 범위

`commonRuleIds`는 ALL이며 tier마다 `alternatives`가 ANY, 각 대안의 `allRuleIds`가 ALL이다. 빈 경로·임의 재귀 AST·실행 코드·수식 문자열은 없다. 연산은 SCORE_LT/GTE/EQ, BASELINE_LT, DAILY_TIME, DAILY_PROGRESS, BOOLEAN으로 제한한다. SCORE=0..990, BPS=0..10000, BOOLEAN=bool. BASELINE과 LEARNING은 COMPLETE_PERIOD 및 고정 기간을 요구한다. 존재 성적과 최고점/미응시/전체 이력을 같은 증거로 취급하지 않는다.

지원 tier는 독립 고정한 capability profile에 따른다. 첫 시원스쿨 합성 프로필은 50/100/200/300 조건·계산, 400 PRECHECK_ONLY, 500 제외다. 100% 출석 대안과 50%에는 baseline을 붙이지 않는다. 100% 성적·200/300과 400 구조화에는 별도 baseline이 있다. 400% 자동 자격·계산·지급 금지와 500% 제외를 유지한다. 엔진 자체를 특정 브랜드나 환급 숫자에 한정하지 않는다.

YBM형은 [M0 S-1~S-3](M0_DECISIONS.ko.md)의 750점·90일/9000bps·모의시험·후기·100 TEST 합성 약정이다. 기존 제품의 800점 AND 80%/최고점 정책을 교체하지 않는다. 시원스쿨형 100일/6000bps·730일 baseline·과거 목표 750·선택/금액은 합성 가정이며 실제 달력 2년·상위 tier의 과거 기준·신청 사건·선택·공제·후기 기준은 OPEN이다. 실제 원문 관찰과 기수 적용 여부는 [M0 결정](M0_DECISIONS.ko.md)·[후기 명세](REVIEW_PRECHECK.ko.md)·[이력 명세](EXAM_LIFECYCLE.ko.md)를 따른다. 이번 구현은 이미 확보한 근거를 소비하며 새로운 공식 조사/적용 확정을 주장하지 않는다.

기간은 UTC 정수 초, `[from,until)`, Asia/Seoul이다. 제출·보완·확정·배정·청구도 상한 미포함의 순수 평가 시계이며 기존 금고의 경계와 자동 매핑하지 않는다. 일별 규칙은 KST 자정에서 시작하는 days×86400 기간, 허용 활동 집합 hash, metric/date attribution version, 서로 다른 날짜·강의 재사용 금지·정상 종료·배속·streaming 제약을 고정한다. raw record를 시간/공식 진도/배속으로 추정하지 않는다.

## M2 증거 소비와 신뢰 경계

`Evidence`는 binding·requirement·revision·sourceBinding·sourceRevision·payloadHash·trustProfile·취득/수락 시각·범위와 관찰값을 결합한다. authenticity/subject/completeness/semantics/correction은 별도 상태다. `RuleObservation`의 ruleHash는 요구·학습 규칙까지 결합하며 status는 OBSERVED/MISSING/UNKNOWN/NEEDS_SUPPLEMENT/IN_PROGRESS다. OBSERVED 값도 독립 신뢰 문맥/범위가 맞아야 조건에 사용할 수 있다.

SCORE/BASELINE 값은 확인한 점수/전체 baseline의 최대점수다. 미응시는 NO_RECORD와 COMPLETE_SYNTHETIC·계정/기간/진위·현재 revision이 함께 확인된 합성 문맥에서만 표현하며 실제 receipt의 UNKNOWN은 그대로 보류한다. 일별 관찰 `value`는 L1이 산출한 유효 일별 지표의 최소 BPS, `days`는 중복 제거한 유효 날짜 수다. M2는 이 집계의 규칙/단위/기간/신뢰 결합을 확인하는 소비자이며 raw 학습 행의 일별 엔진을 대신하지 않는다. 짧은 재생을 장기 출석으로 올리지 않는다.

학습 raw DTO의 시간·ms는 10진 문자열이고 공통 정책/증거 시각은 안전 정수 초다. adapter는 단위 변환·범위와 정책/신청/기관/provider/course/계정 참조를 명시적으로 대조해야 한다. raw DTO shape 통과만으로 Evidence를 수락하지 않는다. activitySetHash는 `digest('CLEAR-MVP-ACTIVITIES', orderedAllowedActivityIds)`다. manifest/페이지·원천 revision·수정 audit의 실제 검증과 단회 수락/복구는 L2/L3/L4 및 공통 통합의 후속이다. NO_RECORD·UNAVAILABLE·UNKNOWN을 합치지 않는다.

AI/Vision의 `DocumentPrecheck`는 requirement/rule·정책·submission/route revision·input/run·근거와 관찰/코드검사를 담는 사전검토다. publishedAt/author/publication/modification/publicAvailability는 모두 UNVERIFIED이며 Evidence로 자동 변환하지 않는다. current=false 또는 이전 input/revision의 늦은 결과로 최신 결과를 덮지 않는다. PolicyDraft의 근거 없는 값/unsupported 연산은 질문/보류다. 사람이 답했다는 사실만으로 원천이 verified가 되지 않는다.

## 소비자 착수 범위와 소유

공통 계약이 있는 feature commit을 소비해도 미병합 계약임을 명시한다. 소비자가 일방적으로 schema를 고치지 않으며 적합성/빠진 필드는 #39/#40에 기록한다.

- AI #39: `src/ai-policy/`, `src/document-precheck/`, 전용 tests/docs의 정책 초안·질문·순수 사전검토 adapter. 기존 준비 작업 유지. `DOCUMENT_LIMITS`는 14글·글당 이미지 8장, 파일당 8MiB/20MP·decode30초의 준비 상한이다. 서버 업로드/외부 전송/저장·인증 계약은 구현하지 않았다. 구 M0의 5장 한도를 수정한 것으로 해석하지 않는다. 실제 모델/비용/원문 전송은 별도 승인된 경계 필요.
- Moodle #40 L1: 고정 LearningRule와 raw facts를 사용한 순수 일별 평가·집계. L2: 별도 격리 export/manifest/revision 구현·합성 시험. L3: 같은 격리 환경의 읽기 전용 driver 준비와 테스트. 실제 기관/제품 binding·수락/HTTP/DB 통합·새 실제 재생은 완료/허용으로 올리지 않는다. telemetry가 사람 집중 시청/공식 진도/속도를 입증하지 못하는 한계 유지.
- 공통: `src/policy/mvp/`, 공통 계약·HTTP·DB·root deps/CI와 통합 검토. 화면 `web/`와 #11 소유 보존. 기존 사용자/타 작업본의 DB·체인·키·브랜치를 수정하지 않는다.

외부 전송·파일 저장·인증·업로드 경계를 소비자가 독단 변경하지 않는다. 실제 Moodle·원천 검증 BLOCKED, grant/outbox HOLD, 독립 청구 NO-GO, Mac 과거 실패 원인 UNCONFIRMED를 유지한다. 멘토 예치 정책은 OPEN이며 60/55/5/15는 계산 예시다. 기존 금고와 PR #36 TEST 실험을 보존하고 실제 PG/자금 배포를 추가하지 않는다. 새 PR 자동 병합은 없다.

## 검증과 다음 단계

`./tools/npm run test:mvp-policy`는 새 계약/컴파일·소비자 shape와 부정 입력을 검사한다. 기존 M0/정책/학습 회귀를 유지한다. M2는 별도 작은 PR에서 경로별 충족/미충족/미확인/누락/보완, OR, 선택·최초 제출·정정/최종성·금액 후보를 구현한다. 이 계약은 아직 제품 신청·지급에 연결하지 않는다.
