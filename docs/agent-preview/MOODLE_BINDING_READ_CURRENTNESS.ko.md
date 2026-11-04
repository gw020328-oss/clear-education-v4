# B 서버 owner 전용 binding 현재성 조회

2026-11-04. 기준 이력 `145720325711cba3243d8b41cd698f5dcce5dba4` 위의 별도 읽기 포트다. 기존 `bindingStatus`, start/preview/complete/readPreview 및 clock-floor 갱신·소비 경로는 유지한다. 공개 HTTP와 A/C 구현은 추가하지 않는다. 실제 기관 권한·외부 durable epoch·신뢰 시각 공급자는 여전히 미구현이며, 이 포트와 검증 fixture는 `SYNTHETIC_ONLY`다.

## 서버 내부 계약

`src/agent-preview/moodle-binding/coordinator.mjs`에서 직접 `createBindingCurrentnessReader`를 import한다. 기존 coordinator와 동일한 owner 발급 `projection`, 세 DB `paths`, `control`, `timePolicy`, `clock`, `sessionKey`에 **필수 `trustedTime`**을 추가한다. 원천 `verifier`는 필요 없고 호출하지 않는다. 단순 standalone fixture projection이나 임의 객체 대신 등록된 학생 product projection만 허용한다.

반환 객체는 `mode`, `readStudent(privateClearContext, expectedBinding)`, `close()`만 제공한다. 모든 메서드는 동기식이다. `privateClearContext`는 owner가 별도로 인증한 `{token,wallet,chainId,csrf}`이며 브라우저 본문/URL에서 그대로 받아 사용하지 않는다. `expectedBinding`은 서버 소유 명시 mapping에서 얻은 정확한 `{applicationId,bindingRef,bindingRevision}`다. B application ID는 학생 신청의 `0x` + 64자리 hex이며 bootcamp slug와 다르다.

성공 DTO `clear-moodle-binding-currentness.1`의 정확한 필드:

```js
{
  version: 'clear-moodle-binding-currentness.1',
  applicationId, bindingRef, bindingRevision,
  scope: { installationRef, courseRef, subjectRef },
  currentness: 'LOCAL_BINDING_CURRENT',
  checkedAt, expiresAtExclusive
}
```

scope는 B가 검증한 opaque 원천 refs이며 A/C의 명시 mapping과 비교하기 위한 서버 내부 정보다. 토큰·지갑·세션 HMAC·증명·원천 사실·confirmation은 반환하지 않는다. `checkedAt`은 로컬 권한 snapshot 시작 검증 시각(UTC 초), expiry는 binding/CLEAR session/B policy의 최소 배타 만료다. 만료가 미래라는 이유로 권한을 캐시하거나 지급 권한으로 해석하면 안 된다. `LOCAL_BINDING_CURRENT`는 B의 로컬 연결 기록만 뜻하며 Moodle 세션·등록·역할·원천 관측의 현재성을 증명하지 않는다.

학생의 동일 CLEAR 세션 HMAC, 미폐기/미만료 세션, CSRF·지갑·체인, 현재 auth authority revision, 현행 신청·ack·정책·mapping을 기존 principal/binding 술어로 검사한다. 추가로 정확한 binding ref/revision, consumed attempt와 binding 연결, 현재 generation, 설치/강좌/subject 범위를 확인한다. 같은 학생의 다른 활성 세션도 기존 binding을 대여할 수 없다. 교사 조회 메서드는 없다. 교사 독립 B 권한 포트가 구현될 때까지 unavailable이며 학생 세션 대여로 우회하지 않는다.

## 무쓰기와 시간·복구 경계

- 생성부터 main은 SQLite `readOnly`, auth/workflow는 `mode=ro` attachment로 연다. `query_only`와 읽기 전용 SQL authorizer를 추가하고 기존 허용 column/schema/journal/파일 소유권·inode 검사를 재사용한다. 읽기 연결 생성·조회·종료 모두 floor UPDATE, audit/request 생성, 상태 소비, cleanup, source query, review heartbeat가 없다. 읽기에 필요한 잠금과 메모리 watermark는 사용한다. OS의 읽기 access-time까지 불변이라는 보장은 아니다.
- `BEGIN` 읽기 트랜잭션의 세 DB shared lock으로 환경·권한 snapshot을 반환 직전 COMMIT까지 유지한다. 쓰기 슬롯을 선점하지 않으며 pending writer/잠금 오류는 실패한다. 소유자의 폐기가 조회 종료 후 commit되면 다음 read가 거부한다. 다른 서비스와 함께 원자적으로 권한을 잠그는 기능은 아니다.
- `trustedTime()`은 동기·읽기 전용이며 정확한 `{issuerEpoch,wall}`을 반환한다. wall은 UTC 정수 초, epoch는 현재 B 정책의 issuer epoch다. **owner는 프로세스/DB 복구에도 역행하지 않는 독립 신뢰 시각과 복구 epoch를 보장해야 한다.** 같은 `Date.now()`를 두 번 읽거나 DB floor/이전 DTO를 되돌려주는 구현은 이 계약을 충족하지 않는다. 공급자 부재·실패·비동기 응답·구 epoch는 차단한다. 실제 공급자를 새로 구현하거나 승인한 작업이 아니다.
- 시작/최종 시각은 저장된 floor 이상이어야 하고 두 시각의 차이는 승인된 maxClockSkewSeconds 이하여야 한다. 권한/만료에는 두 시각 중 큰 값을 쓴다. 메모리 watermark로 연속 호출 간 wall/trusted/monotonic 역행과 monotonic 경과 대비 급변·정지를 거부한다. 시계 검증 실패는 해당 reader에서 latch되어 재사용할 수 없다. 원인과 epoch를 owner가 검증한 뒤 새 reader를 구성해야 한다.
- 최종 fence에서 시간 제한·최소 expiry와 control ACTIVE/boot policy hash·파일 동일성을 다시 확인한다. 복구 DRAINING, 새 issuer/config/authority/roster/trust epoch와 DB-only 정책 변경은 기존 방식으로 거부한다. floor는 조회로 올리지 않는다. **reader 재시작 시 사라진 메모리 watermark를 DB에서 복원할 수 없으므로, 저장 floor보다 높은 구간의 역행 방어는 위 독립 trustedTime/외부 복구 epoch 계약에 의존한다.** 둘을 함께 과거로 되돌리는 신뢰 owner의 오류를 이 라이브러리만으로 검출할 수 없다. 실제 공급자·복구 감독자가 없으면 실제 resolver는 unavailable로 유지한다.

## A/C owner resolver 조립 계약

1. C owner는 매번 실제 Moodle 로그인·actor·강좌·대상 학생·등록·역할을 검증한다. A는 독립 CLEAR/bootcamp 읽기 권한을 검증한다. URL course/user/application ID는 권한 근거가 아니다.
2. 서버의 명시 mapping revision으로 Moodle 설치/강좌/subject, B 신청/ref/revision, bootcamp slug/participant/operator/policy/runtime을 연결한다. 이 포트의 세 scope refs와 B 식별자가 mapping과 모두 일치해야 한다. 이 포트가 mapping이나 CLEAR 세션을 생성·복구하지 않는다.
3. resolver에서 B readStudent를 호출하고, C/A/B/mapping의 배타 만료 중 최솟값을 사용한다. 모든 owner가 현재 폐기·기한을 직접 검사해야 하며 변하지 않은 refs만 비교하는 것으로 충분하지 않다.
4. source/evidence read 또는 다른 await 뒤에는 최종 반환 직전에 C/A/B와 mapping revision/actor/expiry를 **다시 조회·검사**한다. 첫 조회 결과나 expiry만 재사용하지 않는다. 기존 course-evidence reader의 최종 owner 재인가 계약을 유지한다.
5. polling/resolver에서 `/bootcamp/v4/session`, `live-context.getSession`, review `observe`, 쓰기성 `getApplication/getOperationsProjection/getProcedure`, 기존 `bindingStatus`를 호출하지 않는다. 실제 A/C 전용 읽기 owner 조립은 별도 작업과 D 독립 검토 후 진행한다.

## 검증

`tests/agent-preview/binding-read-currentness.test.mjs`는 실제 학생 auth/workflow SQLite와 합성 binding으로 생성·정상/거부 조회·close/reopen 전후 세 DB SHA-256/mtime 및 디렉터리 파일 목록 불변을 검사한다. 다른 주체·동일 지갑의 다른 세션·logout·authority ABA·신청/정책/ack/mapping/generation 변경·만료 최소값/최종 경계·floor/신뢰 시각/monotonic 역행·복구 epoch/최종 drain·schema drift를 검사한다. 현재 시각 조회는 fixture이며 실제 기관 신뢰 시각 검증 완료가 아니다. 기존 module/currentness/student 회귀와 함께 고정 Node 24.21.0, 네트워크 차단으로 실행한다.

결과: 집중 검사 28/28, 기존 module/currentness/student 회귀 68/68 통과. 집중 27건+기존 68건을 먼저 함께 실행한 뒤, 최종 snapshot에서 세 DB의 다른 연결 `BEGIN EXCLUSIVE`가 모두 차단되고 종료 후 logout이 반영되는 검사를 추가하여 집중 28건을 다시 실행했다. 원래 소비 경로의 source 쓰기/경합/복구 시험도 유지했다. 실제 로그인·기관 수집·유료 모델·서명·지급·배포는 실행하지 않았다.
