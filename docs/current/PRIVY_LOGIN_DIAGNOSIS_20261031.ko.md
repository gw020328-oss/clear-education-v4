# Privy 로그인 구성 비교와 최소 진단

2026-10-31. 실제 재로그인·증명·유료 AI·지급은 이 변경에서 실행하지 않았다.

## 이전 성공 근거와 현재 차이

- [기존 검증 기록](EMBEDDED_WALLET_PRIVY.ko.md)의 2026-10-29 성공은 Chrome/9457에서 Google 로그인·첫 지갑 생성·동일 주소 복구·로컬 RPC/EOA 확인이다. 당시 문서의 SIWE 미실행은 그 기록 시점의 상태다. 이후 사용자가 참가자와 MetaMask 운영자 양측의 CLEAR 로그인 서명 및 서버 역할 성공을 보고했다. 제품 신청·HackerRank 증명·V2 지급 완주로 확대하지 않는다.
- 주소 확인 수정 `158bbdd`, SIWE 연결 `50f7a82`, 제품 연결 `be0696c`와 현재 기준 `ea716c3`을 비교했다. Google `initOAuth({provider:'google'})`, Privy 3.51.0, 공유 OAuth, EOA 수동 생성, 외부 지갑 비활성, scriptNonce/CSP 설정은 유지된다. config.mjs의 이전 대비 차이는 AUTH_LOCAL_TEST 허용 추가뿐이다. 보존된 두 제품 번들에도 3.51.0/동일 headless OAuth 구현이 있다. 보존 번들은 개별 로그인 성공 시점의 정확한 브라우저 메모리·세션을 입증하지 않는다.
- 기준 SDK/보안 backport·viem 교정은 유지한다. 서명/권한/신청 소유자/V2 등록/재사용 방지/지급 변경을 롤백하지 않는다.
- 이번 제품은 새 origin9467·새 CA·새 체인/RPC·새 실행/세션과 명시 SELF_ATTESTOR_TEST다. 같은 Privy 앱을 사용하며, 사용자 보고상 정확한9467 Allowed origin 등록 뒤 Origin 오류가 사라졌다. Google enabled/shared OAuth는 화면 확인 사실이며 과거 콘솔 설정의 완전한 스냅샷은 없다. SDK 저장소는 origin별이므로9457 세션 복원을9467에 그대로 기대할 수 없다. 세션·토큰을 복사하지 않는다.
- 이번 실행은 사용자 HackerRank 자체 로그인 후 NORMAL_HOST_ACTIVE에 도달했으나, Privy Google 화면 전 이동에서 실패했고 원시 예외는 보존하지 않았다. 이후 정상 취소 기록은 원래 OAuth 실패 원인이 아니다. sourceVerified=false/applicationId=null 상태와 사용 완료 실행 기록을 보존한다.

## 확정과 미확정

확정 결함은 UI catch가 예외를 버리고 initOAuth 단계가 비어 있으며, SDK의 비동기 OAuth 복귀 state.error도 표시하지 않는 점이다. 이번 변경은 시작/복귀 단계를 표시하고 SDK의 고정 오류 코드·분류·허용 HTTP 상태만 보존한다. 같은 탭 sessionStorage에 최근 안전 진단 한 건만 저장하여 리다이렉트 뒤에도 읽을 수 있다. 저장 거부 시 화면 진단은 유지된다. 원시 예외/message/cause/data, URL 쿼리, 토큰·쿠키·사용자 ID·주소는 저장/전송/로그하지 않는다. 저장소가 오염돼도 허용 어휘 외 값은 표시하지 않는다.

SDK3.51.0 설치 구현은 CAPTCHA 처리 → 브라우저 지원 검사 → OAuth init API → window.location.assign 순서다. OAuth callback은 SDK 자체 hook의 state.error에 나타날 수 있다. 설치 타입의 initOAuth 입력은 provider/disableSignup이며 customOAuthRedirectUrl이 없으면 현재 페이지를 사용한다. 따라서 validateConfig의 redirectUri를 Provider에 추가하지 않은 사실만으로 원인을 확정할 수 없다. 이전 성공 호출에도 그 설정은 없었다.

실제 실패가 CAPTCHA·브라우저 저장 제한·API 거부·네트워크/CSP 중 무엇인지는 **미확정**이다. WalletConnect 목록 fetch와 초기 token 경고를 직접 원인으로 단정하지 않는다. 단순 포트 교체·의존성 다운그레이드·인증/CSP 완화는 근거가 없다. 현재 로그인 구성은 이미 이전 성공 방식과 같아 무의미한 롤백을 수행하지 않는다.

## 다음 재시험 조건

1. PR125 최종 HEAD 검사 성공과 새 진단 포함 불변 제품 번들을 확인한다. 기존9457 서버/프로필, 사용 완료9467 호스트·run.used·실패 기록은 덮어쓰거나 재활용하지 않는다.
2. 새 실행은 별도 새 host/DB/체인/키/소스 매핑으로 준비하고 정확한 새 origin/CA/Privy 허용 설정을 확인한다. 이전 성공 Google/EOA 구성을 유지하고 HackerRank 원천만 명시 SELF_ATTESTOR_TEST로 선택한다. 기존 origin 재사용은 포트 소유/미사용·종료 확인 후 별도 실행 계획에서 판단하며 포트 변경 자체를 해결책으로 삼지 않는다.
3. 사용자 실제 재시험 승인 뒤 Google 버튼을 한 번 누른다. 실패하면 재로그인 반복 없이 화면의 OAUTH_START/OAUTH_RETURN·고정 코드·HTTP 상태만 전달한다. 코드가 UNCLASSIFIED여도 원시 예외/URL/콘솔 전체를 공유하지 않는다. 필요한 다음 진단을 좁혀 검토한다.
4. 정상 로그인 후 기존 지갑 선택과 새 SIWE를 확인한다. AI 입력별 승인·원천/수령인 서명·양측 지급 동의는 기존 단계 그대로다.

테스트: 안전 어휘/민감 필드 배제/저장 거부·오염, SDK 실제 번들, 기존 지갑/HTTP/서명 회귀를 확인한다. 최종 SHA와 CI 결과는 PR125 Checks에 기록하며 실제 로그인 성공은 별도 인수 조건이다.
