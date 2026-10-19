# E5-A TEST 실행 서비스

새 소유 persistent Geth에서 실제 실행 reader와 private durable envelope를 구현했다. **실제 API/E3 adapter 연결과 E5 전체 복구 인수는 아직 BLOCKED**다. 기본 `createExecutionSignerAdapter()`와 `createExecutionService()`를 켜지 않는다. 이 변경은 기존 E4 accepted head와 공통 E5 개발 intake에 따른 별도 TEST 경계다.

핵심 파일은 `environment.mjs`(새 환경과 lifecycle), `reader.mjs`(canonical 상태/영수증), `envelope-service.mjs`(권한·nonce·영속 서명/전송), `private-storage.mjs`와 `rpc.mjs`, `host.mjs`다. 실제 API 소유자에게 넘기는 정확한 메서드와 입력은 [포트 명세](PORTS.ko.md), 수정한 반례와 미완료 범위는 [리뷰](REVIEW.ko.md), 실행 결과와 소스 지문은 [검증 기록](verification.json)에 있다.

Geth는 공식 `ethereum/client-go:v1.17.8`의 immutable image digest를 사용한다. 각 환경은 새 chainId/genesis/instance/domain·키·datadir를 갖고 chainId와 networkId를 따로 조회한다. host 공개는 `127.0.0.1`의 고정 port, namespace는 eth/net/web3, peer0/dev/no-discovery다. Docker bridge를 네트워크 air-gap으로 표현하지 않는다. dev finality는 공개망 PoS FINALIZED가 아니며 reader는 INCLUDED만 반환한다.

Ganache7.9.2는 실제 hash selector probe에서 거부하여 사용하지 않았다. Geth는 canonical/historical hash 조회와 unknown hash 거부 외에 **보존된 알려진 orphan**으로 검사했다. 같은 orphan에 requireCanonical=false는 성공, true는 거부된다. 숫자 높이 fallback은 없다. TEST IPC의 분기 조작은 신청과 열린 권리가 없는 새 환경으로 제한되며 worker/RPC HTTP에 노출하지 않는다.

prepare 전 .3 authorization nonce와 Ethereum role account nonce를 별도로 영속 예약한다. key 접근 전/서명 후/송신 직전에 authenticated current/fence를 확인하며, 특히 모든 async chain read 뒤 마지막 동기 확인이 있다. 정확 signature/raw tx는 역검증·fsync·원자 저장한 뒤 SEALED가 된다. API의 ref commit 확인과 SEND_STARTED 저장 전에는 보내지 않는다. opaque ref나 body boolean은 권한이 아니다. worker에는 비밀 accessor/DB가 없는 bound facade만 전달한다.

응답 유실은 저장 txHash의 canonical 조회로 복구한다. 새 operation, 재서명, nonce 재사용, fee bump/cancel/replacement를 자동 수행하지 않는다. receipt 관측 이력을 보존하고 현재 chain을 별도로 확인한다. 증거 없는 후퇴는 거부하며 proven reorg는 RECOVERY_BLOCKED로 정지한다. 원래 publication/firstStart·120/600을 재설정하지 않는다.

별도 dispatch120초·복구 bytes7일·환경 수명 동안 tombstone 정책을 사용한다. 원천의 승인된 최대1800초·최소 lease 정책과 별개다. 삭제 실패는 기록하며 unlink가 이미 전송된 tx의 취소나 완전 소거라고 주장하지 않는다. 소유 TEST 환경은 시험 후 중지하고 bridge만 park한다. 체인·키·envelope는 보존한다. setup 실패도 정확 소유 자원만 bounded cleanup하며 원래 오류와 private 증거를 남긴다.

재현은 pinned Node24.21.0 및 Docker가 필요하다. 공개 네트워크는 공식 image/dependency 다운로드에만 사용하며 시험 RPC/거래는 새 loopback TEST 체인이다.

```sh
./tools/node tests/hackathon-test-vault/e5/ganache-probe.mjs
./tools/node --test --test-concurrency=1 tests/hackathon-test-vault/e5/*.test.mjs
./tools/node tests/hackathon-test-vault/e5/preservation.mjs
```

전용 `hackathon-e5.yml` CI는 E5 suite와 기존 준비50·compile/signer66·memory48, 원본/graph/공개 이력 검사를 실행한다. 다른 팀의 API/common workflow나 branch protection을 수정하지 않는다. 새 workflow가 공동 CI에 추가된다는 영향은 PR에 명시한다.

공동 후속은 실제 API ledger/lease/CAS adapter, 새 호환 입력 v2의 명시적 소비 인수, 새 fence의 SEALED takeover/adoption, 자동 accept→claim, API와 worker 전체 중단 뒤 독립 claim이다. 자체 서비스 중단 뒤 새 anycaller의 고정100 단회 claim은 시험하지만 이를 전체 backend-stop 완료로 기록하지 않는다. 실제 원천·paid 모델·공개 체인·production 실행은 없다. 기존 사용자 키/.env/DB/체인/volume을 읽거나 reset하지 않았다.

공식 근거: [Geth dev mode](https://geth.ethereum.org/docs/developers/dapp-developer/dev-mode), [Geth eth RPC](https://geth.ethereum.org/docs/interacting-with-geth/rpc/ns-eth), [공식 설치/containers](https://geth.ethereum.org/docs/getting-started/installing-geth), [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898), [v1.17.8 testing API](https://github.com/ethereum/go-ethereum/blob/v1.17.8/eth/catalyst/api_testing.go), [동일 태그 admin import/export](https://github.com/ethereum/go-ethereum/blob/v1.17.8/eth/api_admin.go). 실제 지원 판정은 문서만으로 하지 않고 위 runtime 시험으로 확인했다.
