# 제품 API 담당에게 전달하는 candidate 계약 제안

P0 고정 `03fa64324ef9cc2ce4fb442a612329a7b1285677`의 HACKERRANK_CERTIFICATE_HOLDING.1 producer다. 이 문서는 공통 schema/HTTP/DB/ledger를 변경하지 않는다. 새로운 producer 신뢰 등록 및 실제 자료 수락 승인은 별도다.

## 호출 경계

1. 서버의 권한 있는 participant→wallet→application 관계, 고정 P0 policy/criterion 및 **current** runtime mapping/trust config를 조회한다.
2. 서버가 암호학적으로 무작위인 32바이트 nonce와 issuedAt/expiresAt(<=900초)을 발급·보관한다. 기대 SDK claim owner와 선택할 certificate ID(null 가능)를 포함한다. `requestMessage` 전체를 participant EOA가 승인한다. request의 audience/version과 trustConfigHash/recipeHash가 서로 맞아야 한다. 서버 보관 expectedRequest를 브라우저 body에서 대체하지 않는다.
3. collector는 두 claim context에 `clearSchema=clear-hackerrank-context.1`, `clearRequestHash=requestHash(request)`, `clearSourceRole=account|certificate`, `clearRecipeHash=request.recipeHash`를 넣어 **새** proof를 만든다. 공식 signer가 서명한 결과에 이 context와 providerHash/required extractedParameters가 있어야 한다. 과거 proof에 외부 requestHash를 덧씌우지 않는다. 해당 실제 수집 경로는 이번 PR에서 실행/활성화하지 않았다.
4. 서버 소유 verifier가 `verify({envelope:{request,signature},proofs:{account,certificate}}, expectedRequest)`를 호출한다. raw proof 입력은 그 소유 경계의 메모리에서만 처리한다. BLOCKED/UNKNOWN/AMBIGUOUS/REJECTED를 MET로 바꾸지 않는다.
5. `VERIFIED_CANDIDATE`는 아직 durable evidence가 아니다. 동일 프로세스에서 `recheck(candidate, expectedRequest)`가 반환하는 정확 guard와 아래 저장소 검사를 transaction 안에서 함께 적용한다. `recheck`에는 await/외부 I/O가 없다. 직후 transaction이 지연되면 실제 commit 직전 같은 만료 조건을 다시 검사한다.

## candidate 최소 관계

- `version=clear-hackerrank-candidate.1`, producer, dataMode, trustConfigHash/recipeHash/privacyKeyId.
- `binding`: participantId/participantWallet/applicationId/criterionId/policyHash/runtimeMappingHash/requestHash/nonceHash/expectedClaimOwnerHash/requestIssuedAt/requestExpiresAt.
- source provider/instance/record/accountBinding opaque refs, sourceVersion/sourceHash, accountProofHash/certificateProofHash/proofBundleHash.
- acquiredAt(검증기 수신), verifiedAt, validUntilExclusive, 각 signed proofIssuedAt, achievementAt=null.
- P0와 같은 typed facts 및 verification 5상태·condition. 브라우저의 `qualified`/`verified`/날짜 주장을 입력으로 받지 않는다.
- receiptHash는 감사용 내용 hash이고 **서명/producer 인증이 아니다**. 같은 request 재검증 시 verifiedAt가 달라질 수 있다. idempotency의 안정 기준은 서버 actor/route/application + requestHash/nonceHash/proofBundleHash/sourceHash다.
- gates는 항상 paymentAllowed/productEligible/productionEnabled=false, grant/outbox HOLD, independentClaim NO_GO.

rawLocator/evidenceId/revision/previousEvidenceId 및 raw expiry는 원문을 소유한 제품 저장 계층이 생성한다. 후보 영수증은 파일경로·개인 연결 URL을 생성하지 않는다. evidence를 채울 때 P0 validateP0Evidence와 관계가 맞는지는 합성 compatibility 시험에 포함돼 있다.

## 하나의 transaction에서 해야 할 일

- participant/wallet/application 권한, 정책·mapping·trust hash의 current/CAS를 재검사한다. 기존 verifier 객체의 오래된 trust snapshot만으로 취소된 signer를 되살리지 않는다.
- request nonce 발급 기록과 미소비 상태, requestHash, expected owner/selection, 두 proof bundle hash를 대조한다. nonceHash와 evidence를 따로 쓰고 성공 사이에 crash gap을 남기지 않는다.
- 동일 command/request/bundle 재전송은 이전 동일 target 결과를 반환한다. 같은 nonce의 다른 request/body는 충돌이다. 새로운 nonce에 옛 proof를 넣으면 adapter의 signed context 검사에서 거부된다.
- 현재 epoch초가 `validUntilExclusive` 미만인지 commit 직전에 검사한다. source raw/query/auth lease의 최소 만료와 1800초 보존 상한도 저장 계층에서 적용한다.
- evidence append 및 이전 current invalidation, nonce 소비, receipt/reference 기록을 원자적으로 처리한다. 실패·재시작·동시 수락·CAS 충돌 시험은 제품 API 소유 범위다.

같은 proof를 이 모듈에 두 번 보내거나 새 verifier 프로세스에서 다시 검증하면 candidate가 다시 나올 수 있다. 이는 관측의 재검증이며 단회 수락을 보장하지 않는다. `recheck`의 WeakMap은 원래 in-process 객체만 확인하고, JSON으로 복원한 receipt를 믿지 않는다. 저장된 영수증은 제품 계층이 신뢰한 producer 경계/저장 무결성으로 인증해야 한다. 원문 proof 없이 공개 receipt hash만 들고 온 브라우저를 검증 완료로 취급하지 않는다.

## 미결 인수

실제 signer 승인·recipe/인증된 source semantics·필수 capture/ctx spoof 거부·새 signed request context 포함 두 개인 proof·EOA mapping의 실제 승인 흐름·안전한 collector/raw lifetime이 미결이다. 이번 신규 실제 개인 수집 0건. 실제 자료 수락 및 새 verifier trust 활성화는 이 제안만으로 승인되지 않는다. 자금 배정/동의/지급은 P3/P4 별도 관문이다.

## 고정 해시·호출 예제

[integration-vector.json](integration-vector.json)은 발명한 공개 주소와 nonce로 만든 **서명 없는 합성 인수 벡터**다. policyHash는 P0 실제 고정 정책의 해시이며, runtimeMappingHash는 `hash('SYNTHETIC_MAPPING', 'bootcamp')`로 만든 가상 값이다. pending 실제 mapping의 승인값으로 사용하지 않는다. request/recipe/trust/nonce hash와 participantApprovalMessage의 정확한 문자열을 포함하며 `integration-vector.test.mjs`가 재계산과 일치를 검사한다. 개인키·실제 proof·검증 영수증은 포함하지 않고 `ready=false`, `usableForClaim=false`다.

`clientContexts`는 수집 요청에 넣을 네 필드만 담는다. signed 결과의 providerHash와 extractedParameters는 검증한 원천에서 attestor가 산출해야 한다. 벡터나 브라우저가 제공한 extractedParameters를 원천 사실로 받아들이지 않는다. 필수 named group을 포함하면서도 다른 분기에서 추출 없이 성공하는 regex를 SDK 회귀 검사로 보존했다. SDK가 빈 추출에서 client context를 남기는 경로를 막았다는 실제 recipe 검증 전에는 운영 trust를 승인하지 않는다.

```js
// trustedConfig/key/issuedRequest come from server-owned configuration/storage.
const verifier = createHackerRankVerifier({trustConfig: trustedConfig, commitmentKey: key});
const candidate = await verifier.verify({envelope, proofs}, issuedRequest);
if (candidate.status !== 'VERIFIED_CANDIDATE') return pendingOrRejected(candidate);
// Inside the API owner's transaction: authenticate actor, recheck current
// mapping/trust/request, compare CAS, then consume nonce and append evidence.
const guard = verifier.recheck(candidate, issuedRequest);
// Recheck guard.validUntilExclusive at commit time. This module writes no DB.
```

이 예제의 저장 함수와 transaction은 구현 예시가 아닌 API 소유자의 연결 지점이다. 테스트용 config/clock을 운영 입력으로 노출하지 않는다. 정상 candidate의 정확한 출력 및 P0 evidence 변환 예제는 `tests/hackerrank-evidence/verifier.test.mjs`의 첫 시험에 있다. proof/signature는 시험마다 임시 키로 메모리에서 생성하며 공개 고정 영수증으로 재사용하지 않는다.

## 결과·오류 매핑

| 결과/코드 | 저장 계층 처리 |
| --- | --- |
| BLOCKED / TRUST_NOT_CONFIGURED | 원천 미준비로 보관; 로그인·자격 수락 진행 금지 |
| UNKNOWN / SIGNED_CONTEXT_REQUIRED | 두 signed context 중 필수 구조가 없음; 외부 metadata로 보충하지 않음 |
| AMBIGUOUS / AMBIGUOUS_CERTIFICATE | 같은 기존 proof를 덧칠하지 않고 선택 ID를 묶은 새 요청·참가자 승인·proof pair 필요 |
| REJECTED / EXPECTED_REQUEST_MISMATCH, PARTICIPANT_SIGNATURE, SIGNED_REQUEST_BINDING | 참가자/신청/요청 결합 실패; 수락 금지 |
| REJECTED / UNTRUSTED_SIGNER, CLAIM_SIGNATURE, CLAIM_IDENTIFIER, SOURCE_RECIPE, PROVIDER_HASH | 신뢰·서명·원천 무결성 실패; 브라우저 주장으로 우회 금지 |
| REJECTED / REQUEST_EXPIRED, REQUEST_WINDOW, PROOF_TIME, TRUST_EXPIRED | 만료·시각 부적합; 새 요청/증명 또는 서버 trust 재검토 |
| REJECTED / ACCOUNT_JOIN, CERTIFICATE_ID, CERTIFICATE_CLASS_OR_SELECTION, UNKNOWN_ISSUER_STATUS | 동일 계정/인증서 관계 또는 원천 형식 미충족; 합격으로 바꾸지 않음 |
| REJECTED / 기타 고정 code | shape/크기/JSON 등 입력 거부; 원문 예외나 proof를 응답에 추가하지 않음 |
| VERIFIED_CANDIDATE / MET 또는 NOT_MET | 검증한 관측만 의미; trusted producer 확인 및 단일 transaction을 거쳐 evidence에 기록 |

factory의 잘못된 REVIEWED config는 `EvidenceError`를 동기 throw한다. 초기화 오류로 처리하고 원문 config를 공개하지 않는다. `recheck`도 UNTRUSTED_CANDIDATE/EXPECTED_REQUEST_MISMATCH/CANDIDATE_EXPIRED 및 요청·신뢰 오류를 동기 throw한다. 그때 transaction 전체를 취소하며 nonce만 소비하거나 evidence만 저장하지 않는다. API HTTP status는 공통 소유자가 정하고 이 모듈은 HTTP 계약을 추가하지 않는다.

예치·배정·PG·회수·분쟁기한은 OPEN, grant/outbox HOLD, 독립 NO_GO, paymentAllowed=false를 유지한다. 실제 signer/recipe/context/collector 준비 전이라 지금 사용자 로그인은 요청하지 않는다. 준비가 끝난 뒤 최소 행동은 전용 collector에서 본인 계정 로그인, 서버 발급 관측 요청의 참가자 지갑 승인, 새 account/certificate proof pair 수집 확인이다. 비밀번호·쿠키·개인 proof를 채팅으로 전달하도록 요구하지 않는다.
