# P1 직접 보안 코드 리뷰

2026-10-17. 요청 범위의 signer/participant/owner/request/nonce/expiry/same-record 경계를 주 세션에서 직접 검토했다. 요청 Astra/High, 실제 런타임 적용 독립 확인 없음. 별도 사람 승인·독립 보안 감사는 아니다. 실제 개인 proof는 검토 자료로 사용하지 않았다.

## 검토한 경계와 조치

| 경계 | 확인 및 수정 |
| --- | --- |
| 참가자와 claim owner 혼동 | 별도 참가자 EIP-191 승인에 expectedClaimOwner 포함. 둘이 다른 정상 사례를 시험. owner의 서명으로 참가자 승인을 대체하면 거부 |
| unsigned request wrapper | 각 attestor-signed context의 request/role/recipe hash 요구. 필드 미제공은 UNKNOWN, 외부 wrapper는 shape 거부. 새 nonce/다른 참가자로 재서명한 요청에 옛 proof 재사용도 거부 |
| 신뢰 설정/원천 대체 | factory 소유의 signer/epoch/window/recipe 전체 snapshot, request에 trustConfigHash까지 pin. OBSERVED/UNCONFIGURED는 BLOCKED. 합성 recipe를 review label만 바꿔 실제 모드로 승격하는 것은 거부 |
| first item 및 필드 혼합 | signed records를 한 번 파싱, 모든 row의 username과 고유 certificate ID 검사. 한 row의 이름/status를 함께 판단. 여러 Python 후보는 명시 선택 또는 AMBIGUOUS. passed SQL + failed Python을 합격으로 합치지 않음 |
| 서명된 JSON의 해석 차이 | escaped duplicate key, unsafe object key, 과도한 깊이/크기/노드, 비정수 JSON 수 거부. claim context의 의미상 같은 공백은 stable proof hash를 유지. 실제 signatures/identifier 검사를 생략하지 않음 |
| 시간과 async 변경 | request 900초 이하/expiry exclusive, 두 signed proof의 request 이후/미래/age 검사. await 전 snapshot, await 후 clock/trust/expiry 재검사. acquiredAt/verifiedAt/achievementAt 구분 |
| receipt 위조·재사용 | 자기 해시만 있는 JSON을 인증으로 사용하지 않음. recheck는 factory가 발급한 원래 객체만 허용하고 정확한 expected request·현재시간 검사. 동일 nonce의 글로벌 소비는 하지 않으며 재시작 반례를 보존 |
| 개인정보 | username/certificate/claim owner는 keyed commitment, raw proof/서명/nonce는 output에 없음. 고정 오류 코드만 반환. 실제 raw/key 파일 복사·로그 없음. HMAC key 보관/rotation·실제 collector 메모리/원문 수명은 미완료 |
| SDK 추출 semantics | 첫 synthetic regex는 헤더를 포함하는 SDK 응답 형식에 맞지 않아 시험 실패. 명시 HTTP body 경계/끝을 허용하도록 수정 후 공식 SDK 추출 시험 성공. 실제 사이트 recipe 적합성으로 확대하지 않음 |
| 빈 추출의 context 잔존 | 고정 upstream은 추출 결과가 없으면 client extractedParameters를 유지할 수 있음. 본 합성 regex의 필수 named capture를 SDK로 시험하고 capture 누락/invert를 거부. 임의 새 live regex의 모든 경로가 필수 capture를 생성하는지는 문자열 검사만으로 보증하지 않으므로 실제 recipe 승인 필수 관문으로 유지 |

## 결과와 공개 범위

오프라인 합성에서는 두 SDK 서명/participant 승인·필드/원천/요청 변조·만료·모호성 거부 및 P0 호환성을 확인했다. 정상 승인도 candidate이며 지급/영속 수락 권한이 없다. `sourceStatus=MOCK_VERIFIED`와 실제 cryptography 시험 결과를 분리한다. 실제 인증된 HackerRank dashboard/다중 certificate body·공식 signer/request context 검증 수는 0이다.

서버 caller가 trustConfig와 expectedRequest를 브라우저 body에서 그대로 채우면 이 라이브러리의 신뢰 경계를 위반한다. 신규 API/DB owner가 이를 강제하고 current trust/mapping/participant 권한·만료·nonce 소비/evidence 기록을 같은 transaction에서 처리해야 한다. serialized receipt의 self-hash는 producer 인증이 아니며 transaction/CAS·restart 인수는 이 PR에서 완료하지 않았다.

P0 기준 외 공통 파일 및 기존 YBM 연구는 변경하지 않았다. 새 prefix lockfile은 기존 SDK 의존성 graph를 고정 복제했으며 root/global 변경 없이 별도 fresh npm ci(ignore-scripts)로 확인했다. 정확 HEAD·검사 수·CI 분모는 verification.json과 Draft PR 본문에 기록한다. 운영 신뢰/실제 수집/새 지급 권한을 활성화하지 않았다.


## PR 정리 전 재검토

2026-10-17 동일 미커밋 구현을 이어서 입력·신뢰·same-record·양쪽 signed context·참가자 승인·nonce/만료를 다시 읽었다. 추가 런타임 결함은 발견하지 않았다. 공통 담당 인수를 위해 서명 없는 고정 hash 벡터와 오류 매핑을 추가했다. SDK에서 필수 named group을 포함한 regex라도 다른 분기로 성공하면 추출이 비는 반례를 실제 provider 실행으로 확인했다. 이 성공 서명을 안전한 원천 의미로 승격하지 않는 live recipe 관문은 유지한다. 전용82 + P0 20 = 102 PASS, 0 FAIL. 기존 별도 설치와 workspace 보존 PASS를 재사용하며 불필요한 실제 수집·고비용 반복을 하지 않았다.
