# Moodle binding revision 3 합성 모듈 인수

2026-11-04. 구현 입력 base `f357c8aca0999d02216f240a4541d018c6ad2d48`, C 수정 조건 `f44c0b2`의 `B_REVISION3_CROSS_REVIEW.ko.md`. 이번 범위는 `src/agent-preview/moodle-binding/` 독립 모듈과 임시 DB 시험이다. 기존 auth/workflow/common/web 및 제품 host/CI 설정을 변경하지 않는다.

## 실행과 API

고정 Node 24.21.0과 기본 `node:sqlite`만 사용한다. 별도 패키지 설치가 필요 없다.

```sh
./tools/node --import ./tests/agent-preview/network-block.mjs src/agent-preview/moodle-binding/synthetic-demo.mjs
./tools/node --import ./tests/agent-preview/network-block.mjs --test tests/agent-preview/binding-module.test.mjs tests/agent-preview/binding-currentness.test.mjs
```

entry point는 `src/agent-preview/moodle-binding/index.mjs`. `createBindingCoordinator({paths,control,verifier,timePolicy,clock,sessionKey})`가 `start`, `preview`, `complete`, `readPreview`, `bindingStatus`, `close`를 제공한다. preview/complete/readPreview만 비동기다. bindingStatus는 응답 유실 후 본인 연결 메타데이터 복구용이며 원천 관측이나 읽기 권한 부여가 아니다. 모든 조회에도 현재 세션/소유권/정책을 확인한다. 반환 DTO도 엄격 validator를 통과시킨다.

`createSyntheticEnvironment`는 새 private 임시 디렉터리와 세 SQLite 파일을 만들며 기존 DB를 migration하지 않는다. `createSyntheticControlPlane`과 `createSyntheticVerifier`로 생성한 어댑터만 받는다. 임의 verifier object와 실제 설치 연결은 거부하며 `installationVerifier.status='DISABLED'`다. 합성 응답 callback은 테스트 장치이고 실제 기관 검증을 구현한 것이 아니다. 단일 학생/설치/강좌를 pin한 SYNTHETIC_ONLY projection schema를 사용한다. 현재 제품 DB schema는 고의로 인수하지 않는다.

시간 정책은 필수이며 기본값이 없다. policyRef 및 수명/왕복/최종 fence/관측 나이/시계 오차의 정확한 정책 hash를 DB와 control plane에 결합한다. 구현의 기술 상한은 120초/300초/5000ms/1000ms/관측 10초/오차 2초다. 테스트·demo의 `SYNTHETIC_*_NOT_OPERATIONAL_APPROVAL` 값은 운영 승인이 아니다. 운영 승인 정책 주입은 추후 host 소유 작업이다. clock은 UTC epoch seconds와 프로세스 monotonic milliseconds 함수를 명시 주입한다. 동일 세션의 sessionKey는 worker 간 동일한 별도 secret 주입 인터페이스이나 현재 demo/test는 공개 합성 값만 쓴다.

## C 교차 리뷰 반영

- SQL authorizer는 table/column별 READ와 업무상 INSERT/UPDATE만 허용한다. main policy DML, auth/workflow DML, 임의 함수·DDL·ATTACH·PRAGMA 변경 및 trigger/view source를 거부한다. registry/policy 관리는 runtime에 없다. 테스트 준비용 별도 연결이 관리 변경을 모사한다.
- 매 `BEGIN IMMEDIATE` 이후 main/auth/workflow/temp의 exact schema inventory를 검사하고 DELETE journal 및 DB 파일 경로·inode를 재확인한다. 알려진 secret 테이블도 READ 대상에서 제외한다. `trusted_schema=OFF`만으로 보호한다고 가정하지 않는다. inventory 및 authorizer를 각각 독립 부정 시험했다.
- 시도별 session HMAC, application generation/revision, policy hash(issuer/config/authority/roster/trust 포함), scope와 preview digest를 고정한다. 최종 트랜잭션에서 다시 검사하고 조건부 소비+binding+audit를 함께 commit한다. 신청/subject 활성 unique 충돌이나 commit 오류는 전체 rollback이다.
- 외부 control plane의 ACTIVE 및 boot policy hash를 요청 시작과 최종 fence마다 검사한다. DRAINING/새 issuer/config/revision/DB만 복원된 상태는 오래된 worker에서 거부한다. 이 control plane은 합성 메모리 구현이다. 실제 외부 durable epoch store/supervisor의 구현 또는 파일 복구 동시성 보장을 대신하지 않는다.
- requestRef는 서버 난수로 발행하고 main requests PK로 영속화한다. 성공 처리 시 OPEN→USED CAS, 실패/timeout 시 가능한 경우 CANCELLED로 닫는다. 폐기된 배포나 cleanup commit 오류에서는 OPEN이 남을 수 있지만 재시작한 worker가 이를 받아 처리하는 API는 없다. 이전 requestRef 응답 재사용을 거부한다.
- lookup은 DB 락 밖에서 수행하며 AbortSignal과 실제 timeout을 적용한다. 원천 어댑터가 abort를 무시해 늦게 완료해도 commit continuation으로 돌아오지 않는다. 응답 수신과 최종 local fence에서 monotonic 경과·wall 역행/급변·exclusive expiry를 검사한다.

## 이번 요청의 snapshot 의미

confirmation과 observations `.3` 서버 응답 모두 `observedAt`을 필수로 한다. C는 이번 요청을 수락한 **뒤 새 SQL snapshot을 획득한 시점**을 observedAt으로, 같은 snapshot의 검사 종료를 checkedAt으로 반환해야 한다. 예전 snapshot에 새 checkedAt/requestRef를 붙여서는 안 된다. confirmedAt은 최초 사용자 확인 시각을 유지하며 stable confirmationDigest에는 observedAt/checkedAt/requestRef를 넣지 않는다.

validator는 `observedAt <= checkedAt`, 둘 다 이번 요청의 시작/수신 구간 ±승인 skew, 최종 시각에서 보수적 관측 나이 및 expiry, monotonic 왕복/최종 fence를 검사한다. source expiry에서 skew를 빼며 정확한 만료 시각은 거부한다. 각 observation의 시각도 envelope snapshot 시각과 같아야 한다. enrolmentRevision/trust/roster/binding revision은 양의 안전 정수이며 Moodle 세션 generation은 opaque 문자열이다. source의 실제 snapshot 획득 정직성은 이 숫자 검사만으로 입증되지 않으며 C의 세션/SQL 인수에 의존한다.

## 검증 범위와 남는 통합

2026-11-04 고정 Node 24.21.0 / SQLite 3.53.4에서 신규 시험 **48/48 통과** 및 네트워크 차단 독립 demo 실행을 확인했다. 신규 module 시험은 실제 모듈 start→preview→complete→read/status→reopen, 별도 두 프로세스의 사전 검사 장벽과 한 번 소비, subject unique 패자의 rollback, COMMIT busy의 원자 rollback, source/세션/신청/설정 변경, 복구 중 구 worker, requestRef replay/timeout 늦은 응답, final monotonic fence, audit trigger→policy 공격 및 view/raw secret 읽기 거부를 실행한다. auth/workflow DB byte hash가 정상 흐름 전후 같음을 확인한다. 별도 currentness 시험은 경계 시각과 오래된 observedAt 반례를 다룬다. C의 과거 7건 및 초기 SQLite 9건과 신규 시험 수를 합산하지 않는다.

운영 미구현: 실제 Moodle verifier/session persistence/SQL projection, signed roster/trust 관리자 CLI, 외부 epoch/worker supervisor, 보존·청소·복구 migration, rate limiting, HTTP same-origin/cookie/peer/CSRF 전달, 실제 기존 auth 서비스와 pure predicate 공유 및 제품 schema/projection 통합. 현재 host가 없으므로 이 라이브러리 context를 HTTP body에서 그대로 받아서는 안 된다. 실제 root/DB 관리자가 서비스 중 파일·정책·epoch를 임의로 동시 교체하는 환경은 지원하지 않는다. operational retention cleanup이 없으므로 합성 environment는 사용 후 dispose한다.

제품 package export나 기존 route를 추가하지 않았다. 제품 자동 eligibility/payment는 항상 false이며 실제 학생 기록·로그인·서명·체인·유료 호출은 수행하지 않는다. C의 F1–F4와 본부 공통 파일 인수가 완료되기 전 실제 연결을 활성화할 수 없다.
