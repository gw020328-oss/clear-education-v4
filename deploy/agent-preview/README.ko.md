# 외부 에이전트 미리보기 배포 후보

기준 PR153 `fed992a86367936f713774355af2921e94fe0a29`. D 소유는 이 디렉터리뿐이다.
Node 24.21.0, 기존 Gemini 3.5 Flash-Lite 전송기·응답 검사·계획 검사 재사용.
로컬 지급 호스트, Privy, 체인/RPC, Attestor, 신청 DB에는 연결하지 않는다.

기존 v0 서버의 실제 관측 어댑터는 **미인수**다. `execute`는 `503 OBSERVATION_ADAPTER_NOT_ACCEPTED`로 차단한다.
B/C의 승인된 학생·강좌·대상 binding 경로를 연결하기 전에는 REST 토큰으로 직접 학생 기록을 조회하지 않는다.
테스트 어댑터는 `OFFLINE_TEST_ADAPTER`, 기존 계획 문법은 `PUBLIC_SYNTHETIC` 그대로 표시한다.
이 상태의 서버/터널 성공은 Moodle 실조회·외부 compute·최종 지급 성공이 아니다.

## 기존 v0 API 계약

모든 경로는 POST, 정확한 `Content-Type: application/json`, 본문 UTF-8 16 KiB 이하이다.
추가/중복 JSON 필드, 압축 본문, 브라우저 Origin/Cookie/Sec-Fetch-Site, 다른 Host를 거부한다.
루트·건강 확인·관리·RPC·정적 파일 경로는 공개하지 않는다. 쿠키와 CORS 허용 헤더를 발급하지 않는다.

공통 본문은 `institutionId`, `courseId`, `operatorId`, `sourceText`다. ID는 문자열이다.
기관·강좌·운영자 ID는 서버 설정에 고정한다. 이는 서비스 호출 범위일 뿐 학생 기록 권한이 아니다.
Moodle PHP가 현재 로그인·configure 권한·강좌 문맥·sesskey를 확인한 뒤 서버 간 요청을 보낸다.
브라우저에는 HMAC 키를 전달하지 않는다.

| 경로 | 추가 본문 | 응답/역할 |
| --- | --- | --- |
| `/v1/preview/prepare` | 없음 | bodyHash, bindingHash, model, limits. 모델 호출 없음 |
| `/v1/preview/generate` | approvalRef | 사전 승인 단회 소비 → draftId, draft, expiresAt. 원문 위치/도구/미결 질문 표시 |
| `/v1/preview/execute` | draftId, proposalHash | 운영자 검토 지문·현재 원문·15분 유효성 확인. 실제 조회 연결 인수 전 503 |

각 요청에 새 `X-Clear-Nonce`(소문자 hex 32자), `X-Clear-Timestamp`(Unix seconds),
`X-Clear-Signature`(hex 64자)를 전송한다. HMAC SHA-256의 key는 32바이트 난수의 **64자 hex 문자열 자체**다.
서명 입력은 다음 문자열이다(마지막 개행 없음).

```text
timestamp + "\n" + nonce + "\nPOST\n" + path + "\n" + sha256(rawBody)
```

Host는 `publicOrigin`과 정확히 일치해야 한다. TLS 프록시는 원래 Host를 보존한다.
timestamp ±60초, SQLite nonce 125초 보존, 인증 후 원자 INSERT로 재사용을 거부한다.
승인은 model bodyHash와 origin/기관/강좌/운영자/dataMode의 bindingHash에 결합된다.
URL 변경 시 새 승인이 필요하다. X-Forwarded-*를 신뢰하거나 identity로 해석하지 않는다.

## 입력별 Gemini 승인

`prepare`는 비용이나 전송을 승인하지 않는다. 기존 직접 사용자 승인 후 로컬 CLI로만 등록한다.
호출 직전 SQLite UPDATE가 승인 1건을 원자 소비한다. 그 뒤 countTokens 최대1회,
generateContent 최대1회, 입력4096/출력2048 tokens, 자동 재시도0회, 총45초다.
실패/timeout/응답 유실도 소비 상태를 유지한다. 승인 유효시간은 최대1시간이다.
SQLite write/commit lock 획득 뒤 fresh clock으로 승인 만료를 검사하고, durable commit 뒤에도 재확인한다.
countTokens와 generateContent **각 호출 시작 시점** 모두 같은 승인 만료 이전이어야 한다.
countTokens가 늦게 끝나 만료되면 generateContent를 보내지 않고 소비 상태를 유지한다.
만료 전에 시작한 모델 응답의 수신 완료까지 승인 시간을 연장하거나 새 호출 권한으로 해석하지 않는다.
조건 원문 sourceText와 검증된 AST에서 파생한 rows를 최대15분 사용한다.
idle 상태에서도 만료 타이머가 저장된 원문/rows 참조를 제거하며 close도 타이머와 참조를 정리한다.
이벤트 루프가 정지/지연되면 타이머 콜백도 지연될 수 있지만 조회 시 별도 expiry 검사로 사용은 거부한다.
JS GC/메모리 물리 zeroization 또는 프로세스 외부 사본의 삭제를 보장하지 않는다.
provider 원문 응답은 파일/로그에 보관하지 않는다.
서버 재시작 시 draft가 없어지며 이미 소비한 승인은 복구되지 않는다. 이는 재호출 권한이 아니다.

공개 시연 입력: `Moodle에서 첫 학습 활동을 마쳐야 한다`.
전송 데이터: 이 조건 문장, 위치, 고정 capability/회고 항목 목록, 프롬프트와 JSON 스키마.
학생 원문/개인정보/지갑/지급 키는 전송 데이터에 포함하지 않는다.
2026-11-04 공식 Standard 단가 입력 $0.30/1M, 출력 $2.50/1M 기준 생성 최대 **$0.0063488**.
실제 사용량은 공급자 영수증과 별도 확인한다.
[Gemini 가격](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite).

```sh
CLEAR_PREVIEW_CONFIG=/absolute/private/profile.json ./tools/node deploy/agent-preview/approval.mjs prepare /absolute/private/source.txt
```

직접 승인 이후 `CLEAR_APPROVED_BODY_HASH`, `CLEAR_APPROVED_BINDING_HASH`에 출력된 정확 지문을 설정하고
같은 CLI의 `record-approved-input /absolute/private/source.txt unique-approval-reference`를 실행한다.
CLI는 승인의 존재를 자동 판단하지 못하므로 사용자 승인 근거를 운영 기록에 별도 남긴다.

## 실행과 비밀

`profile.example.json`을 저장소 밖 또는 ignored private 디렉터리에 복사해 실제 origin/ID/절대 경로를 설정한다.
HMAC 파일은 0600 권한의 hex64 키 한 개다. 환경 이름:

| 이름 | 용도 |
| --- | --- |
| CLEAR_PREVIEW_CONFIG | 프로필 JSON의 절대 경로 |
| CLEAR_PREVIEW_BUILD_MANIFEST | 로컬 repo 검증 시 staging build-manifest.json 경로; 컨테이너는 /app/build-manifest.json 기본값 |
| GEMINI_API_KEY | 기존 서버측 Gemini 자격증명. 값 출력·이미지 포함 금지 |
| CLEAR_APPROVED_BODY_HASH / CLEAR_APPROVED_BINDING_HASH | 승인 등록 CLI 전용 지문 |
| CLEAR_PREVIEW_BUILD_CONTEXT | allowlist 패키지 빌드 디렉터리 |
| CLEAR_PREVIEW_CONFIG_DIR | 컨테이너 read-only secret 디렉터리 |
| CLEAR_PREVIEW_STATE_DIR | 단회 승인/nonce DB의 별도 지속 볼륨 |

```sh
CLEAR_PREVIEW_CONFIG=/absolute/private/profile.json ./tools/node deploy/agent-preview/server.mjs
```

중지는 해당 프로세스 SIGTERM. 재시작은 같은 프로필과 같은 승인 DB로 위 명령을 다시 실행한다.
프로세스 로그는 LISTENING 포트/차단 범위 또는 고정 오류 코드뿐이다. HTTP body/헤더/키를 로깅하지 않는다.
Node listener는 127.0.0.1에만 bind한다. 프록시는 TLS 종료 및 요청 크기/속도 제한을 설정한다.
개발 RPC나 기존 normal-host를 tunnel origin으로 지정하지 않는다.

## 컨테이너 배포 준비

커밋된 source allowlist만 `package.mjs`로 빈 디렉터리에 구성한다.
기존 private/data/var/.env/키/로컬 toolchain/node_modules는 build context에 포함하지 않는다.

```sh
./tools/node deploy/agent-preview/package.mjs /absolute/empty-preview-build
docker compose -f deploy/agent-preview/compose.yaml build
docker compose -f deploy/agent-preview/compose.yaml up -d
docker compose -f deploy/agent-preview/compose.yaml stop
docker compose -f deploy/agent-preview/compose.yaml restart
```

compose는 **Linux host networking + 같은 호스트의 TLS 프록시**용이다. Mac Docker의 host networking 지원을 가정하지 않는다.
컨테이너 node UID1000이 private config와 0700 state 디렉터리를 읽고 쓸 수 있게 배포자가 소유권을 준비한다.
프로필 secret 경로는 `/run/secrets/clear-preview-hmac`, DB는 `/var/lib/clear-preview/approvals.sqlite`를 사용한다.
영속 DB를 삭제/복원해 승인 단회 사용을 되돌리지 않는다. 새 운영 환경은 새로운 키·origin·DB로 분리한다.

## 터널과 인수 경계

임시 연결 시험은 인증 경계 리뷰 후 `cloudflared tunnel --url http://127.0.0.1:18991`로 수행한다.
발급받은 HTTPS origin으로 프로필을 설정하고 서버를 시작한다. origin 확정 전에는 승인 등록하지 않는다.
Cloudflare 계정/도메인 없이 가능하지만 주소 변경과 가용성 보장이 없는 개발용이다.
[Quick Tunnels 공식 설명](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
이 방식은 Mac에서 compute를 실행하며 **외부 서버 배포 완료가 아니다**.
지속 외부 배포는 사용자가 제공하는 VM/컨테이너 서비스 권한, 고정 HTTPS origin, 지속 볼륨이 필요하다.

검증은 인증 없는 요청, 다른 Host/Origin/사용자/강좌, 오래된 timestamp/nonce 재사용, 승인 재사용/본문 변경,
provider 실패 후 재시도 차단, plan 검토 지문 변경, 미연결 관측 차단을 포함한다.
원격 Moodle/브라우저/실제 Gemini/지급 성공은 각각 별도 증거로 기록한다.
Privy origin/redirect, 쿠키·CSRF, 학생 진입, TEST RPC는 현재 서버에 없는 후속 전체 흐름 인수 항목이다.

## 배포 변경·복구 경계

프로필 artifactHash는 `package.mjs`가 생성한 build-manifest.json 파일의 SHA-256이다.
시작/승인 CLI는 manifest hash와 열거된 source bytes를 실제 파일과 대조한다.
배포 epoch는 배포 관리자가 새로 생성한 UUIDv4이며 비밀이 아니다.
approval binding은 artifactHash/deploymentEpoch/model/countTokens+generateContent/limits/가격 검토 버전까지 포함한다.
코드·모델·호출상한·배포 epoch 변경 후 기존 승인은 재사용할 수 없다.

외부 rollback floor나 시스템 clock rollback 탐지는 구현하지 않았다. 정상 전진 wall clock과 신뢰한 DB가 전제다.
동일 DB snapshot과 동일 키·epoch를 함께 되돌리면 소진/nonce 복구 재사용을 자동 검출하지 못한다.
DB 복구·삭제·손상·시계 역행이 의심되면 **즉시 서버/외부 라우트를 중지**한다.
시각 동기화와 원인을 확인하고, DB 복구 전에 HMAC key 및 deploymentEpoch를 새로 발급해 양쪽 peer에 적용한다.
새 epoch에서 이전 approvals는 binding 불일치로 차단되고 새 키는 과거 서명 요청을 차단한다.
재개 후 직접 사용자 승인도 새로 받는다. 이전 epoch/key로 먼저 띄운 뒤 회전하는 순서는 금지한다.
이 절차가 적용되지 않은 snapshot restore에 대한 자동 fail-closed 보장은 없다.

B/C actual 응답 계약은 아직 인수하지 않았다. 관측 body 후보는 정확 `{targetRef,status,observedAt}`,
status는 COMPLETE/INCOMPLETE/UNKNOWN/INACCESSIBLE, observedAt은 Unix seconds다.
오프라인30초 검사는 actual 신선도 계약을 대신하지 않는다. B가 소유한 인증 envelope의
context/request/source/proposal/audience/epoch/bodyHash/expiry 검증을 인수하기 전 actual503을 유지한다.
최초 actual 접근은 학생 본인의 B auth/ACK 신청/현재 binding 경로이며 운영자 configure/HMAC은 위임 권한이 아니다.

## PR154 독립 검토 보정

- 패키지 전체 파일 목록(463개)의 정렬 경로 지문을 trusted verifier에 고정했다. manifest가 파일 일부를 생략하거나 실행 경로에 추가 파일/심볼릭 링크가 있으면 시작을 거부한다. 패키지 파일을 추가·삭제할 때 경로 집합 지문도 별도 검토하여 갱신한다.
- `server.mjs`, `railway.mjs`, `approval.mjs`는 Node 내장 모듈과 순수 `artifact.mjs`만 먼저 평가한다. source 검증 뒤에 config/service/HTTP를 동적 import한다. Railway는 검증 및 고정 state 디렉터리 준비 후 UID/GID1000·보조 그룹 제거를 완료하고 앱을 평가한다. 설정 생성 함수는 `railway-config.mjs`로 분리했다.
- 검증기와 bootstrap 자체는 immutable 이미지의 신뢰 기반이다. source manifest는 외부 npm dependency bytes나 Node/base image를 인증하지 않는다. 변경 가능한 bootstrap/동시 파일 교체를 방어하는 sandbox라는 주장은 하지 않는다.
- 각 generate/execute는 45초 상한, 승인/초안 만료, HTTP 연결 종료, service close에 연결된 AbortSignal을 갖는다. dispatch 직전과 await 직후 closed/expiry를 확인한다. SIGTERM은 HTTP drain을 기다리기 전에 작업을 취소한다. 취소된 승인도 계속 소진 상태다.
- 초안 TTL은 진행 중 observe도 취소한다. 응답하지 않는 adapter도 서비스 대기를 즉시 끝내고 늦은 응답은 버린다. 이는 서비스가 가진 참조 정리이며 비협조적 외부 adapter의 자체 메모리나 물리적 zeroization을 보장하지 않는다.
- 실제 관측 adapter는 계속 미수락(503)이다. 외부 배포·실제 Moodle·유료 모델 호출은 이 보정 검사에 포함되지 않는다.


## 독립 peer 런타임 후보 (미배포·검토 대기)

`peer-main.mjs`는 별도 시작점이다. 기본 Docker CMD 및 v0 서버는 자동 전환하지 않는다.
B codec/contract를 `vendor/b-peer/SOURCE.json`의 exact 커밋 바이트로 포함한다.
`CLEAR_PEER_RELEASE`와 `CLEAR_PEER_REGISTRATION`은 UID1000 소유의 실제 0600 JSON 파일이다.
release는 ACTUAL_GEMINI 모드, 공개 origin·epoch·source artifact·서명 pin·관측 대상·receipt 버전을 고정한다.
registration은 신뢰된 운영 경로에서 받은 단일 B context/scopeHash/approvalRef를 사전 고정한다.
현재 구현은 등록당 최대120초의 단일 context 수명이며 다중 사용자 상시 서비스는 아니다.

서명 prepare 본문은 version/context/release/toolBinding/modelCapability/observationCapability/dataMode만 허용한다.
release는 B의 같은 owner 배포 snapshot에서 생성한 deploymentEpoch/artifactHash/model/limitsHash 4개 필드다.
D 고정 배포 값, signed meta epoch, context model과 exact 일치해야 한다. 브라우저 값으로 구성하지 않는다.
prepare는 context를 활성화하지만 유료 호출 승인을 만들지 않는다. generate 전에 별도로 승인된
releaseHash/bodyHash/approvalBindingHash를 `CLEAR_APPROVED_RELEASE_HASH`, `CLEAR_APPROVED_BODY_HASH`,
`CLEAR_APPROVED_BINDING_HASH`로 전달해 `peer-register.mjs`에서 단회 원장을 등록한다.
운영자는 직접 사용자 승인 근거를 확인해야 하며 환경 변수 일치만으로 승인 사실을 추론하지 않는다.

B 서명 generate → draft → execute 검토 영수증 → observation-result 순서를 강제한다.
D는 B가 검증한 `core-page-manual-mark`의 관측 triple만 받고 직접 Moodle 조회·자격 판정·지급은 하지 않는다.
모든 반환의 paymentAllowed는 false다. 실제 전송기/AST 검증을 통과한 응답만 ACTUAL_GEMINI_HTTP로 표시한다.
로컬 시험은 OFFLINE_TEST 전송기와 별도 test receipt를 사용하며 실제 호출 성공으로 표시하지 않는다.

승인 DB와 peer-replay.sqlite는 동일 private 지속 디렉터리의 별도 파일이다.
같은 context의 중복 prepare와 재시작 후 재등록을 거부하며 close/만료/요청 취소 시 진행 중 호출을 취소한다.
전체 source manifest 검증은 애플리케이션 import보다 먼저 수행한다.
서버는 loopback에만 bind하므로 같은 Linux 호스트의 TLS 프록시가 필요하다.
AWS·Railway 비교는 [배포 후보 비교](RAILWAY.ko.md)를 따른다.
실제 Gemini, B/C 통합 HTTPS, 원격 재시작 및 배포 성공은 아직 검증하지 않았다.
