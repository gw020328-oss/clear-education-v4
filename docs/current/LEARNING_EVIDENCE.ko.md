# B3 학습 입력 계약과 합성 adapter

후속(2026-10-13): [이슈 #24](https://github.com/gw020328-oss/clear-education-v4/issues/24)의 [학습 provider 경계·Moodle 연결 명세](LEARNING_PROVIDER.ko.md)를 추가했다. 기존 driver/검사/evaluator를 재사용하며 기관·강좌·필수 활동 매핑과 완료 의미를 검증하는 합성 시드 provider를 제공한다. Moodle 공식 API를 조사했으나 실제 기관 설치/endpoint/토큰/계정 연결·원천 검증은 미확인이다. 아래 최초 B3 조사 기록과 구분한다.

2026-10-13, 담당 오규원. [이슈 #13](https://github.com/gw020328-oss/clear-education-v4/issues/13), B2b PR #19 병합 `3f8ef791f173c5c7ccc87085c9c41e956cfae792` 기준.

**완료 범위는 고정 필수 강의 목록의 학습 증거 계약·합성 adapter와 기존 평가기 연결이다. 실제 제공자 API·인증·영속 제품 수락은 미구현이며 실제 학습 검증은 BLOCKED다.** CLEAR 지급 승인 서명이나 새 지급 구조를 전제로 하지 않는다. 800점 AND 80% 및 전체 시험 중 최고점 정책은 유지한다.

## 제공자 확인 결과와 남은 정보

확인한 근거는 이슈 #13, [팀 계획](TEAM_PLAN.ko.md), [정책 평가기](POLICY_EVALUATOR.ko.md), 기존 `src/policy`·`src/eligibility`다. 저장소의 시드는 모의 학습 기록이며, 이번 작업에 실제 학원/제공자 이름·공식 문서·API 주소·접속 권한이 제공되지 않았다. 인터넷 전체에 API가 없다고 단정하거나 이름이 비슷한 서비스를 제공자로 선택하지 않았다. 실계정 접속·외부 연락은 하지 않았다.

| 실제 연결에 필요한 것 | 확인 상태 / 필요한 담당 |
| --- | --- |
| 제공자·공식 계약·버전/endpoint·가용성/한도 | 미확인. 운영 담당자가 제공자와 공식 문서 경로를 지정해야 함 |
| 인증·조회 권한·사용자 동의·인증된 응답의 신뢰 근거 | 미확인. 제공자 및 백엔드 담당의 검토 필요. 비밀은 공개 이슈/문서에 넣지 않음 |
| 지갑/신청의 learnerId ↔ 제공자 subjectRef 연결 | 미확인. 본인 계정 연결 방식과 변경/해제 의미를 별도 확정해야 함 |
| 고정 강의 ID, 완료 의미·시각/시간대, 인정 기간, 삭제·정정 | 실제 의미 미확인. 아래 계약은 합성 제안이며 제공자 응답 형식을 기술한 것이 아님 |
| 전체 필수 목록 projection, 페이지 건수/종료, 일관된 revision | 실제 보장 미확인. 완전한 snapshot을 인증할 수 없으면 보류 |
| 실제 수집·보존/삭제 경계·재평가/정정 이력 | 미구현. 보존 근거·접근 권한·삭제 정책 검토 전 실제 저장 금지 |

## 구현과 신뢰 경계

- [synthetic-contract.mjs](../../src/learning-evidence/synthetic-contract.mjs): `assessSyntheticLearningEvidence(compiled, context, bundle)` 순수 검사. 성공 시 기존 `evaluateSyntheticEligibility`가 받는 최소 learning snapshot을 반환한다. 오류 입력은 고정 사유의 ON_HOLD이며 부분 이수율/snapshot을 반환하지 않는다. 잘못된 내부 context/컴파일 객체는 호출 오류로 거부한다.
- [synthetic-adapter.mjs](../../src/learning-evidence/synthetic-adapter.mjs): `collectSyntheticLearningEvidence(compiled, trusted, source, options)`가 합성 driver의 manifest와 고정 페이지를 읽고 정정/버전 변경·시간·실패/중단을 검사한다. 실제 HTTP client나 기본 URL은 없다.
- `compiled`는 기존 컴파일러가 만든 불변 정책이다. policy hash/requiredLectureIdsHash·기간·완료 규칙은 입력 응답으로 덮어쓰지 않는다. 기존 compiler/evaluator/DB/schema/금고/HTTP/UI는 변경하지 않는다.

`trusted`는 내부 resolver가 별도로 고정할 `{applicationId, learnerId, providerId, subjectRef, snapshotVersion, manifestHash}`다. 신청 ID와 subjectRef/manifestHash는 32바이트 hex, learner/provider/version은 NFC의 1–64자 식별자다. 검사 시점 `now`는 서버 시계이며 순수 함수의 context에만 추가한다. adapter의 trusted에 now를 넣을 수 없다.

합성 시험에서만 fixture가 이 resolver를 대신한다. **응답에서 읽은 hash·버전·계정 식별자를 그대로 trusted로 옮기는 것은 검증이 아니다.** 실제 resolver는 인증된 신청/지갑 소유, 승인된 계정 매핑, 제공자 인증 및 버전 조회로 이 값을 얻어야 한다. 이 모듈이 B1 로그인/세션 권한을 직접 인증하지는 않으며, 참가자 HTTP body를 context로 받는 공개 경로는 없다. subjectRef는 단순 임의 식별자이며 실명 확인·익명성·중복 방지 수단으로 승격하지 않는다.

해시는 별도로 신뢰한 합성 데이터와 바이트 일치를 보일 뿐 실제 제공자 서명이 아니다. 새 CLEAR 서명 키, EligibilityGrant, HMAC nullifier, outbox 또는 온체인 검증 구조를 추가하지 않았다.

## 원천 응답 계약

profile=`synthetic-learning-inventory.1`, dataMode=`SYNTHETIC`인 **정책의 필수 강의만 담은 projection**을 제안한다. 응답의 미완료 강의도 명시적으로 포함해야 하며, 목록에 없다는 이유로 completed=false를 생성하지 않는다. 다른 강의는 이 계약에서 거부한다. 기존 평가기가 임의 강의/동일 중복을 다루는 규칙은 바꾸지 않으며, 이 adapter의 입력을 더 좁게 제한한다.

| 객체 | 정확한 필드 |
| --- | --- |
| bundle | `manifest`, `pages` |
| manifest | `profile`, `dataMode`, `providerId`, `applicationId`, `learnerId`, `subjectRef`, `policyHash`, `requiredLectureIdsHash`, `completionRuleVersion`, `snapshotVersion`, `observedAt`, `validUntil`, `learningStart`, `learningEnd`, `coverageStart`, `coverageEnd`, `totalRows`, `pages`, `terminalPageId` |
| manifest.pages 항목 | `pageId`, `offset`, `rowCount`, `pageHash` |
| page | `pageId`, `snapshotVersion`, `subjectRef`, `offset`, `nextPageId`, `records` |
| record | `lectureId`, `completed`, `completedAt` |

전체 manifest는 trusted.manifestHash와 같아야 하며, 각 pageHash는 페이지의 모든 필드를 결합한다. 기존 canonical JSON/keccak256을 그대로 사용한다. 개인정보/쿠키/인증/호출자 verified 필드를 추가로 받지 않는다. 허용된 필드에 내부 코드가 비밀을 인코딩하는 것을 탐지하는 기능은 아니다.

시각은 선행 0 없는 epoch seconds 문자열이다. 완료 true는 유효 completedAt이 필요하며 observedAt보다 미래일 수 없다. false는 completedAt=null만 허용한다. null/미상 상태를 false로 간주하지 않는다. 정책 인정 기간 양 끝은 포함하며 기간 밖의 완료 사실은 보존하되 기존 평가기가 분자에서 제외한다.

합성 행 예: `{"lectureId":"lecture-a","completed":true,"completedAt":"1577804400"}`, `{"lectureId":"lecture-e","completed":false,"completedAt":null}`. 실제 수강 사실을 나타내지 않으며 전체 bundle/pin 예는 아래 fixture로 생성한다.

전체 필수 목록은 최대 10,000개이며 정확히 한 행씩 있어야 한다. 같은 강의의 동일 중복도 거부하고, 충돌/미지 강의/결측은 보류한다. 최대 100페이지·페이지당 100행, 빈 페이지 금지, 연속 offset·페이지 수·지문·terminal·nextPageId를 대조한다. 응답 배열 순서는 달라도 고정 descriptors로 재구성하며, 최종 records는 정책의 정렬된 강의 순서다.

관측 시각은 학습 인정 기간이 끝난 뒤여야 한다. coverage는 정책 기간 전체를 포함해야 한다. 관측은 미래일 수 없고 최대 300초 전이며, `observedAt <= now <= validUntil <= observedAt + 300`을 요구한다. 300초는 이 합성 adapter의 제한이며 실제 제공자의 freshness 계약으로 승인한 값이 아니다. policy의 기간/800점/80% 임계값을 바꾸지 않는다.

## 수집·정정·재시도

합성 driver는 `{profile, providerId, readManifest, readPage, close}`를 제공한다. readManifest 요청은 신청/학습자/subjectRef·정책 hash·고정 snapshotVersion·필수 목록 hash·학습 기간뿐이며, readPage는 여기에 고정 pageId만 추가한다. 로그인 token·개인키·쿠키를 전달하지 않는다. source 함수들은 신뢰한 내부 코드이며 네트워크 sandbox로 취급하지 않는다.

readManifest의 snapshotVersion은 **현재 revision이 여전히 같은지 확인하는 전제 조건**이다. 과거 revision을 찾아 반환하라는 요청이 아니다. driver는 최신 manifest를 반환하거나 최신 버전 불일치 때 실패해야 한다. 실제 제공자가 과거 조회만 지원하고 최신성/정정을 알 수 없으면 이 계약을 만족한 것으로 처리할 수 없다.

1. trusted context를 분리 복사하고 source profile/provider를 확인한다. 실제 profile·미구성 source는 읽기 전에 거부한다.
2. manifest의 문맥/기간/버전/지문을 확인한 후 그 안의 고정 pageId만 한 번씩 읽는다. 응답의 임의 URL/cursor를 따라가지 않는다.
3. 모든 페이지를 받은 뒤 manifest를 다시 읽어 동일 버전·지문인지 확인한다. 조회 중 버전 변경이나 같은 버전 내용 변경도 보류한다. 인증/진실성 없는 source가 거짓으로 같은 manifest를 반환하는 것은 이 검사로 발견할 수 없다.
4. 성공/실패/중단마다 close를 기다린다. 기본 읽기 제한은 10초, 내부 설정 최대 30초다. close는 신뢰한 driver가 자원을 종료하는 책임이며 이 제한이 close의 완료 시간을 강제하지 않는다.
5. 정리 후 새 시각으로 만료를 다시 검사한 뒤 snapshot을 반환한다. 모든 반환은 SYNTHETIC이고 liveSupported/collectionEnabled/proofVerified/paymentAllowed=false다.

| 상황 | 결과·재시도 |
| --- | --- |
| 완전하고 신선한 고정 증거 | COMPLETE_SYNTHETIC, 최소 snapshot + manifestHash/snapshotHash. 실제 학습 인증 완료 아님 |
| 누락/중복/충돌·지문/계정/정책/기간 오류 | ON_HOLD. 원천/신뢰 설정을 확인하고, 결측을 0으로 보정하지 않음 |
| 다른 snapshotVersion·같은 버전 정정 | ON_HOLD. 내부 resolver가 새 revision과 pin을 확인한 뒤 새로 조회·평가. 응답에서 자동 갱신하지 않음 |
| 만료·학습 기간 진행 중 | ON_HOLD. 기간 종료/새 관측 이후 새 pin으로 재시도 |
| source/네트워크 실패 | LEARNING_SOURCE_UNAVAILABLE, 상세 오류/부분 결과 없음. 동일 pin이 여전히 유효할 때만 새 요청으로 재시도 |
| 중단·읽기 시간 초과·정리 실패 | LEARNING_CANCELLED / LEARNING_TIMEOUT / LEARNING_CLEANUP_FAILED. 성공으로 바꾸지 않음 |

읽기에는 자동 재시도·메모리 캐시·영속 부작용이 없다. 같은 고정 정책/신뢰 context/증거/시각은 같은 최소 snapshot·hash를 만든다. 조회 직후의 정정까지 영구히 막는 보장은 없으며 후속 소비자는 사용 시점의 신선도·최신 버전·신청 상태를 다시 확인해야 한다. 지급 확정/권리 취소의 의미는 이번 계약에서 결정하지 않는다.

## 영속성·보존과 후속 완료 기준

이번 모듈은 디스크/DB를 쓰지 않는다. 원천 페이지·비밀을 보관하거나 메모리 완전 삭제를 보증하지 않는다. 합성 내부 반환은 policy/learner/snapshotVersion/observedAt/완전성 및 필수 강의의 ID·완료 여부·시각뿐이다. HTTP 응답으로 공개하지 않는다.

후속 영속 구현에는 본인 신청/계정 매핑과 인증된 source pin, 정책/필수 목록/완료 규칙 hash, adapter/evaluator 버전, 관측/만료 시각, 최소 학습 snapshot과 hash의 원자 고정·접근 제어가 필요하다. 재시작 후 버전/정정 확인, 보존 기한·삭제 시점, 동일/다른 결과 충돌, 사용 시점 재검증을 별도로 시험해야 한다. 원문 페이지·토큰·계정 비밀은 저장 대상이 아니다. 최종 지급 방식에 종속된 DB/서명 구조는 지금 고정하지 않는다.

실제 연결의 완료 조건은 위 제공자 계약·인증·계정 연결·완전성/정정 규칙, 안전한 수집/보존 경계와 제품 권한 검증을 확보하고 실제 새 입력으로 별도 검증하는 것이다. 실제 제공자 연결 조건이 확보되지 않았으므로 **현재 B3는 합성 adapter 단계만 완료**다. YBM의 실원천 전체성 차단도 그대로 남는다.

## 합성 재현

```sh
./tools/npm run test:learning-evidence
./tools/npm run test:policy
./tools/npm run test:product-proof
./tools/npm run verify:dependencies
./tools/npm run verify:workspace
```

공개 합성 예제 생성기는 [fixture.mjs](../../tests/learning-evidence/fixture.mjs)다. 가짜 provider/account와 2020년 기록을 만들고, 응답과 별도로 고정한 trusted pin을 준비한다. [contract 시험](../../tests/learning-evidence/contract.test.mjs)은 형식/문맥/기간/페이지/필수 목록/정정/80% 경계를, [adapter 시험](../../tests/learning-evidence/adapter.test.mjs)은 실패/중단/정리·버전 변경 및 B2b 최소 시험 snapshot과의 AND 평가를 검사한다. 실제 계정·API·원본 증명·기존 DB/체인은 사용하지 않는다.

2026-10-13 로컬 검증: 신규 70개와 기존 제품/정책 회귀 414개, 총 484개 통과(실패/skip 0). 의존성 및 원본/legacy 191개·공개 참고 문서 4개 보존 검사 통과. GitHub CI와 최신 병합 여부는 연결 PR을 확인한다.
