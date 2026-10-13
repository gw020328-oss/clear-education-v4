# CLEAR 팀원·LLM 인계

공통 증명 세션 승인(2026-10-13): [이슈 #26](https://github.com/gw020328-oss/clear-education-v4/issues/26), [지갑 승인 도구](PROOF_WALLET.ko.md). PR #25 병합 `51ee66b` 위에서 기존 B1 서명/HTTP 계약을 재사용하는 `authorizeProofSession`을 추가했다. 검토한 문맥·독립 owner 공개키·중단/만료·응답 유실을 검사한다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류는 유지하며 HTTP/DB/정책/금고/화면은 변경하지 않는다.

학습 provider 후속(2026-10-13): [이슈 #24](https://github.com/gw020328-oss/clear-education-v4/issues/24), [Moodle 연결 명세](LEARNING_PROVIDER.ko.md). PR #23 병합 `7ee183d` 위에서 기존 B3를 재사용하는 합성 시드 provider를 추가했다. 기관·강좌·계정·필수 활동 매핑 및 완료/수정 시각의 의미를 고정하며 실제 Moodle 취득은 구현하지 않는다. 800점 AND 80%·최고점과 기존 HTTP/DB/UI는 유지한다. 원천 검증 차단·grant/outbox 보류 및 별도 독립 청구/Windows 검증 범위를 변경하지 않는다.

공통 오류 복구(2026-10-13): PR #20 병합 `4a0cdc6` 위에서 [이슈 #22](https://github.com/gw020328-oss/clear-education-v4/issues/22), [전송·복구 계약](API_RECOVERY.ko.md)을 추가했다. 기존 import/HTTP message를 유지하며 안전한 상세 코드·중단/시간 초과·쓰기 결과 확인 안내를 전달한다. 프론트 담당자는 공통 전송기의 새 필드를 확인한다. 서버/DB/화면·지급 기능을 추가하지 않으며 실제 원천 차단과 grant/outbox 보류를 유지한다.

2026-10-13 범위 변경: [최신 계획](TEAM_PLAN.ko.md)에 따라 공통 개발을 계속하되 CLEAR 추가 지급 서명의 grant/outbox와 종속 UI/API 확대는 새 구조 검증 전까지 보류한다. 현 금고·HMAC 구조를 최종안으로 고정하거나 PRD의 800점 AND 80%/최고점 정책을 변경하지 않는다. PR #19는 develop에 병합 완료(`3f8ef79`)이며 보존한다. 별도 증거 기반 청구·Windows 검증 worktree는 이 작업에서 수정하지 않는다.

B3의 현재 단위: [이슈 #13](https://github.com/gw020328-oss/clear-education-v4/issues/13), [학습 입력 계약·합성 adapter](LEARNING_EVIDENCE.ko.md). 필수 강의·기간·페이지/버전/출처 pin·정정/실패/중단을 검증하고 기존 평가기에 연결한다. 실제 제공자/API·인증·계정 매핑은 미확인으로 BLOCKED이며 제품 DB/HTTP/UI는 추가하지 않는다. 기존 실제 YBM 전체성 차단도 유지한다.

B2b 추가(2026-10-13): [이슈 #18](https://github.com/gw020328-oss/clear-education-v4/issues/18), [제품 수집·독립 검증·단회 수락 계약](PRODUCT_PROOF.ko.md). B2a는 PR #17로 병합됐다. 합성 driver의 제품 owner 연결, 서버 고정 합성 원천 서명/owner 서명의 별도 프로세스 검증, schema 4의 세션별 결과 단회 수락과 내부 snapshot 조회를 구현했다. 실제 YBM 원천 전체성·실수집·자격/지급은 계속 차단한다. proofSourceSigner는 서버/DB 환경에 고정하며 null인 기존 설정을 자동 활성화하지 않는다. 서준형의 F4는 새 evidence/result API와 과거 수락 영수증의 의미를 확인한다. B2b 병합 여부는 연결 PR을 따른다.

B2a 추가(2026-10-13): [이슈 #12](https://github.com/gw020328-oss/clear-education-v4/issues/12), [전체 시험 목록·최고점 증거 계약](EXAM_EVIDENCE.ko.md). B1은 PR #16으로 develop에 병합됐다. 새 원천 inventory의 범위·페이지 지문·건수·종료·상태 대조와 최고점의 합성 검증을 구현했다. 실제 YBM inventory/계정·기간 포괄성은 미확인으로 실평가를 차단한다. B1 DB/HTTP나 기존 실수집기는 변경하지 않으며, B2b는 신뢰한 manifest pin의 실제 출처와 검증 결과 단회 수락을 먼저 해결해야 한다. B2a 병합 여부는 연결 PR을 확인한다.

B1 추가(2026-10-12): [이슈 #15](https://github.com/gw020328-oss/clear-education-v4/issues/15), [제품 세션·영속 nonce 계약](PROOF_SESSIONS.ko.md). 생성/조회/지갑 승인/취소와 현재 예치 재검증을 구현했다. AUTHORIZED는 지갑 결합 승인이고 실제 증명 수락은 B2b, 시험 중복/outbox는 B4다. SQLite schema 3으로 v1/v2를 이관한다. 서준형의 F4는 이 계약과 공통 오류 복구 계약과 이번에 추가한 [proof 승인 helper](PROOF_WALLET.ko.md)를 확인한다. 병합 여부는 연결 PR을 따른다.


이 문서는 새 팀원과 그 LLM이 같은 기준으로 개발을 시작하기 위한 입구다. **제품 코드 기준은 PR #8 병합 `841052a`, 문서 포함 기준은 PR #5 병합 `9397e62` (2026-10-12)**다. 이후 작업을 시작할 때는 원격 `develop`과 관련 PR을 다시 확인한다. 이 인계 문서 자체는 기능 구현이나 배포 승인이 아니다.

C1 후속: [로컬 합성 HTTPS 실행 환경](LOCAL_SYNTHETIC.ko.md)이 추가됐다. 아래 제품 기능 표는 기존 기준이고, 실행 구성은 C1 안내를 따른다. F0 참가자 화면은 별도 작업이다.

## 읽는 순서

1. [AGENTS.md](../../AGENTS.md): 작업·자료 취급·Git 규칙. 날짜가 붙은 과거 기록은 최신 승인과 구분한다.
2. 이 문서 → [역할·PR 계획](TEAM_PLAN.ko.md) → [현재 API 계약](API_CONTRACT.ko.md).
3. [Mac MVP](MAC_MVP.ko.md), [개발 환경](../development.md), [협업 절차](../../CONTRIBUTING.md).
4. 맡은 기능의 소스·시험과 상세 문서. 원래 설계는 [reference](../reference/DESIGN.ko.md), 구현 사실은 현재 소스와 검증 기록을 확인한다.

[첫 프롬프트](TEAM_START_PROMPT.ko.md)를 새 대화에 붙여 넣으면 첫 작업 F0을 시작할 수 있다. 이 문서 PR을 `develop`에 병합한 뒤 사용하는 순서다.

## 무엇을 만드는가

CLEAR는 지갑으로 신청·동의하고, 교육 이수와 TOEIC 조건을 검증해 미리 예치된 환급금을 청구하도록 만드는 서비스다. 민감한 학습·성적 원문을 공개하지 않으면서 신청·수취 지갑·정책·시험·지급 권한을 연결해야 한다. 현재 첫 대상은 Apple Silicon Mac + Chrome과 무가치 TEST 토큰이다.

정책 평가기는 정해진 기간의 전체 시험 목록에서 최고점을 선택하고 **TOEIC 800점 이상 AND 시드 이수율 80% 이상**을 평가한다. 목록 불완전·자료 충돌은 보류한다. 자세한 기간·동점·반올림 규칙은 [정책 평가기](POLICY_EVALUATOR.ko.md)를 따른다. 이 로직이 구현됐다는 사실만으로 실제 사용자 자격을 판정할 수 있는 것은 아니다.

## 현재 가능한 것과 아직 없는 것

| 영역 | 확인된 구현 | 남은 연결 |
| --- | --- | --- |
| Mac 수집 경계 | 관리형 프로필·worker·종료/재시작 정리, 합성 배포 ZIP | 제품 화면에서 안전하게 호출·배포·운영 |
| YBM | 본인 계정에서 새 증명 2건 생성, 별도 프로세스의 공식 서명·원천·진단 신청/지갑 결합 검증 | 제품 DB 신청/영속 nonce 연결, 전체 시험 목록 완전성·최고점 검증 |
| 정책 PR #6 | SYNTHETIC 정책 컴파일·해시·결정적 평가 | 실제 시드 API·검증된 실제 입력 |
| 인증·신청 PR #7 | 지갑 인증, 신청 조건 동의, SQLite 영속 상태 | 실행 가능한 웹 UI·개발 서버 구성 |
| 금고 PR #8 | 배포 설정 검증, 최종 계약 동의, 예치 준비·확인·재시도 | 현재 체인 상태 재동기화, 제품 증명/권한 발급 연결 |
| B1 제품 증명 세션 | DB 영속 세션·지갑 결합 nonce 단회 소비, 현재 예치/제출 기간 재검증 | 실제 수집·검증 결과 수락, 시험 중복/outbox, F4 화면 |
| 청구 | 금고 계약의 권한·청구·회수 합성 시험 | 제품 outbox, 청구 패킷·배포 manifest·독립 복구 클라이언트 |

현재 정책은 `SYNTHETIC`, `publishable=false`; 제품 응답은 `paymentAllowed=false`다. 실제 YBM 진단 성공은 제품 자격·지급 성공이 아니다. 실제 전체 목록·최고점·자격·지급은 아직 확인되지 않았다. 실제 YBM 실행 근거와 단계별 시험 수는 [개발 현황](../status.md)과 [공개 검증 기록](../w02/ybm-proof-verification.json)에 있다. PR #8의 655개 통과는 당시 기록이며 새 checkout의 실행 결과로 보고하지 않는다.

## 어디를 수정하는가

| 경로 | 역할 / 권장 담당 |
| --- | --- |
| `src/application/`, `tests/application/` | 인증·신청·HTTP·DB·최종 동의·예치 / 백엔드 |
| `src/policy/`, `src/eligibility/`, `tests/policy/` | 정책 정규화·컴파일·평가 / 백엔드 |
| `src/vault/`, `contracts/`, `tests/vault/` | 배포 검증·서명 인코딩·금고 / 백엔드 |
| `src/mac-collector/`, `src/ybm-collector/` | 민감 수집·프로세스 경계 / 백엔드 |
| `src/application/wallet-client.mjs`, `src/application/api-client.mjs` | EIP-1193 지갑·동일 origin API/복구 도구 / 공통 인터페이스, 변경 전 양쪽 영향 확인 |
| `web/` (신설 제안) | 참가자·운영자 화면과 브라우저 시험 / 프론트엔드 |
| `spikes/`, `docs/w01/`, `docs/w02/` | 실험·검증 이력. 제품 구현과 구분 |
| `legacy/`, `docs/reference/` | 보존 대상. 새 기능 때문에 변경하거나 지문을 갱신하지 않음 |

`createApplicationServer()`는 서버 팩터리이며 C1의 `dev:init`/`dev:start`가 독립 환경 초기화와 실행을 제공한다. 루트 `npm start`나 완성된 참가자 화면은 없다. 웹 프레임워크·번들러는 F0에서 작은 범위로 선택하고 선택 이유를 기록한다. C1은 `web/dist` 빌드를 같은 HTTPS origin에서 제공한다. Node/DB/수집 모듈을 브라우저 번들에 포함하지 않는다.

## 새 작업 환경

전체 Git 이력을 복제하고 최신 `origin/develop`에서 `codex/<작업명>`을 만든다. 개인별 checkout·DB·테스트 지갑·체인 instance를 분리한다. 타인의 개발 DB·기존 테스트 체인을 복사하거나 초기화하지 않는다. Write 권한이 없다면 저장소 초대 수락/접근 상태를 확인하고, LLM이 권한을 임의 변경하지 않는다.

Node **24.21.0**, npm **11.19.0**을 준비한다. 저장소의 `./tools/node`, `./tools/npm`을 사용한다. 로컬 전용 `.toolchain` 또는 정확한 버전의 PATH 환경을 사용하고 시스템 전역 버전을 바꾸지 않는다. 실제 설치·OS 제약은 [개발 가이드](../development.md)를 따른다.

```sh
./tools/node --version
./tools/npm --version
./tools/npm ci --ignore-scripts
./tools/npm run verify:workspace
./tools/npm run test:policy
./tools/npm run test:applications
./tools/npm run test:vault
./tools/npm run test:proof-sessions
```

수집·전체 합성 시험에는 별도 의존성 설치가 필요하다. 명령은 개발 가이드와 [CI](../../.github/workflows/public-synthetic.yml)를 확인한다. `verify:workspace:local`은 별도 로컬 준비·권한 검사다. Linux에서 Mac 시험이 생략된 것을 Mac 검증 통과로 쓰지 않는다. 프론트 실행 명령은 F0에서 추가하고 문서에 기록한다.

## 두 LLM이 반드시 유지할 경계

- 로그인, 신청 조건 동의, 최종 계약 동의는 서로 다른 서명이다. 계정·체인이 바뀌면 진행 중 결과를 버리고 다시 연결한다. 최종 동의 전 실제 금고 설정을 사용자에게 보여준다.
- `ENROLLED`는 특정 블록에서 확인한 예치 기록이다. 현재 잔액·미사용 권리·지급 가능 상태로 해석하지 않는다. 이후 proof/발급에는 현재 체인 재검증이 필요하다.
- 원문 proof·성적·쿠키·비밀번호·개인키·프로필을 Git/Issue/PR/fixture/로그에 넣지 않는다. `private/`, `data/`, `var/`, `.toolchain/`은 공유하지 않는다. 합성 데이터만 공개한다.
- 최신 Mac 관리형 저장 승인은 과거 필수 tmpfs/추가 TEE 방침을 이 경로에서 대체한다. 정상/오류 종료 즉시 정리, 실행 중 최대 24시간, 강제 종료 후 다음 실행 전 정리 예외를 따른다. 무디스크·완전 삭제·추가 TEE 검증 완료를 주장하지 않는다.
- 최종 계약 payload·서명은 예치 복구를 위해 DB에 보존하는 의도된 예외다. 로그인/신청 조건 서명·개인키·원문 proof까지 보관 범위를 넓히지 않는다.
- pending manifest로 청구를 허용하지 않는다. `SYNTHETIC` 제한이나 지급 차단을 프론트 편의로 해제하지 않는다.
- 실제 로그인·증명·공개 체인 거래·유료 호출·배포는 합성 개발의 자동 후속이 아니다. 해당 작업의 사용자 지시와 준비 조건을 확인한다.

## 작업을 마칠 때

담당 범위, 변경 API/상태, 실행한 검사와 미실행 검사, 의존 PR, 알려진 제약을 PR에 남긴다. 상태·계약이 바뀌면 관련 인계 문서도 같은 PR에서 고친다. 날짜가 있는 과거 검증 기록은 덮어쓰지 않는다. 다음 LLM은 대화 기억 대신 최신 코드·문서·PR에서 이어간다.
