# C1 최소 프론트 인계 — Python 네 조건

2026-10-22. 기준 `6962c13`의 기존 v2/v3 DTO·동의 handler를 재사용한 추가 연결이다. 기존 v1/R2/R3, AI 준비→승인→단회 실행 및 v6 고정 소스36개는 변경하지 않았다. C4~C6의 복구·범용 진행률·이력 탐색·대시보드는 이번 범위가 아니다.

## 바로 사용할 범위

| 제공 | 범위 |
| --- | --- |
| `tools/bootcamp/frontend-dev.mjs` | 기존 인증 서버와 부트캠프 handler를 같은 HTTPS 출처에 설치. C1 표시/인증 전용이며 시작 시 신청·원천 lease·체인·signer를 만들지 않음 |
| `src/bootcamp/normal-client.mjs` | 브라우저용 순수 모듈. 기존 v3 절차 / v2 조회를 같은 target으로 묶고 v3 동의·명령 조회 사용 |
| `specs/bootcamp/normal-frontend-fixtures-v1.json` | 원천 전/운영자 동의 대기 두 합성 사례, 각 두 역할. 실제 호스트 입력이나 fresh 증거가 아님 |

개발 호스트의 store는 `DISABLED`다. 본인 신청 생성·두 역할 조회의 HTTP 배선을 확인할 수 있지만 원천 수집·배정·공개·지급은 준비하지 않는다. 동의 handler의 설치와 동의 가능한 현재 판정 준비를 구분한다. 실제 HTTPS 검사에서는 합성 port로 현재 판정·전액 배정을 준비한 뒤 두 역할 동의와 낡은 target 거부를 검증했다. C2/C3의 실제 호스트·원천·UI 완주는 아직 아니다.

## 호스트와 인증 준비

API 작업본에서 Node24.21.0과 기존 고정 의존성을 사용한다. 이 Mac에 이미 있는 공통 Node를 사용할 때:

```sh
cd /Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-bootcamp-api-store
C1_NODE_DIR=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin
# C1_PARTICIPANT/C1_OPERATOR에는 각 역할 테스트 지갑의 공개 주소를 넣는다.
PATH="$C1_NODE_DIR:$PATH" LOG_LEVEL=silent ./tools/node tools/bootcamp/frontend-dev.mjs init --name c1-display --participant "$C1_PARTICIPANT" --operator "$C1_OPERATOR"
PATH="$C1_NODE_DIR:$PATH" LOG_LEVEL=silent ./tools/node tools/bootcamp/frontend-dev.mjs start --name c1-display
```

기본 출처는 `https://127.0.0.1:9444`, chainId는431701이다. init 때 `--port`/`--chain-id`를 지정할 수 있고 start는 저장된 설정을 사용한다. 기존 이름을 덮어쓰거나 DB를 초기화하지 않는다. 시작 실패·잠긴 실행은 상태를 확인하며 새 복구 기능을 추가하지 않았다.

이 환경의 `var/bootcamp-frontend/c1-display/ca.pem`만 개발 브라우저에서 확인해 신뢰한다. TLS 검증을 끄지 않는다. 이미 빌드한 `web/dist`가 있으면 같은 출처에서 제공하고, 없으면 페이지404다. web 소스는 수정하지 않았다. 별도 개발 포트의 CORS 우회는 사용하지 않는다.

기존 인증 순서는 `POST /auth/nonce` → 지갑의 메시지 서명 → `POST /auth/verify` → `GET /auth/session`이다. 쿠키는 Secure/HttpOnly이며, 기존 walletClient의 `request(path, options)`가 `credentials`, `x-wallet`, `x-chain-id`, 쓰기 시 `x-csrf-token`을 담당한다. 서명·쿠키·CSRF를 브라우저 저장소나 로그에 넣지 않는다.

## 호출 예제

```js
import {createNormalBootcampClient} from './normal-client.mjs';
const bootcamp = createNormalBootcampClient({
  request: (path, options) => walletClient.request(path, options)
});
const view = await bootcamp.view(applicationId);
// view.target은 이번 조회의 revision/ledgerSequence/decision ID·revision·hash다.
const receipt = await bootcamp.consent(applicationId, view, 'AGREE', {
  idempotencyKey: 'explicit-agreement-1'
});
const stored = await bootcamp.operation(applicationId, receipt.record.operationId);
const current = await bootcamp.view(applicationId);
```

같은 GET 흐름은 config→v3 procedure→v2 operations→v3 procedure다. 두 절차 조회의 업무 내용 또는 target/ledger가 달라지면 `BC_NORMAL_STALE`을 반환한다. 자동 POST 재전송이나 합성 성공 fallback은 없다. 동의·철회는 `AGREE`/`WITHDRAW`이며 본문은 기존 target5필드와 value만 보낸다. 운영자는 참가자 동의 뒤 자신의 화면을 새로 조회한 target으로 동의한다.

| 용도 | 실제 설치 경로 |
| --- | --- |
| 현재 절차 | `GET /bootcamp/v3/applications/:app/procedure` |
| 조건 이유·근거 참조 | `GET /bootcamp/v2/applications/:app/operations` |
| 같은 판정 동의/철회 | `POST /bootcamp/v3/applications/:app/review-consents` |
| 알려진 명령 재조회 | `GET /bootcamp/v3/applications/:app/procedure-operations/:id` |

POST 응답을 잃었지만 operationId를 알면 GET으로 조회한다. ID도 모르면 **원래 본문·원래 멱등 키**의 명시 재요청만 사용한다. 새 target에 옛 동의/키를 옮기지 않는다. 409의 `BC_VIEW_STALE`/`BC_DECISION_TARGET`은 새 조회·새 명시 동의가 필요하다. 401은 재인증,403은 역할/지갑/CSRF/동일출처를 확인한다. 미설치 경로404를 성공으로 표시하지 않는다.

## 최소 표시와 한계

- `decision.current`는 현재 신청/판정 참조, `decision.evidenceCurrent`는 현재 네 근거의 MET 상태다. 서로 다른 뜻이다. 네 조건의 기존 MET/NOT_MET/MISSING/UNKNOWN은 그대로 표시한다.
- `agreedPayment.amountAtoms=100000000`, symbol TEST, decimals6은 약정이다. `funding`의 현재 배정 여부·판정 일치와 별개이며 미확인 amount/reserved는 null을 유지한다.
- `sourceMode`/`criteria[].source.hostMode`는 호스트의 출처 모드다. 개별 실제 proof 수락을 대신하지 않아 `actualSourceVerification=null`이다. 생성 Moodle 계정·실제 HTTP 수집·실제 HR proof·AI 실행은 C2의 별도 근거로 연결해야 한다.
- `originalEvidence.authorized`는 기존 역할/현재성 판단이고 `httpAvailable=false`다. 이 호스트에는 원문 GET을 설치하지 않았다. 운영자의 원문 권한을 확대하지 않는다.
- 절차의 status/서버 observedAt/confirmAt/reviewCapAt, 같은 판정의 consent와 objection.blocked를 재사용한다. 120/1/600을 브라우저 시계로 다시 시작하지 않는다.
- `acceptedRight`, transactionState/hash/blockRef, claimState를 구분한다. 이 최소 조회에는 claim receipt/Transfer·잔액 readback HTTP가 없어 `receivedAtoms`/`canonicalTransferVerified`는 null이다. FINALIZED인 accept를100 TEST 수령 완료로 표시하지 않는다.

C2는 검토된 HR source의 같은 owner/pins→`openLiveContext` callback 안의 같은 신청 수집을 연결하고, 마지막에 Moodle/회고 packet을 준비한다. C1 표시 호스트 DB를 실제 원천 환경으로 전환하지 않는다. HR 준비 전 fresh 신청/lease를 발급하지 않으며 새 AI 승인은 정확 packet 준비 후 본부가 한 번 안내한다. 사용자 입력은 현재 필요 없다.
