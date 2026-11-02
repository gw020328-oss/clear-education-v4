# 팀원 화면의 실제 실행 연결 준비

2026-11-02. develop `677fc76`의 PR128 프론트와 PR131/ad5416e 실행 코드의 정상 merge `d962b11` 위에서 연결한다. 기존 실제 성공 작업본/DB/체인은 수정하지 않는다. 이번 단계의 실제 팀원 화면 사용자 완주는 아직 0건이다.

인증은 기존 /onboarding Google Privy, /operator MetaMask 구성과 CLEAR SIWE를 유지한다. 새 immutable `build-product.mjs --team` 결과에만 clear-team-app marker와 /team/index.html을 포함한다. 해당 marker를 수락한 제품 host에서 로그인 뒤 팀원 화면 iframe을 표시한다. 기존 참고 제품 bundle은 덮어쓰지 않는다. iframe 문서만 frame-ancestors self를 허용하고 부모의 Privy CSP에는 self frame을 추가한다. 팀원 문서의 script/style/font/connect는 같은 출처이며 외부 SDK는 부모의 기존 고정 bundle만 사용한다.

TeamPanel이 인증된 메모리 세션의 제한된 capability를 해당 iframe에 전달한다. window.clearWallet/raw provider는 공개하지 않는다. 원천 서명은 기존 product-session의 exact source 검증을 거친다. V2는 팀원 recipient-panel → registerReviewedRecipient → product-session으로 연결하며, 독립 signingContext·서명 전후 anchored checkpoint·canonical ancestry·같은 packet/원래 만료 검사를 유지한다. raw typed signer와 직접 recipient POST는 capability에서 거부한다. 운영자는 참가자 등록을 대신할 수 없다.

신청/원천/AI 준비는 기존 createTestDriver·자동 reader를 재사용한 팀원 준비 영역에 연결하고, 준비된 판정부터 기존 main/student/operator 화면을 사용한다. 실제 데이터 조회 실패를 합성으로 대체하지 않는다. 원천 유효기간·AI 승인 창·양측 검토 여유·실패 대기 게이트는 현행 원본을 사용한다. 팀원 검토 게이트 복사본을 현재 실행 코드로 갱신했다. refresh/pagehide 이후 메모리 세션 자동 복구는 제공하지 않는다.

검증: web+embedded 452개 통과(로컬에서는 CI 전용 새 bundle 시험 1개 제외), 실제 제품 TLS/인증/CAS를 거친 team recipient 경로에서 anchored GET2/지갑요청1/POST1 및 중간 판정 변경 시 POST0 확인. 새 ISOLATED_LIVE_TEST + 팀원 capability + 제품 HTTPS + fresh Geth에서 REGISTER/ALLOCATE/START_REVIEW/BIND_CONSENTS/PREPARE/ACCEPT/claim·canonical 정확100000000 atoms·중복 거부 통과. HR은 self Attestor 합성 HTTPS, Moodle은 가상 자료, AI는 차단된 가상 응답·가짜 키, 사용자 서명은 새 시험 EOA다. 실제 Privy/MetaMask 브라우저 및 팀원 DOM 실증은 이후 본부가 수행한다.

최종 준비 host 이름은 `team-frontend-final-20261102`, origin은 https://127.0.0.1:9467 이다. 새 CA는 작업본 var/bootcamp-normal-host/team-frontend-final-20261102/ca.pem에 있다. 실제 활성화 전 최종 코드 HEAD/자산 SHA/새 host 전용 비용 승인 지갑 지정·가격 검토·역할 설정을 일치시켜야 한다. 기존 유료 승인/used/spent를 복사하지 않는다. 실제 run을 시작하거나 로그인·원천·유료 호출을 실행하지 않았다. 최종 인수 값과 준비 명령은 비공개 var/verification의 인계 기록에 남긴다. 예치 정책은 미확정이며 새 기능은 추가하지 않는다.

## 서명 후 GET의 실제 초 경계 보완

중간 HEAD b7ec336의 자체 Attestor CI에서 POST_SIGN_READ의 BC_VIEW_STALE/409가 관측됐다. native 키 접근·서명·broadcast는 0이었다. 원래 product-session의 실패 차단은 정상 동작했으며, 등록 관측의 직접 store GET이 초 경계에서 rollback되는 경로가 남아 있었다. 기존 코드에 새 결정론 시험을 적용하면 서명 전후 모두 실패하고, 수정 뒤 통과한다.

readRecipientRegistration에서 정확한 내부 RuleError/BC_VIEW_STALE인 로컬 projection만 1회 새로 읽는다. RPC refresh/ancestry 확인·지갑 서명·등록 POST는 반복하지 않는다. 원래 packet·등록 대상·nonce·deadline·stable 비교·권한 검사는 유지한다. 두 번째 충돌, 역행, 권한 철회, 임의 오류는 계속 거부한다. 실제 store 초 경계와 제품 HTTPS 시험으로 확인하며 실제 사용자 재시험의 근거는 아니다. 서명·시간 경계의 추가 리뷰는 Astra/High 권장이고 현재 구현·합성 검증은 Sol에서 수행했다.

이전 ff8a8d0의 Mac CI는 BROWSER_SIGNAL_TERM/kill에서 STALE_RECOVERY:EPERM 1건으로 중단됐다. Mac 복구 소스는 이번 범위에서 수정하지 않았다. 원인 미확정 기록을 보존하고 최신 HEAD CI와 구분하며 성공으로 덮지 않는다.
