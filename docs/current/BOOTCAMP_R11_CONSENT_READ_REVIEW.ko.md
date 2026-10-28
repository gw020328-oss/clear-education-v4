# r11 검토 시작 후 동의 대기 조회 검토

2026-10-24. 기준 HEAD `ffb999f5e1af802619c265908ab3b4fbeab72012`. 이 문서는 로그인·외부 네트워크·유료 AI·실제 거래 없이 수행한 원인 검토와 수정 기록이다. r11의 소비된 승인과 실행을 재사용하지 않는다.

## 실제 기록으로 확인한 범위

r11은 공식 HR account/certificate/pair 검증, Moodle 및 승인된 Gemini 1회 결과 수락을 마쳤다. 네 조건은 current MET였고 REGISTER, ALLOCATE, START_REVIEW는 INCLUDED였다. 마지막 실행 단계는 `AWAITING_AUTHENTICATED_APP_CONSENTS`다. 최초 고정 오류는 MANAGED_SOURCE의 `BC_VIEW_STALE`(진단 sequence 67), 외부 종료 코드는 `COLLECTION_FAILED`(68)이며 지급 완료는 false다.

종료된 store를 읽기 전용으로 조사한 결과 신청/판정 revision은 9, 판정은 MET, evidence head 네 개는 valid였다. 마지막 저장 시계 floor는 1792816889, 가장 이른 원천 만료는 1792816993으로 차이는 104초다. 동의 기록은 0개이며 E3 기록은 REGISTRATION_TARGET 1개와 E4_CHECKPOINT 1개다. 등록·공개 명령은 각각 한 번 완료됐고 OPERATION_FAILED metric은 없다. 인증 비밀·세션 digest·nonce·서명·proof·응답 원문은 조사하지 않았다.

이 사실은 최초 E3 등록 명령이 롤백된 r10과 다르다. r11은 등록과 검토 공개를 통과한 후 읽기 대기 중 실패했다. 과거 보고서의 `sourceStatus`/`allocationAtoms`는 초기 필드가 갱신되지 않은 값이므로 판정 근거로 쓰지 않았다. `realSourceVerified`, 포함된 단계, 실제 store/publication 기록으로 구분했다.

## 실패 경로와 남은 불확실성

v20의 동의 대기 callback은 `getOperationsProjection`으로 권한/현재성을 확인하고, chain snapshot을 갱신한 뒤 `getProcedure`를 읽는다. 두 동기 조회 모두 store의 `operations.access` 최종 검사에서 같은 초·같은 revision·같은 ledger를 요구한다. 초 경계에 걸린 조회는 결과를 반환하지 않고 `BC_VIEW_STALE`을 던진다. 대기 callback은 이를 처리하지 않아 `waitForExplicitConsents`와 managed source를 거쳐 전체 실행을 종료했다.

이미 `reviewTarget`이 저장됐으므로 최초 대상 조회는 완료됐다. 동의가 0개이므로 양측 동의 이후 최종 검사에는 도달할 수 없었다. 이 구간의 chain refresh와 heartbeat 및 동의 대상 검사의 오류 코드도 대조하면, 최초 예외가 발생할 수 있는 곳은 polling callback의 두 store 조회로 좁혀진다. 초기/마지막 tick과 조회 이름이 기존 진단에 없으므로 어느 조회의 어느 tick이 실제로 달라졌는지는 확정하지 못했다. 만료·revision 변경 기록이 없다는 사실과 아래 결정적 재현은 정상적인 초 경계 충돌 설명을 지지한다. 이것을 실제 tick 전부를 관측한 것으로 주장하지 않는다.

## 오프라인 재현과 최소 수정

원래 v20 callback에 실제 store/evaluator/procedure, 합성 원천과 chain port, 제어 시계를 연결했다. START_REVIEW 완료 후에 해당하는 current publication/full allocation 상태에서 각 조회의 첫 tick과 마지막 tick 사이에 1초만 진행시켰다. 두 경우 모두 `BC_VIEW_STALE`로 대기가 종료됐다. 이때 revision 9/MET/원천 잔여 99초/동의 0건이 그대로였다. 실제 체인 거래나 사용자 계정으로 재현하지 않았다.

새 `waitForNormalReviewConsents`는 기존 읽기 전용 `readNormalView`를 이 인계 구간에 적용한다. 대상 확정, polling 전 권한 조회, chain refresh 후 procedure 조회, 양측 동의 후 최종 조회에서 정확한 store RuleError `BC_VIEW_STALE`이 발생하면 실패 결과를 버리고 한 번 새 동기 조회를 수행한다. 두 번째 충돌은 그대로 실패한다. 처음 수집한 신청/판정 revision/hash와 최초 동의 대상이 일치해야 하며, 이후에는 그 고정 reviewTarget을 기존 검사로 계속 대조한다.

chain refresh, 사용자 동의 명령, 서명, 체인 쓰기, AI는 재시도하지 않는다. 과거 view를 반환하거나 오류를 성공으로 바꾸지 않는다. fresh read는 인증·지갑·원천·현재성·port 검사를 다시 통과해야 한다. 동의 두 건은 각 사용자 조작에서만 생기며, 합성 시험에서도 대기 코드 밖의 두 별도 명령으로 기록한다.

24개 회귀는 최초 대상/첫·후속 polling의 두 조회/최종 검사 초 경계, 연속 충돌, 실제 원천 만료·변경, logout·지갑 변경·시계 역행·자금 변경, 옛 판정/동의의 재사용, stale CAS/hash와 동의 쓰기 충돌, await 오류·취소, 5초 snapshot 갱신을 검사한다. 원래 source/review deadline, 고정 100 TEST, 수령인, 명시적 양측 동의, 중복·자금·지급 경계를 유지한다. 상세 최종 검사 수와 소스 지문은 `BOOTCAMP_V21_VERIFICATION.json`을 따른다.

## 보존과 다음 실제 시험

기존 r5~r10 기록과 r11 승인·소비 journal·전역 신청/승인 소비 기록, 이전 소스 세대 및 안전 검증 자료 143개의 기준 hash를 대조한다. proof SDK/crypto/전송·프론트·Windows·예치 정책은 수정하지 않는다. 이번 작업에는 새 호스트·CA·로그인·proof·유료 호출·실제 서명·지급이 없다.

최종 HEAD CI 완료 후 본부의 별도 재시험 지시를 기다린다. 다음 실제 시험은 새 신청과 새 exact AI 승인, 같은 최신 판정에 대한 실제 양측 동의가 필요하다. 이미 소비된 r10/r11 승인이나 journal을 초기화·교체하여 재시도하지 않는다.
