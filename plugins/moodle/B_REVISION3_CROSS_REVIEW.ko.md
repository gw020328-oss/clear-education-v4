# B revision 3 교차 검토

2026-11-04. 검토 대상 0ec25db95697ec02140485bc394cb58a6d6dd769, C 기준 26b0bc36eaeb14ccfbffc8962456008dde0472f8. 판정은 저장소 기법의 조건부 수용, 실제 연결 인수 보류다. B의 변경은 계약과 최소 SQLite 실험이며 src/agent-preview/moodle-binding 구현은 아직 없다. 기존 B 9개/C 17개/epoch 7개 시험은 재실행하지 않았다.

## 잠금·소비

binding-db-worker.mjs 8–18, 33–46을 대조했다. main=bindings, auth 및 workflow 두 attached DB에 BEGIN IMMEDIATE를 걸고 SELECT와 main CAS/insert를 같은 연결에서 수행한다. 총 세 파일이며 외부 두 파일에 쓰기 권한을 주지 않아도 reserved lock 조정이 가능하다. DELETE/FULL, 고정 attach 순서, 고정 로컬 파일, 외부 I/O 종료 뒤 짧은 동기 트랜잭션이라는 제약은 C snapshot 설계와 충돌하지 않는다. busy/commit 오류는 성공 처리하면 안 된다. 실제 제품 schema 및 기존 writer의 lock 순서 통합 검증은 남는다.

## authorizer 수정 조건

실험 callback은 auth/workflow/main의 모든 READ를 허용하고 main policy UPDATE도 허용한다. 설명상 축약 fixture임은 확인했다. 따라서 이 코드를 제품 gate로 그대로 인수해서는 안 된다. 신규 반례는 동일 callback과 trusted_schema=OFF 조건에서 audit INSERT trigger가 policy revision까지 수정하는 것을 재현했다. 직접 auth/workflow 쓰기는 여전히 거부되는 범위이며 그 기존 결과를 뒤집는 반례는 아니다.

실행 파일은 experiments/binding-authorizer-review.mjs이며 고정 Node 24.21.0의 실제 SQLite에서 반례 1개를 실행했다. 결과는 REPRODUCED다. 운영 coordinator에서는 registry/authority 정책 DML을 admin 전용 연결로 제한하고 binder 연결에는 허용된 업무 DML만 제공해야 한다. authorizer source 인자에 대한 trigger/view 경유 정책, table/column별 READ 허용, schema의 trigger/view 인벤토리 검증을 명시하고 테스트해야 한다. raw token·proof 테이블 SELECT, registry 직접 UPDATE, audit trigger의 registry 변경, view 경유 비허용 column 읽기를 각각 거부 시험으로 추가할 것을 권고한다. trusted_schema=OFF만으로 평범한 trigger UPDATE가 차단되지는 않는다.

## stale worker와 epoch

결정안의 persistent authorityRevision/config hash 및 issuerEpoch 동등 비교, 복원 전 모든 worker drain과 supervisor lock 설계는 수용 가능하다. 다만 실험 validate(23–31)는 policy.revision만 비교하며 worker 설정 지문/외부 manifest/issuerEpoch/current generation을 검사하지 않는다. 이는 문서가 이미 명시한 미구현 범위다. 새 구현에서는 과거 config hash worker, 같은 config로 되돌린 증가 revision, 다른 issuerEpoch의 응답, 구 worker가 복구 중 살아 있는 상황을 별도 시험해야 한다. 매 최종 소비 및 preview fence에서 worker boot hash와 현재 DB/활성 manifest를 결합해야 한다. 부팅 시 한 번의 확인으로 대체할 수 없다. 복원 대상 DB와 외부 epoch까지 함께 되돌릴 수 있는 배포는 미지원으로 유지한다.

## freshness/requestRef의 명시화 필요

매 호출 새 requestRef와 exact echo, issuerEpoch/trust/roster/scope/confirmation 결합은 타당하다. 구현 결정안 91행에는 checkedAt을 왕복 시작/끝 ±2초와 비교하는 식이 있지만 observations의 observedAt 자체에 대한 최소·최대 및 snapshot 시작 시점 정의는 없다. 오래된 snapshot을 읽고 checkedAt과 requestRef만 새로 붙이는 구현을 배제하도록 구체 조건을 추가해야 한다. 예를 들어 호출 시작 100/종료 101, checkedAt=101, observedAt=10, 미래 expiry와 올바른 requestRef를 가진 응답은 checkedAt 숫자 조건만 통과한다. 이는 실제 validator 취약점 재현이 아닌 현재 명세의 누락을 설명하는 반례다. 동일 snapshot을 쓴다는 요구만으로 snapshot이 이번 호출에서 생성되었음을 뜻하지 않는다.

수정 조건은 요청 수락 후 새 snapshot 획득, snapshot 시점 observedAt, 검사 종료 checkedAt의 의미와 observedAt<=checkedAt, 둘 다 현재 호출 및 최대 관측 나이 범위 안에 있음, 현재 local fence에서 monotonic 경과 재검사, 정확히 expiry 도달 거부다. confirmedAt은 원래 확인 시각으로 유지하여 오래됐다는 이유만으로 새로 쓰지 않는다. 새 requestRef는 snapshot 재사용을 허용하는 증명이 아니다. 중단/timeout된 호출의 늦은 응답을 동일 attempt의 다음 호출에 사용하지 않는 사례도 필요하다.

## C 지원 조건과 충돌 여부

revision 3은 C를 일반 backend가 이미 지원된 것으로 표시하지 않으며 충돌은 없다. C 지원 후보를 별도 profile로 고정해야 한다. PG database session/manual auth, 원자 authority epoch, non-owner runtime DB 역할, 명시 ACL 프로필 및 cache 없는 SQL projection의 구현 인수까지는 disabled다. 기존 PHP 설치 골격과 SQL shadow 실험은 confirmation/학생 자료 조회 인수 증거가 아니다. 전역 epoch로 다른 학생 변경·heartbeat도 확인을 폐기할 수 있다는 가용성 비용을 B가 수용해야 한다. source enrolmentRevision에 이 전역 epoch를 사용할지 별도 이름을 둘지 합의하고 불일치 시 새 확인을 요구해야 한다.

Moodle 자료 조회를 일반 completion/assignment/forum 권한 API 전부로 넓히면 C의 최소 지원 후보와 충돌한다. group submission/forum 회고/custom availability 등은 별도 분석 전 제외한다. 원천 확인 이후 철회는 OBSERVED_AT 의미로만 표현한다. 기관 명부, 실제 사용자 로그인, 원본 자료 조회 및 운영 연결은 이번 검토에서 수행하지 않았다.
