# r10 현재성 충돌 분석과 등록 전이 보정

2026-10-24. 기준 HEAD `03f8d157043fa1b1d004d5ef9d645a5767a26ffe`의 실제 r10 기록을 읽기 전용으로 조사했다. 새 로그인·증명·AI·체인 실행은 하지 않았다. 실제 account 응답, proof, 쿠키, 서명, nonce, 세션 비밀값은 조회하지 않았다.

## 확인한 실패 위치와 조건

- r10은 HR account/certificate/pair 공식 검증과 네 원천 조건 MET를 완료했다. 유료 AI는 승인된 한 번으로 이미 소비됐으며 재사용하지 않는다.
- 마지막 성공한 수락은 UTC epoch `1792778177`, application/decision revision은 모두 9다. 네 request는 CONSUMED, 네 evidence head는 valid=1, invalidation event는 0건이다.
- 실패 metric sequence 40의 `OPERATION_FAILED`는 UTC ms `1792778179000`부터 `1792778179007`까지다. 공개 신청/지갑, 고정 route `e3-register-target`, 실행기 key ordinal 9로 계산한 operation ID가 실제 실패 metric의 ID와 일치한다. 따라서 실패는 조회 일반이나 사용자 동의가 아니라 최초 내부 E3 등록 명령이다.
- E3 record/opaque ID/procedure는 모두 0건이다. 지급 intent/receipt/settlement/completion도 0건이다. 등록 명령의 `checkTarget`을 지난 후 실패했으므로 최초 호출의 revision/ledger/decision CAS가 오래된 것은 아니다.
- 보존된 clock floor는 `1792778179`. 원천별 exclusive lease 종료는 HR `1792778812`, 활동 `1792778203`, 과제 `1792778206`, 회고 `1792778207`이다. 최초 만료까지 24초 남았고, 철회·만료·판정 변경 기록은 없다.
- `operations.access`는 명령 전 tick과 최종 tick의 **초 값까지 같아야** 성공시킨다. 실제 시각/metric, 등록 실패의 정확한 ID, 변경 없는 revision/원장 및 동일 코드 경로를 대조하면 등록 transaction의 초 경계 통과가 남는 실패 조건이다. 최초 tick 값 자체는 기존 진단에 없으므로 기록에서 읽은 값으로 꾸미지 않는다. 고정 시계로 같은 조건을 만들면 원래 v18 등록 코드에서 `BC_VIEW_STALE`이 결정적으로 재현된다.

후속 외곽 `MANAGED_SOURCE/BC_VIEW_STALE` → `COLLECTION_FAILED`는 이 등록 예외의 전파다. AI 승인 만료나 사용자의 화면 조작을 원인으로 기록하지 않는다. wall clock은 현재성 검사를, monotonic metric은 구간 측정을 담당하며 두 시계를 서로 대체하지 않았다.

## 수정 범위와 권한 검토

`register-target` 내부 명령만, 첫 시도가 **시각 전진만으로** 실패한 경우 최대 한 번 재검증한다. 시도 중 revision/ledger가 그대로이고, savepoint 롤백 뒤에도 최초 revision/ledger가 보존된 경우에만 새 transaction을 시작한다. 기존 body의 expected revision/ledger와 decision ID/revision/hash, 동일 멱등키를 유지한다. 매 시도는 인증·역할·원천/lease·chain/funding port를 다시 읽고 기존 모든 최종 검사를 통과해야 한다. 두 번째 충돌은 그대로 실패한다. 처음 시도의 ID/record/command/성공 metric은 롤백되며 외부 전송은 없다.

정상 실행의 지정된 읽기에서만 정확한 `RuleError('BC_VIEW_STALE')`를 만나면 실패한 projection을 버리고 한 번 새로 읽는다. 과거 snapshot을 반환하지 않는다. collection·AI·동의·체인 전송은 이 읽기 함수로 감싸지 않는다. 기존 UI 서명 대기와 일반 store 조회 계약도 보존한다.

네 조건 충족 시 확정한 application revision·policy/mapping·decision ID/revision/hash를 지급 준비에 전달하고, 등록 직전 및 후속 내부 명령 body를 만들 때 대조한다. 원천이나 판정이 바뀌면 새로운 대상에 묵시적으로 동의하지 않고 중단한다. 수령인은 기존 participant와 같아야 한다. 실제 두 역할의 동의 명령에는 자동 재시도를 적용하지 않는다.

SDK/crypto/STWO/전송, 증명·서명·요청 결합, 소비된 AI journal, 민감정보 수명, 원천/lease 만료, 동의 범위, 100 TEST, 자금·서명·지급 계약은 변경하지 않았다. 기존 BC_VIEW_STALE 검사 자체나 CAS/hash 검사를 삭제하지 않았다. 변경된 코드의 자금 경계는 **E3 등록 준비와 정확한 원천 대상 인계**이며, E5 송신·수락권리·claim 구현은 그대로다.

## 오프라인 검증과 다음 실제 시험

회귀시험은 실제 store/evaluator/procedure와 인공 원천·고정 시계를 사용한다. 원래 v18의 초 경계 실패를 확인한 뒤, 정상 단일 등록, 두 번째 충돌 중단, 실제 만료/정확한 E3 cutoff/원천 변경/시계 역행/롤백 중 만료/로그아웃, stale CAS·decision, port 변경, 멱등 재실행과 중복 원천·회고 소비 없음, 사용자 동의 자동 재시도 없음, 읽기 재취득 한도를 검증한다. 최종 실행 수와 CI HEAD는 `BOOTCAMP_V19_VERIFICATION.json` 및 PR #102의 해당 HEAD 결과를 따른다.

이 보정은 새 실제 정상 실행의 성공을 주장하지 않는다. 다음에는 새 신청·새 승인된 exact AI 입력·양측 지급 동의로 E3 등록부터 이후 절차와 최종 영수증을 확인해야 한다. r10의 가장 이른 원천 lease 잔여 24초는 당시 값이며, 다음 실행의 충분한 동의 시간을 보장하지 않는다. 만료 시 기존 거부 정책을 유지한다. 이번 작업에서는 실제 호스트나 재시험을 자동 시작하지 않는다.
