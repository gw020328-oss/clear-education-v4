# Moodle 업무 UI 연결 후보 0.1.17

C 기준 `0be77a780332fd588a69e69efc2b7e934f470d58`, A 계약
`d9b38798a1224db9e9466025dbedb0631527f2ef`. 실제 사용자 적용은 본부 판정 뒤에 진행한다.
업무 버튼은 기존 Moodle 화면의 단계별 영역에 있으며, 현재 마운트의 검증된 CONNECTED 역할과
A의 `validateNativeWorkflowCommand`, `handle.runWorkflow`가 모두 있어야 동작한다.
기존 지갑 취소·로그아웃은 해당 업무를 종료한다.

| 명시 동작 | 입력 | 반환값과 다음 단계 |
| --- | --- | --- |
| read-session | action | 세션 역할·원천 연결 신청 ID·회고 승인 정보 |
| create-application | idempotencyKey | 신청 ID와 작업 ID 보존, 원천 연결과 결과 조회 |
| read-application | applicationId | 현재 결정·금액·조건·동의 검토, 동의 입력 원본 |
| bind-source-session | applicationId | 같은 신청의 원천 연결 확인, 원천 메시지·등록 조회 |
| read-source-signature | applicationId | 서명 메시지와 기한을 표시하고 검토 원본 보존 |
| approve-source-signature | reviewed | approvalId·requestHash가 일치하는 수락 결과 |
| read-registration | action | 현재 참가자 신청의 공개 등록 packet 검토 |
| approve-registration | reviewed | 해당 신청의 procedure operation 결과 |
| approve-reflection | reviewed, idempotencyKey | 현재 자격·정확한 입력 식별·모델·비용 표시, 별도 확인 체크 뒤 승인 기록 |
| consent | reviewed, value, idempotencyKey | 표시한 결정에 AGREE 또는 WITHDRAW, procedure operation 결과 |
| payment-receipt | applicationId | canonical 포함과 100 TEST 정확 수령을 함께 확인한 경우만 수령 표시, finalized는 응답 사실 사용 |
| decision-evidence | applicationId | 기존 manifest·hash·limitations 표시 |
| read-operation | applicationId, operationId, kind | 같은 ID의 기존 application/procedure 기록 조회 |

검토 객체는 원본을 바꾸지 않고 명시 승인에 넘긴다. 표시 영역은 textContent를 사용한다.
작업 중 중복 클릭을 막고, 연결 종료 후 늦은 결과와 검토 데이터를 버린다. 쓰기 실패 또는
취소 뒤 불명확한 결과는 마운트가 살아 있는 동안 별도 상태로 유지하며 쓰기를 막는다.
아는 operationId로만 결과를 조회한다. null 원천 연결은 신청 부재의 증거가 아니며
생성 UNKNOWN을 해소하지 않는다. 이 latch의 범위는 현재 마운트다. 페이지 새로고침·새 탭
이후의 UNKNOWN 복구는 durable 조회 계약이 필요하다.

포트는 기존 A client 및 signer가 소유한다. 회고 승인 버튼은 비용 검토와 체크 후에 승인
기록만 요청한다. 유료 모델 실행은 별도의 사용자 승인 경계에 있다.
격리 검사는 배포 AMD와 A 입력 validator를 사용하고 DOM과 A 결과를 합성한다.
