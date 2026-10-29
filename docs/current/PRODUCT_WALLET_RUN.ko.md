# Privy 참가자·MetaMask 운영자 제품 연결 실행

2026-10-29. 로그인 확인 전용 호스트에서 두 역할의 SIWE 확인을 완료했다. 운영자는 사용자 스크린샷, 참가자는 사용자 완료 보고가 근거다. 이번 제품 체인·신청·증빙·지급은 새 실행이며 이 기록과 구분한다.

## 연결된 범위

- `src/embedded-wallet/product-panel.jsx`: 신청 생성/증빙 세션 시작, HR 원천 메시지 확인/직접 서명, 이번 회고 AI 승인, V2 고정 수령인 등록 내용 확인/서명/제출, 동일 판정 양측 동의와 철회, canonical 지급 영수증 조회.
- `product-session.mjs`: 기존 세션의 현재 주소/역할/체인 검사, 인증된 서버 bootstrap의 독립 source/runtime 문맥과 실제 승인 packet 비교. 참가자에게만 source 서명 문맥을 제공한다. 등록 제출 결과가 UNKNOWN이면 재서명·새 제출을 차단한다.
- 기존 normal-client, normal test-driver와 검토시간/자동 읽기 관문을 재사용한다. 자동 읽기는 GET만 실행한다. 지갑 로그인·서명·AI 승인·동의는 자동 실행하지 않는다. 제품 패널은 ACTIVE_LOCAL_TEST의 새 SIWE 이후 열린다.
- 제품 frontend mount는 검토된 공개 자산에 정확한 App ID marker가 있을 때만 켠다. OAuth top-level 문서 이동만 허용하고 인증/API의 동일 출처 검사는 유지한다. 제품의 두 역할 문서에만 nonce 기반 Privy CSP를 적용한다.
- 제품 HTTPS 포트+2의 읽기 전용 RPC는 생성 시 고정한 loopback Geth에만 전달한다. 정확한 Host/Origin, 요청/응답 크기·시간 상한을 검사하고 거래 제출·서명·계정·debug RPC를 거부한다. 실제 REGISTER/ACCEPT/CLAIM은 기존 서비스 실행기가 담당한다.

`tools/node tools/embedded-wallet/build-product.mjs`는 새 `var/embedded-wallet-products/product-*`에 자산을 만든다. normal-host의 `webRoot`와 자산 지문을 이 묶음으로 인수한다. 기존 onboarding 번들과 팀원 `web/`는 교체하지 않는다. 로컬의 사용자 주소/App ID/인증서/승인자 기록은 Git에 넣지 않는다.

## 실행 순서

1. Docker/Geth/Moodle의 고정 소스, 오늘의 공식 모델 가격, 기존 키 공급, 공개 자산 지문, 깨끗한 코드와 사용자 지정 비용 승인자 기록을 확인한다. 사용자는 이번 실행의 승인자를 운영자 MetaMask로 지정했다. 지정은 입력별 AI 호출 승인과 별개다.
2. 정상 실행기의 관리형 HackerRank Chrome 창에서 사용자가 본인 계정으로 로그인한다. 준비됐다는 사용자 확인 후에만 READY를 전달한다. 자격 증명·쿠키·원본 증명·키를 출력하거나 복사하지 않는다.
3. 준비된 새 체인/제품 origin이 열린 뒤 참가자는 `/onboarding`, 운영자는 별도 Chrome 프로필 `/operator`에서 주소·네트워크 확인과 새 SIWE를 진행한다. 인증 확인용 체인의 세션을 재사용하지 않는다.
4. 참가자가 새 신청을 만들고 이 신청의 증빙 확인을 시작한다. 원천 메시지를 읽고 서명한다. 사용자 자료는 원래 관리형 수집기/검증 경계를 따른다.
5. 양쪽 화면을 보이는 상태로 자동 읽기한다. 지정 운영자가 현재 회고 입력·모델·외부 전송·비용 안내를 확인하고 1회 승인한다. 코드/입력/기한/지정 지갑이 바뀌면 승인은 재사용하지 않는다.
6. 참가자가 별도 V2 수령 지갑 등록 내용을 읽고 공개 calldata 안내를 확인한 뒤 직접 서명·제출한다. 양측이 동일 최신 판정/수령 주소/100 TEST를 확인하고 각자 동의한다.
7. 서비스가 실제 제출한 canonical receipt/Transfer/잔액 증가 100000000 atoms와 중복 거부를 확인한다. INCLUDED/finalized=false를 최종 확정으로 표시하지 않는다. 양쪽 영수증 확인 전 FINISH를 전달하지 않는다.

## 검증과 제한

제품 HTTP/session 및 기존 지갑/실행기 회귀 164/164, 역할 제한 후속 12/12, 합성 메모리 지급 경계 48/48이 통과했다. 정확한 변경 파일 3개는 v40 source intake로 인수하고 v1–v39 기록을 보존한다. source intake 및 보존 검사 결과는 검증 JSON과 PR의 해당 HEAD를 따른다. 원본 191개 지문은 유지한다.

실제 HR 증빙/V2 서명/100 TEST 지급은 아직 미검증이다. 합성 시험과 계정 로그인 성공을 실제 지급 완료로 표시하지 않는다. SDK audit는 critical0/high17/moderate14(영향 패키지31)로 기존 경고가 남아 있으며 라이브러리를 강제 downgrade/major override하지 않았다. 이 제한을 포함해 Draft PR로 검토하고 자동 병합하지 않는다. 정상 지급 후 독립 청구·복구·자산 이동은 별도 후속이다.

## 실제 실행 시도 결과

최종 코드/운영자 승인자 기록으로 로컬 readiness의 차단 항목은 0개였다. 그러나 실제 실행은 로그인 callback 이전 `MANAGED_SOURCE`에서 `COLLECTION_FAILED`로 종료됐다. 별도 공개 연결 진단에서 DNS/TLS(444)는 정상이고 공식 `wss://attestor.reclaimprotocol.org:444/ws` WebSocket handshake는 HTTP403이었다. 서버의 거부 사유 자체는 확인되지 않았다. 로그인 창 준비·신청 생성·증빙 수집·AI 호출·지급은 완료되지 않았다. 기존 인증 확인 호스트는 유지했다. 실패한 한 번 실행 기록은 보존하고, 연결 문제가 해결된 뒤 새 실행 이름/현재 코드에 결합된 승인자 기록으로 준비한다. 403을 우회하거나 옛 증빙/권리/다른 RPC로 자동 대체하지 않는다.
