# E6 v3 실제 합성8건 평가 — 완료, PASS7·보완1

**ACTUAL / FINISHED / 채점8/8.** 2026-10-19 root가 직접 인간의 새 v3 승인 답변과 정확한 HEAD/plan/policy 실질 검토를 전달한 뒤, 고정 공개 합성 Python8건의 승인 CLI를 **정확히 한 번** 실행했다. 생성 예약8·실제 fetch8·HTTP2xx8, countTokens/모델목록/retry/continuation/키·모델·무료 fallback0이며 잔여 NOT_RUN0이다. 소스 변경 없이 실행 전후 같은 clean HEAD를 유지했고 결과 기록은 프로세스 종료 후에만 추가했다.

- 실제 실행 HEAD: `636817f679e009a6ad3194b7c549606cd24d112f`
- 실행 planHash: `0x29be00a2f5c79a757b41bf0e7f41c278c5ed403b9f4fb5aea4e50c1cf8d12bfb`
- 실행 policyHash: `0xc7aa9411a5241b533ab79b338736ca798a7b59a0e95ccb25a99cd06234d47902`

오늘 공식 Standard 가격을 재확인하고 승인 범위·날짜·지문을 사전 검증했다. 새0700폴더/0600파일에 root 전달 직접 인간 답변 근거와 공개 가격 검토 hash를 결합했다. 원 질문 전문을 독립 확인했다고 가장하지 않고 전달 출처/질문ID/직접 답변·범위를 구분했다. 기존 key-source는 이미 성공한 동일 GEMINI_API_KEY 주입을 사용했고 새 키/프로젝트/연결 질문·보안 파일 탐색·.env 읽기·다른 source fallback은 하지 않았다. 키 값·프로젝트 ID는 출력/보관하지 않았다.

별도 fetch 관측기는 고정 generateContent URL/POST만 원래 인자로 native fetch에 전달하고 호출·응답 숫자와 dispatch 시각만 기록했다. headers/body/raw 응답은 읽거나 저장하지 않았다. 실제 첫 dispatch는 **17:22:45.198 KST**, 마지막은 **17:29:45.587 KST**이며 관측 간격은60053/60059/60040/60060/60044/60065/60068ms, 최소60040ms다. 실행 종료 뒤 진행 중 요청0을 확인했다. 사전 예약 수와 실제 전송 수를 별도로 기록했으며 이번에는 둘 다8이다.

## 품질 집계와 분모

| 지표 | 실제 관측 |
| --- | --- |
| 채점 가능 사례 | 8/8 |
| 사례 PASS / NEEDS_IMPROVEMENT | 7 / 1 |
| topic 상태 기대값 일치 | 23/24 = 95.83% |
| 기대 PRESENT topic의 원문 근거 검사 | 21/21 |
| 정상 대조군 보류 사례 | falseHoldCases **0 / assessedNormalControls 5** |
| 정상 대조군 보류 topic | falseHoldTopics **0 / assessedNormalControlTopics 15** |
| 중단 / 잔여 미실행 | 없음 / 0 |

보완 사례는 **PY05**다. 3topic 중 상태 기대값 일치2, 검사 오류2로 기록됐다. 오류2를 서로 다른 topic 오류2개라고 해석하지 않는다. 공개 gold에서 work-performed와 learning-takeaway는 PRESENT, **problem-solving-process는 UNCERTAIN**이다. 기대 PRESENT2개가 모두 상태/원문 근거를 충족하고 전체 상태 일치가2/3인 안전 요약과 실행 채점 규칙을 함께 보면 유일한 의미 오판은 problem-solving-process의 UNCERTAIN 기대 불일치로 식별할 수 있다. 실제 모델의 해당 state·응답 문구·원래 오류코드 배열은 미보존이므로 PRESENT/MISSING/CONFLICT 중 무엇을 답했는지나 STATE/SUPPLEMENT 코드를 원자료처럼 소급 확정하지 않는다. 이 사례를 PASS로 바꾸거나 다시 생성하지 않았다.

이 결과는 정책 기반 기대값을 둔 **고정 공개 합성8건** 평가이며 독립 holdout/실제 사용자 자료/일반 정확도나 제품 완료의 입증이 아니다. HTTP2xx와 품질 PASS를 분리한다. 같은 응답 hash가 보이는 사례도 원문/기대 기준별로 각각 채점한 결과다. 기존 grounding 채점기를 사용했고 외부 인용 URI/검색 metadata를 원문 증거로 삼지 않았다. wire/형식 검증을8건 통과했다는 사실과 semantic 기대 기준의7PASS/1보완을 구분한다. 이 결과로 P0/생산자의 원문 직접 grounding 또는 애매한 상태 HOLD 요구를 완화하거나 실제자료 인수/제품 자격/지급 권한을 켜지 않는다.

## tokens와 조건부 비용

provider가 보고한 합계는 prompt **2585**, candidate **1633**, total **4218**이다. 8건 모두 serviceTier=standard를 보고했지만 결제 계정/실제 청구 인증을 뜻하지 않는다. **thoughtsTokenCount는8건 모두 누락(null)**이었다. 개별 thinking을 보고된0으로 채우지 않았다. 고정 텍스트/no-tool/no-cache 범위의 유효 total−prompt로 계산한 파생 결합 생성량 상한 합계가1633이며 residual 합계0도 파생값이다.

실행일 [공식 Standard 가격](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)의 입력US$0.30/백만·출력(thinking 포함)US$2.50/백만을 적용한 **조건부 추정**은 다음과 같다.

`2585 × 300 + 1633 × 2500 = 4,858,000 nanoUSD = US$0.004858`

8건 모두 조건부 사용량 계산이 가능해 unknownUsageReservedCalls=0이다. 이는 개별 thinking 실측/실제 invoice 검증과 다르며 actualInvoiceUsd=null, invoiceVerified=false, providerHardCashCapVerified=false다. 최초 가정 US$0.02768은 실제 사용액으로 보고하지 않는다. 이번 관측 추정은 US$0.05 미만이지만 이를 provider 확정 cash cap으로 승격하지 않는다.

## 이전 실패·Mac CI·보존 경계

기존 [v1 중단](REVIEW_PRECHECK_E6_PAID_EIGHT_ACTUAL_20261019.ko.md)과 [v2 중단](REVIEW_PRECHECK_E6_USAGE_V2_ACTUAL_20261019.ko.md)의 각 실제1회·채점0/원장·spent를 그대로 보존했다. 이번8회를 포함한 이3개 기록의 실제 fetch는10/HTTP2xx10, 채점8이며 이전2회의 전체 thinking 포함 비용·invoice N/A는 바꾸지 않는다. 세 실행의 완전 합산 비용을 확정하지 않는다. 이번 v3 spent/journal도 보존하고 재실행하지 않는다.

실행 HEAD636의 최초 CI는 **push2/3·PR3/3**이며 Mac의 원래 `STALE_RECOVERY:EPERM` 실패는 미해결이다. 원인 확인 전 요청한 부적절한 attempt2 Mac 성공은 해결 증거가 아니다. [최초 실패 job](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39219934005/job/117952603977)과 감사 기록은 보존한다. 독립 CLI의 이번 평가 완료로 CI를 통과 처리하거나 PR을 병합하지 않는다. Mac 코드/시험 변경·추가 workflow 재실행은 하지 않았다.

공개 기계 결과는 `tests/ai-review-precheck/e6-paid-wire-v3-actual-20261019.json`이며 승인 hash·실행 pins·원장/fetch 관측 hash·숫자/집계·고정 상태만 기록했다. 실제 Moodle/HackerRank 자료0, 원문/quote/gold문장/raw 모델·HTTP 응답/키·프로젝트 ID 저장0이다. usableForAcceptance/paymentAuthority/paymentAllowed=false를 유지한다. 결과 일관성·비용/분모·보존 경계의 오프라인 검사는 모델 응답 재생이나 추가 API 호출이 아니다.

이전 준비 문서의 미실행/미승인 문구는 당시 스냅샷이며 현재 실행 사실은 이 보고를 우선한다. 새 유료 실행 승인을 다시 요청하지 않는다. 실행 후 결과 커밋 HEAD와 실제 실행 HEAD는 분리해서 PR 완료 보고에 표시한다.
