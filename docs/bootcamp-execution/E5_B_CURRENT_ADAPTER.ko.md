# E5-B 현재 E3 검사·내부 handshake — 부분 인수

2026-10-19. `LOCAL_CURRENT_ADAPTER_REVIEW_READY_FULL_E5_B_BLOCKED`.
기준은 E5-A `d534f4bc3fbf56845239853cc947a496a97847a2`다. 요청/추천 설정은 증명·권한·재사용 경계에 대한 Astra/High이며, 실제 실행 모델 설정은 독립 확인하지 않았다. E4 소유 작업본의 공개 `e5/PORTS.ko.md`, reader/envelope-service/environment 코드를 읽었지만 최종 E4 HEAD·검증·CI를 인수하지 않았다. 해당 소유 파일, private 파일, 기존 환경은 수정하거나 실행하지 않았다.

## 구현 범위와 활성화

`executionConnection=null`이 기본값이다. 별도 constructor 입력 `clear-bootcamp-e4-current-connection.1`은 `sourceMode:SYNTHETIC_TEST_SOURCE`, public runtime pin, 비밀 없는 reader `{observe,compare}`, 선택적인 controller certificate issuer `{certifySync}`, 선택적인 E4 worker facade `{observe,seal,dispatch,recover}`만 받는다. 클래스 instance·DB·키·bytes accessor를 포함하는 객체와 잘못된 표시는 거부하고 함수를 생성 시 고정한다. 기존 `SYNTHETIC_PORT_FIXTURE` chain/funding/authorization 함수는 새 current 검사에서 호출하지 않는다. 기존 E3 fixture port의 활성화 규칙도 바꾸지 않았다.

내부 서비스 인증 후 `store.execution.connectCurrentController(context)`는 owner용 `controller`와 worker용 `worker`를 나누어 반환한다. 서버 조립자는 controller를 E4에, worker만 실행 worker에 전달해야 한다. HTTP endpoint는 추가하지 않았다. worker에는 issuer, controller callback, DB, wallet, private key 또는 raw transaction accessor가 없다. 같은 UID의 악성 코드를 격리하는 보안 경계는 아니다.

`execution-current.mjs`는 PREPARE/ACCEPT에 대해 실제 E3 DB의 신청·현재 결정·원천 head/guard·공개·첫 시작·동의·이의·재검증·unsigned preparation을 읽는다. source commitment와 배타적 cutoff, 현재 course operator binding, 정확 동의 집합, 미해결 이의, 한 번의 재검증, 120/600 창을 검사한다. reader 관측의 chain target/version/epoch/allocation/procedure/source/consent/nonce/key/pause/accounting과 저장된 24필드를 대조한다. 실제 E2 inspector를 서버 시간과 chain checkpoint 시간에 각각 적용한다. `accept`에는 준비된 digest/nonce/deadline도 요구한다. 명령은 저장된 payload에서 재구성하고 caller와 명령 SHA256을 intent와 비교한다. 원천 수집 시각·만료·공개·첫 시작을 갱신하지 않는다.

이 버전은 **기존 준비물의 현재성 검사**를 구현한다. 실제 E4 관측으로 REGISTER/ALLOCATE/START_REVIEW/BIND_CONSENTS 및 새로운 unsigned preparation을 순서대로 생성하는 전체 orchestration은 아직 없다. 다른 명령은 `BC_E5_COMMAND_ADAPTER_PENDING`으로 거부한다. 테스트의 E3 준비물 생성에는 과거 합성 fixture가 쓰이며, 이후 current 검사에서 그 fixture port를 호출하면 실패하도록 시험했다. 이것을 실제 전체 연결 성공으로 기록하지 않는다.

## 내구 기록과 동기 인증

새 DB schema나 기존 E3 record 수정 없이 E5 append-only events에 `E4_CURRENT_BINDING`, `E4_CHAIN_OBSERVATION`, `E4_SEAL_REQUESTED`, `E4_SEALED_REFERENCE`, `E4_RECOVERY_BLOCKED`를 기록한다. 기존 attempt/lease/runtime을 재사용한다. 별도 migration이 없어도 모든 기록은 기존 E5 writer guard와 짧은 transaction을 통과한다.

binding은 intent/request/attempt/runtime/lineage/worker/fence/lease, E3 CAS commitment, 정확 command, 최초 anchor/business 및 원래 expiry를 고정한다. `worker.prepare(handle, expected)`는 transaction 밖에서 등록 reader를 호출하고 private WeakMap ticket을 받는다. transaction 안에서 서비스 권한·lease/fence·업무 CAS·원천/동의·관측 CAS를 다시 검사한 뒤 binding과 attempt를 원자 기록한다. metadata A attempt를 B 실행 attempt로 자동 승격하지 않는다. 재시작·heartbeat·정상 블록 성장으로 binding이나 원래 expiry를 바꾸지 않는다.

controller의 `readCurrentSync`는 phase/challenge/runtime/binding/observation hash를 검사하고 DB current를 재구성한 뒤 내부 인증 증명을 반환한다. issuer는 controller TEST 키를 소유한 외부의 제한된 동기 포트여야 한다. API는 키를 읽지 않고 반환 증명의 공개키·정확 payload를 검증한다. issuer 호출 후에도 원천/동의/CAS를 재검사하고 최종 서비스 권한이 짧아지면 transaction을 거부한다. issuer가 없으면 인증 증명을 발급하지 않는다. 이 인증 서명은 .3 지급 서명이 아니다.

`worker.seal`은 인증된 원래 binding을 E4에 전달하기 전에 `E4_SEAL_REQUESTED`를 커밋한다. 외부 await 동안 DB lock을 잡지 않는다. 등록 service가 반환한 `{ref,manifestHash}`만 private ticket으로 수락하고, await 후 current/fence 검사와 reference 저장을 원자 처리한다. response loss·중간 실패·늦은 결과 뒤에는 이 요청 표지를 보존하며 자동 재서명·새 operation/nonce/attempt를 만들지 않는다. 실제 signed bytes와 nonce 예약은 E4 책임이다. 이번 시험의 service는 hash-only 오프라인 대역이고 지급/거래 서명은 만들지 않았다.

**dispatch는 계속 차단**이다. `worker.dispatch()`는 외부 함수를 호출하지 않는다. `commitCurrentSync`는 실제 DB에 ref/hash와 원래 binding이 일치하는지 검사하지만, 아직 인증 commit certificate를 발급하지 않고 `BC_E5_E4_DISPATCH_REVIEW_PENDING`으로 중지한다. ref 저장이나 A metadata 확인을 dispatch grant로 해석할 수 없다.

## 블록 성장, reorg와 기존 권리

정상 새 블록은 captured reader의 compare가 같은 anchor의 canonical 후속을 확인하고 업무 hash가 동일할 때만 허용한다. constructor reader가 만든 ancestry 결과만 동기 witness cache에 들어간다. 아직 캐시에 없는 새 블록 callback은 `BC_E5_CANONICAL_REVALIDATION_REQUIRED`로 거부한다. `worker.prepare` 재검사는 원래 binding/expiry를 보존한다. 동일 높이의 다른 hash, 같은 블록의 업무 모순, version/epoch 회귀를 수락하지 않는다. 관측 nonce 질의가 달라진 경우 그 질의 필드만 별도로 비교한다.

확인된 reorg 또는 version/epoch 회귀는 API runtime을 영속 `RECOVERY_BLOCKED`로 중지하고 과거 binding/관측/attempt를 보존한다. 자동 generation 증가·reset·rebase·예약 해제는 없다. RPC 실패나 낮은 block 값만으로 새 계보를 만들지 않는다. E4는 별도로 실제 ancestry와 canonical 상태를 매번 검증해야 한다. API의 cached proof는 이미 외부로 나간 raw transaction을 취소하지 못한다.

`worker.readAcceptedRight`는 historical publication의 recipient/token/allocation/decision과 고정 100 TEST 권리를 대조하고 별도 현재 관측을 원자 기록한다. 만료 source, key/epoch/pause, 현재 consent와 새 지급 signature를 요구하지 않는다. CLAIM에는 가짜 operationId를 만들지 않으며 `claimOperationId:null`, `settlementJob:NOT_IMPLEMENTED`, `receiptVerified:false`를 반환한다. SETTLED state 조회를 token transfer receipt 검증이나 실제 지급 완료로 승격하지 않는다.

## 소유자 간 확정이 필요한 포트

1. E4 최종 HEAD와 검증 후 owner가 public runtime projection과 비밀 없는 `{observe,compare}` 및 worker facade를 조립해야 한다. API는 environment/ownedTestWallet/OwnedExecutionService를 import하거나 읽지 않는다. 현재 E4 worker facade에는 compare가 없어 별도 제한된 reader facade가 필요하다.
2. controller key는 E4/별도 keyholder가 보유하고 API에는 제한된 `certifySync`만 제공해야 한다. 현재 E4 testController의 wallet 접근을 실제 API 코드에 복사하지 않는다. 생성된 TEST 인증 키만 사용한 offline 검증과 실제 issuer 인수는 다르다.
3. E4의 await 중 새 블록 관측이 API 사전 재검사보다 앞설 때 authenticated ancestry evidence를 callback에 결합하거나 동일한 captured reader/cache를 조정하는 계약이 필요하다. 무조건 새 블록을 승인하는 플래그는 추가하지 않는다.
4. 새 worker fence의 SEALED 원문 인수는 미완료다. 원래 signed binding과 현재 dispatch binding을 별도로 다뤄야 한다. 또 API의 fence는 intent별이고 현재 공개 E4 runtime fence는 전역이므로 여러 intent의 조합 전에 범위/단조성 계약을 확정해야 한다. 기존 binding의 fence를 고쳐 전송하지 않는다.
5. seal 응답 유실 뒤 request/intent/attempt로 **기존** ref/hash를 조회하는 인증 포트가 필요하다. `E4_SEAL_REQUESTED`를 지우거나 새 서명으로 복구하지 않는다. recovery/retention 단계의 source-independent service authority도 별도 인수가 필요하다.
6. 실제 unsigned prepare 생성과 durable .3 authorization nonce reservation→prepare canonical readback→accept 연결, commit certificate/dispatch, receipt+current readback의 원자 수락은 후속이다. 계약/24필드/E2 타입은 변경하지 않았다.
7. CLAIM은 별도 settlement job/receipt 의미를 구현해야 한다. 정상 accept→자동 claim과 의도적 backend-stop after accept→독립 claim→restart readback을 분리해 실제 TEST 환경에서 검증해야 한다. 이번 단위에서는 둘 다 실행하지 않았다.

## 검증과 source review

E5-B 신규 36개, 기존 E5-A 44개, 기존 E1/E3 158개: 총 238개 PASS, fail/cancel/skip 0. 변경한 최종 서비스 권한 축소 시험은 정확히 해당 시험을 추가 실행해 PASS를 확인했다. issuer/키 검사는 테스트 중 생성한 일회용 내부 인증 키를 사용했고 외부 네트워크 guard 아래 실행했다. 기존 A의 실제 SIGKILL 5지점/독립 process lease race와 별도로 B의 transaction rollback 3지점, 응답 유실 및 재시작 표지 검사를 수행했다. 실제 B 서비스 프로세스 강제 종료나 체인 통합을 수행한 것은 아니다.

workspace 원본/legacy 191개·reference 4개·의존성·pending manifest 보존 검사를 통과했다. reference 계약은 메모리 compile만 했다. 실측 chain/source/payment signature/transaction/배포/유료 호출은 0이다. 결과·파일 SHA는 [E5_B_CURRENT_VERIFICATION.json](E5_B_CURRENT_VERIFICATION.json)을 따른다.

root v2 `3f9f135b8404c3da402808fd7b7a35151d8e621f`는 d534 metadata-only exact bytes에 대한 기록으로 읽기만 했다. 이 변경의 store/operations와 새 import 3개는 그 v2 범위가 아니다. 원래 boundary-v1/v2와 E2/계약/공통 specs/CI는 수정하지 않는다. root의 새 v3 source review와 E4의 explicit consumer 갱신 전까지 memory 통합·원격 push/CI는 보류한다. source pin 실패를 반복 실행하거나 약화하지 않는다.

기존 금고·DB·체인·키, 멘토 미결 정책, 400% 자동 자격/지급 금지, 500% 제외, Moodle·원천 차단, 기존 grant/outbox HOLD, 독립 청구 NO-GO, Mac 실패 정확 원인 미확정을 유지한다. 전체 E5-B 완료 보고가 아니다.
