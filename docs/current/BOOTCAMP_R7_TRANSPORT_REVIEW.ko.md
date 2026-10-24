# r7 전송 한도 조사와 수정 — 2026-10-24

r7의 첫 실패는 `ACCOUNT_SDK_CLAIM_RPC / ATTESTOR_BACKPRESSURE_LIMIT / CLEAR_TRANSPORT / OWNED_BOUNDED_SEND`다. 기존 sender가 **전체 encoded RPC 바이트 + 당시 WebSocket.bufferedAmount > 32MiB**를 검사해 `socket.send` 전에 차단했다. r7의 두 개별 크기는 기록되지 않아 복원하지 못한다. 후속 UNKNOWN_ERROR·BC_REVISION_CONFLICT를 최초 원인으로 바꾸거나 r6도 같은 원인이었다고 결론 내리지 않는다. r5/r6/r7의 사용 표시·진단·보고서·두 DB 총15개는 지문으로 보존한다.

사용자가 전송 방식·한도 수정과 로그인 없는 검증·최종 CI를 승인했다. 작업 요청 설정은 Astra / Ultra이며 현재 턴의 실제 모델 설정을 별도 도구로 검증하거나 변경했다는 주장이 아니다. 새 실제 실행·로그인·READY·CA 변경·AI 호출·지급·병합은 이 단위에 포함하지 않는다.

## 확인한 경로와 원인 범위

고정 SDK 5.1.4는 `waiting-for-verification` 뒤 unsigned ClaimTunnelRequest를 인코딩하고 EIP-191 서명한 다음 동일 client의 `rpc('claimTunnel')`에 전달한다. RPC는 응답 타이머를 먼저 만들고 전체 RPCMessages를 다시 인코딩해 CLEAR의 sendPromise를 await한다. 개별 tunnel은 한 chunk씩 전송하지만 최대32개 tunnel과 제어 RPC가 같은 socket을 공유한다. 종전 sender에는 FIFO·배출 대기·개별 RPC deadline 전달이 없었다.

[합성 근거 기록](BOOTCAMP_TRANSPORT_LIMIT_EVIDENCE.json)은 r7 실행 HEAD의 sender 원문을 읽어 두 경우를 따로 재현한 결과다. 40MiB 메시지+빈 큐, 1바이트 메시지+32MiB 큐 모두 종전 BACKPRESSURE_LIMIT로 전송 전에 실패했다. 수정한 sender는 전자는 전송하고 후자는 큐가 비워진 뒤 전송한다. 이는 두 가능한 원인의 재현이며 r7에서 어느 쪽이었는지의 증거가 아니다.

과거 성공 경로의 현재 설치 SDK 5.1.5와 5.1.4의 공식 ws 생성자·socket base·RPC·server 생성 파일은 바이트가 같다. 기본 생성자는 `new WebSocket(url)`이며 CLEAR의32MiB 합계 검사 없이 전송한다. 과거 실제 성공 당시 버전·프레임 크기·서버 설정은 이 비교만으로 확정하지 못한다. YBM history의 별도 STWO 대형 실패·SnarkJS 성공은 HackerRank 엔진 교체의 근거로 사용하지 않는다.

## 수치와 전송 정책

| 항목 | v16 기준과 근거 |
| --- | --- |
| proof 단일 메시지 | **100MiB = 104857600 bytes**, protobuf RPC envelope까지 포함 |
| proof 보유 합계 | **132MiB = 138412032 bytes**, active+waiting 합계. 최대 메시지100MiB와 종전 backlog 예산32MiB를 합친 명시적인 로컬 자원 정책 |
| pending 수 | **64개**, active 포함. 0바이트 메시지로 바이트 제한을 우회하지 못함. tunnel32개로 자연히 보장되는 수라고 주장하지 않음 |
| 일반 중계 | 단일·보유 합계 모두 기존 **2MiB** |
| 동시 송신 | **1개**, FIFO. 이전 send callback 완료와 public bufferedAmount=0을 모두 확인 |
| 대기 방식 | 공개 drain event가 없는 ws에서 10ms 단위 bounded polling. 비공개 `_socket`·`_sender` 접근 없음 |
| 시간 | proof60초 / 일반10초 총 예산 안에 queue+drain+write 포함. RPC별 기존90초·생성25초·종료5초와 더 짧은 쪽 적용 |
| 취소·종료 | 소유 signal을 raw socket에 전달. abort/close/error는 타이머·큐·참조·listener 정리. abort와 송신 실패는 raw terminate 보장 |
| 미전송 만료 | 해당 항목만 제거·거절. 만료된 제어 RPC가 다른 proof를 끊거나 나중에 송신되지 않음 |
| 송신 후 만료 | 부분 송신 여부를 추측하지 않고 연결 전체 종료. 자동 재시도 없음 |
| 수신·프로토콜 | 기존 수신4MiB, 압축 비활성, 단일 binary message 유지. 메시지 분할·엔진·SDK 교체 없음 |

100MiB는 임의의128MiB 상향이 아니다. [npm5.1.4 대응 공식 서버47행](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/create-server.ts#L47)은 maxPayload를 지정하지 않고 WebSocketServer를 만든다. [고정 ws8.22 기본 문서](https://github.com/websockets/ws/blob/8.22.0/doc/ws.md)는 기본 수신 메시지 한도를100MiB로 정한다. SDK의 별도512MiB 상수는 이 서버 생성 경로에 연결되지 않는다. **배포된 원격 서버·proxy의 실제 설정은 확인하지 않았다.** 100MiB보다 큰 실제 encoded frame은 여전히 거절하며 수치만 남긴다.

전체 송신 메모리를 무제한으로 늘리지 않는다. 132MiB는 sender가 보유한 payload 합계이고, protobuf writer·서명 복사·ws masking·STWO/WASM·SDK 원본을 포함한 전체 RSS 상한은 아니다. 원래 proof/서명/요청 결합·단회 소비·권한·동의·lease·만료·지급 정책은 그대로다.

## 합성 검증과 비용

실제 고정 protobuf encoder와 EIP-191 signer, production sender와 ws masking을 사용해 **전체100MiB 메시지**를 로컬 기본 설정 ws 서버로 보냈다. 100MiB+1은 sender가 send 전에 거절했고, bounded sender를 사용하지 않은 별도 로컬 제어 시험에서도 ws 기본 서버가1009로 거절했다. 로컬 peer는 증명 유효성을 검증하는 Attestor가 아니다.

Apple Silicon Mac·Node24.21.0에서 측정한 합성 경계의 unsigned encode43.65ms, 서명2441.63ms, RPC encode44.85ms, 로컬 write114.28ms, 로컬 수신 확인179.93ms다. 같은 프로세스에 sender와 receiver가 있는 시험의 RSS는 약121MiB에서 최대874MiB였다. 실제 STWO 생성/WASM 최대 메모리나 원격 전송 시간은 이 수치로 증명하지 않는다. 이 측정은 단일 관측이며 성능 보증이 아니다.

회귀는 단일/합계 크기 경계, 큰 메시지 뒤·앞의 작은 메시지, 동시·연속 전송, callback 후 남은 큐, 0바이트 count 제한, 실제 RPC의 짧은 deadline, 잘못된 timeout 입력, 지연된 타이머/만료 예약, 종료·취소·시간 초과·동기 throw, 늦은 callback, observer 재진입, 타이머·listener·큐 참조 해제, 안전 진단을 포함한다. 오프라인 network guard 아래 합성 메모리와127.0.0.1만 사용한다. 최종 검사 수와 지문은 [v16 검증](BOOTCAMP_V16_VERIFICATION.json), 최종 HEAD의 CI 증거는 PR102를 따른다.

## 다음 단회 실제 시험에 남은 확인

새 진단 `.4`의 `ROLE_SDK_RPC_SEND`는 실제 claim RPC의 async context에 속한 sender만 관측한다. frameBytes, socketQueuedBytes, retainedBytes, pendingCount, 제한, waitMs/sendMs와 고정 phase·terminalReason만 보관한다. 다른 RPC가 공유 socket을 종료한 경우도 원인 코드와 당시 숫자가 구분된다. 원문 proof·서명·응답·쿠키·토큰·오류 메시지·stack은 기록하지 않는다. 128개 이벤트·0600 atomic 저장·불완전 표시·해지 뒤 억제는 유지한다.

새 실제 proof의 크기, 원격 수용/공식 검증, 네트워크 전송 시간은 다음 승인된1회 시험에서 확인해야 한다. 공개 서버의 message/pong 기준30초 idle 종료도 원격 배포에서 동일한지 확인되지 않았으며, 느린 대형 송신의 잠재 제약이지 r7 원인 판정이 아니다. local send callback 완료를 원격 proof 성공으로 표시하지 않는다.

이 단위 완료 뒤 상태는 **코드·지문·오프라인 검증·최종 CI 준비 완료 후 대기**다. 새 호스트·CA·로그인 요청이나 실제 재시험을 자동으로 시작하지 않는다.
