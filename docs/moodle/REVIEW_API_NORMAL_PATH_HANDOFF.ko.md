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

## 2026-10-20 현재 소작업 종료 인계 — 정상 연결은 계속

중앙 입구는 root `ec0c7df`의 `docs/current/HACKATHON_TEST_SESSION_HANDOFF.ko.md`다. 이 추가 기록은 새 세션 생성/기존 채팅 archive/정상 시연 중단 지시가 아니다.

1. **실제 성공 / 정확한 차단점:** 생성 합성 Moodle 계정의 실제 REST로 활동 COMPLETED·과제 SUBMITTED·선택 회고 body를 확인한 결과는 위 링크를 보존한다. 10/20에는 API가 허용한 preparation/mapping metadata2개와 세 pin 형식 호환성만 확인했고 source/model 호출0이다. API는 기존 준비 신청의 최초접수1800초 창 만료를 확인해,기존 시간을 늘리지 않고 HRcollector/AI 준비 후 새 run directory·새 신청/current request·lease를 발급할 예정이다. API가 보고한 run3 합성 원천100TEST 수령/중복거부는 Moodle이 확인한 실제 원천 전체 E2E/tx 성공으로 혼용하지 않는다.

2. **worktree / branch / commit / PR:** `/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-moodle-review-api`, `codex/moodle-e6-recollection`, 기능/source 관측 기준 `d3709a01e8eefc77b207e4a1ea87c8ae3f8ccf24`, [Draft PR87](https://github.com/gw020328-oss/clear-education-v4/pull/87). 이 인계 문서 추가의 최종 head는 PR에서 확인한다. PR71/488a09c 및 옛18766/18767 정리 이력은 보존하며 현재 ready로 재사용하지 않는다.

3. **미커밋 소유 / 보존:** 이 추가 직전 tracked 미커밋0. `.toolchain/moodle-normal-binding-checkpoint.json`은 ignored 재개 요약이며 fresh evidence가 아니다. 소유 var/moodle-e6·실행중 fixture/volume·API의 기존 키/DB/chain/신청/실패기록은 보존한다. role/auth/DB/raw/token 파일을 탐색·복사하지 않는다. 새 source session은 직렬화된 metadata만으로 복원하지 않는다.

4. **재현 명령 / 환경 / 공개 pin:** 위 정상 source 명령 및 [E6 source 설명](REVIEW_API_E6_SOURCE.ko.md)의 withReader/readBootcampMoodle/openMoodleSourceSession을 재사용한다. 소유 E6 environment `e6-20261018-run1`,18768,user3,course2/cm3·4·5/forum3/selectedPost1,report hash `0x5c475d6f41d23f119f4ed16a6e8de8276051f362717362e5bc5cc39e89a74c28`은 [mapping-report](../../spikes/moodle-review-api/e6/mapping-report.json)를 참조한다. 과거 관측의 생존/lease를 오늘의 fresh 보증으로 쓰지 않고 실제 실행 때 새로 읽는다. 지금은 API 요청대로 추가 source/token 발급을 하지 않는다.

5. **검증 / 실제·합성 구분:** d3709a0의 fresh local source 읽기46회는 실제 로컬 HTTP/생성 합성 계정이며 외부 학원·실명·wallet 통제 proof가 아니다. 기존 해당 head 원격CI6/6·원본191개/의존성 보존·공개 이력 검사는 당시 근거다. 10/20 metadata 대조는 요청/키발급/source/AI/chain/지급 검사가 아니고 의도적으로 만료·미발급 값의 pin shape 검사만 포함한다. 새 코드/복구/평가를 추가하거나 옛250개를 반복하지 않았다.

6. **다음 한 작업 / 소유 경로:** API가 새 비밀없는 metadata와 실제 발급 .2 current request/승인 user3 mapping·auth/raw/query 최소 lease를 전달하면,HR/chain 준비 후 같은 신청의 Moodle source를 마지막에 fresh 수집해 정상 consumer→AI raw getter로만 연결한다. AI는 async readBody/getRaw·borrow release·모델 후 fresh probe/원래receipt 대조·API 최종 dispose 경계를 유지한다. AI PR101 head1276b91은 통합 재검토 대기라는 전달을 받았으며 신규 모델 승인 없이 호출하지 않는다. 직접 소유는 기존 src/review-evidence/moodle·tests/moodle-review·spikes/moodle-review-api·docs/moodle뿐이며 공통/API/DB/HTTP/web는 해당 담당이 연결한다. 필요한 기존 세션 협업은 사용자 승인 아래 유지하되 새 기능/세션/에이전트/자동 merge/상용배포는 없다.

7. **종료한 과거 작업 재개 금지:** PR21/PR36 및 옛 Mac/Windows·별도 복구 연구로 돌아가지 않는다. 첫 정상 실제자료→AI→100TEST 흐름의 필수 검증/입력 연결만 이어가며,새 세션/최종 분배는 정상 시연 완료 또는 사용자의 차단점 종료 결정 뒤 본부의 인계 확인에 따른다. 현재는 그 전환을 실행하지 않는다.


## 새 담당의 최신 consumer 대조 (2026-10-20)

새 Moodle·AI 담당은 `dd3c04d`/AI `84a33d5` clean 작업본을 인수해 API 최종 `ff07743bd599456686346326236dff3847d63264`를 읽기 대조했다. 위의 `4dec3bd` 기준 “실제 consumer 미연결”은 당시 상태다. 최신 `src/bootcamp/moodle-live-consumer.mjs`와 `tools/bootcamp/live-context.mjs`에는 실제 로컬 API·단회 ACTUAL 회고 수신 경로가 있고, Moodle `bootcamp.mjs`/`source-session.mjs`/`bootcamp-client.mjs`는 이 소유 작업본과 바이트가 같다. 새 source adapter 수정은 필요하지 않다. 이 확인은 실제 수집이나 수락이 아니다.

통합은 이 작업본 `spikes/moodle-review-api/e6/runtime.mjs`의 **`withReader`만** 주입한다. import는 credential 발급/원천 조회를 하지 않는다. `query()`와 `collect()`는 fixture application/current를 고정하므로 제품 정상 binding에 주입하지 않는다. 최신 consumer가 만든 실제 `.2` request에서 `createBootcampMoodleRequest`→`readBootcampMoodle`→`openMoodleSourceSession`으로 연결하고, API의 권한·pin·lease resolver를 그대로 사용한다. `withReader`는 기존18768 환경에서 매 호출 read token을 발급하고 finally에 폐기하며 원문/token을 반환 로그에 남기지 않는다.

실행 순서는 HR 수집 준비→통합의 reviewed mapping/새 실행 신청→HR→활동→과제→선택 회고다. `prepareLiveInput`의 준비 application과 `openLiveContext`의 실제 실행 application은 다르므로 **collectBridge가 전달한 현재 request**가 정본이다. 회고 callback은 같은 read의 body/format/hash로 AI packet을 준비하고, 본부의 새 단회 승인 후 기존 AI entry를 호출한다. 모델 뒤 consumer의 외부 fresh `getRaw`/원래 receipt 대조 및 최종 current/CAS/close/dispose를 유지한다. 준비된 source/window를 미리 발급하거나 만료 시각을 늘리지 않는다.

이번 확인의 source/token/key/model/tx는 모두0이며 전체 시험을 재실행하지 않았다. API 소유 파일은 편집하지 않았고 통합 담당 `01a158a8-96c6-7d31-bf99-1468c9768992`에 함수·순서·fixture helper 금지와 동일 모듈 트리 identity 조건을 전달했다. 실제 Moodle은 계속 **생성 계정의 로컬 실제 API**이며 실명 학생/외부 학원 인증이 아니다.

통합과 추가 대조한 결과 사람의 exact packet 승인 대기가 현재 collectBridge 전체30초 안에 있어 실행 순서가 아직 미완성이다. API 소유자에게 동일 request/source의 packet 준비·승인 gate를30초 밖에서 마치고 원래240초 만료를 유지하는 좁은 준비 접점 검토를 요청했다. 별도 source adapter가 필요 없다는 결론은 유지하며, 승인·시간 검사를 완화하지 않는다.
