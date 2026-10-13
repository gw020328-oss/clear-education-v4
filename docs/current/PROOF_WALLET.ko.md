# 제품 증명 세션의 공통 지갑 승인 도구

2026-10-13, [이슈 #26](https://github.com/gw020328-oss/clear-education-v4/issues/26). PR #25가 병합된 develop `51ee66b` 기준으로 B1의 기존 승인 서명을 공통 브라우저 도구에 연결한다. 지급 방식과 독립적인 세션·지갑 결합 작업이며 새 지급 서명이나 권한 발급 기능이 아니다.

## 호출 계약과 화면 연결

[createWalletClient](../../src/application/wallet-client.mjs)에 다음 메서드를 추가한다. 기존 메서드와 import는 그대로 유지한다.

```js
const authorized = await walletClient.authorizeProofSession(
  applicationId,
  reviewedSession,
  reviewedRuntime,
  { ownerPublicKey: collectorOwnerPublicKey, signal: controller.signal },
);
```

호출자는 먼저 로그인하고, 기존 세션 생성/조회 API에서 얻은 `ISSUED` 세션과 `GET /runtimes/:policyHash`의 전체 runtime을 사용자에게 보여준다. 화면에는 신청·현재 지갑·정책·체인/배포·수집기 owner 공개키·만료 시각 및 합성 제한을 표시한다. 명시적인 승인 동작에서만 호출한다. 이 작업은 화면을 구현하거나 자동 승인하지 않는다.

`ownerPublicKey`는 선택한 수집기에서 별도로 얻은 새 비압축 공개키다. 응답의 `typedData.message.ownerPublicKey`를 그대로 기대값으로 복사하면 독립 비교가 사라진다. helper는 owner 개인키를 생성·수신·보관하지 않으며 실제 수집기와 브라우저의 안전한 연결도 이번 범위에 없다. 합성 시험은 매 실행 생성한 임시 지갑을 사용한다.

입력은 첫 비동기 작업 전에 복제해 고정한다. 서명 전에 같은 세션을 다시 GET하여 검토한 typed data가 그대로인지 확인한다. 검토한 runtime을 신뢰할 수 있는 서버에서 읽고 화면에 표시하는 것은 호출자의 책임이며 이 검사는 원천의 진실성이나 새 체인 관측을 대신하지 않는다. 서버는 기존처럼 현재 예치·제출 기간·로그인 세션·nonce를 재검증한다.

## 승인 전 검사

- 정확한 `ProofSessionBindingV4` types·primaryType·메시지 필드와 `ClearRefund` 도메인 전체를 비교한다. 기존 B1 도메인/서명 계약을 재사용하며 새 grant 서명을 추가하지 않는다.
- 신청 ID·세션 ID·현재 지갑·정책 hash·runtime hash·체인·금고 주소·instance와 독립적으로 받은 owner 공개키를 결합한다.
- requestNonce는 소문자 32바이트 hex 및 **0x 접두사 포함**이다. 신청/최종 동의 helper의 접두사 제거 규칙을 적용하지 않는다.
- 상태 `ISSUED`, 미소비 digest/승인 시각 null, 최대 30분 TTL, 현재 시각이 발급 이상/만료 미만인지 검사한다. 지갑 응답 이후에도 만료를 다시 확인한다.
- `SYNTHETIC`, `collectionEnabled=false`, `proofVerified=false`, `paymentAllowed=false`가 아니면 승인하지 않는다.
- 서명 앞뒤에 기존 지갑 문맥 검사를 적용하고, 지갑이 반환한 서명의 signer를 확인한 뒤 기존 `/authorize`로 한 번 제출한다. 반환 영수증의 동일 결합·digest·승인 시각·합성 제한도 확인한다.

`createWalletClient`의 선택적 `clock`은 초 단위 정수를 반환하며 기본값은 브라우저 현재 시각이다. 가상 시계는 합성 시험용이다. 브라우저 시계나 helper를 우회해도 서버 검증은 유지되며 클라이언트 시계는 서버 승인 권한이 아니다.

## 중단·변경·복구

동일 client의 진행 중 중복 호출은 `PROOF_AUTHORIZATION_BUSY`로 거부한다. 계정/체인 변경·disconnect·dispose 또는 이벤트 없는 지갑 변경을 확인하면 서명을 제출하지 않는다. 사용자 거절은 `WALLET_REJECTED`, provider 실패는 원문을 제외한 `WALLET_UNAVAILABLE`이다. 잘못된 서명은 `WALLET_SIGNATURE_INVALID`로 거부한다.

선택적 AbortSignal은 조회·승인 요청으로 전달한다. 이미 중단됐거나 지갑 응답을 기다리다 중단하면 `API_ABORTED`이며 늦은 결과를 폐기한다. 지갑 팝업 자체를 닫는 기능은 보장하지 않는다. 계정 변경 역시 지갑 RPC가 응답한 뒤 감지될 수 있으며, 기존 문맥의 결과로 다음 승인을 전송하지 않는다. 중단된 옛 연결의 조회가 늦게 완료돼도 새 연결의 로그인 상태를 지우지 않도록 공통 문맥 검사도 보정했다.

| 오류/시점 | 의미와 다음 동작 |
| --- | --- |
| `PROOF_AUTHORIZATION_CONTEXT` | 검토한 문맥·원천 응답·서명 형식 불일치. 입력/상태를 새로 확인 |
| `PROOF_AUTHORIZATION_STATE` | ISSUED가 아님. 이미 AUTHORIZED이면 재서명하지 않고 조회 결과 사용, 취소/만료면 기존 세션 절차로 복구 |
| `PROOF_SESSION_EXPIRED` | 로컬 시계 기준 발급 전 또는 만료. 시계와 서버 상태 확인 |
| 승인 POST 전 중단 | `outcome=NOT_SENT`; 이 helper의 승인 POST는 보내지 않음. 세션 생성·다른 탭의 작업 취소를 의미하지 않음 |
| 승인 POST 후 중단·문맥 변경·잘못된 영수증 | `outcome=UNKNOWN`, `nextAction=CHECK_RESULT`, `retryable=false`. 같은 세션을 GET하여 결과 확인 |
| 서버 HTTP 오류 | [공통 복구 계약](API_RECOVERY.ko.md)의 code/status/outcome/nextAction을 유지. 401 재로그인, 409/410 상태 새로고침 등을 구분 |

응답 유실·timeout도 자동 재전송하지 않는다. 같은 세션의 GET이 `AUTHORIZED`이면 승인 사실만 표시한다. `ISSUED`면 상태·만료를 재검토한 뒤 사용자의 새 승인 동작으로 다시 시도할 수 있다. 새 로그인은 기존 발급 로그인과 달라 승인할 수 없으므로 조회·취소 후 새 owner/멱등 키로 시작한다. 서버의 동일 서명 멱등 처리는 그대로지만 helper는 서명을 저장해 재생하지 않는다. 메모리에서만 사용하며 localStorage·로그·복구 파일에 기록하지 않는다.

## 검증과 유지되는 차단

`./tools/node --test tests/proof-sessions/wallet*.test.mjs`는 문맥 변조·중단·만료·중복·늦은 응답과 기존 HTTPS/DB 승인·응답 유실 복구를 검증한다. `./tools/npm run test:proof-sessions`에도 포함되며 CI 경로를 추가하지 않는다. 2026-10-13 Apple Silicon Mac/Node 24.21.0에서 신규 66개를 포함한 관련 회귀 651개가 통과했다(실패/skip 0). 원본 보존·의존성·변경 문서의 로컬 링크 93개 검사도 통과했다. 원격 CI는 연결 PR의 정확한 head 결과를 확인한다. 실제 확장 지갑 화면·실제 수집기 연결은 검증하지 않았다.

HTTP 경로·DB schema·서버 서명 계약·평가기·금고·다른 담당자 UI는 변경하지 않는다. 승인 결과는 B1 `AUTHORIZED`일 뿐 B2b 합성 증거 수락도 아니다. 실제 Moodle 연동·YBM 전체 목록 등 원천 검증 차단, grant/outbox·CLEAR 추가 지급 서명 종속 확대 보류를 유지한다. 별도 독립 청구·Windows 검증과 지급 구조 선택에는 영향을 주지 않는다.
