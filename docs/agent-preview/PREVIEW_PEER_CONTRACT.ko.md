# Self preview peer/context 계약 v1 — B 소유 후보

기준 base `5f528d7e65385ec92083fe43b79849dccffc2e07`. 본부가 승인한 첫 연결은 B 학생 본인 session + 현재 ACKNOWLEDGED 신청 + 현재 binding이다. C configure operator 권한은 학생 조회 위임이 아니다. 이 문서와 JS/PHP fixture는 B 단일 소유이며 C/D가 임의 확장하지 않는다. 본부의 exact 후보 검토 전 cross-peer 활성화는 없다.

현 후보는 모듈과 합성 검사까지다. transport는 `DISABLED` 기본, 주입 전송기를 사용하는 `OFFLINE_TEST`만 지원한다. 기존 coordinator의 실제 installation 차단을 해제하지 않았다. `createPreviewDevelopmentHandler`는 opt-in factory이고 HTTPS loopback만 허용하며 listen하지 않는다. 기존 `startSourceDevelopment`/일반 application handler에는 preview 경로가 추가되지 않았다. 새 유료 모델 호출, 기관 로그인, tunnel, 배포는 수행하지 않는다.

## 권한과 흐름

1. B가 별도 provision된 auth/student/coordinator를 사용한다. HTTP 입력은 `{version:"clear-self-preview-context.1",sourceText}`만 허용한다. application/subject/course/target는 서버 설정과 승인된 기존 mapping에서 결정한다.
2. 매 작업에 fresh B auth context가 필요하다. authentication.authorizeWorkflow(write=true) participant, student의 현재 ACK, coordinator.bindingStatus를 검사한다. contextRef만 가진 C/D peer는 학생 조회를 시작할 수 없다. 쿠키/토큰을 D/C에 전달하거나 context 레코드에 저장하지 않는다.
3. B가 opaque `previewContextRef`를 발급한다. 내부 scope는 auth config/revision, application/policy revision, bindingRef/revision, target, issuer/deployment epoch, artifact/model/limitsHash, sessionDigest에 결합된다. source/model bodyHash 및 수명을 별도 결합한다. 원문은 레코드에 저장하지 않는다.
4. 각 실제 모델 입력의 직접 사용자 승인은 D 소유의 단회 ledger에서 처리한다. B의 `approvalBindingHash`는 domain + contextRef + scopeHash + sourceHash + bodyHash + model + limitsHash + artifactHash + deploymentEpoch + expiresAtExclusive의 canonical JSON SHA256이다. D가 기존 config-only bindingHash 대신 이 정확한 범위와 모델·호출한도·원문 bodyHash를 확인하도록 연결해야 한다. artifact/model/limits/epoch 변경은 기존 context와 승인을 무효화한다. B context 생성/prepare는 과금 승인이 아니다.
5. D의 peer-인증·AST 검증 완료 응답 소비자만 B의 `acceptVerifiedDraft`를 호출한다. 호출 형식은 acceptVerifiedDraft(context, input, proposal)이다. input exact keys는 previewContextRef,draftId,proposalHash,sourceHash,bodyHash,approvalBindingHash이고 proposal exact keys는 sourceText,rows다. proposalHash는 nonzero64hex여야 한다. B가 현재 원문의 sourceHash/model bodyHash를 다시 계산하고 기존 reviewModelProposal로 절·위치·capability를 검증해 계산된 AST proposalHash와 대조한다. 검증 상태는 OPERATOR_REVIEW_REQUIRED여야 하며 미해결·미지원 제안은 수락을 거부한다. 검증 뒤 현재 context를 다시 확인하고 해시와 draftId만 보관한다. 기존 draft를 다른 지문으로 교체하지 못한다. 이 메서드는 HTTP로 공개하지 않는다. 학생이 동일 draft/proposal을 별도 POST review해야 observe할 수 있다.
6. B의 authenticated 학생 observe POST마다 기존 coordinator.readPreview를 실행한다. C full .3의 DTO, installation/course/subject/audience/issuer/trust/roster/scope, confirmation/session/enrolment, target, currentness와 최종 auth/신청/binding fence는 그대로다. wrapper도 부모 expiry 및 기존 maxObservationAgeSeconds/finalFenceMs를 유지한다. D30초 정책으로 완화하지 않는다.
7. B가 검증된 triple을 D의 고정 `/v1/preview/observation-result`에 보내는 방향을 제안한다. B→C는 `/observations`. 이 결과 전달 후보 경로는 D에 아직 구현되지 않았다. 현재 browser `/preview/observe`는 triple을 반환하며 전송을 자동 실행하지 않는다. 내부 deliverObservation은 같은 프로세스가 방금 얻은 triple만 받아 최종 authority/currentness 재검사 후 await 없이 dispatch한다. 복사·변조·이미 전달한 triple 및 finalFenceMs를 넘긴 결과는 새 peer timestamp로 재서명할 수 없다. peer expiry도 원 관측 max-age/source/context expiry 이내로 줄인다. 별도 D→B context-only callback을 만들지 않는다. C→D 조건 작성 흐름은 학생 권한과 분리한다.

## 관측 본문

C `/observations` 요청 body exact keys:

```json
{"version":"clear-moodle-observations.3","requestRef":"opaque","issuerEpoch":"server-pin","bindingScopeHash":"64-lowercase-hex","confirmationRef":"opaque"}
```

peer 외부 requestRef는 매 전송 random32bytes hex이며, 기존 `.3` requestRef와 별개다. full C 응답과 inner requestRef 검증은 기존 B coordinator가 수행한다. `.3` 본문에 peer 필드를 덧붙이지 않는다.

D 전달 본문은 exact `{targetRef,status,observedAt}`. targetRef는 기존 opaque 규칙, status는 COMPLETE|INCOMPLETE|UNKNOWN|INACCESSIBLE, observedAt은 Unix **seconds** 정수다. 최초 C Page 구현은 COMPLETE/INCOMPLETE를 반환한다. 관측 사실은 자격·지급을 뜻하지 않는다. sourceStatus/peer provenance를 완료 상태로 바꾸지 않는다.

## 정확한 wire와 서명 바이트

HTTP POST, Content-Type 정확 `application/json`, content-encoding 없음. body 최대16384 bytes, 전체 envelope 최대32768 bytes. envelope는 exact `{body,mac,meta}`의 UTF-8 canonical JSON이다. body는 원래 payload bytes의 표준 padded base64, mac은 HMAC-SHA256 소문자64hex다. 메타 키 순서는 JSON에서 사전순이며 JSON whitespace/중복 key/escaped key alias/과학 표기 숫자는 허용하지 않는다. UTF-8 오류와 base64 비정규 표현을 거부한다. body의 application JSON 해석/검증은 각 원래 DTO 소유자에게 남는다.

메타 exact fields와 **서명 필드 순서**:

```
version, kind, keyRef, sender, receiver, audience, deploymentEpoch,
method, path, requestRef, contextRef, sourceHash, proposalHash, bodyHash,
issuedAt, expiresAtExclusive, requestHash, status
```

- version=`clear-preview-peer.1`, kind=REQUEST 또는 RESPONSE, method=POST.
- keyRef/sender/receiver/audience/deploymentEpoch/contextRef는 `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`. sender≠receiver. peer 설정은 방향/path/audience/epoch/keyRef를 고정한다.
- requestRef/sourceHash/proposalHash/bodyHash/requestHash는 소문자64hex. prepare/generate의 사전 draft 요청과 그 상관 응답은 zero64를 허용한다. /observations, /v1/preview/execute, /v1/preview/observation-result의 REQUEST와 RESPONSE는 nonzero proposalHash를 필수로 요구한다. 위반은 PEER_PROPOSAL_REQUIRED로 서명 생성·수신 검증 단계에서 거부하며 replay를 소비하지 않는다. 이후 서버 소비자는 그 해시를 현재 context의 검증된 AST 및 명시적 review와 대조한다.
- issuedAt/expiresAtExclusive는 양의 JS safe integer Unix seconds. 수명은 관측/prepare/execute/result 최대5초, `/v1/preview/generate`만 최대45초다. 생성 경로도 요청 도착 시 발급 후5초 이내여야 하며, 45초는 이미 수락한 생성 작업의 응답 완료 한도다. REQUEST status=0, requestHash=zero64. RESPONSE status=200, requestHash=SHA256(원 REQUEST 서명 바이트). 성공 이외 HTTP 응답은 결과로 수락하지 않는다.
- RESPONSE는 sender/receiver를 반대로 하며 keyRef/audience/deploymentEpoch/path/requestRef/contextRef/sourceHash/proposalHash를 동일하게 유지한다. expiry는 원 요청 및 부모 context expiry 이내다. bodyHash는 각각의 원 payload bytes SHA256이다.
- key는 **32 raw bytes**다. 기존 D v0 HMAC의 64hex 문자열 key 관행과 다르며 v0와 자동 호환시키지 않는다. 프로비저닝 hex 표시를 쓰면 정확히 한번 decode한다. keyRef는 사전 고정키를 선택하며 요청의 URL로 키를 가져오지 않는다.

서명 바이트는 다음 concatenation이다:

```
ASCII("CLEAR\0PREVIEW\0PEER\0HMAC-SHA256\0V1\0")
+ 각 필드에 대해 uint32_be(ASCII값 byte length) + ASCII값
```

숫자는 최단 unsigned decimal 문자열, locale/leading zero/소수/지수 없음. 메타의 모든 값은 위 규칙상 ASCII이다. body는 서명 입력에 직접 이어붙이지 않고 bodyHash로 결합한다. SHA256/HMAC의 hex는 항상 lowercase이다. JSON metadata 정렬 순서와 서명 필드 순서를 혼동하지 않는다.

권위 fixture는 `tests/agent-preview/fixtures/preview-peer-v1.json`, PHP 독립 참조는 `preview-peer-reference.php`, JS 구현은 `peer-transport.mjs`다. fixture의 keyByte17은 공개 합성값이며 실제 키가 아니다. PHP는 config.php/bootstrap/DB를 불러오지 않는다.

## 시간·재사용·전송

- replay 키는 kind,keyRef,sender,receiver,audience,deploymentEpoch,path,requestRef의 canonical array SHA256이다. body가 바뀌어도 동일 requestRef는 재사용하지 못한다. 요청과 응답 각각 새 durable INSERT/claim이 필요하다.
- reader 검증/MAC/pin 검증 후 전용 SQLite `BEGIN EXCLUSIVE`로 잠금을 획득한 다음 fresh clock을 샘플한다. 수명·전진 clock floor 검사, replay INSERT, floor 갱신을 한 transaction으로 commit한다. commit 후 다시 만료를 검사하고 실패해도 nonce는 소비된 상태로 남긴다.
- 허용 skew는 배포에서 명시0..2초. 수락 조건은 issuedAt≤now+skew, now−issuedAt+skew<5, now<expiresAtExclusive−skew다. 이미 수락한 request의 응답 생성/최종 correlation에서는 elapsed를 그 경로의 완료 한도(5초/생성45초)와 비교한다. response 자체의 issuedAt 신선도는 여전히5초다. 모델 단회 승인 expiry는 이 transport 완료 한도와 별개이며 두 모델 dispatch 직전에 D가 검사한다. 이미 만료된 메시지를 재시도용으로 갱신하지 않는다. retry는 새로운 사용자 의도/권한 확인과 새로운 requestRef이며 모델 단회 승인을 복구하지 않는다.
- 고정 HTTPS origin+허용 path만 사용한다. TLS 검증을 끄는 옵션/환경은 허용하지 않으며 credentials:omit, redirect:error, cache:no-store. proxy 헤더나 요청 URL/host를 peer identity로 승격하지 않는다. 실제 활성화 인수에는 고정 DNS/인증서·egress 정책이 별도로 필요하다.
- 취소 timer는 초 단위 clock의 다음 초 경계를 현재 시각의 보수적 상한으로 사용한다. peer deadlineMono = startMono + min(timeoutMs, (expiresAtExclusive - sampledSeconds - skew - 1) * 1000)이다. timer arm 및 최종 결과 수락은 같은 monotonic deadline을 사용한다. 잔여 시간이 없으면 dispatch 전 거부한다. clock/monotonic injection 인자와 wire Unix seconds DTO는 유지한다.
- 전송·body stream을 합쳐 관측/prepare/execute/result 최대5초, generate만 최대45초, monotonic 검증, AbortSignal 및 Promise.race로 늦은 응답 차단. 크기·content-type·HTTP200·response URL/redirect·응답 서명과 correlation을 확인한 후만 body를 반환한다. network/MAC 실패 상세를 공개 HTTP 오류에 포함하지 않는다. origin/key/request/body/식별자 로그는 금지한다.
- replay DB는 독립 private0700 directory/0600 file, 단일 링크와 실제 경로를 검사한다. 상태를 지급 DB에 저장하거나 D에 지급 DB를 mount하지 않는다.
- trusted clock/DB·프로세스 소유권은 전제다. whole backup rollback을 내부 floor로 탐지한다고 주장하지 않는다. DB 손실/복원 또는 key/배포 복구에는 새로운 deploymentEpoch와 peer key가 필수이며 이전 승인은 무효화한다. 이 회전은 운영 owner의 원자 프로비저닝 의무이며 코드가 자동 회전하거나 구 epoch를 허용하지 않는다.

## context 수명과 HTTP

context 수명은 최대120초(현 기본60), binding/session/release expiry 중 최소값 이내다. wall exclusive expiry와 monotonic 수명을 검사하고 실제 timer로 레코드를 제거한다. 초 단위 clock이 버린 fractional second를 보수적으로 반영해 expiresMono = sampledMono + (expiresAtExclusive - sampledSeconds - 1) * 1000으로 정한다. timer arm 시까지 경과한 monotonic 시간을 차감한다. 따라서 최대1초 조기 만료할 수 있으며 잔여 보장 시간이 없으면 발급을 거부한다. 최대16개(설정 상한64), context당 observation 하나만 진행한다. 원문/원시 모델응답/토큰/지갑은 저장하지 않으며 scope digest만 유지한다. 재시작으로 context는 소실되고 D의 단회 과금 승인은 복구되지 않는다.

별도 handler 경로는 auth 4개와 POST `/preview/context`, `/preview/review`, `/preview/observe`만이다. browser request는 HTTPS, exact Host/Origin, same-origin fetch, 별도 `__Host-clear-preview-session`, wallet/chain/CSRF를 요구한다. HTTP handler는 내부 acceptVerifiedDraft나 peer listener를 노출하지 않는다. 지급/runtimes/policies/applications/proof/RPC/admin/정적 파일을 mount하지 않는다. 단순 `enabled:true`는 peer 활성화를 뜻하지 않는다.

C의 native UI/role/sesskey와 observations listener는 C 소유, D 배포/승인 ledger/model dispatch/provenance 소비는 D 소유다. B의 새 공통 handler export 및 development factory는 기존 기본 라우트/loopback 정책을 변경하지 않는다. peer 문서 검토 후 실제 C/D endpoint 및 실시간 transport 활성화는 별도 exact diff 인수다.
