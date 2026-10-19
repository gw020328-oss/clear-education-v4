# E5 B 정상 시연 작업 인계

현재 승인: 한 신청의 정상 E2E 실제 연결. 본부의 2026-10-19 직접 사용자 지시로 필요한 기존 담당 세션 간 협업은 허용되고 추가 기능·복구 확대는 첫 시연 이후다.

완료된 과거 작업: PR #36. 이를 현재 작업으로 재개하지 않는다.

작업 브랜치 `codex/bootcamp-e5-api-bridge`, 시작 HEAD `4dec3bd94ad786d2f1b52d00b5bfa1eab8f82ec0`. 기존 미커밋 B scope·private controller·원자 ledger·명령/current 연결과 시험을 보존하여 마무리한다. 4dec와 원본 실패 로그를 변경하지 않는다.

바로 다음: UUID v4 challenge 전용 검사 및 시험 설정 오류를 닫고, exact B 패킷의 등록→전액 배정→게시→양측 동의→prepare/accept→별도 claim을 단일 진입점으로 연결한다. source/current/lease/nonce/금액·수령인·중복 검사를 유지한다.

현재 B 연결은 합성 원천을 명시한 오프라인 단위이며 실제 signer/sender는 아직 차단이다. 실제 Moodle/HR/AI 관측 수락은 미연결이며 fixture 성공을 실제로 표시하지 않는다. 실제 source는 신청·지갑·mapping/request/lease가 고정된 뒤 새로 수집한다. 과거 source 보고서와 AI 평가 결과는 재사용하지 않는다.

기존 금고·DB·체인·키와 v1–v4 source pin 보존, 신규 격리 TEST만 허용. production/main/develop 자동 병합·배포 없음. 기존 정책 및 미확정 Mac 원인은 유지한다.
