# B1 제품 증명 세션·영속 nonce

공통 증명 세션 승인(2026-10-13): [이슈 #26](https://github.com/gw020328-oss/clear-education-v4/issues/26), [지갑 승인 도구](PROOF_WALLET.ko.md). PR #25 병합 `51ee66b` 위에서 기존 B1 서명/HTTP 계약을 재사용하는 `authorizeProofSession`을 추가했다. 검토한 문맥·독립 owner 공개키·중단/만료·응답 유실을 검사한다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류는 유지하며 HTTP/DB/정책/금고/화면은 변경하지 않는다.

B2b 후속(2026-10-13): [제품 수집·검증 결과 단회 수락](PRODUCT_PROOF.ko.md)이 schema 4와 별도 proof_results를 추가했다. 아래 schema 3/수락 미구현 설명은 B1 당시 범위다. B1 승인 nonce와 상태는 유지하며, 새 합성 결과 수락은 독립 검증 후 별도 transaction으로 처리한다. 실제 YBM 수집/원천 전체성/지급은 여전히 차단한다.

2026-10-12, 담당 오규원. [이슈 #15](https://github.com/gw020328-oss/clear-education-v4/issues/15), [역할·후속 계획](TEAM_PLAN.ko.md). 선행 C1은 [PR #14](https://github.com/gw020328-oss/clear-education-v4/pull/14)로 develop에 반영됐다. 이 문서는 B1 구현 브랜치 기준이며 병합 여부는 이슈의 연결 PR을 확인한다.

제품 신청의 예치를 다시 확인하고, 수취 지갑이 특정 수집 owner 공개키와 세션 문맥을 승인한다. **AUTHORIZED는 지갑 결합 승인이다. proof 검증·자격 충족·권한 발급을 뜻하지 않는다.** 실제 YBM 수집기 연결은 아직 없으며 `dataMode=SYNTHETIC`, `collectionEnabled=false`, `proofVerified=false`, `paymentAllowed=false`를 유지한다.

## 서명과 nonce의 의미

`ProofSessionBindingV4`의 필드는 `applicationId(bytes32)`, `learner(address)`, `policyHash(bytes32)`, `runtimeConfigHash(bytes32)`, `proofSessionId(bytes32)`, `requestNonce(bytes32)`, `ownerPublicKey(bytes)`, `expiresAt(uint256)`다. domain은 실제 연결한 금고의 `ClearRefund`, version `4`, chainId, verifyingContract, salt(instanceId)다. 로그인·신청 조건·최종 예치 동의·W02 진단 서명과 구별된다.

세션 ID와 nonce는 서버가 각각 무작위 32바이트로 발급한다. 승인 시 서명은 DB에 고정된 typed payload로 검증하고 nonce의 소비 시각, 서명 해시, EIP-712 binding digest, 관측 블록을 한 transaction에서 저장한다. raw 지갑 서명은 저장하지 않는다. 공개 challenge를 재개하기 위해 typed payload 안의 nonce 자체는 보관한다. 로그인 token 같은 bearer 비밀값이 아니며 nonce만으로 승인할 수 없다.

**B1에서 소비하는 것은 지갑 결합 승인 nonce다.** 같은 서명 요청의 재전송은 기존 승인 영수증만 반환한다. 후속 B2b는 공식 증명·정확한 params/context/owner/원천/신선도를 검증한 결과에 대한 단회 수락 전이를 별도로 구현해야 한다. B4는 시험 중복 예약·고정 grant 데이터·outbox를 원자적으로 기록해야 한다. B1의 nonce 소비를 이 두 단계 완료로 취급하거나, 이미 승인됐다는 이유로 증명 재전송을 무조건 수락하면 안 된다. 실제 증명 검증 전 nonce를 소비해버리는 proof callback은 제공하지 않는다.

owner는 수집 프로세스에서 만든 **새 secp256k1 비압축 공개키**(`0x04`+128 hex)다. 서버는 curve 위의 유효한 키인지 검증하고 표준화한다. 대응하는 owner 주소는 해당 환경의 모든 세션에서 한 번만 사용하며 취소·만료 뒤에도 재사용하지 않는다. owner 개인키나 수취 지갑 개인키를 제품 API/DB에 넣지 않는다. owner 보유 증명·실제 SDK 연결은 B2b에서 검증할 사항이다.

## 수명·접근·재시도

- 예치 확인된 본인 참가자만 생성/조회/승인/취소할 수 있다. 운영자에게 proof 세션 조회를 열지 않는다.
- 신청당 활성 세션은 한 개다. 활성 상태는 ISSUED 또는 AUTHORIZED다. 다른 생성 키로 재요청하면 `PROOF_SESSION_ACTIVE`다.
- 생성에는 `Idempotency-Key`가 필요하다. 같은 신청/키/owner/로그인 세션은 기존 기록을 반환한다. owner 변경은 충돌이며, 만료·취소된 키도 새 challenge를 만들지 않는다. 새 시도에는 새 키와 새 owner가 필요하다.
- 승인에는 발급받은 **동일 로그인 세션**이 필요하다. 서버 재시작은 이 세션을 유지하지만 로그아웃·만료·새 로그인은 동일 세션이 아니다. 같은 지갑으로 로그인하면 기존 목록을 보고 취소할 수 있다. 로그인 세션을 잃었으면 기존 proof 세션 취소 후 새 owner로 시작한다.
- TTL은 발급 시각부터 최대 1,800초이며, 활성 제출 종료 시각+1초를 넘지 않는다. `issuedAt <= now < expiresAt`다. 동일 승인 재시도도 만료·취소·현재 예치 검사를 우회하지 못한다.
- 취소는 체인 RPC 없이 가능하고 멱등이다. 소비했던 nonce는 취소로 되살아나지 않는다. 만료는 조회/목록/생성/취소 때 DB 상태에 반영하며 승인 경로는 상태 반영 여부와 무관하게 시각을 검사한다.
- 목록은 최신 생성 순 최대 100개다. 알려진 ID는 개별 조회한다. 공개 cursor/pagination은 없다.

| 상태 | 의미 | 가능한 후속 전이 |
| --- | --- | --- |
| ISSUED | 지갑 승인 대기 | AUTHORIZED, CANCELLED, EXPIRED |
| AUTHORIZED | nonce 소비와 지갑 결합 승인 저장됨 | CANCELLED, EXPIRED |
| CANCELLED | 취소됨 | 없음 |
| EXPIRED | 유효기간 종료 | 없음 |

GET의 AUTHORIZED와 관측 블록은 저장된 과거 사실이다. 현재 수집·청구 가능성을 보장하지 않는다. 신청 view의 ENROLLED도 그대로 과거 예치 기록이다.

## 현재 예치 검증

생성과 승인 모두 서버가 고정한 RPC/배포 pin으로 다음을 확인한다. HTTP에서 RPC URL·금고·관측 증거·현재 시각을 받지 않는다.

1. chainId, genesis, canonical 배포 receipt, 금고/토큰 코드, runtime 및 domain.
2. 저장된 예치 거래의 정확한 입력·수취인·이벤트·전액 이체·동의 digest와 canonical 블록. 저장한 block hash가 달라지면 거부한다.
3. 현재 같은 블록에서 learner와 동의 digest 일치, `settled=false`, `grantDigest=0`, 예치액 이상의 예약금 및 예약금 이상의 잔액.
4. 체인 시각과 서버 시각 모두 `normalSubmitFrom`부터 활성 제출 종료 시각까지. 보충 제출은 체인의 `supplementEnabled`가 켜진 경우에만 `supplementEndAt`까지 허용한다.
5. 관측 블록과 예치 블록의 canonical 여부 재확인. RPC 대기 후 DB transaction 안에서 현재 로그인·신청·예치 기록·만료·취소를 재검사한다. 30초를 넘긴 검사 결과는 폐기한다.

RPC를 기다리는 동안 SQLite 쓰기 lock을 잡지 않는다. SQLite 원자성과 체인 관측을 하나의 분산 transaction으로 보장하지는 않는다. 읽은 뒤 체인 상태가 변할 수 있으므로 **B2b/B4/B5도 각 결과 수락·발급 시 현재 체인을 다시 확인해야 한다.** 신뢰한 RPC의 거짓 응답이나 확정성 자체를 별도 합의로 검증하는 기능은 아니다.

C1 기본 정책은 초기화 14일 뒤부터 제출 가능하다. 새 C1 환경에서 예치 직후 B1 생성이 `PROOF_SUBMISSION_CLOSED`인 것은 정상이다. 테스트는 매번 새 격리 체인에서만 시간을 이동한다. 기존 개발 환경의 정책·DB·체인 시각을 편집하거나 reset해서 우회하지 않는다.

## HTTP 계약

기존 동일 origin HTTPS, Secure/HttpOnly 쿠키, 지갑/체인 헤더, 쓰기 CSRF 규칙을 따른다. `:id`와 `:sid`는 소문자 bytes32다.

| 메서드·경로 | 입력 | 결과 |
| --- | --- | --- |
| POST `/applications/:id/proof-sessions` | `{ownerPublicKey}` + Idempotency-Key | 세션 view |
| GET `/applications/:id/proof-sessions` | 없음 | 본인 세션 view 배열, 최대 100개 |
| GET `/applications/:id/proof-sessions/:sid` | 없음 | 세션 view |
| POST `/applications/:id/proof-sessions/:sid/authorize` | `{requestNonce, signature}` | 승인 view, 동일 요청 멱등 |
| POST `/applications/:id/proof-sessions/:sid/cancel` | `{}` | 취소/기존 종료 view |

**이 API의 requestNonce는 `0x`를 포함한다.** 기존 동의 API의 `nonce` 접두사 제거 방식과 다르다. typed payload의 `message.requestNonce`를 그대로 사용한다. `/callback`, `/verified`, `/consume` 경로는 없다.

view 필드는 다음과 같다. 합성 실행 예제는 `tests/proof-sessions/http.test.mjs`와 `fixture.mjs`가 생성하므로 실제 사용자 정보 없이 재현할 수 있다.

| 필드 | 형식 / 의미 |
| --- | --- |
| proofSessionId, applicationId | 소문자 bytes32 |
| state | 위 4개 상태 |
| issuedAt, expiresAt | epoch seconds 10진 문자열 |
| authorizedAt, bindingDigest | 승인 전 null, 이후 시각 문자열 / bytes32. 취소·만료 뒤에도 보존 |
| typedData | `{domain, types, primaryType, message}` — 위 서명 명세, expiresAt은 문자열 |
| issuanceEvidence | `{blockNumber, blockHash, blockTimestamp, supplementEnabled, submitUntil}` |
| authorizationEvidence | 승인 전 null, 이후 같은 형식의 관측 근거 |
| dataMode, collectionEnabled, proofVerified, paymentAllowed | `SYNTHETIC`, false, false, false |

관측 근거의 blockNumber/blockTimestamp/submitUntil은 10진 문자열, supplementEnabled는 boolean이다. 개인키·raw 서명·proof 원문·로그인 token은 응답에 없다.

주요 오류: 인증/서명 401, 다른 로그인 세션의 승인 `PROOF_BROWSER_SESSION` 403, 타인/미존재 신청·세션 404, 활성 세션/owner 재사용/멱등 충돌·취소·소비 nonce·예치/제출 상태 409, `PROOF_SESSION_EXPIRED` 410, schema/owner/nonce 형식·체인 검증 등 나머지 규칙 위반 422, 내부/RPC 예외 500. 응답은 기존 고정 메시지 구조를 따르고 민감한 RPC 원문을 내보내지 않는다.

`createSameOriginApi`는 기존 HTTP `.message` 축약을 유지하면서 [공통 오류 복구 계약](API_RECOVERY.ko.md)의 안전한 `.code`와 결과 확인 안내를 전달한다. `createWalletClient`의 [authorizeProofSession](PROOF_WALLET.ko.md)이 정확한 types/domain/message 및 서명 전·후 지갑 context를 검사한다. F4는 사용자에게 runtime/신청/owner/만료와 합성 제한을 보여주고 명시적 승인 동작 및 안전한 오류 표시를 연결해야 한다. 지갑 서명 요청을 자동 재시도하거나 서명을 localStorage에 보관하지 않는다.

## DB와 검증

schema 3은 기존 schema 1/2의 세션·신청·최종 동의·예치를 보존하고 proof_sessions 테이블과 unique 제약을 추가한다. 환경 설정이 정확히 같은 경우에만 한 transaction으로 이관한다. 다른 환경·알 수 없는 version은 거부하며 실패한 이관 DDL도 rollback한다. 앱을 종료하고 전환하며 구버전 앱을 같은 DB와 동시에 실행하지 않는다. schema 3에서 nonce 테이블이 사라졌으면 빈 테이블을 다시 만들어 재사용 방지를 초기화하지 않고 시작을 거부한다. downgrade/reset은 제공하지 않는다.

```sh
./tools/npm run test:proof-sessions
./tools/npm run test:applications
./tools/npm run test:vault
./tools/npm run test:dev
./tools/npm run verify:workspace
```

시험은 임시 DB, 무작위 임시 지갑, 새 메모리 TEST 체인, 신뢰한 임시 CA의 loopback HTTPS만 사용한다. 별도 프로세스 DB 경쟁 시험은 실제 EVM reader에서 얻은 고정 관측값을 시험 전용 reader로 전달해 DB 원자성을 분리 검증한다. 실제 체인 reader의 발급/청구/회수·기간·reorg/코드/체인·준비금 거부는 별도 EVM 시험이다. 실제 확장 지갑 UI, YBM 수집·증명 연결과 공개 체인 거래는 실행하지 않았다.

2026-10-12 Apple Silicon Mac/Node 24.21.0 검증: B1 31개 + 기존 인증/신청 58개 + 금고 78개 + C1 33개를 함께 실행해 **200개 통과, 실패/skip 0**. 정책 112개 별도 통과(이번 실행 총 312개). 의존성 검사와 원본/legacy 191개·공개 참고문서 지문 보존 검사도 통과했다. 전체 공개 합성·Mac 복구 CI와 공개 이력 검사는 연결 PR의 정확한 head 결과를 확인한다.
