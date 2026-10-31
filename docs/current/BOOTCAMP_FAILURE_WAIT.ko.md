# 정상 호스트 단계 실패 대기 — 2026-10-31

원천 수집·정확 AI 승인·지급 확인의 알려진 단계 오류는 `FAILED_WAITING`으로 전환한다. HTTPS 화면과 아직 유효한 인증을 유지하여 사용자가 상태와 지급 영수증을 읽을 수 있다. 모든 새 제품 POST는 `BC_NORMAL_FAILED_WAITING`/409로 거부한다. 화면과 공통 드라이버도 새 신청·원천 서명·AI 승인·수령 등록·동의/재전송을 차단한다. 로그아웃은 허용한다.

`GET /bootcamp/v4/session`의 `failure`는 고정 `status/phase/code/producerCode`, `writeAllowed:false`, `retryAllowed:false`, `outcome`, `nextAction:READ_STATUS_THEN_EXPLICIT_FINISH`, `automaticRetry:false`만 제공한다. 원문 예외·stack·입력·쿠키·키는 제공하지 않는다. 인증 TTL·회수·지갑/체인 일치 검사는 매 조회에 적용하며 실패 대기로 연장하지 않는다. 단계가 끝난 원천의 유효성은 보장하지 않는다.

실패 진입 시 source controller를 취소하고 준비 자료·게시 원천 lease·producer를 폐기한다. managed source callback을 반환하여 원천 브라우저·route·client를 닫고 프로필을 제거하고 commitment key를 비운 뒤 실패 대기를 알린다. 자체 공증자도 닫는다. 인증/UI는 이 정리와 별도로 남겨 두며 `FINISH`나 종료 신호·입력 종료 때 닫는다. 정리 오류·기반시설/보안 오류·분류하지 못한 최상위 오류는 전체 종료한다. 원래 승인·만료·호스트 1회 사용 표시는 재설정하지 않는다.

이 상태는 재개 엔진이 아니다. AI 또는 지급 처리 결과가 불명확하면 `UNKNOWN`이며 자동 호출·새 승인·재지급으로 해석하지 않는다. 알려진 source/검토 기한 만료도 새 원천 수집 없이 읽기 전용으로 대기한다. 읽기 요청 자체의 일시 오류는 전체 호스트 종료 사유로 바꾸지 않는다.

실제 관측에서는 HR 수집 이후 회고 단계에 `BC_PRODUCER_FAILED`가 보고되었다. 당시 하위 오류가 저장되지 않아 승인/코드 결합의 메타데이터 일치만 확인했고 정확한 AI 실패 원인은 미확정이다. 빈 AI journal은 외부 호출 0회의 증거가 아니다. 이번 변경은 실제 store의 `onCollectionFailure`를 연결하여 고정 하위 코드·단계와 최대 3개 원인 코드를 남긴다. 과거 실패를 소급 진단하거나 재실행하지 않았다.

검증은 합성 HTTPS의 양측 SIWE, 쓰기 차단, 지갑 불일치·인증 만료, 합성 AI 1회 후 중복 차단, 명시 종료, 호스트 합성 포트의 AI/지급 전후 소유권 유지, managed source 정리 및 준비 lease 취소/만료를 포함한다. 실제 사용자 로그인·새 증명·유료 모델 호출·체인 지급은 실행하지 않았다. 전체 실행 성공 또는 실제 AI 원인 수정 완료를 주장하지 않는다.
