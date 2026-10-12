# C1 로컬 합성 HTTPS 개발 환경

담당: 오규원(백엔드), 서준형(프론트 연결 확인). [이슈 #10](https://github.com/gw020328-oss/clear-education-v4/issues/10), [계획 C1](TEAM_PLAN.ko.md)에 해당한다. 이 도구는 **새 로컬 TEST 체인·DB·지갑·인증서**를 만들고 기존 신청 API와 배포 금고를 연결한다. 무가치 TEST 전용이며 실제 YBM·자격 판정·제품 지급은 제공하지 않는다.

## 새 checkout에서 시작

전체 Git 이력과 최신 `develop`, Node 24.21.0/npm 11.19.0, PATH의 OpenSSL이 필요하다. macOS/Linux에서 사용한다. 현재 Mac 로컬 시험과 Linux CI로 확인하며 Windows 직접 실행은 지원하지 않는다.

```sh
./tools/node --version
./tools/npm --version
openssl version
./tools/npm ci --ignore-scripts
./tools/npm run verify:workspace
./tools/npm run dev:init -- --name gyuwon --port 8443
./tools/npm run dev:status -- --name gyuwon
./tools/npm run dev:start -- --name gyuwon
```

정상 실행 시 `https://127.0.0.1:8443`을 연다. 브라우저를 열기 전에 아래 인증서 신뢰 절차를 따른다. 종료는 실행 터미널의 Ctrl-C다. 같은 `dev:start` 명령으로 재시작하면 DB·체인·지갑·정책·배포를 그대로 사용한다. `dev:status`는 저장된 공개 설정을 보여주며 서버 생존/체인 건전성 검사가 아니다.

초기화는 운영자, 참가자 2명, issuer, outage용 합성 지갑과 가스용 잔액을 생성하고, 기존 TEST 토큰과 금고를 배포한다. 운영자 인증을 거쳐 합성 정책 등록과 runtime 연결을 한 번 수행한다. 임의의 인증 생략 API를 추가하지 않는다. 신청·서명·예치는 이후 기존 API를 통해 수행한다.

서준형은 자신의 checkout에서 `--name junhyeong --port 8444`처럼 별도 환경을 만든다. chainId는 10억~20억 미만 범위의 무작위 값, instanceId와 키는 암호학적 난수로 생성된다. chainId의 전역 유일성을 보장하지 않으며 충돌 시 기존 환경을 바꾸지 말고 새 이름으로 초기화한다. 로컬 기기/프로세스별 가용 포트를 사용한다.

## 인증서와 지갑 설정

각 환경의 `var/dev/<이름>/ca.pem`은 전용 개발 CA 공개 인증서다. CA와 서버 개인키는 같은 비공개 폴더에 생성되며 Git에서 제외된다. **도구는 OS 인증서 저장소를 자동 변경하지 않는다.**

1. 자신의 환경에서 생성한 CA인지 확인한다. 저장된 fingerprint는 `environment.json`의 `caFingerprint`다. 공개 인증서 지문 확인은 `openssl x509 -in var/dev/gyuwon/ca.pem -noout -fingerprint -sha256`으로 할 수 있다.
2. Mac에서는 키체인 접근으로 해당 `ca.pem`을 로그인 키체인에 가져오고 SSL 신뢰를 설정한다. 브라우저를 다시 시작해 경고 없이 정확한 origin에 접속되는지 확인한다. Linux에서는 사용하는 브라우저의 인증 기관 설정에 해당 개발 CA를 가져온다.
3. 환경을 폐기할 때 직접 추가한 개발 CA의 신뢰도 제거한다. `ca.key`는 공유하거나 브라우저에 가져오지 않는다.

OS 신뢰 설정 없이 명시적으로 CA를 지정하는 HTTP 확인도 가능하다.

```sh
curl --cacert var/dev/gyuwon/ca.pem https://127.0.0.1:8443/__dev/config
```

`curl -k`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, 인증서 오류 무시 실행을 정상 연결 방법으로 사용하지 않는다. 서버 인증서는 90일, CA는 365일 유효하다. 만료되면 실행을 거부하며 자동 재발급·환경 초기화하지 않는다. 장기 환경의 인증서 갱신은 후속 작업이다. 합성 정책은 초기화 시각 기준 등록 14일, 제출 마감 21일이고 재시작으로 기간을 연장하지 않는다.

F1에서 사용할 확장 지갑에는 별도 **개발용 프로필**을 사용한다. 공개 개발 설정의 `chainId`, `rpcUrl`(`/rpc`), 가스 통화 `ETH`(무가치)를 등록한다. 필요한 operator/learner의 키는 자신이 생성한 `var/dev/<이름>/wallets.json`을 로컬 편집기로 확인해 해당 개발 지갑에만 가져온다. 터미널 출력·스크린샷·대화·Git에 키를 복사하지 않는다. 실제 자산을 보내지 않는다. 실제 확장 지갑별 연결·UX 검증은 F1 범위다.

`__Host-` 쿠키는 포트별로 나뉘지 않는다. 여러 환경을 같은 `127.0.0.1`의 다른 포트에서 함께 사용할 때는 브라우저 프로필을 분리한다. 다른 DB의 세션 쿠키는 인증에 실패하지만, 같은 프로필에서는 다른 환경의 쿠키가 덮여 재로그인이 필요할 수 있다.

## 같은 origin에서 프론트 연결

- API: 기존 `/auth/*`, `/policies/*`, `/applications/*`, `/runtimes/*` 경로. [API 계약](API_CONTRACT.ko.md)의 인증/CSRF/지갑 헤더 규칙을 그대로 사용한다.
- 공개 개발 설정: `GET /__dev/config`. origin, rpcUrl, chainId, instanceId, 합성 주소, policyHash, vaultAddress, runtimeConfigHash와 합성/지급 차단 상태만 제공한다. 키·DB·내부 경로는 제공하지 않는다.
- TEST RPC: 같은 HTTPS origin의 `POST /rpc`. 조회·gas 계산·서명된 거래 전송만 허용한다. 잠금 해제, 노드 서명, unsigned 전송, 시간 변경, snapshot/revert, 체인 reset은 거부한다. 거래의 chainId를 검사한다.
- 프론트 빌드: `web/dist/index.html`과 JS/CSS/이미지/폰트만 서버 시작 시 읽는다. 소스맵·JSON·숨김 파일·저장소 소스는 제공하지 않고 심볼릭 링크가 있으면 시작을 거부한다. `/`가 진입점이고 해시 라우팅(`/\#/applications/…`)을 그대로 사용할 수 있다. history 기반 SPA에는 `/ui/…` fallback을 제공한다. 정적 파일의 query는 파일 선택에서 제외하므로 `/?scenario=empty` 같은 화면 시나리오도 지원한다. API 경로와 `/rpc`, `/__dev/config`는 화면 라우트로 사용하지 않는다.
- `web/dist`가 없으면 준비 상태 안내만 제공한다. F0 빌드를 생성한 뒤 서버를 재시작하면 화면을 제공한다. F0/F1은 루트 기준 asset URL과 별도 CSS/JS 파일을 사용한다. CSP는 inline script/style 및 외부 연결을 허용하지 않는다.
- 별도 HTTP 개발 서버에 인증 API를 CORS로 개방하지 않는다. C1은 빌드 제공 방식이며 HMR 프록시는 포함하지 않는다. 브라우저 API 요청은 동일 origin으로 보낸다. 지갑 RPC 클라이언트는 Origin 생략 또는 정확한 origin을 사용해야 하며 다른 Origin은 거부된다.

F0처럼 번들러 없는 정적 ES 모듈 화면은 `index.html`, `styles.css`, 브라우저용 `src/`만 동일한 상대 경로로 `web/dist`에 패키징한다. F0 소스가 있는 checkout에서, 아직 `web/dist`가 없을 때 다음을 실행할 수 있다. 기존 산출물이 있으면 먼저 그 생성 방식을 확인한다. `web/tools`·`web/tests`·저장소 전체를 복사하지 않는다. 생성한 `web/dist`는 Git에서 제외된다.

```sh
mkdir web/dist && cp web/index.html web/styles.css web/dist/ && cp -R web/src web/dist/src
```

해시 라우팅 화면은 `/`에서 열고, history 기반 `/ui/…` 라우팅 화면은 asset URL을 루트 기준으로 구성한다. 정적 패키징은 합성 adapter를 실제 API adapter로 바꾸지 않으므로 F1의 지갑·API 연결 작업은 별도로 필요하다.

신청/동의 API에는 기존 제한이 그대로 적용된다. 개발 서버도 HTTPS 연결과 Host를 확인하며, 프록시 헤더로 HTTP를 HTTPS로 인정하지 않는다. 네트워크 listener는 `127.0.0.1`에만 열린다. JSON-RPC는 요청 64 KiB, 배치 20개, 동시 요청 8개로 제한하고 내부 오류 내용은 반환하지 않는다.

## 영속 상태와 복구

`var/dev/<이름>/`은 0700, 설정·키·SQLite 파일은 0600이다. 내부의 `chain/`은 영속 Ganache 데이터, `application/`은 기존 SQLite DB다. 환경 설정에 절대 경로·origin·chainId·instanceId·지갑 주소·배포 pin·runtime hash를 고정한다. 새 환경은 `environment.json`이 마지막에 기록된 뒤에만 실행 가능하다.

실행 시 인증서/키, 체인 genesis·배포·바이트코드·runtime, DB 환경, 정책과 저장된 runtime을 검사한다. DB/체인 파일이 없거나 다른 환경에서 복사했으면 시작을 중단한다. 기존 환경에 `init`을 실행해도 덮어쓰지 않는다. 포트/origin/주소/설정 JSON을 직접 편집해 환경을 바꾸지 않는다.

Ctrl-C/SIGTERM은 새 연결을 닫고 진행 중 처리 정리 후 DB·체인을 닫는다. SIGKILL/전원 중단 후에는 잠금이 남을 수 있다. 기존 프로세스가 끝났음을 확인한 뒤 실행한다.

```sh
./tools/npm run dev:unlock -- --name gyuwon
./tools/npm run dev:start -- --name gyuwon
```

`unlock`은 기록된 PID가 존재하지 않을 때만 잠금을 제거한다. 살아 있는 PID·재사용 PID·조회 권한 오류·깨진 잠금은 자동 처리하지 않고 어떤 프로세스도 종료하지 않는다. 잠금이 깨졌거나 PID가 재사용된 경우 원인을 먼저 조사한다. 백업/복구는 서버를 정상 종료한 상태에서 전체 환경을 같은 경로로 복원하는 단위로 취급하며, 부분 DB·체인 교체와 여러 checkout의 동시 접근은 금지한다. 전원 장애의 모든 파일시스템 내구성을 보장하는 도구는 아니다.

새 초기 상태가 필요하면 기존 환경을 보존한 채 새 이름·포트로 `dev:init`을 실행한다. reset/delete 명령은 제공하지 않는다. 열린 권리가 있는 환경을 삭제하거나 instanceId를 재생성하지 않는다. 초기화 중 실패한 폴더도 보존하며, 원인을 확인하고 새 이름으로 다시 시도한다.

## 검증과 한계

```sh
./tools/npm run test:dev
./tools/npm run test:applications
./tools/npm run test:vault
./tools/npm run verify:workspace
./tools/node tools/check-public-content.mjs HEAD
```

새 시험은 신뢰한 CA를 통한 실제 loopback HTTPS, 로그인·CSRF·Host/Origin 거부, 두 단계 동의와 TEST 예치, 재시작 후 세션/예치/블록 보존, 환경 혼합·누락·권한·포트 충돌 거부, CLI 정상/강제 종료와 명시적 잠금 복구를 확인한다. 사용자 키체인 신뢰 설치와 확장 지갑 UI 조작은 자동 시험하지 않는다.

2026-10-12 Apple Silicon Mac 검증(구현 커밋 `7ea2440`): C1 33개, 기존 신청/인증 58개, 금고 78개 통과(각 실패/skip 0). `verify:dependencies`, `verify:workspace`, 문서 링크 60개 및 공개 이력 검사도 통과했다. 실행 데이터와 `.toolchain`이 없는 새 전체 clone에서 고정 런타임을 PATH로 제공하고 `npm ci --ignore-scripts` → 보존 검사 → C1 33개 시험을 다시 통과했다. 새 clone의 CLI 초기화·정상/강제 종료·재시작도 포함하며 로컬 CA를 명시적으로 신뢰하는 시험 클라이언트를 사용했다. 최신 GitHub CI 결과와 병합 상태는 이슈 #10의 연결 PR을 확인한다.

고정 Ganache의 네이티브 모듈이 Node 24와 맞지 않으면 JS fallback 경고가 나올 수 있다. 합성 기능 검증은 fallback에서도 실행된다. 새 네이티브 패키지나 전역 런타임을 설치해 경고만 없애지 않는다.

이 설정은 개발 편의용이며 배포 release manifest가 아니다. `usableForClaim=false`와 `paymentAllowed=false`를 유지한다. 원격/공개 체인·실제 YBM·issuer outbox·운영 키 관리·독립 청구는 후속 계획을 따른다.
