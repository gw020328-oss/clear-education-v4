# E5 API 전역 worker 권한

2026-10-19. `API_GLOBAL_AUTHORITY_REVIEW_READY_FULL_BRIDGE_BLOCKED`.

기준은 API current 부분 구현 `97f6413da80f8c9075baf344b5e2bf3f8c221360`이다. 이 변경은 runtime/vault 전역 worker 권한을 기존 intent별 lease 위에 추가한다. E4 실제 서비스 실행, 서명·송신, 전체 절차, claim 연결 완료를 뜻하지 않는다. 기본 metadata 경로와 current adapter 모두 dispatch 차단을 유지한다.

## 권한과 직렬 실행

- store 생성마다 새 incarnation을 만든다. 같은 서비스 ID라도 다른 store/process는 이전 handle을 재사용할 수 없다.
- runtime pin과 vault scope는 각각 유일하다. E4 projection이 있으면 chainId·vault·instance로 scope를 결합한다. metadata-only scope는 runtime pin으로 격리하며 송신 권한이 아니다.
- `acquireRuntime`은 짧은 SQLite transaction에서 현재 counter와 만료를 대조하고 fence journal과 lease를 함께 기록한다. 만료 후 인수는 fence를 1 증가시키며 이전 lease는 되살리지 않는다.
- `bindRuntimeIntent`는 한 전역 worker 아래 한 intent만 허용한다. E3 commitment는 global handle/slot revision과 기존 intent lease/CAS를 함께 결합한다. E4-shaped wire `workerFence`는 전역 값이다.
- `releaseRuntimeIntent`는 아직 seal 요청이 없는 slot만 해제한다. `E4_SEAL_REQUESTED`, sealed reference 또는 기존 envelope가 있으면 거부한다. 만료 인수도 활성 slot을 그대로 넘기며 UNKNOWN을 지우지 않는다.
- heartbeat는 lease expiry만 늘리고 업무 revision/sequence, global fence, slot revision을 바꾸지 않는다. 이미 발급한 capability의 원래 expiry는 그대로다.

위 메서드는 constructor로 인증된 내부 execution facade에만 존재한다. 공개 HTTP 경로는 추가하지 않았다. 기존 intent별 acquire/heartbeat는 전역 lease와 별도다. `connectCurrentController(context, globalHandle)`과 `worker.inspect(localHandle)`은 두 권한이 모두 유효할 때만 current 준비를 허용한다.

## 영속 fence와 복원 차단

`e5_runtime_workers`의 현재 row와 append-only fence/slot journal을 대조한다. counter 감소, lease identity 불일치, slot revision/기록 불일치는 영속 stop을 남기고 runtime을 `RECOVERY_BLOCKED`로 바꾼다. counter를 복구값으로 덮어쓰지 않는다.

전체 DB의 일관된 과거 snapshot은 로컬 journal만으로 식별할 수 없다. 이를 위한 외부 비교 경계는 constructor 전용 `executionFenceWitness`다. 현재는 오프라인 합성 reader로만 검증했고 실제 E4 witness 포트는 아직 연결하지 않았다.

reader 설정은 `clear-bootcamp-runtime-fence-reader.1`과 캡처된 비동기 `read` 함수다. 질의의 runtimeId/runtimePinHash/scopeKey가 일치하는 `clear-bootcamp-runtime-fence-witness.1` 결과와 안전한 정수 highestFence만 private ticket으로 수락한다. 외부 호출은 DB transaction 밖에서 수행하고 복귀 시 lease identity CAS를 다시 확인한다.

reader가 설정되면 **acquire 전에** `observeRuntimeFence(context)`를 호출해야 한다. 동일 incarnation, 동일 현재 counter, 수락 후 5초 이내의 결과만 새 acquire에 쓸 수 있다. 예를 들어 API가 1로 복원되고 E4가 2라면, API가 먼저 2로 증가해 값을 맞추는 것을 금지한다. 외부 값이 더 높으면 counter 1을 보존한 채 영속 정지한다. 외부 witness 자체가 이미 관측한 값보다 낮아져도 정지한다.

E4 witness가 없거나 함께 되돌려진 경우 전체 snapshot rollback을 완전히 탐지했다고 주장하지 않는다. 실제 활성화에는 E4 소유 witness와 새 명시 버전의 계약 검토가 필요하다. 현재 sender는 계속 차단된다.

## 마이그레이션과 기존 기록

새 schema/guard 설치는 하나의 transaction이다. 기존 schema를 초기화하지 않고 metadata, current binding, UNKNOWN/request marker와 기존 권한 기록을 보존한다. 옛 local fence에서 전역 fence를 추정해 backfill하지 않는다.

업그레이드 뒤 옛 97f writer가 current certificate를 발급하지 못하도록 E5 transaction 진입도 global writer guard로 차단한다. 기존 binary로 downgrade하여 쓰는 경로는 지원하지 않는다. schema와 guard 정의를 재개방 시 검사한다. 공개 97f 코드를 별도 소유 합성 DB에서 열어 migration 중단, 재개, 기존 row 보존과 옛 writer 거부를 검증했다.

옛 binding에 global handle을 덧씌워 승격하지 않는다. 이전 incarnation 또는 97f binding은 `BC_E5_GLOBAL_BINDING_REVIEW_REQUIRED`로 막고 기록을 유지한다. UNKNOWN slot의 해제/adoption은 이번 단위에 없다.

## E4 B 계약과 남은 연결

root 초안 `725506f8261fea38c855297ba603904c61be4007`의 authority/business 만료 구분을 따른다. 이 lease는 현재 worker의 권한만 관리한다. 새 B 버전은 `authorityUntil`과 원래 source cutoff·.3 message expiry·review cap·독립 envelope TTL을 결합한 불변 `businessValidUntil`을 분리해야 한다. A의 과거 row나 binding expiry를 새 의미로 해석하지 않으며 120/600, source 수명, 서명 bytes와 nonce를 연장하지 않는다.

root 전달 기준 E4-A `0e6d4225e5b645e57e3988dc426937b08069ead8`는 8/8 CI 후 서비스 구성요소로 인수되었다(기록 `6e11a7d`). 이는 API↔E4 B 통합 인수가 아니다. 기존 97f issuer 모양은 current 부분 구현의 합성 검증 경계이며 최종 B API로 확장하지 않았다. 첫 capability bootstrap, bound callback 재귀와 nested SQLite transaction을 피하는 typed facts/certificate 계약은 E4 소유 포트 확정 후 연결한다. API/worker는 raw key나 generic digest signer를 받지 않는다.

남은 항목은 실제 E4 witness/issuer/current fact 계약, 응답 유실 lookup, 별도 adoption/current commit, 전체 등록→배정→공개→동의→새 unsigned→prepare/accept 절차, 별도 claim/receipt 검증이다. 현재 `commitCurrentSync`는 계속 차단하며 provider dispatch를 부르지 않는다.

root v1/v2/v3 source pin은 변경하지 않았다. 이번 source를 E4가 소비하려면 root v4와 명시 consumer 갱신·정상 이력 병합 및 해당 검증이 필요하다. 이번에는 원격 push/통합 CI/PR 병합을 하지 않는다.

## 검증과 보존 조건

네트워크 차단 상태에서 E5 + E1/E3 275개 통과: 기존 238개와 전역 authority 29개, 독립 process/SIGKILL 복구 8개다. 신규 복구 시험은 실제 SIGKILL 7개와 독립 두 프로세스 단일 승자 경쟁 1개다. 기존 source·동의·인증·reorg·응답 유실 검증도 포함한다. workspace 원본 191개 지문과 의존성 검증은 통과했다. 상세 수치와 source SHA는 `E5_RUNTIME_AUTHORITY_VERIFICATION.json`에 기록한다.

기존 금고·DB·체인·키는 읽거나 수정하지 않았다. 합성 시험은 새로 만든 소유 DB에서 수행했다. E4 실제 서비스, 지급/거래 서명, 공개 체인, 실제 원천, 유료 호출은 실행하지 않았다. 멘토 미결 정책, 400% 자동 자격·지급 금지, 500% 제외, Moodle·원천 검증 차단, grant/outbox HOLD, 독립 청구 제품 NO-GO, 역사적 Mac 실패 원인 미확정을 유지한다.
