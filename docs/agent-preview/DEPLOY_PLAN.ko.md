# 외부 AI 미리보기(D) 배포 계획 — 준비본

작성: 2026-11-06, 브랜치 `codex/external-preview-deploy-prep`(develop `c18c3f7` 기준).
D 원본: 로컬 D 서비스 `caa3291`(#154 head `bf5f41c` 위 5커밋)의 `deploy/agent-preview/**`.

이 문서는 **준비 기록**이다. 계정 가입, 공개 배포, 실제 Gemini 호출, 푸시·PR은 하지 않았다.
메인에 넘길 값은 [DEPLOY_CONTRACT](DEPLOY_CONTRACT.ko.md)에 있다. 같은 PC에서 D를 별도 프로세스로 띄우는 절차는 [DEPLOY_LOCAL](DEPLOY_LOCAL.ko.md)에, execute 결정안은 [DEPLOY_EXECUTE_DECISION](DEPLOY_EXECUTE_DECISION.ko.md)에 있다.

## 1. 결과 요약

| 항목 | 상태 |
|---|---|
| 외부 모델 호출 | **미실행**. 실제 Gemini 0회. 모든 시험은 오프라인 전송기 또는 네트워크 없는 컨테이너에서 했다 |
| 도구 실행 | **미연결**. execute는 `503 OBSERVATION_ADAPTER_NOT_ACCEPTED` 그대로다. B 중계도 `DISPLAY_ONLY`다 |
| 외부 배포 | **2026-11-06 실행(키 없는 1차 기동)**: AWS Lightsail 서울, `https://52-79-238-13.sslip.io`. Gemini 키·승인 없음. 기록은 [DEPLOY_LIGHTSAIL 11절](DEPLOY_LIGHTSAIL.ko.md) |
| 로컬 이미지 | `clear-agent-preview:deploy-prep-2a1f392` (linux/arm64, image id `4ce3e36926f1…`), `…-amd64` (linux/amd64, `bdb48cdae668…`, 에뮬레이션 빌드). 두 이미지 모두 안에서 artifactHash 검증을 통과했다. 지문은 [계약값 문서](DEPLOY_CONTRACT.ko.md) |
| 오프라인 시험 | D 단위 45/45(+변환기 1/1), B↔D 루프백 9/9, 컨테이너 무네트워크 점검 통과(9절) |

## 2. 연결 구조와 신뢰 경계

```
운영자 브라우저 (Moodle 강좌 화면, https://127.0.0.1:9477)
  └ 같은 출처 POST /bootcamp/preview/{prepare,generate,execute}
      쿠키 + x-wallet / x-chain-id / x-csrf-token   ← 브라우저에는 D 주소·HMAC 키가 없다
      └ A 실행본(로컬 Mac, 127.0.0.1:9477 Node)
          B createOperatorPreviewHandler → relay(DISPLAY_ONLY) → scope resolver → owner 승인 결합
          dPort = createOperatorDPort({request: createDPreviewRequest(...), execution: 'ACTUAL'})
          └ 나가는 HTTPS만: POST https://<D origin>/v1/preview/*  (HMAC 헤더 3개)
              └ D (외부 VM 또는 Railway, 단일 인스턴스)
                  └ 나가는 HTTPS: generativelanguage.googleapis.com (countTokens 1 + generateContent 1)
```

- 방향은 **CLEAR 서버 → D 단방향**이다. Mac에 들어오는 포트, 터널, 역방향 호출은 없다.
- 로컬 지급 키, 체인 RPC, 신청 DB, Moodle DB는 Mac의 loopback에 남는다. D 이미지·설정에는 이 값이 없고, D에서 이 값에 닿는 네트워크 경로도 없다.
- D가 보유하는 비밀은 두 가지다: 서버 간 HMAC 키, Gemini 키. 둘 다 지급 권한이 없다.
- D 응답은 B가 `paymentAllowed=false`, 버전, 지문을 다시 검사한다(`D_RESPONSE_INVALID`). 결과는 개설 전 초안 표시 전용이다. 학생 지급 정책(고정 네 조건·100 TEST)은 바뀌지 않는다.
- D가 탈취되면 Gemini 키와 HMAC 키가 노출된다. 그래도 지급·체인·Moodle에는 닿지 않는다. 이때는 두 키와 deploymentEpoch를 회전한다(6절).

## 3. 서버 인증(HMAC) 키

| 항목 | 내용 |
|---|---|
| 형식 | 32바이트 난수의 소문자 hex 64자 **문자열 자체**가 HMAC-SHA256 키다. D는 `^[a-f0-9]{64}$`만 받는다 |
| 서명 입력 | `timestamp\nnonce\nPOST\npath\nsha256(rawBody)`. B `dPreviewSignature`와 D `auth.signature`는 같은 식이다 |
| 생성 | 배포 시점에 한 번 `( umask 077; openssl rand -hex 32 > <비공개 경로>/clear-preview-hmac )`. 화면·채팅·로그에 출력하지 않는다 |
| D 보관 (VM) | `<config dir>/clear-preview-hmac`, 0600, UID 1000 소유. compose가 `/run/secrets`에 읽기 전용으로 붙인다. `readSecret`은 그룹·기타 권한 비트가 있으면 시작을 거부한다 |
| D 보관 (Railway) | 서비스 변수 `CLEAR_PREVIEW_HMAC_SECRET`. 사용자가 대시보드에 직접 넣는다. 이미지·볼륨에는 쓰지 않는다 |
| A 보관 | A 실행본의 비공개 디렉터리(예: gitignored `private/`) 0600 파일. 메인이 `createDPreviewRequest({publicOrigin, secret})`에만 넘긴다. 지급 서명 키와 다른 파일, 다른 값이다 |
| 전달 | Mac에서 만든 파일을 `scp`로 VM 비공개 디렉터리에 복사하거나, Railway 변수 입력란에 사용자가 붙여 넣는다. 채팅·PR·문서에는 쓰지 않는다 |
| 회전 | DB 복구, 키 노출 의심, origin 변경 시: 서버 중지 → 새 키·새 epoch → 양쪽 동시 적용 → 재시작 → 새 직접 승인. 옛 키로 먼저 띄운 뒤 회전하지 않는다 |

## 4. publicOrigin과 Host 고정

- `publicOrigin`은 `https:`이고 경로·사용자정보가 없는 정확한 origin이어야 한다(`CONFIG_PUBLIC_ORIGIN`).
- D는 인증 전에 `Host`가 `publicOrigin`의 host와 **정확히 같은지** 본다(`HOST_REJECTED` 403). 인증 단계에서 한 번 더 본다.
- `Origin`·`Cookie`·`Sec-Fetch-Site`가 있으면 거부한다(`SERVER_TO_SERVER_ONLY`). 브라우저에서 직접 부를 수 없다.
- `X-Forwarded-*`는 신뢰하지 않는다. 프록시는 원래 Host를 그대로 넘겨야 한다.
  - VM + Caddy: `reverse_proxy`는 원래 Host를 기본으로 보존한다. `header_up Host`를 넣지 않는다.
  - Railway: 엣지가 공개 도메인 Host를 넘긴다고 가정한다. **미확인**이므로 배포 직후 점검(9-3절)의 `prepare 200`과 `wrongHost 403`으로 확인한다.
- B 클라이언트는 `host: publicOrigin.host`를 직접 넣는다. 배포에서는 `connectOrigin = publicOrigin`이다.
- `bindingHash`에 publicOrigin이 들어간다. 도메인을 바꾸면 bindingHash가 바뀌므로, 메인의 scope 설정과 승인도 새로 만들어야 한다. 그래서 **임시 주소(Quick Tunnel 등)는 재시작마다 주소가 바뀌어 본선 배포에 맞지 않는다**.

## 5. nonce·승인 저장소

- 한 SQLite 파일(`approvals.sqlite`)에 `nonces`, `approvals` 두 표가 있다. VM은 `/var/lib/clear-preview/approvals.sqlite`, Railway는 볼륨 아래 `/var/lib/clear-preview/state/approvals.sqlite`다.
- timestamp ±60초. 인증이 끝난 뒤 nonce를 원자 INSERT하고 125초 보존한다. 재사용하면 `REQUEST_REPLAY`다.
- 승인은 bodyHash와 bindingHash에 결합되고 최대 1시간 유효하다. 호출 직전 `BEGIN EXCLUSIVE` 안에서 1회 소비한다. 실패·응답 유실·재시작 뒤에도 소진 상태가 유지된다.
- **단일 인스턴스만** 허용한다. 복제·자동 확장·볼륨 공유를 하지 않는다. 같은 DB를 두 서버가 쓰면 nonce와 승인 경계가 깨진다.
- 지속 볼륨이 필요하다. 재시작 뒤 nonce·승인 소진이 보존되는 것을 컨테이너에서 확인했다(9-2절).
- DB 스냅숏 복원이나 시계 역행은 자동으로 감지하지 못한다. 의심되면 즉시 중지하고 3절의 회전 절차를 따른다.

## 6. 승인 등록 절차(실제 Gemini 1회)

승인은 **D 원장과 A owner 목록 두 곳**에 같은 값으로 들어가야 한다. 화면 클릭은 승인을 만들지 않는다.

1. **사전 확인(모델 호출 없음)**: 정확한 원문(예: `Python 기초 강의 완료`, UTF-8 27바이트)을 D 비공개 config 폴더의 `source.txt`에 둔다.
   - VM: `docker compose -f deploy/agent-preview/compose.yaml exec preview node deploy/agent-preview/approval.mjs prepare /run/secrets/source.txt`
   - 출력: `bodyHash`, `bindingHash`, `limits`, `scopeValues{publicOrigin, dActor, deployment}`. 비밀값은 출력하지 않는다.
2. **사용자 직접 승인**: 원문·bodyHash·bindingHash·모델·상한(입력 4096/출력 2048 tokens, 재시도 0)·현재 단가 기준 비용 상한을 사용자에게 보여 주고 승인받는다. 2026-11-04 단가 기준 생성 1회 상한은 USD 0.0063488이다. 승인 직전 [공식 단가](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite)를 다시 확인한다.
3. **D 원장 등록**: 승인받은 정확한 지문을 넣는다.
   `docker compose -f deploy/agent-preview/compose.yaml exec -e CLEAR_APPROVED_BODY_HASH=<bodyHash> -e CLEAR_APPROVED_BINDING_HASH=<bindingHash> preview node deploy/agent-preview/approval.mjs record-approved-input /run/secrets/source.txt <approvalRef>`
   - `approvalRef`는 `^[A-Za-z0-9_-]{8,80}$`, 한 번만 쓸 수 있다. 출력의 `approvalExpiresAt`(ms)이 D 원장의 정확한 만료다.
   - 지문이 하나라도 다르면 `PREVIEW_APPROVAL_FAILED`로 아무것도 기록하지 않는다.
4. **A owner 목록 기록(메인)**: 같은 `{bodyHash, bindingHash, approvalRef, expiresAt: approvalExpiresAt}`를 A 실행본의 `approvals.record(...)`(`mountOperatorPreview` 반환값)에 넣는다. HTTP 경로가 아니라 owner 전용 입력이어야 한다. 이 경로는 메인이 정한다.
5. 운영자가 Moodle 패널에 **같은 원문**을 넣고 「제안 생성」을 누른다. prepare 안에서 승인이 한 번 결합되고, generate에서 D가 원장을 소비한 뒤 Gemini를 부른다.
6. 기록: Gemini 응답 여부(`modelCall.replied`), `modelProvenance=ACTUAL_GEMINI_HTTP`, 공급자 usage는 따로 남긴다. 실패해도 같은 승인으로 재시도하지 않는다.

Railway에서는 이 CLI를 그대로 쓸 수 없다. 프로필 파일이 없고(설정이 환경 변수에서 만들어짐), `railway ssh` 셸은 root다. Railway를 고르면 승인 CLI에 환경 변수 설정 읽기와 UID 1000 전환을 추가하는 작업(약 1시간 + 검토)이 더 필요하다.

## 7. 배포 플랫폼 선택지와 사용자 결정

**2026-11-06 사용자 선택: AWS Lightsail.** 실행 절차와 남은 결정(비용 승인·도메인·Gemini 키)은 [DEPLOY_LIGHTSAIL](DEPLOY_LIGHTSAIL.ko.md)에 있다. 아래 표는 선택 전 비교 기록이다.

2026-11-04에 D 담당이 정리한 비교([RAILWAY.ko.md](../../deploy/agent-preview/RAILWAY.ko.md))를 이어받는다. 가격은 그날 확인한 값이며 가입 시 다시 확인해야 한다.

| 기준 | A. AWS Lightsail VM (권장) | B. Railway | C. 로컬 D(대체안, [절차](DEPLOY_LOCAL.ko.md)) |
|---|---|---|---|
| 위치 | 서울 리전, Linux 1GB/40GB, 고정 IPv4 | Singapore, 단일 서비스 + 볼륨 | 사용자 Mac, 127.0.0.1 |
| 비용 | 기본 월 USD 7(도메인·세금·Gemini 별도, 정지해도 과금) | Hobby 최소 월 USD 5 + 사용량, 예산 상한 제안 USD 10 | 0 |
| TLS·origin | Caddy 자동 HTTPS. **도메인이 필요**(사용자 도메인의 A 레코드, 또는 `<IP>.sslip.io` 같은 와일드카드 DNS) | 제공 `*.up.railway.app` 자동 HTTPS | 공개 origin 없음. `https://d-preview.clear.invalid` 같은 고정 가상 origin + loopback 연결 |
| 승인 CLI | `docker compose exec` 그대로 동작 | 추가 구현 필요(6절) | `./tools/node <staged>/deploy/agent-preview/approval.mjs` |
| 운영 부담 | SSH·OS 업데이트·방화벽(443/80만, SSH는 사용자 IP만) | 낮음 | 낮음 |
| 표시 | "외부 서버 실제 AI" | "외부 서버 실제 AI" | "로컬 AI"(외부 배포 아님으로 구분 표시) |

권장 이유: 사용자가 AWS 계정을 이미 갖고 있고, 승인 CLI와 compose 구성(단일 호스트, loopback listener, 같은 호스트 TLS 프록시)이 그대로 맞는다. 도메인이 없으면 Railway가 더 빠르다. 다만 승인 CLI 추가 작업이 필요하다.

### 사용자가 정할 것

| # | 결정 | 선택지 | 왜 필요한가 |
|---|---|---|---|
| 1 | 배포 계정·플랫폼 | AWS Lightsail(기존 계정) / Railway(새 가입) / 로컬 D만 | 가입·로그인·결제는 본인만 할 수 있다 |
| 2 | 요금·예산 | Lightsail 월 USD 7 / Railway 최소 USD 5 + 예산 상한 USD 10 | 새 비용 승인 |
| 3 | 지역 | 서울 `ap-northeast-2` / Singapore `asia-southeast1-eqsg3a` | 지연과 데이터 위치 |
| 4 | 공개 범위·도메인 | 사용자 도메인 하위 이름 / sslip.io 같은 IP 기반 이름 / Railway 제공 도메인 | publicOrigin이 bindingHash를 정하고, 인터넷에 HTTPS 엔드포인트 하나가 공개된다(HMAC 없이 쓸 수 있는 경로는 없음) |
| 5 | Gemini 키 | 기존 키를 D 서버 비밀로 등록할지, 별도 키를 만들지 | 키는 D에만 둔다. 키 입력은 사용자가 직접 한다 |
| 6 | Gemini 비용·입력 | 원문 1개(예: `Python 기초 강의 완료`), 1회, 상한 USD 0.0063488(11/04 단가) | CLAUDE.md의 입력별 직접 승인·비용 검토 규칙 |
| 7 | execute | 503 유지 / 로컬 읽기 + 최소 결과 전달 구현 | [결정안](DEPLOY_EXECUTE_DECISION.ko.md) |

## 8. 배포 순서(결정 이후)

1. **패키지 고정**: 승인할 커밋에서 `./tools/node deploy/agent-preview/package.mjs <빈 디렉터리>`를 실행한다. `build-manifest.json`의 SHA-256이 artifactHash다. sourceHead가 바뀌면 artifactHash도 바뀌므로, **배포 직전 실제 커밋에서 다시 계산한다**.
2. **키 없이 1차 기동**: 새 epoch(UUIDv4, `uuidgen | tr A-Z a-z`)와 새 HMAC 키로 기동한다. `GEMINI_API_KEY`는 비워 둔다(compose가 이제 빈 값을 허용한다). 승인도 등록하지 않는다.
   - VM: staged 디렉터리를 VM으로 복사 → `CLEAR_PREVIEW_BUILD_CONTEXT=… CLEAR_PREVIEW_CONFIG_DIR=… CLEAR_PREVIEW_STATE_DIR=… docker compose -f <ctx>/deploy/agent-preview/compose.yaml up -d --build` → Caddy `reverse_proxy 127.0.0.1:18991`.
   - Railway: 대시보드에서 [RAILWAY.ko.md](../../deploy/agent-preview/RAILWAY.ko.md) 표의 값을 넣는다(시작 명령 `node deploy/agent-preview/railway.mjs`, 볼륨 `/var/lib/clear-preview`, 인스턴스 1).
3. **원격 점검(모델 호출 없음)**: Mac에서 `tests/remote-smoke.mjs`를 실행한다(9-3절). 이어서 재시작 → 같은 nonce 재전송이 `REQUEST_REPLAY`인지 확인한다.
4. **계약값 전달**: `approval.mjs prepare` 출력의 `scopeValues`를 메인에게 넘긴다. 메인은 scope 설정과 A의 HMAC 파일을 넣는다(Mac 쪽 기동은 메인 담당).
5. **Gemini 키 등록**: 사용자 승인 뒤 D 서버 비밀로 넣고 재기동한다. epoch·키는 그대로 둔다.
6. **입력 1건 승인 → 실행**: 6절 절차. 결과는 "외부 모델 호출 성공/실패"로만 기록한다. execute를 연결하기 전에는 "외부 AI 서비스 흐름 성공"이라고 쓰지 않는다.
7. **종료·복구**: VM은 `docker compose stop`, Railway는 서비스 중지. DB를 지우거나 되돌려 승인을 되살리지 않는다.

## 9. 이번에 한 검증(모두 오프라인)

### 9-1. 저장소 시험 (Node 24.21.0)

| 시험 | 결과 |
|---|---|
| `deploy/agent-preview/tests/*.test.mjs` | 46개 중 45 통과, 1 건너뜀(변환기 경로 필요) |
| 위 건너뛴 1건을 `CLEAR_CONDITION_PANEL_CONVERTER=web/src/bootcamp/finals-panels/condition-proposal-v21.js`로 실행 | 1/1 통과(E v2.1 변환기가 D 생성 응답을 받음) |
| `tests/agent-preview-loopback/*.test.mjs`, `CLEAR_D_PREVIEW_ROOT=<이 브랜치>` | 9/9 통과. 기존 CLEAR 세션·CSRF, develop의 B 중계, 이 브랜치의 실제 D(HMAC·SQLite 단회 승인)를 루프백 HTTPS/HTTP로 연결. 모델 전송은 오프라인 |
| 새 `approval-cli.test.mjs` | 승인 CLI 출력이 B `validateOperatorScopeConfig`·`createOwnerApprovalRegistry`를 통과. 정확 지문이 아니면 기록 0건, 같은 ref 재등록 거부, 1회 소비 |
| 첫 실행 사전 점검 `tests/first-run-preflight.mjs` | sourceHash `bc762938…`, bodyHash `ac7ed3ef…`, limitsHash `d428e64c…`(기존 문서값과 같음) |

- 루프백 시험의 인증서 생성에는 OpenSSL 3이 필요하다. macOS 기본 LibreSSL로 만든 인증서는 `self-signed certificate`로 실패한다(시험 코드 문제 아님).
- 루프백 시험은 `@reclaimprotocol/attestor-core@5.1.4`, `parse5@8.0.1`이 node_modules에 있어야 한다. 이 둘은 lockfile에 없어서 `--no-save`로 따로 설치했다.
- 실행하지 않음: `tests/peer-integration.mjs`(고정 B 체크아웃 필요), CI 워크플로(#154의 `.github/workflows/agent-preview-deploy.yml`은 이 브랜치 범위 밖이라 가져오지 않음).

### 9-2. 컨테이너(`--network none`, 읽기 전용 루트, cap 전부 제거, 256MB, pids 64)

| 단계 | 결과 |
|---|---|
| 시작 | 산출물 검증 통과 → `LISTENING 18991 uid 1000 actualObservationEnabled=false paymentAllowed=false` |
| 승인 CLI prepare | bindingHash·scopeValues 출력. 승인 기록 없음 |
| 승인 CLI record(지문 없음) | `PREVIEW_APPROVAL_FAILED`, 기록 0 |
| 점검 클라이언트 7항목 | 무인증 403 `AUTH_REQUIRED`, 다른 Host 403 `HOST_REJECTED`, Origin 헤더 403 `SERVER_TO_SERVER_ONLY`, `GET /` 404, 서명 prepare 200(bindingHash·limitsHash 일치, `actualModelCall=false`), 미등록 승인 generate 422 `APPROVAL_REQUIRED_OR_SPENT`, 없는 draft execute 422 `DRAFT_STALE_OR_UNREVIEWED` |
| 같은 nonce 2회 | 200 → 422 `REQUEST_REPLAY` |
| 시험 승인 등록 후 generate 2회(키 없음·네트워크 없음) | 422 `REQUEST_REJECTED`(내부 `GEMINI_KEY_MISSING`) → 422 `APPROVAL_REQUIRED_OR_SPENT` |
| `docker restart` 후 | 같은 nonce 422 `REQUEST_REPLAY`, 같은 승인 422 `APPROVAL_REQUIRED_OR_SPENT`(지속 보존) |
| `docker stop`(SIGTERM) | exit 0 |
| Railway 진입점 모의(root 시작, CHOWN/SETUID/SETGID만 허용) | 상태 폴더 0700 node 소유 생성 → UID 1000 전환 → `0.0.0.0:8080` LISTENING, 점검 7항목 통과, SIGTERM exit 0 |

시험용 HMAC 키는 컨테이너 안에서 만들고 출력하지 않았다. 시험 컨테이너·볼륨은 끝난 뒤 지웠고 이미지는 남겼다.

### 9-3. 배포 뒤 같은 점검을 Mac에서 실행하는 법

```sh
CLEAR_SMOKE_ROOT="$PWD" \
CLEAR_SMOKE_PUBLIC_ORIGIN=https://<D origin> \
CLEAR_SMOKE_SECRET_FILE=<A 쪽 0600 HMAC 파일> \
CLEAR_SMOKE_ACTOR='{"institutionId":"clear-demo","courseId":"2","operatorId":"6"}' \
CLEAR_SMOKE_EXPECT='{"bindingHash":"<prepare 출력>","limitsHash":"d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0"}' \
CLEAR_SMOKE_REPLAY_NONCE="$(openssl rand -hex 16)" \
./tools/node deploy/agent-preview/tests/remote-smoke.mjs
```

이 클라이언트는 등록된 approvalRef를 보내지 않는다. 따라서 모델 호출이 일어나지 않는다. 출력은 상태 코드와 공개 지문뿐이다.

## 10. 이 브랜치의 변경

| 파일 | 변경 |
|---|---|
| `deploy/agent-preview/**` | `caa3291`에서 그대로 가져옴(39개 파일). 가져온 src 의존 8개는 develop과 바이트가 같다 |
| `deploy/agent-preview/artifact.mjs` | 경로 집합 지문을 develop 기준 462개 파일 집합(`5309f140…`)으로 갱신. develop의 src 구성이 D 브랜치와 달라서 필요하다(가져온 README의 "463개"는 D 브랜치 기준) |
| `deploy/agent-preview/compose.yaml` | `GEMINI_API_KEY`를 필수에서 선택으로 변경. 키 없이 1차 기동·점검하기 위해서다 |
| `deploy/agent-preview/approval.mjs` | `scopeValues`(publicOrigin, dActor, deployment 5값)와 `approvalExpiresAt` 출력 추가. 산출물 검증 뒤 같은 프로필에서 계산한다 |
| `deploy/agent-preview/tests/approval-cli.test.mjs` | 승인 CLI 출력과 B 검증기 호환 시험(신규, 패키지 제외) |
| `deploy/agent-preview/tests/remote-smoke.mjs` | 모델 호출 없는 원격·컨테이너 점검 클라이언트(신규, 패키지 제외) |
| `docs/agent-preview/DEPLOY*.md` | 이 문서, 계약값, 로컬 D 절차, Lightsail 절차, execute 결정안 |

`src/**`, C 플러그인, A 작업본, 실행 중인 환경, 지급·체인 코드는 건드리지 않았다.

## 11. 알려진 한계·후속

- 이미지에 `src/**` 전체가 들어간다. 지급·체인 소스 코드도 포함되지만 키·설정은 없다. 실행에 필요한 import 범위만 넣도록 줄이는 작업은 신뢰 bootstrap(`artifact.mjs`·`package.mjs`) 변경이므로 별도 검토 대상이다.
- `npm ci`가 lockfile 전체(ganache·solc 포함)를 설치한다. 이미지는 180MB다.
- amd64 이미지는 Mac 에뮬레이션에서 빌드와 산출물 검증까지만 했다. 서버 기동·점검은 arm64 이미지로 했고, amd64 실행 검증은 실제 VM에서 한다.
- Host 보존(Railway 엣지), 원격 재시작 보존, TLS 인증서 발급은 배포 뒤에만 확인할 수 있다.
- peer 런타임 후보(`peer-*.mjs`, B 서명 봉투·120초 단일 context)는 함께 들어 있지만 기본 CMD가 아니다. develop의 B 운영자 중계는 v0 HMAC 경로를 쓴다.
