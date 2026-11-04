# Moodle 설치 플러그인 → CLEAR 읽기 초안 연결 계약

2026-11-04 검토안. 기준 develop `a5653d64b939da9a1ededc85744d30b91c759f8f`. 단일 허용 기관, 단일 Moodle 설치·강좌, 해당 강좌에 활성 등록된 한 학생과 그 학생이 소유한 기존 CLEAR 신청 하나를 연결한다. 아래 이름은 제안된 계약이다. 2026-11-04 사전 권한 리뷰와 저장소 결정 revision 3을 반영했다. 구체 기술 선택·합성 DB 증거·소유권은 [구현 결정안](MOODLE_BINDING_IMPLEMENTATION_DECISIONS.ko.md)을 따른다. 본부는 READ_PREVIEW/OBSERVED_AT 및 기존 지급 경로 분리를 수용했다. 실제 연결 구현은 본부 교차 리뷰와 C의 세션/snapshot 인수 뒤 승인한다. 이 문서는 실행 검증이나 구현 승인 완료를 뜻하지 않는다.

## 기존 경계

- `src/bootcamp/http.mjs`는 CLEAR same-origin, 단일 `__Host-clear-session`, 지갑·체인 헤더와 쓰기 CSRF를 검사한다. `src/application/service.mjs`의 `authorizeWorkflow`는 만료·폐기·현재 역할을 확인한다. 요청 JSON에서 wallet/role을 취하지 않는다. 신규 연결 요청은 participant 역할과 기존 신청 소유권을 서버에서 재검증한다.
- `src/bootcamp/store.mjs`의 일반 `access()`는 읽기에서도 clock/refresh를 실행한다. 연결과 초안 조회에는 이를 호출하지 않고 기존 인증을 통과한 별도의 최소 읽기 projection을 제안한다. 이 projection에는 신청 ID, 소유 지갑 비교 결과, participant/course refs, 신청 상태 및 권한 관련 revision만 포함한다.
- `src/review-evidence/moodle/bootcamp-client.mjs`는 loopback 고정 reader다. `bootcamp.mjs`는 고정 P0 정책, course/target pin, `participantMapping`, Moodle 서비스가 보고한 reader 계정의 일치를 검사한다. 플러그인 연결 확인서를 이 제품 evidence 입력으로 변환하지 않는다. 활동·과제·회고를 읽을 때도 서버가 확인한 단일 계정/강좌/대상으로 제한한다.
- 활성 등록만으로 학생 권한이 성립하지 않는다. Moodle은 교사도 enrolled로 취급하므로, 플러그인 서버에서 활성 등록과 설치별 승인된 학생 capability를 함께 검사하고 게스트·중지·삭제 계정을 제외한다. [Moodle 4.5 Enrolment API](https://moodledev.io/docs/4.5/apis/subsystems/enrol) · [Access API](https://moodledev.io/docs/4.5/apis/subsystems/access)

합성 구현: [독립 모듈 인수](MOODLE_BINDING_SYNTHETIC_MODULE.ko.md). 실제 verifier는 DISABLED이며 기존 제품 auth/workflow/HTTP는 미연결이다.

## 제안 흐름

1. **CLEAR 시작.** 인증된 participant가 자기 기존 신청에서 시작한다. 서버는 신청과 사전 허용 설치·기관·강좌 매핑을 찾고, 32바이트 난수 `attemptRef`를 생성한다. 등록된 Moodle/CLEAR origin 쌍과 CLEAR 배포 audience, 신청/participant/지갑/체인/세션, 매핑 revision을 서버에 고정한다. 기관이 별도 확인한 명부 결합에서 expectedSubjectRef와 rosterRevision을 읽어 고정한다. 이 결합이 없으면 연결을 시작하지 않는다. 같은 신청의 기존 pending은 같은 트랜잭션에서 무효화한다. 요청은 현재 신청 소유자가 해당 연결을 시작했다는 의사를 표시한다.
2. **Moodle 확인.** 등록된 플러그인의 고정 경로에서 학생 본인의 Moodle 세션, course context, 활성 등록, 학생 capability를 확인한다. 연결 대상과 현재 Moodle 계정을 학생에게 표시하고 명시적으로 확인받는다. browser POST에는 Moodle sesskey를 요구한다. 플러그인은 브라우저가 보낸 학생 ID·기관·강좌 값을 권한 판단에 사용하지 않는다. CLEAR 시도 정보는 등록된 서버 대 서버 채널에서만 확인한다. 확인한 Moodle 세션 generation과 계정·학생 capability를 confirmation에 결합한다. 계정 전환, 로그아웃, 세션 폐기 또는 generation 변경 시 확인을 폐기한다. 연결할 subject는 CLEAR가 고정한 expectedSubjectRef와 같아야 한다.
3. **CLEAR 확인 및 소비.** 브라우저는 CLEAR 고정 경로로 돌아와 기존 세션의 same-origin POST를 실행한다. CLEAR는 등록된 고정 Moodle HTTPS 주소로 서버 조회를 보내며 상호 인증(제안 mTLS, 배포별 credential), 시간/크기 제한 및 redirect 거부를 적용한다. 플러그인은 서버에 저장한 확인 계정·세션 generation·활성 등록·capability를 하나의 원천 스냅샷으로 다시 확인한다. 서버 조회에 브라우저 세션이 자동 전달된다고 가정하지 않는다. CLEAR는 계정·강좌의 서버 응답을 연결 미리보기로 표시하고, 같은 세션의 별도 완료 POST에서 현재 응답의 지문과 직전 확인을 비교한 뒤 소비한다. 외부 요청 동안 DB 락을 잡지 않는다. 최종 DB 트랜잭션에서 세션·소유권·권한 revision·시도 상태·만료·매핑·명부 결합·설치 trustEpoch를 재검사하고, 유일 제약과 CAS를 적용해 시도 소비 및 OBSERVED_ONLY 바인딩 저장을 함께 커밋한다. 원천 등록 철회의 시점 보장은 아래 경쟁 조건 절을 따른다.
4. **초안 조회.** 연결 참조는 접근권한으로 쓰지 않는다. 매 요청에서 현재 CLEAR 세션/소유권과 바인딩·명부·trust revision을 검사한다. Moodle은 지정 학생의 세션 확인 유효성, 활성 등록, 학생 capability 및 허용 대상 관측을 같은 스냅샷에서 읽는다. 과거 바인딩 확인을 새 관측의 권한으로 재사용하지 않는다. Moodle 실패, 지연 후 권한 변경, 기관 설정 변경 또는 불일치는 보류한다. 응답 직전에 현재 접근을 재확인한다. 반환값은 읽기 초안으로 한정한다.

이중 확인만으로 relay를 막을 수 없다. 공격자가 자기 CLEAR 시도를 피해자에게 전달하고 피해자가 Moodle 확인을 누르면, 공격자는 자기 CLEAR 세션에서 완료할 수 있다. 따라서 기관이 사전에 확인한 participant↔설치·강좌·subject 명부 결합을 필수로 한다. 이메일 문자열, 표시 이름, 브라우저 userId, 이번 연결 요청 자체로 이 결합을 만들거나 갱신하지 않는다. subjectRef는 계정 삭제 후 다른 사람에게 재할당하지 않는다. 명부 결합의 출처·관리 권한·수정 이력과 rosterRevision은 구현 결정안의 signed roster 및 독립 CLEAR 승인 절차로 관리한다. 실제 명부와 승인은 아직 제공된 것으로 간주하지 않는다. 마스킹된 계정 표시는 사용자 확인을 보조하며 서버 매칭을 대체하지 않는다.

## 제안 DTO

키를 정확히 제한한다. 식별자는 고정 형식 opaque 문자열, revision과 시간은 안전 정수, 시간은 서버 UTC epoch seconds, 만료 상한은 exclusive다. 브라우저 POST는 기존 JSON 크기 제한과 no-store를 적용한다. 브라우저 응답·URL·로그에는 원천 token, 학생 숫자 ID, 전체 LMS 레코드를 URL·로그·DTO에 남기지 않는다. CLEAR CSRF와 Moodle sesskey는 각각 자기 origin의 보호된 세션/form에서만 사용하며 타 origin 및 신규 연결 DTO에 복사하지 않는다. 시도 참조는 브라우저 form body로만 전달하며 로그에서 제거한다. 외부 redirect URL은 서버에 등록한 상수로 고정한다.

| 방향 | 계약 revision 3 | 필드 및 규칙 |
| --- | --- | --- |
| CLEAR browser → CLEAR 시작 | `clear-moodle-start.3` | 신청 ID는 경로, JSON `{version}`. 서버 응답 `{version,attemptRef,expiresAtExclusive}`. 임의 site/URL/course/user/wallet 필드 거부. |
| Moodle server ↔ CLEAR server | `clear-moodle-attempt.3` | lookup 요청 `{version,attemptRef,requestRef}`. 응답 `{version,attemptRef,requestRef,installationRef,courseRef,audience,bindingScopeHash,expectedSubjectRef,rosterRevision,trustEpoch,issuerEpoch,expiresAtExclusive}`. 서버가 고정된 설치 인증과 범위를 먼저 대조. |
| CLEAR server ↔ Moodle server | `clear-moodle-confirmation.3` | lookup 요청 `{version,attemptRef,bindingScopeHash,issuerEpoch,requestRef}`. 응답 `{version,attemptRef,requestRef,installationRef,courseRef,subjectRef,accountHint,audience,bindingScopeHash,confirmationRef,moodleSessionGeneration,enrolmentRevision,rosterRevision,trustEpoch,issuerEpoch,confirmedAt,observedAt,checkedAt,expiresAtExclusive}`. 해당 설치·강좌에 한정된 `subjectRef`는 Moodle 서버가 부여한 안정적인 가명. 로컬 학생 ID 매핑은 Moodle 서버에만 둔다. `confirmationRef`는 시도마다 하나이며, 반복 조회는 동일 확인을 읽고 새 확인을 만들지 않는다. |
| CLEAR browser ↔ CLEAR 미리보기 | `clear-moodle-confirm-preview.3` | same-origin POST `{version,attemptRef}`. 응답 `{version,attemptRef,installationRef,courseRef,accountHint,confirmationDigest,expiresAtExclusive}`. accountHint는 Moodle에서 확인한 최소 표시용 마스킹 값이며 저장·로그 대상에서 제외. 미리보기만으로 소비하지 않는다. |
| CLEAR browser → CLEAR 완료 | `clear-moodle-complete.3` | JSON `{version,attemptRef,confirmationDigest}`. digest는 서버 생성 미리보기의 시도/설치/강좌/subject/확인 지문이며 인증 수단이 아니다. 응답 `{version,bindingRef,status,bindingRevision,expiresAtExclusive}`. |
| CLEAR server ↔ Moodle server 관측 | `clear-moodle-observations.3` | 요청 `{version,requestRef,issuerEpoch,bindingScopeHash,confirmationRef}`. 응답 `{version,requestRef,installationRef,courseRef,subjectRef,audience,issuerEpoch,trustEpoch,rosterRevision,bindingScopeHash,confirmationRef,moodleSessionGeneration,enrolmentRevision,scope:'READ_PREVIEW',sourceStatus:'OBSERVED_AT',observedAt,checkedAt,expiresAtExclusive,observations}`. 학생/자료 대상은 서버 confirmation 및 설치 allowlist에서 결정하고 요청 userId/URL을 받지 않는다. |
| CLEAR → CLEAR browser 초안 | `clear-moodle-read-preview.3` | `{version,applicationId,bindingRef,bindingRevision,scope:'READ_PREVIEW',sourceStatus:'OBSERVED_AT',enrolmentRevision,observedAt,expiresAtExclusive,observations,automaticEligibility:false,paymentAllowed:false}`. 관측 항목은 고정 논리 ID, 상태, 원천 확인 시각으로 제한. AI·정책 확정·원문 제공은 별도 경계. |

confirmation 및 observations의 observedAt은 이번 server 요청 수락 뒤 새 snapshot을 획득한 시점이다. checkedAt은 그 snapshot의 검사 종료 시각이며 observedAt 이상이어야 한다. 두 값 모두 승인 오차를 적용한 이번 요청 구간 및 최대 관측 나이/expiry 안에 있어야 한다. 예전 snapshot에 새 requestRef/checkedAt만 붙이는 것은 거부한다.

server observations 항목은 `{targetRef,status,observedAt}`이며 status는 `COMPLETE/INCOMPLETE/UNKNOWN/INACCESSIBLE` 중 하나다. targetRef는 설치 승인 allowlist에 있고 중복 없이 개수 상한을 적용한다. 학생 권한 실패는 부분 자료 대신 전체 거부이며 원문·자유 텍스트를 반환하지 않는다. 원천별 상태 변환은 C와 본부가 승인 대상 목록에 고정한다.

`bindingScopeHash`는 버전 도메인, 무작위 시도, CLEAR 배포/설치/기관/강좌와 서버가 저장한 신청 컨텍스트, expectedSubjectRef, rosterRevision, trustEpoch, issuerEpoch, 로컬 authorityRevision을 결합한 지문이다. server lookup의 requestRef는 매 호출의 새 난수이며 exact echo를 확인한다. requestRef/checkedAt은 호출 현재성을 검증하고 안정적인 confirmationDigest에는 포함하지 않는다. `.2`와 `.3`는 상호 대체하지 않는다. 완료 단계에서 재조회할 때 `checkedAt`은 바뀔 수 있으므로 확인 지문에는 넣지 않고 현재성을 별도 검사한다. confirmationDigest는 bindingScopeHash, confirmationRef, subjectRef, moodleSessionGeneration, enrolmentRevision을 도메인 분리된 정규 직렬화로 묶는다. 이 중 하나라도 달라지면 새 미리보기가 필요하다. accountHint는 등록된 가명으로 Moodle이 조회한 제한 길이의 표시 문자열이며 HTML로 해석하지 않는다. 브라우저가 제출하는 digest나 ref는 인증에 쓰지 않는다. Moodle 플러그인 lookup의 조회 및 현재성 semantics는 C 담당과 합의해야 한다. 첫 승인 범위에서 기존 Moodle token reader에 임의 endpoint/token을 주입하지 않는다.

## 수명 및 거부

- 시도는 발급 기준 최대 120초, 연결 lease는 최대 300초를 제안한다. 실제 값은 운영 승인 대상이다. 시도 만료는 CLEAR 세션, 사전 매핑, 설치 확인의 더 이른 만료를 상한으로 한다. CLEAR의 현재 시각과 Moodle의 확인·조회 시각을 검증한다. 허용 오차 밖의 미래 시각, 역행, 정확히 만료 시각 도달은 모두 거부한다. 오차 안의 미래 시각도 구현 결정안에 따라 잔여 수명을 보수적으로 줄인다. 이미 확인한 Moodle proof는 완료 직전에 다시 조회한다.
- 시도 상태 `PENDING → CONSUMED`, 또는 `PENDING → EXPIRED/REVOKED`. 한번 소비한 요청에는 성공을 재실행하거나 바인딩을 재발급하지 않는다. 연결 응답을 잃으면 본인 상태 조회로 복구한다. 저장소 재시작 뒤에도 같은 시도를 다시 사용할 수 없어야 한다. DB 예외로 소비와 바인딩이 함께 롤백됐을 때만 동일한 미소비·미만료 시도를 재검토한다.
- 바인딩은 신청 하나당 활성 1건, `(installationRef,courseRef,subjectRef)`당 활성 1건을 유일 제약으로 보호한다. 자동 덮어쓰기나 다른 신청으로의 이전을 허용하지 않는다. CLEAR에서 확인 가능한 로그아웃, 계정·체인 변경, 신청 종료, 기관/강좌/명부/trust revision 변경은 다음 권한 검사에서 거부한다. Moodle 등록 정지·삭제의 관측 경계는 아래 원천 스냅샷 규칙을 적용한다. 기존 시도나 바인딩을 새 CLEAR 세션으로 이월하지 않는다.
- 오류는 인증 실패 401, 소유권/범위 위반 403 또는 대상 유무를 숨기는 동일 404, 권한 있는 본인의 소비·충돌 409, 만료 410, Moodle 현재성 확인 실패 503으로 제한한다. 등록 타인/타 신청/다른 Moodle 계정의 상태나 존재는 응답에 노출하지 않는다. 로그에는 오류 범주 및 허용 opaque 추적 ID만 기록한다.
- 영속 상태와 확인 지문은 별도 스토어에 보관한다. 아래 보존·복구 상한을 적용하며 기관 승인 전 배포하지 않는다. 쓰기 트랜잭션을 product ledger, consent, settlement transaction과 공유하지 않는다. 읽기 초안은 고정 네 조건의 제품 신청, evidence head, 원장, 서명, 동의, 금고/100 TEST를 변경할 수 없다.

## 사전 권한 리뷰와 구현 관문

cde930f 초안에 대해 다음 공격을 검토했다. 아래 결과는 계약 수준의 추론과 기존 인증 코드 대조이며, 구현된 서버를 공격한 실측 결과가 아니다.

| 우선순위 / 공격 | 초안의 공백 | revision 2 요구 및 판정 |
| --- | --- | --- |
| P1 / 공격자가 자기 시도를 피해자 Moodle에 전달 | 두 origin의 CSRF와 이중 확인은 서로 다른 사람이 각 계정을 조작하는 relay를 허용한다. | 사전에 확인한 expectedSubjectRef/rosterRevision 필수. 다른 학생 응답은 Moodle 확인 및 CLEAR 소비 모두 거부. 명부 결합 준비 전 구현 승인 보류. |
| P1 / 승인한 뒤 Moodle 로그아웃 또는 계정 변경 | 서버 lookup에 브라우저의 현재 계정이 자동으로 따라오지 않는다. | 서버에 저장한 confirmation의 세션 generation을 조회 시 검사. 이미 발행한 확인을 새 세션에 옮기지 않음. 플러그인 session backend에서 검증하는 방법을 C가 인수해야 한다. |
| P1 / 폐기 인증서와 오래 열린 TLS 연결 재사용 | mTLS 사용만으로 설치 범위·교체·즉시 폐기가 정해지지 않는다. | 매 요청과 CLEAR 최종 커밋에서 활성 trustEpoch/peer 허용 상태 검사. 인증서 소유만으로 임의 설치 또는 강좌 접근 불가. |
| P1 / Moodle 재조회 직후 등록 철회 | 원격 확인 이후 CLEAR 소비까지 두 DB 사이의 원자성이 없다. | 바인딩은 OBSERVED_ONLY 메타데이터. 학생 자료는 매 조회의 Moodle 권한·원천 스냅샷으로만 반환. 소비 순간의 원격 권한 보장을 요구하면 별도 조정 프로토콜 리뷰 전 차단. |
| P1 / 동시 완료, 새 시도와 구 시도의 경합, 로그아웃과 커밋 교차 | 사전 검사나 프로세스 내부 lock만으로 다중 worker와 별도 인증 DB를 보호하지 못한다. | DB CAS·두 활성 유일 제약 및 CLEAR 권한 변경과 소비의 직렬화 필요. auth/app DB와 binding DB의 조정 방식을 먼저 확정. |
| P2 / 백업 복구·시계 역행으로 소비 nonce 부활 | 저장소 재시작 거부만으로 복구된 과거 상태를 막지 못한다. | 복구 후 서비스 재개 전 외부 유지 trust/issuer epoch를 바꾸고 모든 기존 lease/시도를 거부. 만료 watermark와 최소 tombstone 유지. |
| P1 / 초안 바인딩을 제품 receipt 또는 지급 조건으로 승격 | boolean 표시만으로 제품 adapter 오인수를 방지하지 못한다. | 별도 DTO 도메인과 스토어·의존 경계, 제품 Evidence/동의/금고 입력 경로의 거부 테스트. |

### 설치 인증서의 신뢰 수명

기관 운영 담당과 CLEAR 배포 담당이 설치를 별도 경로로 확인한 뒤 양쪽 registry에 installationRef, 정확한 HTTPS origin/path/port, CLEAR audience, courseRef, 양방향 peer 인증서 식별자, trustEpoch, validFrom/validUntil, 상태를 고정한다. 등록·교체·폐기는 학생 시도 API에서 수행할 수 없다. 개인키는 각 서버 secret 저장소에서 생성·관리하며 DTO/브라우저/로그에 보내지 않는다. 발급기관만 같거나 인증서 chain만 유효한 다른 설치는 거부한다. TLS hostname/chain/유효기간 검사와 설치별 허용 peer 검사를 모두 적용한다.

새 키는 검증 후 registry revision을 올려 활성화한다. 기본은 새 시도부터 새 epoch만 수락하며 구 epoch의 pending·confirmation·바인딩은 무효화한다. 무중단 overlap이 필요하면 기간·대상 key·폐기 기준을 따로 승인한다. 침해·폐기 시 registry의 DISABLED 상태를 먼저 적용하고 열린 연결·TLS 재개 세션에도 요청마다 적용한다. 동일 epoch에서 폐기된 peer를 fallback으로 다시 허용하지 않는다. registry 조회 불가 또는 오래된 캐시이면 차단한다. TLS 종료 proxy를 쓰는 경우 검증된 내부 채널로만 peer identity를 전달하고 외부 요청의 동명 헤더는 제거한다. proxy 신뢰 설정과 내부 직접 접근 차단이 검증되지 않으면 배포하지 않는다.

### 등록 철회와 소비의 관측 경계

Moodle의 활성 등록·capability·확인 세션과 허용 대상 자료를 하나의 일관된 스냅샷에서 평가한다. enrolmentRevision은 등록 및 학생 권한에 영향을 주는 모든 레코드 변경을 반영해야 하며, 시간에 따른 등록 시작·종료도 현재 시각으로 평가한다. 등록 철회나 학생 권한 상실이 발생하면 기존 confirmation을 폐기하고, 재등록 후에도 새로운 시도와 사용자 확인을 요구한다. 철회 후 재등록이 마지막 active 값에 가려지지 않도록 변경 generation을 유지한다. epoch/revision을 만들 수 없는 원천은 보류한다. 응답 만료는 등록 종료·Moodle 세션·설치 신뢰의 더 이른 만료를 넘지 않는다.

완료 시 마지막 관측 뒤 등록이 철회되는 interleaving은 원격 시스템 사이에서 여전히 가능하다. 이 경우 소비된 바인딩은 계정 매핑의 관측 기록일 뿐 자료를 읽을 권한을 부여하지 않는다. 이후 자료 조회는 새 Moodle 스냅샷에서 철회를 확인하고 거부한다. 조회 스냅샷 이후에 발생한 철회까지 이미 전송한 응답에서 소급 제거할 수 없으므로 UI/DTO는 OBSERVED_AT과 시각을 표시한다. 원격 조회부터 반환까지의 허용 최대 경과·시계 오차는 운영 파라미터로 명시 승인하며, 설정 누락은 차단한다. 연결 lease 300초를 원천 상태 캐시 유효기간으로 사용하지 않는다. 모든 원격 등록 변경을 CLEAR 소비 순간에 반영한다는 보장은 이 설계에서 제공하지 않는다.

### 원자 소비와 CLEAR 권한 변경

동일 시도의 재전송은 원격 확인을 다시 사용해 성공을 만들 수 없다. 트랜잭션에서 PENDING, 현재 generation, 만료, 예상 digest 및 authority/roster/trust revision을 조건으로 CAS하고 affected rows=1을 확인한다. 시도 소비, binding insert, 활성 유일 제약, 최소 감사 이벤트를 같은 DB 트랜잭션에 둔다. 경쟁에서 진 요청은 모두 롤백한다. 새로운 시도 발급·기존 시도 취소·기존 바인딩 만료 처리도 같은 신청/subject의 직렬화 규칙을 따른다. 두 worker가 사전 검사에 모두 통과한 장벽 시험을 요구한다.

CLEAR 인증 DB에서 세션을 검사한 직후 다른 worker가 로그아웃을 커밋할 수 있다. 따라서 단순한 마지막 authorizeWorkflow 호출만으로 원자성을 주장할 수 없다. 이번 결정은 단일 호스트의 binding DB 연결에 인증/신청 DB를 ATTACH하여 BEGIN IMMEDIATE로 함께 잠그고, 같은 연결의 최소 SELECT와 main-only CAS를 실행하는 것이다. 명부/trust/preview 역할 정책도 main DB의 revision CAS로 직렬화한다. SQL authorizer로 인증/신청 DB 쓰기를 거부한다. 상세 부팅·역할 config 지문·lock 순서와 9건 합성 실험은 구현 결정안을 따른다. 로컬 JS 단일 프로세스나 서로 다른 DB의 독립 revision 값만으로 충분하다고 간주하지 않는다. 종료·철회가 먼저 선형화되면 소비 실패, 소비가 먼저면 이후 접근은 종료·철회로 거부하는 순서를 검증한다. 기존 product access()를 가져와 이 문제를 해결하려 하면 refresh와 지급 관련 상태 변화가 섞이므로 구현 전 재검토한다.

### 저장과 복구

운영 제안은 pending 시도 최대 120초, 연결 메타데이터 lease 최대 300초이며 만료 후 조회 권한은 즉시 사라진다. 계정·세션 결합과 confirmation 메타데이터는 만료 후 다음 정리에서 제거하고 정상 가동 중 24시간을 초과해 남기지 않는다. 중단 후 재시작은 정리와 만료 watermark 확인을 끝낸 뒤 요청을 받는다. 24시간 정리는 보안상 접근 만료를 연장하지 않는다. 원천 자료와 표시용 accountHint는 응답 범위 메모리에서만 처리한다.

최소 재사용 차단 레코드는 attempt digest, issuerEpoch, 소비 상태/시각 및 원래 만료만 저장한다. 정상 경로에서는 원래 최대 시도 수명과 승인 시계 오차가 지나기 전에 제거하지 않는다. 삭제된 시도는 알 수 없는 시도로 거부하며 클라이언트 정보로 재생성하지 않는다. 재사용되는 ref를 발급하지 않고 모든 조회는 서버가 발행한 현재 레코드를 요구한다. 백업/복제본 복구로 소비 상태가 되돌아간 경우 신규 epoch 활성화와 기존 바인딩 무효화 전 서비스 재개를 차단한다. 이 epoch는 복구 대상 DB와 함께 되돌아가면 안 된다.

감사 보존은 계정 식별자를 뺀 오류 범주·설치 ref·비가역 추적 ref 중심으로 제한하며 구체 기간과 백업 삭제는 기관 승인을 받아야 한다. 세션 token 대신 서버 내부 세션 참조나 도메인 분리 HMAC을 쓰고 raw token/학생 숫자 ID/연결 확인 본문을 기록하지 않는다. 명부 매핑은 별도 관리 테이블의 승인된 자료이며 단기 binding 행에는 필요한 subject/revision 참조만 저장한다. 같은 main DB에 관리 테이블을 두어 활성 revision과 소비를 직렬화하되 원본 명부 파일을 복제하지 않는다. 제안 상한과 복구 정책이 확정되기 전 운영 활성화는 보류한다.

### 읽기 초안의 권한 분리

바인딩 서버 포트에는 등록된 읽기 projection과 고정 Moodle 조회만 연결한다. 계약/함수/저장소 이름과 해시 도메인에 READ_PREVIEW를 구분하고 범용 callable tool 또는 producer/write/settlement callback을 받지 않는다. paymentAllowed=false 같은 클라이언트 필드를 보안 통제로 삼지 않는다. 제품 고정 정책과 Evidence·동의 수락기가 이 preview 버전/receipt를 거부해야 하며 원본 기록을 제품 DTO로 재포장하는 자동 bridge는 이 범위에 없다. 경계 시험에서 preview 조회 전후 제품 ledger/nonce/evidence/consent의 지문이 같아야 하며 제품 쓰기 포트 호출은 0이어야 한다.

## 변경 경로와 구현 전 승인

| 소유자 | 검토할 변경 경로 |
| --- | --- |
| B / 서버 연결 | 신규 `src/agent-preview/moodle-binding/`에 엄격 DTO, 단일 설치 verifier, lease 및 저장소 인터페이스. 기존 공개 합성 모듈과 분리. |
| C / 플러그인 | 별도 PHP 구현에서 로그인/sesskey/course context, 승인 학생 capability, 시도 확인과 고정 서버 lookup. DTO와 오류 분류만 공유. |
| 본부 / 통합 | 별도 서버 호스트 라우트와 읽기 projection, 영속 DB migration/제약, HTTPS/인증서 배포·회전, 운영 설정, 새 테스트 CI. 구체 경로와 소유권을 권한 리뷰 후 확정. A의 PR149/web/지급 파일과 기존 고정 경로는 그대로 인수. |

명부 관리·설치 registry·CLEAR 직렬화·CAS/유일성·복구 epoch의 기술 결정과 경로별 소유권은 구현 결정안에 정리했다. 본부는 OBSERVED_AT 의미를 수용했다. C의 Moodle 확인 세션 및 원천 snapshot 인수, 본부의 교차 리뷰, 실제 기관 입력/운영 설정은 각각 별도 관문이다. 합성 구현과 실제 연결 활성화를 구분해 후속 배정한다. 이 계약의 confirmation PHP 경로와 CLEAR route는 아직 제공되지 않는다.

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
| 공격자가 발행한 시도를 다른 등록 학생에게 전달, 이름/이메일만 일치 | 사전 expectedSubjectRef 불일치 또는 결합 부재로 실패. 확인 화면을 양쪽에서 눌러도 우회 불가. |
| Moodle confirmation 후 로그아웃/계정 전환, 브라우저 쿠키 없는 서버 lookup | 서버에 저장한 확인 세션 generation 검증 실패. 클라이언트 주장으로 복구 불가. |
| 인증서 chain은 유효하지만 다른 설치, 구 키 TLS 연결, 폐기 후 커밋 | 설치 peer/epoch 검사 실패. 신뢰 registry 장애와 proxy identity 헤더 위조도 실패. |
| Moodle snapshot 직전 철회 / 직후 철회 | 직전 철회는 연결·자료 조회 거부. 직후 철회는 OBSERVED_ONLY 기록일 수 있으나 다음 자료 조회 거부. 즉시 원격 원자 철회 보장을 시험 결과로 주장하지 않음. |
| 두 프로세스가 동시에 사전 검사 통과 / CLEAR logout이 최종 검사와 commit 사이 발생 | DB 유일 제약/CAS 승자 최대 1, 권한 변경 조정의 선형화 순서에 맞게 소비 또는 거부. 조정 부재면 시험 실패 및 구현 차단. |
| 소비 전 백업 복원, nonce tombstone 삭제, 시간 역행 | 서비스 재개 전 epoch 교체/무효화 또는 차단. 과거 시도 재생성·소비 불가. |
| 보존 한계와 read-only 경계 | 브라우저/로그에 raw ID·token·sesskey 없음. 스파이로 P0 evidence/decision/consent/vault 호출 0, product ledger 지문 전후 동일. |

이 표는 제품 구현 이후 실행할 테스트 사양이다. 별도 합성 DB 기법 실험 9/9 통과는 구현 결정안에 기록했으며 이 전체 인수표 통과를 뜻하지 않는다. 실제 Moodle·CLEAR 로그인, 서명, 유료 모델 호출, 제품 DB 바인딩 및 지급 실측 증거는 포함하지 않는다.
