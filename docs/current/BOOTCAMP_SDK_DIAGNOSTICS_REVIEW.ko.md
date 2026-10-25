# SDK 오류·상대 시간 진단 좁은 검토

2026-10-24 최신 v17 검토는 [r8 invalid-claim 조사](BOOTCAMP_R8_INVALID_CLAIM_REVIEW.ko.md)를 따른다. 기존 검토 담당자가 새 분류기와 sink/worker 통합의 개인정보·오류 거부·firstFailure 보존을 확인했다. own message를 잠깐 분류하는 제한적 예외는 schema5에만 적용하며, 아래 v14/v15/v16의 당시 기록을 소급 변경하지 않는다.

2026-10-24 최신 검토는 [r7 전송 수정](BOOTCAMP_R7_TRANSPORT_REVIEW.ko.md)과 v16 검증을 따른다. 아래 v14/v15 내용은 각 당시 범위다. 기존 검토 담당자를 재사용해 FIFO 예약량·RPC deadline·종료/취소·observer 재진입·개인정보 경계를 확인했다. DRAIN_WAIT 관측 중 취소 후 timer 재생성, 다른 RPC의 종료 원인 소실, Node timeout 범위 초과, 미전송 만료가 다른 proof를 중단시키는 경우를 수정하고 회귀를 추가했다.

2026-10-23. 사용자 지정 작업 설정은 GPT-6 Astra / Ultra다. 이 기록은 설정 변경 도구를 통해 현재 턴의 모델을 독립 검증했다는 주장이 아니다. 수정 범위는 원천 관측 모듈·선언, worker SDK 경계, 오프라인 회귀 및 정확 세대 지문이다. PR102를 Draft로 유지하고 r6 환경·CA·로그인·READY·실제 proof·AI·서명·지급·merge/deploy는 실행하지 않는다.

## 확인한 SDK 근거

두 prefix의 `@reclaimprotocol/attestor-core`는 5.1.4로 고정되어 있으나 생성자 인스턴스가 다르다. `src/ybm-collector/client.mjs`의 실제 RPC client에서 발생한 AttestorError는 HR 생성자만으로 instanceof 판정할 수 없다. 두 알려진 생성자만 허용하며 이름/문자열로 타입을 추측하지 않는다.

고정 SDK `lib/index.js`의 ErrorCode(217–255), AttestorError(4999–5023), ZK progress(5781–5834), 재시도 루프(8116–8137), createClaim 경계(8198–8342)를 직접 검토했다. `AttestorError.fromProto`는 message/data를 읽으므로 진단에 사용하지 않는다. 지원 콜백은 `lib/types/providers.d.ts` 125–143의 다섯 이름뿐이다. progress의 초기 done=0 콜백은 packet preparation 뒤이며 `waiting-for-verification`은 인코딩·로컬 서명·RPC 이전이다. 이 위치를 넘어선 성공을 주장하지 않는다.

## 검토 결과

- 원래 guard·서명 형태/결합 검사·공식 검증·lease 발급 정책과 SDK 총 시도 1회는 유지한다. 관측 필드를 권한 입력으로 사용하지 않는다.
- 실제 두 SDK 타입·own 코드와 resolved protobuf 숫자 코드를 구분한다. SDK boundary의 plain/TypeError, 알려지지 않은 enum, 상속/접근자 code는 UNKNOWN이다. 반환 ERROR와 validation FAILED를 별개로 보존하므로 firstFailure만으로 resolved SDK 오류를 놓치지 않도록 관측표를 제공한다.
- 상대 시각만 저장하고 최초 관측만 기록한다. 진단 시계 오류와 persistence 오류는 각각 sticky INCOMPLETE이며 원래 결과/예외를 바꾸지 않는다. 소유 observer만 호출하고 임의 객체를 serialize하지 않는다.
- callback은 terminal 뒤 억제하고 abort listener는 제거한다. 유지된 hook의 늦은 호출은 기존처럼 거부하되 완료한 기록을 오염시키지 않는다.
- E5/E5B의 HR-only 설치 경로도 확인했다. 추가 transport 타입 조회는 best effort이며 모듈 로딩을 차단한 별도 네트워크 차단 프로세스에서 기존 HR import 유지 검사를 추가했다. CI 워크플로·의존성 지문은 변경하지 않는다.
- 독립 읽기 전용 에이전트가 SDK 의미와 변경 경계를 검토했고, 주 담당이 실제 diff·회귀·정확 지문을 추가 검토했다. 동일한 전체 시험을 다른 모델로 중복 실행하지 않았다.

수정 전 핵심 회귀 2개가 기존 스키마·경계 부족으로 실패했고 수정 후 통과했다. 후속 검사는 두 타입의 12 enum, 정상 hook 이후 실패, resolved error/서명 누락/잘못된 형태/반환 후 JSON·binding 예외, 콜백 중복/지연/알 수 없는 이름, abort 전·중·후, 시계 역행/실패와 writer 실패, 비밀값·getter 비기록 및 certificate 경계를 포함한다. 실제 호출 없이 합성 자료와 가짜 단조 시계만 사용했다.

r5 최초 원인은 미확정이다. 새 진단은 SDK 내부 ZK 세부 함수나 원격 장애까지 항상 특정하지 못하며, SDK의 고정 network/timeout 코드도 원격 endpoint/근본 원인을 증명하지 않는다. 실패한 실제 원천 이후 AI/지급으로 진행하지 않는 기존 경계를 유지한다.
# r6 후속 v15 검토 추가 — 2026-10-23

현재 변경의 근거와 한계는 [r6 조사](BOOTCAMP_R6_FAILURE_REVIEW.ko.md)를 따른다. 기존 하위 검토 에이전트를 재사용해 sender의 private WeakMap 출처, 동기 send 예외의 타이머 해제, 종료 예외 격리, 동일 client/route 보존, claim RPC 원래 반환/오류 보존, 동기 observer 실패 격리·해지 후 이벤트 차단, 고정 오류 형태, HR-only optional import를 읽기 전용 검토했다. 추가 차단 지적은 없다. 검토 계약은 내부 동기 observer이며 임의 비동기 plugin callback 지원을 주장하지 않는다.

실제 SDK RPC/socket 경계와 설치 SDK의 post-verification 구간 시험을 구분한다. 둘 다 합성 메모리 입력이며 전체 TLS/ZK·실제 r6 원인·실제 proof 성공 검증이 아니다. 의존성/엔진/한도/timeout/총 시도1회/서명·nonce·만료·공식 검증은 변경하지 않는다. 같은 HEAD CI와 source pin은 v15 기록을 따른다. 아래 v14 검토는 당시 결과로 보존한다.

