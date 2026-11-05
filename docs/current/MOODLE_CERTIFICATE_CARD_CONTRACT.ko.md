# Moodle 인증서 카드의 명시 시작과 서명 후 창 열기

2026-11-05 A 서버 후보. 기존 C 0.1.22 (`4fe337e`)에는 인증서 카드 콜백이 연결되지 않았다. 이 문서는 A 구현 계약이며 실제 Moodle 카드·HackerRank 창의 사용자 시험 완료를 뜻하지 않는다.

## 고정 포트

공용 `bind-source-session`은 신청 결합만 한다. 세션·신청·서명 조회는 인증서 수집이나 창 열기를 시작하지 않는다. Native 실행의 원천 순서가 `SOURCE_python-basic-certificate`에 도달하면 서버는 명시 시작을 기다린다. 이때까지 인증서 request와 서명 요청을 발급하지 않는다.

| 카드 동작 | runWorkflow 입력 | 서버 동작 |
| --- | --- | --- |
| start | `{action:'start-certificate', applicationId, expectedRevision, idempotencyKey}` | POST `/bootcamp/v4/applications/:applicationId/certificate-start`, 본문 `{expectedRevision}`. 명시 클릭으로만 호출한다. |
| read | `{action:'read-source-signature', applicationId}` | 기존 GET. 준비된 원본 DTO 조회만 한다. |
| sign | `{action:'approve-source-signature', reviewed}` | 방금 읽고 표시한 DTO를 그대로 전달한다. 기존 지갑 서명·정확한 요청 대조·서버 접수를 재사용한다. |

start의 정상 응답은 `{version:'clear-certificate-start-receipt.1', applicationId, criterionId:'python-basic-certificate', status:'START_ACCEPTED', paymentAuthorization:false}`다. 이 응답은 서명 준비·검증 성공·지급 동의를 뜻하지 않는다. 같은 명령 재전송은 기존 Moodle 명령 중복 차단을 유지한다. 새 키로 두 번째 수집을 시작할 수도 없다. 응답이 유실되면 자동 재전송 대신 세션을 조회한다.

## 카드 준비 상태

인증된 참가자 세션 GET은 같은 신청에 아래 `certificate`를 추가한다. 비-native·활동 전용 실행, 운영자, 미결합 신청에는 제공하지 않는다.

```json
{
  "phase": "SOURCE_python-basic-certificate",
  "certificate": {
    "version": "clear-certificate-start.1",
    "applicationId": "application-example",
    "criterionId": "python-basic-certificate",
    "state": "READY_TO_START",
    "startAllowed": true,
    "signatureReady": false
  }
}
```

`state`는 `NOT_READY`, `READY_TO_START`, `START_ACCEPTED`, `AWAITING_SIGNATURE`, `SIGNATURE_ACCEPTED`, `VERIFIED`, `UNAVAILABLE` 중 하나다. `startAllowed`는 정확한 단계와 READY_TO_START에서만 true, `signatureReady`는 정확한 단계와 AWAITING_SIGNATURE에서만 true다. C는 버전·신청·조건·단계를 일치시키고 이 준비 상태에 따라 버튼을 연다. phase 단독·바인딩 성공·재진입·조회만으로 준비를 추정하지 않는다. VERIFIED는 인증서 수집이 저장소 검증을 마쳤다는 상태이며 최종 자격·지급은 기존 evidence 판정으로 확인한다.

## 서버 경계

- 시작 시 기존 Moodle 명령 승인/실행, 참가자·신청 결합, ACTIVE 상태와 revision을 확인한다. 시작 승인 한 건의 원래 intent·identity·context·만료·CONSUMED 상태를 source authority로 유지한다. 5초 전송 grant를 연장하지 않는다.
- 시작 수락 뒤 request를 발급하며, 서명 대기와 접수 후 및 원천 호출/증빙 반영 전후에도 같은 authority를 확인한다. authority callback은 SQLite projection을 다시 읽지 않는다.
- Native 관리형 소스의 준비에서는 브라우저를 열거나 navigate하지 않는다. 서버의 원본 요청에 대한 참가자 서명을 접수하고, 서명·요청·유효기간·현재 권한을 다시 검증한 뒤 브라우저를 한 번 열어 HackerRank로 이동한다. 이후 로그인 준비 신호를 기다린다.
- 잘못된 서명, 서명 거절, 만료, 취소, 원래 intent 종료, 참가자 변경은 창을 열지 못한다. 이미 열린 창의 원천 수집 역시 권한 상실 시 차단한다. 기존 관리형 정리와 legacy 비-deferred 실행 순서는 유지한다.

## 검증 및 후속

대역 브라우저/원천·합성 지갑·HTTPS·실제 명령 예약과 저장소 회귀를 사용했다. readiness 권한 재검사와 HTTPS 시작 경로/만료 검사를 포함한 최종 관련 151개 시험이 모두 통과했다. 최종 로그는 `/tmp/clear-certificate-regression-final.log`이며 `git diff --check`도 통과했다. 실제 사용자 서명·HackerRank 창·새 증빙·AI 호출·지급은 이번 검증에서 실행하지 않았다. RE2 네이티브 모듈 부재 경고는 기존 RegExp fallback이며 시험 실패는 없었다.

C 후속은 카드의 세 콜백과 준비 상태를 이 계약에 연결하는 최소 수정이다. 기존 실행 DB/체인/브라우저를 변경하지 않고, 새 조립 후보에서 사용자 직접 start·메시지 검토·서명 → 관리형 창 열기를 확인한다. C 후보 준비 전에는 사용자에게 서명을 요청하지 않는다.

모델 추천은 서명·비동기 권한 수명 경계 때문에 GPT-6 Astra / High다. 실제 구현은 기존 GPT-6.1 Sol 세션이며, 현재 턴의 모델을 바꾸는 도구는 제공되지 않았다.

## 실제 창 확인용 한정 실행

`certificateCardOnly:true`는 SELF_ATTESTOR_TEST와 고정 Moodle native owner에 한정된 별도 로컬 실행 모드다. activityReturnOnly와 함께 사용할 수 없다. 참가자 신청 결합 후 인증서 조건의 명시 시작을 기다리고, 다른 Moodle 조건·회고 준비·AI 승인/호출·수령인 등록·지급은 수행하지 않는다. 결합 전·조회 중·서명 전에는 관리형 창이 없어야 한다. 유효한 서명 뒤 창이 열린 것을 확인한 다음, 이번 시험에서는 READY를 보내거나 추가 증빙을 수집할 필요가 없다. 명시 종료로 소유한 자원을 정리한다. 이 모드는 새 chain/runtime과 fresh Moodle intent를 사용하며 이전 지급 기록을 다시 실행하지 않는다.

## 최초 신청 연결 회귀 수정 (2026-11-05)

실제 카드 시험에서 신청 생성은 저장됐지만 최초 source-session POST가 409로 거부됐다. certificateCardOnly 쓰기 제한이 아직 없는 app 바인딩을 먼저 요구한 것이 원인이다. 미결합 상태에서는 형식이 정확한 source-session 경로만 추가 허용하고, 기존 참가자 인증·신청 소유권·Moodle 명령 승인 검사는 그대로 수행한다. 결합 후에는 해당 신청의 기존 허용 경로만 사용할 수 있다. 관련 회귀 31개 통과. 기존 신청은 보존하고 사용자 승인에 따라 수정본의 새 실행으로 실제 카드 시험을 이어간다. 실제 카드 시작·증빙 서명·HackerRank 창 열기 확인은 아직 완료되지 않았다.

### r6 서명 대기 조회 보정 (2026-11-05)

r6은 신청 연결 후 `SIGNATURE_WAIT STARTED`까지 도달했다. 따라서 서버의 명시적 인증 시작 게이트는 통과했으며, 증빙 서명 수락/브라우저 개방 성공은 확인되지 않았다. 인증 DB의 비밀값을 제외한 시각을 비교하면 세션은 발급 35초 후 취소되었고 원래 만료까지 3,565초가 남아 있었다. `AUTH_REQUIRED`를 자연 만료로 해석하지 않는다. 기록 순서는 신청 조회 `BC_VIEW_STALE` 보류 → 세션 취소 → `AUTH_REQUIRED` → 대기 종료다. 취소를 촉발한 브라우저 명령은 현재 기록만으로 확정하지 않는다.

최소 보정 후보는 live owner가 서명 broker에 전달하는 신청 조회 callback에 기존 `readNormalView`를 적용한다. 정확한 typed `BC_VIEW_STALE`인 경우에만 실패한 조회를 버리고 인증을 포함한 store 조회를 한 번 새로 수행한다. 서명 제출/명령/원천 수집은 재실행하지 않는다. 지속 충돌·실제 취소·기한·소유권·CSRF·서명 검증은 기존 거부 경계를 유지한다. 이 수정은 확인된 조회 충돌 경로의 보정이며 r6 전체 취소 원인이 입증되었다는 주장은 아니다. C 변경이나 실제 재실행은 독립 검토 이후 판단한다.

검증: `ui-session-projection`, `ui-session`, `ui-session-http`, `normal-certificate-start` 53개 통과. 새 테스트는 초 경계 충돌 후 동일 서명 요청 조회/단회 수락 및 충돌 도중 실제 logout 거부를 확인한다. 로컬 로그 `/tmp/clear-r6-projection-fix.log`. 실제 신청·지급 기록은 변경하지 않았다.

### 취소 최초 원인 로컬 진단 (r6 후속)

Moodle 지갑 controller는 `cancel` 정규화 및 retire/release 전에 최초 `CANCEL_TRIGGER`를 기록한다. 동일 연결의 후속 취소·폐기는 덮어쓰지 않으며, 새 로그인 성공 후 다음 연결에서 새 원인을 기록할 수 있다. 허용된 origin/action/causeCode, HTTP 상태(100–599 또는 null), 정수 sequence, 고정 event/version만 저장한다. 임의 SDK error/code/message·stack·본문·주소·토큰·쿠키·서명·URL은 저장하지 않는다. 진단 실패/저장 거부는 취소 흐름에 영향을 주지 않는다. 인증/취소/재시도 정책 변경은 없다.

인수 위치는 해당 Moodle origin과 **동일 Chrome 프로필**의 로컬 저장소 키 `clear.moodle.cancel.diagnostic.v1`이다. 기존 OAuth 로컬 진단의 허용 목록 방식을 사용하며 서버 전송/새 telemetry endpoint는 없다. 페이지 controller 폐기나 창 닫기 후에도 프로필 localStorage가 보존되는 동안 확인할 수 있다. DevTools Application → Local Storage → 해당 Moodle origin에서 **이 키 하나만** 확인한다. 프로필 삭제/사이트 데이터 삭제/저장 차단 시 보존을 보장하지 않는다. sequence는 이 controller가 관측한 저장 기록에 대한 순서이며 여러 탭 간 전역 순서를 증명하지 않는다. 마지막 연결의 최초 원인 하나만 유지하므로 재로그인 전에 필요한 기록을 인수한다. 기록은 브라우저 관측 자료이며 인증/지급 권한 증거로 사용하지 않는다.

연결 종료 경로 분류: workflow-failure, explicit-cancel, wallet-change, expiry, dispatch-failure, command-failure, sign-out, destroy. 원래 오류 코드가 허용 목록에 없으면 UNKNOWN이다. 직접 command 경로는 전체 경로/명령 본문을 기록하지 않고 action NONE을 사용한다. read HTTP409는 기존 정책대로 취소하지 않으며 기록도 생성하지 않는다. 401/403 또는 write 실패로 취소될 때 해당 최초 원인이 CANCELLED로 바뀌기 전에 기록된다.

검증: `tests/embedded-wallet/moodle-native-controller.test.mjs` 17개 통과, `/tmp/clear-cancel-trigger-tests.log`. read409 유지, write/auth 오류 원인, 명시 취소와 중복 폐기, dispatch/wallet/expiry/sign-out/destroy, 저장 실패 중 revoke, 비밀값 제거/hostile getter, 새 연결 sequence를 확인했다. 실제 재실행 및 frontend bundle 교체는 이 검증에 포함하지 않는다.

### r7 최초 원인 분류 보완 (2026-11-05)

실제 r7 로컬 진단은 `workflow-failure/start-certificate/UNKNOWN`, HTTP 상태 null, sequence 1이었다. 해당 키만 인수한 안전 사본은 `/private/tmp/clear-a-certificate-assembly-20261105/r7-cancel-trigger.json`이다. 서버 원천 진단은 events 0으로, 서명 대기 도달 근거가 없다. Moodle `login_action.php`는 Throwable을 일반 응답으로 가리고 Apache 접근 기록도 `/dev/null`로 설정되어 있어, 이미 관측한 403이 authorize-command인지 정리 end인지 기존 비밀없는 기록으로 확정하지 못했다. 원본 요청 본문/쿠키/토큰/서명/원천 증명은 열람하지 않았다.

진단의 고정 원인 목록에 기존 오류 두 개 `MOODLE_LOGIN_UNAVAILABLE`, `MOODLE_CERTIFICATE_UNAVAILABLE`만 추가했다. `course()`의 기존 비정상/redirect 응답 거부는 같은 오류로 유지하되 실제 응답의 정수 HTTP status 100–599만 Error.status에 보존한다. error body는 읽지 않는다. 무효 status 또는 getter 실패는 생략하며 응답 거부는 그대로다. start-certificate workflow의 해당 요청 실패는 최초 CANCEL_TRIGGER에 기록되므로 후속 end 실패가 덮어쓰지 않는다. 별도 stage·endpoint·C PHP 변경은 없다. 성공 응답 파싱, 기존 finish의 status 확인, catch/취소/명령/재시도 정책은 유지한다.

검증 33개 통과: `moodle-native-login-diagnostics.test.mjs`, `moodle-native-controller.test.mjs`, `moodle-native-workflow.test.mjs`. 로그 `/tmp/clear-r7-login-diagnostics-tests.log`. 새 회귀는 HTTP 범위·형 검사, redirect 거부, hostile status getter, 거부 body 미열람/명령 미전송, authorize403→end500에서도 최초403 보존, 두 고정 코드와 임의 문자열 배제를 검증한다. 이는 다음 시험의 진단정보 보완이며 실제 r7 원인 해결이나 복구 성공을 뜻하지 않는다. 실제 새 실행/재로그인/신청 재생성은 수행하지 않았다.
