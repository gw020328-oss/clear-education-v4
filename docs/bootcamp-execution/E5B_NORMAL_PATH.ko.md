# E5 B 정상 시연 작업 인계

현재 승인: 한 신청의 정상 E2E 실제 연결. 본부의 2026-10-19 직접 사용자 지시로 필요한 기존 담당 세션 간 협업은 허용되고 추가 기능·복구 확대는 첫 시연 이후다.

완료된 과거 작업: PR #36. 이를 현재 작업으로 재개하지 않는다.

작업 브랜치 `codex/bootcamp-e5-api-bridge`, 시작 HEAD `4dec3bd94ad786d2f1b52d00b5bfa1eab8f82ec0`. 기존 미커밋 B scope·private controller·원자 ledger·명령/current 연결과 시험을 보존하여 마무리한다. 4dec와 원본 실패 로그를 변경하지 않는다.

바로 다음: UUID v4 challenge 전용 검사 및 시험 설정 오류를 닫고, exact B 패킷의 등록→전액 배정→게시→양측 동의→prepare/accept→별도 claim을 단일 진입점으로 연결한다. source/current/lease/nonce/금액·수령인·중복 검사를 유지한다.

현재 B 연결은 합성 원천을 명시한 오프라인 단위이며 실제 signer/sender는 아직 차단이다. 실제 Moodle/HR/AI 관측 수락은 미연결이며 fixture 성공을 실제로 표시하지 않는다. 실제 source는 신청·지갑·mapping/request/lease가 고정된 뒤 새로 수집한다. 과거 source 보고서와 AI 평가 결과는 재사용하지 않는다.

기존 금고·DB·체인·키와 v1–v4 source pin 보존, 신규 격리 TEST만 허용. production/main/develop 자동 병합·배포 없음. 기존 정책 및 미확정 Mac 원인은 유지한다.

## 2026-10-20 재개 확인

현재 branch는 `codex/bootcamp-e5-api-bridge`다. 첫 UUID/private witness 단위 `b109dfa` 이후 통합 a7, B a4, Moodle d3709a0, 정상 mapping/주소 수정 2be2737, E2 provenance 4d0f0b5, AI private result/최종 guard 1276b91을 이력으로 인수했다.

단일 실행 `./tools/node tools/bootcamp/normal-chain.mjs --synthetic-source`의 run3는 같은 인증 신청→합성4조건 MET→실제100TEST 전액 배정→양측 동의→제한서명·accept→별도claim→canonical receipt·정확100000000 atoms 수령·중복거부를 완료했다. [공개 검증 기록](normal-chain-verification.json)을 따른다. source는 SYNTHETIC_TEST_SOURCE이고 실제 Moodle·HR·AI 전체 연결 성공은 아니다. 성공한 환경은 재실행하지 않고 stopped/parked 상태로 보존했다. 코드의 정상 지급 부분을 `executeNormalPayment`로 추출하여 실제 원천 entry도 같은 순서를 사용하도록 준비한다.

`prepare-live-input.mjs`는 별도의 새 TEST identity/인증 신청·Moodle user3 mapping·custom mapping chain을 준비했으며 원천수집0·배정0다. 하루 중단으로 기존1800초 접수 window가 만료됐으므로 이를 연장하지 않는다. 실제 시작에서는 원래 입력/키/DB/체인과 기록을 보존하고 새 신청/current request/min lease만 발급한다. HR trust가 아직 UNCONFIGURED이므로 그 source mapping은 지급 활성화 근거가 아니다.

전용 `moodle-live-consumer.mjs`는 LOCAL_LMS_RECORD를 명시하고 실제 source owner getter→ACTUAL AI의 private live-result identity→최종 async fresh probe→동기 current/recheck/CAS를 결합한다. 기존 offline consumer는 유지한다. 새 유료호출은0이며 과거 평가 승인은 재사용하지 않는다. private brand가 없는 JSON/clone/offline 결과는 실제 AI 결과로 수락하지 않는다.

회귀453개 중452개가 통과했고 한 건은 E2 enum 변경에 따른 구정본SHA 직접비교였다. 구 v1핀은 보존하고 [새 delta](normal-consumer-source-delta.json)로 원본Git snapshot과 현재 owner변경 SHA를 각각 검증했다. 해당 수정·AI brand 검사16개, 추가 API/원자종료·현재성 회귀91개 통과. live consumer의 네트워크 모사는 시험용이며 실제 source 성공 건수에 합산하지 않는다.

남은 필수 입력은 fresh request-bound HackerRank pair/신뢰설정·새 실제 Moodle 자료·신규 단1회 AI 승인이다. 실제 원천 전체 연결과100TEST 정상 지급이 함께 확인되기 전에는 완료로 보고하지 않는다. 다음 유료 승인 질문은 코드와현재 원문 packet이 준비된 뒤 통합 소유자가 담당한다.
