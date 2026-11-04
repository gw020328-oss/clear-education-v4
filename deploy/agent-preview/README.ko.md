# 외부 에이전트 미리보기 배포 후보

기준 PR153 `fed992a86367936f713774355af2921e94fe0a29`. D 소유는 이 디렉터리뿐이다.
Node 24.21.0, 기존 Gemini 3.5 Flash-Lite 전송기·응답 검사·계획 검사 재사용.
로컬 지급 호스트, Privy, 체인/RPC, Attestor, 신청 DB에는 연결하지 않는다.

현재 실제 관측 어댑터는 **미인수**다. `execute`는 `503 OBSERVATION_ADAPTER_NOT_ACCEPTED`로 차단한다.
B/C의 승인된 학생·강좌·대상 binding 경로를 연결하기 전에는 REST 토큰으로 직접 학생 기록을 조회하지 않는다.
테스트 어댑터는 `OFFLINE_TEST_ADAPTER`, 기존 계획 문법은 `PUBLIC_SYNTHETIC` 그대로 표시한다.
이 상태의 서버/터널 성공은 Moodle 실조회·외부 compute·최종 지급 성공이 아니다.

## API 계약

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
검증된 AST만 메모리에 15분 보관하며 provider 원문 응답은 파일/로그에 보관하지 않는다.
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
