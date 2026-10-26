# S3 — 이의·정정·종료의 체인 반영

2026-10-26. PR115 병합 `dce9ab18c25f2eee288de9c7bde05209e24af430` 위의 별도 S3 변경이다. S4 근거 조회, web/PR60, 정책·예치 비율, 실제 로그인·증명·유료 AI·사용자 지갑·normal-host/CA·공개 체인은 범위 밖이다. V1/V2 Solidity 및 기존 r20/V31 기록을 변경하지 않는다.

## 접수와 반영

기존 `review-objections`, `objection-assessments`, `review-revalidations`, `termination-intents`의 POST 본문·권한·CSRF·CAS·멱등 키는 그대로다. 새 기록의 응답 target에 `chainStatus: NOT_OBSERVED`를 더한다. 접수 시점부터 미평가/유효 미해결 이의는 새 PREPARE/ACCEPT enqueue와 실행의 현재성 검사에서 거부한다. 이미 발급된 실행 capability도 원장 변경으로 현재성 검사를 통과하지 못한다.

새 GET `/bootcamp/v3/applications/:app/review-chain`과 `api.reviewChain(app)`은 현재 사용자 권한을 비동기 조회 전후 검사한다. `clear-bootcamp-review-chain.1`의 `status`는 `NOT_REQUESTED / PENDING / INCLUDED / REVERTED / REORGED`이며 `canonical`, `finalized:false`, checkpoint, operationId/transactionHash, 현재 version/epoch/decisionHash/revision/registrationSequence/recipient/이의 플래그, `matchesCurrentDecision`, `serverBlocked`, `acceptedRightPreserved`를 분리한다. `INCLUDED`는 등록 reader로 현재 체인과 저장 영수증의 canonical ancestry를 재검증한 결과다. DB 접수·완료 행만으로 반환하지 않는다. RPC 미확인·검사 실패는 오류이며 성공으로 대신하지 않는다. 재조직이 증명되면 기존 완료 행을 보존하고 `REORGED/canonical:false`를 반환한다. 최초 수락 이후 `claimExpiresAt:null`이다.

서버 접수와 체인 inclusion 사이에는 원자성이 없다. 접수 전에 전송한 ACCEPT가 먼저 포함되면 수락 권리가 생긴다. 접수 후 서버가 새 서명·송신을 거부해도 이미 외부로 나간 서명/거래를 회수할 수 없다. 반대로 observeCurrent/replaceTarget/terminate가 먼저 포함되면 version/epoch 및 preparedDigest 무효화로 이전 승인은 거부된다. 서버가 접수를 지연·누락하지 않는다는 보장이나 registrar 신뢰 제거, 외부 원천의 진실성에 대한 체인 자체 증명은 제공하지 않는다.

## 실행 경로

내부 `execution.planCorrection`은 등록 canonical reader를 직접 읽고 DB의 현재 판정·원천·이의 평가·재검증·종료 의도에서 OBSERVE/REPLACE/TERMINATE 명령을 만든다. 임의 calldata를 받는 HTTP는 없다. `correctionCommand`는 불변 intent의 제안 데이터이며, 기존 worker의 capability·키 사용·봉인·adopt·송신 경계마다 현재 DB/체인에서 다시 계산한 명령과 정확히 비교한다. registrar와 terminator 역할을 구분한다.

`executeReviewChainChange`는 기존 runtime lease 아래 한 명령을 enqueue→prepare→seal→adopt→dispatch→recover한다. 응답 유실/UNKNOWN은 기존 불변 intent·봉인 bytes의 복구 경로를 사용해야 한다. 새 operationId로 자동 재서명하지 않는다. 활성 normal worker는 동의 대기 중 이의/재검증/판정 변경을 발견하면 OBSERVE를 실행한 후 기존 대기를 차단한다. worker 중단/슬롯이 불명확한 경우 접수 자체가 체인 송신 완료를 보장하지 않는다. 별도 상시 daemon·장기 복구 서비스는 추가하지 않았다.

정정은 새 원천을 기존 API로 수락한 뒤 `registerCurrentMetForE4`로 새 decision opaque ID를 발급하고, 같은 신청/할당의 내부 `connection.bindDecision`에 연결한 다음 REPLACE를 실행한다. V2 정정만 허용하며 고정 수령인·최초 체인 등록순서는 유지한다. 이후 기존 publishReview→START_REVIEW→양측 새 동의→PREPARE→ACCEPT를 사용한다. 이전 consent scope·prepared payload·nonce·서명은 재사용할 수 없다. 새로운 epoch의 준비 nonce는 이전 준비와 분리하되 원천/서명/120초 확인/재검증 1회/최초 시작+600초 상한을 늘리지 않는다.

정정 후 funding/publication은 `TargetReplaced`의 transaction·receipt·event·블록 포함과 canonical ancestry, 현재 타깃을 대조한다. 메모리의 논리 ID 등록만으로 교체 성공을 만들지 않는다. 재검증 후 새 유효 오류는 OBSERVE로 terminalError를 반영한 다음 기존 termination-intents→TERMINATE를 사용한다. 종료는 예약을 해제하지만 단순 이의 관측은 해제하지 않는다.

평가 권한은 기존 assessment port를 그대로 따른다. 이 PR의 신규 callback은 합성 TEST에서만 주입할 수 있다. 실제 등록 원천 환경의 평가 authority/제품 UX를 새로 구현하거나 합성 평가를 실제 판정으로 표시하지 않는다. 준비된 평가 결과를 연결하는 S3와 실제 운영 평가 입력은 구분한다.

## 검증 경계

`tests/hackathon-test-vault/e5b/review-chain.test.mjs`는 새 격리 Geth V2와 실제 벽시계, 합성 사용자/원천으로 HTTP 접수→서버 차단→체인 반영→옛 서명 거부→평가 후 100 TEST, 정정/원래 등록순서/재게시/두 번째 오류 종료, ACCEPT 우선/고정 권리/중복 청구 거부, normal 동의 대기의 자동 OBSERVE를 검사한다. `tests/bootcamp-execution/corrections.test.mjs`는 UNKNOWN/REORGED·미반영 영수증·canonical 재검사와 서버 권한 거부를 오프라인 주입으로 검사한다. 실제 체인 재조직 primitive는 기존 E5 B retained-orphan 검사에서 별도로 검증한다.

첫 S3 벽시계 확장 실행은 2/3이었다. 종료 enum의 NONE(0)을 빼고 매핑한 오류로 terminate 봉인 단계가 거부됐으며, 이를 계약의 1/2/3과 일치시킨 후 3/3이 통과했다. 실패를 체인 완료로 집계하지 않았다. 최종 개수·커밋·CI는 이 문서의 후속 검증 기록 및 해당 PR/Issue106에 남긴다. 실제 사용자 제품 완주를 뜻하지 않는다.

4개 벽시계 시나리오를 묶은 다음 실행은 3/4였다. 신규 시험 helper가 기존 normal 실행기의 canonical clock 대기를 호출하지 않아 PREPARE의 issuedAt이 최신 블록보다 앞섰다(`BC_E5_CURRENT_FIRST_ACCEPT_TIME`). 기존 `waitForNormalChainTime`을 원래 authority/source/review cap으로 재사용하도록 시험 helper를 고쳤으며 제품 검사나 기한을 완화하지 않았다.
