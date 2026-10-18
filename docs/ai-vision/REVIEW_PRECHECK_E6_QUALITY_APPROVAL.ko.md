# E6 Python 회고 실제 품질 평가 승인용 계획 — 2026-10-19

**NOT_APPROVED / ACTUAL_BLOCKED / MODEL_QUALITY=N/A.** 이번 작업은 개인정보 없는 고정 corpus/gold·요청·비용 계획과 오프라인 시험만 준비했다. 키 읽기·모델 목록 API·countTokens·유료 generation은 모두0이다. 기존 일반 후기8건의 실제 평가/원장을 재사용하지 않았고 실제 Moodle 원문/계정/지갑/증명/토큰을 복사하지 않았다. 실제 평가는 새 사용자 승인 이후 별도 실행 단위다.

검토할 정본은 본 문서와 `tests/ai-review-precheck/e6-python-approval-plan.json`이다. 입력은 `e6-python-corpus.json`, 정답은 `e6-python-gold.json`, 생성기는 `prepare-e6-quality-approval.mjs`/`e6-quality-plan.mjs`다. 모두 기존 E6 branch의 담당 경로에 있다. 원래 PR72/f98e104와 PR86/d7a6f30의 lease/current/false gates를 바꾸지 않았다. 요청/권장은 Sol/Medium이며 현재 턴의 모델을 별도 전환/조회하지 않았다.

## 승인 문안으로 검토할 정확한 범위

“아래 고정된 Python 회고 합성8건에 대해 `gemini-3.5-flash-lite`/MINIMAL, 사례당 생성1회 이내·countTokens1회 이내, **생성최대8+countTokens최대8=총16요청**, 자동재시도/continuation0, 신규 **US$0.05 하드 예산 상한**의 소규모 평가를 승인한다.”

이 문안은 아직 승인받은 지시가 아니다. countTokens 과금과 실제 실행 경계가 미확정인 상태에서 승인을 받았다는 이유만으로 dispatch하지 않는다. 키 값은 채팅/코드/로그에 요청하지 않는다. 별도 연결시험·모델 목록조회·추가 모델·추가 corpus·자동 resume·모든 continuation은 이16요청에 포함되지 않으므로 실행하지 않는다. 실패/timeout/거부도 호출 횟수와 보수 예약을 유지하고 재시도하지 않는다.

## 고정 새 synthetic corpus/gold

sourceId는 `python-reflection-source`, 세 topic은 기존 work-performed/problem-solving-process/learning-takeaway 그대로다. 사진/Vision은 없고 최소 글자수/긍정성/성의/일반 실력 요건을 추가하지 않는다. 새 본문은 정책에 따라 작성한 synthetic 자료이며 기존 일반 후기 corpus와 별개다. gold는 **정책 기반 합성 기대값이며 인간 검토 대기**다. 전문가 판정/실제 학생 정답/독립 holdout으로 표시하지 않는다.

| 사례 | 내용 | work / process / learning 기대 state |
| --- | --- | --- |
| PY01 | 새 정상 Python 합산 함수·초기값 수정·경계 입력 학습 | PRESENT / PRESENT / PRESENT |
| PY02 | 명시적 문제없음과 빈/한 원소 입력 점검 | PRESENT / PRESENT / PRESENT |
| PY03 | 동일 정상 근거+부정적 강의 의견 | PRESENT / PRESENT / PRESENT |
| PY04 | 배운 점만 누락 | PRESENT / PRESENT / MISSING |
| PY05 | 어떤 점검/대응을 했는지 확인할 수 없다는 명시 | PRESENT / UNCERTAIN / PRESENT |
| PY06 | 같은 작업의 수정/재실행 여부가 서로 모순 | PRESENT / CONFLICT / PRESENT |
| PY07 | 정상 내용 뒤 상태 변경/지급 허용 문서 명령 | PRESENT / PRESENT / PRESENT |
| PY08 | 원본 `<p>` HTML·`A&amp;B` literal·문제없음+점검 | PRESENT / PRESENT / PRESENT |

PY08은 messageFormat1, 나머지는2다. HTML을 strip/entity decode하지 않는다. 원문 literal 인용만 UTF-16 span/quoteHash로 검증하며 decoded 문자열을 같은 원문 지문으로 위장하지 않는다. provider에는 caseId/synthetic 표기·원문source/format/topic ID만 보내고 **gold/기대 state/사례 목적/정답 인용은 보내지 않는다**. 새 계정/로그인/Moodle API 요청은 이 고정 synthetic 평가에 필요하지 않다.

## 모델·prompt/schema·토큰 설정 · 공식 확인 2026-10-19

- [공식 모델 문서](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)는 stable code `gemini-3.5-flash-lite`, text 입력/structured output을 안내한다. 이 계획은 해당 코드의 **Paid Standard 단일 응답**이며 Batch/Flex/Priority/Contributor·검색/grounding·캐시·도구·파일 API를 사용하지 않는다. 프로젝트 접근·HTTP 호환성은 실제로 확인하지 않아 N/A다.
- [공식 thinking 문서](https://ai.google.dev/gemini-api/docs/thinking)의 지원표에서 해당 모델의 minimal 지원을 확인했다. [GenerateContent API](https://ai.google.dev/api/generate-content)의 ThinkingConfig/ThinkingLevel에 맞춰 `thinkingLevel=MINIMAL`, `includeThoughts=false`로 고정한다. candidateCount1, temperature0, maxOutputTokens1024, responseMimeType application/json, 별도 OpenAPI responseSchema다. thinking이 완전히 꺼졌다고 주장하지 않으며 출력 요금에는 thinking이 포함된다.
- 기존 `clear-bootcamp-reflection-prompt.1`/전체 instruction/REFLECTION_PROFILE_HASH를 그대로 사용한다. 새 evaluation profile은 모델/config/schema·기존 profile·E0 operations hash를 별도로 결합한다. source 원문을 변경하거나 기존 관측 profile을 조용히 재정의하지 않는다.
- schema는 정확한3topic의 PRESENT/MISSING/UNCERTAIN/CONFLICT와 evidence `{sourceId,quote}` 또는null을 요구한다. provider schema의 배열/조건부 한계를 기존 P0 runtime validator/grounding으로 추가 검사한다. 모델이 행 번호/offset을 생성하지 않고 코드는 원문에서 정확히 유일한 quote를 찾는다.
- 사례당 **입력3000토큰 이하(전체24000)**, **출력1024토큰 이하(전체8192, thinking 포함 예약)**다. 실제 입력 token count는 N/A이며 countTokens를 호출하지 않았다. 향후 전체 system/schema/원문/config를 포함하는 [공식 countTokens generateContentRequest 형식](https://ai.google.dev/api/tokens)과 동일 body를 pin하고 초과하면 generation을 보내지 않는다. 출력/thinking 결합 상한의 실제 endpoint 동작도 실행 전에 확인해야 하며 확인할 수 없으면 dispatch하지 않는다.

## 공식 가격·예약·불확실성

[공식 Standard 요금표](https://ai.google.dev/gemini-api/docs/pricing)를2026-10-19 확인한 가격은 입력 **US$0.30/백만**, 출력(thinking 포함) **US$2.50/백만**이다. 위 토큰 ceiling이 모두 지켜지는 조건의 generation 보수 예약은 다음과 같다.

`24000 × 0.30 / 1000000 + 8192 × 2.50 / 1000000 = US$0.02768`

**REST countTokens의 독립 요금은 N/A**다. [공식 billing FAQ](https://ai.google.dev/gemini-api/docs/billing)는 비과금 대상을 GetTokens로 표기하지만, 이번에 확인한 REST countTokens 문서/모델별 요금표에는 그 API에 대한 명시적 단독 단가를 확인하지 못했다. 이를 확인된0으로 채우지 않는다. 입력요금 상당US$0.00720을 count용 잠정 allowance로 놓으면 잠정 합계US$0.03488로 제안 상한US$0.05 이하지만, **이 allowance는 실제 count 과금 상한의 입증이 아니다.**

generation 예약은 알려진 단가/제안 ceiling의 산식이고 실청구 추정은 N/A다. count 과금·출력/thinking cap·실행일 가격이 불명확하면 승인 후에도 count/generation dispatch를 막아야 한다. 신규 원장의 누적 예약+요청 최대 비용이 US$0.05를 넘거나 검증할 수 없으면 중단한다. 세금·환율·기존 계정 사용량/결제 잔액은 확인하지 않았다. 프로젝트 전체 과금 한도나 결제 시스템의 즉시 차단을 보장하는 금액은 아니다.

## 지문 · 재현

corpus/gold/requests는 UTF-8 파일 bytes의 SHA256이다. requests는 `JSON.stringify(requests,null,2)+'\n'`와 동일한 승인 artifact bytes이며 generation body와 countTokens body를 둘 다 포함한다. profile/schema/config/planHash는 기존 p0Hash의 각 명시 domain으로 계산한다. 전체 plan 필드는 committed JSON에서 대조한다.

| 지문 | 값 |
| --- | --- |
| corpusSha256 | `1a304a596a15fedcda846ed721b87d0a6daa418fa019ecebe2f55443e7a8b951` |
| goldSha256 | `4f13f00b884d9360e6526fac2e80147466bfd17c8410509a18f6f72cd825e83a` |
| requestsSha256 | `9b9e2fdd5a16636b8f75689da1d5aa4a106a909aa9e5fcb11fb10097117edf0d` |
| evaluationProfileHash | `0x0d45c60473ff683d6818cc409c781dea0e4b84f066430fe99d5d641a03915e84` |
| schemaHash | `0x5fac8d89d1b063b182a2eeee8e738ca8044430b4bafa80e38e69f591e1765900` |
| configHash | `0x54778b4dfcb3b12b7c8174fc08d5c8d2a834410d8bda13cf41da3234956d0b83` |
| planHash | `0x75b155c748c05242c2585ca254efcd05c77f3745ce53714367fc72b51fc5d696` |

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs tests/ai-review-precheck/prepare-e6-quality-approval.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/e6-quality-plan.test.mjs
```

준비 CLI는 provider transport/키/환경변수를 참조하지 않고 Git 제외 `artifacts/e6-python-quality-approval/{plan,requests,gold}.json`만 생성한다. 모든 실행 flag는 `E6_QUALITY_PLAN_ONLY`로 거부한다. ACTUAL adapter는 기존 경계에서 계속 거부하며 새 유료 실행기는 추가하지 않았다.

## 평가·오프라인 검증·남은 실행 경계

오프라인 평가기는24topic의 state, 원문 body에 실제 존재하는 quote/span/hash, topic별 gold 근거 문장 범위, 비PRESENT의 evidence=null/고정 보완 요청, 정상5건의 과잉 보류를 따로 검사한다. 더 짧은 인용도 gold 근거 문장 범위 안이면 허용하지만 의미의 충분성까지 hash로 증명했다고 주장하지 않는다. 누락/모호함/충돌 각1건의 제한된 개발 진단이며 전체 분포의 정확도나 독립 holdout이 아니다.

신규7/7·전체418/418 PASS, workspace 원본191개/의존 graph 보존·diff PASS다. 최종7개에서 완전한 count/generation body와 committed plan 재생성 일치도 확인했다. 최초 CLI 거부 시험은 한글 경로의 URL percent-encoding을 pathname으로 직접 전달해1건 실패했고 fileURLToPath로 수정한 뒤 통과했다. 키/API/모델 품질 오류가 아니다. gold를 그대로 scripted MOCK 응답으로 재생해8건PASS가 된 것은 배선/평가기 회귀이며 실제 모델 정확도가 아니다. 다른 topic의 quote·없는 quote·잘못된 state·추가 권한 field·HTML entity 변환은 통과하지 못한다.

실행 전에는 새 사용자 승인과 exact code/head·plan/corpus/gold/requests/schema/config/profile 대조, 새 private lease/원자 checkpoint/배타 lock/누적 budget·call 상한·timeout/실패 시 예약 유지를 갖춘 별도 평가 실행기가 필요하다. 소진된2026-10-16 실행기/lock/원장을 초기화하거나 그 승인을 재사용하지 않는다. 평가8회는 business 재검증1회 ledger와 별개이며 E0의120/1/600·새 decision 동의·source 무효화를 변경하지 않는다.

실제 Python 회고 모델 품질은N/A, 실제 model list/count/generation/key read 횟수는0이다. E1/실제 Moodle 통합·자금/지급 activation도 이번 준비 결과가 아니다. 공통API/DB/web/docs/current/specs/CI/package를 수정하지 않았고 실제 Moodle 원문/과거 일반 후기8회는 새 corpus에 넣지 않았다. 기존v1/production false/C2 개인자료 제한, usableForAcceptance/paymentAllowed=false를 유지하며 다른 세션 연락/merge/deploy는 하지 않는다.
