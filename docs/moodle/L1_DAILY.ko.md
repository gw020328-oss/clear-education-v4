# L1: 공통 규칙 설정을 소비하는 합성 일별 평가

이슈 [#40](https://github.com/gw020328-oss/clear-education-v4/issues/40), 선행 [M1 PR #43](https://github.com/gw020328-oss/clear-education-v4/pull/43)의 feature commit `3b540193e12085c0da38157364e3c59212493c9b`를 소비한다. `clear-mvp.1` / `clear-learning-facts.1`이며 M1은 착수 시점 develop 미병합이다. 공통 계약/HTTP/DB/root dependencies/CI/web 및 기존 B3 경로를 변경하지 않았다. 준비 PR #41의 합성 벡터 commit `4f89f6e`를 이력으로 재사용했다.

## 경계

[`assessMvpDailyLearning`](../../src/learning-evidence/moodle-mvp/daily.mjs)는 compiler가 실제 생성한 정책, ruleId, 독립 trusted 문맥, raw facts, 안전 정수 초 now를 받는 순수 함수다. 브랜드/고정 점수/환급 숫자 분기가 없으며 기간·임계값·허용 활동·streaming·정상 종료·강의 재사용·배속 의미 버전은 LearningRule에서 읽는다. 현재 실행 의미 registry는 `synthetic-metric.1`와 `synthetic-finish-kst.1`, 시간대는 공통 계약의 Asia/Seoul만 지원한다. 지원하지 않는 의미 버전을 설정에 쓰면 보류하며 어떤 새 의미도 임의 실행하지 않는다.

입력은 **SYNTHETIC만 허용**한다. LOCAL_LMS_RECORD/INSTITUTION_LMS_RECORD는 ON_HOLD다. 함수가 원천 서명·계정 인증·source 사실을 만들어주지 않는다. `trusted`는 향후 export 검증기/내부 resolver가 독립적으로 고정해야 하며 HTTP body나 검증할 응답에서 복사할 수 없다. 합성 test resolver는 fixture에만 있다.

| trusted 입력 | 의미 |
| --- | --- |
| binding / sourceBinding | 공통 Binding/SourceBinding. 신청/주체/정책/수령인과 기관/provider/course/source account를 별도 검증 |
| rawBinding | raw DTO의 더 넓은 별도 표현을 독립 pin. 공통 binding의 자동 alias가 아니며 learner/account 참조도 resolver가 연결 |
| inventory / activityMappings | inventory 전체 pin, 활동별 lectureId·sourcePolicyHash·durationMs. 제품 policy hash와 activity별 원천 규칙 hash는 다른 식별자 |
| factsHash / sourceRevision | 검증한 현재 export의 내용/현재 revision. 응답에서 trusted를 자동 재발급하지 않음 |
| verification | authenticity/subject/semantics=VERIFIED_SYNTHETIC, completeness=COMPLETE_SYNTHETIC, correction=CURRENT를 각각 확인. 하나라도 UNKNOWN이면 보류 |
| approvedCorrectionRevision / approvedSupersessions | 선택적인 별도 정정 승인. 정확한 새 revision과 old→new record 연결이 검토된 경우만 새 current 이력으로 재평가 |

raw 문자열 초는 BigInt 범위 확인 후 공통 안전 정수 초로 정확하게 변환한다. 레코드 ms는 BigInt를 유지하며 seconds로 반올림하지 않는다. `observedAt`은 레코드의 마지막 ms를 포함할 수 있는 실제 원천 관측 시각이어야 하고, 같은 초의 소수 ms를 잘라 만든 값은 보완될 때까지 보류될 수 있다. 실제 제공자 단위/관측 의미는 이후 검증해야 한다.

`factsDigest`는 normalizedDigest 자체를 null로 두고 나머지 raw facts를 `CLEAR-MOODLE-FACTS` domain으로 결합한다. source 서명이 아니다. `pageDigest`는 `CLEAR-MOODLE-PAGE`와 ordered rows, manifest 지문은 `CLEAR-MOODLE-MANIFEST`와 sourceRevision/totalRows/terminalPageId/pages를 결합한다. 현재 raw schema는 페이지를 별도 포함하지 않으므로 그 descriptors와 정규화된 전체 rows를 대조한다. 취득 단계에서 실제 페이지·권한·원천 current revision을 검증하는 것은 L2/L3 책임이다.

## 판정

- 유효 시간/길이의 비율을 정수 BPS로 계산하거나 의미 버전이 맞는 providerProgressBps를 사용한다. mediaCoveredMs·lastPositionMs를 진도/시간으로 변환하지 않는다. 필요한 진도/속도/종료·원천 전체성·수정 버전이 없으면 UNKNOWN이다.
- 출석일은 승인된 finish ms의 KST 날짜다. sourceCreditDay가 있으면 대조한다. sourceReportedCredit의 true/false만으로 새로운 정책의 조건을 통과/실패시키지 않는다. 다른 임계값 정책은 같은 사실로 별도 평가한다.
- 허용 목록 전체가 완강 의무는 아니다. source는 허용 목록에서 PRESENT 또는 명시적 NO_RECORD를 반환해야 한다. 조회 실패/누락/숨김·UNAVAILABLE/UNKNOWN은 결석과 다르다.
- 정상 종료·기간/streaming/속도·지표 임계값을 충족하는 후보 중 시간순 첫 강의 credit를 보존한다. 같은 lecture를 다른 날짜에 재사용하지 않고, 하루 여러 강의는 하루만 센다. 동일 sourceRecord 재시도는 중복 제거, 같은 ref의 다른 내용은 보류다.
- 아직 닫히지 않은 오늘과 미래 날짜를 결석으로 만들지 않는다. 확인된 과거 미충족일은 NOT_MET, 미확인은 ON_HOLD, 아직 기간이 진행 중이면 IN_PROGRESS다. 정정은 별도 승인된 새 버전으로 재평가하며 중복 적립하지 않는다.

| learningStatus | 공통 RuleObservation | value / days |
| --- | --- | --- |
| PASS / NOT_MET | OBSERVED | 유효 날짜 지표의 최소 BPS(0일이면 0) / 중복 제거한 유효 날짜 수 |
| ON_HOLD | UNKNOWN | null / null |
| IN_PROGRESS | IN_PROGRESS | null / null; 부분 creditedDates는 내부 진단만 |

M2가 ruleHash·unit·days/threshold와 evidence 신뢰/범위를 확인한다. 학습 RuleObservation은 Evidence·단회 수락·전체 자격·FINAL/재원 배정·지급이 아니다. OR 경로에서 학습이 불필요한지는 M2가 해당 경로의 요구를 선택하여 결정하며 L1이 임의 전체 경로를 승인하지 않는다. humanAttentionProven/productConnected/paymentAllowed는 false다.

## 검증과 후속

고정 Node 24.21.0, 변경 없는 lock으로 이 작업본에만 `npm ci --ignore-scripts`를 실행했다. 전역 런타임/공통 설치를 수정하지 않았다.

```sh
./tools/node --test tests/moodle-mvp/*.test.mjs tests/moodle-preparation/*.test.mjs tests/mvp-policy/*.test.mjs tests/policy/*.test.mjs tests/learning-evidence/*.test.mjs
./tools/npm run verify:workspace
./tools/npm run verify:dependencies
```

로컬 합계 293개 통과(신규 L1 35, 재사용 corpus 5, M1 10, 기존 정책112/B3 131), 실패/skip 0. 같은 기록/다른 threshold, 90/100/14일, 정확 ms·1ms 미달, 진도·속도 미확인, 현재일/미래/자정/endExclusive, 재조회/강의·날짜 중복, 명시적 absence/조회 실패, page/binding/정정/revision·범위/만료·변조, immutable 입력/출력을 검사했다. Ganache native module이 없어 기존 B3 회귀가 JS fallback으로 실행됐으며 실패는 없었다. 이 회귀의 인메모리 체인은 사용자 DB/기존 체인이 아니다.

원본/legacy191파일·reference4개 보존 및 의존성 검사 통과. 새 시험은 전용 경로에서 로컬 실행하며 root CI에 무단 추가하지 않았다. 원격 head/CI·공개 이력 확인은 PR에 기록한다.

L2/L3는 새 synthetic export lab/current revision·감사 이력·페이지/실패 검사와 read-only driver를 작은 후속 단위로 준비한다. 기존 Moodle/Docker 환경·토큰·개인계정·새 실제 재생·학원 접속은 사용하지 않는다. 실제 Moodle/원천 BLOCKED, 400% 자동 자격/지급 금지, 500% 시연 제외, grant/outbox HOLD, 독립청구 NO-GO, 예치 정책 OPEN, Mac 원인 미확정을 유지한다. L4 HTTP/DB 연결은 공통 소유자와 별도 합의하며 Draft PR 자동 병합 없음.
