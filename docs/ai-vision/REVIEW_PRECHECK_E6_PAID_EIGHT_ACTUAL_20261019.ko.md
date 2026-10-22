# E6 기존 유료 키 실제 실행 — usage 누락으로 첫 요청 뒤 중단

**ACTUAL / UNKNOWN_STOPPED / MODEL_QUALITY=N/A.** 2026-10-19 사용자가 고정8건·생성최대8/count0·retry/대체0 및 추정비용/US$0.05 초과 가능성을 직접 승인했다. 승인된 실제 CLI를 정확히 한 번 실행했으며 **실제 전송 시도1회와 HTTP2xx 응답1회 후 `E6_PAID8_USAGE_UNKNOWN`으로 중단**했다. 나머지7건을 이어 실행하지 않았다. 이는8건 평가 완료나 품질 PASS가 아니다.

실행 codeHead는 `9aa155ce5c23a9bc4e8c81a191b57491362f0a05`, planHash는 `0xf1d965041da451b13252e3e7b9b3d1255e12a8d7e10170361bbe3eea7ba879d9`다. clean 상태/현재 한국시간 실행일/고정 request·corpus·gold와 오늘 공식 Standard 가격을 확인하고 신규 private 승인 record를0700폴더/0600파일로 작성했다. 이 채팅의 직접 사용자 승인과 root가 전달한 직접 인간 답변의 증거 hash를 비공개 기록으로 남겼다. 과거 승인/소진 원장·Free credential은 열거나 reset하지 않았다. 실제 실행 중 head를 바꾸지 않았고 프로세스 종료 뒤에도 같은 head임을 확인했다. 아래 결과 파일/문서/오프라인 일관성 검사는 실행 종료 후에만 추가했다.

## 호출·중단·미실행

| 항목 | 관측 |
| --- | --- |
| generation 사전 영속 예약 | 1 |
| 실제 native fetch 호출 | 1 |
| HTTP2xx 응답 / HTTP 오류 / network 오류 | 1 / 0 / 0 |
| countTokens / 모델 목록 / retry / fallback | 모두0 |
| 진행 중 요청 | 0 |
| 채점 가능한 사례 | 0 |
| PY01 | UNKNOWN_STOPPED, E6_PAID8_USAGE_UNKNOWN |
| PY02~PY08 | NOT_RUN, 예약하지 않음 |

원장 카운터는 전송 전에 증가하므로 실제 전송과 따로 보고한다. 별도 process-level fetch 관측기는 승인된 고정 generateContent URL/POST만 허용하고 원래 인자를 변경 없이 native fetch에 전달했다. 호출/HTTP 성공·실패 숫자만 기록했으며 headers/body/키·응답 본문은 읽거나 저장하지 않았다. 이 관측기는 retry를 하지 않고 코드 HEAD를 바꾸지 않은 Git 제외 계측 파일이었다. 승인된 CLI 실행은 한 번이다.

기존 명시 source `clear-e6-existing-server-gemini-env.1`의 GEMINI_API_KEY reader가 전송 단계에서 사용됐고 고정 Google HTTPS에 응답을 받았다. 키 값/프로젝트 ID는 보관·출력하지 않았고 `.env`나 다른 키/보안 파일을 탐색하지 않았다. 이 연결 성공은 사용자의 특정 결제 계정/잔액/실제 청구가 인증됐다는 뜻은 아니다. 모델 version guard는 통과했으나 내용 파싱/채점 전 usage guard에서 중단했다.

## usage와 비용 — 누락을0으로 만들지 않음

PY01 응답의 안전한 usage 숫자는 prompt314, candidates135, total449이며 **thoughtsTokenCount는 누락(null)**이었다. 314+135=449인 산술관계는 확인되지만 승인된 정책대로 thoughts를 확인된0으로 채우지 않았다. `N/A_INCOMPLETE_USAGE`로 남기고 이후 호출을 중단했다.

2026-10-19 재확인한 [공식 Standard 가격](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)은 입력US$0.30/백만·출력(thinking 포함)US$2.50/백만이다. **관측된 prompt/candidate 부분만** 단가 환산하면 `(314×300 + 135×2500) nanoUSD = US$0.0004317`이다. 이는 전체 생성 비용이나 청구액이 아니다. thinking 포함 전체 비용 추정/실제 invoice는 N/A이고 invoiceVerified=false다. 원장의 knownCompletedUsageEstimate가0인 것은 완전 계측 사례0건이라는 뜻이며 무료/실제 청구0을 뜻하지 않는다. 사전8건 가정 US$0.02768도 실제8건 사용액으로 보고하지 않는다.

## 품질·개인정보 경계

usage guard가 모델 내용 파싱 전에 중단했으므로 평가 가능한 사례0, 24topic 중 채점0, 원문 grounding 검사0/예정 PRESENT21, 정상 대조군 평가0/예정5다. topic accuracy/false hold/grounding 성공률은 모두 **N/A**이며 오류율0이나 품질 PASS로 표현하지 않는다. HTTP 성공1건은 품질 성공1건이 아니다. 원시 응답을 저장하지 않아 나중에 같은 응답을 복원해 채점했다고도 주장하지 않는다.

실제로 전송한 자료는 공개 합성 PY01 텍스트1건뿐이다. 실제 Moodle/HackerRank 자료0, 원문/quote/gold 문장/model raw response/HTTP raw·provider error/key·프로젝트 ID의 새 결과 저장0이다. public 결과에는 사용량 숫자·상태/고정 코드·집계·hash만 있다. `paymentAuthority=false`, `usableForAcceptance=false`, `paymentAllowed=false`를 유지한다.

기계 결과: `tests/ai-review-precheck/e6-paid-eight-actual-20261019.json`. 로컬 단회 원장과 관측 기록의 SHA256을 결합했다. 이 결과 기록을 위한 오프라인 검사는 실제 전송이나 모델 응답 재생을 하지 않는다.

새 실행의 단회 표식/원장은 남겨두고 실패 예약을 반환하지 않았다. 기존 CLI 재실행·continuation·새 원장 선택·표식 삭제는 하지 않는다. 이 보고에서 새 실행 승인을 다시 요청하지 않는다. 준비 계획의 ‘미실행’ 문구는 준비 당시 스냅샷이며 이번 실행/중단 사실은 이 보고를 우선한다.
