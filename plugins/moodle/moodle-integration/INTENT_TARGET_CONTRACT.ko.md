# 원 Moodle SESSION의 intent 대상 결합

2026-11-05. 기준 C `9eb30fd2459cd6c53e34290c19dfdb0dff6382a1` / ZIP0.1.12와 CSP 증거는 보존한다.
권한·동시성 작업의 요청 모델은 Astra / High, 현재 실제 실행 모델은 GPT-6.1 Sol이다.
이번 0.1.13은 late old end가 새 start의 현재 SESSION intent를 종료하는 경계를 닫는다.
같은 문제가 finish 응답 유실 뒤 status 복구에서 새 intent의 CONNECTED를 읽게 할 수 있어
본부가 채택한 대로 end와 status 양쪽에 대상을 필수 결합한다.

## exact 브라우저 계약

- start form: 기존 `{id,sesskey,operation:'start',challenge}` 유지.
- start 응답: exact6 `{status:'WAITING',expiresAtExclusive,launchCode,browserProof,finishProof,intentTarget}`.
- end/status form: exact4 `{id,sesskey,operation:'end'|'status',intentTarget}`.
- finish form: 기존 `{id,sesskey,operation:'finish',finishProof}` 유지. C 내부의 fresh status→finish는
  이미 원 SESSION에서 선택된 동일 intentRef로 호출하므로 private DTO는 바꾸지 않는다.
- intentTarget은 소문자 64 hex. 브라우저 closure에만 보관한다. 권한·지갑 서명·C sesskey의 대체물이 아니다.

`intentTarget = HMAC-SHA256(sessionKey, join("\n", [
"CLEAR-MOODLE-LOGIN-INTENT-TARGET-1", ownerRunId, role, scopeDigest, intentRef, PHP_session_id]))`.
키는 기존 sessionKey의 64자 문자열 자체이며 hex decode하지 않는다. 마지막 LF는 없다.
scopeDigest는 기존 전체 validated scope의 정렬·JSON SHA-256이다. 서버가 현재 SESSION에서
고른 intent와 실제 현재 PHP session_id만 사용한다. raw session ID/intentRef는 브라우저로 내보내지 않는다.
SESSION attempt의 기존 run/role/intent/scopeDigest 4필드는 그대로이고 새 registry/tombstone은 없다.

원 Moodle 로그인·sesskey·role·활성 등록·전체 scope를 먼저 확인한다. 현재 대상이 있고
서버에서 재계산한 target이 hash_equals로 일치해야 기존 해당 owner operation을 호출한다.
정상 end는 기존 owner의 UNAVAILABLE/EXPIRED 응답 검증 후 현재 SESSION attempt를 제거한다.
다른 scope나 pre-upgrade attempt는 여전히403이며 오래된 대상 종료를 시도하지 않는다.

현재 attempt가 없거나 target이 다르면 HTTP200 exact `{status:'NOT_CURRENT'}`다.
owner 호출도 현재 SESSION 변경도 없다. 반복 end/status는 같은 무효과 결과다.
NOT_CURRENT는 **이전 owner의 종료 완료나 이전 연결의 성공 증거가 아니다**. A는 이를
UNKNOWN 해소나 CONNECTED 표시로 바꾸지 않고 기존 불확실 상태를 유지한다.
target 누락/형식오류/extra field 및 권한·scope 불일치는 기존403 UNAVAILABLE다.

현재 후보 페이지에서 호출하지 않는 legacy AMD도 exact6 start와 target 전달에 맞췄다.
finish 응답 유실 뒤에는 같은 target으로 status만 읽는다. target이 사라진 reload에서는
현재 SESSION의 다른 intent 상태를 자동 조회하지 않는다. end/status 대상의 URL/로그/저장은 없다.

## 표적 검증

실제 `login_action.php`를 격리 PHP HTTP 서버에서 실행하고 Moodle identity/SESSION 및
owner 응답만 모델링했다. 이 검사는 실제 Moodle 로그인이나 A auth 성공이 아니다.

- 기존 동일 scope 및 subject/operator/course/legacy 변경의20 dispatch 분기 회귀.
- 새 start가 기존 대상 end→새 start를 수행한 뒤 이전 target으로 늦게 도착한 end/status:
  NOT_CURRENT, owner 호출0, 새 SESSION attempt 불변.
- 다른 PHP session ID, missing/malformed/extra target의 owner 호출0 및 현재 attempt 보존.
- 현재 target 정상 종료는 정확히 해당 intentRef에만 end1회. 종료 후 반복 end/status는
  NOT_CURRENT·호출0으로 멱등 무효과.

0.1.12의 실브라우저/CSP 증거를 재분류하지 않는다. 신규 A target closure 구현과 검토된
head를 함께 조립해야 하며, 이 ZIP만으로 실제 인증/live 활성화를 승인하지 않는다.
