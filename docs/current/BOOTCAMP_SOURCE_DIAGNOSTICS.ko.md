# 정상 시험 원천 단계 진단

2026-10-23. r3 실행은 HR 요청 생성 후 약 63.5초에 `COLLECTION_FAILED`로 종료됐다. 사용자의 지갑 서명 완료 및 UI 무오류 관찰은 있으나 서버 서명 수락 응답/영속 감사 기록은 없었다. HR evidence, AI 호출 및 지급은 0이었다. 보존 기록만으로 HR 응답 취득·증명 생성·공식 검증 중 실패 지점을 특정할 수 없다. 이 문서의 진단 보완은 과거 r3의 원인을 확정하거나 실제 증명 성공을 주장하지 않는다.

## 기록의 의미

새 실제 실행은 단회 `run.used.json` 생성 뒤 해당 실행 디렉터리에 `source-diagnostics.json`을 만든다. 준비 명령은 진단 파일·브라우저·신청·체인·증명·AI 호출을 생성하지 않는다. r3의 report/DB/사용 표시는 그대로 보존한다.

고정 버전 `clear-normal-source-diagnostics.1`은 순번, 단계 enum, `STARTED`/`COMPLETED`/`FAILED`, 명시적 allowlist 오류 코드, 최초 관측 실패와 최대 128개 이벤트만 보존한다. 관측하지 못한 단계는 `NOT_OBSERVED`, 서버 서명 수락을 관측하지 못했으면 `UNKNOWN`이다. 후속 단계 도달로 앞 단계를 추정하지 않는다. `completedObserved`는 해당 경계의 완료를 실제 관측했는지만 나타낸다.

| 단계 | 관측 가능한 의미 |
| --- | --- |
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

최종 소스/pin/CI 확인 후 별도 r4 준비 환경만 만든다. 새 CA가 생성되므로 사용자는 재시험 전에 해당 CA를 신뢰해야 한다. 실제 실행은 별도 사용자 준비 확인 뒤 한 번만 시작하며, 새 HR 로그인→READY→새 네트워크의 두 역할 SIWE→신청/연결→원천 사용자 서명→정확한 새 AI packet 승인→두 역할 동의→양쪽 영수증 확인 순서를 따른다. 이번 준비 단계에는 어느 실제 수집/서명/유료 호출/지급도 포함하지 않는다.

기존 HR 오프라인 CI job은 layout 시험을 포함한 `tests/hackerrank-evidence/*.test.mjs` 전체를 실행하도록 확장했다. 외부 네트워크 차단과 고정 의존성/실행시간을 유지하며, bootcamp 서명·flow 회귀는 기존 E5B CI에서 실행한다.
