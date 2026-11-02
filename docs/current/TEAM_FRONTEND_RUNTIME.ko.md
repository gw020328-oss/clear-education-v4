# 팀원 화면의 실제 실행 연결 준비

2026-11-02. develop `677fc76`의 PR128 프론트와 PR131/ad5416e 실행 코드의 정상 merge `d962b11` 위에서 연결한다. 기존 실제 성공 작업본/DB/체인은 수정하지 않는다. 이번 단계의 실제 팀원 화면 사용자 완주는 아직 0건이다.

인증은 기존 /onboarding Google Privy, /operator MetaMask 구성과 CLEAR SIWE를 유지한다. 새 immutable `build-product.mjs --team` 결과에만 clear-team-app marker와 /team/index.html을 포함한다. 해당 marker를 수락한 제품 host에서 로그인 뒤 팀원 화면 iframe을 표시한다. 기존 참고 제품 bundle은 덮어쓰지 않는다. iframe 문서만 frame-ancestors self를 허용하고 부모의 Privy CSP에는 self frame을 추가한다. 팀원 문서의 script/style/font/connect는 같은 출처이며 외부 SDK는 부모의 기존 고정 bundle만 사용한다.

TeamPanel이 인증된 메모리 세션의 제한된 capability를 해당 iframe에 전달한다. window.clearWallet/raw provider는 공개하지 않는다. 원천 서명은 기존 product-session의 exact source 검증을 거친다. V2는 팀원 recipient-panel → registerReviewedRecipient → product-session으로 연결하며, 독립 signingContext·서명 전후 anchored checkpoint·canonical ancestry·같은 packet/원래 만료 검사를 유지한다. raw typed signer와 직접 recipient POST는 capability에서 거부한다. 운영자는 참가자 등록을 대신할 수 없다.

신청/원천/AI 준비는 기존 createTestDriver·자동 reader를 재사용한 팀원 준비 영역에 연결하고, 준비된 판정부터 기존 main/student/operator 화면을 사용한다. 실제 데이터 조회 실패를 합성으로 대체하지 않는다. 원천 유효기간·AI 승인 창·양측 검토 여유·실패 대기 게이트는 현행 원본을 사용한다. 팀원 검토 게이트 복사본을 현재 실행 코드로 갱신했다. refresh/pagehide 이후 메모리 세션 자동 복구는 제공하지 않는다.

검증: web+embedded 451/451, 실제 제품 TLS/인증/CAS를 거친 team recipient 경로에서 anchored GET2/지갑요청1/POST1 및 중간 판정 변경 시 POST0 확인. 새 ISOLATED_LIVE_TEST + 팀원 capability + 제품 HTTPS + fresh Geth에서 REGISTER/ALLOCATE/START_REVIEW/BIND_CONSENTS/PREPARE/ACCEPT/claim·canonical 정확100000000 atoms·중복 거부 통과. HR은 self Attestor 합성 HTTPS, Moodle은 가상 자료, AI는 차단된 가상 응답·가짜 키, 사용자 서명은 새 시험 EOA다. 실제 Privy/MetaMask 브라우저 및 팀원 DOM 실증은 이후 본부가 수행한다.

준비 host 이름은 `team-frontend-20261102`, origin은 https://127.0.0.1:9467 이다. 새 CA는 작업본 var/bootcamp-normal-host/team-frontend-20261102/ca.pem에 있다. 실제 활성화 전 최종 코드 HEAD/자산 SHA/새 host 전용 비용 승인 지갑 지정·가격 검토·역할 설정을 일치시켜야 한다. 기존 유료 승인/used/spent를 복사하지 않는다. 실제 run을 시작하거나 로그인·원천·유료 호출을 실행하지 않았다. 최종 인수 값과 준비 명령은 비공개 var/verification의 인계 기록에 남긴다. 예치 정책은 미확정이며 새 기능은 추가하지 않는다.
