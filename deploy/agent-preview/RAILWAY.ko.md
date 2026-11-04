# 본선 외부 서버 추천: Railway Hobby

2026-11-04 공식 문서 확인. 첫 read-only agent/API 서버 1개, Singapore region, persistent volume 1개를 권장한다.
실제 기관 기록 접근은 B/C의 승인된 관측 계약 이후이며, 이 배포만으로 지급/Privy/RPC 이전이 끝나지 않는다.

선정 이유는 기존 Docker/Node 구조, 자동 HTTPS 제공 도메인, SQLite 단회 승인 DB 유지,
별도 SSH/OS 관리 없이 배포할 수 있다는 점이다. 사용자가 인프라를 모르는 상태와 11/6 본선 일정을 고려한 판단이다.
Fly는 VM/volume 직접 구성이 더 필요하고, Render도 적합하지만 이 작은 서비스에는 Railway의 사용량 포함 Hobby가 시작하기 쉽다.

- [요금](https://docs.railway.com/pricing/plans): 최소 $5/월, 사용량 $5 포함, 초과분 추가.
- [공개 네트워크](https://docs.railway.com/networking/public-networking): 제공 도메인과 자동 SSL.
- [볼륨](https://docs.railway.com/volumes/reference): 재시작/배포 사이 지속 보존, replica 사용 불가. 이 서비스는 한 instance로 제한.
- [리전](https://docs.railway.com/deployments/regions): Singapore `asia-southeast1-eqsg3a`.
- [비용 제한](https://docs.railway.com/pricing/cost-control): 예산 상한을 넘으면 서비스가 중지된다. 본선 전 사용량 점검 필요.
- [무료 trial](https://docs.railway.com/pricing/free-trial): 검증되지 않은 계정은 outbound 제한 가능. 실제 Gemini 연결을 무료 trial 성공으로 가정하지 않는다.

초기 월 예산안은 $10(인프라)이며 Gemini·세금은 별도다. 예상/제안으로서 구매 승인이 아니다.
서비스를 만든 뒤 계정의 실제 단가·usage와 카드 청구 조건을 재확인한다. 자동 확장·복제·AI 부가 agent는 사용하지 않는다.

## 준비된 배포 사양

이 디렉터리의 Dockerfile과 `railway.mjs`를 사용한다. **저장소 전체를 업로드하지 않고**
`package.mjs`로 만든 allowlist context만 배포한다. 현재 Apple Silicon 이미지 확인은 Linux amd64 확인과 구분한다.
Dashboard/service 설정 또는 CLI에서 다음 값을 지정한다.

| 항목 | 값 |
| --- | --- |
| Build | Dockerfile `deploy/agent-preview/Dockerfile` |
| Start command | `node deploy/agent-preview/railway.mjs` |
| Region | `asia-southeast1-eqsg3a` |
| Instance | 1, autosleep off |
| Volume mount | `/var/lib/clear-preview` |
| Public networking | HTTPS 제공 도메인, target port 8080, TCP proxy 없음 |
| Restart | On Failure, 10회 |
| Healthcheck | 미설정. 별도 인증 없는 예외 endpoint를 만들지 않음 |

새 서비스용 기존 `railway.json/toml` 방식은 [공식 Config as Code 문서](https://docs.railway.com/config-as-code)에
deprecated로 표시되어 있어 그 파일을 추가하지 않는다. Dashboard 설정 또는 현행 IaC로 설정을 적용한다.

| 환경 이름 | 값/취급 |
| --- | --- |
| PORT | 8080 |
| RAILWAY_DOCKERFILE_PATH | deploy/agent-preview/Dockerfile |
| RAILWAY_RUN_UID | 0: volume state 하위폴더 초기화 후 프로세스가 UID/GID1000으로 즉시 전환 |
| RAILWAY_VOLUME_MOUNT_PATH | Railway가 주입한 `/var/lib/clear-preview`를 확인; 임의 가짜 mount로 대체 금지 |
| CLEAR_PREVIEW_PUBLIC_ORIGIN | 실제 발급된 정확한 `https://...up.railway.app` |
| CLEAR_PREVIEW_INSTITUTION_ID | C/B와 확정한 시연 기관 ID |
| CLEAR_PREVIEW_COURSE_ID | C/B와 확정한 강좌 ID 문자열 |
| CLEAR_PREVIEW_OPERATOR_ID | C가 확인한 운영자 ID 문자열 |
| CLEAR_PREVIEW_ARTIFACT_HASH | allowlist build-manifest.json 파일의 SHA-256, 시작 시 전체 열거 source bytes 검증 |
| CLEAR_PREVIEW_DEPLOYMENT_EPOCH | 새 배포/복구 시 발급한 UUIDv4; 이전 승인 무효화 |
| CLEAR_PREVIEW_HMAC_SECRET | 서버간 전용 hex64 secret. UI 브라우저/로그/이미지에 포함 금지 |
| GEMINI_API_KEY | 기존 사용자 키의 안전한 서버 secret 등록. 실제 호출 승인은 별도 |

Railway runner는 HMAC 값을 파일에 쓰지 않는다. 승인/nonce DB만 볼륨 state 하위에 저장한다.
HTTPS는 Railway edge에서 종료하고 내부 서비스가 HTTP를 받는다. 모든 경로의 exact Host와 HMAC 검사는 그대로 유지한다.
루트 권한은 볼륨의 state 폴더 생성/소유권 준비에만 사용하며 HTTP 수신 전 UID1000으로 전환한다.

## 사용자에게 필요한 단계

1. [Railway 로그인](https://railway.com/login)에서 본인 계정 가입/로그인.
2. Hobby 최소 월 $5 및 제안한 인프라 예산을 확인하고 결제 승인. 카드/토큰은 채팅으로 보내지 않는다.
3. 연결 도구/CLI의 본인 인증. 그 뒤 프로젝트·volume·도메인·secret 설정과 배포는 D가 진행한다.

본인이 로그인해야 하는 단계와 새 비용 승인이므로 사용자가 직접 수행/확인해야 한다.
실제 계정/배포가 없는 현재 단계에서는 URL, TLS, remote compute, restart persistence 검증을 완료로 표시하지 않는다.

## 승인 후 검증

고정 SHA 이미지→실제 HTTPS unauth403/auth prepare200→nonce/replay 거부→restart 후 승인 소진 보존을 먼저 기록한다.
그 뒤 exact body/binding 승인→실제 Gemini→B/C 관측 연결→Moodle 화면 표시를 각각 확인한다.
서버 설정에 학생 기록 권한을 임의 추가하지 않는다. 지급은 기존 별도 안전한 정상 흐름을 보존한다.
