# 학습 provider 경계와 Moodle 최소 연결 명세

2026-10-13, [이슈 #24](https://github.com/gw020328-oss/clear-education-v4/issues/24), PR #23 병합 `7ee183d` 기준. 기존 [B3 계약](LEARNING_EVIDENCE.ko.md)의 driver → 증거 검사 → 최소 snapshot → 조건 평가 경계를 재사용한다. 추가 코드는 [합성 시드 provider](../../src/learning-evidence/seed-provider.mjs) 하나이며 범용 provider 프레임워크나 Moodle HTTP client를 만들지 않는다.

**현재 구현은 SYNTHETIC이다.** 실제 Moodle 설치/운영/endpoint·토큰·계정 매핑은 없으며, 실제 학습/YBM 원천 검증은 BLOCKED다. grant/outbox·CLEAR 추가 지급 승인 서명 및 종속 확대는 보류한다. 별도 독립 청구·Windows 검증과 서준형 담당 UI는 변경하지 않는다. 기존 800점 AND 시드 이수율 80%/전체 시험 최고점 정책을 유지한다.

## 재사용하는 구조와 작은 추가 경계

```text
합성 source.readSnapshot(고정 요청, signal)
  → createSyntheticSeedProvider / projectSyntheticSeedLearning
  → 기존 collectSyntheticLearningEvidence (두 번 조회·pin·기간·정리 검사)
  → 기존 최소 learning snapshot
  → 기존 evaluateSyntheticEligibility (시험 점수 AND 활동 이수율)
```

`createSyntheticSeedProvider(compiled, binding, source)`는 기존 B3의 `{profile, providerId, readManifest, readPage, close}`를 구현한다. source는 `{profile: 'synthetic-seed-activities.1', providerId, readSnapshot, close}`다. 원천 취득 코드는 readSnapshot 내부에만 있으며 평가기에 URL/인증/원천 필드를 넘기지 않는다. provider는 한 번 수집 후 닫고 다음 시도에는 새로 만든다. close가 실제 자원을 끝내야 한다는 기존 계약을 유지한다.

`projectSyntheticSeedLearning(compiled, binding, input)`은 순수 형식·의미 매핑으로 기존 `{manifest,pages}`를 만든다. 성공 판정 함수가 아니므로 이 반환만으로 평가·지급하지 않는다. 별도로 고정한 trusted pin을 가진 기존 B3 검사와 서버 시계의 freshness 검사를 반드시 거친다. 기존 B3 driver와 반환 snapshot 형식, 정책 compiler/evaluator, HTTP/DB/UI 계약은 바꾸지 않는다.

## 내부 binding: 응답과 독립적으로 고정

| 필드 | 의미 |
| --- | --- |
| `dataMode` | SYNTHETIC만 허용 |
| `institutionId`, `providerId`, `courseId` | 기관, 원천 인스턴스, 강좌의 별개 식별자. 이름/URL의 유사성으로 같은 원천으로 취급하지 않음 |
| `applicationId`, `learnerId`, `subjectRef` | 인증된 신청·내부 학습자·원천 계정 연결. 앱/학습자는 source 응답에서 가져오지 않음 |
| `policyHash` | 기존 컴파일 정책 고정. 원천 응답으로 임계값/기간을 바꾸지 않음 |
| `activitySetVersion`, `activities` | 승인된 필수 활동 버전과 `{activityId,lectureId}` 일대일 매핑. 모든 기존 필수 lectureId가 정확히 한 번 있어야 함 |
| `sourceRevision` | 별도로 확인한 현재 원천 revision. 응답이 새 버전을 주장해도 자동 채택하지 않음 |
| `completionMappingVersion` | `seed-automatic-completion.1`만 허용. 실제 원천의 수동 완료/override/모듈별 규칙 수용은 별도 검토 사항 |

일반 식별자는 NFC 1~64자이며 applicationId/subjectRef/policyHash는 기존 32바이트 hex다. activities는 1~10000개다. 비어 있거나 중복·미지·누락된 매핑은 취득 전에 거부한다. 기관/계정 연결과 필수 활동 설정이 실제로 승인됐는지를 이 모듈 자체가 인증하지는 않는다. 합성 fixture가 내부 resolver를 대신하며 실제 resolver는 후속이다.

## 합성 source snapshot: Moodle 응답 형식이 아님

| 필드 | 의미 |
| --- | --- |
| `profile`, `dataMode` | `synthetic-seed-activities.1`, `SYNTHETIC` |
| `institutionId`, `providerId`, `courseId`, `subjectRef` | binding과 정확히 일치해야 하는 취득 범위 |
| `activitySetVersion`, `sourceRevision` | 현재 고정 버전과 일치해야 함 |
| `learningStart`, `learningEnd` | 정책 인정 기간과 정확히 일치하는 epoch seconds 문자열 |
| `coverageStart`, `coverageEnd` | 위 기간 전체를 포함한다는 합성 원천 선언. 실제 보장은 아직 없음 |
| `observedAt`, `validUntil` | 원천 관측과 유효 상한. 기존 B3가 기간 종료·최대 300초·서버 시각으로 검사 |
| `completeness` | COMPLETE만 수용. PARTIAL/UNKNOWN·누락은 보류 |
| `correctionState` | UNCHANGED만 수용. CORRECTED/UNKNOWN은 보류, 새로 검토한 revision/pin 필요 |
| `records` | 필수 활동만 포함하는 projection. `{activityId,state,tracking,overridden,completedAt,stateChangedAt}` |

readSnapshot 요청은 기관/원천/강좌/subject, activitySetVersion/sourceRevision, activities, 정책 학습 기간이다. 원천은 **현재 상태**를 반환해야 하며 요청한 과거 revision으로 조용히 되돌아가면 안 된다. 페이지네이션·API 오류·부분 성공 처리는 취득 driver의 책임이다. 불완전한 응답을 `COMPLETE`로 포장하지 않는다.

합성 매핑은 `tracking=AUTOMATIC`, `overridden=false`가 명시된 행에서 INCOMPLETE→false, COMPLETE/PASS→true만 처리한다. MANUAL/NONE/미상 tracking, override true/null/누락, FAIL/UNKNOWN 상태는 의미 미확인으로 보류한다. 이 규칙은 환급 자격을 새로 정의하거나 Moodle 전체 상태를 승인하는 규칙이 아니다. 합성 자동 완료에도 동영상 재생 시간이나 출석을 추정하지 않는다.

완료 true에는 확인된 `completedAt`이 필요하다. `stateChangedAt`은 선택적으로 알려진 최근 상태 수정 시각이며 null일 수 있다. 상태 수정/관측 시각으로 완료 시각을 메우지 않는다. 완료 false는 completedAt=null이다. 미래 시각·완료보다 이른 수정 시각은 거부한다. 기간 밖의 완료 사실은 정규화 후 보존하지만 기존 평가기가 분자에서 제외한다. **활동 완료율은 동영상 시청률·실제 출석률이 아니며 completion=true 하나로 환급 조건 전체를 충족하지 않는다.**

정규화 후에도 evaluator의 행은 기존 `{lectureId,completed,completedAt}`뿐이다. 생략된 기관/강좌/매핑/수정 시각까지 evidence에 묶기 위해 정렬된 binding과 전체 source snapshot의 hash를 64자리 snapshotVersion으로 사용한다. 이는 CLEAR 내부 합성 artifact 식별자이며 Moodle revision·서명·진실성 증거가 아니다. 별도 trusted snapshotVersion/manifestHash와 대조한다. 동일 revision을 주장하며 내용을 수정해도 기존 pin으로 통과할 수 없다.

## 실패·보류 의미

- binding/정책 오류는 factory 호출 오류로 취득 전에 거부한다. 순수 projection은 고정 RuleError로 거부한다. 수집 중 driver/매핑 실패는 기존 B3의 `LEARNING_SOURCE_UNAVAILABLE`로 일반화되어 원문/부분 snapshot을 반환하지 않는다.
- 누락·중복·추가 활동, 강좌/기관/계정/기간 불일치, 필수 목록 변경, 완료 시각/의미 미확인은 보류다. 결측을 false로 만들거나 분모를 줄이지 않는다.
- 기존 B3가 첫/마지막 manifest의 version·hash를 비교한다. 새 pin을 응답에서 자동 생성/갱신하지 않는다. CORRECTED를 UNCHANGED로 단순 변경해 통과시키지 말고 원천 정정의 내용·현재 revision·계정/정책 연결을 별도 재검토해야 한다.
- 취득 실패·지연·중단은 기존 timeout/abort/close 처리로 보류하며 자동 재시도하지 않는다. 닫힌 provider에는 늦은 응답을 보관하지 않는다. 사용 시점 재검증과 영속 정정 이력은 여전히 후속이다.
- 새 결과의 liveSupported/collectionEnabled/proofVerified/paymentAllowed는 모두 false다. CLEAR는 학원이 제공하는 기록의 진실성, 학습자 실명/실제 행동까지 보장하지 않는다.

## Moodle 공식 근거와 추가 확인 사항

확인일 2026-10-13. 예시 기준은 공식 `MOODLE_405_STABLE`의 commit `215f44380bdc3ccf852a3a22e34f8423ff64033a`다. 실제 기관 설치 버전으로 선택/검증한 것이 아니다. 설치 버전·플러그인·사용자별 API 문서는 연결 시 별도로 확인한다.

| 항목 | 공식 근거 / 연결 때 남는 확인 |
| --- | --- |
| 활동 완료 조회 | `core_completion_get_activities_completion_status(courseid,userid)`는 statuses/warnings를 반환하며 cmid·state·tracking 등의 필드를 정의한다. state 0/1/2/3은 미완료/완료/통과 완료/실패 완료, tracking 0/1/2는 비활성/수동/자동이다. 실제 설치의 optional 필드 지원·권한은 확인 필요. [공식 completion API 구현](https://github.com/moodle/moodle/blob/215f44380bdc3ccf852a3a22e34f8423ff64033a/completion/classes/external.php) |
| 전체 활동·가시성 | completion 조회는 보이지 않는 활동을 제외한다. course contents도 가시성/필터에 영향받는다. 배열 길이·warnings 없음만으로 전체성 증명을 만들지 않는다. 승인된 필수 cmid 목록과 조회 권한·숨김/삭제/추적 비활성 활동을 대조해야 한다. [공식 course API 구현](https://github.com/moodle/moodle/blob/215f44380bdc3ccf852a3a22e34f8423ff64033a/course/externallib.php) |
| 시각·override | exporter의 timecompleted는 get_timemodified()에서 온다. overrideby와 isautomatic 등도 반환한다. 원래 학습 행위 시각으로 바로 대입할 수 없다는 것이 이 설계의 판단이다. 의미를 검증하기 전에는 stateChangedAt 후보로만 두며 completedAt은 미확인이다. 0·누락도 기간 내 완료로 보정하지 않는다. [공식 exporter](https://github.com/moodle/moodle/blob/215f44380bdc3ccf852a3a22e34f8423ff64033a/completion/classes/external/completion_info_exporter.php) |
| 완료의 의미 | 수동 체크, 페이지 보기, 성적, 모듈별 규칙 등이 가능하다. 단순 자동 완료도 시청률/출석률 보장이 아니다. 해당 강좌의 규칙과 교사 override 인정 여부를 원천별 versioned mapping으로 승인해야 한다. [공식 activity completion 설명](https://moodledev.io/docs/5.0/apis/core/activitycompletion) |
| 기관·신청·revision·보장 | 위 조회의 명세는 CLEAR 신청/지갑 연결, institutionId, 서명된 전체 manifest, 승인된 필수 활동 버전, 기간 전체 이력·정정 revision을 보장하지 않는다. 요청 문맥·기관 등록·계정 연결·version resolver와 추가 근거가 필요하며 현재 미확인이다. 이는 해당 API 조사 범위의 판단이지 모든 Moodle 확장 기능의 부재 주장과 다르다. |

토큰은 선택된 사용자·service·함수/권한에 연결되고, 관리자 화면의 API 문서에서 가용 기능을 확인해야 한다. [공식 web service 안내](https://docs.moodle.org/405/en/Using_web_services). 향후 연결은 백엔드 전용 HTTPS driver에서 고정 origin/허용 읽기 함수만 호출하도록 설계한다. 토큰은 서버 비밀 주입 경계에만 두며 클라이언트 번들·URL 로그·Git·fixture·예외/수집 로그·평가 DTO에 넣지 않는다. 실제 secret 저장소·권한 정책과 인증된 응답 신뢰 근거는 아직 구현하지 않았다.

## 향후 Moodle adapter 착수에 필요한 최소 합의

1. 기관의 정확한 Moodle 인스턴스/버전/플러그인, 허용 endpoint·읽기 함수, 최소 권한 service 사용자와 운영 담당. 실주소/토큰은 공개 문서 대신 승인된 비밀 설정 경계로 제공한다.
2. 인증된 CLEAR 신청/learner ↔ 그 기관 userid의 검증된 매핑, courseid와 필수 cmid ↔ lectureId의 고정 목록·버전. 원천 숫자 ID는 인스턴스 범위로 구분하고 다른 사이트와 충돌시키지 않는다.
3. 완료 state/tracking/override와 활동별 규칙의 승인된 매핑. 완료 시각 근거가 없으면 시간 조건을 충족했다고 만들지 않는다. 학습 정책 변경이 필요하다면 별도 결정으로 처리한다.
4. 숨김/미조회/삭제·추적 비활성/필수 목록 변경을 탐지할 전체성 근거와 current revision·정정 확인 방법. 단순 두 번 같은 응답을 읽은 것으로 인증된 원자 snapshot/미래 불변성을 보장하지 않는다.
5. 서버 관측 시각, 기간 포괄성, timeout·상한·부분 실패/warnings 처리·사용 시점 재검증·최소 보존/삭제 경계. 실패 시 기존 ON_HOLD가 유지되어야 한다.

이 합의가 없으면 실제 adapter를 켜거나 합성 profile로 실제 응답을 포장하지 않는다. 준비되면 Moodle 취득/정규화 부분과 원천 검증 경계를 별도 구현하고, 기존 evaluator 입력을 유지할 수 있는지 검증한다. 현재 evaluator 자체도 synthetic-only이므로 이 PR만으로 live 평가가 활성화되지는 않는다.

## 재현

`./tools/npm run test:learning-evidence`에 기존 B3 및 새 [provider 시험](../../tests/learning-evidence/seed-provider.test.mjs)이 포함된다. [합성 fixture](../../tests/learning-evidence/seed-fixture.mjs)는 가짜 기관·강좌·활동과 독립 test pin을 만든다. 필수 목록/문맥/기간/완료 의미, 중복·분모0·정정·timeout·중단·늦은 응답·정리 후 만료, 기존 평가기 AND 경계를 검사한다. 실제 Moodle 서버/계정/토큰·기존 DB·체인을 사용하지 않는다.

로컬 검증: 신규 61개, 학습 증거 전체 131개 통과. application/policy/proof-sessions/product-proof/exam-evidence/learning-evidence/vault/dev 회귀 총 **585개 통과**, 실패/skip 0개(131개 포함, 합산하지 않음). `verify:workspace`, `verify:dependencies`, 변경 문서의 로컬 링크 91개와 diff 검사도 통과했다. 정확한 head의 공개 이력 검사·GitHub CI·병합 상태는 연결 PR을 따른다.
