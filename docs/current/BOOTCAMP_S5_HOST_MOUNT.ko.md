# S5 제품 호스트 V2 등록·S3 조회 연결 후보

2026-10-27. develop `3a82dcefbb51b635937d01f17f48d095c7594e7a`에서 시작한 Draft 후보다. 병합 전에는 이 연결이 develop에 있다고 가정하지 않는다. Issue106의 최신 병합 기준과 제품 완주 체크는 그대로 유지한다.

기존 `createBootcampFrontendServer`의 정확한 허용 목록에 아래 세 메서드/경로만 추가했다. 기존 handler·normalUi·normal-client를 재사용하고 새 권한이나 실행 adapter를 만들지 않는다.

| 메서드 | 경로 | 기존 client |
| --- | --- | --- |
| GET | `/bootcamp/v3/applications/:app/recipient-registration` | `api.recipientRegistration(app, {signal})` |
| POST | `/bootcamp/v3/applications/:app/recipient-registration` | `api.submitRecipientRegistration(app, packet, signature, {idempotencyKey, signal})` |
| GET | `/bootcamp/v3/applications/:app/review-chain` | `api.reviewChain(app, {signal})` |

```js
const packet = await api.recipientRegistration(app, {signal});
// 참가자가 payload와 calldataPublic 안내를 보고 별도 EIP-712 서명한다.
// signature는 그 명시적 지갑 동작의 반환값이다.
const received = await api.submitRecipientRegistration(app, packet, signature, {
  idempotencyKey, signal
});
const registration = await api.recipientRegistration(app, {signal});
const review = await api.reviewChain(app, {signal});
```

서명은 원천/지급 서명과 별개다. `signatureAccepted`와 `NOT_OBSERVED`는 접수이며 canonical 등록·지급 성공이 아니다. 등록 GET의 `chainStatus`, `registrationSequence`, `canonical`, `finalized:false`를 그대로 표시한다. review-chain의 `NOT_REQUESTED/PENDING/INCLUDED/REVERTED/REORGED`, `serverBlocked`, `matchesCurrentDecision`, `acceptedRightPreserved`, `claimExpiresAt:null`도 그대로 보존한다. 오류를 성공으로 바꾸거나 자동 서명·동의·POST 재시도를 하지 않는다. 기존 S4 decision-evidence GET은 유지한다.

기존 TLS/loopback·Host/Origin·cookie·wallet/chain·CSRF, 신청 소유 참가자/과정 운영자와 원래 세션·기한·CAS·멱등성을 사용한다. 미설정 실행 reader는 기존 `BC_E5B_UNCONFIGURED`로 거부한다. suffix/query/다른 버전·메서드와 내부 이의/평가/정정/종료 쓰기 API는 새로 노출하지 않는다. canonical 조회에 필요한 기존 읽기 이외에 수집·서명·AI·거래 송신·원장 변경·기한 연장은 추가하지 않는다.

## 검증과 인수

`tests/bootcamp-store/normal-frontend.test.mjs`는 제품 서버를 임시 loopback HTTPS listener로 실행한다. TLS CA는 fixture 디렉터리에서만 사용하며 OS 신뢰 저장소 설치나 실제 normal-host 활성화가 없다. 실제 store·인증·handler·client와 합성 canonical reader/영수증을 사용한다. V2의 정상 접수/멱등 readback·CSRF/Origin/Host/타인/역할/원래 세션/만료/CAS 거부, S3 PENDING/INCLUDED/REVERTED/REORGED·수락 권리 보존·비동기 조회 후 로그아웃 거부, DB 불변, S4 비회귀를 확인한다. 합성 fixture 서명은 메모리에서만 전달하고 출력하지 않는다.

초기 호스트 연결 시험 작성 중 HEAD의 빈 응답 본문 처리와 기존 CAS/세션 오류 기대값을 보정했다. 미설치 중첩 의존성으로 시작하지 못한 첫 실행도 제품 실패와 구분한다. 이 초기 단계에서는 제품 시계 검사를 수정하지 않았다. 아래 2026-10-28 CI 후속에서 세 시각 경계 경로를 수정했다.

v35 인수는 v34 원문과 기존 180개 소스 집합을 보존하고 `tools/bootcamp/frontend-server.mjs` 지문 하나만 변경한다. 관련 source consumer/preservation 검사만 새 세대에 연결한다. E5 B workflow는 이 호스트와 HTTPS 시험 변경에도 기존 실행/API 회귀를 수행하도록 path filter 두 개를 추가한다. 필수 보호 검사 설정은 변경하지 않는다. 로컬 HTTPS 14/14, 등록·S3/S4·시계 집중 회귀 65/65, API/store 739/739와 v35 180개 소스·E4 8/E5 18 보존·workspace·의존성·공개 이력을 확인했다. 별도 과거 호환성 시험은 기존 원본에서도 같은 다섯 역사 비교 실패를 재현했고, 후속 세대 변경 파일을 각 원래 세대의 Git bytes로 읽도록 보정했다. 현재 지문은 v35 전체 비교로 계속 검사한다. 정확한 최종 HEAD/CI와 후속 검사 수는 PR 및 Issue106 댓글을 따른다.

남은 S5는 PR60/web의 두 역할 화면·지갑/동의·영수증 연결, 실제 평가 입력 authority와 새 신청의 실제 원천·이번 입력 AI 승인·별도 등록 서명·양측 동의·100 TEST 수령 확인이다. r20의 기존 V1 성공을 새 V2 제품 완주로 재사용하지 않는다. 실제 로그인/Reclaim/유료 AI/사용자 지갑/공개 체인·main 변경은 범위 밖이다. develop 병합은 후속 승인에 따라 최종 HEAD CI와 코드 리뷰 통과 뒤에만 수행한다. Issue106은 OPEN/실제 제품 미완료다.

## 2026-10-28 CI 경계 오류 후속

PR120 `f7206a243e1d7046d77c648d9baaf0fde96b9466`의 [E5 B attempt 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40454601776)은 59/62였다. 실패는 다음 세 건이며 같은 실행을 무작정 재시도하지 않았다.

| CI 실패 | 확인한 위치와 재현 | 수정 |
| --- | --- | --- |
| V2 receipt rollover의 동시 GET 실패 | BIND_CONSENTS 중 procedure 종료 시 `BC_VIEW_STALE`. 고정 시계의 두 번째 tick을 +1하면 동일 오류 | 원래 revision/ledger sequence가 보존된 순수 전진 경계만 한 번 rollback 후 새 snapshot 구성. observer 목록 초기화, 최종 인증/범위/port 재검증 유지 |
| V2 enqueue rollover의 ALLOCATE SEAL 실패 | native 봉인 후 `B_SEAL_REFERENCE / BC_E5_CLOCK_CHANGED`. 결정적 +1 재현에서 signatures=2, broadcasts=1, INCLUDED=1/SEALED=1 | native seal·ticket consume·REFERENCE append는 각 한 번. 동일 savepoint 안의 read-only 최종 검증만 최대 한 번 재검사. 원래 binding/command/capability/CAS/기한/worker 권한 일치 필수 |
| delayed registration source-change 전에 setup collect 실패 | 기존 로그는 `BC_PRODUCER_FAILED`만 있어 과거 내부 원인은 미확정. 결정적 preflight +1에서 PREFLIGHT/BC_VIEW_STALE, producerCalls=0 재현 | 같은 STARTED request의 원래 issue/expiry/receipt window/guard/session/CAS를 producer 호출 전에 최종 재검증. 실제 producer는 한 번, collection 재시도 없음 |

constructor 전용 `onCollectionFailure`는 PREFLIGHT/PRODUCER와 기존 고정 오류 코드 allowlist 요약만 받는다. raw Error/message/request/source/wallet은 전달하지 않으며 observer 오류도 원래 실패를 바꾸지 않는다. E5 B fixture는 최대 16건을 출력하여 이후 setup 실패를 구분한다. 과거 CI 원인을 새 진단으로 소급 확정하지 않는다.

회귀는 GET의 최종 scope/logout/source/port/expiry/reverse/두 번째 충돌, 원래 confirmAt의 상태 재계산, producer의 호출 횟수·오류 분류·진단 비노출, native 봉인 후 권한·원본·만료·역행·반복 충돌 시 API reference rollback과 봉인 상태 보존을 검사한다. 제품 HTTPS listener에서도 canonical refresh 후 GET 경계를 검사한다. 기존 V2 실제 wall-clock 시험의 100 TEST·중복 청구 거부·S4 manifest 불변과 원래 실패 세 건을 유지한다.

새 seal 집중 시험은 제어된 논리 시계로 ALLOCATE 복구까지 확인한다. 초기 시험을 이후 START_REVIEW까지 진행하면 논리 시각과 canonical block의 차이로 RPC가 거부되어 대상 범위를 분리했다. 실제 wall-clock 전체 지급 검증은 기존 V2 suite에서 수행한다. 별도 wall-clock 시도의 SETUP/connectBridge 경계 실패도 기록하며 성공으로 계산하지 않는다. 이 일반 초기화 경로에는 재시도나 검사 완화를 추가하지 않았다.

v36은 v35 원문과 180개 소스를 보존하면서 `execution-api-bridge`, `execution-operations`, `operations`, `procedure`, `store`의 정확한 다섯 소스 지문만 변경한다. 원래 TTL·business/source/review/lease 기한, 발급 시각, nonce, 서명·송신 수와 기존 불변 인수는 유지한다. 최종 검사 수·HEAD·CI·병합 여부는 PR120과 Issue106의 최신 검증 기록을 따른다.

후속 로컬 검증: 집중 API/HTTPS 55/55(제품 HTTPS 15개 포함), native 봉인 경계 6/6, 기존 CI 실패 세 건 3/3, 역사/현재 소스 호환성 32/32, v36 180개·E4 8/E5 18 보존·workspace·고정 의존성 통과. 전체 API/store 첫 실행은 754/755이며 유일 실패는 수정된 procedure GET을 여전히 실패해야 한다고 가정한 기존 control 시험이었다. 해당 기대값 수정 후 집중 회귀가 통과했고 최종 전체 검사는 CI에서 확인한다.
