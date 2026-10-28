# r6 원인 조사와 전송 경계 수정

2026-10-23. 기준 HEAD `4b0a1063cc442f331510c1a0ed9e65bbbd570daf`. r6는 실패 종료한 보존 기록이다. 이번 작업은 로그인 없는 조사·수정·검증이며 새 실제 실행을 준비하지 않는다.

## 확정 사실과 미확정 원인

r6 최초 실패는 `ACCOUNT_SDK_CALL / UNKNOWN_ERROR / UNKNOWN`이다. 서버 참가자 서명 수락과 계정 응답 검사는 완료했다. SDK await는 reject됐고 SDK_RETURN·RETURN_VALIDATION·공식 계정 검증·인증서 claim은 미관측이다. persistence/timing은 COMPLETE다.

SDK 호출부터 실패까지 14,702.078291ms, `waiting-for-verification`부터 실패까지 2,221.884375ms다. 전체 HR 약 126.275초에는 사람의 서명 대기 약 111.315초가 포함된다. `BC_REVISION_CONFLICT`는 외곽 후속 오류다. 실패 순간 aborted=false는 뒤따르는 connection-close/route abort까지 배제하지 않는다.

설치 SDK 5.1.4에서 콜백은 `generateTranscript()`와 request 생성 뒤, protobuf encode → 로컬 EIP-191 서명 → client.rpc → RPC envelope encode/send → 응답 대기보다 앞선다. 준비된 transcript 반환 경계에는 도달했지만, 송신·공증 서버 검증·유효한 proof를 확정할 수 없다.

v14는 HR/transport의 두 AttestorError 생성자와 알려진 12개 enum을 분류했다. CLEAR sender가 만든 일반 Error, protobuf/ethers/native 예외, 미래 enum은 해당하지 않는다. **r6 원래 오류 객체를 보존하지 않았으므로 구체적인 최초 내부 원인은 복원 불가다.**

## 오프라인 재현과 확인된 결함

실제 고정 SDK `client.rpc`, 실제 RPC encoder, production bounded sender를 메모리 socket과 연결했다. 합성 프레임 또는 프레임+대기열이 기존 32MiB를 넘으면 socket.send 0회, terminate 후 일반 Error가 RPC를 그대로 reject한다. 두 SDK AttestorError 타입이 아니므로 v14에서는 UNKNOWN이다. 송신 callback 실패와 60초 timeout에도 같은 분류 누락이 있다. 이는 **분류 결함 재현이며 r6가 크기 제한에 걸렸다는 증거는 아니다.**

socket.send가 동기 throw하면 타이머가 남아 나중에 terminate하는 별도 결함도 확인했다. 같은 고정 송신 실패로 줄이고 타이머를 해제한다. terminate 자체의 예외도 기존 실패를 덮거나 reject를 방해하지 않게 한다.

설치 SDK의 콜백부터 return까지 정확한 소스 구간을 실행하는 시험은 실제 protobuf encoder와 ETH signer를 쓴다. encode 실패, sign 실패, 전송 제한, RPC null 반환 뒤 SDK TypeError를 구분한다. 전체 TLS/ZK 실행이 아닌 구간 재현이다. 별도 실제 SDK RPC/socket 시험이 전송 구현 경계를 보완한다.

## 과거 HackerRank 성공과 대조

허용된 옛 요약·검증기·MCP 실행기·공개 설치 패키지만 참고했다. 원문 claim·개인 응답·프로필·환경 비밀·키를 열거나 재사용하지 않았고 옛 실행기도 실행하지 않았다. 요약은 두 서명 검증과 username/owner 일치를 기록한다. 인증/익명 replay boolean은 별도 관찰 기록이며 요약 작성 코드의 재검증 assert가 아니다.

| 항목 | 과거 자료/현재 설치 코드 | r6와의 차이 및 인과 판단 |
| --- | --- | --- |
| SDK | Agent0.1.32, attestor-core5.1.5, crypto5.1.7 | 현재 두 prefix SDK5.1.4/crypto5.1.6. 과거 실행 당시 정확한 지문은 미확정. 두 현재 생성자는 v14가 모두 처리. |
| TLS/ethers/ws | 현재 옛 설치0.1.4/6.17.0/8.22.0 | 현재 HR 설치와 같은 버전. 과거 실행 동일성을 증명하지는 않음. |
| 콜백 뒤 코드 | 옛 설치의 WFV→encode→sign→RPC→return | 현재와 문자 단위 동일. RPC 메서드도 동일. 이 구간 버전 차이 원인을 확인하지 못함. |
| 엔진/프로세스 | Agent 기본 stwo, override 가능, 기본 in-process | 현재 명시 stwo/concurrency1/총1회. 당시 override는 요약·실행기로 복원 불가. YBM SnarkJS 성공은 별도 원천 사례. |
| STWO wrapper | 옛 현재 설치의 proof 생성 부분은 현재와 같고 검증 주석이 다름 | WASM binary/배포 서버 호환성까지 같다는 뜻은 아님. 원인 미확정. |
| client/전송 | URL로 별도 SDK client, 기본 WebSocket, CLEAR bounded sender 없음 | 현재 로그인/증명 동일 client, proofMode=true, 32MiB/60초 송신·4MiB 수신. 로컬 오류 누락은 재현, r6 크기는 미관측. |
| timeout | console tool call120초; 당시 크기·세부 시간 없음 | 송신60초/RPC90초. 2.222초는 새로 시작한 이 타이머의 만료와 맞지 않음. 다른 연결 종료는 미확정. |
| 추출/context | 특정 계정/인증서 기대값 검사. 당시 selector 복원 불가. 기본 호출에 CLEAR context 없음 | 현재 두 role의 request/owner/nonce/만료/context 및 같은 응답 구조 검사 추가. r6 계정 응답 검사는 완료. proof 크기/서버 수락 영향은 미확정. |
| 신뢰 | claim에 적힌 attestor 주소로 과거 서명 검증 | 현재 독립 signer/epoch와 신청 결합을 요구. 과거 성공으로 현재 검사를 생략하지 않음. |

## 최소 수정

sender가 만든 오류는 private WeakMap에 고정 코드만 연결한다. `boundedSendFailure`는 정확한 객체만 인정하며 메시지·name·code 유사성/getter/cause를 읽지 않는다. v3는 `CLEAR_TRANSPORT / OWNED_BOUNDED_SEND`로 기록하고, 같은 문자열의 일반 Error는 계속 UNKNOWN이다.

공식 client에 RPC observer를 한 번 설치하고 worker는 해당 SDK 호출 동안 구독한다. client/route 객체는 그대로다. `claimTunnel` STARTED/COMPLETED/FAILED만 전달하며 요청·결과를 넘기지 않는다. 내부 callback은 동기 전용이고 예외를 삼킨다. 종료 뒤 관측은 버리며 원래 반환값·오류 객체를 유지한다. 설치 성공은 `SDK_CLAIM_RPC_OBSERVER`로 따로 표시하므로 설치 확인 없는 미관측 RPC를 ‘진입 전 실패’로 해석하지 않는다.

UNKNOWN 예외는 고정 errorKind/ownCodeKind만 덧붙인다. 원문 message/stack/data/cause, 임의 코드값, 실제 크기·인증서·proof는 기록하지 않는다. 128개 상한·0600 저장·단조 시간·단회 시도·한도·타임아웃·정리·공식 검증·nonce·만료 정책을 유지한다.

## 남은 가설과 향후 한 번의 구분 기준

| 이후 관측 | 해석 범위 |
| --- | --- |
| observer 설치, WFV 뒤 RPC 미진입 | 로컬 request encode/sign 구간. native 종류는 모양일 뿐 세부 원인은 여전히 미확정 가능. |
| RPC 실패 + OWNED_BOUNDED_SEND | 크기/대기열 상한·송신실패·송신timeout 중 직접 생성 원인. 원격 검증 실패로 해석하지 않음. |
| RPC 실패 + 알려진 AttestorError | 알려진 enum의 transport/remote SDK 오류. 서버 내부 원인은 미보존. |
| RPC 완료 뒤 SDK await 실패 | 반환 뒤 SDK 내부 처리. RPC 완료는 claim 유효성이나 공식 검증 성공이 아님. |
| SDK resolve + SDK_RETURN ERROR | 반환 protobuf 오류이며 await reject와 구분. |

검사 결과는 [v15 검증 기록](BOOTCAMP_V15_VERIFICATION.json)과 PR의 같은 HEAD CI를 따른다. **r6 해결·실제 성공은 미확정이며 현재 사용자 행동은 필요 없다.** 새 로그인·READY·증명·AI·체인·CA 준비를 하지 않았다. 향후 실제 시험 여부는 조사/검증 결과 검토 뒤 별도 결정한다. r6/r5 자료는 보존하며 재사용하지 않는다.
