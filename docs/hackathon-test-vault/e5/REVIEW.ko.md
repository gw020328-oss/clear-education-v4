# E5-A 경계 검토 — 2026-10-19

범위는 새 `src/hackathon-test-vault/e5`의 환경·reader·private envelope, 전용 TEST fixture/CI다. 주 세션의 직접 코드 리뷰와 root의 소스 경계 지적을 반영했다. 별도 보안 감사나 실제 API 통합 인수가 아니다. 기존 E4 accepted17dca2e 위에 공통249f4bd를 정상 merge한 e38ef0b에서 시작했다.

| 발견한 문제/미완료 경계 | 처리와 검사 |
| --- | --- |
| 자동 host port가 Docker stop/start에서 달라짐 | 생성 시 새 loopback 빈 포트를 명시 고정하고 재시작 때 동일 endpoint 확인. chain/genesis/회계/app 상태 보존 시험 |
| setup 실패 뒤 새 container가 남을 위험 | 정확 ID/label/image로 자기 container만 bounded stop, 자기 bridge만 park하고 chain/key evidence 보존. cleanup 실패가 원래 오류를 덮지 않음 |
| worker가 owner instance의 비밀 accessor를 받을 위험 | observe/envelope/seal/dispatch/recover bound facade만 전달. 실제 API wiring은 별도 인수 |
| 중지된 TEST network가 Docker 기본 주소 풀을 소진 | 중지·소유 label·단일 container 확인 후 bridge만 park. chain/keys/envelope/container는 보존하고 start 때 새 전용 bridge 복원. 전역 prune/reset 없음 |
| Geth 콘솔의 오류가 exit0로 끝날 수 있음 | hex 인수·정확 null 응답·실제 높이 변경 검증. 신청/권리가 없는 새 TEST 환경에서만 rewind 허용 |
| rewind만으로는 orphan header가 삭제되어 requireCanonical 자체를 검증하지 못함 | Geth의 실제 testing/admin IPC로 빈 분기 블록 생성/내보내기/되감기/대체/재수입. 보존된 비canonical hash의 false 성공/true 거부를 네 RPC에서 확인. RPC 재응답으로 꾸민 분기가 아님 |
| nonce 예약 뒤 시험 cut에서 current가 바뀔 수 있음 | cut 뒤 첫 키 접근 바로 앞에 동기 current/fence 검사. withdrawal/fence 변화 모두 keyAccesses0 |
| Ethereum nonce와 .3 authorization nonce는 다른 자원 | 준비 서명 전 .3 nonce를 별도 durable table에 앱/계보/typed digest/prepare request로 고유 예약. accept는 canonical prepare가 반영된 PREPARED 예약을 요구. 재사용/바꿔치기 거부 |
| 과거 prepare recovery가 .3 nonce 상태를 뒤로 내릴 수 있음 | PREPARE_RESERVED→PREPARED, PAYMENT_SIGNING_STARTED→ACCEPTED만 허용. 이미 수락된 nonce tombstone은 과거 조회로 하향하지 않음 |
| 서명된 bytes가 durable해도 SEALED metadata 앞에서 죽을 수 있음 | 공개 역검증 metadata와 정확 private bytes를 fsync한 뒤 SEALED. subprocess exit 후 같은 bytes를 검증·인수하며 재서명0. bytes 없는 불확실성은 자동 복구/nonce 재사용 금지 |
| broadcast 직후 영수증이 반드시 존재한다는 시험 가정 | 실제 미채굴 UNKNOWN을 확인했다. 서비스는 자동 재전송하지 않고, 성공 기대 fixture만 정확 txHash의 채굴을 기다린 후 recover한다. RPC/readback 오류를 timeout 증액으로 숨기지 않음 |
| UNKNOWN 뒤 included helper가 재조회할 때 관측 건수를1로 고정한 시험 가정 | root 리뷰에서 발견했다. 첫 receipt 부재를 의도 주입하고 UNKNOWN→INCLUDED 두 append-only 관측을 정확 확인한다. 이 발견 시점에 원격 실패가 발생했다고 주장하지 않음 |
| post-commit readback 실패를 tx 실패로 오인할 위험 | UNKNOWN과 canonical lookup 분리. receipt 관측을 append-only로 보존. 과거 receipt 포함과 최신 canonical checkpoint를 둘 다 확인 |
| 새 fence의 recovery가 원래 envelope 전송 권한이 되는 위험 | 새 fence는 조회만 허용, dispatch는 원래 binding/fence만 허용. SEALED takeover/adoption은 E5-B 미완료 |
| accepted claim을 현재 원천/키/pause 재검증으로 막을 위험 | claim 업무 hash는 고정 right와 상태만 결합. source 철회/key revoke/pause 뒤 이미 SEALED인 claim도 지급 서명 추가 없이 처리 |
| reorg나 낮은 값으로 원래 120/600을 재시작할 위험 | 증거 없는 후퇴 거부, proven reorg는 영속 RECOVERY_BLOCKED. 새 lineage 자동 활성화/등록·공개 재생성/옛 receipt 자동 승격 없음 |
| 예외에 private raw bytes가 섞일 위험 | JSON/transaction 역검증 오류를 고정 E5 코드로 치환. worker 반환에 signature/raw calldata/raw tx 없음 |

현재성 검사는 외부 chain await 뒤에도 마지막 동기 DB/controller 확인으로 마친다. API commit 확인은 challenge-bound 내부 인증 callback이며 caller의 boolean/ref/txHash를 권한으로 쓰지 않는다. SEND_STARTED를 commit한 뒤의 새 fence는 이미 시작된 네트워크 송신을 취소할 수 없다. 계약 nonce/expectedVersion/epoch/prepared 조건과 canonical readback이 함께 필요하다.

이 버전의 안전 정지 경계는 의도적으로 남겼다: PREPARING/SIGNING_UNCERTAIN/UNKNOWN 자동 재서명 없음, 수수료 증액/취소/교체 없음, reorg 재기준 및 새 worker의 SEALED adoption 없음. 실제 API adapter·자동 accept→claim·API/worker 전체 중단 시험과 호환 입력 v2 소비 변경은 root의 다음 인수 단위다.

초기 실패 이력도 보존한다. 첫 호스트는 Docker 실행 경로 누락, 다음은 internal bridge의 미게시 포트였다. 첫 서비스 suite17개 중 restart1개 실패를 명시 포트로 수정했다. 최초 reorg fixture는 콘솔 datadir/숫자 인수 및 state-selector 개수 assertion 오류가 있었고, 다음에는 실제 orphan이 생성되지 않았음을 잡았다. 실제 orphan이 생성되어도 삭제된 header는 `requireCanonical` 효과를 구분할 근거가 아니므로 retained orphan fixture로 강화했다. 반복 과정의 network pool 소진을 lifecycle park로 해결했다. 최종 성공 횟수에 초기·부분·원격 재실행 횟수를 합산하지 않는다.

소유 TEST private 자료는 Git 제외이며, 테스트 종료는 chain과 키를 지우지 않고 container를 중지하고 network만 해제한다. 기존 사용자 키/.env/DB/체인/volume, 실제 원천·공개 체인·paid API를 읽거나 사용하지 않았다. 런타임은 Geth dev/no-peers 및 host loopback 공개이며 네트워크 수준의 완전 air-gap으로 표현하지 않는다.

## 최종 3e11 CI의 동시 관측 실패와 수정

최초 실패는 `3e11a8eb8f1925aad0d2a93f405f80e4b4ba6835`의 [PR run39202079577/job117899079948](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39202079577/job/117899079948), `service.test.mjs:144`다. E5 32 PASS / 1 FAIL, skipped/cancelled0. 두 서비스 프로세스 시험의 성공 exit0 개수가 기대1/실제0이었다. 당시 각 child의 실제 exit code/signal은 assertion에 포함되지 않았고 stdout/stderr는 ignore였으며 catch는 모든 오류를87로 바꿨다. 따라서 **최초 실패의 개별 오류 코드는 복원할 수 없다**. 같은 HEAD의 push run39202075445는 E5 33 및 기존164 PASS였지만 실패한 PR 결과를 대체하지 않는다. 구 실행을 rerun하지 않았다.

코드 검토에서 확인한 경로는 동기 nonce 예약 자체와 별개인 checkpoint 기록 경쟁이다. A의 BEFORE_SIGN 관측 seq1 → A의 nonce 예약/서명 → A AFTER_SIGN의 seq1 read 및 canonical compare 완료 후 정지 → B가 같은 canonical checkpoint를 seq2로 append → B는 ROLE_NONCE_BUSY로 거부 → A는 seq 차이 때문에 CHECKPOINT_CAS_RETRY_REQUIRED로 거부된다. A는 SIGNING_UNCERTAIN이고 새 bytes/전송은 없다.

새 TEST IPC barrier와 실제 소유 Geth로 **수정 전 코드에서 이 순서를 결정적으로 재현**했다. A exit87/CHECKPOINT_CAS_RETRY_REQUIRED, transactionSignatures1/broadcasts0; B exit87/ROLE_NONCE_BUSY, keyAccesses0. 두 lease는120초 남았고 child build는 약3.6초, timeout=false였다. 이는 원인 후보의 실제 반례이며 최초 CI에서 같은 순서였다는 소급 확정은 아니다.

필요 수정은 `track`의 동일 관측 처리에 한정했다. 기존 canonical compare 후, SQLite transaction 안의 최신 관측이 정확히 같은 runtimeHash·checkpoint hash/number/time·INCLUDED finality일 때만 추가 sequence를 만들지 않는다. 다른 concurrent record에는 기존 CAS 거부를 유지한다. receipt_observations의 UNKNOWN→INCLUDED append-only 이력은 이 변경 대상이 아니다. 원천/lease/current/fence·서명 전후 검사와 nonce 예약, 재서명 금지는 바꾸지 않았다.

검사는 다음 경계를 분리한다.

- 순수 nonce 경합: 두 실제 child의 reader 컴파일을 끝낸 뒤 원래120초 capability를 발급한다. BEFORE_SIGN 관측을 모두 마친 barrier에서 두 child를 함께 해제하여 동기 nonce 예약1승/ROLE_NONCE_BUSY1거부를 확인한다. 승자는 서명1회, 패자는 키 접근0이며 envelope row는1개다.
- 같은 checkpoint 경합: 위 실패 순서를 유지하되 수정 후 A SEALED/B nonce busy, checkpoint 관측은1개다. 성공 기대를0으로 낮추거나 재시도하지 않는다.
- 다른 checkpoint 경합: A의 compare 뒤 실제 Geth 블록을 채굴하고 B가 새 checkpoint를 기록한다. A는 계속 CAS 거부/SIGNING_UNCERTAIN, B는 nonce busy다. 같은 요청 재호출도 추가 키 접근/전송 없이 recover-only 거부한다.
- 동일성 범위: runtime/hash/number/time/finality 중 하나라도 다른 synthetic concurrent metadata는 CAS 거부한다. 이 시험용 metadata 주입을 실제 canonical RPC 증거라고 주장하지 않는다.
- 만료 구분: 컴파일 후에도 이미 만료된 capability는 CAPABILITY_EXPIRED, 키 접근0·예약0으로 거부한다. 기존 dispatch TTL 검사는 유지한다. 고정 barrier 대기45초/child 전체60초 timeout은 별도 진단이며 capability 시간을 늘리거나 시계를 고치지 않는다.
- 진단: 고정 허용목록 code/phase/cut, 정수 timing·lease 잔여시간·metrics, 부모 exit status/signal/timeout 및 stdout/stderr **바이트 수만** 보존한다. full error/stack/request/binding/certificate/key/transaction/raw dump는 출력하지 않는다. 임의 문자열/extra field 누출 거부 시험을 추가했다. 기존 crash helper도 원문 stderr 대신 같은 정제 진단만 assertion에 넣는다.

주 세션이 변경 diff와 위 반례를 직접 검토했다. 독립 보안 감사는 아니며 실제 API 연결·E5-B 인수는 여전히 별도다. 최종 수정 HEAD의 시험/CI는 verification.json과 PR 본문에 구분 기록한다.

### 별도 로컬 setup 영수증 조회 실패

CAS 수정 뒤 첫 전체 로컬 실행은33 tests/30 PASS/3 FAIL이었다(하위 fence 실패와 그 상위 시험을 각각 집계하며, 초기에 실패한 durable-accept의 하위6개는 실행되지 않음). 실패 둘의 발생 위치는 `createEnvironment`로 새 nonce 경합이나 지급 검사 이전이다. 새 소유 환경 `e5-7b477306-5a7e-4073-8f02-1382e20173dd`, `e5-228b0ee7-f555-43d5-a9cf-e43e82ee1364`의 metadata에는 UNKNOWN_ERROR, 각각 Geth 로그에는 eth_getTransactionReceipt의 `transaction indexing is in progress`가 있다. 둘 다 자기 container STOPPED/bridge REMOVED, chain/key 보존이다. 두 번째 실행에는 약108분의 벽시계 공백도 있었으며 호스트 중단 원인을 추정해서 확정하지 않는다. 이 실패는 최초 원격 child 경합 실패와 별개다.

환경 생성의 세 기존 전송(token/vault deployment, key registration)은 정확히 한 번만 수행하고 `waitSetupReceipt`가 그 txHash만 최대15초 조회한다. null pending과 ethers UNKNOWN_ERROR에 담긴 정확 indexing 메시지·receipt 메서드·동일 hash 조합만 다시 조회하며, 다른 오류·revert·다른 hash·잘못된 block 증거는 즉시 고정 오류로 거부한다. 멈춘 조회도 기한으로 거부하며 생성 실패의 기존 소유 cleanup을 유지한다. 새 서명/nonce/tx/replacement는 만들지 않는다. 배포 receipt의 contractAddress도 예상 주소와 대조한다. 실제 환경 생성·기존 실패 시험과 주입한 indexing/null/stalled/error 반례의 targeted13개가 통과했다.

SQLite 초기화 진단도 고정 nativeCode enum(ERR_SQLITE_ERROR/SQLITE_BUSY/SQLITE_LOCKED/ETIMEDOUT)만 추가했다. 다른 nativeCode와 메시지·stack은 공개하지 않는다.
