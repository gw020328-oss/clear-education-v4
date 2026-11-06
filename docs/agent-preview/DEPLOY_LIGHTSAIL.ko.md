# AWS Lightsail 배포 절차 (외부 D)

작성: 2026-11-06. 사용자가 배포 플랫폼으로 **AWS Lightsail**을 골랐다.

- 1~10절은 절차다. **11절은 2026-11-06 실제 배포 기록**이다(비용·sslip.io 사용자 승인 후, Gemini 키 없이 1차 기동). Gemini 호출은 하지 않았다.
- 이 Mac에는 AWS CLI와 `~/.aws` 설정이 없다. 이번에는 사용자가 앱 브라우저 창에서 AWS에 로그인한 뒤 Claude가 콘솔 단계를 진행했다.
- 공통 배경(키·Host·nonce·승인)은 [DEPLOY_PLAN](DEPLOY_PLAN.ko.md)에 있다. 같은 패키지를 로컬에서 쓰는 절차는 [DEPLOY_LOCAL](DEPLOY_LOCAL.ko.md)에 있다.

## 0. 아직 필요한 사용자 결정

| # | 결정 | 내용 |
|---|---|---|
| 1 | 비용 승인 | Lightsail Linux, 서울, 1GB RAM / 40GB SSD / 공인 IPv4 포함, 기본 월 USD 7(2026-11-04 확인값, 생성 화면에서 재확인) |
| 2 | 도메인 | (a) 사용자 도메인의 하위 이름(예: `clear-preview.<도메인>`) 또는 (b) 도메인 없이 `<고정IP를 대시로>.sslip.io` |
| 3 | Gemini 키 | D 전용 **새 키**를 만들지, 기존 키를 쓸지. 새 키를 권한다(9절) |
| 4 | Gemini 1회 입력·비용 | 원문 1개, 1회, 생성 상한 USD 0.0063488(11/04 단가). DEPLOY_PLAN 6절 |

비용 세부:
- 인스턴스는 **정지해도 과금**된다. 과금을 멈추려면 인스턴스를 삭제하고 고정 IP를 해제해야 한다.
- 고정 IP는 인스턴스에 붙어 있는 동안 무료이고, 떨어져 있으면 과금된다.
- 도메인, 스냅숏, 전송량 초과, 세금, Gemini 비용은 별도다.
- AWS Budgets 알림(예: USD 10)은 알림일 뿐 청구 상한이 아니다.

도메인 (b) 안내:
- sslip.io는 외부 DNS 서비스다. 그 서비스가 응답할 때만 주소가 동작한다.
- Let's Encrypt 인증서 발급은 배포 때 확인해야 한다. 실패하면 (a)로 바꾼다.
- 어느 쪽이든 origin을 바꾸면 bindingHash, scope, 승인을 모두 새로 만들어야 한다.

## 1. AWS 콘솔 단계 (사용자)

1. [Lightsail 콘솔](https://lightsail.aws.amazon.com/)에 로그인한다.
2. **Create instance**를 다음 값으로 만든다.
   - Region: Seoul(`ap-northeast-2`), Zone a
   - Platform: Linux/Unix
   - Blueprint: OS Only → Ubuntu 24.04 LTS
   - Plan: 1GB RAM, 월 USD 7(IPv4 포함 요금제)
   - 이름: `clear-preview-1`
3. SSH 키: Lightsail 기본 키를 내려받거나 본인 공개키를 올린다. 개인키는 Mac `~/.ssh/`에 0600으로 두고 채팅에 붙이지 않는다.
4. **Networking → Create static IP**로 고정 IP를 만들어 `clear-preview-1`에 붙인다.
5. **Networking → IPv4 firewall**:
   - SSH 22: "Restrict to IP address"로 본인 공인 IP만 허용
   - HTTP 80(인증서 발급·HTTPS 전환용), HTTPS 443 추가
   - 나머지는 열지 않는다. IPv6 방화벽도 같게 둔다(18991 포트는 열지 않음).
6. 도메인 (a)를 골랐다면 DNS에 A 레코드 `<호스트 이름> → <고정 IP>`를 추가한다.
7. 알려 줄 것(비밀 아님): 고정 IP, 사용할 호스트 이름.

## 2. Mac 준비 (오프라인)

로컬 D와 **같은 패키지 커밋 `2a1f392`**를 쓴다(artifactHash `6d0696c2…e564`). 대신 HMAC 키와 epoch는 로컬 D와 따로 만든다.

```sh
REPO=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-claude-student-cards
NODE="$REPO/.toolchain/node-v24.21.0-darwin-arm64/bin/node"
D_HOME="$HOME/Library/Application Support/CLEAR/d-preview-local"
LS="$HOME/Library/Application Support/CLEAR/d-preview-lightsail"; mkdir -p -m 700 "$LS"   # 로컬 D 폴더와 분리

# 1) node_modules 없는 패키지(VM에서 linux/amd64로 다시 설치하므로 Mac 의존성은 보내지 않는다)
git -C "$REPO" worktree add --detach /private/tmp/clear-d-src-2a1f392 2a1f392
env -i HOME="$HOME" PATH=/usr/bin:/bin "$NODE" /private/tmp/clear-d-src-2a1f392/deploy/agent-preview/package.mjs "$LS/build"
git -C "$REPO" worktree remove /private/tmp/clear-d-src-2a1f392
shasum -a 256 "$LS/build/build-manifest.json"     # 6d0696c2…e564

# 2) Lightsail 전용 HMAC 키(화면 출력 금지), 새 epoch, 원문
( umask 077; openssl rand -hex 32 > "$LS/clear-preview-hmac" )
uuidgen | tr A-Z a-z > "$LS/epoch.txt"              # 비밀 아님
( umask 077; printf '%s' 'Python 기초 강의 완료' > "$LS/source.txt" )
```

`$LS/profile.json`(0600)은 다음과 같다. VM 안 컨테이너 경로를 쓴다.

```json
{"version":"clear-external-preview-config.1",
 "publicOrigin":"https://<호스트 이름>",
 "port":18991,
 "institutionId":"clear-demo","courseId":"2","operatorId":"6",
 "dataMode":"DEMO_ACCOUNTS_ONLY",
 "databasePath":"/var/lib/clear-preview/approvals.sqlite",
 "sharedSecretFile":"/run/secrets/clear-preview-hmac",
 "artifactHash":"6d0696c2b4c1881c0125ec6c11095035fce29f616a43bb0e35fc4649f73ee564",
 "deploymentEpoch":"<epoch.txt 값>"}
```

전송(키 파일은 scp로만 옮기고 출력하지 않는다). `scp -r`이 중간에 끊기면 원격 `build`를 지운 뒤 다시 보낸다. 대상 폴더가 이미 있으면 `build/build`로 겹쳐 복사된다:

```sh
ssh ubuntu@<고정 IP> 'sudo mkdir -p /srv/clear-preview && sudo chown ubuntu:ubuntu /srv/clear-preview'
scp -r "$LS/build" ubuntu@<고정 IP>:/srv/clear-preview/build
ssh ubuntu@<고정 IP> 'mkdir -m 700 /srv/clear-preview/config /srv/clear-preview/state'
scp "$LS/profile.json" "$LS/clear-preview-hmac" "$LS/source.txt" ubuntu@<고정 IP>:/srv/clear-preview/config/
ssh ubuntu@<고정 IP> 'chmod 600 /srv/clear-preview/config/*'
```

## 3. VM 설정 (SSH, 1회)

Docker Engine과 compose 플러그인은 [Docker 공식 Ubuntu 설치 절차](https://docs.docker.com/engine/install/ubuntu/)를 따른다.

```sh
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
id -u ubuntu      # 1000이어야 한다(컨테이너 node 사용자와 같은 UID)
```

`id -u ubuntu`가 1000이 아니면 `/srv/clear-preview/config`와 `state`를 `sudo chown -R 1000:1000`으로 바꾼다.

compose 환경 파일 `/srv/clear-preview/compose.env`(0600, 처음에는 키를 비워 둔다):

```sh
cat > /srv/clear-preview/compose.env <<'EOF'
CLEAR_PREVIEW_BUILD_CONTEXT=/srv/clear-preview/build
CLEAR_PREVIEW_CONFIG_DIR=/srv/clear-preview/config
CLEAR_PREVIEW_STATE_DIR=/srv/clear-preview/state
GEMINI_API_KEY=
EOF
chmod 600 /srv/clear-preview/compose.env
```

D 기동. VM에서 native amd64로 빌드한다. `npm ci`는 lockfile 그대로 실행하고 스크립트는 실행하지 않는다.

```sh
DC="sudo docker compose --env-file /srv/clear-preview/compose.env -f /srv/clear-preview/build/deploy/agent-preview/compose.yaml"
$DC up -d --build
$DC logs preview    # {"event":"LISTENING","port":18991,…,"paymentAllowed":false}
```

HTTPS 프록시는 공식 Caddy 이미지를 host network로 띄운다. Caddy `reverse_proxy`는 원래 Host를 그대로 넘기고, 인증서를 자동으로 발급·갱신한다. `/srv/clear-preview/Caddyfile`:

```
<호스트 이름> {
	reverse_proxy 127.0.0.1:18991
	request_body {
		max_size 16KB
	}
}
```

```sh
sudo docker pull caddy:2
sudo docker image inspect caddy:2 --format '{{index .RepoDigests 0}}'   # 이 digest를 기록한다
sudo docker run --rm -v /srv/clear-preview/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2 caddy validate --config /etc/caddy/Caddyfile
sudo docker run -d --name clear-preview-caddy --restart unless-stopped --network host \
  -v /srv/clear-preview/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v clear-preview-caddy-data:/data -v clear-preview-caddy-config:/config caddy:2
```

Caddy 설정은 이 Mac에서 검증하지 못했다. 그 시점에 Docker 데몬이 응답하지 않았기 때문이다. VM에서 위 `caddy validate`로 확인한다.

> **경고**: 키를 넣은 뒤에는 `docker compose config`와 `docker inspect` 출력을 화면 공유·로그·채팅에 남기지 않는다. compose는 `GEMINI_API_KEY`를 실제 값으로 풀어서 출력한다. 이 준비 과정에서도 Mac 셸 환경의 키가 이렇게 한 번 출력되었다(9절).

## 4. 원격 점검 (Mac, 모델 호출 없음)

VM에서 계약값을 얻는다. 호출과 기록은 일어나지 않는다.

```sh
$DC exec preview node deploy/agent-preview/approval.mjs prepare /run/secrets/source.txt
```

출력 `scopeValues.deployment.bindingHash`를 Mac 점검에 넣는다.

```sh
CLEAR_SMOKE_ROOT="$REPO" \
CLEAR_SMOKE_PUBLIC_ORIGIN=https://<호스트 이름> \
CLEAR_SMOKE_SECRET_FILE="$LS/clear-preview-hmac" \
CLEAR_SMOKE_ACTOR='{"institutionId":"clear-demo","courseId":"2","operatorId":"6"}' \
CLEAR_SMOKE_EXPECT='{"bindingHash":"<prepare 출력>","limitsHash":"d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0"}' \
CLEAR_SMOKE_REPLAY_NONCE="$(openssl rand -hex 16)" \
"$NODE" <이 브랜치 체크아웃>/deploy/agent-preview/tests/remote-smoke.mjs
```

1. `"ok": true`, `fixedNonceSecond`가 `REQUEST_REPLAY`인지 본다. Railway와 달리 Host 보존은 Caddy 기본 동작이지만, 여기서 실제로 확인된다.
2. `$DC restart preview` 후 같은 `CLEAR_SMOKE_REPLAY_NONCE`로 2분 안에 다시 실행한다. `fixedNonceFirst`도 `REQUEST_REPLAY`여야 한다(재시작 후 보존).
3. `curl -sI http://<호스트 이름>/`가 HTTPS로 넘기는지, `curl -s https://<호스트 이름>/`가 404 JSON인지 본다.

## 5. 메인에 넘길 값

| A 설정 키 | 값 |
|---|---|
| dPublicOrigin | `https://<호스트 이름>` |
| dConnectOrigin | `https://<호스트 이름>`(같은 값) |
| dExecution | `ACTUAL` |
| sharedSecretFile | `$LS/clear-preview-hmac`(로컬 D 키와 다른 파일) |
| scopeFile | 4절 `prepare`의 `scopeValues`로 만든 scope. dActor `clear-demo/2/6`, artifactHash `6d0696c2…e564`, model, limitsHash 고정, epoch·bindingHash는 Lightsail 값 |
| approvalsFile | 7절 |

로컬 D와 Lightsail D는 epoch, 키, origin이 서로 다르다. 그래서 bindingHash와 승인도 섞이지 않는다. A는 한 번에 하나의 D만 가리킨다.

## 6. Gemini 키 등록 (사용자 승인 뒤, 사용자가 VM에서 직접)

1. `sudo nano /srv/clear-preview/compose.env`(또는 다른 편집기)로 `GEMINI_API_KEY=` 뒤에 키를 붙여 넣는다. `echo`·명령줄 인자로 넣지 않는다.
2. `$DC up -d`로 컨테이너를 다시 만든다. 환경 변수는 컨테이너를 새로 만들 때 반영된다. epoch·HMAC 키는 그대로이므로 bindingHash도 같다.
3. 키는 D 컨테이너에만 있다. Mac의 A와 Caddy에는 없다.

## 7. 입력 1건 승인 → 실행

DEPLOY_PLAN 6절과 같다. VM 명령은 다음과 같다.

```sh
$DC exec -e CLEAR_APPROVED_BODY_HASH=<bodyHash> -e CLEAR_APPROVED_BINDING_HASH=<bindingHash> \
  preview node deploy/agent-preview/approval.mjs record-approved-input /run/secrets/source.txt <approvalRef>
```

출력의 `approvalExpiresAt`과 함께 `{bodyHash, bindingHash, approvalRef, expiresAt}`를 A의 approvalsFile에 넣는다. 운영자(사용자 6)가 Moodle에 같은 원문을 넣고 「제안 생성」을 누른다.

결과는 "외부 모델 호출 성공/실패"로 기록한다. execute는 503이므로 "도구 실행 미연결"이다.

## 8. 중지·삭제

- 서비스 중지: `$DC stop`, `sudo docker stop clear-preview-caddy`. 인스턴스 요금은 계속 나간다.
- 과금 종료: 콘솔에서 인스턴스를 삭제하고 고정 IP를 해제한다. 삭제하면 승인·nonce DB도 사라지므로 다음 배포는 새 epoch·새 키로 한다.
- DB를 지우거나 되돌려 승인을 되살리지 않는다.

## 9. 2026-11-06 준비 중 사고 기록 — Gemini 키 출력

- compose 구성을 오프라인 검증하려고 이 Mac에서 `docker compose config`를 실행했다.
- compose가 실행 셸에 있던 `GEMINI_API_KEY`를 풀어서, **실제 키 값이 Claude 세션의 도구 출력에 한 번 표시**되었다.
- 파일·커밋·문서·노트에는 쓰이지 않았다(검색 확인).
- 키 교체(폐기 후 재발급) 여부는 사용자가 정한다. 이 키를 쓰는 기존 normal host 회고 AI에도 영향이 있다.
- 이후 이 작업의 명령은 `env -i`로 환경을 비우고 실행한다. 3절 경고는 이 일 때문에 넣었다.
- D 서버에는 **D 전용 새 키**를 권한다.

## 10. 예상 소요

| 단계 | 시간 |
|---|---|
| 콘솔(1절) | 약 10분 |
| Mac 준비·전송(2절) | 약 5분 |
| VM 설정·빌드(3절) | 약 15분 |
| 점검(4절) | 약 5분 |

인증서 발급이나 DNS 전파가 늦으면 더 걸린다.

## 11. 2026-11-06 실제 배포 기록 (키 없는 1차 기동)

사용자 승인: Lightsail 월 USD 7, 도메인 sslip.io. AWS 로그인은 사용자가 Claude 앱 브라우저 창에서 직접 했다. 콘솔 단계와 VM 설정은 Claude가 진행했다.

### 만든 자원

| 항목 | 값 |
|---|---|
| 인스턴스 | `clear-preview-1`, 서울 `ap-northeast-2a`, Ubuntu 24.04.4 LTS, x86_64, General purpose Dual-stack 1GB/2vCPU/40GB(`micro_3_0`, 월 USD 7) |
| 고정 IP | `clear-preview-ip` = `52.79.238.13` (인스턴스에 연결됨) |
| 공개 origin | `https://52-79-238-13.sslip.io` (Let's Encrypt YE2 인증서, 만료 2027-02-04, Caddy 자동 갱신) |
| 방화벽 | HTTP 80 모든 주소(인증서 발급·HTTPS 전환), HTTPS 443 모든 IPv4, SSH 22는 `115.95.185.185/32`(작업 Mac)와 Lightsail 브라우저 SSH만. 18991은 열지 않음 |
| SSH | 전용 키 `~/.ssh/clear-preview-lightsail`(ed25519). 공개키는 생성 시 launch script로 `ubuntu` 계정에 넣었다. 콘솔이 지역 기본 키 쌍을 함께 만들었지만 내려받거나 쓰지 않았다 |
| VM 소프트웨어 | apt 보안 업데이트 후 재부팅(커널 7.0.0-1012-aws), Docker 29.9.3, compose 5.7.0(공식 apt 저장소) |
| D | `/srv/clear-preview/build`(커밋 2a1f392 패키지, 462파일 바이트 일치), VM에서 native 빌드한 `agent-preview-preview`, `127.0.0.1:18991`, `GEMINI_API_KEY` 비어 있음 |
| Caddy | `caddy@sha256:b060aafbec4f8f5404c80273c8d8758248f157920d0a0cdd5cb5656a527f6ec5`, host network, cap은 NET_BIND_SERVICE만 |
| Mac 비공개 폴더 | `~/Library/Application Support/CLEAR/d-preview-lightsail/` (패키지, 0600 HMAC 키·프로필·원문, epoch, Caddyfile). 로컬 D 폴더와 별개 |

### 계약값 (메인 전달용, 비밀 없음)

| 항목 | 값 |
|---|---|
| dPublicOrigin / dConnectOrigin | `https://52-79-238-13.sslip.io` |
| dExecution | `ACTUAL` |
| sharedSecretFile | `~/Library/Application Support/CLEAR/d-preview-lightsail/clear-preview-hmac` (0600, 로컬 D 키와 다름) |
| artifactHash | `6d0696c2b4c1881c0125ec6c11095035fce29f616a43bb0e35fc4649f73ee564` |
| deploymentEpoch | `d1239e85-28cb-45dc-b9b3-503d67d9dd50` |
| bindingHash | `33f79e81ba37597531077b358879b9e8723f21cea9d2e218e34ebd5f4b2fe5e6` (VM의 `approval.mjs prepare` 출력) |
| limitsHash / model | `d428e64cf3e7183e8ecc3a99f14c4be5b53d0f002c33c8fcbca92bfadbf28ae0` / `gemini-3.5-flash-lite` |
| dActor | `clear-demo` / `2` / `6` |
| bodyHash(`Python 기초 강의 완료`) | `ac7ed3efc93f48f855f2ae66e8a63997be54d04feea790261593892c9f17643c` |
| execute | 503 유지 |

scope 예시는 DEPLOY_LOCAL 1절 JSON에서 `deploymentEpoch`와 `bindingHash`만 위 값으로 바꾼 것이다. develop `validateOperatorScopeConfig` 통과를 확인했다.

### 검증 결과

| 확인 | 결과 |
|---|---|
| `http://…/` | 308 → HTTPS |
| `https://…/` | D의 404 `ROUTE_NOT_FOUND` JSON. Host가 보존되어 D까지 전달됨 |
| Mac `remote-smoke.mjs`(실제 HTTPS) | `ok:true`. 무인증 403 `AUTH_REQUIRED`, Origin 헤더 403 `SERVER_TO_SERVER_ONLY`, `GET /` 404, 서명 prepare 200(bindingHash·limitsHash 일치, `actualModelCall=false`), 미등록 승인 generate 422, 없는 draft execute 422, 같은 nonce 200 → 422 `REQUEST_REPLAY` |
| 다른 Host | Caddy가 어떤 사이트와도 맞지 않아 D로 넘기지 않고 빈 200 응답(`PROXY_NOT_FORWARDED`). D 자체의 `HOST_REJECTED`는 컨테이너 시험에서 확인 |
| D 컨테이너 재시작 | 17초 뒤 같은 nonce 422 `REQUEST_REPLAY`(SQLite 지속) |
| VM 재부팅 | 약 30초 뒤 D·Caddy 자동 기동, HTTPS 응답 |
| 외부에서 18991 | 닫힘(VM 안에서도 127.0.0.1만 listen) |
| 모델 호출 | 0회(키 없음, 승인 없음) |

### 진행 중 확인된 점

- `apt-get upgrade` 중 openssh가 갱신되어 SSH 22가 약 45초 거부되었다. 그 사이 `scp -r`이 끊겨 `build/build` 중첩이 생겼고, 원격 build를 지우고 다시 보냈다.
- 점검 클라이언트의 "다른 Host" 시험은 HTTPS에서 SNI가 Host 헤더를 따라가 TLS 단계에서 실패했다. SNI를 접속 호스트로 고정하고, 프록시 미전달도 통과로 보도록 고쳤다(`tests/remote-smoke.mjs`, 패키지 밖이라 artifactHash 변화 없음).

### 남은 것 (사용자 결정)

1. Gemini 키를 D 서버에 넣을지(6절). D 전용 새 키를 권한다.
2. 입력 1건·1회 호출 승인(7절). 승인 전에는 원장에 아무것도 등록하지 않는다.
3. (결정됨) 사용자가 r34에 이 Lightsail D를 쓰기로 했다. 로컬 D는 종료했다. 메인이 A 설정(`~/Library/Application Support/CLEAR/a-operator-preview-lightsail/`)으로 실제 HTTPS prepare 왕복을 확인했다(모델 0회). r34가 끝날 때까지 VM 실행환경(compose.env, 컨테이너, 승인 원장)은 메인만 다룬다. 메인이 VM에 `config/source-notice.txt`(환급 안내문, 비밀 아님)를 추가했다.
4. 행사 뒤 삭제 시점(8절). 삭제 전까지 월 USD 7이 일할 계산으로 과금된다.
