# S4 — 판정 근거 읽기 계약

2026-10-27. 기준 develop은 PR116 병합 `19e1c1473165cdea52a42040e740b79ba3e50c03`이다. 이 문서의 S4는 별도 Draft 후보이며 병합 전 develop 기능으로 표시하지 않는다. web/PR60·Solidity·S3 쓰기·지급 정책·원천 수집·보존 정책은 변경하지 않는다.

## 요청·권한

- `GET /bootcamp/v3/applications/:app/decision-evidence`: DB에 저장된 현재 판정 ID를 선택한다.
- `GET /bootcamp/v3/applications/:app/decision-evidence/:decisionId`: 같은 신청의 정확한 과거/현재 판정 ID를 선택한다. 다른 신청의 ID는 404다. query 인수는 지원하지 않는다.
- `api.decisionEvidence(app, {decisionId?, signal?})` / 내부 `store.getDecisionEvidence(context, app, decisionId?)`.

기존 HTTPS/loopback·same-origin·세션 cookie·wallet/chain 문맥을 그대로 사용한다. 인증된 신청 소유 참가자와 해당 `courseOperatorRef`에 배정된 운영자만 읽는다. 운영자는 `COURSE_OPERATOR`, 참가자는 `PARTICIPANT`다. 타인/다른 과정/배정이 없는 운영자는 403이다. `AUTH_REQUIRED` 401, `FORBIDDEN` 403, `BC_NOT_FOUND` 404, 판정 결합 오류 `BC_DECISION_TARGET`·시계 역행 `BC_CLOCK_REVERSED`·읽는 동안 초 변경 `BC_VIEW_STALE`는 409다. 내부 오류는 원문 없이 `BC_INTERNAL` 500이다. 응답은 `Cache-Control: no-store`다. POST·원문 endpoint는 제공하지 않는다.

읽기 트랜잭션의 동기 snapshot에서 application/decision/evidence의 정확한 ID·revision·hash·policy/mapping 결합을 확인한다. 반환 직전 현재 세션과 변경 가능한 과정 배정을 다시 확인한다. 비동기 원천/RPC 조회는 없다. 기존 refresh/tick 경로를 사용하지 않아 새 판정·무효화·원장·nonce·동의·수집·AI/유료 호출·서명·지급·기한 연장을 만들지 않는다. 외부 인증 서비스의 기존 세션 검증 동작까지 새로 정의하는 계약은 아니다.

## 응답

`version=clear-bootcamp-decision-evidence.1`이고 `manifest.version=clear-bootcamp-evidence-manifest.1`이다.

| 필드 | 의미 |
| --- | --- |
| `applicationId`, `role`, `observedAt` | 권한 있는 신청과 서버 snapshot 시각(초) |
| `currentDecision.decisionId` | 조회 시 DB의 현재 판정 ID |
| `currentDecision.matchesRequestedDecision`, `applicationActive` | 선택 판정과 DB head 일치/신청 활성 여부. 원천의 현재성·지급 자격을 의미하지 않음 |
| `manifest.decision` | 선택한 정확한 `decisionId/decisionRevision/decisionHash/policyHash/evaluatedAt/conditionsStatus`, 저장되지 않은 `policyVersion={status:UNAVAILABLE,value:null}` |
| `manifest.criteria[]` | 네 조건의 **선택 판정 당시** 상태와 정확한 evidence ID/revision, 안전한 저장 메타데이터 |
| `manifestHash` | `p0Hash('EVIDENCE-MANIFEST', manifest)`. 반환한 최소 manifest 지문이며 원래 decisionHash를 대체하지 않음 |
| `availability[]` | 조회 시각과 저장된 head/무효화/삭제 기록에 근거한 별도 상태. manifest의 과거 판단 결과를 덮어쓰지 않음 |
| `limitations` | `hashProvesSourceTruth/independentReverificationAvailable/liveSourceChecked/originalTextHttpAvailable/usableForPayment` 모두 false |

`criteria.metadataStatus`는 `RECORDED / MISSING / UNAVAILABLE`이다. 근거가 없으면 `MISSING`, 참조된 메타데이터가 없으면 `UNAVAILABLE`이고 새 head로 대신 채우지 않는다. 존재하는 근거는 `source.kind/dataMode/sourceHash/acquiredAt/verifiedAt/runtimeMappingHash/requestHash`와 opaque evidence ID·고정 논리 필드만 제공한다. 실제 계정·원천 record/instance/accountBindingRef 및 내부 경로는 반환하지 않는다. `verification`은 저장된 sourceStatus/participantBinding/requestBinding/integrity/freshness 검사 결과이며 **당시 검사**다. `SYNTHETIC_FIXTURE`를 실제 검증으로 표시하지 않는다.

- HackerRank: 저장된 account/certificate proof 지문과 각 발급 시각, certificateName/issuerStatus/achievementAt. bridge가 있으면 receipt/proofBundle/trustConfig/recipe/producerRequest 지문과 당시 validUntilExclusive를 제공한다. 없는 bridge는 `reference={status:UNAVAILABLE,value:null}`이다. 실제 proof·공증자/참가자 서명·claim owner/account 식별 지문은 제공하지 않는다. 이 기록은 현재 원천 진실성이나 독립 제3자 재검증 패키지가 아니다.
- Moodle 활동/과제: source 지문/관측시각, 저장된 완료 상태·자동/수동 방식·완료 규칙 지문·완료 시각 또는 제출 상태·제출 시각. bridge가 있으면 receipt/producerRequest 지문을 제공한다.
- 회고/AI: 원문 지문, observation run ID·저장 profile 지문·bridge observation 지문, 항목별 `PRESENT/MISSING/UNCERTAIN/CONFLICT`와 근거 위치. 위치는 opaque evidence ID·`/source/body`·`start/end`·`unit=UTF16_CODE_UNIT`·quoteHash다. 원문/인용 텍스트·실제 sourceId는 제공하지 않는다. source 원문을 다시 읽거나 quote를 새로 생성하지 않는다.
- 현재 product evidence/bridge에는 **해당 판정의 model/prompt/rubric version이 영속 저장되지 않는다**. 실행 설정·현재 상수·trust/profile hash에서 역산하지 않고 각 `UNAVAILABLE`을 반환한다. profile hash를 rubric version으로 바꾸지 않는다. policy는 저장된 hash를 그대로 제공하며 별도 문자열 버전은 UNAVAILABLE이다. 이를 새로 수집·저장하는 작업은 이번 범위 밖이다.

`availability.status`는 `MISSING / UNAVAILABLE / DELETED / EXPIRED / SUPERSEDED / INVALIDATED / APPLICATION_INACTIVE / VALID_AS_RECORDED`다. 삭제는 해당 evidence의 기존 `DELETED` 기록이 있을 때만 표시한다. 만료는 저장된 raw 기한·현재 head 유효 기한·관측/발급 시각으로 계산한다. 현재 head의 다른 근거는 SUPERSEDED, 유효하지 않은 head는 INVALIDATED다. 삭제 기록이 없는 원천의 실제 삭제를 추측하지 않는다. `VALID_AS_RECORDED`도 살아 있는 원천을 확인한 뜻은 아니다. 모든 행의 `sourceCurrentness=UNKNOWN`이다. `sourceValidUntilExclusive`는 같은 현재 head에 저장된 기한 또는 bridge에 저장된 원래 기한이며, 과거 Moodle 기한이 따로 남지 않았으면 null이다. 원문 접근의 `original.expiresAt`와 구분한다.

`availability.original`은 `{status:DELETED|EXPIRED|UNAVAILABLE,httpAvailable:false,expiresAt:저장값|null}`이다. 원문 보존·접근 권한을 확대하지 않으며 만료·삭제된 원문을 복구하지 않는다. 과거 판정도 만료 전 메타데이터를 읽을 수 있는 권한과 원문을 다시 볼 수 있는 권한은 다르다. 이 조회로 이미 ACCEPTED된 권리의 청구 기한을 만들거나 현재 판정을 다시 평가하지 않는다. 수락/수령 확인은 기존 paymentReceipt, canonical 체인 반영은 reviewChain으로 별도 읽는다.

## 프론트 표시 예시·S5 의존성

```js
const explanation = await api.decisionEvidence(app, {
  decisionId: view.target.targetDecisionId,
  signal
});
const d = explanation.manifest.decision;
// view의 decisionId/revision/hash와 d의 세 값을 모두 대조한다.
// 불일치하면 과거 판정으로 표시하고 자동 동의/쓰기/재평가하지 않는다.
```

두 역할 모두 “판정 revision N / 조건 MET / 당시 근거 기록”과 “원천 현재성 미확인 / 원문 제공 안 함”을 분리해 표시한다. 예: “학습 활동: 당시 MET, 원천 지문 …, 관측시각 …, 현재 저장 기한 만료”, “회고: 문제 해결 PRESENT, 근거 위치 12–28, 모델/루브릭 버전 미보관”. 누락·불명·조회 오류를 성공/현재 유효로 바꾸지 않는다. `manifestHash`를 진실성 인증·AI 정확성 보장·서명 검증 수단으로 안내하지 않는다. 회고 offset은 원문이 없는 상태의 위치 메타데이터다.

S5에는 PR60의 양 역할 화면 연결·오프라인 UX 검사와 새 신청의 실제 원천/정확한 이번 입력 AI 승인·별도 V2 등록 서명·양측 직접 동의·100 TEST 영수증 검증이 남는다. 기존 r20 실제 성공을 이번 S4/S5 성공으로 재사용하지 않는다. 실제 평가 authority 입력 연결, model/rubric 영속 기록 확대, 새 수집/Vision/정책 구조화는 이번 PR로 완료했다고 주장하지 않는다. Issue106은 OPEN을 유지한다.

## 검증

합성 자료만 사용한다. 신규 `decision-evidence.test.mjs`는 양 역할·같은 판정 결합·DB 불변·만료/삭제/과거 revision/누락·재시작·민감 필드 배제·타인/다른 과정 거부·최종 권한 철회·시계 역행/경계·HTTP/client를 검사한다. 기존 consumers 시험에서 실제 verifier 모듈의 **합성** pair proof 참조와 Moodle/AI observation 지문 연결을 대조한다. V2 정상 지급 시험은 S4 GET 전후의 실행 지표 불변과 동일 manifest, 정확한 100 TEST·중복 거부를 함께 확인한다. 정확한 실행 결과와 CI HEAD는 PR/Issue106에 기록한다.

로컬 상세는 [S4 검증 기록](BOOTCAMP_S4_VERIFICATION.json)을 따른다. 첫 전체 실행의 브라우저 지문 1건 실패와 보정 후 38개 집중 검사, 원문/원천 만료 구분의 6개 최종 집중 검사를 별도 보존한다. 같은 전체 검사를 로컬에서 반복하지 않았으며 최종 HEAD 전체 CI는 PR/Issue106에 기록한다.

최종 통합 대조에서 `tools/bootcamp/frontend-server.mjs`의 별도 허용 목록에도 S4 GET을 연결했다. 합성 임시 TLS 서버에서 두 역할·과거 판정·타인/Origin/인증 거부·POST 차단·조회 부작용 없음을 기존 HTTPS 파일 9/9로 확인했다. 실제 normal-host 활성화나 사용자 신뢰 저장소 CA 설치는 하지 않았다. 기존 같은 출처 호스트의 V2 `recipient-registration` 및 S3 `review-chain` 경로 허용은 별도 S5 연결 의존성으로 남는다. 내부 API handler 구현과 제품 호스트의 노출 경로를 구분하며 이번 S4에서는 그 두 경로를 확대하지 않았다.
