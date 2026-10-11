# W02 오프라인 ProofAdapter 기술 시험

**실제 YBM 검증이나 지급에 사용할 수 없는 합성 시험 코드다.** 제품 adapter 구현은 W08에서 한다. 고정 SDK의 서명 검증 함수를 사용하지만, 입력은 메모리에서 생성한 시험용 공증자가 서명한 인공 claim이다. YBM·zkTLS·TEE가 성공했다는 증거가 아니다.

작업본 루트에서 실행한다.

```sh
./tools/npm --prefix spikes/w02-proof-adapter ci --ignore-scripts
./tools/npm --prefix spikes/w02-proof-adapter test
```

`@reclaimprotocol/js-sdk` 5.8.2와 ethers 6.17.0을 별도 package-lock으로 고정했다. W01 루트의 기존 의존성 그래프를 바꾸지 않는다. 시험은 네트워크 `fetch`를 차단하고 실제 증명·키 파일을 읽거나 쓰지 않는다.

36개 시험은 신청·지갑·도메인·정책·세션·owner 결합, 신뢰 공증자와 요청/추출 정책 검사, timestamp, 두 시험 기록의 연결, 중복 요청을 확인한다. 날짜·수험번호·점수는 모두 합성값이다. 서명된 추출값만 사용하고 unsigned convenience 필드가 다르면 거절한다. 결과에는 지급 권한이 없으며 실제 성적값이나 식별자를 출력하지 않는다.

동시 callback 시험은 단일 Node 프로세스의 메모리 상태만 검증한다. 재시작·다중 worker·DB transaction·보존/삭제·HTTP 본문 제한 구현을 검증한 것으로 확대하지 않는다. `ProofSessionBindingV4` typed-data 모양도 기술 시험용이며 W04의 최종 schema를 대신하지 않는다.

브라우저에서 proof owner를 사전에 얻고 참가자 지갑 서명에 연결할 수 있는지는 미확인이다. 그 조건을 제거하거나 대신 만족했다고 처리하지 않았다. 실제 provider·TEE·명시적 callback·tmpfs가 준비되기 전 실제 증명을 받지 않는다. [W02 결과](../../docs/w02/REPORT.ko.md)를 참고한다.


## W02 A 직접 경로 추가 시험

2026-10-11: `direct-route.mjs`와 `test/direct-route.test.mjs`를 추가했다. 같은 명령으로 기존 36개와 신규 71개, 총 107개 시험을 실행한다. source bundle·직접 context·임시 owner 결합을 검사하고 SDK의 필수 TEE 누락·앱/세션/nonce 불일치·위조 토큰 거부를 확인한다.

직접 검사 함수는 순수한 합성 분석이다. 성공 결과도 `teeVerified=false`, `paymentAllowed=false`, `sessionConsumed=false`이며 실제 수집·HTTP 수신·nonce 저장·지급 API가 아니다. TEE 정상 하드웨어 샘플은 검증하지 않았다. 서버가 만든 record와 정책을 신뢰 입력으로 받으므로 사용자 입력을 그대로 전달하는 endpoint로 사용하면 안 된다. canonical JSON 및 exact params 비교도 현재 spike의 제한이다.

[W02 A 결과와 TEE 해결 방향](../../docs/w02/W02A_REPORT.ko.md)을 참고한다. TEE 요구 변경은 제안 상태이며 실제 모드 차단을 유지한다.
