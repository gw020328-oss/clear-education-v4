# 정상 시험 원천 단계 진단

2026-10-24 현행 스키마는 clear-normal-source-diagnostics.5다. [r8 조사](BOOTCAMP_R8_INVALID_CLAIM_REVIEW.ko.md)와 아래 v5 규칙을 우선하며, 이전 세대의 기록·수집 경계를 소급 변경하지 않는다.

2026-10-23 최신: r5 이후 SDK 분류·상대 시간 보완은 아래 v2 절과 [좁은 검토](BOOTCAMP_SDK_DIAGNOSTICS_REVIEW.ko.md)를 따른다. 이번 작업은 로그인 없는 검증까지이며 r6 환경·CA·실제 실행을 만들지 않는다.

과거 v1 기록: r3 실행은 HR 요청 생성 후 약 63.5초에 `COLLECTION_FAILED`로 종료됐다. 사용자의 지갑 서명 완료 및 UI 무오류 관찰은 있으나 서버 서명 수락 응답/영속 감사 기록은 없었다. HR evidence, AI 호출 및 지급은 0이었다. 보존 기록만으로 HR 응답 취득·증명 생성·공식 검증 중 실패 지점을 특정할 수 없다. 이 문서의 진단 보완은 과거 r3의 원인을 확정하거나 실제 증명 성공을 주장하지 않는다.

## 기록의 의미

새 실제 실행은 단회 `run.used.json` 생성 뒤 해당 실행 디렉터리에 `source-diagnostics.json`을 만든다. 준비 명령은 진단 파일·브라우저·신청·체인·증명·AI 호출을 생성하지 않는다. r3의 report/DB/사용 표시는 그대로 보존한다.

고정 버전 `clear-normal-source-diagnostics.1`은 순번, 단계 enum, `STARTED`/`COMPLETED`/`FAILED` 및 제한된 `DEFERRED`, 명시적 allowlist 오류 코드, 최초 관측 실패와 최대 128개 이벤트만 보존한다. 관측하지 못한 단계는 `NOT_OBSERVED`, 서버 서명 수락을 관측하지 못했으면 `UNKNOWN`이다. 후속 단계 도달로 앞 단계를 추정하지 않는다. `completedObserved`는 해당 경계의 완료를 실제 관측했는지만 나타낸다.

| 단계 | 관측 가능한 의미 |
| --- | --- |
| `UI_SESSION_AUTHORITY`, `UI_APPLICATION_PROJECTION`, `UI_APPLICATION_BINDING` | 대기 취소로 일반화하기 전 인증·신청 조회·신청 결합의 최초 고정 오류 코드. 조회 충돌 보류는 아래 규칙을 따름 |
| `SIGNATURE_WAIT` | 실제 UI 브로커가 원천 서명을 기다리거나 대기를 종료함 |
| `SIGNATURE_ACCEPTANCE` | 서버가 exact 신청/세션/지갑/메시지/유효기간 및 서명을 검사하는 구간. `COMPLETED`는 검사 후 promise를 해제하기 직전의 서버 수락이며, 지급 동의가 아님 |
| `PARTICIPANT_ENVELOPE_VERIFY` | 수집기에서 원천 요청 봉투와 서명을 재검증함. 이것만으로 HTTP 브로커 수락을 추정하지 않음 |
| `ACCOUNT_COOKIE_READ`, `CERTIFICATE_COOKIE_READ` | 기존 URL별 쿠키 읽기 호출의 시작/완료만 관측. 쿠키값·URL을 기록하지 않음 |
| `ACCOUNT_CLAIM_CALL`, `CERTIFICATE_CLAIM_CALL` | 기존 claim 수집 호출의 범위 |
| `ACCOUNT_RESPONSE_INSPECTION`, `CERTIFICATE_RESPONSE_INSPECTION` | 공식 SDK의 동일 호출 transcript hook에 들어와 기존 응답 검사를 수행함. 완료는 해당 검사 성공. hook 미호출은 응답이 없었다는 단정이 아니라 미관측 |
| `ACCOUNT_PROOF_RETURN`, `CERTIFICATE_PROOF_RETURN` | SDK 호출 시작부터 반환한 signed claim의 기존 구조/결합 검사 완료까지. SDK 내부 ZK 계산 시작·완료는 관측하지 않으며 추정하지 않음 |
| `ACCOUNT_OFFICIAL_VERIFY` | 기존 계정 claim의 공식 서명 및 요청 결합 검증 구간 |
| `PAIR_OFFICIAL_VERIFY` | 기존 두 claim 공식 검증·결합·원천 정책 검증 구간. verifier가 반환한 거부 코드를 일반 오류로 바꾸기 전에 보존 |
| `CANDIDATE_LEASE` | 기존 프로세스 내 candidate lease 생성/제출/재검사. API evidence 수락이나 지급 성공을 뜻하지 않음 |
| `HR_COLLECTION` | 기존 API 요청 발급 및 HR 수집·evidence 수락 전체 범위. 완료는 기존 collectBridge 반환 뒤 |
| `COLLECTOR_SETUP`, `PREPARED_SOURCE`, `MANAGED_SOURCE`, `NORMAL_FLOW` | 더 세밀한 관측을 할 수 없는 준비/외곽 실패 구간. 최초 내부 실패를 덮어쓰지 않음 |

## 민감정보와 실패 처리

오류 객체의 own `code`/`message`가 소스에 명시된 고정 코드와 정확히 일치할 때만 그 enum을 선택한다. 오류 원문은 저장하지 않는다. 비허용 코드·자유문·중첩 cause는 `UNKNOWN_ERROR`이며 getter, 문자열 변환, stack 접근을 하지 않는다. 서명값·지갑·신청 식별자·cookie/token/key·URL/query/body·인증서·원문 transcript를 진단 API에 전달하거나 파일에 저장하지 않는다.

기존 private atomic writer를 사용해 0600 파일을 교체한다. 기록은 동기 best effort이며 writer 실패를 삼키고 `persistence: INCOMPLETE`를 유지한다. 이후 기록이 성공하면 이 누락 표시도 저장한다. 마지막 쓰기 자체가 실패하면 디스크의 이전 snapshot이 완전한 기록이라고 해석하지 않으며, 종료 이벤트의 `diagnosticPersistence`를 함께 확인한다. 기록 실패를 이유로 자동 재시도·로그인·서명·AI 호출·지급을 시작하지 않고 원래 결과/예외를 유지한다. 128개를 넘기면 `truncated: true`만 표시한다.

이 진단은 권한·proof 검증 입력·candidate·store 상태 판정에 사용하지 않는다. 기존 타임아웃, 승인, nonce/단회성, 만료, 직접 사용자 서명, Gemini exact packet 승인, 동의 및 지급 정책은 유지한다. 기존 HTTP/API/제품 프론트에는 새 필드를 추가하지 않는다.

## 로그인 없는 검증과 재시험 경계

외부 네트워크를 차단한 합성 시험에서 서버 서명 수락 전/후, 무효 서명, SDK 실패 전의 미관측 응답, 응답 hook 실패, proof 반환과 공식 검증의 구분, 최종 pair 거부, 하위 코드 보존, 비허용 오류 정규화, 민감값 비기록, private 파일 권한, writer 실패 및 기록 상한을 검증한다. 실제 원천 없이 flow 실패가 AI 승인/호출·지급에 도달하지 않는지도 검증한다.

아래는 당시 r4 준비 순서의 역사 기록이며 현재 실행 지시가 아니다. 당시 최종 소스/pin/CI 확인 후 별도 r4 준비 환경만 만드는 범위였다. 새 CA가 생성되므로 사용자는 재시험 전에 해당 CA를 신뢰해야 한다. 실제 실행은 별도 사용자 준비 확인 뒤 한 번만 시작하며, 새 HR 로그인→READY→새 네트워크의 두 역할 SIWE→신청/연결→원천 사용자 서명→정확한 새 AI packet 승인→두 역할 동의→양쪽 영수증 확인 순서를 따른다. 이번 준비 단계에는 어느 실제 수집/서명/유료 호출/지급도 포함하지 않는다.

기존 HR 오프라인 CI job은 layout 시험을 포함한 `tests/hackerrank-evidence/*.test.mjs` 전체를 실행하도록 확장했다. 외부 네트워크 차단과 고정 의존성/실행시간을 유지하며, bootcamp 서명·flow 회귀는 기존 E5B CI에서 실행한다.


## r4 후속: 조회 충돌과 권한 상실 구분

r4는 대기 시작 약 45.7초 뒤 `SIGNATURE_WAIT / BC_UI_CONTEXT_UNAVAILABLE`가 먼저 기록되고, 외곽에서 `BC_REVISION_CONFLICT`와 `COLLECTION_FAILED`로 종료됐다. 당시 보존된 두 세션은 만료 전이며 취소되지 않았다. 최초 내부 조회 오류가 기록되지 않아 실제 r4의 최초 원인은 미확정이다. 지갑 서명 완료라는 사용자 관찰과 서버 수락 `UNKNOWN`을 구분한다.

별도 합성 회귀에서는 실제 인증 서비스·SQLite store·UI 브로커를 연결해 조회가 초 경계를 넘을 때 store가 `BC_VIEW_STALE`을 던지고 기존 브로커가 정상 대기를 영구 취소하는 결함을 재현했다. 수정 전 3개 핵심 검사가 같은 이유로 실패했다.

기존 pending이 있고 신청 **조회 호출**에서 store의 `RuleError` 및 정확한 `BC_VIEW_STALE`이 반환된 경우만 보류한다. 이때도 현재 세션·역할·CSRF·지갑 및 기존 마감 시간을 다시 검사한다. 원래 예외를 호출자에게 던지며, 오래된 조회값이나 권한 context를 반환하지 않는다. 기존 250ms 검사가 원래 마감 전 다시 읽을 수 있을 뿐 새 반복 루프·쓰기·서명·외부 호출 자동 재시도를 만들지 않는다. 서명 제출 중 이 오류가 발생하면 그 제출은 수락하지 않는다.

`UI_APPLICATION_PROJECTION / DEFERRED / BC_VIEW_STALE`은 pending당 최초 1회만 보존한다. 이 상태는 실제 실패나 조회 성공을 뜻하지 않으며 `firstFailure`를 차지하지 않는다. 반복 충돌 때문에 진단 상한을 소모하지 않는다. 진짜 권한 상실·만료·신청/정책/매핑 변경·알 수 없는 오류는 최초 고정 코드와 단계를 기록한 뒤 대기를 취소한다. 진단 코드 allowlist 자체를 일시 오류 목록으로 사용하지 않는다.

수락에는 성공한 새 신청 조회, 현재 역할/세션/CSRF/지갑/chain, 정확한 신청·참가자·policy·mapping·메시지·nonce가 결합된 기존 approval, 원래 exclusive 만료, 실제 서명 검증을 계속 요구한다. store의 전역 `BC_VIEW_STALE` 검사와 TTL·단회성·원천/AI/지급 정책은 변경하지 않는다. 새 r5 준비와 실제 실행의 승인 경계는 분리하며 r3/r4 기록을 재사용하지 않는다.

## r5 후속 v2: SDK 경계와 상대 시간

r5는 서버 원천 서명을 수락하고 계정 응답 검사를 완료한 뒤 `ACCOUNT_PROOF_RETURN / UNKNOWN_ERROR`로 실패했다. 당시 스키마에 SDK 코드와 단계별 시간이 없어 최초 원인을 복원할 수 없다. 전체 HR 시도 165.982초는 사람의 서명 대기를 포함한다. 이를 ZK 계산 시간이나 특정 타임아웃으로 해석하지 않는다. r5 사용 표시·진단·보고서·DB와 이전 실행 기록은 보존한다.

당시 v2 스키마 `clear-normal-source-diagnostics.2`는 기존 필드에 고정 `codeNamespace`, `codeBasis`, `resultKind`, `aborted`, `offsetMs`, `durationMs`와 전체 `timing` 상태를 추가한다. 모든 이벤트의 offset은 관측기 생성 시점부터 동일한 단조 시계의 상대 밀리초다. 완료/실패 duration은 같은 단계의 최근 STARTED와 짝이 있을 때만 기록한다. 절대 시각은 기록하지 않고 보안 만료 시계는 바꾸지 않는다. 시계 오류·역행·비유한 값은 이후 `timing: INCOMPLETE`, 시간 null로 고정한다. 시간·abort의 null은 미관측/불명확이다.

아래 `ROLE`은 ACCOUNT 또는 CERTIFICATE다. OBSERVED는 완료나 성공을 뜻하지 않는다.

| 관측 단계 | 다음 단회 시험에서 구분할 수 있는 사실 | 남는 한계 |
| --- | --- | --- |
| `ROLE_SDK_CALL` STARTED → FAILED | SDK await가 reject되었고, 해당 경계의 상대 시간·경과 시간·abort 상태 | SDK 내부 세부 함수/원격 장애 지점은 미확정 |
| `ROLE_SDK_CALL` COMPLETED + `ROLE_SDK_RETURN` OBSERVED | await resolve. ERROR / MISSING_SIGNATURE / MALFORMED / SIGNED_CLAIM / UNKNOWN 반환 형태 구분 | SIGNED_CLAIM은 서명 바이트의 길이와 형태 관측만 의미하며 유효성 보증 아님 |
| `ROLE_RETURN_VALIDATION` | resolve 이후 기존 guard·hook·서명 형태·JSON·owner·context·추출값 결합 검사 | 통과해도 공식 서명 검증 완료 아님 |
| `ROLE_RESPONSE_INSPECTION` | 동일 SDK 호출 transcript hook의 기존 응답 검사 | 완료 뒤 SDK 내부 준비/ZK 계산은 별도 |
| `ROLE_SDK_CONNECTING`, `ROLE_SDK_SENDING_REQUEST`, `ROLE_SDK_WAITING_RESPONSE` | SDK가 지원하는 해당 콜백을 처음 보낸 시각 | 연결/송신/응답 성공을 보증하지 않음 |
| `ROLE_SDK_ZK_PROGRESS_OBSERVED` | `generating-zk-proofs` 최초 콜백 시각 | 준비 뒤 done=0/total=0에서도 발생. 정확한 ZK 시작·첫 증명 완료·전체 성공 아님 |
| `ROLE_SDK_VERIFICATION_PHASE_OBSERVED` | `waiting-for-verification` 최초 콜백 시각 | 로컬 요청 인코딩/서명 및 RPC 전송 이전. RPC 송신이나 공식 검증 성공 아님 |
| `ROLE_SDK_ABORT_OBSERVED` | SDK await 진행 중 abort를 직접 관측 | SDK 오류와 함께 나타나도 인과관계 확정 아님 |
| `ACCOUNT_OFFICIAL_VERIFY`, `PAIR_OFFICIAL_VERIFY` | 기존 독립 공식 검증 경계의 시작·완료·실패 | API evidence 수락/AI/지급까지의 성공 아님 |

SDK reject 분류는 HR와 실제 transport가 사용하는 두 고정 5.1.4 모듈의 `AttestorError` 타입 및 own 문자열 code를 모두 확인한다. 12개 고정 실패 enum만 `ATTESTOR_SDK / ATTESTOR_ERROR_OWN_CODE`로 기록한다. resolved `result.error`는 별도 경계에서 own 숫자 1..12만 고정 테이블과 SDK forward enum에 대조하여 `ATTESTOR_SDK / PROTO_ERROR_CODE`로 기록한다. 런타임 enum에는 숫자 역방향 매핑이 없어 이를 사용하지 않는다. `ERROR_NO_ERROR`, `UNRECOGNIZED`, 알 수 없는 코드, plain Error/TypeError 또는 SDK처럼 보이는 이름/message/code는 SDK 경계에서 UNKNOWN이다. 기존 CLEAR hook 오류는 CLEAR로 유지한다. HR만 설치하는 기존 오프라인 소비자에서 transport 타입을 로드할 수 없어도 관측 때문에 import를 실패시키지 않는다. 인식할 수 없는 타입은 UNKNOWN으로 남긴다.

원문 message/stack/data/cause는 읽거나 변환하지 않는다. 기존 일반 CLEAR/SYSTEM 코드 경계는 own 고정 코드의 정확 일치 규칙을 유지한다. onStep 객체를 저장하지 않으며 done/total/예상 잔여 시간도 보관하지 않는다. 지원하는 다섯 콜백은 역할·호출당 최초 1회만 관측하고, 종료 뒤 콜백/늦은 hook/abort는 과거 관측을 추가하지 않는다. 128개 상한·0600 atomic 저장·sticky persistence INCOMPLETE·기존 정리는 유지한다.

SDK `maxRetries: 1`은 고정 SDK 구현상 총 1회 시도다. 재시도, 타임아웃 연장, auth/서명/nonce/만료 완화는 없다. BC_VIEW_STALE 보류와 실제 권한 상실 차단도 그대로다. 합성 검증 성공은 실제 proof 성공이 아니며, 새 오류가 plain Error인 경우 다음에도 코드 UNKNOWN이 가능하다. 다만 관측 경계·시간·abort·반환 형태를 함께 읽어 다음 조사 범위를 좁힐 수 있다. 새 실제 시험은 최종 CI 결과 보고 뒤 사용자의 별도 확인을 기다린다.


## r6 후속 v3: 생성 출처와 실제 RPC 경계

현행 `clear-normal-source-diagnostics.3`은 v2를 보존하며 `ROLE_SDK_CLAIM_RPC_OBSERVER`와 `ROLE_SDK_CLAIM_RPC`를 추가한다. 설치 관측 후 실제 동일 client의 claimTunnel 메서드 진입/완료/실패를 기록한다. 진입은 RPC envelope 송신 전이며 완료는 claim 유효성 판정이 아니다. 설치 미관측 시 RPC 미관측을 진입 전 실패로 추정하지 않는다. 내부 관측 callback은 동기 전용이며 반환값/원래 오류를 유지하고 해지 뒤 이벤트를 버린다.

SDK_CALL 또는 SDK_CLAIM_RPC 실패의 고정 errorKind는 OWNED_BOUNDED_SEND / HR_ATTESTOR_ERROR / TRANSPORT_ATTESTOR_ERROR / NATIVE_TYPE_ERROR / NATIVE_RANGE_ERROR / NATIVE_ERROR / NON_ERROR / UNKNOWN이다. ownCodeKind는 ABSENT / ACCESSOR / STRING / NUMBER / OTHER / UNKNOWN이다. own descriptor만 보고 getter를 호출하거나 실제 값을 기록하지 않는다. 나머지 이벤트의 두 필드는 null이다.

CLEAR sender 내부 WeakMap으로 생성 출처가 확인된 ATTESTOR_BACKPRESSURE_LIMIT / ATTESTOR_SEND_TIMEOUT / ATTESTOR_SEND_FAILED만 CLEAR_TRANSPORT / OWNED_BOUNDED_SEND로 분류한다. 일반 Error의 같은 message/code는 계속 UNKNOWN이다. 메시지·stack·data·cause·proof·실제 크기는 저장하지 않는다. 이전 128개 상한·타이밍·0600 저장·관측 실패 독립성·공식 검증 경계는 유지한다.

r6의 원래 객체는 소급 복원할 수 없다. 재현한 분류/타이머 결함, 과거 성공 경로 대조, 남은 가설은 [r6 조사 보고서](BOOTCAMP_R6_FAILURE_REVIEW.ko.md)를 따른다. 이번 작업은 새 실제 실행 준비가 아니다.

## r7 후속 v4: 메시지·대기열·송신 경계

2026-10-24 현행 스키마는 `clear-normal-source-diagnostics.4`다. 이전 v3/r7 기록을 고치지 않는다. `ROLE_SDK_RPC_SEND`에 QUEUED/DRAIN_WAIT 관측, 송신 STARTED, 로컬 write COMPLETED 또는 FAILED를 기록한다. 관측은 실제 claim RPC의 AsyncLocalStorage에 속하며 다른 RPC가 같은 socket을 쓰더라도 각 entry의 관측자와 deadline을 입장 때 고정한다. onStep 또는 write 완료는 원격 공식 검증 성공이 아니다.

송신 오류는 정확한 sender WeakMap 출처로 MESSAGE_LIMIT / QUEUE_LIMIT / QUEUE_TIMEOUT / SEND_TIMEOUT / SEND_FAILED / SEND_ABORTED / SEND_CLOSED의 ATTESTOR_ 고정 코드를 구분한다. 이전 BACKPRESSURE_LIMIT 분류는 역사적 호환용이다. 미전송 QUEUE_TIMEOUT은 항목만 버리고 송신 후 SEND_TIMEOUT은 연결을 종료한다. 다른 RPC가 공유 연결을 종료하면 이 claim의 SEND_CLOSED와 실제 terminalReason을 함께 기록한다.

`transport`는 고정 phase, frameBytes/socketQueuedBytes/retainedBytes/pendingCount, 각각의 제한, timeoutMs/waitMs/sendMs, terminalReason과 terminal 시점의 같은 숫자만 가진다. 모든 필드는 허용한 own 값만 읽고 getter·객체·배열·원문은 버린다. 송신 시작 전 숫자와 실패 숫자를 함께 읽어 단일 메시지 초과와 대기열 초과를 구분한다. r7 개별 크기는 여전히 UNKNOWN이며 새 값으로 과거 기록을 채우지 않는다.

128개 이벤트·0600 저장·observer 실패 격리·동일 client·요청/서명/nonce/lease·총 시도1회 경계는 유지한다. 상세 수치 근거와 합성 시험 범위는 [r7 전송 검토](BOOTCAMP_R7_TRANSPORT_REVIEW.ko.md)를 따른다.

## r8 후속 v5: 반환 오류의 제한된 힌트

SDK_RETURN/OBSERVED의 claimReturn은 basis=REMOTE_ERROR_HINT, 고정 reasonHint 7종, errorPresent/claimPresent/claimSignaturePresent/resultSignaturePresent 4개 boolean만 포함한다. 서명 필드는 nonempty Uint8Array 구조의 존재만 뜻한다. 기존 firstFailure는 실제 거부 경계에 남으며 오류 응답을 검증 성공으로 승격하지 않는다.

reasonHint는 UNKNOWN / REQUEST_SIGNATURE / TIMESTAMP_WINDOW / TLS_HANDSHAKE / ZK_PROOF / TRANSCRIPT_PACKET / HTTP_PROVIDER_RECEIPT다. code=5인 own 오류의 primitive message를 최대2048자, 제어문자 없는 전체 literal/template 일치로 일시 분류한다. 원문은 저장하지 않는다. 객체 변환·getter/Proxy trap·data/stack/cause 접근은 금지하며, 알 수 없는 값은 UNKNOWN이다. 이 규칙이 이전 v2의 message 비접근 원칙에 대한 유일한 제한적 추가다. 다른 오류 코드나 SDK reject/transport에는 이 분류를 확장하지 않는다.

실제 고정 protobuf 왕복과 synthetic worker 반환으로 검증한다. 고정 hint가 있어도 배포 서버 버전·오류 원인의 신뢰성을 보증하지 않는다. r8 당시에는 message/presence를 남기지 않았으므로 현재 값으로 채우지 않는다. 기존 stage 시간, 128개 상한, private 저장, 공식 검증·요청/지갑 결합·단회 소비·lease·전송 정책은 유지한다.
