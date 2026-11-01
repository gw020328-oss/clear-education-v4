# 회고 단계의 명시적 수동 재개 — 2026-10-31

PR131의 전체 쓰기 차단 후 읽기 전용 대기를 좁게 확장한다. 실행 중인 같은 호스트·신청·지갑 인증에 한해 회고 단계의 수동 재개를 지원한다. 실패한 과거 실행이나 삭제된 원천 세션을 복원하지 않는다.

## 허용 조건

- `NOT_SENT`: 관리형 AI 실행 잠금 안에서 전송 전 진입과 실패를 원자 기록했고, 아직 승인 예약/소비가 없다. 해당 원래 입력·승인·기한·코드 결합이 유효할 때 운영자가 재개할 수 있다. 기록 없음, 빈 journal, 중간 종료의 `ENTERED`는 미전송 증거가 아니다.
- `RESULT_READY`: 같은 producer가 메모리에서 보유한 검증 가능한 완료 candidate를 재사용한다. 새 모델 호출은 없다. 결과 파일의 요약만으로 candidate를 복원하지 않는다.
- `ALREADY_ACCEPTED`: 같은 requestHash의 현재 MET 회고 증거와 소비된 요청을 확인하여 이미 반영한 회고 단계를 건너뛴다.
- 승인 예약 뒤 실패는 `APPROVAL_SPENT_NOT_SENT`, 전송 의도 기록 뒤 결과 미확인은 `UNKNOWN`이다. 기존 승인 재사용은 불가하며 새 유료 시도는 별도 정확 입력 승인과 복구 검토가 필요하다. 이 변경은 그 새 유료 시도나 범용 재개 엔진을 설치하지 않는다.

`POST /bootcamp/v4/applications/:id/resume`는 인증된 운영자만 사용할 수 있다. body는 `failureRevision`, `expectedRevision` 두 필드다. 원래 참가자 인증, 현재 HR 증거·회고 준비, 현재 source request/revision, 원래 승인/원천 기한과 양쪽 화면의 최근 조회를 다시 검사한다. 요청은 동기적으로 한 번만 큐에 넣으며 중복/동시/옛 revision은 거부한다. 유실된 응답은 GET으로 확인하고 자동 POST 재전송하지 않는다. 나머지 실패 중 제품 쓰기는 계속 차단한다. 이 재개 자체는 새로운 유료 호출 승인이 아니다.

## 수명과 종료

안전한 재개 가능성이 확인된 경우에만 이미 열린 원천 owner·검증 lease·준비 handle을 기존 기한 안에서 유지한다. 완료한 HR 수집·서명·신청·SIWE를 다시 실행하지 않는다. 원문·쿠키·개인키의 새 영속 복사본은 만들지 않으며 기존 source/승인/인증 만료를 늘리지 않는다. 새 영속 attempt 기록에는 상태·시도 번호·결합/승인 지문·고정 오류 코드만 있다. `RESERVED`는 독점 소비 전에, `DISPATCH_INTENT`는 native transport/키 접근 전에 동기 fsync 기록한다. 실제 전송 가능성 뒤 실패를 `NOT_SENT`로 되돌리지 않는다.

준비 기한·현재 증거/권한 검사가 실패하거나 `FINISH`/취소/종료가 발생하면 원천 자료를 정리한다. 재개 불가능한 경우는 기존 읽기 전용 대기로 남고, 기반시설/보안 오류는 전체 종료한다. 인증이 유효한 동안 조회할 수 있으며 인증 만료·회수·지갑 변경은 우회하지 않는다. 만료/변경된 증거 또는 승인만 갱신 필요로 표시한다. 갱신 실행이나 이미 종료한 호스트의 복원은 이 PR에 포함하지 않는다.

## 지급 결과 미확인

claim 거래 해시를 받은 즉시 보고서에 저장한다. 지급 완료 응답이 유실돼도 기존 거래의 canonical receipt를 읽어 수령자·토큰·100 TEST·판정·권리 결합을 확인한다. 완료 플래그나 잔액 차이 기록이 없는 경우 측정은 `CANONICAL_TRANSFER_EVENT`로 표시하며 잔액 차이를 측정했다고 주장하지 않는다. 조회는 새 claim/서명/전송을 만들지 않는다. 해시조차 받지 못한 UNKNOWN은 재전송하지 않고 별도 결과 확인이 필요하다.

## 기존 실제 AI 실패 진단

기존 `SOURCE_reflection-topics / BC_PRODUCER_FAILED`의 정확한 하위 원인은 **미확정**이다. 현재 남아 있는 metadata에서 실행/요청/승인의 code head, clean 상태, planHash, runBindingHash가 일치하고 승인 수신 시각이 source 만료 전임을 확인했다. 저장된 승인 자체의 결합 불일치는 이 자료로 뒷받침되지 않는다. 오류 순간의 current code/approval/source authority, 실행 잠금/파일 I/O 상태와 하위 예외는 기록되지 않았다. 빈 journal은 원격 미호출의 증거가 아니므로 기존 승인을 다시 실행하지 않았다.

이번 합성 재현은 승인 현재성 조회가 전송 전에 실패하는 경우를 만들고, 지속적인 미전송 기록을 남긴 뒤 명시 재개하여 정확히 한 번만 처리되는지 검사한다. 이것이 과거 실제 실패 원인이라는 주장은 하지 않는다. 하위 Gemini 오류는 고정 코드만 보존하도록 보완했다. 실제 원인 확정에는 새 코드로 별도 승인된 진단 시험이 필요하며, 이 개발 작업에서 실제 로그인·새 증명·유료 AI·실사용 지갑 지급을 실행하지 않았다.

## 검증

합성 HTTPS에서 같은 양측 SIWE 세션의 전송 전 실패→재개→1회 AI 결과, 중복/동시/옛 revision 거부, auth/evidence 무효화 및 전송 후 UNKNOWN 차단을 검사한다. source sequence 시험은 완료 HR 1회, 원래 회고 request/만료 유지, 이미 수락된 회고 건너뛰기, 양측 동의를 검사한다. 별도 합성 producer와 실제 격리 Geth를 결합해 같은 신청/인증의 실패→수동 재개→V2 수령 등록·동의→100 TEST·중복 청구 거부·영수증만 재조회 경로를 검증한다. 이는 실제 계정/유료 모델 완주가 아니다.


## 2026-11-01 폴더 준비·오류 분류 보정

새 worktree에 `artifacts`가 없을 때 하위 `e6-managed-normal-reflection-claims`만 non-recursive 생성하던 경로에서 `ENOENT`가 재현됐다. 종전 fixture는 상위 폴더를 미리 만들어 이 조건을 가렸다. 고정 상위 폴더와 하위 폴더를 각각 `privateDirectory(..., {create:true})`로 준비한다. 각 단계의 현재 UID·0700 범위·심링크/alias 거부를 유지하고 전역 helper의 recursive 동작이나 권한 자동 수리는 추가하지 않는다.

실패는 `NORMAL_RUN_CLAIMS_DIRECTORY`, source-defined `NORMAL_CLAIMS_PARENT`/`NORMAL_CLAIMS_DIRECTORY`, 고정 하위 파일시스템 코드로 구별한다. attempt 기록과 collection 진단에는 민감 경로·오류 원문·stack을 저장하지 않는다. 폴더 권한/소유자/alias 오류는 제품 호스트에서 보안 오류로 종료되며, 폴더를 고쳤다는 사실만으로 자동 재개하지 않는다. 소비/전송 뒤 UNKNOWN·기존 승인·원래 기한 정책은 그대로다.

이번 실제 실패에서는 상위 폴더 부재, `FAILED_BEFORE_CLAIM/NOT_SENT`, 같은 호출의 `ENOENT` 재현이 가장 강한 직접 원인 근거다. 당시 하위 원본 예외가 남지 않았으므로 역사적 원인을 확정했다고 기록하지 않는다. 본부가 확인한 해당 입력의 원래 만료는 **2026-10-31 23:52:21 KST**이며, 확인 시점 **2026-11-01 04:10 KST**에 이미 지났다. 최소 폴더 준비만으로 해당 입력/승인을 재개할 수 없고 새 실제 시험은 사용자 단계로 남긴다.

수정은 별도 worktree에서 수행하여 기존 프로세스와 실행 작업본의 HEAD·파일·데이터를 보존한다. 실행 중 hotpatch·codeHead 변경/위조·만료 연장은 하지 않는다. 새 코드가 기존 프로세스에 자동 반영되지 않는다. 일반적으로 폴더만 준비하여 기존 코드를 재개하려면 원래 프로세스·코드 지문·미전송 증거·미소비 승인·모든 원천/인증 기한이 여전히 유효하고 운영자가 수동 재개해야 한다. 이번 입력은 만료되어 이 조건을 충족하지 않는다.


## 2026-11-01 수령 등록 대기 체크포인트

`WAIT_RECIPIENT_SIGNATURE`의 기존 초기 timeout 계산은 raw `store.getRecipientRegistration`을 사용했고 poll의 `ui.participant()`도 raw 호출이었다. SQLite 현재성 검사가 두 번 읽는 사이 초 경계가 넘어가면 두 위치 모두 typed `RuleError/BC_VIEW_STALE`을 낼 수 있음을 결정적 합성 시험으로 재현했다. 실제 wall-clock 경계 시험도 수행했다. 당시 보고서는 `SETUP/WAIT_RECIPIENT_SIGNATURE`까지만 기록하므로 실제 어느 호출이었는지는 확정할 수 없다. 새 대기 함수는 초기 기한/참가자/등록 상태의 읽기만 기존 `readNormalView`로 최대 1회 재조회하며, 반복 충돌은 `RECIPIENT_DEADLINE_READ`, `RECIPIENT_POLL_AUTH`, `RECIPIENT_POLL_REGISTRATION`으로 구별한다. 쓰기·서명·등록·지급을 재시도하는 wrapper가 아니다.

수동 재개는 실행 중인 단일 지급 함수의 **수령 등록 대기 위치**만 유지한다. 이미 만든 registration target·payload·nonce·deadline을 재사용하며 `registerNormalSourceTarget`, 원천 수집, AI 호출을 다시 실행하지 않는다. 운영자가 기존 `/resume`에서 승인하면 메모리의 1회 permit을 소비한다. 인증·기존 code head/clean·신청 revision/판정/정책/mapping·현재 네 증거·원래 source/signature 기한·양측 화면 현재성을 확인한다. 재개 후 canonical chain refresh에서 미등록 상태를 다시 확인하고 source review window도 재검증한다. key/signature/broadcast 카운터가 모두 0이고 envelope·stages·claim이 없을 때만 가능하다. 기존 유효 수령인 서명은 유지하며 중복 등록 target·변경된 payload·이미 등록된 체인·결과 불명은 차단한다. 승인/원천/인증 기한은 연장하지 않는다.

이 체크포인트는 보고서에서 복원할 수 없는 프로세스 내부 capability다. `FINISH`/취소/만료는 기존 정리 경로를 따르고 전송 후 지급은 재개 대상이 아니다. 실패 위치는 성공적으로 재개한 뒤에도 `recipientWaitFailure`에 고정 진단으로 남긴다. 새 화면은 기존 재개 버튼의 문구와 사유만 구별한다.

현재 실제 실행은 이전 HEAD `3047ddb`의 `paymentStarted` 실패 처리에서 원천 lease/producer 정리 경로에 들어간 상태이며 새 체크포인트를 갖고 있지 않다. 따라서 원래 로그인이나 완료 AI 결과가 남아 있어도 현 프로세스에 새 코드를 주입하거나 보고서만으로 재개할 수 없다. 보고서의 시작 시각으로 계산한 서비스 권한 상한은 **2026-11-01 12:12:53 KST**다. 실제 자료 원문을 읽거나 복사하지 않았으며 source별 정확한 잔여 기한을 새로 확인했다고 주장하지 않는다. 상한이 지나면 폴더·코드 수정만으로 재개하는 것도 불가하다. 현재 실행의 종료/재시작/로그인/AI 재호출/재수집/지급 재전송은 이번 작업에서 수행하지 않는다.


## 수령 등록 서명 전 관측값 비교 후속 (2026-11-01)

실제 실행에서 Privy 창 전 일반 오류가 표시됐지만 클릭 당시 내부 코드는 수집되지 않았다. 코드상으로는 동일 payload에서 observedAt와 checkpoint만 전진할 때 전체 응답 비교가 REGISTRATION_STALE을 내고 지갑 요청이 0회인 경로가 재현된다. 이것은 실제 증상과 부합하는 재현이며 당시 원인을 확정한 증거는 아니다.

고정 서명/CAS 필드 비교와 현재 체인 검증을 분리했다. 클라이언트는 원래 표시한 checkpoint를 선택적 GET query로 전달한다. 서버는 기존 reader의 canonical block/ancestry 검증, RPC 이후 인증 및 등록 대상/결정/CAS 재검사를 수행한다. 성공 응답의 ancestry 결합을 확인한 뒤에만 관측 메타데이터의 이동을 허용한다. 서명 전후 두 번 적용하고 기한·nonce·수령인·POST CAS는 유지한다. 체크포인트를 무조건 제외하거나 체인 UNKNOWN을 성공으로 취급하지 않는다.

별도 `clear-registration-observation-fix`에서 개발했다. 실행 중인 `clear-recipient-wait-fix` HEAD 2effc31319eb79de7325cc58f61959b25c9d614f, 프로세스/브라우저/로그인/증거/승인은 변경하거나 종료하지 않았다. 실제 실행의 코드 지문에 새 코드가 자동 적용되지 않는다. 새 지문으로 기존 실행을 이어 붙이거나 hotpatch하지 않으며, 이 수정 검증만으로 기존 실행의 원래 만료·증거·동의가 유효하다고 판단할 수 없다. 실제 재개/새 로그인/새 AI/새 지급은 수행하지 않았다.

합성 검증은 정상 codec, 서명 전후 블록 전진, 전체 고정 필드·수령인·payload·deadline·결정/CAS 변경 거부, canonical 불명확/재조직/등록됨 거부, RPC 뒤 logout/대상 변경 거부, 안전한 오류 표시와 POST UNKNOWN 차단을 포함한다. 새 격리 Geth의 실제 HTTP 관측 overlay를 거쳐 지갑 서명 요청 1회, 같은 등록 payload/CAS의 제출, 100 TEST 지급과 중복 차단을 확인한다. 합성 키·합성 로그인/원천/AI fixture이며 사용자 로그인·외부 SDK·유료 API 호출이 아니다.
