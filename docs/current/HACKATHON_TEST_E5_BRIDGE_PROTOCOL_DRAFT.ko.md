# E5 실행 연결 프로토콜 초안

2026-10-19. `DRAFT_IMPLEMENTATION_CONTRACT_NOT_ACTIVATION`. E5 개발 인수 범위 안의 소유자 간 구현안이다. E4-A 후보0e6d422의 로컬42개는 통과했으나 최종 원격 검사는 아직 대기다. API current 준비97f6413과 memory 호환 입력v3도 전체 연결 인수가 아니다. 아래 조립/복구 포트는 E4·API의 Astra/High 검토 후 확정하며, 기존 계약·24필드·정책·120/600·accepted 고정 권리를 변경하지 않는다.

## 전역 작업자 권한과 intent별 권한

E4의 wire `workerFence`는 한 vault/runtime의 전역 단조 fence다. API의 intent별 lease fence를 그대로 전달하지 않는다. API DB에 runtime별 단일 활성 worker lease와 영속 단조 fence를 두고 여러 intent는 그 worker 아래 직렬 실행한다. intent별 기존 lease/attempt 이력은 보존하며 E3 commitment가 두 권한을 함께 결합해야 한다.

전역 lease 인수는 짧은 원자 transaction으로 처리한다. 만료 후 다른 worker의 인수는 fence를 올리고 모든 옛 worker의 새 서명/송신을 거부한다. 전역 heartbeat는 업무 revision/sequence나 이미 발급된 capability의 원래 만료를 연장하지 않는다. API 저장소가 옛 값으로 돌아가 E4의 저장 fence보다 낮아지면 안전 정지하며 숫자를 임의로 맞추지 않는다. runtime lineage generation과 실제 contract epoch는 별개다.

현재성 callback은 전역 lease와 intent별 lease, 서비스 인증, E3 원천/동의/이의/current CAS 및 정확한 명령을 최종 동기로 대조한다. accepted claim의 읽기/고정 청구에는 원천·동의·현재 key/epoch/pause를 다시 자격 조건으로 요구하지 않는다.

## owner 조립과 비밀 없는 포트

worker에는 owner instance/DB/key/bytes accessor를 전달하지 않는다. E4 소유 bridge가 public runtime projection, 제한된 reader/ancestry 검증, 제한된 controller 인증 issuer, 비밀 없는 worker facade와 owner 전용 one-time controller binding을 제공하는 방식을 검토한다. callback 구성 전의 facade는 UNBOUND로 거부하고, API store 생성 뒤 내부 controller를 한 번만 연결한다. 공개 HTTP의 body/ref/boolean이 이 조립을 대신할 수 없다.

controller issuer는 지급 키와 다른 TEST 키를 E4가 보유한다. 허용된 runtime과 capability/current/commit 인증 형식만 서명하는 동기 포트로 제한하고 API/worker에 wallet이나 일반 digest signer를 반환하지 않는다. API는 issuer 전후 현재성을 재검사하며 DB transaction 동안 RPC를 하지 않는다.

E4 `checked`의 async 관측이 API 사전 읽기보다 새 블록에 도달할 수 있다. callback에는 등록된 E4 reader가 실제 canonical ancestry 검증을 마친 근거를 전달해야 한다. 새 블록을 허용하는 boolean 또는 hash만으로 대체하지 않는다. in-process private ticket/검증 포트 같은 소유권 결합을 사용한다면 runtime·query·anchor·current checkpoint·업무 hash·정확 command와 결합하고 browser가 재구성할 수 없게 한다. 이미 외부로 나간 거래를 이 확인으로 취소할 수는 없다.

## 저장된 거래 인수와 응답 유실

원래 signed envelope binding/command/bytes/manifest는 불변이다. 새 worker의 현재 dispatch binding은 별도 인수 이력으로 기록하고 E4와 API 양쪽의 현재 전역 fence/lease 및 같은 intent/request/attempt/operation·runtime/lineage·정확 명령에 결합한다. 인수는 원래 거래의 서명·hash·account nonce·authorization nonce·calldata·fee를 바꾸지 않는다. source/첫 시작/공개/원래 거래의 안전한 송신 기한도 늘리지 않는다.

인수와 새 commit 확인이 완료되기 전 송신은 금지한다. 이미 SEND_STARTED/UNKNOWN이면 자동 재전송·재서명·fee bump·새 operation을 만들지 않고 원래 hash의 canonical 조회만 한다. DB fence가 이미 시작된 네트워크 송신을 취소했다고 주장하지 않는다.

인수 설계에서 **worker 권한 만료와 불변 업무/서명 송신 한도**를 분리해야 한다. A의 row는 dispatchUntil을 원래 worker capability 만료에도 묶으므로, lease 만료 후에만 새 worker가 인수한다면 그 A row를 송신할 수 없다. 이를 기존 row의 기한 덮어쓰기로 해결하지 않는다. B의 새 명시 버전은 seal 때 원래 source cutoff·.3 message expiry·review cap·독립적인 최대 envelope 송신 수명 안의 불변 businessValidUntil을 검증해 저장하고, 현재 worker authorityUntil은 별도로 둔다. 새 인수는 fresh worker 권한과 같은 업무의 재검사를 통해 businessValidUntil 안에서만 현재 송신 허용을 만들 수 있다. heartbeat는 그 허용을 자동 갱신하지 않는다. A의 과거 row/binding/manifest는 그대로 원래 의미로 보존한다. 이 구분은 source 수명·120/600 또는 claim 권리 만료를 바꾸는 정책 변경이 아니다.

seal 응답 유실은 인증된 원래 request/intent/attempt/command identity로 기존 ref/hash를 조회하는 포트가 필요하다. 조회가 불확실하면 HOLD이며 E4_SEAL_REQUESTED를 지우고 다시 seal하지 않는다. 비밀 bytes/서명은 조회 결과에도 반환하지 않는다. source-independent recovery/retention 권한은 새 지급 자격 승인과 구분한다.

## 전체 절차와 별도 settlement

실제 reader 관측으로 등록→전액배정 확인→E3 공개→chain review 시작→현재 동의/이의 반영→새 unsigned 준비→영속 authorization nonce 결합/chain prepare→accept를 순서대로 연결한다. 과거 synthetic chain/funding 포트를 실제 관측으로 표시하지 않는다. TEST source와 실제 chain 관측의 종류도 구분한다. 원래 120/600과 source 취득/배타 만료는 그대로다.

정상 자동 지급은 canonical accept receipt/current readback 뒤 application/allocation/accepted digest에 고유한 별도 claim job을 만든다. claim에는 contract operationId가 없으므로 가짜 op를 만들지 않는다. SETTLED state만으로 token transfer receipt 검증을 대신하지 않는다. 새 지급 서명 없이 고정 수령자100 TEST만 정산한다.

의도적 backend-stop 검사는 accept 뒤 자동 claim 앞에서 API·worker·service를 모두 멈추고 독립 EVM을 유지한다. 별도 anycaller가 고정 권리를 claim하고 재시작 뒤 canonical receipt/current state를 인수한다. 정상 자동 claim과 이 fault 시나리오를 각기 검증한다. reorg는 증명 후 RECOVERY_BLOCKED가 최소 허용이며 등록/공개/기한을 자동 재생성하지 않는다.

## 소스 인수 순서

원래 memory boundary-v1와 E2 입력은 유지한다. 검토된 current 준비97f의 v3는 immutable 검토 기록이며 추가 구현이 바꾸는 source에는 다시 새 버전의 검토 지문이 필요하다. 실제 소유 이력의 정상 merge·명시 consumer 갱신·관련 회귀와 exact-head 필수 CI 후에만 해당 범위를 인수한다. E4-A 원격 실패 해결 전 실제 B 실행 연결은 켜지 않는다. 이 초안으로 main/develop 병합·배포·실제 인터넷 원천·추가 유료 모델 호출을 허용하지 않는다.
