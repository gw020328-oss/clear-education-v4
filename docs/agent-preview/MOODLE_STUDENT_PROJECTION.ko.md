# Moodle binding의 C1 학생 저장소 projection

2026-11-04. PR151 head `210a739e1d8a2b8e7af2ef894b9309c1352b5a14`를 입력으로 고정한 후속 구현이다. 기존 synthetic schema/profile과 독립 demo를 보존하고, 실제 auth·C1 학생 서비스가 생성한 DB를 읽는 별도 **합성 데이터 전용 내부 profile**을 추가했다. HTTP composition·route·Moodle plugin·운영 verifier는 연결하지 않았다. 기관 신원/실제 동의/자격/지급 승인 결과가 아니다.

## 내부 구성

1. auth 생성자에 `bindingAuthority: {revision: 1, expectedRevision: 0}`을 명시하면 기존 schema4를 schema5로 원자 전환한다. `binding_authority`에 revision과 역할 설정 hash를 저장한다. 생략 시 기존 schema4를 유지하며 binding manifest를 제공하지 않는다.
2. 활성화된 DB 재개는 `{revision: N}`으로 현재 설정과 exact match한다. 설정 교체/재승인은 `{revision: N+1, expectedRevision: N}` CAS가 필요하다. 같은 설정으로 돌아와도 revision은 증가한다. schema5의 authority/metadata 유실·구 설정·묵시적 schema4 downgrade는 거부한다.
3. auth와 student의 `moodleBindingManifest()`로 내부 manifest를 얻는다. DB path, 환경 metadata, auth 설정 지문/revision을 결합한다. HTTP JSON으로 manifest를 받는 경로는 없다.
4. `src/agent-preview/moodle-binding/student-profile.mjs`의 `createSyntheticStudentProjection({authentication, student, registry})`에 두 manifest와 명시 승인한 합성 registry를 넣는다. 제품 profile은 별도 import이며 기존 `index.mjs` 독립 합성 경로는 Node 내장 모듈만 사용한다. 제품 profile은 고정 ethers 등 기존 제품 의존성을 사용한다.
5. coordinator에 `projection`과 원본 파일 경로를 전달한다. main은 기존 binding schema, auth는 해당 서비스의 `applications.sqlite`, workflow는 C1 `mvp-student.sqlite`다. auth 서비스의 별도 신청이나 bootcamp 신청을 혼합하지 않는다. 신규 main 준비는 시험 fixture가 수행하며 운영 설치·migration CLI는 제공하지 않는다.

registry exact 필드:

```text
mode=SYNTHETIC_ONLY, applicationId, policyId, policyHash, policyRevision,
bindingRevision, participantRef, wallet, installationRef, courseRef, subjectRef
```

wallet은 정규화한 소문자 주소이며 auth participant에 있어야 한다. course·participant·subject는 명시 승인된 합성 값이다. wallet이나 C1 subject hash에서 기관 신원을 파생하지 않는다. registry 전체 hash가 main policy의 mappingHash다. auth manifest의 configHash/revision을 policy의 configHash/authorityRevision과 대조하고 기존 명부/신뢰/설치 epoch 검사도 유지한다. profile은 하나의 승인된 신청에 한정된다.

## 최종 판정과 저장 경계

- 원천 호출은 로컬 transaction 밖에 있다. 반환 후 main/auth/workflow에 `BEGIN EXCLUSIVE` 잠금을 확보하고 exact schema inventory, DELETE journal, 환경 metadata, path/inode, 외부 합성 control을 재검사한다.
- 실제 auth 세션의 digest/wallet/발급/만료/철회를 읽는다. 역할 목록·origin·chain·instance의 hash와 영속 revision이 worker manifest 및 현재 policy와 일치해야 한다. 원문 token은 신규 DB에 복제하지 않는다.
- C1 신청은 `ACKNOWLEDGED_SYNTHETIC`만 허용한다. wallet, 신청·정책 ID/hash, workflow revision, binding revision, ack 행 연결, updated_at과 현재 policy_heads의 active/hash/revision을 검사한다. DRAFT·이전 정책·다른 소유자는 거부한다.
- 정책 교체 후 학생의 선택/acknowledgment만으로 이전 mapping을 재사용할 수 없다. 새 registry·mappingHash 승인과 새 attempt/confirmation이 필요하다. 정책 disable→reenable은 hash가 같아도 학생 저장소 transaction에서 binding_revision을 올린다. 동일 active 정책으로 재시작할 때는 올리지 않는다. workflow revision/ack history·일반 API 상태 enum은 덮어쓰지 않는다.
- request OPEN→USED, pending CAS, binding 유일성, audit, clock은 기존 main transaction에서 함께 commit/rollback한다. final time fence는 commit 잠금 확보 뒤 실행한다. 파일시스템/fsync 완료 시간의 실시간 상한을 주장하지 않는다.
- source DB에는 쓰지 않는다. policy/ack 전문·proof·서명·원문은 열 allowlist 밖이다. 기존 immutable trigger는 정확한 inventory에 포함하지만 coordinator의 trigger/view expansion과 source DML은 금지한다.

새 코드의 구 설정 worker는 `AUTHORITY_STALE_WORKER`로 거부된다. 이미 실행 중인 과거 바이너리의 코드를 바꾸거나 배포 전체를 종료하는 기능은 아니다. 운영 배포/복구 fence는 별도 소유다.

## 잠금 충돌과 복구 한계

기존 student command는 workflow 쓰기 잠금 뒤 별도 auth 연결로 읽는다. coordinator는 auth를 포함한 여러 파일을 잠근다. 반대 순서에서 기다림이 생길 수 있으며 이번 범위는 기존 writer를 광범위하게 재작성하지 않고 SQLite timeout/rollback으로 실패를 처리한다. 자동 반복 재시도는 없다. 잠금 해제 후 새 requestRef/source 조회로 다시 시도한다.

시험 worker는 실제 `student.acknowledge()` transaction에서 workflow 잠금을 보유하고, 경쟁 auth lock을 별도 읽기로 확인한 뒤 실제 `authorizeWorkflow()`를 호출한다. coordinator만 timeout되는 경우와 별도 auth blocker로 양쪽 모두 timeout되는 경우를 검사한다. pending/소비 audit/binding과 학생 commands가 변하지 않고, 잠금 해제 후 새 조회로 완료된다. SQLite busy timeout은 실시간 SLA가 아니다.

auth revision은 DB 내부 단조성이다. 백업 전체 rollback을 탐지하는 DB 밖의 durable supervisor/issuer epoch는 구현하지 않았다. 기존 branded synthetic control과 운영 verifier DISABLED를 유지한다. restore/관리 CLI/기관 registry/HTTP는 후속 범위다. 과거 active binding은 policy 변경 뒤 접근 검사에서 거부되며, 새 binding 생성은 기존 active uniqueness/만료 규칙을 따른다.

## 검증

```sh
./tools/node --import ./tests/agent-preview/network-block.mjs --test \
  tests/agent-preview/binding-module.test.mjs \
  tests/agent-preview/binding-currentness.test.mjs \
  tests/agent-preview/binding-student.test.mjs
./tools/node --test tests/application/binding-authority.test.mjs
./tools/node --import ./tests/agent-preview/network-block.mjs \
  src/agent-preview/moodle-binding/synthetic-demo.mjs
```

신규 projection 18건은 합성 로그인·실제 제품 DB 신청·확인을 생성한다. 성공 전후 auth/student DB byte hash 일치, 재시작, logout/relogin·revision·정책 변경/disable→reenable·권한 A→B→A·구 worker·금지 열/쓰기·schema drift·반대 잠금 timeout/rollback을 포함한다. 별도 auth 4건은 schema4 자료/세션을 보존한 원자 migration, 잘못된 활성화 rollback, 재개와 authority/metadata 유실 거부를 검사한다.

CI의 기존 `Offline Moodle binding tests and standalone demo` 단계에 `binding-student.test.mjs`를 명시 추가했다. auth 시험은 기존 `test:applications` glob에 포함된다. 고정 Node, 네트워크 차단, 기존 검사·독립 demo를 유지했다. 정확한 최종 head/CI 결과는 PR 완료 보고에 기록한다.
