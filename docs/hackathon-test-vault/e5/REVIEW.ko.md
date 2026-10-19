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
| post-commit readback 실패를 tx 실패로 오인할 위험 | UNKNOWN과 canonical lookup 분리. receipt 관측을 append-only로 보존. 과거 receipt 포함과 최신 canonical checkpoint를 둘 다 확인 |
| 새 fence의 recovery가 원래 envelope 전송 권한이 되는 위험 | 새 fence는 조회만 허용, dispatch는 원래 binding/fence만 허용. SEALED takeover/adoption은 E5-B 미완료 |
| accepted claim을 현재 원천/키/pause 재검증으로 막을 위험 | claim 업무 hash는 고정 right와 상태만 결합. source 철회/key revoke/pause 뒤 이미 SEALED인 claim도 지급 서명 추가 없이 처리 |
| reorg나 낮은 값으로 원래 120/600을 재시작할 위험 | 증거 없는 후퇴 거부, proven reorg는 영속 RECOVERY_BLOCKED. 새 lineage 자동 활성화/등록·공개 재생성/옛 receipt 자동 승격 없음 |
| 예외에 private raw bytes가 섞일 위험 | JSON/transaction 역검증 오류를 고정 E5 코드로 치환. worker 반환에 signature/raw calldata/raw tx 없음 |

현재성 검사는 외부 chain await 뒤에도 마지막 동기 DB/controller 확인으로 마친다. API commit 확인은 challenge-bound 내부 인증 callback이며 caller의 boolean/ref/txHash를 권한으로 쓰지 않는다. SEND_STARTED를 commit한 뒤의 새 fence는 이미 시작된 네트워크 송신을 취소할 수 없다. 계약 nonce/expectedVersion/epoch/prepared 조건과 canonical readback이 함께 필요하다.

이 버전의 안전 정지 경계는 의도적으로 남겼다: PREPARING/SIGNING_UNCERTAIN/UNKNOWN 자동 재서명 없음, 수수료 증액/취소/교체 없음, reorg 재기준 및 새 worker의 SEALED adoption 없음. 실제 API adapter·자동 accept→claim·API/worker 전체 중단 시험과 호환 입력 v2 소비 변경은 root의 다음 인수 단위다.

초기 실패 이력도 보존한다. 첫 호스트는 Docker 실행 경로 누락, 다음은 internal bridge의 미게시 포트였다. 첫 서비스 suite17개 중 restart1개 실패를 명시 포트로 수정했다. 최초 reorg fixture는 콘솔 datadir/숫자 인수 및 state-selector 개수 assertion 오류가 있었고, 다음에는 실제 orphan이 생성되지 않았음을 잡았다. 실제 orphan이 생성되어도 삭제된 header는 `requireCanonical` 효과를 구분할 근거가 아니므로 retained orphan fixture로 강화했다. 반복 과정의 network pool 소진을 lifecycle park로 해결했다. 최종 성공 횟수에 초기·부분·원격 재실행 횟수를 합산하지 않는다.

소유 TEST private 자료는 Git 제외이며, 테스트 종료는 chain과 키를 지우지 않고 container를 중지하고 network만 해제한다. 기존 사용자 키/.env/DB/체인/volume, 실제 원천·공개 체인·paid API를 읽거나 사용하지 않았다. 런타임은 Geth dev/no-peers 및 host loopback 공개이며 네트워크 수준의 완전 air-gap으로 표현하지 않는다.
