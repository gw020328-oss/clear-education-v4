# 첫 정상 E2E 우선: Moodle 연결 인계

2026-10-19. 사용자 우선순위 변경에 따라 새 기능·활동/플러그인·복구/예외 범위 확대를 보류했다. 요청 Sol/Medium, 실제 모델 ID 독립 확인 없음. 기존 guard/검증은 삭제·완화하지 않았고 source 모듈 구현도 변경하지 않았다. 한 정상 흐름에 필요한 새 실제 조회와 실행/입력 인계만 추가했다.

## 현재 연결된 단계와 정확한 공백

1. **실제 로컬 Moodle/생성 합성 계정:** 활동 automatic COMPLETED → 본인 과제 SUBMITTED → 명시 선택 회고의 실제 API body/getRaw 읽기까지 새로 확인했다. 세 자료의 fixture application/participant/policy/runtime mapping이 같은지 대조했다.
2. **제품 API 연결은 미완료:** API 작업본 HEAD `4dec3bd`의 `src/bootcamp/moodle-consumer.mjs`를 읽기만 했다(fileSHA256 `b7be51ce477fc4937c8354637a82d1494b9a8906bf3a88430494e7885ab96712`). 여전히 `fixtureOnly`, `BC_MOODLE_REAL_BLOCKED`, `OFFLINE_SYNTHETIC_FIXTURE` 전제가 있다. 실제 client를 그 브랜드로 위장하지 않았다. API 담당이 정상 실제 source consumer를 자신의 소유 경로에서 연결해야 한다.
3. **실제 application/participant/wallet 등록·binding 입력 미수령:** 현재 `application-e6-one / participant-e6-one`은 생성 fixture 참조다. 실제 API 신청/지갑으로 보고하지 않는다. API가 승인한 source account mapping과 runtimeMappingHash를 발급해야 한다. 보고서의 문자열을 실제 wallet의 소유 증명으로 바꾸면 안 된다.
4. **회고 내용 판정은 UNKNOWN:** 원문은 읽혔지만 새 AI 호출/관찰을 하지 않았다. 기존 허용된 회고 consumer가 세 topic을 원문 근거로 판단해야 한다. UNKNOWN→MET assertion을 추가하지 않았다.
5. HackerRank 두 proof/동일레코드·계정/지갑/request binding, 현재 decision·100TEST 배정·양측 동의·제한승인·accept/claim/canonical receipt/잔액은 다른 소유 세션의 정상 연결 단계다. 이 source 인계로 완료했다고 표시하지 않는다. 이 세션의 tx는0이다.

## 새 실제 관측

[normal-path-source-report.json](../../spikes/moodle-review-api/e6/normal-path-source-report.json)은 **이번 명령 실행의 새 관측**이며 지난 report의 acquiredAt/시계를 바꾼 값이 아니다. UTC epoch ms와 원래 source 시각/null을 그대로 보존했다. 실제 REST read46/write0,세 capability의 source 읽기/getter assertions 통과,active token0·raw handle dispose·원문 공개0이다. 이 수는 과거14/250/CI 분모와 합산하지 않는다.

```sh
cd /Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-moodle-review-api
./tools/node spikes/moodle-review-api/e6/normal-path-check.mjs
```

명령은 **Moodle source의 정상 읽기만** 수행한다. API evidence/decision/송금 명령이 아니다. 결과 파일의 lease는 실제240초 exclusive 상한이고, 이 파일을 나중에 current 자료로 재수락하면 안 된다. 실제 정상 수락 실행 시점에 다시 수집해야 한다. source token은 매 호출60초로 발급/즉시 폐기하며 그 발급이 앱 사용자의 auth/raw lease를 갱신하지 않는다. 원문을 디스크/Git/log/report로 내보내지 않는다.

## 살아 있는 소유 fixture pin

환경 `e6-20261018-run1`,project `clear-moodle-e6-20261018`,port18768,run1/mappingRevision1이다. 현재 소유 container가 실행 중이며 지정 대상은 생존한다. 개인/타 서비스·옛18766/18767 볼륨/DB/config/secret/reset/prune는 건드리지 않았다.

| 대상 | 실제 소유 fixture 값 |
| --- | --- |
| course | 2 |
| activity | cm3 / page1 / completionview automatic |
| assignment | cm4 / assign1 / 개인 SUBMITTED / grade 불필요 |
| reflection | cm5 / forum3 / **명시 selected post1** |
| source account | Moodle user3 / e6-one-account / revision1 |
| source version | moodle-4.5.15-215f4438 / API2024100715 |
| 고정 P0 policy hash | 새 report binding.policyHash를 그대로 대조 |

fixture report hash:
`0x5c475d6f41d23f119f4ed16a6e8de8276051f362717362e5bc5cc39e89a74c28`.

[mapping-report](../../spikes/moodle-review-api/e6/mapping-report.json)의 actual IDs·API automatic 설정과 별도 setup DB receipt assurance를 함께 pin한다. 숫자ID만으로 옛 lab과 혼용하지 않는다. source record에 단조 version API는 없고 이번 request/source hash와 직접 관측한 수정시각을 사용한다. completion 최초 달성/assignment 전용 제출시각은 여전히 null이며 acquiredAt으로 대체하지 않는다.

현재 원천은 이미 완료/제출 상태이므로 **추가 실제 학습행동이나 사용자 로그인은 필요하지 않았다**. 이는 가상 부트캠프의 생성 합성 계정이며 외부 학원/실명 학생 활동 검증이 아니다. source의 출처·현실 신원·회고 내용·전체 eligibility를 구분한다.

## API 정상 consumer에 필요한 최소 입력/호출

새 API/adapter 추상화를 이 세션에서 만들지 않았다. 기존 연결점을 그대로 사용한다.

- owner driver: `spikes/moodle-review-api/e6/runtime.mjs`의 `withReader(callback)`; token을 API 작업본에 복사하지 않는다. 이 callback은 이 소유 작업본의 private runtime/CLI에서 새 read 자격을 취득한다.
- source producer: `readBootcampMoodle({client,request,getCurrentRequest,getCurrentContext,getCurrentPin,signal,now})`.
- source request: `createBootcampMoodleRequest({context,pin})`; context에는 **API가 발급/검증한** participantId/applicationId/policyHash/criterion/capability/evidence ID·revision/runtimeMappingHash/fixtureReportHash/request generation·attempt와 실제 issued/expires가 필요하다. pin의 participantMapping도 그 API 등록과 정확히 일치해야 한다. fixture label을 조용히 실제 신청으로 치환하지 않는다.
- API 소유자의 권한/current resolver는 요청 전후·수락 transaction에서 유지한다. `withReader`가 사용자 역할/지갑/동의/nonce를 검증한 것은 아니다. source helper의 fixture용 고정 callback을 제품 auth resolver로 오인하지 않는다.
- 기존 raw seam: `openMoodleSourceSession`의 `await getRaw({signal}) / cancel / dispose`. 매 getter의 source 재조회·원래 receipt/expiry 유지·min auth/raw/query와 max1800·Moodle300을 보존한다. API 기존 동기 candidate getter에는 소유자의 적절한 정상 경로 연결이 필요하다. metadata만으로 raw를 복원하거나 실제 client를 offline으로 재브랜드하지 않는다.
- 반납한 `source.body / messageFormat`은 권한 있는 in-process 회고 consumer에만 전달한다. 공개 정상 인계에는 원문/quote 대신 hash·locator·관측시각만 둔다. UTF16/정규화 profile 차이는 [E6 source 설명](REVIEW_API_E6_SOURCE.ko.md)을 따른다.

입력 준비의 남은 정확한 값은 **실제 API application/participant/wallet,그에 대한 승인된 Moodle user3 연결,API runtime mapping/current request/권한·lease**다. 공동 source/ledger/HTTP/web 코드를 이 담당이 중복 구현하지 않는다. 이 값이 정해지면 source는 새로 읽어 한 정상 consumer 실행에 사용할 수 있다. 추가 model/개인 source/서명·transaction 호출은 수행하지 않았다.

첫 정상 흐름에서는 기존120/1/600·source 만료/변경·새 decision 동의·배정/수령인/단회/원자성 guard를 유지한다. 신규 복구·takeover/reorg·부족queue/재충전·새 시간 시나리오를 앞세우지 않는다. productionfalse/C2개인자료 제한을 유지하고 새 TEST 활성화의 영구 중단으로 옛 HOLD를 적용하지 않는다. 자동 merge/상용배포/새 세션/하위 에이전트/다른 채팅 발신은 없다.
