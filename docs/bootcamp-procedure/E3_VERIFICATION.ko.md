# E3 검증 기록

2026-10-19. E1 `6b4b0cf2d847937aebc6da69f9e7df62e926fa50` 위 새 후속 브랜치에서 E2 `d9407b06b8a13122a489193119c1899929f83fe4`와 E0 `67c7bc8450484fb4d5545c6e36a672e497467174`를 normal merge했다. E1 원격 head는 보존한다. 작업 단위 요청·추천 Sol/High, 실제 런타임 모델은 독립 확인하지 않았다.

시험은 외부 네트워크 guard 아래 공개 합성 입력·새 임시 DB·인공 지갑·명시 SYNTHETIC_PORT_FIXTURE만 쓴다. 실제 source 수락/배정/지급승인 서명/payment은0건이다. 로그인·합성 source의 임시 서명과 지급 signer 권한은 다르다. `.3` hash/EVM probe 인수와 실제 자금 거래를 구분한다.

## 구현 중 발견·반영한 경계

- 최초 새 allocation ID 강제안은 E4의 stable allocation/한 의무·예약 보존과 충돌하여 제거했다. exact from/to target·증가 epoch/version receipt를 소비한다.
- publication epoch/version을 최신값으로 고정하면 정상 startReview/bindConsents/observe 이후 교체가 막혀 baseline 이상·현재 snapshot exact match·단조 checkpoint로 수정했다. historical receipt의 current 덮어쓰기는 거부한다.
- cap 전 CANCELLED를 새 종료 사유로 취급한 안을 제거했다. 최초 accept는 즉시 차단하되 승인된 종료조건 전에는 INVALIDATED_WAIT_FOR_TERMINATION_CONDITION이다.
- E2 exclusive source cutoff를 view에도 적용해 v1의 age300 inclusive history와 E3 처리 가능 시각을 구분했다.
- 실패 명령의 prepared nonce/성공 metric은 rollback하고 관측 invalidation/failure event는 보존한다.

| 검사 | 최종 로컬 결과 |
| --- | --- |
| guarded workflow + application | **592/592 PASS**. E1 111개·새 E3 47개·E2 .3 및 기존 회귀 포함 |
| E3 시간/절차·동의/이의·교체/영속·bootstrap·HTTP·복구·artifact | **47개 PASS**(위 592개에 포함, 중복 합산하지 않음) |
| process 장애 | E3 6지점 SIGKILL 후 procedure/count/prepared nonce/metric 무부분 상태 및 재시도. 인증된 독립 두 process의 same-sequence 동의 경쟁 1승/새 CAS 재시도 |
| migration | 고정 E1 store/ops/ledger/model 코드의 새 임시 DB에서 schema/guard 두 지점 실패 rollback, v1/R2 history bytes 유지, 성공 뒤 old writer 거부/reopen |
| E2 인수·예제 | 고정 type/source SHA, 독립 canonical/SHA 앱 동의 recipe, TypedDataEncoder .3 digest 일치. E2 pure hash probe 1개 메모리 배포·90 pure calls·external RPC/지급 거래0 |
| 보존·의존성 | verify:workspace/verify:dependencies PASS. 원본191/reference4/profile3 및 고정 graph, 메모리 compile·실제 배포/기존 chain 시작 없음 |
| 경계·정적 검사 | E2 owner source·E0 specs/docs/current·producer·contracts/web/root package/CI 자체 diff 없음. 소유 문서 링크/diff whitespace PASS |

중간 회귀 592개에서 metric factory 시험의 cleanup hook 하나가 임시 디렉터리 삭제 뒤 writer marker를 쓰려고 해 실패했다. 제품 경로가 아닌 fixture 정리 순서였으며 marker를 test-body finally에서 복구하도록 바꿔 최종592개를 다시 실행했다. 의미 없는 재실행으로 성공을 골라 기록하지 않았다.

구현 시작 기준 merge head는 `1a5b34f73a34e5c83876b972069f978df35dde00`이다. 마지막 합성 artifact의 필드명을 지급 승인 서명으로 명확히 하고 다시 생성한 뒤 artifact 전용2개도 PASS했다. 원격 최종 구현 head와 CI는 PR 본문에 기록한다. 상세 E4 proposal/화면 handoff와 미구현은 [E3_IMPLEMENTATION.ko.md](E3_IMPLEMENTATION.ko.md)를 따른다.

소유 변경은21개 파일이며 `src/bootcamp`·전용 tests/docs와 기존 metric fixture writer marker의 복구 범위다. CI source 변경 없이 기존 guarded workflow glob이 E3 wrapper를 발견한다. E0/E2 입력은 history merge이며 전용 owner 파일에 자체 수정이 없다. 공개 이력 scanner는 push 전 구현 및 최종 문서 head에 실행한다. 자동 scanner만으로 민감정보 부재를 단정하지 않으며, 실제 원문/claim/cookie/사용자 키는 읽거나 fixture/문서에 추가하지 않았다. 기존 금고/DB/chain/keys를 열거나 reset하지 않았다.

push 전 scanner가 합성 예제의 `serverSnapshotHashes.authorization`이라는 키에 연결된 공개 hash를 COOKIE_LITERAL로 분류했다. 값은 서버 port snapshot의 SHA256 commitment이며 cookie/header/token이 아니다. 규칙을 완화하지 않고 키를 `authorizationPort`로 명확히 했다. 두 자체 미공개 로컬 commit만 보존된 변경 상태로 재구성하여 해당 옛 blob을 공개 도달 이력에 넣지 않았다. PR84/85와 원격 이력은 수정/강제 push하지 않았다.
