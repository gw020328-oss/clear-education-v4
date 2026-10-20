# 첫 정상 TEST 연결의 mapping·주소 표현 수정

2026-10-19. PR100 최종 `a4a05c7`(CI 9/9 SUCCESS, 제품 `9607f47`)는 해당 브랜치에 보존한다. 이 후속은 API 담당이 실제 연결에서 발견한 두 공백만 고친다. 기존 환경·키·DB·거래를 재사용하거나 이전 observation/hash를 변환하지 않는다.

- 새 `createEnvironment({runtimeMappingHash})`가 서버에서 승인한 nonzero lowercase bytes32를 받는다. 생략하면 기존 DEFAULT_MAPPING_HASH가 유지된다. 잘못된 값은 디렉터리·키·체인 생성 전에 거부하며, 배포한 계약 getter와 manifest가 같은 값을 갖는지 확인한다. 해시 형식 검사는 Moodle/참가자 mapping의 내용 승인이 아니다. 그 등록·승인은 API 소유다.
- ethers ABI 결과의 application.recipient 및 acceptedRight.recipient/token을 원천 reader에서 lowercase로 정규화한 후 businessHash와 private witness를 만든다. 주소의 20바이트 값은 바뀌지 않는다. API가 관측 후 해시를 다시 만들거나 일반 주소 guard를 완화하지 않는다. 기존 서명·envelope는 새 해시로 재해석하지 않고 새 격리 환경에서 실행한다.

회귀 명령: `./tools/node --test tests/hackathon-test-vault/e5/normal-mapping.test.mjs`. 실제 새 Geth에서 임의 mapping 배포/readback, 틀린 manifest mapping 거부, prepare/accept/claim, canonical observation hash와 세 주소 형식, 정확 100000000 atoms 잔액 증가를 확인한다. 자료/동의는 시험 fixture이므로 실제 Moodle·HackerRank·AI 연결 성공은 아니다.

직접 리뷰: 입력 검증은 부작용보다 앞서며 원래 기본값과 runtime version, chain/contract/signer/nonce/current/금액·수령인 검증을 유지한다. 주소 변환은 ABI address 세 필드에 한정하며 다른 문자열·hash를 변환하지 않는다. 원래 A/service intake 및 B source-pins v1/v2는 변경하지 않는다. `normal-source-pins.json`은 두 소스와 이에 필요한 보존 검사 두 파일의 정확한 before/after를 기록한다. 새 wire 프로토콜이나 기존 환경 마이그레이션이 아니다.

실제 API 전체 정상 지급과 실제 원천 인수는 API/통합 담당이 이 후속을 명시 반영한 뒤 새 환경에서 확인한다. 자동 merge·상용 배포는 하지 않는다.

로컬 결과: 새 mapping/주소 정상 시험 2/2 PASS(9.9초), 기존 B 전 범위 20/20 PASS(125.8초), 정확한 원본/예외 지문 검사 PASS. fail/cancelled/skipped 모두 0. 직접 코드 리뷰에서 추가 결함은 발견하지 않았다. 새 실제 API 재실행은 이 기록에 포함하지 않는다.

## 실제 원천 TEST snapshot 표시

API가 등록·검증한 실제 원천을 SYNTHETIC_EXAMPLE로 표시하지 않도록 E2 `test-encoding-v3.mjs`에 정확 `REGISTERED_TEST_SOURCE` provenance를 추가한다. 실제 provenance는 기존 REAL_CLOCK_REQUIRED를 그대로 적용하여 caller clock 주입을 거부한다. API procedure/current의 두 검사에서 이 provenance만 wall clock으로 검사하며 source/chain checkpoint/current를 별도로 검증한다. B에는 .2 binding+command만 전달되고 API snapshot은 메모리 harness에 전달되지 않는다(API 소유자 확인). 이 문자열은 source 인증 또는 지급 허가가 아니며 출력 sourceSignatureVerified/consentAuthenticityVerified/nonceConsumed/paymentAllowed는 계속 false다. .3 EIP712 domain/message/type, 해시, 금액, nonce, source cutoff·동의·현재성 검사는 변경하지 않는다.

E2 변경 전 SHA256 `eb535f3f30e0bee8c1f3e7dff16c202baa72108ae1417f8b0e077870312d3c5a`, 변경 후 `e348a687265fd89c9a98e977dc20d213ed87bf4169da2063b8b68279a2ce9d7f`. E2 기존 회귀와 실제 시계·guard 시험 합계121 PASS, fail/cancelled/skipped0. 테스트 자료는 발명한 fixture이며 실제 원천 수집으로 간주하지 않는다. 기존 E2 consumer pin/intake 원본은 변경하지 않았다. 메모리 harness의 원본 E2 source pin은 새 호환 인수 전 이 변경을 거부한다. 통합 담당이 정확한 후속 지문을 검토·인수해야 하며 wildcard 허용으로 우회하지 않는다.

## 2026-10-20 E2 검토 변경의 소스 지문 호환

root의 `70979e2` 단일 intake 기록을 `9ac174e`로 출처를 남겨 가져왔다. `specs/bootcamp/hackathon-test-normal-source-intake-v1.json`의 정확한 SHA-256 `410ec5bab91a365cee6909328b0c1a2f847283738b27f66aaf911e2300f47dc9` 및 원래 immutable intake 지문을 검사한다. 새 compatibility helper는 E2 helper 한 파일의 승인된 before/after만 허용한다. 기존 E2/v1/v4 및 E5 service/component intake 파일은 수정하지 않았다. 다른 파일의 지문 검사는 유지한다.

원래 E2 4개 지문을 accepted Git snapshot `d9407b06b8a13122a489193119c1899929f83fe4`에서 직접 검증하고, 현행 파일은 단일 승인 변경 외 원본과 일치하는지 검사한다. 잘못된 before hash는 거부한다. E4 memory harness의 기존 API v4 17개 소스 검사는 여전히 필요하며, 후속 API 구현 지문 변경을 자동 허용하지 않는다. API 새 소스는 root의 별도 intake를 기다린다. 지급 서명/ABI/domain/24개 필드/nonce/current/자금·claim 경계 변경은 없다.

이 후속의 로컬 E4/메모리/서명 회귀 및 지문 검사는 165 PASS, FAIL/CANCELLED/SKIPPED 0(131.45초), E5 보존/17개 B component/17개 API v4 source 검사는 PASS다. 검토는 정확한 경로 예외·원본 snapshot 보존·기존 ABI/서명/nonce/claim 검사 유지 중심으로 수행했다. 실제 원천 성공, API 최신 v5 결합 또는 원격 CI 성공을 대신하지 않는다.

## 2026-10-20 v5 소스 인수 후속 인계 — 7항목

1. **성공/차단:** API `937f982622643f0759d3ac1da2a42cdac93841b7`의 36개 소스와 root v5를 명시 소비한다. 실제 원천 trust/증명 또는 full runtime 수락은 아니다. default disabled/memory-only/실제 시각 검사는 유지했다.
2. **작업본/이력/PR:** `workspaces/clear-hackerrank-bootcamp`, `codex/hackathon-normal-source-entry`. API `62f2c59`를 fast-forward하고 root `3c9fd00cc4e30ad12b2181781e41a873adc76f31`을 정상 merge한 기록은 `d080211`이다. 파일 복사·과거 기준 덮어쓰기 없이 이력으로 통합했다. 후속 guard는 본 절과 같은 커밋이며 API PR102 담당이 인수한다. PR100은 기존 기준으로 고정한다.
3. **미커밋/보존:** v1–v4/원래 E2 snapshot/기존 source-pins-v2/normal-source-pins.json 바이트를 보존한다. 새 변경은 별도 `normal-source-pins-v2.json`에 consumer와 A/B guard 세 파일의 정확 before/after로 기록했다. 이 작업본의 별도 HR 시작 진단 수정은 자체 커밋으로 구분한다. 기존 키·DB·체인·raw는 접근/복사/초기화하지 않는다.
4. **재현/pin:** root v5 SHA `7b89a6c9f73797f0a6faff890f8a097f18dd3f91730eddc7f2cc56730c0f17ff`; normal delta SHA `410ec5bab91a365cee6909328b0c1a2f847283738b27f66aaf911e2300f47dc9`. `tests/hackathon-test-vault/e5/preservation.mjs`, `tests/hackathon-test-vault/e5b/source-pins.mjs`, `tests/hackathon-test-vault/normal-source-compatibility.test.mjs`를 고정 tools/node로 실행한다. memory consumer SHA `7b4e94abd861bc0a57f0bf2d433ed2ebc9ec0054147c9da6f05801e5403cd928`.
5. **검증/리뷰:** 기존 E4/memory/서명+snapshot 165 PASS(212.31초), 확장 snapshot 검사 별도2 PASS(기존1 중복), 네트워크 차단 API store/execution295 PASS(14.68초), 신규 소유 Geth B20 PASS(156.52초), A/B 보존 PASS. 모두 fail/cancel/skip0. memory 명령은 `.github/workflows/hackathon-e5.yml` Frozen E4 목록에 normal-source-compatibility.test.mjs를 더한 것이다. API는 `--import ./tests/ybm-collector/network-guard.mjs --test tests/bootcamp-execution/*.test.mjs tests/bootcamp-store/*.test.mjs`, B는 `--test --test-concurrency=1 tests/hackathon-test-vault/e5b/*.test.mjs`. 리뷰는 exact record→4개 table 8+19+6+3→기존 E2 승인 예외 순서와 변경 없는 scope/role/current/signature/claim 경계를 확인했다. 실제 source·유료 호출·기존 run3 재실행 0.
6. **다음 한 작업/소유:** API 담당이 이 guard 커밋을 정상 이력 merge하고 PR102의 관련 검증/공개 이력 검사 후 한 번 push한다. source implementation은 계속 exact937이다. 본 담당 소유는 memory-stage-harness 및 tests/hackathon-test-vault의 보존/지문 검사다. 실제 HR 진단은 본부가 별도로 안내한다.
7. **종료 작업:** PR21/36 재개, 새 세션/에이전트, 독립 고도화, 자동 PR merge/deploy 없음. 중앙 인계는 root의 기존 문서를 사용한다.

## 2026-10-20 A workflow의 동일 frozen graph 누락

PR102 head1ef53ce의 A run39394319216/job118533146735는 API store→live HR consumer→collector 정적 import가 요구하는 attestor-core를 찾지 못해 키/실제 source 실행 전에 실패했다. B는 이미 prefix 설치가 있었으나 A는 root만 설치했다. A의 설치 단계에 같은 `./tools/npm --prefix src/hackerrank-evidence ci --ignore-scripts --no-audit --no-fund`를 추가했다. µWS의 Node JS fallback 경고는 이 오류와 별개다.

깨끗한 archive 작업 사본에 root lockfile graph만 설치한 상태에서 network-guard 아래 `src/bootcamp/store.mjs` import의 `ERR_MODULE_NOT_FOUND @reclaimprotocol/attestor-core`를 재현했다. 이어 위 HR prefix frozen graph 설치 후 동일 import가 통과했다. 브라우저/실제 source/chain/키/paid 호출은 없다. 원본 CI 실패 로그는 그대로 보존한다. A/B preservation 및 36개 v5 source 검사는 PASS다. runtime/source policy/v5 record bytes는 변경하지 않았다.

A workflow가 기존 service intake의 지문 대상이므로 원래 intake를 덮어쓰지 않고 별도 `ci-source-pins.json`에 workflow와 이를 소비하는 두 guard의 정확 before/after만 기록했다. 기존 component/normal/v5 acceptance 기록은 보존했다. 코드 리뷰에서 설치 명령이 B와 일치하고 lifecycle scripts를 허용하지 않으며 다른 작업 단계/권한/테스트는 동일함을 확인했다. 원격 A 성공은 아직 미확인이고 API 담당이 후속 head에서 CI를 확인한다.
