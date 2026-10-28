# P1 HackerRank 보유형 인증 adapter — 오프라인 준비

2026-10-17. P0 `03fa64324ef9cc2ce4fb442a612329a7b1285677` / Draft PR78에 의존한다. 기존 PR69/73/75와 YBM 연구는 보존했다. 전용 `src/hackerrank-evidence`, `tests/hackerrank-evidence`, 이 문서만 소유한다. 실제 계정/claim 파일·.env를 읽지 않았고 새 실제 수집·로그인은 실행하지 않았다.

**완료:** 두 claim의 실제 EIP-191 서명 검증, 참가자 승인 요청과 두 signed context 결합, 한 인증 레코드에서 조건 도출, 수신/검증/수락 직전 시간 검사, 원문 없는 candidate receipt. **미완료:** 실제 HackerRank 인증된 dashboard 추출 규칙·전체 인증 레코드 recipe의 실제 적합성, 운영 signer 신뢰 승인, 실제 요청 context 포함 수집, 제품 저장소의 원자 단회 수락. 기본 `pending-trust.json`은 UNCONFIGURED이며 입력과 관계없이 BLOCKED다.

이 구현의 성공 fixture는 새로 만든 합성 HTTP 응답과 매 실행 생성하는 임시 키를 사용한다. 공식 SDK 5.1.4의 HTTP extraction 및 signature verifier를 실행하지만, 공식 운영 attestor가 서명한 새 개인 증명 성공이 아니다. 가짜 키 검사를 생략한 mock verifier는 사용하지 않는다. 반환 dataMode는 SYNTHETIC_FIXTURE, sourceStatus는 MOCK_VERIFIED이며 별도 cryptography 필드가 실제 서명 시험 사실을 표시한다.

## 검증 순서

1. 서버가 자신의 인증된 participant/application/wallet/current mapping 및 발급 nonce 기록에서 `expectedRequest`를 가져온다. 같은 브라우저 body를 그대로 expected 값으로 사용하면 안 된다.
2. 참가자 EOA가 승인한 request 전체의 EIP-191 서명을 검증한다. 문구에 증거 관측 승인 및 지급 승인 아님을 명시한다. request에는 audience, participant/wallet/application, P0 policyHash/criterion, runtimeMappingHash, trustConfigHash/recipeHash, SDK용 expectedClaimOwner, 32바이트 nonce, issuedAt/expiresAt, selectedCertificateId(null 허용)가 들어간다. participant wallet과 SDK claim owner는 같다고 가정하지 않는다. EIP-1271 contract-wallet 승인은 미지원이다.
3. account와 certificate 각각 provider=`http`, 고정 recipe 전체 params, URL/method/추출 규칙, signer allowlist/epoch/유효기간, claim identifier와 attestor signature를 확인한다. 관찰한 주소를 자동 등록하거나 원격 registry를 암묵 조회하지 않는다.
4. **각 attestor 서명에 포함된 context**가 `clearRequestHash`, `clearRecipeHash`, `clearSourceRole`, `clearSchema`, `providerHash`와 일치해야 한다. 외부 wrapper requestHash는 거부한다. signed context 필드가 없는 기존 형식은 UNKNOWN이고 재서명된 다른 nonce/participant 요청에도 과거 proof를 쓸 수 없다.
5. account의 signed username으로 certificate 요청 URL을 정확히 구성한다. certificate의 signed `records` 문자열 전체를 bounded strict JSON으로 해석하고 각 레코드의 `username/certificate_id/certificate_name/status`를 함께 검사한다. 모든 레코드 계정 일치·중복 ID 거부·32개 상한·중복 JSON key 거부를 적용한다. `data[0]`이나 특정 계정/인증 ID를 고정하지 않는다. Python 후보 여러 개면 request의 명시 ID가 없을 때 AMBIGUOUS다.
6. 선택한 Python (Basic) 레코드의 `test_passed`만 MET, `test_failed`는 NOT_MET다. 다른 인증의 합격 상태를 섞지 않는다. 알 수 없는 상태/형식은 UNKNOWN 조건으로 거부한다. 이 recipe는 합격일을 추출하지 않으므로 `achievementAt=null`이며 proof 시간으로 대신하지 않는다.
7. async 서명 검증 후 실제 시계를 다시 읽어 request/신뢰/두 proof freshness를 검사한다. 성공 candidate는 immutable 객체다. 이후 같은 verifier의 `recheck`로 정확한 요청·객체 출처·현재 만료를 수락 직전에 다시 확인한다.

## 시간과 저장 책임

운영 후보 모드의 시계는 `Date.now()` 기반 실제 UTC epoch초이며 외부 입력으로 바꿀 수 없다. `clock` 주입은 SYNTHETIC_FIXTURE에서만 허용한다. request 길이는 900초 이하, expiresAt는 exclusive, signed timestamp는 request 발급 이후·미래 아님·검증 시 최대 age900초다. `acquiredAt`은 이 verifier가 bundle을 수신한 시각, `verifiedAt`은 검증이 끝난 시각, 두 proof issuedAt은 attestor가 서명한 원래 값이다. 과거 성취 시각과 구분한다.

`validUntilExclusive`는 request 만료·trust 만료·각 signed timestamp+901초 중 최솟값이다. +901은 정수초 age<=900의 exclusive 표현이며 request 자체 900초 상한을 늘리지 않는다. 시연 scenario clock/1800초 접수 창은 이 모듈의 실제 시계를 대체하지 않는다. raw 보존 1800초/lease 정책은 소유 collector와 제품 저장소의 별도 책임이다.

`recheck`의 WeakMap은 **현재 프로세스가 만든 candidate의 출처 확인만** 한다. nonce를 소비하지 않는다. 같은 증명 재검증이나 verifier 재시작은 성공할 수 있다는 반례를 테스트에 보존했다. 전역 durable nonce/evidence 단회 수락·CAS·참가자 권한 재검사·receipt/evidence 기록은 제품 API 담당의 한 transaction이다. 이 adapter에 DB/registry/volatile spent cache를 추가하지 않았다. [통합 제안](INTEGRATION.ko.md)을 따른다.

## 신뢰 설정과 실제 경로의 남은 관문

`createHackerRankVerifier`의 trustConfig/commitmentKey/expectedRequest는 서버 소유 입력이다. 브라우저·proof의 자기 선언으로 채우는 API를 만들지 않는다. config 전체를 snapshot하고 요청 서명과 receipt에 그 hash를 묶는다. REVIEWED는 외부 신뢰 승인 절차의 결과를 받아들이는 계약이며 문자열 자체가 승인 증명이 아니다. 실제 승인된 signer/recipe config는 이번 PR에 제공하지 않는다. 기본 UNCONFIGURED 파일을 유지한다.

코드에 있는 `syntheticRecipe()`는 **발명한 합성 응답에만 맞는 추출 규칙**이다. 실제 dashboard HTML 또는 실제 certificate JSON 구조를 보고 만든 recipe가 아니다. 인증 상태와 계정 통제의 의미는 실제 authenticated/anonymous/other-account 응답에서 확인해야 한다. marker가 없는 익명 합성 응답 거부는 그 실제 검증을 대체하지 않는다. 실제 sourceReview/contextReview 승인 없이 REAL mode로 바꾸면 안 된다.

공개 SDK 소스에서는 claim identifier가 provider/params/context를 포함하고 서명 데이터가 identifier/owner/timestamp/epoch를 묶는다. [고정 upstream claimTunnel](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/handlers/claimTunnel.ts)과 [assert-valid-claim-request](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/assert-valid-claim-request.ts)의 context 보존·providerHash·extractedParameters 처리도 확인했다. 이는 제안한 signed-request 결합이 프로토콜상 가능한 근거이며 새 공식 claim에서 실제 확인한 결과는 아니다. 특정 hosted 배포 버전과 동일하다고 단정하지 않는다.

주의할 source-review 관문: upstream은 추출 결과가 비어 있으면 client context의 extractedParameters를 덮어쓰지 않는다. 본 합성 recipe는 필수 named capture를 실제 HTTP 응답에서 만들며 시험으로 확인한다. 일반 config도 required capture/invert 금지를 검사하지만 정규식의 모든 분기에서 capture가 반드시 존재하는지, 해당 필드가 인증된 계정에서 왔는지는 regex 문자열의 존재 검사만으로 증명되지 않는다. 새 live recipe는 필수 capture·익명/타인 반례 및 context spoofing 검증을 별도로 통과해야 한다. 실제 승인 미완료이므로 이번에 source trust를 켜지 않는다.

허용된 이전 `certificate-join-summary.json`과 실행기만 읽었다. 이전 실측의 두 서명/username/owner 조인 결과는 참고 근거이며 그 자료를 fixture로 복사하지 않았다. 요약의 authenticated/anonymous replay boolean은 실행기 안의 재검증 assert가 아닌 별도 전달된 관찰이다. 특정 username·첫 항목·특정 certificate 고정의 기존 실험은 새 adapter 완료로 승격하지 않았다.

## 개인정보와 출력

raw proof/context/signature/username/certificate ID/nonce/claim owner를 반환하거나 파일·로그에 쓰지 않는다. username/certificateId/owner commitment는 서버의 32바이트 별도 키로 HMAC하며 privacyKeyId를 고정한다. 평문 SHA256만으로 저엔트로피 계정명을 익명화했다고 주장하지 않는다. 키 수명/회전/보관은 운영 설정 관문이다. source/proof/request/bundle hash와 participant/application/wallet 관계가 들어 있는 receipt도 권한 있는 내부 전달물이며 공개 체인/공개 분석 로그에 게시하는 형식이 아니다.

서명 자체 대신 signed claim의 identifier/owner/timestamp/epoch를 proof hash에 사용하므로 context의 동등한 JSON 공백 표현이나 서명 인코딩 차이를 idempotency 키로 악용하지 않는다. raw input을 await 전에 복제하고 고정 코드만 오류로 반환한다. 버퍼 완전 소거/OS sandbox/별도 verifier 프로세스·실제 collector 연결은 이번 모듈이 제공하지 않는다.

## 실행과 분모

루트의 기존 고정 의존성 + 전용 prefix는 이전 collector lock graph의 정확한 버전을 재사용한다. root package/lock·다른 모듈·전역 Node는 변경하지 않는다. lifecycle script는 실행하지 않는다.

```sh
./tools/npm --prefix src/hackerrank-evidence ci --ignore-scripts --no-audit --no-fund
LOG_LEVEL=silent ./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/hackerrank-evidence/*.test.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/bootcamp-p0-contract.test.mjs
```

전용 테스트는 기존 공통 CI workflow에 추가하지 않았다. PR의 공통 CI 성공과 로컬 전용 SDK/서명 검증 성공을 구분한다. [검증 기록](verification.json)과 [직접 보안 리뷰](REVIEW.ko.md)를 따른다. 신규 실제 개인 증명 검증 건수는 0이다. 실제 로그인 요청은 source/신뢰 설정 및 안전한 수집 경로가 준비된 다음 필요한 범위로 별도 사용자 확인을 받아야 한다.

100 TEST는 P0 정책 관계만 유지하며 자금 권한을 만들지 않는다. grant/outbox HOLD, paymentAllowed=false, 독립 청구 NO_GO, productionEnabled=false, 400/500 제외를 유지한다. develop/main 병합·배포 승인 없음.
