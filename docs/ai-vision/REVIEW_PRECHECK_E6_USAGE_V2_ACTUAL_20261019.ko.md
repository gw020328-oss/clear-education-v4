# E6 usage v2 실제 실행 — 서비스 등급 검사에서 중단

**ACTUAL / UNKNOWN_STOPPED / 채점 가능0/8.** 사용자가 PR97의 정확한 codeHead/planHash·기존 유료 키·합성 Python 추가8건·생성최대8/count0·재시도/재개/대체0과 추정 US$0.02768/US$0.05 초과 가능성을 직접 승인한 뒤 CLI를 **정확히 한 번** 실행했다. 첫 HTTP2xx 응답에서 `E6_UV2_SERVICE_TIER`로 중단했다. 나머지7건은 예약·전송하지 않았고 재실행하지 않았다.

실행 HEAD `cafbf3bd087104a34b3c3000885fdcd4674c4e21`, planHash `0x640a78767508987d92abab8defe0c102bcdaf05644ecec3ea715d614c3d604b6`, usagePolicyHash `0x92d273c9c9c8b9aa21d79f44d74eb8b906bd8ceef680d64eaf8dda99c19b4e8c`다. 실행 전후 HEAD/clean 상태가 같았다. 아래 결과 기록은 프로세스 종료 후 추가했다. 준비 당시 실제0/미승인 문구는 과거 스냅샷이며 현재 실제 실행 사실은 이 보고를 우선한다.

| 관측 | 이번 추가 평가 | 이전 별도 평가 포함 누적 |
| --- | --- | --- |
| 사전 generation 예약 | 1 | 2 |
| 실제 fetch / HTTP2xx | 1 / 1 | 2 / 2 |
| count / retry / fallback | 0 / 0 / 0 | 0 / 0 / 0 |
| 채점 가능 사례 | 0 | 0 |
| 진행 중 요청 | 0 | 0 |

기존 env source를 승인 범위에서 사용했고 키 값/프로젝트 ID·다른 보안 파일을 탐색하거나 기록하지 않았다. 승인 메타데이터/직접 인간 답변 증거/실행일 공식 가격 검토는 새0700폴더/0600파일로 기록했다. 이전 승인·원장·spent는 열거나 초기화하지 않았다. 이번 새 spent도 보존한다. 별도 fetch 관측기는 원래 native fetch 인자를 변경 없이 전달하며 숫자만 기록했다. 원문·응답 body·header·키는 계측하지 않았다.

## 준비 코드의 오류와 관측의 한계

실행 후 재확인한 [공식 ServiceTier 규격](https://ai.google.dev/api/generate-content#ServiceTier)은 소문자 `standard`, 기본 `unspecified`, `flex`, `priority`를 정의한다. **v2 준비 코드는 대문자 STANDARD만 허용한 호환성 오류가 있다.** 사전 테스트도 같은 잘못된 값을 가정해 이 오류를 발견하지 못했다. 공개 공식 열거값을 확인했어야 했으며 모델 품질이나 사용자 키 문제로 돌리지 않는다.

해당 응답의 실제 등급 문자열과 원시 응답은 저장하지 않았다. 따라서 실제 값이 standard/flex/priority 중 무엇이었는지는 **N/A**이며 standard였다고 단정하지 않는다. 확인된 사실은 응답의 비-null 등급이 코드의 STANDARD 검사에 실패했다는 것이다. 이 응답에서 이후 modality/합계 검사가 모두 통과했을 것이라고도 주장하지 않는다. 응답 내용을 복원하거나 소급 채점하지 않는다.

prompt314/candidate135/total449, thoughts누락(null)은 안전한 숫자로 남았다. 서비스 등급 검사에서 파생 생성량 계산 전에 중단했으므로 이번 실행의 v2 조건부 전체 비용 추정도 N/A다. [실행일 공식 가격](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)은 Standard 입력US$0.30/백만·출력(thinking 포함)US$2.50/백만으로 재확인했다. **그 단가를 가정한 관측 prompt/candidate 부분만** US$0.0004317이며, 이전 별도1회와 합친 부분액은 US$0.0008634다. 이는 실제 등급·전체 thinking 포함 비용·청구액의 확인값이 아니다. 원장 추정0은 완전 계측 사례0을 뜻하며 무료/청구0이 아니다.

내용 파싱 전에 중단해24topic 중 채점0, grounding검사0/예정21, 정상 대조군 평가0/예정5다. topic accuracy/false hold/model quality는 N/A이며 HTTP 성공을 품질 PASS로 표현하지 않는다. 실제 전송 자료는 공개 합성 PY01뿐이며 실제 Moodle/HackerRank 자료0이다. paymentAuthority/usableForAcceptance/paymentAllowed=false를 유지한다.

기계 결과는 `tests/ai-review-precheck/e6-paid-usage-v2-actual-20261019.json`이다. 기존 v1 결과와 이번 결과를 분리하고 원장·fetch 숫자 기록의 SHA256을 결합했다. 오프라인3개 검사는 결과 일관성·미실행/비용 N/A·원문/키 미저장만 검사하며 모델 재생이 아니다.

이번 승인 실행은 종료됐다. 추가 호출·남은7건 재개·새 승인 파일/원장 선택·spent 삭제·즉석 정책 변경 후 재실행은 하지 않는다. 이 보고에서 또 다른 유료 평가 승인을 요청하지 않는다. 준비 코드 오류는 위와 같이 공개하며 현재 v2를 다음 실행에 그대로 사용하면 안 된다.
