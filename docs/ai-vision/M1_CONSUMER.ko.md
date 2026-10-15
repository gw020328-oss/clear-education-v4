# #39 M1 계약 소비: 정책 초안과 순수 문서 사전검토

2026-10-15. **MOCK_IMPLEMENTED / NO_UPLOAD / NO_EXTERNAL_TRANSFER / NO_PAYMENT_AUTHORITY**.

의존 계약은 `clear-mvp.1` / `clear-mvp-compiler.1`, 공통 feature commit `3b540193e12085c0da38157364e3c59212493c9b`, [Draft PR #43](https://github.com/gw020328-oss/clear-education-v4/pull/43)이다. [정본 계약](../current/MVP_POLICY_CONTRACT.ko.md)을 소비하며 이번 작업의 기준 develop은 `21776f5`다. [준비 PR #42](https://github.com/gw020328-oss/clear-education-v4/pull/42)의 이력도 병합해 기존 31개·후기/블로그 11개·별도 일반화 3개 명세를 보존했다. 선행 PR이 미병합이면 이 PR도 의존 브랜치의 Draft다. 자동 병합하지 않는다.

후속 인수: 공통 #43의 EXAM 기간/coverage·schema 불변 보정 `3961b09cbcb71c028d2dae6be2889a39849ee7c7`도 이력 병합해 소비 시험을 다시 확인했다. 공통 담당은 별도 review plan/hash 경계를 승인하고 정본 결합 미결을 OPEN으로 유지했다. [M2 Draft #46](https://github.com/gw020328-oss/clear-education-v4/pull/46)이 별도로 제공됐지만 이 소비자는 DocumentPrecheck→Evidence 변환을 추가하지 않는다. M2 자격/선택/금액 연결은 이 PR의 완료 사실이 아니다.

선정 설정과 전달된 실제 실행 설정은 GPT-6.1 Sol / Medium이다. 새 권한·자금·민감 저장 설계를 추가하지 않고 계약 기반 순수 소비자로 한정했다. 루트 schema/HTTP/DB/package/CI 및 web는 이 작업에서 수정하지 않는다.

## 정책 초안

[`proposePolicy`](../../src/ai-policy/proposal.mjs)는 운영자가 준비한 `PolicyDraft` 템플릿, 독립 source/capability pin, sourceId/locator/text 묶음과 mock adapter를 받는다. 템플릿이 지원하는 rule/requirement slot 안에서만 후보를 받을 수 있다. 모델이 반환한 Rule/Question을 공통 `validateContract`로 검사하고 인용문이 제공된 고정 위치의 텍스트에 실제 존재하는지 비교한다. 근거 없는 위치·문구, 임의 실행 연산, 새 rule slot, 승인 필드, 모델의 질문 해결 선언을 거부한다.

출력은 `mode=OFFICIAL_DRAFT`, 후보 규칙은 `basis=OFFICIAL_OPEN`, 질문은 OPEN이다. source raw hash와 text byte의 일치·의미 지지·공식 적용성·publisher 진위를 입증한 것이 아니다. 템플릿/초안 shape·slot·인용 검사와 실행 정책 컴파일을 구분한다. 이 초안은 기존 공통 compiler에서도 OFFICIAL_BLOCKED이며 `publishable/paymentAllowed=false`다. 모델이 지원할 수 없는 내용은 근거 있는 질문으로 표현하고, 잘못된 출력/실패/거절/timeout은 보류한다.

`recordOperatorReview`는 예상 revision과 검토자 참조/질문별 의견을 기록한다. 동일 프로세스의 낡은 검토 handle은 재사용할 수 없다. 의견을 썼다고 OPEN 질문이 해결되거나 공식 약정/증거가 검증되지는 않는다. 인증·영속 저장·분산 동시성·정책 게시·학생 동의는 이 순수 모듈에 없다. 복사/재시작한 review handle은 수락하지 않으며, 공통 영속 수락 계약 전까지 메모리 안의 검토 기록이다.

## 결정적 문서 사전검토

[`precheckCode`](../../src/document-precheck/precheck.mjs)는 공통 compiled policy와 caller가 고정한 신청/정책/주체/제출/경로/run context, 제출 텍스트·이미지 메타데이터를 받는다. 실제 `DocumentPrecheck` schema를 검증하여 반환한다. 정책·rule·requirement·revision·inputHash가 다르면 거부한다.

검사 설정은 별도의 버전 있는 합성 `reviewPlan`과 독립 pin한 `reviewPlanDigest`로 받는다. 브랜드별 prompt/검사 코드를 복제하지 않는다.

| 지원 연산 | 고정해야 하는 설정 / 확인 범위 |
| --- | --- |
| CHAR_COUNT | 최소값·JS codepoint/UTF16·공백 처리·NONE/NFC. 미결 null은 POLICY_OPEN |
| BYTE_COUNT | 최소값·UTF8·공백/정규화. 공식 byte 계산 방식이라고 임의 확정하지 않음 |
| IMAGE_COUNT | 제출 파일 메타데이터 개수. 중복 인정 미결이면 POLICY_OPEN; 내용·촬영자·실제 파일 진위 아님 |
| LINK | 제출된 링크 문자열의 정확 일치. prefix 일치·외부 fetch·redirect 탐색 없음 |
| TEXT | 지정 문자열과 ANYWHERE/START/END. 위치 미결이면 임의 선택하지 않음 |
| KEYWORDS | 명시 목록의 부분 문자열·최소 종류 수, title/text/tags. 글별 또는 묶음 단위. 반복 횟수 해석은 미지원 |

위 계산 방식은 명시적으로 고정된 합성 설정이다. 공식 학원 byte/문자·키워드/문구 해석을 확정한 것이 아니다. 모르는 연산은 지원하지 않는다. 부정적인 후기/감정/성의 점수를 이유로 탈락시키는 연산도 없다.

글별 CODE record와 별도 bundle record를 반환한다. 보완 후 새 revision/inputHash를 사용한다. 미제출은 MISSING이며 미결 정책과 누락이 함께 있으면 둘 다 남기고 총괄 UNDETERMINED다. 현재 준비 상한 14글·글당 8장·8MiB/20MP를 메타데이터에서 검사하지만, 이 숫자는 실제 decode·악성 이미지·메모리 수명 검증 결과가 아니다. 파일 읽기/저장/업로드/외부 전송은 없다. 30초 decode 상한도 decode 구현의 완료 사실이 아니다.

## 텍스트/Vision 관찰과 늦은 응답

`precheckObservation`은 같은 context에 대해 TEXT_AI 또는 VISION의 mock 관찰을 분리한다. 이미지가 없으면 observer를 호출하지 않는다. 허용 field ID, 입력 post/image ID 또는 본문 UTF16 span과 인용문을 검사한다. 존재하는 이미지 ID는 픽셀 근거·진위 검증이 아니다. 실제 이미지 bytes/판독/모델 성능은 이 단위에서 다루지 않는다. TEXT_AI span의 일치도 제목/본문 관련성의 정답을 보장하지 않는다.

읽을 수 없는 값은 null/UNREADABLE로 보존한다. 누락 필드가 있는데 CHECKED로 반환하거나 입력 밖 locator·추가 승인 필드가 있으면 결과를 거부한다. 내용 적합성은 실제 모델과 사람 gold로 후속 평가해야 한다. model failure/refusal/timeout은 NEEDS_REVIEW/UNDETERMINED이며 원문 오류를 내보내지 않는다. adapter는 신뢰한 테스트 코드이고 sandbox가 아니다. abort를 무시하는 callback의 자원을 강제로 종료하거나 동기 CPU 작업을 중단하지는 못한다.

`markPrecheckCurrent(record,latestContext)`는 신청/주체·정책·ruleVersion·제출/경로 revision·inputHash·runId 중 하나라도 다르면 `current=false`로 만든다. 한번 낡아진 record를 다시 current로 올리지 않는다. caller는 결과를 표시/수락하기 전에 신뢰한 최신 context로 이 검사를 해야 한다. 이 모듈은 결과 저장·DB compare-and-set·HTTP idempotency를 구현하지 않는다.

모든 record의 publication/author/publishedAt/modifiedAt/publicAvailability는 각각 UNVERIFIED, automaticEligibility/paymentAllowed는 false다. `PRECHECK_REQUIREMENTS_MET`은 자료 사전검토 표시일 뿐 Evidence VERIFIED, 400% 자격/지급, 연속 게시나 작성자 확인이 아니다. ACTUAL adapter는 호출 전에 거부한다. 실제 provider 연결은 키·승인 비용·전송/보존 조건을 확정한 후 별도 단위다.

## 적합성 미결과 후속

1. M1 BOOLEAN Rule보다 세부적인 review plan의 해시를 policyHash/동의에 결합할 정본 필드는 없다. 현재 wrapper의 planHash만 반환하고, 이를 정책에 이미 결합됐다고 주장하거나 Evidence/M2 자격 입력으로 전환하지 않는다. 공통 담당에게 전달한 미결이다.
2. `DocumentPrecheck.locator`는 문자열이므로 이 소비자는 text span 또는 post/image ID를 사용한다. 실제 bbox·변환 이미지 hash·provider run metadata/보존은 실제 모델/업로드 계약에서 확정해야 한다.
3. sourceTextDigest는 caller 제공 텍스트 지문이다. 고정 Source rawHash/normalizer와의 바이트 연결·의미 검토는 별도 원문 조립 책임이다.
4. M2 경로/후보/최초 제출/금액 확정 연결, 운영자 확정 후 실행 정책 게시·학생 동의, 인증된 수락·영속 revision/멱등성은 아직 없다. M2를 기다리느라 위 독립 소비 작업 전체를 미루지는 않았다.
5. 제3 프로필은 동일 `compileExample('third')`·Binding·소비자를 사용한다. 700점/14일8000bps/42 TEST는 합성 설정이며 실제 상품이나 원화 환산이 아니다. 제3 프로필에 대한 M2 자격 평가 완료와 구분한다.

400% 사전검토/500% 제외는 현재 시연 profile/capability의 제한이다. 일반 모듈은 특정 브랜드/환급 숫자로 분기하지 않는다. 실제 신규 원천에는 별도 adapter·버전·검증이 필요하다. 예치 정책 OPEN, grant/outbox HOLD·독립청구 NO-GO·Moodle/원천 BLOCKED·Mac 과거 원인 미확정은 유지한다.

## 재현과 평가 분모

```sh
./tools/node --test tests/ai-policy/*.test.mjs tests/document-precheck/*.test.mjs
./tools/node tests/ai-policy/evaluate-mock.mjs
./tools/node --test spikes/ai-vision-preparation/*.test.mjs tests/policy/*.test.mjs
./tools/npm run test:mvp-policy
./tools/node specs/m0/check.mjs
./tools/node tools/verify-workspace.mjs
```

`evaluate-mock.mjs`는 기존 준비 평가기를 재사용해 계약 소비 사례 7개를 비교한다. source 질문·추가 승인 거부·7/8장·흐림 mock·제3 프로필·늦은 run을 검사한다. 기존 45개 명세 전체, 실제 gold corpus, 실제 모델 평가와 별도 분모이며 실제 호출 0이다. 전체 이미지 prompt-injection 저항·모델 정확도·비용/latency 성능의 실측을 주장하지 않는다.

로컬 결과: 신규 소비자 25개, 준비 평가기 15개, 기존 정책 112개, M1 공통 10개를 각 실행 범위에서 PASS로 확인했다. mock 계약 소비 평가 7/7 PASS이며 실제 모델 호출 0이다. M0 예제·원본 191개/공개 참고 4개 지문·의존성 그래프 보존도 PASS다. 검토 중 잘린 근거/추가 승인·타임아웃과 취소 경합·미제출 모델 호출·낡은 run·미결과 누락의 동시 표시를 확인하고 관련 회귀를 포함했다.

공개 이력·원격 CI 결과는 PR/이슈 #39에 기록한다. 신규 소비자 시험의 루트 CI 편입은 공통 담당과 합의할 후속이며 이 PR이 workflow를 변경하지 않는다. 원격 기존 필수 CI와 신규 로컬 검사를 구분한다.
