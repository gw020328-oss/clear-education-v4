# 합성 사전검토 기준과 정책 해시 결합

`src/document-precheck/bound-policy.mjs`는 review plan과 표시 기준을 공통 M1 컴파일러의 **실제 policyHash/ruleHash**에 결합한다. 기존 wrapper의 planHash만 비교하던 경계를 보완한다. 공통 Source 스키마를 변경하지 않으며, 공통 담당과 합의한 별도 내부 Source namespace를 사용한다. 운영 HTTP/DB/서명·학생 동의·Evidence 수락은 구현하지 않았다.

## 준비·검토·컴파일

1. `prepareReviewPolicy`는 원래 PolicyDraft, 버전 있는 plan, locator별 표시 원문, 선택적 TEXT_AI/VISION 필드·prompt 버전으로 동결된 candidate를 만든다. plan·rule·requirement·상품/기수·capability·원천 집합·표시 원문을 domain/version별 digest로 묶는다. policyHash를 계산 전 manifest 안에 넣지 않아 자기참조를 피한다.
2. rule마다 내부 Source를 추가한다. `sourceId=review-plan.1.<manifest 앞 40 hex>`, `origin=SYNTHETIC_ASSUMPTION`, `applicability=SYNTHETIC_ONLY`다. `rawHash`는 내부 manifest digest, `normalizedHash`는 표시 DTO digest, normalizer는 `clear-review-display.1`이다. **공식 원문 진위나 기관 승인을 뜻하지 않는다.**
3. 내부 Source locator에는 전체 64 hex manifest를 넣고 해당 rule의 sourceRefs에 추가한다. 공통 ruleHash가 Source 내용 자체를 해시하지 않는 점을 보완하여 plan·원문·표시 변경도 실제 ruleHash와 policyHash를 바꾼다.
4. `compileBoundReviewPolicy`는 caller가 별도로 제공한 manifest 승인·전체 source pins·capability pins·표시 원문 pin을 검사한다. candidate로부터 승인/pin을 자동 생성하거나 갱신하지 않는다. 내부 Source가 잘못된 원래 규칙의 합성 근거를 대신하지 못하도록 **원래 정책부터** 같은 외부 pins로 컴파일한 뒤 결합 정책을 컴파일한다.

authority 인자는 신뢰한 caller 계약이며 인증 기능이 아니다. 예제의 authority는 명시적인 합성 fixture이고, 운영자가 검토했다는 증거가 아니다. 원문 bytes와 공식 Source rawHash의 연결·normalizer의 정확성·표시 원문의 의미는 이 모듈이 독립 검증하지 않는다. 운영 경로에서는 신뢰한 resolver/저장소가 이를 제공해야 한다.

## 정확한 표시와 합성 acknowledgment

`createReviewPreview`의 snapshot은 참가자 Binding, 실제 policyHash, 상품/기수, ruleHash, planHash, displayHash, 원천 집합/텍스트 pin, 원문·전체 plan·관찰 필드·prompt 버전을 포함한다. `acknowledgeReviewPreview`는 preview handle, 예상 previewHash, **정확히 같은 displayedSnapshot**을 요구한다. 일부 조건을 바꾼 표시나 다른 참가자 Binding은 거부한다.

OPEN plan 옵션·근거 또는 OPEN 원천이 하나라도 있으면 preview는 `POLICY_OPEN`이며 acknowledgment할 수 없다. 원래 YBM/시원 예제의 OFFICIAL_SNAPSHOT/OPEN을 모듈이 합성으로 바꾸지 않는다. 세 프로필의 성공 회귀 중 YBM/시원은 테스트가 명시적으로 새 합성 Source를 구성한 경우이며 공식 정책 완료를 의미하지 않는다.

이 acknowledgment는 `SYNTHETIC_ACK_ONLY`, `userConsentVerified=false`다. 실제 화면이 사용자의 눈에 표시됐는지 확인하지 못하며 서명·인증·동의 저장·복구·철회 기능이 없다. 코드 실행의 선행 DTO 일치 조건을 실제 동의라고 표시하지 않는다.

## 실행과 낡은 응답 보류

CODE는 bound policy에서 해당 버전 plan을 선택한다. TEXT_AI/VISION은 표시된 method/field 목록/prompt 버전과 맞아야 observer를 호출하며, 여전히 MOCK adapter만 허용한다. 임의 plan이나 선언되지 않은 관찰 필드로 실행할 수 없다.

결과 envelope는 실제 policyHash/ruleHash와 plan/display/manifest/원천 텍스트/method/input/preview 지문 및 제출·경로 revision/runId를 포함한다. 표시/수락 시 `reviewPrecheckEnvelope`에 **신뢰한 최신 bound policy·context·입력**을 다시 제공해야 한다. 정책·plan·원문·기수·입력 DTO·revision·retry가 바뀌면 이전 결과의 소비 값을 null, current=false, NEEDS_REVIEW로 내린다. 늦은 비동기 응답도 같은 검사를 거친다. 한번 낡아진 envelope는 이전 context를 재제출해도 부활하지 않는다.

현재 submission은 본문과 이미지 **메타데이터 DTO**다. 동일 메타데이터를 유지한 실제 이미지 바이트 교체는 이 inputHash로 탐지할 수 없다. 실제 업로드 바이트/변환본 hash·OCR·픽셀 근거 결합은 아직 없고 MOCK observer만 사용한다. 이 결과를 실제 파일 무결성 검증으로 표시하지 않는다.

핸들은 in-process WeakSet/WeakMap으로 식별한다. JSON으로 복사한 ack/envelope를 승인 핸들로 재사용할 수 없다. 서버 영속 revision/CAS, 다중 프로세스 결과 수락, HTTP 인증/멱등성은 이 모듈 밖이다. caller가 최신 resolver 대신 낡은 상태를 제공하는 것을 탐지하는 독립 저장소도 없다. 기존 자유 plan 소비 API는 하위 순수 모듈로 남아 있으므로 후속 운영 연결은 이 결합 API의 검사를 우회하지 않아야 한다.

## 검증과 미구현 범위

[완전한 합성 preview·envelope 예제](policy-binding-example.json)는 제3 프로필에 대해 공통 컴파일러로 계산한 실제 해시를 포함하며 다음 명령으로 만든다. 네트워크·키·실제 모델 호출은 없다.

```sh
./tools/node tests/document-precheck/bound-policy-example.mjs
./tools/node --test tests/document-precheck/bound-policy.test.mjs
```

전용 13개 회귀는 세 프로필의 실제 해시 변화, 독립 승인/pin 불일치, 표시 변조, OPEN 보류, 기존 잘못된 규칙의 내부 Source 세탁 거부, 정책/입력/retry 변경, 늦은 관찰, 참가자 경계, 복사 핸들 거부와 sticky stale을 검사한다. M1/M2의 계약이나 인증된 Evidence adapter를 추가하지 않았다. 모든 최종 결과의 `userConsentVerified`, `automaticEligibility`, `paymentAllowed`는 false다. 게시·연속 공개·작성자·진위도 검증되지 않았다.

Source-authority와 실제 동의/Evidence 경계에 대한 공통 최종 리뷰는 Astra / High 권장 범위다. 예치 정책 OPEN, 400% 사전검토만/500% 제외, 원천·동일인 미확인 보류, grant/outbox HOLD·독립 claim NO-GO를 유지한다. 기존 금고·DB·키·체인은 수정하지 않았다.

공통 최종 통합에서 전용 회귀·mock과 함께 과거 실제 합성 응답의 오프라인 재처리, 정확한 binding 예제 재생/파일 대조를 필수 CI에 편입했다. 모든 명령에 외부 네트워크 차단을 적용하며 키·실제 모델 호출은 사용하지 않는다.
