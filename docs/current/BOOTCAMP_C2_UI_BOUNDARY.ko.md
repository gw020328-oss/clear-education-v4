# C2 외부 지갑·원천 서명 경계 (2026-10-22)

요청 검토 설정은 GPT-6 Astra / High이며 실제 런타임 모델 ID는 독립 확인하지 않았다. HR producer `e658b4026b44f800b607d2d7db64e14f3fd81666`의 동일 TLS worker/최종 proof/private lease 경계를 소스에서 검토했다. 실제 hosted 응답 및 context 증명 성공은 미확인이다.

실제 정상 경로는 `prepareLiveInput({hackerRankPins,uiIdentity:{participantWallet,operatorWallet,origin}})`의 새 입력 `.2`만 소비한다. 이는 모든 원천·승인 준비 후 호출할 호스트 API다. 이번 검증에서는 호출하지 않았다. 공개 주소 두 개를 고정하고 참여자/운영자 키를 생성·읽기·저장하지 않으며 신청도 생성하지 않는다. `.1`의 과거 준비 파일·키·DB는 보존하지만 실제 경로에서 사용할 수 없다. 실제 실행의 금고 역할 키는 기존 격리 TEST 환경 소유이며 참여자 지갑과 별개다.

`openLiveContext`는 기존 인증/저장소에 연결된 `createFrontend({tls,webRoot})`를 제공한다. 브라우저에서 기존 `/auth/nonce`, `/auth/verify`, `/bootcamp/v1/applications`를 사용한 뒤 아래 두 경로만 추가로 사용한다. Origin, HTTPS loopback, Secure HttpOnly 세션 쿠키, 지갑/체인 헤더와 쓰기 CSRF는 기존 HTTP 검사를 그대로 통과해야 한다.

| 경로 | 본문·결과 |
| --- | --- |
| POST `/bootcamp/v4/applications/:id/source-session` | 빈 객체. 참여자 본인의 활성 신청과 원래 인증 세션을 1회 결합한다. |
| GET 같은 접두사의 `/source-signature` | 참여자 원래 세션에만 서버가 발급한 정확한 P1 원천 관찰 승인 메시지·해시·만료를 반환한다. |
| POST 같은 `/source-signature` | `{approvalId,signature}`만 받으며 고정 참여자 지갑의 메시지 서명을 검증한다. 메시지·request·owner·정책·mapping 교체를 받지 않는다. |

호스트는 같은 관리형 HR callback 수명 안에서 `collectSources`를 실행한다. P1의 `signRequest`는 위 브라우저 서명을 기다리며 서버 TEST 지갑 서명 fallback이 없다. 서명 대기는 원래 request 만료와 최대 300초 중 먼저 도래하는 시각에 종료한다. 로그아웃·신청 상태 변경·취소 시 대기를 종료하며 원래 세션을 새 로그인으로 대체하지 않는다. 참여자와 운영자는 별도 쿠키 저장소/브라우저 프로필로 로그인해야 한다. 같은 쿠키에서 재로그인하면 기존 세션이 폐기될 수 있다.

HR 소비자는 genuine collector lease의 private brand·request/nonce/신청/지갑/trust 결합을 먼저 검사하고 `.3`의 고정 worker recipe 및 책임 표시를 재검사한다. 전체 숨긴 JSON 구조는 관리형 worker 검사, 공개 필드와 서명은 Attestor 검증이다. Attestor 단독의 전체 구조 증명이나 독립 구조 검증으로 표시하지 않는다. 기존 `.1`/`.2` recipe와 합성 lease는 실제 수신 대상이 아니다.

`pay()`는 같은 current MET/전액 100 TEST 할당과 기존 발행 절차 후 실제 참여자·운영자가 같은 대상에 저장한 동의 두 건을 기다린다. 120초 경과는 상대 동의를 대체하지 않는다. worker heartbeat는 원래 검토 cap/원천 만료를 늘리지 않는다. 실제 경로는 1회 지급 시작만 허용한다. 합성 자동 역할 동의는 명시적 synthetic driver에만 남는다. 서명 승인 응답은 지급 승인이 아니다.

로컬 네트워크 차단 검증: `ui-session`, `ui-session-http`, `explicit-consents`, `live-context`, `reclaim-live`, 기존 `normal-frontend`, `http` 총 34/34 PASS. 로그아웃 뒤 추가 요청 없이 서명 대기 취소, 타 역할·타 세션·타 지갑·재사용·만료·Origin/CSRF/본문 바꿔치기 거부를 포함한다. 첫 UI broker 시험에서 발견한 로그아웃 대기 취소 결함과 중단 로그는 `/tmp/clear-ui-session-first.tap`에 보존하고 수정했다.

이번 단위 실제 신청/realm 생성·로그인·registry·원천 수집·AI 호출·체인 거래는 모두 0이다. canonical 지급 receipt의 HTTP 조회와 브라우저 동작 연결은 다음 일반 연결 항목이다. 현재 config의 `executionReceiptHttpImplemented`는 계속 false이고, 실제 통합 완료를 주장하지 않는다. `web/`는 편집하지 않았다.
