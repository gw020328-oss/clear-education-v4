# 지갑 인증·신청 조건 동의·로컬 영속 상태

> 이 문서는 PR #7 구현 시점의 기록이다. PR #7은 develop에 병합되었으며,
> 이후 최종 계약 동의·배포 설정·예치 상태와 최종 서명의 제한된 저장은
> [VAULT_ENROLLMENT.ko.md](VAULT_ENROLLMENT.ko.md)를 따른다.

2026-10-12 PR #6을 최종 검토하고 develop에 병합했다. 병합 커밋은
`7e713c49c04c3f17a257acd1978a47d763c6f6a5`이며 정책 테스트 112개 재확인,
최신 push/PR CI 3종 성공, 최신 기준 브랜치·미해결 리뷰 대화 0건을 확인했다.
새 기능 브랜치는 이 develop에서 시작했다. 별도 문서 자동화 브랜치는 수정하지 않았다.

## 이번 단위의 범위와 설계 선택

W03/W06의 로컬 기반으로 **지갑 소유 로그인 → 정책을 고정한 신청 → 별도 신청 조건 동의 → 재시작 후 복원**을 구현한다.
실제 사용자 지갑으로 서명할 수 있는 인터페이스이지만 검증은 매 테스트 메모리에서 만든 합성 EOA로 수행한다.
개인키를 서버에 전달/저장하지 않는다. 실명 확인·실제 브라우저 확장 지갑의 제품 호환성 검증은 완료하지 않았다.

| 설계 목표 | 이번 구현 | 남은 연결 |
| --- | --- | --- |
| SIWE 지갑 로그인 | 서버 생성 메시지의 서명·domain/URI/chain/nonce/만료/instance 고정, DB 일회 소비 | 실제 EOA 확장 지갑 선택과 사용자 UI |
| 역할·소유권 | 서버 설정의 운영자/참가자 주소 초대 목록, 모든 신청 경로의 소유권 | 운영자 초대 관리 화면·원격 운영 |
| 정책·신청 | policyHash/버전 영속 보존, 정책 덮어쓰기 거부, 다른 참가자 격리 | 실제 정책 승인/게시·최종 RuntimeConfig |
| 조건 동의 | 별도 EIP-712 ApplicationTermsV4, DRAFT→TERMS_ACCEPTED | ClearRefund/TermsAcceptanceV4 최종 계약 동의 |
| 영속 상태 | SQLite transaction·unique 제약·세션/nonce·재시도 멱등성 | PostgreSQL·다중 호스트 배포·백업/삭제 운영 |
| 예치/등록 | funded=false, contractConsentRequired=true, paymentAllowed=false | W07 계약·예치 확인 뒤 CONSENTED/FUNDING_PENDING/ENROLLED |

PR #6 컴파일러는 SYNTHETIC만 허용하고 publishable=false다. 이 제한을 낮추지 않는다.
실제 날짜·금액·계약 주소가 정해지지 않은 상태에서 RuntimeConfig를 만들어 확정했다고 표시하지 않는다.
따라서 이번 동의는 **APPLICATION_ONLY(신청 조건 확인)**다. `ClearApplicationTerms` 도메인을 사용하며
금고의 `ClearRefund` 도메인·최종 `TermsAcceptanceV4`로 재사용할 수 없다.
`TERMS_ACCEPTED`는 예치 가능한 최종 CONSENTED나 등록 완료 ENROLLED가 아니다.
최종 계약 설정을 제시한 뒤 새 동의를 받아야 한다. 기존 정책을 소급 수정하는 경로는 없다.

기술 설계의 PostgreSQL은 원격/다중 호스트 단계의 방향으로 유지한다.
이번 로컬 단위는 고정 Node 24.21.0에 포함된 `node:sqlite`의 DatabaseSync를 사용하여
새 서버 설치·이미지·외부 의존성 없이 디스크 영속성과 여러 프로세스의 원자성을 검증한다.
단일 호스트의 짧은 동기 transaction만 지원한다. 고가용성·수평 확장·실사용 처리량 검증은 아니다.
root 의존성/lockfile·W01 환경 선언·과거 보고서·원본/legacy를 변경하지 않는다.

## 인증과 HTTP 경계

`createApplicationService`는 directory, HTTPS origin, chainId, bytes32 instanceId,
participants/ operators 주소 목록을 서버 설정으로 받는다. 역할은 요청 본문에서 받지 않는다.
origin·chain·instance·dataMode·저장 schema가 다른 설정으로 같은 DB를 열면 거부한다.
서비스는 현재 SYNTHETIC 정책과 APPLICATION_ONLY 동의만 지원한다.

SIWE 메시지는 서버가 생성한 **정확한 문자열**을 재구성하여 EIP-191 서명을 검증한다.
클라이언트가 보내는 임의 메시지 parser에 의존하지 않는다. domain/URI/chain/nonce/발급/만료/instance를
바꿔 서명해도 거부한다. EOA만 지원하며 EIP-1271 스마트 계정·ENS는 지원하지 않는다.
로그인 메시지는 환급 조건 동의가 아님을 명시한다.

nonce는 32-byte 무작위 값, 유효기간 300초다. 별도의 무작위 preauth 쿠키와 연결해
다른 브라우저의 로그인 응답으로 세션을 바꾸는 요청을 거부한다.
서명 검증·nonce 소비·새 세션 발급은 BEGIN IMMEDIATE transaction에서 처리한다.
지갑별 유효한 미소비 challenge는 최대 10개다. 실패 서명은 유효한 nonce를 소비하지 않는다.
로그인 재시도 때 새 challenge를 받고, 새 세션 성공 시 같은 브라우저의 이전 세션은 폐기한다.
세션은 3600초, 만료 시각과 같으면 거부하며 logout은 영속 폐기다. 초대 제거는 기존 세션에도 적용된다.

`createApplicationServer(service, {tls})`는 HTTPS 서버 객체만 만들고 자동 listen/배포하지 않는다.
HttpOnly/Secure/SameSite=Strict/Path=/ 쿠키와 __Host- 접두사를 사용한다.
세션 원문 토큰은 응답 JSON/DB에 보관하지 않고 쿠키만 전달한다.
모든 상태 변경은 정확한 Origin/Host, 세션, 지갑/체인, CSRF 검사를 거친다.
GET은 같은 Origin 또는 same-origin Fetch Metadata를 요구한다. CORS 허용은 없다.
프록시의 X-Forwarded-Proto를 TLS 증거로 신뢰하지 않는다. TLS 종단 구성은 후속 운영 검증 대상이다.

HTTP 합성 시험만 명시적인 allowLoopbackHttpForTests로 loopback 연결을 허용하며
이때도 Secure 쿠키·Origin/Host 검사는 그대로 유지한다. 테스트 HTTP의 수동 쿠키 전달을
실제 브라우저 HTTPS 운영 성공이라고 세지 않는다.
JSON은 64KiB, 헤더는 8KiB, 연결은 32개, 요청/헤더 시간 제한은 10초다.
응답은 no-store이며 원문 서명/증명/내부 예외/스택을 오류에 넣지 않는다.

| 경로 | 권한·동작 |
| --- | --- |
| POST /auth/nonce | 초대된 지갑·고정 chain의 SIWE challenge, preauth 쿠키 |
| POST /auth/verify | nonce/서명과 preauth 일치 후 로그인 쿠키 |
| GET /auth/session, POST /auth/logout | 본인 세션 복원/폐기 |
| POST /policies | 운영자가 합성 draft 등록. 같은 cohort/version의 다른 hash 거부 |
| GET /policies/:hash | 초대 사용자에게 고정 정책 반환 |
| POST /applications | 참가자 자신의 지갑으로 policyHash 고정. Idempotency-Key 필수 |
| GET /applications, GET /applications/:id | 본인 또는 허용 운영자. 목록 최대 100개 |
| POST /applications/:id/consent-challenge | 본인 DRAFT에 세션별 일회 동의 payload |
| POST /applications/:id/consent | 별도 typed signature 후 TERMS_ACCEPTED. Idempotency-Key 필수 |

인증 후 요청은 x-wallet/x-chain-id를 세션과 비교하고, 쓰기는 x-csrf-token을 요구한다.
CSRF 값은 HttpOnly 세션 토큰에서 일방향으로 파생하여 same-origin 응답으로만 제공한다.
멱등 키는 actor+route+key+bodyHash로 고정하고 같은 키의 다른 본문은 충돌 처리한다.
같은 생성 요청은 재시작/동시 요청에도 같은 applicationId를 반환한다.
다른 신청·세션의 동의 nonce를 바꿔 쓰거나 로그인 서명을 동의로 제출할 수 없다.
동의 challenge는 600초이며 재발급 시 같은 신청/세션의 이전 challenge를 폐기한다.
새 정책 버전 등록은 기존 신청을 수정하지 않고 구버전 신청의 새 동의를 차단한다.

## 브라우저 지갑 연결 코드

`createWalletClient`는 EIP-1193 provider와 same-origin API를 받아 connect/login/resume/request/consent/logout을 제공한다.
`createSameOriginApi`는 외부 origin·redirect를 거부하고 쿠키·no-store를 고정한다.
accountsChanged/chainChanged/disconnect에서 인증 캐시와 진행 중 작업 세대를 무효화한다.
이벤트가 없어도 요청·서명 전후 eth_accounts/eth_chainId를 다시 확인한다.
서명 프롬프트 중 계정/체인이 바뀌면 서명을 서버에 제출하지 않는다. 사용자 취소는 고정 오류로 반환한다.
dispose는 이벤트 리스너를 해제한다. 재접속은 현재 지갑/체인을 확인한 뒤 resume으로 기존 세션·신청을 읽는다.
변경 이벤트가 서버 쿠키를 즉시 삭제하는 것은 아니며, 서버는 매 요청의 지갑/체인 결합을 검사한다.

이 모듈은 향후 화면을 위한 연결 코드다. 설치한 실제 확장 지갑·사용자 UI/동의 문구 사용성·외부 PC는 미검증이다.
이번 테스트의 provider는 합성 EIP-1193 구현이며 이를 실브라우저 연결 성공으로 보고하지 않는다.

## 저장과 후속 범위

DB는 전용 소유 디렉터리 0700, 일반 파일 0600만 허용한다. symlink/hardlink·다른 소유/권한을 거부한다.
nonce/세션/preauth는 digest, 동의는 EIP-712 digest만 저장하며 서명·개인키·원본 proof는 저장하지 않는다.
정책·지갑·신청 연결은 최소 서비스 자료이며 익명 데이터라고 표현하지 않는다.
DELETE journal+FULL synchronous, foreign key·unique/check·불변 identity trigger를 사용한다.
transaction 내 네트워크 호출은 없으며 DB 파일을 메모리 캐시로 대체하지 않는다.

로컬 개발/시험용 DB는 실제 지갑·성적을 수집하지 않는다. DB 암호화·백업·W11의 최종 마감+30일 삭제,
원격 접근·자동 보존 작업·대용량 목록 pagination은 아직 제품 운영에 연결하지 않았다.
기존 임시 수집 세션 정리 작업으로 이 DB를 지우지 않는다. 원본 YBM 수집 경계에는 변경이 없다.

다음 PR은 W07 금고와 실제 RuntimeConfig, 최종 TermsAcceptanceV4 서명 벡터·예치 상태 전이다.
이후 W08 제품 proof 세션/영속 nonce, 반별 시험 nullifier·W09 권한/DB 중복·outbox, 독립 청구 순서다.
이번 nonce 원자성은 **로그인/신청 동의** 범위이며 실제 시험 재지급·지급 동시성 보장으로 확대하지 않는다.

## 검사와 근거

`./tools/npm run test:applications`는 로컬 SQLite와 loopback 합성 HTTP, 메모리 EOA만 사용한다.
서비스 재시작·서로 다른 프로세스의 nonce/멱등 경쟁·커밋 전 SIGKILL rollback을 실제로 검사한다.
공개 합성 CI에 같은 명령을 추가한다. 실제 로그인·유료 API·공개 체인·배포·자금 이동은 없다.

로컬 최종 결과는 신규 58개 + 기존 519개 = **577개 통과, 실패/skip 0개**다.
기존 검사는 정책 112, YBM 153, Mac/무결성/공개 이력 48, ProofAdapter 107, 원천 경계 62,
저장 준비 37개다. workspace/local/dependencies 검사와 원본/legacy 191파일·의존성 그래프 보존도 통과했다.
Mac 합성 Chrome·강제 종료 복구·패키지 재현을 포함하며 실제 계정 실행은 아니다.

담당자 자체 코드 리뷰에서 인증/동의 도메인 분리, DB transaction 경계, 세션·nonce digest 저장,
역할·소유권, 정책 불변성, HTTPS/Origin/CSRF, 지갑 변경 중 서명 폐기를 점검했다.
재접속 resume 경로를 보강했고, 빈 객체를 요구하는 logout/consent-challenge에 배열·숫자가
허용되던 검사를 엄격한 schema로 수정한 뒤 회귀 시험을 추가했다. 등록 기간 양 끝 포함·밖 거부도 검증했다.
검토 범위에서 추가 차단 문제는 발견하지 못했다. 독립 외부 리뷰나 별도 팀원 승인을 받은 것은 아니다.
원격 CI의 최종 결과는 새 PR Checks를 따른다.

- [ERC-4361 SIWE](https://eips.ethereum.org/EIPS/eip-4361): 메시지 형식과 EOA 서명·nonce·만료 원칙.
- [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193): provider 요청과 계정·체인 변경 이벤트.
- [SQLite transaction](https://www.sqlite.org/lang_transaction.html): IMMEDIATE transaction과 단일 writer.
- [Node SQLite](https://nodejs.org/api/sqlite.html): API 설명 참고. 실제 실행은 저장소 고정 24.21.0에서 검증하며 최신 문서 버전으로 런타임을 바꾸지 않는다.
