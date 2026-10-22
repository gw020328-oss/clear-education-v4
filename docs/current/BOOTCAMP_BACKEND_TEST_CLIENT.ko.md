# 제품 프론트와 독립된 backend 통합 시험 클라이언트

2026-10-23. 사용자 요청에 따라 제품 프론트를 기다리지 않고 기존 정상 backend 한 건을 시험할 준비를 한다. `tools/bootcamp/test-client/`의 정적 시험 페이지는 제품 `web/`·PR60과 별개이며, 제품 프론트 완료나 실제 통합 시험 성공을 뜻하지 않는다. 기존 API/호스트/원천/금고/지급·서명 규칙은 바꾸지 않는다. 팀원 프론트에 추가 계약 수정은 없다.

## 2026-10-23 r2 원천 서명 전 실패 진단과 수정 후보

실제 r2 실행은 두 역할 SIWE와 신청 결합 뒤 `SOURCE_python-basic-certificate`에서 `COLLECTION_FAILED`로 종료됐다. 보존 DB를 읽기 전용으로 집계한 결과 ACTIVE 신청 1건/revision 1, create 명령 1건, 원천 요청·증거·이벤트 0건이었다. 사용자 원천 서명, AI 승인 요청/호출, TEST 지급에 도달하지 않았다. 일회성 실행 표시와 기존 journal/report를 보존했고 관리형 세션 디렉터리 0건을 확인했다. 아래 준비/실행 예시의 과거 호스트 이름으로 재실행하지 않는다.

실제 하위 예외 원문은 남아 있지 않다. 같은 인증 서비스·SQLite store·원천 소비자·UI 서명 broker를 사용한 합성 재현에서 첫 실패 경로를 확인했다. `issueBridgeRequest`의 DB 트랜잭션 안에서 원천 lease resolver가 `ui.participant()`를 호출하고, 이것이 `store.getApplication()`으로 동일 DB 트랜잭션을 다시 열었다. 내부 `ERR_SQLITE_ERROR`가 lease 불가로 바뀌어 `BC_SOURCE_UNKNOWN`, 최외곽에서는 `COLLECTION_FAILED`로 표시된다. 재현 역시 request 0건/revision 1에서 멈춘다.

이 중첩 조회를 제거한 뒤에는 인증 서비스가 반환하는 체크섬 주소와 준비 설정의 소문자 주소를 그대로 비교하는 두 번째 결함을 재현했다. 수정 후보는 `live-context.mjs`의 resolver를 검증 가능한 함수로 분리하고, 동일 store 재진입을 제거하며 인증된 주소를 소문자로 정규화한다. 인증 서비스의 현재 세션/CSRF·역할 검사, 신청/참여자/지갑/mapping 결합, store의 현재 신청/요청 검사와 UI의 서명 전 결합 검사는 유지한다. HR 900초 원천 창, Moodle/AI 240초 원천 창 및 기존 수집 제한을 변경하지 않는다.

외부 네트워크 차단 상태에서 신규 `normal-source-session.test.mjs` 6건과 관련 UI/HR consumer/context 검사 15건, 합계 **21/21 PASS**. 수정 전 동일 pending 경로는 `BC_SOURCE_UNKNOWN`으로 실패했고, 수정 후 요청 발급→원천 승인 메시지 대기에 도달했다. 명시적 fixture 서명 전에는 진행하지 않으며, 로그아웃·신청 취소·다른 역할/결합·만료·재사용 차단과 증거 0건을 확인했다. 합성 fixture 서명 이후도 proof를 만들기 전에 의도적으로 멈춘다. 실제 Chrome/원천/모델/체인 재실행은 없다.

이 후보는 v10에 고정된 `tools/bootcamp/live-context.mjs`를 변경한다. 아래의 core159 불변 및 기존 CI 성공 설명은 수정 전 시험 클라이언트 후보의 이력이다. 기존 intake/자산 manifest/guard 지문을 덮어쓰거나 새 후보의 통과로 재사용하지 않는다. 새 후보의 지문·검증·실제 실행 준비는 별도 후속이며, 이번 범위는 최소 수정과 해당 회귀검사까지다.

## 무엇을 준비했는가

빌드나 새 패키지 설치 없이 이 폴더의 index.html/main.js/driver.js/session.js/style.css만 같은 HTTPS에 제공한다. 페이지는 기존 `/bootcamp-normal-client.mjs`의 createNormalBootcampClient를 소비한다. 인증은 이 한 시험에 필요한 EIP1193 메시지 서명과 기존 nonce→verify·HttpOnly 쿠키·CSRF만 연결한다. 개인키·쿠키 토큰·CSRF·서명은 화면/로그/저장소에 보관하지 않는다. 지갑과 서버 세션 상태는 메모리에만 두고, 계정/체인 변경·disconnect/종료 때 이전 세션 헤더로 서버 logout을 시도하고 페이지를 끝낸다. 폐기 결과가 불명확하면 새 로그인으로 자동 복구하지 않는다.

같은 출처의 제한된 경로만 요청하며 redirect를 거부한다. 취소·시간제한·응답 크기 상한을 적용하고 Bootcamp `{error}`의 알려진 고정 코드를 보존한다. 사용자 클릭마다 하나의 작업만 수행한다. 원천 메시지는 읽기와 서명 버튼을 분리한다. 원래 메시지와 유효기간을 표시하고, 취소/지갑 변경/만료 뒤 늦은 서명을 POST하지 않는다. 같은 판정의 동의는 사용자가 본 target/revision/hash/ledger와 새 멱등 키로 보낸다. 응답 유실은 같은 본문/같은 키의 **명시적인 결과 확인**만 제공한다. 새로운 쓰기·서명·동의·키를 자동으로 반복하지 않는다.

receipt는 기존 클라이언트의 canonical/고정100 TEST 검사를 재사용한다. NOT_OBSERVED/READBACK_UNAVAILABLE 및 미측정 null을 성공/0으로 바꾸지 않는다. INCLUDED/finalized=false를 최종 확정이라고 표시하지 않는다. 새 receipt 읽기가 실패하면 이전 성공 표시를 지운다. 화면은 거래를 전송하거나 claim을 호출하지 않는다. 기존 backend가 같은 판정에 대한 두 역할의 명시 동의 뒤 정상 지급을 진행한다.

## 기존 gate를 통과하는 설정

통합 담당의 기존 API 작업본 루트에서 고정 Node24.21.0을 사용한다. 호스트 이름과 CA는 이미 준비한 것을 사용하며 새 realm·신청·원천 lease·관리 Chrome을 이 단계에서 만들지 않는다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/bootcamp-store/test-client.test.mjs
./tools/node tools/bootcamp/normal-host.mjs configure --name normal-demo-20261022 --web-root "$PWD/tools/bootcamp/test-client"
# 시험 자산과 계약 검사가 통과한 뒤 통합 담당이 기존 digest acceptance를 수행한다.
./tools/node tools/bootcamp/normal-host.mjs configure --name normal-demo-20261022 --frontend-accepted
./tools/node tools/bootcamp/normal-host.mjs check --name normal-demo-20261022
./tools/node tools/bootcamp/normal-host.mjs serve-prepared --name normal-demo-20261022
```

`frontendAccepted=true`는 **이 명시된 시험 자산의 계약/지문 수락**이다. 제품 프론트의 완료 승인이 아니다. 전용 `test-client-acceptance.json`에 이 범위를 기록한다. 공개 자산의 정확한 별도 지문은 BOOTCAMP_TEST_CLIENT_ASSETS_V2.json에 기록한다. 기존 v10 core159개/이전 intake·guard bytes는 그대로다. 새 브라우저 자산은 기존 web-root snapshot gate가 다루는 별도 입력이며 memory EVM 인수 범위를 넓히지 않는다.

준비 HTTPS의 `/__dev/config`는 PREPARED_NOT_ACTIVATED, network/chain/app=null이고 실제 API는503이다. 페이지를 준비 상태로만 제공해 검사할 수 있다. 이 단계에서 지갑 버튼은 차단된다. 준비 listener는 Ctrl-C로 닫고 모든 준비와 사용자 일정이 맞은 뒤에만 `run --activate`를 실행한다.

## 본부가 사용자에게 한 번에 요청할 준비

- 서로 다른 **외부 테스트 지갑 공개 주소 두 개**: 참여자용, 운영자용. 개인키/시드/API 키를 제출하지 않는다. 서로 다른 브라우저 프로필에 각 지갑 확장을 준비하고 잠금을 해제한다.
- 두 프로필에서 같은 `https://127.0.0.1:9445`에 접속한다. 브라우저가 신뢰하도록 이 호스트의 공개 `ca.pem`만 사용자 검토 후 설치한다. 이 컴퓨터 경로는 `workspaces/clear-bootcamp-api-store/var/bootcamp-normal-host/normal-demo-20261022/ca.pem`이다. ca.key/server.key를 가져오거나 TLS 검증을 끄지 않는다.
- chainId/RPC는 아직 없다. 실제 run의 새 realm 생성 후 페이지와 `/__dev/config`가 제공한다. 페이지의 네트워크 추가 버튼을 누른 뒤 지갑에서 표시된 chainId의 로컬 TEST 네트워크를 선택한다. 기존 C1 431701/옛 RPC를 복사하지 않는다. native ETH18은 로컬 가스 단위, 지급 토큰은 TEST6이다. 이 시험의 사용자 동작은 메시지 서명과 HTTP 동의이므로 실제 ETH 입금·가스 구매·공개 체인 송금은 필요하지 않다.
- 관리 HR Chrome은 위 지갑 프로필과 별도다. 실제 실행 시 사용자 본인이 로그인하고 열어 둔다. 기존 비밀번호 설정/이전 로그인 완료 사실은 유지하며 재설정·Google 경로 확대를 요구하지 않는다.

공개 주소를 받은 뒤 통합 담당이 기존 configure의 participant/operator에 넣는다. 지금은 주소를 임의로 만들거나 서버 TEST키로 대체하지 않는다.

## 사용자와 통합 담당의 실행 순서

1. 통합 담당이 당일 가격/기존 Gemini env 존재·서비스·clean commit·시험 자산 digest·공개 두 주소·미사용 journal을 확인하고 준비 listener를 닫는다. `./tools/node tools/bootcamp/normal-host.mjs run --name normal-demo-20261022 --activate`를 실행한다.
2. 실제 lockf/관리 Chrome이 열리면 사용자가 HR에 로그인하고, 통합 담당 터미널에서 READY를 입력한다. 실제 run은 registry trust를 새로 읽는다. 과거 준비 조회는 증명/실행 승인이 아니다.
3. NORMAL_HOST_ACTIVE 뒤 두 지갑 프로필에서 페이지를 연다. 각각 호스트 상태 읽기→표시한 로컬 네트워크 추가/선택→지갑 연결·SIWE 로그인을 수행한다. 역할이 PARTICIPANT/OPERATOR인지 확인한다. **두 역할 모두 로그인한 뒤** 참여자가 다음 단계로 간다. 운영자는 신청을 만들지 않는다.
4. 참여자만 신청 만들기→원천 세션 결합을 누른다. 운영자는 세션·조건·최신 판정 읽기로 같은 applicationId를 확인한다. 결합 전 operator app=null은 정상이다.
5. 참여자가 원천 승인 메시지 읽기→용도/메시지/만료 확인→표시한 메시지 지갑 서명을 누른다. 아직 pending이 아니면 오류를 성공으로 대체하지 않고 다시 읽는다. 이 서명은 지급 동의가 아니다.
6. backend가 Moodle/HR을 읽고 회고 exact packet을 준비하면 본부가 **그 packet/코드/day/가격에 대한 새 직접 AI1회 승인**을 요청한다. 이 단계까지도 유료 호출 승인을 미리 만들지 않는다. 원문 없는 승인 요청만 확인하며 기존240초 lease를 늘리지 않는다.
7. 두 역할이 조건·최신 판정 읽기로 네 조건과 같은 대상/금액을 확인한다. 준비 전에는 v2 operations/검토 준비 중을 표시한다. 판정이 준비되면 참여자가 명시 동의하고, 운영자는 다시 최신 판정을 읽은 뒤 명시 동의한다. stale/만료/충돌은 새 조회와 사용자 재확인이 필요하다. 자동 동의는 없다.
8. 기존 backend의 동의 대기/검증/지급 뒤 두 화면에서 canonical receipt 읽기를 누른다. 약정/배정/제출/실제 수령 검증과 null, 수락 당시 대상과 현재 판정을 구별한다. 양측 조회를 마친 뒤 통합 담당 터미널에서 FINISH한다. 중단/오류일 때 run.used/journal/이전DB/실패기록을 지우고 다시 시작하지 않는다.

## 확인 범위

외부 네트워크를 차단한 synthetic 지갑·원천 fixture에서 실제 HTTPS auth/store와 이 페이지의 transport/controller를 함께 검증한다. 키/서명은 fixture에서만 생성하며 실제 지갑·원천·모델·realm을 사용하지 않는다. 실제 지갑 브라우저 버튼·CA 신뢰 설치·최신 managed HR .3 로그인/proof·AI 호출·전체100 TEST 지급은 사용자 시점에 수행할 항목으로 남는다. 제품 프론트 완주는 별도다.

v2는 초기 연결의 같은 계정/체인 중복 알림과 실제 변경을 구별하는 session.js 한 파일 delta다. v1 manifest 원본과 b83e482 소스 snapshot을 보존하며 새 manifest bytes도 검사의 고정 SHA로 잠근다. 기존 v10 core159개와 API 계약은 그대로다.
