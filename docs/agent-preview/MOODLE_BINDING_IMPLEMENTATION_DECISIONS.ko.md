# Moodle 읽기 초안 바인딩: 저장소·운영 권한 결정안

후속 상태: C head `26b0bc36`과의 [교차 리뷰](MOODLE_AUTHORITY_CROSS_REVIEW.ko.md)에서 세션 저장/전역 무효화, 로그인 권한 의존성 및 runtime trigger 권한의 추가 수정 조건을 확인했다. 아래 B의 SQLite 결정은 유지하며 실제 Moodle confirmation/학생 자료 연결은 해당 조건 해소 전 보류한다.

2026-11-04, B의 권한 설계 보완. 기준 develop `a5653d64b939da9a1ededc85744d30b91c759f8f`, 입력 계약 head `41186a15fc4187429ceba9c70f290084575b5a2f`. [연결 계약](MOODLE_CLEAR_BINDING_CONTRACT.ko.md) revision 3과 함께 읽는다. 본부가 수용한 `READ_PREVIEW` / `OBSERVED_AT`, 고정 네 조건·100 TEST와의 분리를 전제로 한다. 이 문서는 구현 방식 선택과 합성 DB 실험의 결과이며, 제품 연결·기관 신원 확인·운영 승인을 의미하지 않는다.

## 결정과 실제 코드 근거

| 관문 | 이번 결정 | 확인한 현재 코드 |
| --- | --- | --- |
| CLEAR 로그아웃/신청 변경과 소비 | 단일 호스트에서 binding DB 연결에 auth/app DB를 ATTACH하고 `BEGIN IMMEDIATE`로 함께 잠금. 권한 조회와 소비까지 동기 실행. | `src/application/store.mjs:openStore`, `src/product-workflow/private-db.mjs:openPrivateDb`는 별도 파일, DELETE journal, FULL sync, BEGIN IMMEDIATE. `src/application/service.mjs:logout/login`은 sessions를 같은 auth DB 트랜잭션에서 폐기한다. |
| 역할 설정 변경 | preview 전용 영속 authority policy와 worker 설정 지문을 추가. 메모리 allowlist만으로 승인하지 않음. | `src/application/service.mjs`의 participantSet/operatorSet은 생성 시 고정된 메모리 Set이며 DB metadata에 목록이 없다. |
| 신청 projection | `workflow.applications`의 소유자·상태·participant·mapping·revision만 직접 조회. 기존 access() 미사용. | `src/bootcamp/store.mjs:access`는 읽기에서도 clock/refresh 및 evidence/ledger 변화를 만들 수 있다. `auth.applications`는 별개 서비스의 테이블이므로 부트캠프 신청으로 착각하지 않는다. |
| CAS/유일성 | pending·binding·audit를 한 binding DB에 저장, 조건부 UPDATE 1행 + 두 부분 유일 인덱스. | 아래 별도 프로세스 실험 9건 통과. 제품 schema/route는 미수정. |
| 명부/설치 관리 | 학생 HTTP와 분리된 로컬 관리 CLI, 기관 서명 명부 + 독립 CLEAR 승인 지문, revision CAS, 변경 감사. | 현재 일반 operator 역할과 신규 registry-admin 역할을 공유하지 않도록 신규 인터페이스로 제안. |
| 복구 | 복구 DB 밖의 배포 epoch 원본 + 정지 상태 복구 절차. 모든 관련 DB 복구 시 epoch 갱신·기존 연결 폐기. | 기존 DB 내부 metadata/nonce만으로 백업 롤백을 구별할 수 없어 추가 배포 경계가 필요. |

### 직렬화 구현 순서

신규 coordinator의 `main=preview-binding.sqlite`, 고정 alias `auth=authentication/applications.sqlite`, `workflow=store/bootcamp.sqlite`를 쓴다. 경로는 서버 부팅 manifest에서만 읽고 HTTP 입력을 받지 않는다. 기존 `tools/bootcamp/frontend-dev.mjs` 및 `tools/bootcamp/live-context.mjs`가 auth/store를 분리 생성하는 구조와 맞춘다. 서로 다른 배포·DB 파일을 연결하지 않도록 canonical path, 소유자/권한/비심볼릭 링크, 기존 metadata의 instance/origin/chain/mapping 및 schema 지문을 부팅 시 확인한다. 운영 중 파일 rename/교체·restore를 금지한다. 빈 DB 생성, `:memory:`, URI/VFS override, 네트워크 파일시스템, 여러 호스트에서 DB 공유는 지원하지 않는다.

1. 짧은 초기 로컬 검사 후 DB 트랜잭션을 닫고 고정 Moodle 서버를 조회한다. 외부 I/O 동안 DB lock을 보유하지 않는다. 요청마다 새 requestRef를 만들고 응답 echo를 대조한다. timeout/retry 후 옛 응답을 새 요청에 쓰지 않는다.
2. 같은 coordinator 연결에서 `BEGIN IMMEDIATE`. main → auth → workflow의 고정 등록 순서를 모든 coordinator에 사용한다. lock 획득이 실패하면 보류하고 원격 응답의 잔여 수명도 재검사한다. 자동 무한 재시도 없음. 초기 lock 대기 상한은 1초, 트랜잭션 안에 network/await/사용자 callback/제품 service 호출 없음.
3. coordinator가 소유한 SQL read adapter로 auth의 현재 sessions와 workflow의 현재 applications를 읽는다. 기존 인증과 같은 token digest, wallet 정규화, chain/origin, 세션 issued/expires/revoked 및 write CSRF 규칙을 적용한다. 새 세션을 기존 세션으로 간주하지 않는다. 판정 코드는 본부가 기존 session 검증과 공통 순수 함수로 분리하여 중복 구현의 drift를 막는다. token은 기존 인증 DB 조회를 위한 메모리에서만 사용한다.
4. main의 현재 authority policy, roster, trust, issuerEpoch와 worker boot 정책 지문을 확인한다. participant 역할·본인 신청 ACTIVE·mapping/policy/신청 revision·같은 세션 참조·사전 subject·confirmationDigest를 모두 대조한다. 처음 조회한 revision 그대로인지만 검사하지 않고 현재 ACTIVE/유효기간 predicate도 검사한다.
5. CAS, binding insert, 감사 insert를 실행한다. COMMIT 직전 시간을 다시 읽고 모든 exclusive expiry와 원격 조회 최대 경과를 검사한다. 시간이 상한에 도달하면 전체 ROLLBACK. COMMIT 성공을 확인하기 전 성공 응답을 만들지 않는다. COMMIT 실패 시 rollback/연결 폐기로 부분 성공을 반환하지 않는다.
6. 초안 읽기도 새 원격 관측 뒤 같은 최종 로컬 권한 fence를 통과시킨다. projection/observations는 메모리에만 두고 product DB 변경을 허용하지 않는다. 로컬 판정 이후 네트워크 전송 사이의 로그아웃까지 소급 철회한다는 보장은 하지 않는다. 판정과 겹친 철회는 직렬 순서로 설명하며, 이후 새 요청은 거부한다.

SQLite의 write transaction/ATTACH 동작은 [Transaction](https://www.sqlite.org/lang_transaction.html), [ATTACH](https://www.sqlite.org/lang_attach.html), [rollback journal locking](https://www.sqlite.org/lockingv3.html)을 근거로 삼았다. 이 설계는 기존 DELETE/FULL을 유지한다. 원자 변경은 main 파일에만 있고 auth/workflow는 lock과 SELECT 대상으로만 사용한다. 기존 product ledger·동의·지급 쓰기 트랜잭션에 binding write를 끼워 넣지 않는다. 단, 동시성 조정을 위해 기존 DB의 쓰기를 잠시 막는 비용은 있다.

`DatabaseSync.setAuthorizer`를 attach 및 schema 검증 직후 설치하고 연결을 외부로 노출하지 않는다. 허용은 고정 SELECT/READ, transaction 제어 및 main의 허용 테이블 DML뿐이다. auth/workflow의 INSERT/UPDATE/DELETE/DDL, ATTACH/DETACH, PRAGMA 변경, 임의 SQL 함수는 기본 거부한다. product trigger가 실행되는 경로도 허용하지 않는다. read column allowlist까지 적용하고 raw token·제품 proof/동의 테이블 읽기를 금지한다. Node 24.21.0의 실제 API 존재와 아래 거부 동작을 확인했으며, API 의미는 [Node SQLite authorizer](https://nodejs.org/api/sqlite.html#databasesetauthorizercallback)를 참고했다. 합성 실험의 read 허용은 축약되어 있으므로 그대로 product adapter로 복사하지 않는다.

현재 bootcamp writer는 workflow lock 안에서 auth SELECT를 수행한다. coordinator가 main/auth lock을 얻고 workflow를 기다려도 RESERVED lock은 이 SELECT를 막지 않으므로 기존 경로와 순환 쓰기 lock을 만들지 않는다. 향후 auth writer가 workflow에 쓰거나 역순 multi-DB transaction을 추가하면 통합 검토가 필요하다. SQLITE_BUSY는 권한 성공이 아니며 503/재시도 가능한 보류로 제한한다. DB lock 획득과 commit의 실제 소요 시간은 별도 통합 계측 대상으로 남긴다.

### 영속 역할 정책

main에 `authority_policy(revision, issuer_epoch, auth_config_hash, status)`와 preview 참가자 allowlist를 둔다. auth_config_hash는 origin/chain/instance 및 정규화·정렬한 participant/operator 목록을 결합한다. 각 worker는 자신이 실제 생성한 auth 서비스 설정으로 같은 지문을 계산하여 매 판정 때 current policy와 비교한다. 현재 auth allowlist 통과와 main의 participant ACTIVE를 모두 요구한다.

관리자가 역할을 폐기하면 main 트랜잭션으로 revision을 올리고 대상 pending/binding을 REVOKED 처리한다. 이 commit보다 늦은 소비는 거부된다. 새 역할 설정 활성화는 worker를 준비한 뒤 policy CAS를 수행하며 구 설정 worker는 지문 불일치로 차단한다. 코드 수정 없이 환경 파일만 바꾸거나 worker별 메모리 Set만 바꾸는 rollout은 지원하지 않는다. auth allowlist를 바꾸는 기존 운영 절차에도 이 활성화 절차를 연결하는 것이 본부 통합 작업이다. 정책을 다시 이전 구성으로 되돌려도 revision은 증가하므로 옛 시도는 살아나지 않는다.

## 영속 모델과 소비 조건

binding DB에는 최소 다음 테이블을 둔다. 이 목록은 migration 명세이며 실제 운영 DB를 생성한 결과가 아니다.

| 테이블 | 키·핵심 필드·제약 |
| --- | --- |
| `deployment_state` | singleton, issuerEpoch, accepted manifest hash, clockFloor, mode(DISABLED/ACTIVE). epoch 불일치 상태에서 요청 처리 금지. |
| `authority_policy` / `preview_principals` | 현재 revision/config hash 및 participant ACTIVE. 기존 제품 역할 권한을 확장하지 않음. |
| `roster_revisions` / `roster_rows` | immutable revision, signedArtifactHash, approvalHash, issuer/key ID, validity, exact deployment/installation/course/participant/wallet/subject. 활성 participant와 subject 각각 유일. |
| `installation_trust` | 설치별 audience/origin/path/port/course, 양방향 peer fingerprint, trustEpoch, status, validity, registry revision. |
| `attempts` | digest PK, issuerEpoch, applicationId, generation, sessionRef(HMAC), scopeHash, expectedSubjectRef, authority/roster/trust/app/mapping revision, previewDigest, 상태, 발급·만료·소비 시각. 난수 원문은 저장 안 함. |
| `application_generations` | applicationId PK, 현재 attempt generation. 새 시도 발행 시 증가. 기존 pending 폐기와 같은 transaction. |
| `bindings` | bindingRef PK, attemptDigest UNIQUE FK, applicationId, installationRef/courseRef/subjectRef, bound revisions/세션, status, expiry. |
| `audit` | 최소 eventId, 오류/변경 범주, issuerEpoch, opaque 추적 ref, 시각. accountHint·원천 본문·token·서명 명부 본문 제외. |

부분 인덱스는 `UNIQUE(applicationId) WHERE status='ACTIVE'`와 `UNIQUE(installationRef,courseRef,subjectRef) WHERE status='ACTIVE'`. expiry를 시간 의존 인덱스로 표현하지 않는다. lock을 가진 트랜잭션이 먼저 만료·폐기 대상을 terminal 상태로 바꾸고, 현재 활성 연결이 남아 있으면 충돌한다. 다른 신청의 유효 연결을 새 요청이 임의로 폐기할 수 없다. 같은 신청도 유효 연결 교체는 명시적 본인 해제 후 새 시도만 허용한다. 행 상태가 잘못 ACTIVE로 남아도 매 접근의 시간·현재 권한 검사는 생략하지 않는다.

소비 SQL의 WHERE는 `attemptDigest, PENDING, generation, issuerEpoch, sessionRef, scopeHash, previewDigest, authorityRevision, rosterRevision, trustEpoch, appRevision, mappingHash, issuedAt<=now, expiresAt>now`와 현재 generation 일치를 모두 포함한다. 같은 잠금 안에서 읽은 현재 registry 값과 비교하고 `changes===1`을 요구한다. 생성·만료·취소·소비는 main의 같은 쓰기 규칙을 사용한다. 서로 다른 시도의 subject 충돌은 유일 인덱스가 최종 방어하며 실패하면 앞선 CAS까지 롤백한다. nullable revision/subject, `INSERT OR REPLACE`, 충돌 시 다른 연결의 자동 삭제는 금지한다. 감사 insert 실패도 성공을 만들지 않는다.

세션 참조는 배포별 비밀키로 `HMAC(READ_PREVIEW_SESSION, issuerEpoch, 기존 session digest)`를 계산한다. 이 키는 DB/백업/로그 밖 secret store에 둔다. 키 회전은 새 issuerEpoch 활성화로 처리한다. 원문 token을 신규 DB에 복제하지 않는다. 새 CLEAR 세션에서 동일 지갑으로 다시 로그인해도 참조가 달라 이전 pending/binding을 쓰지 못한다.

## 사전 명부 관리와 출처 확인

명부 관리 인터페이스는 본부 소유 신규 `tools/agent-preview/binding-admin.mjs`를 제안한다. 학생·일반 operator HTTP에는 import/approve/activate API를 제공하지 않는다. 관리 CLI는 배포 registry-admin OS principal과 고정 secret/key registry를 사용한다. 애플리케이션 운영자 역할만으로 명부를 변경할 수 없다.

1. `roster validate --artifact <private-file>`: 엄격 JSON envelope의 signature와 exact keys, 크기/개수 제한, 기간, 단조 revision 및 환경을 검증한다. canonical UTF-8 payload에 domain `CLEAR_ROSTER_V1`을 붙이고 기관 registry에 미리 핀한 Ed25519 공개키로 검증하는 방식을 선택한다. envelope 안의 새 공개키를 신뢰하지 않는다. payload는 issuer, keyId, deployment audience, installation/course, revision, issued/expires 및 participantRef/wallet/subjectRef 배열이다. 이름·이메일은 포함하지 않는다.
2. 기관은 자기 학사/계정 관리 절차로 CLEAR participant/wallet과 Moodle subject의 같은 사람 여부를 먼저 확인하고 서명한다. Moodle plugin이 내보낸 계정 목록만으로 CLEAR 신원을 증명할 수 없다. 서명 검증은 기관의 진술 출처를 확인할 뿐, 그 결합 사실을 자동 확인하지 않는다. institution registrar와 CLEAR 배포 담당은 승인 기록에 artifactHash, exact 범위, 담당자 식별 참조·시각을 남긴다. 연락/승인 수집은 이 작업에서 수행하지 않는다.
3. `roster stage --artifact ... --expected-revision N`: 검증된 최소 매핑과 출처 지문을 비활성 revision으로 저장. 검증 오류 때 부분 import 없음. CLI 출력은 건수/지문/오류 범주만, 개별 학생값은 출력하지 않는다. 원본 명부 파일은 승인된 private 관리 경로에만 두고 Git/fixture/로그에 넣지 않는다.
4. `roster activate --revision N+1 --expected-revision N --approval <private-file>`: 기관 서명 artifactHash와 독립 CLEAR 승인 hash를 exact match하고 main 트랜잭션에서 CAS. 해당 범위의 기존 pending/binding은 모두 폐기한다. 수정·삭제·재추가는 revision을 올리고 새 사용자 확인을 요구한다. subject를 타인에게 재할당하지 않는다.
5. `roster revoke --scope ... --expected-revision N`: 비상 폐기는 main에서 즉시 DISABLED와 revision 증가로 선형화한다. 재활성화는 새 signed artifact/승인으로만 가능하다. 학생의 연결 성공을 보고 자동으로 roster를 만들거나 수정하지 않는다.

서명 키를 제공할 수 없는 기관의 이메일/CSV를 자동 신뢰하는 fallback은 두지 않는다. 기관별 다른 서명 체계를 받아야 하면 verifier profile을 별도 검토한다. synthetic 개발에서는 공개 fixture를 쓰되 `SYNTHETIC_ONLY` deployment를 별도로 두어 운영 registry가 거부하도록 한다.

## 신뢰 폐기와 복구 epoch

`trust stage/activate/revoke`는 같은 관리 CLI와 main DB revision CAS를 사용한다. 기관 설치 담당과 CLEAR 배포 담당이 별도 경로로 교환·확인한 endpoint, audience, course, 양방향 certificate fingerprint를 pin한다. 최초 배포는 TLS 직접 종료를 선택하고 proxy identity header 경로는 비활성으로 둔다. 개인키는 각 서버에서 생성·보관하며 수집하거나 문서에 붙이지 않는다.

기본 회전은 overlap 없음: 새 peer를 staging 검증 → 새 trustEpoch 활성화 및 구 pending/binding 무효화 → 구 연결 pool 종료. 모든 요청과 최종 local fence에서 현재 registry를 읽으므로 구 TLS 연결·resumption·늦은 응답이 폐기를 우회할 수 없다. CLEAR의 폐기는 로컬 main commit부터 유효하다. Moodle 측만 먼저 폐기한 사건이 CLEAR에 즉시 원자 반영된다고 주장하지 않으며 다음 원격 조회는 실패해야 한다. 네트워크 장애 시 오래된 registry cache/응답으로 대체하지 않는다. 양쪽 활성 epoch가 다르면 사용 불가 상태가 안전한 기본이다.

`trustEpoch`는 기관 설치 신뢰의 세대, `issuerEpoch`는 CLEAR 배포/복구의 세대다. 둘을 분리한다. issuerEpoch는 32바이트 무작위 opaque 값이며 크기 비교하지 않는다. 현재값과의 exact equality가 기준이다. issuerEpoch는 정수 revision 필드와 달리 opaque 문자열이다. 명부/신뢰 revision은 증가하는 안전 정수이고 같은 epoch에서 과거 값을 다시 활성화하지 않는다.

배포 원본 manifest는 DB 백업에 포함되지 않는 운영 secret/config 저장소에 두고 CLEAR 배포 관리키로 서명한다. `deploymentId, issuerEpoch, roleConfigHash, approvedPolicyHash, required schema versions, activatedAt`을 고정한다. 단일 호스트 supervisor가 배포 lock을 독점하고 그 아래 worker만 시작한다. 시작 시 외부 manifest와 DB epoch가 다르면 일반 서버는 갱신하지 않고 차단한다. 복구 도구만 정지된 서비스에서 다음 순서로 갱신할 수 있다.

1. 모든 preview worker/진행 요청을 drain하고 종료 확인. 외부 배포 lock 확보. auth/workflow/binding 중 하나라도 restore·clone·rollback하면 이 절차를 적용한다.
2. DB 복구 후 외부 저장소에 새 issuerEpoch를 먼저 활성화. 이 지점의 장애는 재시작 차단으로 끝나야 한다.
3. main 트랜잭션에서 모든 pending/binding을 폐기하고 단기 세션/confirmation 결합을 지운 뒤 새 epoch/manifest hash를 저장. roster/trust는 DISABLED로 전환하고 현재 승인본을 재검증해 활성화한다. 복구 DB의 epoch나 자동 생성한 초깃값을 외부 원본으로 승격하지 않는다.
4. 양쪽 issuerEpoch/trust 상태와 시계·보존 정리를 확인한 뒤 서버 시작. 구 worker/구 manifest 복제본의 재기동을 supervisor가 거부한다. Moodle에도 새 issuerEpoch를 전달하고 옛 confirmation의 재사용을 거부하도록 한다.

외부 원본까지 함께 롤백하거나 배포 관리자/DB 파일의 임의 실시간 교체가 허용된 환경은 이 보장의 범위 밖이다. 그런 배포에는 단순 로컬 파일을 epoch 원본으로 선택할 수 없다. 승인된 별도 config store/단일 활성 supervisor를 실제로 준비하고 복구 리허설을 해야 운영 가능하다. 현재 실험은 복구 프로토콜을 구현·검증하지 않았다.

## 시간·보존의 고정 기술 상한

기술 기본값은 attempt 120초, binding 300초, 원격 요청 왕복 5초, 응답 수신부터 최종 local fence까지 1초, 양 서버 시계 오차 최대 2초로 선택한다. 현재성 판정에는 monotonic elapsed와 UTC를 함께 쓴다. 원격 `checkedAt`은 실제 호출의 시작/종료 시각 ±2초 안이어야 하고, 미래 관측은 허용 오차 안에서도 그 차이만큼 보수적으로 잔여 수명을 줄인다. Moodle expiry는 CLEAR 시각 기준으로 2초를 차감하고 세션·등록·명부·trust·attempt의 가장 이른 상한을 적용한다. 최대치는 manifest에 명시하고 활성화 때 기관이 승인한다. 임의로 더 큰 값으로 재시도하지 않는다.

시계가 persistent clockFloor보다 뒤로 가면 전체 preview를 DISABLED로 유지한다. 운영 중 경과는 monotonic clock으로 확인하며 시간 역행이 lease를 연장하지 못한다. COMMIT의 fsync 완료가 wall-clock expiry를 넘어설 수 있으므로 승인 시점은 최종 lock 안의 판정 시각이며 commit의 물리 완료 시각까지 유효함을 보장한다고 표현하지 않는다. commit 후 이미 만료됐으면 연결은 사용할 수 없고 성공 응답으로 접근 수명을 연장하지 않는다.

계정/세션 결합 metadata는 만료·철회 후 정리하여 정상 가동 24시간 상한, 중단 후 시작 전 정리를 적용한다. attempt digest tombstone은 원래 만료+2초 이전에 제거하지 않는다. 삭제된 시도는 unknown으로 거부하고 새로 재구성하지 않는다. 감사의 운영 기본 제안은 30일이며 계정 식별자 없는 최소 범주/추적 ref만 남긴다. 명부의 법적·업무상 보존 기간, private 원본/백업 삭제 주기와 이 30일 수용 여부는 기관 입력이다. 승인 전에는 SYNTHETIC_ONLY로 개발할 수 있고 실제 명부 저장은 활성화하지 않는다.

## C가 인수할 DTO 및 세션 조건

계약 revision 3은 `.2`를 조용히 확장하지 않는다. `.3` server DTO에 issuerEpoch를 추가하고 lookup 요청/응답에 requestRef를 echo한다. scopeHash에 issuerEpoch와 로컬 authorityRevision을 포함한다. browser DTO는 계속 내부 authority/명부/학생 숫자 ID를 받지 않는다. C의 기존 v1 일반 read API가 이 confirmation 프로토콜을 충족한다고 간주하지 않는다.

- attempt lookup의 expectedSubjectRef/rosterRevision은 CLEAR의 활성 signed roster에서만 나온다. C는 서버 로컬의 안정적인 subject→Moodle user 매핑과 exact match한다.
- confirmationRef는 한 attempt와 확인 당시 세션 generation에 고정한다. 확인의 expiry는 최초 확인 시각+300초와 세션/등록/trust 만료의 최솟값이며 조회로 연장하지 않는다. 시도 소비는 별도로 최초 attempt의 120초 상한을 지킨다. binding expiry는 이 confirmation expiry를 넘지 않으므로 실제 연결 수명은 300초보다 짧을 수 있다. `moodleSessionGeneration`은 쿠키/sesskey/session ID 원문이 아닌 opaque 값이다. 다른 세션으로 옮기거나 lookup마다 새 generation을 발행하여 살리지 않는다.
- C는 지원하는 실제 Moodle session backend에서 서버 대 서버 요청만으로 해당 확인 세션의 생존/로그아웃/전역 세션 폐기/계정 전환을 확인할 수 있어야 한다. DB session 행 존재나 로그인 이벤트만으로 충분하다고 간주하지 않는다. backend에서 보장할 수 없으면 해당 profile을 비활성 처리한다.
- enrolmentRevision은 suspend/delete/학생 capability·role/context 및 등록 기간 변화를 빠짐없이 반영한다. 철회→재등록도 옛 confirmation을 살리지 않아야 한다. 이벤트 observer가 원천 commit 이후 비동기로 갱신되는 generation만으로 권한을 증명할 수 없다. C는 모든 지원 변경 경로와 snapshot/락 경계를 제시해야 한다.
- 매 preview의 Moodle 응답은 동일한 권한·자료 snapshot에서 subject/course/session/enrolment를 확인한다. 새 requestRef, issuerEpoch, trustEpoch, scopeHash, confirmationRef, generation/revision, checkedAt/observedAt/exclusive expiry를 결합한다. 원격 snapshot 이후의 철회는 OBSERVED_AT 경계다. lookup은 읽기이며 연장·재확인·등록 등의 side effect가 없어야 한다.
- C는 지원 가능 backend/변경 경로, 부정 시험과 실제 실행 여부를 본부로 보고한다. 이 입력은 기관의 외부 승인과 구분되는 **C의 기술 인수 증거**다. 미검증 backend를 실제 운영 승인으로 바꾸지 않는다.

## 자체 권한 리뷰와 증거

| 검토 항목 | 판정과 남은 검증 |
| --- | --- |
| auth 최종 검사 직후 logout | auth DB의 write lock을 commit까지 공유하므로 먼저 commit한 쪽 순서로 처리. 별도 프로세스가 실제 BEGIN을 시도하여 SQLITE_BUSY를 받은 뒤, binding commit 이후 logout 성공을 실측. |
| app/role/roster/trust 변경 | app 파일 및 main registry lock으로 순서 고정. app 폐기/대표 registry revision 변경 먼저면 소비 0건을 실측. 실제 세 종류 관리 CLI와 worker config 지문 연결은 구현 후 시험 필요. |
| 중복 완료·서로 다른 시도의 충돌 | CAS 및 application/subject unique 경쟁 각각 승자 1, 패자 CAS 롤백 실측. 실제 만료·모든 scope 필드 검증은 후속 제품 시험. |
| binder가 제품 상태 변경 | 시험 authorizer가 auth/workflow DML과 DDL을 거부, 정상 binding 후 두 파일 byte hash 불변. 실제 제품 스키마/projection/spy 0 시험은 후속. |
| 메모리 allowlist의 오래된 worker | persistent config hash+revision을 요구하는 설계로 해소. 현재 코드에 이 fence가 이미 있다고 주장하지 않음. |
| 명부 relay·기관 키 바꿔치기 | 사전 signed mapping+핀한 키+독립 승인 hash 요구. 실기관 원본/담당자 확인은 미수행. 기관이 틀린 동일인 결합을 서명하는 위험은 기술 서명으로 해결되지 않음. |
| 복구 replay | 외부 issuerEpoch+정지 복구·기존 연결 전면 폐기 선택. 외부 저장소/supervisor 구성 및 강제 종료 복구 시험은 후속. |
| 원격 등록 철회 | 순시 원자 철회 주장을 배제하고 새 snapshot마다 확인. C가 backend의 세션/권한 snapshot을 입증해야 하며 본부가 교차 인수. |

실행: `./tools/node --import ./tests/agent-preview/network-block.mjs --test tests/agent-preview/binding-db-experiment.test.mjs` (고정 Node 24.21.0, SQLite 3.53.4, macOS arm64). 2026-11-04 **9/9 통과**. 테스트는 `mkdtemp`의 합성 세 DB만 사용하고 별도 Node 프로세스 두 개 이상을 IPC 장벽으로 조정한다. 외부 서버/실제 DB/credentials를 열지 않는다. 테스트 fixture는 최소 sessions/applications/정책/CAS 테이블로 축약했으며 기존 product module을 실행하지 않았다. child process와 임시 디렉터리는 종료·정리한다.

이는 SQLite 기법의 가설 검증이다. 제품 binding 구현, Moodle 세션 검증, 통합 race, 운영 성능/availability, 전원 장애/복구, 실제 관측·100 TEST 지급 또는 CI 성공의 증거가 아니다. 제품 code import와 HTTP route 추가는 0건이다.

## 구현 소유권과 실제 외부 입력

| 소유자 | 제안 구현 경로와 책임 |
| --- | --- |
| B | 신규 `src/agent-preview/moodle-binding/{contract,store,coordinator,registry,service}.mjs`, 전용 schema, `tests/agent-preview/`의 합성 기능/race 시험. standalone package는 운영 연결을 자동 export/활성화하지 않음. |
| 본부 | `src/application/service.mjs`의 순수 세션 판정 분리 및 config 지문 제공, `src/bootcamp/`의 최소 projection schema 계약, 신규 `tools/agent-preview/binding-admin.mjs`, host route/worker bootstrap/배포 manifest/운영 CI. 기존 공통 파일 변경은 본부 단일 소유. |
| C | Moodle plugin의 명부 subject export·confirmation·session backend verifier·일관된 원천 snapshot·mTLS registry. PHP 파일 경로는 C 작업본에서 확정하며 B가 수정하지 않음. |
| A/기존 프론트 | PR149/web 및 고정 지급 경로 소유 유지. 본부 통합 인수 후 필요한 신규 화면 작업만 별도 배정. |

기관이 실제로 제공·확인해야 하는 입력은 (1) 동일인 결합을 검증한 서명 명부와 담당자 승인, (2) 설치·강좌·허용 학생 capability/자료 대상과 공식 endpoint, (3) 기관 서명 공개키·양방향 peer 인증서의 별도 경로 확인 및 서버별 secret provisioning, (4) 시간/보존·백업 정책 승인이다. 실제 개인키를 채팅/문서로 제출받지 않는다. CLEAR 배포 측에는 별도 epoch 원본 저장소/서명키/supervisor 운영 구성이 필요하다.

외부 입력이 없어도 위 스키마, coordinator, 엄격 DTO, 관리 CLI의 **합성 구현**은 본부 검토 후 시작할 수 있다. B의 로컬 기술 선택은 완료했으며 C의 backend/snapshot 인수와 본부의 교차 리뷰를 받아 실제 연결 구현/활성화를 구분해 배정해야 한다. 이 문서가 사용자의 로그인·기관 승인·실제 배포 권한을 대신하지 않는다.
