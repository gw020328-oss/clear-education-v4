# 등록 원천 모드의 지급 준비와 봉인 전 시계 검사

2026-11-01. 기준은 PR131의 `a8d5f88f686d20091fe66845f1d6a51d199eebd0`이다. 기존 실행을 재개하거나 변경하지 않고 별도 작업본과 새 합성 체인에서 조사했다. 기존 실제 사용자 실행의 완료 여부와 이번 코드 검증은 별개다.

## 실제 실행을 읽기 전용으로 대조한 결과

- 저장 보고서는 `BIND_CONSENTS / PREPARE_AUTHORIZATION`, `NATIVE_ERROR / UNCLASSIFIED`로 중단됐다.
- DB의 `e3_prepared`는 0건이다. 양 역할 동의는 2건, 수령인 등록 서명 기록은 1건이다.
- 보존된 native envelope 4건과 보고서의 등록·배정·검토 시작·동의 반영 거래 해시 및 블록 checkpoint가 일치한다. 모두 당시 관측 `INCLUDED`, finalized=false다. 정지된 기존 체인을 다시 시작해 새 canonical 조회를 했다는 뜻은 아니다.
- 지급 서명 0, 거래 서명 4, broadcast 4다. PREPARE/ACCEPT/claim 및 실제 100 TEST 수령 완료 근거는 없다.
- 최초 검토 기한은 2026-11-01 16:39:15 KST였다. 현재 만료돼 같은 실행의 원천·AI 승인·동의·서명을 재사용해서 지급할 수 없다. 기존 체인/DB/기한/used/spent 기록은 변경하지 않았다. 새 실제 실행은 본부와 사용자가 다시 조율한다.

## 원인과 수정

`procedure.mjs`의 첫 검사에서는 ISOLATED_LIVE_TEST에 실제 시계를 사용했다. 그러나 준비 기록을 commit하기 직전의 두 번째 검사에는 항상 `{clock:()=>at}`를 넘겼다. 검사기는 REGISTERED_TEST_SOURCE에 주입한 시계를 의도적으로 거부한다. 따라서 `REAL_CLOCK_REQUIRED`가 발생하고 트랜잭션이 rollback된다. 기존 오류 분류에는 이 고정 코드가 없어 UNCLASSIFIED로만 남았다.

새 전체 시험은 수정 전 코드에서 등록→배정→검토→양측 동의 후 정확히 이 예외를 재현했다. 실제 기록의 단계를 비롯해 지급 서명 0/거래 4/준비 기록 rollback과 일치한다. 실제 당시 원래 예외는 저장되지 않았으므로, 실제 원인 식별은 코드와 동일 경로 재현에 근거한 판단이다.

최종 검사에도 초기 검사와 같은 모드 분기를 적용한다. 등록 원천은 검사기 자체의 `Date.now()`를 사용하고 합성 fixture만 시험용 시계를 주입한다. 실제 시계 강제, 원래 issuedAt/expiry/nonce, 원천·판정·동의·서명자·재원 검사는 유지한다. REAL_CLOCK_REQUIRED와 BC_E3_PREPARATION_STALE만 안전한 진단 코드 목록에 추가하며 원문 오류·stack·원천 본문을 저장하지 않는다.

수정 후 벽시계 리허설에서 별도의 `B_SEAL_REQUEST / BC_E5_CLOCK_CHANGED`도 관측했다. 봉인 의도 메타데이터 저장 중 초가 바뀌면 native sealing 전 단계가 중단됐다. 같은 savepoint에서 의도 기록은 한 번만 쓰고, 기존 service/runtime/lease/CAS/명령/최초 만료를 read-only 최종 검사한다. 기존 공통 validator의 최대 1회 순방향 재검사만 사용한다. 역행·두 번째 충돌·원천/권한 변경·만료에는 rollback하고 native sealing을 호출하지 않는다. 재봉인/재서명/재송신/기한 연장은 추가하지 않았다.

## 검증의 경계

새 `registered-product-payment.test.mjs`는 다음을 실제 모듈로 연결한다.

- ISOLATED_LIVE_TEST store, REGISTERED_TEST_SOURCE provenance와 실제 벽시계
- 등록된 live Moodle/Reclaim 소비자 및 원천/판정/nonce/동의 ledger
- 제품 HTTPS frontend-server의 허용 목록, HTTP 인증·CSRF, createSameOriginApi, product-session 등록 전후 checkpoint 조회와 서명 제출
- E4/E5 authority/controller, native 서명·봉인·relayer, 새로운 1초 블록 격리 Geth V2
- 등록→배정→검토→양 역할 동의→PREPARE→ACCEPT→별도 claim→canonical receipt/Transfer·100000000 atoms 잔액 증가·중복 청구 거부

시험에서 대체하는 것은 가상 Moodle API 응답, self Attestor의 합성 HackerRank HTTPS, AI HTTP 응답·가상 AI 승인, 새 시험 EOA의 사용자 서명이다. AI 요청은 전역 fetch 경계에서 고정 응답으로 차단하고 임시 가짜 키만 사용한다. managed AI의 바인딩/1회 journal과 live 결과 identity 검사는 실제 코드를 통과하지만 내부 ACTUAL/NATIVE_DEVELOPER 표시는 이 시험의 실제 유료 호출을 뜻하지 않는다. 실제 외부 AI 요청은 0건이다. Google/Privy/MetaMask UI 및 실제 사용자 지갑 재시험, 실제 기관 Moodle, 독립 공증 신뢰, finalized 확정, 공개 체인/상용 지급을 검증하지 않는다. normal-host의 사용자 대기/수집 bootstrap 전체를 브라우저로 실행한 시험도 아니다.

기존 `normalPaymentFixture` 기본은 SYNTHETIC_FIXTURE로 유지했다. 실제 Geth와 wallClock 옵션만으로 REGISTERED_TEST_SOURCE의 시계 금지 조건을 검사할 수 없었다. 새 모드는 live 생성자/실제 시계/제품 host를 함께 요구한다. 기존 보안 조건을 테스트 편의를 위해 완화하지 않았다.

`seal-request-clock.test.mjs`는 별도 fresh Geth에서 초 경계 2개 양성과 만료·service 철회·원천 철회·역행·두 번째 충돌 5개 음성을 검사한다. 성공 시 해당 의도와 native 서명/송신은 각각 1회, 거부 시 native 키 접근/서명/송신은 0회다. 이전 단계의 거래 수와 구분해서 검증한다.

## r20과 현재 V2의 차이

r20의 실행 HEAD `f38ae8bd44c9da2e27f6a56650ced0f7bffe9aba`는 V1 로컬100 TEST 기록이다. 당시 prepareReviewAuthorization에는 현재의 commit 직전 draft 재구축/재검사 observer가 없었다. 그 후 V2 작업 `e37cd70`에서 원래 발행 시각/만료를 보존하는 재검사가 추가됐으나 합성 시계 주입이 남았다. 현재 V2의 별도 수령인 등록 서명, Privy 제품 API와 checkpoint 조회도 r20의 완주 경로와 다르다. r20 성공은 보존하며 이번 후보의 실제 V2 성공으로 간주하지 않는다.

실행 명령과 결과는 [검증 기록](BOOTCAMP_LIVE_PREPARATION_CLOCK_VERIFICATION.json)에 기록한다. PR131은 Draft로 유지하고 병합/실제 재실행은 하지 않는다.
