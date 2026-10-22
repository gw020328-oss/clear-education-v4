# C3 최소 조회·서명·명시 동의 프론트 인계

2026-10-22. 일반 연결 요청 설정은 Sol / High이며 실제 런타임 모델 ID는 독립 확인하지 않았다. `web/` 편집 없이 기존 브라우저 모듈과 소량 호출 예제만 제공한다. C1 표시 호스트는 계속 source/chain/signer를 만들지 않는다. 실제 `.2` live context에만 추가 수신부/receipt 판독기를 설치한다. 전체 실제 시연 완료와 구분한다.

| 호출 | 결과/쓰기 범위 |
| --- | --- |
| `bindSourceSession(app)` | 본인 활성 신청·원래 인증 세션 1회 결합, 빈 본문 |
| `pendingSourceSignature(app)` | 그 참여자 세션에만 정확한 P1 관찰 승인 메시지 |
| `submitSourceSignature(app, approval, signature)` | 그 승인 ID/서명만 POST, 지급 승인 아님 |
| `view(app)` / `consent(app,view,'AGREE' 또는 'WITHDRAW',key)` | 기존 같은 판정·revision·hash·ledger의 조회/명시 동의 |
| `paymentReceipt(app)` | 새 `GET /bootcamp/v4/applications/:app/payment-receipt`, 참여자/배정된 운영자 읽기만 |

receipt 경로는 txHash·지갑·금액·proof·verified flag·query를 받지 않는다. 임의 거래 조회/claim POST/RPC/signing endpoint는 설치하지 않는다. 기존 readonly canonical claimReceipt 포트의 고정 런타임/트랜잭션/RightSettled/Transfer/수락권리 검사를 재사용하며 새 지급·재청구·서명을 실행하지 않는다. HTTP await 뒤 역할·신청 권한을 다시 확인한다.

`expectedPayment`는 고정 수령인·token·100000000 atoms/TEST/decimals6이다. `accept.transactionHash`와 `accept.recordedCheckpoint`는 기록된 accept이며 `canonicalNow=null`이다. `claim.state`는 NOT_OBSERVED/READBACK_UNAVAILABLE/INCLUDED로 구분한다. 거래 제출·accept만으로 수령액을 채우지 않는다. 저장된 정상 실행의 정확 잔액 증가100000000과 현재 재판독한 같은 claim checkpoint의 canonical Transfer·동일 고정 수령인/token/금액·수락 당시 판정 hash/revision이 모두 맞을 때에만 `claim.canonical=true`, `transferAmountAtoms`와 `balance.receivedAtoms=100000000`, `exactExpectedAmountVerified=true`다. 잔액 측정은 claim 당시 소유 실행의 전후 차이이며 현재 wallet balance를 새로 측정했다는 뜻이 아니다.

판독 불가/불명확/reorg/잘못된 수령인·token·금액·block·판정이면 amount/확인 여부는 null이다. 성공도 INCLUDED이며 `finalized=false`다. 최종 확정으로 표시하지 않는다. `acceptedTarget`과 `currentDecision`은 별도다. 원천 만료·현재 판정 변경은 수락 당시 권리를 소멸시키지 않는다. `view().payment.receiptHttpAvailable`은 설치 여부만 알린다. 실제 수령은 별도 `paymentReceipt` 결과로 표시하며 기존 view의 미측정 숫자를 임의로 채우지 않는다.

## 역할별 브라우저 준비

서로 다른 두 공개 주소를 호스트가 사전에 고정한다. 참여자와 운영자는 별도 쿠키 저장소/브라우저 프로필을 사용한다. 실제 live context가 알려 준 origin·chainId를 두 지갑에서 확인하고 기존 `/auth/nonce`→지갑 메시지 서명→`/auth/verify`→`/auth/session`으로 로그인한다. chainId는 새 격리 환경별 값이므로 C1의431701을 실제 실행에 복사하지 않는다. 호스트가 제공한 해당 로컬 TEST RPC 설정만 사용하고 기존 체인/지갑 키를 가져오지 않는다.

Secure HttpOnly 쿠키는 `credentials:'same-origin'`, wallet/chain 헤더와 쓰기 CSRF는 기존 walletClient가 담당한다. CSRF/서명/토큰/키를 저장소·로그에 복사하지 않는다. Origin은 브라우저가 보낸다. GET은 기존 인증 handler와 같은 규칙으로, Origin이 없는 경우 `Sec-Fetch-Site:same-origin`이 있어야 하며 POST는 정확한 Origin·CSRF가 필수다. cross-site/same-site 또는 둘 다 없는 GET을 허용하지 않는다. 이 접점은 C1의 모든 GET에 Origin을 강제하던 차이를 바로잡은 것이며 인증 쿠키·역할·지갑 검사를 생략하지 않는다.

지갑 accountsChanged/chainChanged 시 기존 walletClient의 로그아웃으로 원래 서버 세션을 폐기하고 메모리 인증 상태/진행 요청을 닫는다. 주소/체인을 자동으로 되돌리거나 새 세션으로 원천 수집을 이어가지 않는다. 원래 참여자 세션을 재로그인으로 교체하면 진행 중 source 승인은 사용할 수 없다.

```js
import {createNormalBootcampClient} from './normal-client.mjs';
const api = createNormalBootcampClient({request: (path, options) => walletClient.request(path, options)});
// 참여자가 기존 신청 생성 응답에서 받은 같은 applicationId만 사용한다.
await api.bindSourceSession(applicationId); // 사용자 버튼, 자동 재시도 없음
const approval = await api.pendingSourceSignature(applicationId);
// 메시지와 지급 승인이 아님을 화면에 표시한 뒤 사용자가 별도 승인 버튼을 누른다.
const bytes = new TextEncoder().encode(approval.message);
const hex = '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const signature = await ethereum.request({method:'personal_sign', params:[hex, session.wallet]});
await api.submitSourceSignature(applicationId, approval, signature);

// 두 역할 각각 자신의 최신 화면에서 사용자 동의 버튼을 누른다.
const view = await api.view(applicationId);
await api.consent(applicationId, view, 'AGREE', {idempotencyKey: explicitClickId});
// 상대 동의로 ledger가 바뀌면 자기 화면을 다시 조회한 뒤 새 명시 동의가 필요하다.
const payment = await api.paymentReceipt(applicationId);
```

원천 승인 메시지는 P1 관찰용이며 양측 정책 동의/금고 지급 서명과 별개다. 운영자는 참여자의 원천 승인 메시지를 읽거나 대신 서명할 수 없다. 120초 경과는 상대 동의를 대체하지 않는다. 브라우저 시계로 source/review cap을 재시작하지 않는다. 자동 consent/sign/POST retry, synthetic 성공 fallback, C4~C6 진행률·복구·pagination은 추가하지 않는다.

관련 네트워크 차단 검증45/45 PASS. canonical/잔액/null 분리, 소유자/운영자/타 참여자 접근, await 중 로그아웃, 원천 만료 뒤 별도 수락 대상 보존, browser adapter 및 HTTPS GET/POST·Origin/CSRF·임의 tx 거부를 포함한다. 실제 지갑 브라우저 화면 자체와 전체 실제 지급은 아직 실행하지 않았다.

후속 [사람 동의 대기 조회 갱신](BOOTCAMP_C3_REFRESH.ko.md)이 실제 canonical5초 cache에 적용된다. host가 아직 chain application을 결합하지 않았다면 v3 조회/동의는 `BC_NORMAL_PROCEDURE_NOT_READY`이며 그 단계의 조건 표시는 기존 v2 operations로 읽는다. 검토 준비 후 procedure GET/명시 동의 앞과 동의 대기의 read는 소유 readonly refresh를 거친다. TTL/source/reviewcap·자동 POST 재시도 정책은 바뀌지 않는다.
