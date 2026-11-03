# 운영효과 DTO 인계

기준 develop `e7f77ed`. 순수 모듈의 공개 진입점은 [index.mjs](../../src/operational-metrics/index.mjs)다. `summarizeOperationalMetrics(input)`은 `clear-operational-metrics-input.1`을 받아 `clear-operational-metrics-summary.1`을 반환한다. 서버 연결 전에는 [합성 fixture](../../examples/operational-metrics/fixture.mjs)로 렌더링을 확인할 수 있다. 실행 가능한 DTO 전체 예시는 `tools/node examples/operational-metrics/demo.mjs`로 출력한다.

입력은 `{version, scope, coverage, events}`다. 한 묶음은 단일 신청·실행·시계 epoch·접근 범위에 해당한다. `scope` 필드는 `applicationRef, runId, epochRef, accessScopeRef, mode, source`다. 출처 조합은 `SYNTHETIC/FIXTURE`, `MEASURED/VERIFIED_SERVER_EXPORT`, `MEASURED/OBSERVED_REVIEW`다. 호출자는 서버에서 이미 권한이 확인된 scope와 검증된 출처만 전달한다. 함수의 검사는 구조와 일관성에 한정된다. 모드와 출처 선언 자체에는 권한이나 실측을 증명하는 효력이 없다.

각 이벤트는 `{id, scope, kind, startMs, endMs}`와 다음 종류별 필드를 가진다. 시각은 같은 단조 시계 기준의 정수 밀리초다. 입력 순서는 기록 종료 시각의 오름차순이며 동시 종료는 허용한다.

| kind | 추가 필드 |
| --- | --- |
| VERIFIED | `conditionRef, automation` |
| ATTEMPT | `operationRef, attempt, outcome, automation, conditionRef`. 시도는 1부터 시작하고 결과는 `FAILED` 또는 `SUCCEEDED`. 도구 호출에 조건 연결이 없으면 `conditionRef: null` |
| MANDATORY | `actionRef, workKind`의 `LOGIN`, `SIGNATURE`, `PAYMENT_CONSENT` |
| EXCEPTION | `actionRef` |
| HUMAN | `personRef, workKind`. 작업 종류는 `REVIEW`, `LOGIN`, `SIGNATURE`, `PAYMENT_CONSENT`, `EXCEPTION` |
| WAIT, CASE | 없음. `CASE`는 명시적으로 완료된 전체 관찰 창 1개 |

동일 이벤트 ID, 조건 중복, 행동 중복, 역행, 범위 혼합, 같은 작업의 성공 이후 시도를 거부한다. 입력 오류는 고정 오류 코드로 처리한다. 화면에는 미제공으로 표시하고 내부 오류나 원시 이벤트를 노출하지 않는다.

| DTO 필드 | 화면 의미 |
| --- | --- |
| `scope.type, scope.mode, scope.source, coverage` | 단일 신청·실행의 범위, 출처, 관찰 완전성. 합성은 항상 눈에 띄게 표시 |
| `verification.applicationsWithVerifiedConditions` | 검증 완료 조건이 하나 이상 기록된 신청 수. 값은 0 또는 1이며 전체 조건 완료나 자격 판정의 의미는 없다 |
| `verification.verifiedConditions, automatedVerifiedConditions, conditions[]` | 중복 제거한 확인 조건 수와 그중 자동 확인된 조건 수. 항목은 `{conditionRef, automated}` |
| `operations.logical, attempts, retries, failedAttempts, automatedCompleted` | 관찰된 작업, 시도, 첫 시도 이후 시도, 실패 시도, 성공한 자동 논리 작업을 별도 표시 |
| `interventions.mandatory, exceptions` | 의무 확인과 예외 개입 수 |
| `time.overallElapsedMs` | 완료 창 전체 경과 시간 |
| `time.recordedVerificationWallMs, recordedWaitingWallMs` | 종류별로 실제 기록된 시간 구간의 합집합 길이 |
| `time.recordedPersonMs` | 사람별 작업 구간 합집합의 합. 단위는 사람·밀리초 |

`coverage`의 `verification, attempts, mandatory, exceptions, human`은 해당 범위의 완전성을 출처 측에서 확인했을 때만 true다. `caseCompletion`은 완료 창 유무다. null은 측정 전 또는 미제공으로 렌더링한다. 부분 관찰의 수치는 ‘기록된 이벤트 기준’으로 표시한다. 관찰된 시도가 있어도 coverage가 false면 실패 시도 0은 관찰 범위에서만 유효하다. 기관 전체·기수 전체 수치나 추정 비율로 확대하지 않는다.

## 백엔드 연결 인계

현재 `src/bootcamp/r2-ledger.mjs`는 저장 시 clock epoch를 별도로 보유하지만 외부 이벤트에는 포함하지 않는다. 기존 `metric-events` 조회 및 집계는 기존 계약 그대로 사용할 수 있다. 새 DTO를 연결하려면 담당 백엔드에서 다음 입력을 제공해야 한다.

1. 기존 세션·신청 인가를 적용한 읽기 경로에서 신청·실행·epoch·접근 범위·검증 출처를 고정한다. 서버 계측 관찰 종료 순서를 확인한다.
2. 조건의 고정 식별자와 실제 자동 여부를 제공한다. 의무 확인과 예외에 서로 구별되는 행동 식별자를 준다.
3. 논리 작업 ID와 개별 시도 번호 및 실제 종료 결과를 각각 보존한다. 기존 중복 방지 키가 실패와 성공 사이의 개별 시도를 복원해 주지는 않는다.
4. 이벤트 종류별 관찰 완전성과 명시적인 사례 완료 창을 확보한다. 현재 자료에 없는 필드는 미제공으로 표시한다.

조회용 새 HTTP URL은 이 작업에서 정의하지 않았다. 서버 계측과 사람 관찰을 한 입력에 합치지 않는다. 원문, 사용자 이름, 쿠키, proof, 서명, 지갑을 전달하지 않는다. 공개 자료에는 공개용 불투명 참조만 사용한다.

## 공개 사례 비교

`recordReview({scope, personRef, workKind, marks})`는 `{complete, intervals}`를 반환한다. 각 관찰자가 한 작업 흐름에 한 번 호출한다. `marks` 예시는 START 0 → PAUSE 100 → RESUME 200 → END 550이며 결과는 0–100과 200–550의 실제 활동 구간이다. PAUSE 상태에서도 END로 종료할 수 있다. 미종료 기록은 `complete: false`다. 여러 사람이 같은 run을 기록할 때는 공통 시계와 사람별 임시 식별자를 쓴다. 사례 완료 창과 모든 기록 종료 여부는 관찰 책임자가 확인한다. 자동·AI 대기 중 실제로 다른 검토 작업을 했다면 그 활동 자체를 기록한다.

`compareReviewWork({baseline, assisted})`는 `clear-review-work-comparison.1`을 반환한다. 각 arm은 `{method, caseRef, policyRef, evidenceRef, completionScopeRef, qualityRubricRef, qualityPassed, input}`이다. 같은 승인 범위의 동일 사례를 별도 run으로 수행하며 방식은 `MANUAL`과 `CLEAR_ASSISTED`다. 고정된 정책·증거·완료 범위·검토 기준과 양쪽 품질 통과를 확인한다. 완전한 사람 관찰이 있고 기준 시간이 양수일 때 `(baselinePersonMs - assistedPersonMs) / baselinePersonMs * 100`을 계산한다. 음수는 작업 증가로 표시할 수 있다. `reason`이 있거나 `mode`가 실측과 다르면 운영 실측 절감률을 표시할 수 없다.

AI 시연 8개 중 정상, 부족, 애매함에 해당하는 공개 사례 3개를 공통으로 선택한다. 아래 빈 기록표에 AI 사례 참조를 매핑하고 팀원 또는 사용자 참여로 두 방식의 시간을 수집한다. 합성 CLI의 기록은 화면·계산 확인용이다.

| 공통 사례 | AI 사례 참조 | 수작업 관찰 기록 | CLEAR 보조 관찰 기록 | 동일 기준 품질 확인 |
| --- | --- | --- | --- | --- |
| 정상 | 미정 | 미측정 | 미측정 | 미확인 |
| 부족 | 미정 | 미측정 | 미측정 | 미확인 |
| 애매함 | 미정 | 미측정 | 미측정 | 미확인 |
