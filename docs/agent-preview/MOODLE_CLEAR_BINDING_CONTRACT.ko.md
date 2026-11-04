# Moodle 설치 플러그인 → CLEAR 읽기 초안 연결 계약

2026-11-04 검토안. 기준 develop `a5653d64b939da9a1ededc85744d30b91c759f8f`. 단일 허용 기관, 단일 Moodle 설치·강좌, 해당 강좌에 활성 등록된 한 학생과 그 학생이 소유한 기존 CLEAR 신청 하나를 연결한다. 아래 이름은 제안된 계약이다. 권한 리뷰를 통과한 다음 구현한다.

## 기존 경계

- `src/bootcamp/http.mjs`는 CLEAR same-origin, 단일 `__Host-clear-session`, 지갑·체인 헤더와 쓰기 CSRF를 검사한다. `src/application/service.mjs`의 `authorizeWorkflow`는 만료·폐기·현재 역할을 확인한다. 요청 JSON에서 wallet/role을 취하지 않는다. 신규 연결 요청은 participant 역할과 기존 신청 소유권을 서버에서 재검증한다.
- `src/bootcamp/store.mjs`의 일반 `access()`는 읽기에서도 clock/refresh를 실행한다. 연결과 초안 조회에는 이를 호출하지 않고 기존 인증을 통과한 별도의 최소 읽기 projection을 제안한다. 이 projection에는 신청 ID, 소유 지갑 비교 결과, participant/course refs, 신청 상태 및 권한 관련 revision만 포함한다.
- `src/review-evidence/moodle/bootcamp-client.mjs`는 loopback 고정 reader다. `bootcamp.mjs`는 고정 P0 정책, course/target pin, `participantMapping`, Moodle 서비스가 보고한 reader 계정의 일치를 검사한다. 플러그인 연결 확인서를 이 제품 evidence 입력으로 변환하지 않는다. 활동·과제·회고를 읽을 때도 서버가 확인한 단일 계정/강좌/대상으로 제한한다.
- 활성 등록만으로 학생 권한이 성립하지 않는다. Moodle은 교사도 enrolled로 취급하므로, 플러그인 서버에서 활성 등록과 설치별 승인된 학생 capability를 함께 검사하고 게스트·중지·삭제 계정을 제외한다. [Moodle 4.5 Enrolment API](https://moodledev.io/docs/4.5/apis/subsystems/enrol) · [Access API](https://moodledev.io/docs/4.5/apis/subsystems/access)

## 제안 흐름

1. **CLEAR 시작.** 인증된 participant가 자기 기존 신청에서 시작한다. 서버는 신청과 사전 허용 설치·기관·강좌 매핑을 찾고, 32바이트 난수 `attemptRef`를 생성한다. 등록된 Moodle/CLEAR origin 쌍과 CLEAR 배포 audience, 신청/participant/지갑/체인/세션, 매핑 revision을 서버에 고정한다. 같은 신청의 기존 pending은 같은 트랜잭션에서 무효화한다. 요청은 현재 신청 소유자가 해당 연결을 시작했다는 의사를 표시한다.
2. **Moodle 확인.** 등록된 플러그인의 고정 경로에서 학생 본인의 Moodle 세션, course context, 활성 등록, 학생 capability를 확인한다. 연결 대상과 현재 Moodle 계정을 학생에게 표시하고 명시적으로 확인받는다. browser POST에는 Moodle sesskey를 요구한다. 플러그인은 브라우저가 보낸 학생 ID·기관·강좌 값을 권한 판단에 사용하지 않는다. CLEAR 시도 정보는 등록된 서버 대 서버 채널에서만 확인한다. 타 계정으로 바뀌면 다시 확인한다.
3. **CLEAR 확인 및 소비.** 브라우저는 CLEAR 고정 경로로 돌아와 기존 세션의 same-origin POST를 실행한다. CLEAR는 등록된 고정 Moodle HTTPS 주소로 서버 조회를 보내며 상호 인증(제안 mTLS, 배포별 credential), 시간/크기 제한 및 redirect 거부를 적용한다. 플러그인은 확인된 시도와 함께 현재 계정·활성 등록을 다시 확인한다. CLEAR는 계정·강좌의 서버 응답을 연결 미리보기로 표시하고, 같은 세션의 별도 완료 POST에서 현재 응답의 지문과 직전 확인을 비교한 뒤 소비한다. 외부 요청 동안 DB 락을 잡지 않는다. 최종 DB 트랜잭션에서 세션·소유권·권한 revision·시도 상태·만료·매핑을 재검사하고, 유일 제약과 CAS를 적용해 시도 소비 및 바인딩 저장을 함께 커밋한다.
4. **초안 조회.** 연결 참조는 접근권한으로 쓰지 않는다. 매 요청에서 현재 CLEAR 세션/소유권과 현재 바인딩 revision, 단일 설치/강좌/학생의 활성 등록 및 고정 대상 scope를 검사한다. Moodle 실패, 지연 후 권한 변경, 기관 설정 변경 또는 불일치는 보류한다. 응답 직전에 현재 접근을 재확인한다. 반환값은 읽기 초안으로 한정한다.

이중 확인은 두 인증 계정에 대한 통제와 연결 의사를 묶는다. 법적 동일인·기관이 보장한 실제 신원을 주장하지 않는다. 동일인 보장이 필요한 경우 기관의 기존 명부 식별자 결합 및 별도 리뷰가 선행되어야 한다. 전달된 링크만으로 완료할 수 없어야 하며, 계정 혼동·오연결 및 강제 연결은 권한 리뷰의 필수 시나리오다.

## 제안 DTO

키를 정확히 제한한다. 식별자는 고정 형식 opaque 문자열, revision과 시간은 안전 정수, 시간은 서버 UTC epoch seconds, 만료 상한은 exclusive다. 브라우저 POST는 기존 JSON 크기 제한과 no-store를 적용한다. 브라우저 응답·URL·로그에는 CLEAR 토큰/CSRF, Moodle token/sesskey, 학생 숫자 ID, 전체 LMS 레코드를 남기지 않는다. 시도 참조는 브라우저 form body로만 전달하며 로그에서 제거한다. 외부 redirect URL은 서버에 등록한 상수로 고정한다.

| 방향 | 계약 v1 | 필드 및 규칙 |
| --- | --- | --- |
| CLEAR browser → CLEAR 시작 | `clear-moodle-start.1` | 신청 ID는 경로, JSON `{version}`. 서버 응답 `{version,attemptRef,expiresAtExclusive}`. 임의 site/URL/course/user/wallet 필드 거부. |
| Moodle server ↔ CLEAR server | `clear-moodle-attempt.1` | lookup 요청 `{version,attemptRef}`. 응답 `{version,attemptRef,installationRef,courseRef,audience,bindingScopeHash,expiresAtExclusive}`. 서버가 고정된 설치 인증과 범위를 먼저 대조. |
| CLEAR server ↔ Moodle server | `clear-moodle-confirmation.1` | lookup 요청 `{version,attemptRef,bindingScopeHash}`. 응답 `{version,attemptRef,installationRef,courseRef,subjectRef,audience,bindingScopeHash,confirmationRef,confirmedAt,checkedAt,expiresAtExclusive}`. 해당 설치·강좌에 한정된 `subjectRef`는 Moodle 서버가 부여한 안정적인 가명. 로컬 학생 ID 매핑은 Moodle 서버에만 둔다. `confirmationRef`는 시도마다 하나이며, 반복 조회는 동일 확인을 읽고 새 확인을 만들지 않는다. |
| CLEAR browser ↔ CLEAR 미리보기 | `clear-moodle-confirm-preview.1` | same-origin POST `{version,attemptRef}`. 응답 `{version,attemptRef,installationRef,courseRef,accountHint,confirmationDigest,expiresAtExclusive}`. accountHint는 Moodle에서 확인한 최소 표시용 마스킹 값이며 저장·로그 대상에서 제외. 미리보기만으로 소비하지 않는다. |
| CLEAR browser → CLEAR 완료 | `clear-moodle-complete.1` | JSON `{version,attemptRef,confirmationDigest}`. digest는 서버 생성 미리보기의 시도/설치/강좌/subject/확인 지문이며 인증 수단이 아니다. 응답 `{version,bindingRef,status,bindingRevision,expiresAtExclusive}`. |
| CLEAR → CLEAR browser 초안 | `clear-moodle-read-preview.1` | `{version,applicationId,bindingRef,bindingRevision,scope:'READ_PREVIEW',sourceStatus,observedAt,expiresAtExclusive,observations,automaticEligibility:false,paymentAllowed:false}`. 관측 항목은 고정 논리 ID, 상태, 원천 확인 시각으로 제한. AI·정책 확정·원문 제공은 별도 경계. |

`bindingScopeHash`는 버전 도메인, 무작위 시도, CLEAR 배포/설치/기관/강좌와 서버가 저장한 신청 컨텍스트를 결합한 지문이다. 완료 단계에서 재조회할 때 `checkedAt`은 바뀔 수 있으므로 확인 지문에는 넣지 않고 현재성을 별도 검사한다. stable confirmationRef와 subject 등이 달라지면 새 미리보기가 필요하다. 브라우저가 제출하는 digest나 ref는 인증에 쓰지 않는다. Moodle 플러그인 lookup의 조회 및 현재성 semantics는 C 담당과 합의해야 한다. 첫 승인 범위에서 기존 Moodle token reader에 임의 endpoint/token을 주입하지 않는다.

## 수명 및 거부

- 시도는 발급 기준 최대 120초, 연결 lease는 최대 300초를 제안한다. 실제 값은 운영 승인 대상이다. 시도 만료는 CLEAR 세션, 사전 매핑, 설치 확인의 더 이른 만료를 상한으로 한다. CLEAR의 현재 시각과 Moodle의 확인·조회 시각을 검증한다. 미래 시각, 역행, 허용 오차 초과, 정확히 만료 시각 도달은 모두 거부한다. 이미 확인한 Moodle proof는 완료 직전에 다시 조회한다.
- 시도 상태 `PENDING → CONSUMED`, 또는 `PENDING → EXPIRED/REVOKED`. 한번 소비한 요청에는 성공을 재실행하거나 바인딩을 재발급하지 않는다. 연결 응답을 잃으면 본인 상태 조회로 복구한다. 저장소 재시작 뒤에도 같은 시도를 다시 사용할 수 없어야 한다. DB 예외로 소비와 바인딩이 함께 롤백됐을 때만 동일한 미소비·미만료 시도를 재검토한다.
- 바인딩은 신청 하나당 활성 1건, `(installationRef,courseRef,subjectRef)`당 활성 1건을 유일 제약으로 보호한다. 자동 덮어쓰기나 다른 신청으로의 이전을 허용하지 않는다. 로그아웃, 계정·체인 변경, 신청 종료, 기관 또는 강좌 매핑 개정, 학생 등록 정지/삭제는 즉시 읽기 접근 차단 또는 재검토를 유발한다. 기존 시도나 바인딩을 새 CLEAR 세션으로 이월하지 않는다.
- 오류는 인증 실패 401, 소유권/범위 위반 403 또는 대상 유무를 숨기는 동일 404, 권한 있는 본인의 소비·충돌 409, 만료 410, Moodle 현재성 확인 실패 503으로 제한한다. 등록 타인/타 신청/다른 Moodle 계정의 상태나 존재는 응답에 노출하지 않는다. 로그에는 오류 범주 및 허용 opaque 추적 ID만 기록한다.
- 영속 상태와 확인 지문은 별도 스토어에 보관한다. 감사 보존 기간 및 폐기 정책은 기관과 확정한다. 쓰기 트랜잭션을 product ledger, consent, settlement transaction과 공유하지 않는다. 읽기 초안은 고정 네 조건의 제품 신청, evidence head, 원장, 서명, 동의, 금고/100 TEST를 변경할 수 없다.

## 변경 경로와 구현 전 승인

| 소유자 | 검토할 변경 경로 |
| --- | --- |
| B / 서버 연결 | 신규 `src/agent-preview/moodle-binding/`에 엄격 DTO, 단일 설치 verifier, lease 및 저장소 인터페이스. 기존 공개 합성 모듈과 분리. |
| C / 플러그인 | 별도 PHP 구현에서 로그인/sesskey/course context, 승인 학생 capability, 시도 확인과 고정 서버 lookup. DTO와 오류 분류만 공유. |
| 본부 / 통합 | 별도 서버 호스트 라우트와 읽기 projection, 영속 DB migration/제약, HTTPS/인증서 배포·회전, 운영 설정, 새 테스트 CI. 구체 경로와 소유권을 권한 리뷰 후 확정. A의 PR149/web/지급 파일과 기존 고정 경로는 그대로 인수. |

구현 승인 전 확인할 결정은 설치 인증서의 발급·폐기 주체, Moodle의 learner capability 설정, 사용자 확인 화면의 대상 식별 방법, 연결 철회와 보존 기간, 저장소의 원자성이다. PHP 플러그인과 CLEAR route는 아직 제공되지 않는다.

## 오프라인 검증 인수표

고정 시계·공개 합성 설치/강좌/학생·두 CLEAR 세션, 독립 임시 DB, 네트워크 차단, 가짜 Moodle 서버 verifier를 쓴다. 유효한 서버 확인의 필드 하나씩을 바꾸는 부정 사례를 우선 작성한다. 실제 credential 및 결제 모듈은 fixture에 넣지 않는다.

| 케이스 | 기대 결과 |
| --- | --- |
| 참가자 A, 자기 신청, 같은 세션, 지정 강좌 활성 학생 | 한 바인딩과 소비 1건. preview 범위 및 두 지급 플래그 false. |
| 타인 신청, 운영자, CSRF 누락, 위조 wallet/chain 헤더, Moodle 브라우저 임의 userId | 권한 실패, 소비/연결/원장 쓰기 0. |
| 다른 설치/기관/강좌/subject/audience, scope digest 변경, 무단 server peer, redirect | 권한 실패. 원천 응답 재활용 없음. |
| 활성 등록이지만 교사, 게스트, suspended 또는 등록 철회 | 학생 권한 확인 실패. 새 연결/초안 반환 없음. |
| 같은 지갑 새 세션, 세션 폐기, 신청 종료, 매핑 revision 변경, 느린 Moodle 조회 중 권한 변경 | 최종 검사 실패. 이전 세션 또는 응답으로 연결 불가. |
| 만료 직전/동일/이후, 미래 checkedAt, 시계 역행, 조회 시간초과 | 상한 직전만 조건부 허용, 나머지 만료 또는 확인 실패. |
| 같은 ref 동시 완료, 별개 시도로 같은 Moodle 학생을 타 신청에 연결, 서버 재시작 후 재사용 | CAS/유일 제약 승자 최대 1. 나머지는 실패. |
| DB commit 실패와 응답 유실 | 부분 바인딩 없음. 이미 커밋된 시도는 본인 조회로 복구하며 다시 소비하지 않음. |
| 보존 한계와 read-only 경계 | 브라우저/로그에 raw ID·token·sesskey 없음. 스파이로 P0 evidence/decision/consent/vault 호출 0, product ledger 지문 전후 동일. |

이 표는 구현 이후 실행할 테스트 사양이다. 실제 Moodle·CLEAR 로그인, 서명, 유료 모델 호출, DB 바인딩 및 지급 실측 증거는 포함하지 않는다.
