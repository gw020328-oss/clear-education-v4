2026-10-31 [단계 실패 대기](BOOTCAMP_FAILURE_WAIT.ko.md): 실패 안내가 나오면 양쪽 화면에서 상태를 확인하고 실행 터미널에 `FINISH`를 입력해 종료한다. 새 승인·서명·지급은 차단되며 기존 실행의 자동 재개는 없다. 원천 브라우저와 자료는 실패 대기 전에 정리하고 인증은 원래 만료까지 조회에만 사용할 수 있다.

# 실제 정상 경로 호스트 준비와 활성화

2026-10-24 현행 v22: r13은 AI 승인 전달·기록까지의 왕복이 원천 유효창을 대부분 사용해 두 화면의 실제 동의 전에 만료됐다. [시간 분석과 새 순서](BOOTCAMP_R13_REVIEW_WINDOW_REVIEW.ko.md), [v22 오프라인 검증](BOOTCAMP_V22_VERIFICATION.json)을 우선한다. 정적 준비·사전 비용 승인 지갑 지정·두 화면 준비 후 HR→성찰 exact 승인·AI→활동→과제→E3→각 사용자 동의 순서다. 원래 만료를 유지하며 짧은 검토창은 중단한다. 실제 비용 승인 지갑은 아직 지정하지 않았고, 별도 재시험 지시 전에는 새 실제 호스트·CA·로그인·증명·AI·지급을 시작하지 않는다. 아래 v21과 과거 내용은 이력이다.

2026-10-23 후속: 제품 프론트를 기다리지 않는 [별도 backend 시험 클라이언트](BOOTCAMP_BACKEND_TEST_CLIENT.ko.md)를 구현·검사하고 기존 web-root/digest gate로 수락했다. 아래10월22일의 제품 프론트 미연결은 과거 준비 관측이다. backend 선시험에는 별도 시험 자산을 사용하며 제품 프론트 완료로 간주하지 않는다. 기존 API 계약은 같다.

2026-10-22. PR #102 / #78, 기존 C3에 추가된 실제 실행 진입점이다. C1 표시 서버와 구분한다. `web/`는 프론트 담당 소유다. 이 문서의 명령은 저장소 루트에서 실행한다. 고정 Node 24.21.0 / macOS arm64를 사용한다.

## 준비 결과와 재현 설정

| 항목 | 이번 로컬 준비 결과 | 재현 조건 |
| --- | --- | --- |
| HTTPS | `https://127.0.0.1:9445`, 사설 CA 검증 GET 성공 | `prepare --name NAME [--origin https://127.0.0.1:PORT]` |
| 저장 | `var/bootcamp-normal-host/normal-demo-20261022/`, 폴더 0700·파일 0600 | 이름별 새 폴더, 덮어쓰기 금지 |
| registry | 실제 lockf 경계 조회 1회 성공, 서명자 3개 | `check --registry`, 실제 실행은 새 trust를 다시 읽음 |
| Docker/Geth | 엔진 접근·기존 고정 이미지 확인 | 기존 E5 고정 이미지·새 격리 TEST realm |
| Moodle | db healthy/web running, 소유 소스 head·reader hash 일치 | 형제 `clear-moodle-review-api`의 head `364871ea139daed385f8c0ccd7033d03b8f24928`, 깨끗한 작업본 |
| AI | 기존 실행 환경의 GEMINI_API_KEY 존재만 확인 | 그 환경 변수만 상속, 파일/Keychain/다른 키 fallback 없음 |
| 프론트 | 아직 최신 작업본 연결·수락 전 | 실제 담당자의 `web/` 절대 경로, 공개 자산 digest 수락 |
| 두 지갑 | 공개 주소 입력 대기 | 서로 다른 참여자·운영자 주소, 키 제출 금지 |

로컬 절대 경로는 이 컴퓨터의 배치이며 배포 설정이 아니다. 다른 컴퓨터는 고정 버전과 소유 Moodle 소스·서비스를 먼저 준비해야 한다. 기존 `.toolchain`의 Node가 PATH에 있는 터미널에서 `./tools/node`를 사용한다. 전역 Node/패키지를 변경하지 않는다. 기존 DB·realm·실패 run3는 보존한다.

```sh
./tools/node tools/bootcamp/normal-host.mjs prepare --name normal-demo-20261022
./tools/node tools/bootcamp/normal-host.mjs check --name normal-demo-20261022
./tools/node tools/bootcamp/normal-host.mjs serve-prepared --name normal-demo-20261022
```

이번 컴퓨터에는 이미 prepare를 완료했으므로 첫 명령을 다시 실행하지 않는다. 준비 서버는 필요할 때 열고 Ctrl-C로 닫는다. 현재는 HTTPS 검증 후 닫혀 있다. CA 공개 파일은 위 전용 폴더의 `ca.pem`이며 시스템 trust 설치는 아직 하지 않았다. `.key`·쿠키·원문·서명·proof·API 키를 공유하지 않는다.

`prepare`는 CA·설정·공개 입력 템플릿만 만든다. `check --registry`는 FileVault/관리 저장 루트·실제 lockf·core dump 금지 경계 아래 공개 registry만 조회한다. 세션·Chrome·HMAC 키·원천 lease·신청·realm을 만들지 않는다. registry 결과는 30분짜리 준비 관측이며 실제 proof 성공이나 현재 실행 승인으로 재사용하지 않는다. `run`이 새 trust를 읽는다.

## 프론트 제공과 설정 계약

PR #60의 확인 기준 `a0620cd39fe5cd44b62a1deb5806883503242227`은 bundler/npm/package/build 단계가 없는 정적 `web/` 트리다. 최신 담당 작업본을 우선 확인한다. 기존 5173 HTTP dev server는 합성 개발용이다. 실제 실행에는 이 호스트가 담당 작업본의 `web/index.html`, `web/src/*.js`, CSS 등 공개 자산을 스냅샷으로 같은 HTTPS 출처에 제공한다. symlink·dotfile·허용 외 확장자는 공개하지 않는다. 공개 자산이 바뀌면 수락 digest도 다시 확인한다.

```sh
# 아래 공개 주소와 절대 경로는 준비 완료 후 확정된 값으로만 교체한다.
./tools/node tools/bootcamp/normal-host.mjs configure --name normal-demo-20261022 --participant PARTICIPANT_ADDRESS --operator OPERATOR_ADDRESS --web-root ABSOLUTE_FRONTEND_WEB_PATH
# 프론트 담당의 계약 구현/검사 확인 후 통합 담당이 수행한다.
./tools/node tools/bootcamp/normal-host.mjs configure --name normal-demo-20261022 --frontend-accepted
./tools/node tools/bootcamp/normal-host.mjs check --name normal-demo-20261022
```

`GET /__dev/config`: `clear-bootcamp-frontend-host.1`의 추가 필드 `phase`, `network`를 읽는다. 준비 단계는 `PREPARED_NOT_ACTIVATED`, `chainId/network/applicationId=null`, 관련 수집·서명·동의·receipt 기능 false이고 `/auth/*`, `/bootcamp/*`는 HTTP503 `NORMAL_HOST_NOT_ACTIVATED`다. 성공 화면이나 합성 데이터로 대체하지 않는다.

실제 활성화 후 `ACTIVE_LOCAL_TEST`와 생성된 `chainId`(number), `network`(EIP-3085 형식)를 제공한다. `network.chainId`는 hex, `rpcUrls`는 해당 컴퓨터의 새 loopback HTTP RPC, nativeCurrency는 가스용 Local test Ether/ETH/18이다. 지급 토큰은 별도 TEST/6이며 100 TEST=100000000 atoms다. 사전에 chain/RPC 값을 만들거나 C1 431701을 복사하지 않는다. 공개 설정에는 role 주소·키·토큰·원문을 넣지 않는다.

브라우저 모듈은 두 단계 모두 `/bootcamp-normal-client.mjs`에 제공된다. normal-client를 위해 정적 트리 밖 backend 소스를 복사할 필요가 없다. PR60 확인 F0에는 지갑 adapter가 없으므로 최신 frontend의 유무를 확인해야 한다. `src/application/wallet-client.mjs`는 참고 구현이며 서버 제공 module이 아니고 bare ethers import가 있어 정적 페이지에서 그대로 import할 수 없다. frontend 담당이 현재 adapter를 재사용하거나 기존 정적 방식에 맞춰 최소 EIP1193 인증 adapter를 구현한다. 서버·수집기를 web으로 복사하지 않는다.

```js
import {createNormalBootcampClient} from '/bootcamp-normal-client.mjs';
const api = createNormalBootcampClient({request: (path, options) => walletClient.request(path, options)});
// 기존 SIWE 로그인 후
const bootstrap = await api.session();
// clear-bootcamp-normal-session.1, role PARTICIPANT|OPERATOR,
// applicationId null 또는 이 실행에 결합된 단일 신청, policyHash/runtimeMappingHash,
// phase, procedureReady, sourceMode REGISTERED_TEST_SOURCE, receiptRequired true
```

`GET /bootcamp/v4/session`은 기존 HTTPS 인증·지갑·역할 경계 안에서만 읽는다. query/body로 앱이나 역할을 지정하지 않는다. 참여자가 기존 `POST /bootcamp/v1/applications` 빈 본문/사용자별 멱등 키로 생성한 응답의 `record.applicationId`를 사용해 `bindSourceSession(app)`를 1회 호출한다. 결합 전 bootstrap.app=null이고, 결합 뒤 두 역할은 같은 bootstrap.app를 읽는다. 운영자는 별도 신청을 만들지 않는다. host 공개 config의 app=null은 세션 bootstrap을 대체하지 않는다.

Bootcamp 오류 본문은 `{error:CODE}`이며 기존 `src/application/api-client.mjs`는 `{code:CODE}`/자체 allowlist를 기대한다. 이를 그대로 사용하면 BC 오류가 `API_REQUEST_FAILED`로 소실된다. frontend transport는 같은 출처·쿠키·CSRF·redirect 거부·취소·시간제한을 유지하면서 Bootcamp의 제한된 오류 코드를 보존해야 한다. 참고 walletClient의 wallet 이벤트 invalidate는 메모리만 지우므로 서버 logout/revoke와 진행 요청 정리도 frontend에서 연결하고 실제 transport 검사를 수행한다.

`procedureReady=false` 또는 `BC_NORMAL_PROCEDURE_NOT_READY`일 때 기존 v2 operations로 네 조건을 표시한다. 준비 뒤 기존 view/consent/paymentReceipt를 연결한다. 오류 HTTP401/403은 인증/권한, HTTP409는 만료·충돌·오래된 target 등 응답 error를 유지한다. 자동 POST 재시도·자동 서명·자동 동의는 없다. 상세한 원천 서명·양측 같은 판정 동의·미측정 null·INCLUDED/finalized=false 의미는 [C3 계약](BOOTCAMP_C3_FRONTEND.ko.md)과 [조회 갱신](BOOTCAMP_C3_REFRESH.ko.md)을 따른다.

## 준비가 모두 끝난 뒤 한 번 실행하는 순서

1. 프론트 구현/관련 검사, 공개 두 주소, 두 브라우저 쿠키 저장소, CA trust 준비를 본부가 한 번에 안내한다. 기존 HR 비밀번호 설정·로그인 완료 사실은 사용자 확인으로 보존한다. 다시 비밀번호 설정이나 Google 경로 조사를 요청하지 않는다.
2. 준비 listener를 닫고, clean commit·당일 공개 가격 기록·미사용 AI journal·공개 자산 수락·서비스 상태가 모두 통과해야 한다. 그 전 `run --activate`는 차단된다.
3. 통합 담당이 아래 명령을 실행하면 실제 lockf/ulimit/전용 세션 안에서 새 trust·HMAC·관리 Chrome을 연다. 사용자가 직접 로그인한 뒤 그 터미널에서 `READY`를 입력한다. 아직 이 단계는 실행하지 않았다.
4. 같은 managed `useSource` callback 안에서만 새 TEST realm/host를 만든다. `NORMAL_HOST_ACTIVE`와 `/__dev/config`가 실제 network를 제공한다. 두 역할은 그 network를 확인해 SIWE 로그인한다. 참여자는 신청 생성·source bind·서버 메시지 확인 후 명시 서명하고, 운영자는 같은 신청을 읽는다.
5. Moodle/HR 수집 뒤 회고 exact packet prepare 시점에 `AWAITING_EXACT_AI_APPROVAL`을 알린다. 전용 `approval-request.json`의 원문 없는 packet/코드/day/가격/범위를 근거로 **그때 새 직접 사용자 승인**을 받는다. `approval-template.json`은 PENDING이며 실행 승인이 아니다. 승인 기록을 반영한 전용 0600 `approval.json` 외 과거 승인을 복사하지 않는다. 240초 source 유효기간은 늘리지 않으며 만료·코드 변경이면 중단한다.
6. 같은 request/packet/lease만 resume한다. AI1회 후 네 조건 현재 MET와 같은 판정에 두 역할이 각각 명시 동의해야 기존 pay가 진행된다. 정확한 100 TEST 수령 결과를 두 화면에서 조회한 뒤 터미널 `FINISH`로 종료한다. 중단·오류 시 새로운 실행을 자동 시작하지 않는다. run.used/journal/실패 기록을 지우지 않는다.

```sh
# 모든 준비·본부 일정 확정 뒤 통합 담당만 실행
./tools/node tools/bootcamp/normal-host.mjs run --name normal-demo-20261022 --activate
```

[공식 가격](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)은 2026-10-22 Standard 입력 $0.30/100만 token, 출력(thinking 포함) $2.50/100만 token으로 확인했다. 조건부 3000입력+1024출력 시나리오는 $0.00346이다. 공급자 하드 금액 제한이나 청구 검증을 뜻하지 않는다. 출력 1024, 원문 UTF8 2048 bytes, 전체 본문8192 bytes, generate1/count0/재시도0/continuation0/fallback0을 유지한다. 기존 cost acknowledgment에는 전송 중 USD0.05 초과 가능성을 명시한다. 키 존재 확인은 키 유효성/청구 계정/무료 여부 확인이 아니다.

## 검증 한계

새 host/HTTPS/네트워크 bootstrap/인증 session/순서·취소/승인 거부 관련 offline23개 통과. 첫 임시 경로 검사에서 macOS `/var` 별칭을 실제 경로로 정규화하지 않은 test fixture가 실패했고 fixture 수정 후 통과했다. 별도 실제 준비 HTTPS CA검증, registry1회, 로컬 서비스 상태는 확인했다. 최신 managed HR `.3`의 실제 로그인·hosted transcript/proof 성공, 실제 프론트 두 역할·exact AI 새 승인·호출·지급 E2E는 아직 미확인이다. 새 앱/realm/원천lease/Chrome/유료호출/거래는 모두0이다. v10 인수는 소스 변경의 정확한 보존이며 실제 시연 수락이 아니다.


## v22: 실제 재시험 전 비용 승인 지갑 사전 지정

다음 절차는 별도 실제 재시험 지시 후에만 수행한다. 지시 전에는 prepare/configure/run을 실행하지 않는다. 기본 설정은 `aiApprovalWallet=null`이며 `AI_COST_APPROVER_DESIGNATION_REQUIRED`로 활성화를 막는다. 기존 native 비용·외부전송 승인자가 이번 호스트와 최종 깨끗한 코드 HEAD에서 사용할 참여자 또는 운영자 지갑을 직접 지정해야 한다. 역할만으로 지정하지 않는다.

직접 지정의 근거를 확인한 소유자가 0600 private 파일을 작성한다. 형식은 다음과 같다. 아래 대문자는 명세 자리표시자이며 실제 지정 증거 없이 값을 만들거나 승인으로 간주하지 않는다.

```json
{
  "version": "clear-normal-ai-approval-authority.1",
  "kind": "DIRECT_HUMAN_NATIVE_COST_APPROVER_WALLET_DESIGNATION",
  "hostName": "NEW_HOST_NAME",
  "origin": "https://127.0.0.1:9445",
  "wallet": "EXPLICITLY_DESIGNATED_LOWERCASE_ROLE_WALLET",
  "codeHead": "CLEAN_FINAL_HEAD_40_HEX",
  "scope": "EXACT_GEMINI_ONE_ON_THIS_HOST_NOT_PAYMENT",
  "authorization": {
    "kind": "DIRECT_HUMAN_NATIVE_COST_APPROVER_WALLET_DESIGNATION",
    "evidenceSha256": "SHA256_OF_DIRECT_NATIVE_APPROVER_DESIGNATION_EVIDENCE"
  }
}
```

`configure --name NAME --ai-approval-authority ABSOLUTE_PRIVATE_FILE`은 지정 파일을 검증·고정하고, 현재 HEAD·호스트·origin·역할 지갑과 일치해야 한다. 기존 파일과 다른 지정으로 덮어쓰지 않는다. 코드·지갑·호스트를 바꿨다면 새 준비·지정이 필요하다. 자산 digest 수락 및 당일 공식 가격 검토도 원천 취득 전에 끝낸다. 실제 승인 지갑 지정은 본부가 기존 native 승인자의 직접 지시를 받은 후에만 기록한다.

각 화면에 Gemini 3.5 Flash-Lite, 성찰 2048 UTF-8 bytes·요청 8192 bytes·출력 1024 tokens·MINIMAL, generate 1/count 0/재시도·후속·fallback 0, 시나리오 $0.00346·hard cash cap 미검증·진행 중 비용 $0.05 초과 가능성을 먼저 알린다. exact 입력 hash가 준비되면 지정 지갑의 사람이 직접 체크하고 승인한다. 다른 지급 동의를 포함하지 않는다. 양측 지급 동의는 E3 준비 후 같은 최신 판정에서 각각 직접 클릭한다.

두 화면의 최근 읽기와 185/155/150/30초 운영 예산은 [v22 분석](BOOTCAMP_R13_REVIEW_WINDOW_REVIEW.ko.md)을 따른다. 실패·지연·만료 시 해당 run을 중단하고 원인을 보고한다. 같은 run에서 proof 재수집·packet 재발급·승인 재사용·유료 재시도·TTL 연장을 하지 않는다. r5–r13을 복구하거나 재개하지 않는다.
