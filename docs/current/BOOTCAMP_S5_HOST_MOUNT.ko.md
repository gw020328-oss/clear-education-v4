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

초기 시험 작성 중 HEAD의 빈 응답 본문 처리와 기존 CAS/세션 오류 기대값을 보정했다. 미설치 중첩 의존성으로 시작하지 못한 첫 실행도 제품 실패와 구분한다. 제품의 시계·TTL·권한·만료 검사는 수정하지 않았다.

v35 인수는 v34 원문과 기존 180개 소스 집합을 보존하고 `tools/bootcamp/frontend-server.mjs` 지문 하나만 변경한다. 관련 source consumer/preservation 검사만 새 세대에 연결한다. E5 B workflow는 이 호스트와 HTTPS 시험 변경에도 기존 실행/API 회귀를 수행하도록 path filter 두 개를 추가한다. 필수 보호 검사 설정은 변경하지 않는다. 로컬 HTTPS 14/14, 등록·S3/S4·시계 집중 회귀 65/65, API/store 739/739와 v35 180개 소스·E4 8/E5 18 보존·workspace·의존성·공개 이력을 확인했다. 별도 과거 호환성 시험은 기존 원본에서도 같은 다섯 역사 비교 실패를 재현했고, 후속 세대 변경 파일을 각 원래 세대의 Git bytes로 읽도록 보정했다. 현재 지문은 v35 전체 비교로 계속 검사한다. 정확한 최종 HEAD/CI와 후속 검사 수는 PR 및 Issue106 댓글을 따른다.

남은 S5는 PR60/web의 두 역할 화면·지갑/동의·영수증 연결, 실제 평가 입력 authority와 새 신청의 실제 원천·이번 입력 AI 승인·별도 등록 서명·양측 동의·100 TEST 수령 확인이다. r20의 기존 V1 성공을 새 V2 제품 완주로 재사용하지 않는다. 이번 작업은 실제 로그인/Reclaim/유료 AI/사용자 지갑/공개 체인·main 배포·병합을 수행하지 않는다. Issue106은 OPEN/실제 제품 미완료다.
