# 첫 정상 TEST 연결의 mapping·주소 표현 수정

2026-10-19. PR100 최종 `a4a05c7`(CI 9/9 SUCCESS, 제품 `9607f47`)는 해당 브랜치에 보존한다. 이 후속은 API 담당이 실제 연결에서 발견한 두 공백만 고친다. 기존 환경·키·DB·거래를 재사용하거나 이전 observation/hash를 변환하지 않는다.

- 새 `createEnvironment({runtimeMappingHash})`가 서버에서 승인한 nonzero lowercase bytes32를 받는다. 생략하면 기존 DEFAULT_MAPPING_HASH가 유지된다. 잘못된 값은 디렉터리·키·체인 생성 전에 거부하며, 배포한 계약 getter와 manifest가 같은 값을 갖는지 확인한다. 해시 형식 검사는 Moodle/참가자 mapping의 내용 승인이 아니다. 그 등록·승인은 API 소유다.
- ethers ABI 결과의 application.recipient 및 acceptedRight.recipient/token을 원천 reader에서 lowercase로 정규화한 후 businessHash와 private witness를 만든다. 주소의 20바이트 값은 바뀌지 않는다. API가 관측 후 해시를 다시 만들거나 일반 주소 guard를 완화하지 않는다. 기존 서명·envelope는 새 해시로 재해석하지 않고 새 격리 환경에서 실행한다.

회귀 명령: `./tools/node --test tests/hackathon-test-vault/e5/normal-mapping.test.mjs`. 실제 새 Geth에서 임의 mapping 배포/readback, 틀린 manifest mapping 거부, prepare/accept/claim, canonical observation hash와 세 주소 형식, 정확 100000000 atoms 잔액 증가를 확인한다. 자료/동의는 시험 fixture이므로 실제 Moodle·HackerRank·AI 연결 성공은 아니다.

직접 리뷰: 입력 검증은 부작용보다 앞서며 원래 기본값과 runtime version, chain/contract/signer/nonce/current/금액·수령인 검증을 유지한다. 주소 변환은 ABI address 세 필드에 한정하며 다른 문자열·hash를 변환하지 않는다. 원래 A/service intake 및 B source-pins v1/v2는 변경하지 않는다. `normal-source-pins.json`은 두 소스와 이에 필요한 보존 검사 두 파일의 정확한 before/after를 기록한다. 새 wire 프로토콜이나 기존 환경 마이그레이션이 아니다.

실제 API 전체 정상 지급과 실제 원천 인수는 API/통합 담당이 이 후속을 명시 반영한 뒤 새 환경에서 확인한다. 자동 merge·상용 배포는 하지 않는다.

로컬 결과: 새 mapping/주소 정상 시험 2/2 PASS(9.9초), 기존 B 전 범위 20/20 PASS(125.8초), 정확한 원본/예외 지문 검사 PASS. fail/cancelled/skipped 모두 0. 직접 코드 리뷰에서 추가 결함은 발견하지 않았다. 새 실제 API 재실행은 이 기록에 포함하지 않는다.
