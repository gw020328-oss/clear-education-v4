# Python 부트캠프 P2: Moodle 활동·과제·회고 출처

2026-10-17. 요청 GPT-6.1 Sol / Medium, 런타임 모델 ID 독립 확인 없음. 기존 PR71/worktree에서 P0 fixed commit **`03fa64324ef9cc2ce4fb442a612329a7b1285677`**(Draft PR78)을 정상 merge했다. merge `d5f0d2b`, 공통 경로 충돌0. 공통 파일을 복제/직접 수정하지 않고 [P0 정본](../current/PYTHON_BOOTCAMP_P0.ko.md)과 `specs/bootcamp/p0-contract.mjs`의 정책/hash/gates를 소비한다. 이 의존은 PR74 bridge와 develop9c542c3를 포함한다.

P0 네 조건은 AND다. 이 담당은 **지정 활동의 현재 자동 완료·지정 과제의 본인 SUBMITTED·명시 선택 회고의 원천**만 읽는다. 회고3항목은 AI 미실행으로 UNCERTAIN이고 HackerRank는 P1 영역이다. 일별 수강률·퀴즈/점수·사진 요건·긍정성 평가·전체 적격/지급으로 치환하지 않는다.

## 실제 fixture와 해시

[fixture-mapping.json](../../spikes/moodle-review-api/bootcamp-p2/fixture-mapping.json)은 새 격리 합성 계정/강좌를 **실제로 생성하고 REST로 target/작성 계정/완료 설정을 확인한 시점**의 공개 metadata다. 개인자료/토큰/비밀번호는 없다.

- environment `bc-p2-20261017-run3`, project `clear-moodle-bootcamp-p2-20261017`, run `run3`, loopback `127.0.0.1:18767`.
- Moodle public commit `215f44380bdc3ccf852a3a22e34f8423ff64033a`, REST version `2024100715`, release `4.5.15 (Build: 20261005)`.
- `fixtureReportHash = p0Hash('MOODLE-FIXTURE-REPORT', artifact.report)`:
  `0x703e993fb5c231e09db19eee25397d257d9920a42f5acefbe5a69339c33f8986`.
- sourceVersion `moodle-4.5.15-215f4438`은 host의 고정 소스 profile이다. API version은 매번 직접 대조하지만 코드commit 자체는 setup provenance이며 API 서명 증명이 아니다.

| 논리 target | 이 합성 run에서 실측한 숫자ID | 관측 / 범위 |
| --- | --- | --- |
| clear-python-bootcamp-demo | course6 | 다른 course 혼입 거부. 강좌의 기본 news forum은 target으로 쓰지 않음 |
| python-intro-activity | cm13 / page instance3 | completion2 / automatic / rule completionview |
| python-practice-task | cm14 / assign instance3 | 개인 제출. DRAFT와 SUBMITTED, grade 불필요 |
| python-reflection | cm15 / forum9 | 명시 선택 root post. 목록 첫 항목으로 대체하지 않음 |

participant-bc-one/application-bc-one→Moodle user9, two→user10, outsider→user11. one/two만 강좌 등록. accountBindingRef/revision1은 **생성한 합성 host mapping**이며 실명·실학생·지갑 인증이 아니다. 숫자ID는 이 run만의 실측값이다. P0 `p0-runtime-mapping.json`의 actualIds=null/ready=false는 변경하지 않았다.

**이 report는 현재 live-ready가 아니다.** 마지막 삭제 검사로 지정 assignment와 one의 선택 reflection을 삭제했고, 모든 token을 폐기·account suspend·소유 container를 중단했다. 활동/다른 기록·각 run DB/volume는 보존했다. API 담당은 역사적 report hash만으로 ready를 올리지 말고 새 live fixture/mapping revision·인증/존재/최신성을 확인해야 한다. source-exports는 과거 관측이며 current evidence가 아니다.

## 실제 읽은 API와 필드 의미

[Moodle 공식 API 목록](https://docs.moodle.org/dev/Web_services_Roadmap), [공식 completion API](https://moodledev.io/docs/5.0/apis/core/activitycompletion)를 참고했다. 필드/시각 의미는 위 **고정4.5 소스** `completion/classes/external.php`, `completion/classes/external/completion_info_exporter.php`, `mod/assign/externallib.php`를 정본으로 했다. 다른 version 문서는 실측을 대신하지 않는다.

| capability | 인증 read API·직접 값 | 정규화 / 한계 |
| --- | --- | --- |
| MOODLE_ACTIVITY_COMPLETION.1 | core_course_get_contents의 module/instance/completion/completiondata, core_completion_get_activities_completion_status의 cmid/tracking/state/isautomatic/istrackeduser/uservisible/details.rulename/overrideby/timecompleted | 이 profile은 page의 completionview만 지원. 두 API의 설정/상태를 대조하며 manual·override·설정 부족/미지 state는 UNKNOWN. 관측한 automatic state1→COMPLETED,0→INCOMPLETE. 학습시간/집중/실력 보장 아님 |
| MOODLE_ASSIGNMENT_SUBMISSION.1 | mod_assign_get_assignments의 course/id/cmid/teamsubmission, mod_assign_get_submission_status(assignid,userid=0)의 본인 submission.id/userid/groupid/attemptnumber/status/timecreated/timemodified | submitted→SUBMITTED,draft→DRAFT,new/성공 envelope 안의 record 없음→NOT_SUBMITTED. team은 UNSUPPORTED. grade/feedback/작품 본문은 predicate·출력에 쓰지 않음. 조회 불가는 미제출로 변환하지 않음 |
| REFLECTION_REQUIRED_TOPICS.1의 source 부분 | core_course_get_contents로 지정 container, get_forums_by_courses/get_forum_discussions/get_discussion_post로 course/forum/discussion/선택 post/author·본문HTML/제목·생성/수정초·view/deleted/privateReply | 본인의 명시 선택 root post만 읽음. 원문HTML은 메모리 source에 보존하고 별도 hash 반환. topics3개는 UNCERTAIN/TEXT_REVIEW_NOT_RUN,sourcePredicate UNKNOWN. 내용 검토/학원 인정은 하지 않음 |

completionSetupReceipt는 **setup 때 새 소유 DB의 course_modules 설정을 읽은 fixture receipt**다. REST 필드와 구분해 completionview=1·gradeitem=null 등을 hash화했다. REST에서 직접 읽은 tracking2/isautomatic/rulename=completionview와 각각 다른 assurance로 report에 기록했다. setup receipt만으로 automatic VERIFIED를 만들지 않는다.

`timecompleted`는 고정 소스에서 completion record의 timemodified를 반환한다. 최초 달성시각을 보장하지 않아 `sourceCompletedAt=null`, API 값은 `sourceStateModifiedAt`에 보존한다. assignment에도 전용 submittedAt은 없어 `sourceSubmittedAt=null`, 실제 timecreated/timemodified를 별도 필드에 보존한다. acquiredAt/서명시각/합성 scenario 시각으로 대체하지 않는다. `gradingRequired=false`는 P0 정책이며 원천이 작품을 합격 인정했다는 뜻이 아니다.

sourceVersion은 profile/build pin이며 수정마다 증가하는 record version이 아니다. 표준 API에 단조 record revision은 없고, 선택한 state/설정/시각/본문 등의 `sourceHash`로 변경을 비교한다. assignment hash는 제출 state/ID/attempt/시각 등만 포함하며 작품 전체 hash가 아니다. 같은 초의 작품 본문만 수정·ABA·삭제 후 복원 이력 전체는 보장하지 않는다.

## producer API와 공통 API 인계

- [`createBootcampMoodleClient`](../../src/review-evidence/moodle/bootcamp-client.mjs): 고정 loopback18767·read8함수·함수별 인자 고정. 기존 review client와 [transport](../../src/review-evidence/moodle/readonly-transport.mjs)를 재사용하며 token은 POST body, redirect/cookie 거부,256KiB/timeout/취소를 유지한다. options로 host/allowlist를 넓힐 수 없다. 쓰기6함수는 새 fixture harness의 별도 token에만 둔다.
- [`createBootcampMoodleRequest / readBootcampMoodle`](../../src/review-evidence/moodle/bootcamp.mjs): **producer 내부 in-process 계약**이며 제품 runtime schema/HTTP body/DB가 아니다. P0 policy/criterion/capability와 participant/application/evidence revision,fixtureReportHash/runtimeMappingHash,sourceRunId/generation/attempt,issued/expires 실제 ms,실제 target/participant pin을 clone/freeze한다. C2 SYNTHETIC RunContext를 LOCAL로 바꾸거나 기존 일별/EXAM으로 변환하지 않는다.
- `readBootcampMoodle({client,request,getCurrentRequest,getCurrentContext,getCurrentPin,signal,now})`→`{facts,acquisition,receiptHash,source}`. 같은 실행의 site_info.userid/version을 직접 관측해 pin과 대조한다. source는 메모리 원문 또는 선택 필드이며 facts는 capability별 정규화다. 시작/완료 current request/context/pin·기한/취소/시계·두 번 읽기 일치를 검사한다. 본문 source는 로그/별도DB/공개export에 저장하지 않는다.
- acquisition에는 위 context/hash,기대/관측 reader,sourceVersion/API build·sourceHash/factsHash·관측 시작/완료ms·기한·sourcePredicate와 gate를 둔다. reflection 가시성은 인증된 본인 reader 기준이다. 인터넷 공개·학원 승인이 아니다. sourcePredicate MET도 활동/제출의 현재 값만 뜻하며 전체AND/제품 자격 판정은 아니다.
- `validateBootcampMoodleResult`는 **별도 보존한 기대 receiptHash** 및 request로 source/facts/receipt·현재 lease를 대조한다. hash를 전부 함께 바꿀 수 있는 상대의 서명/진위를 검증하지 않는다. 공통 API는 신뢰한 producer만 입력으로 삼고 본인 인증·runtime mapping 발급/현재성·단일 transaction/CAS/replay/수락/무효화를 자신의 소유 schema/DB에 구현해야 한다.

lab의 `runtimeMappingHash`는 `p0Hash('MOODLE-LAB-MAPPING-REFERENCE',{fixtureReportHash,revision:1})`인 **실험 참조 hash**다. 공통 제품 runtime mapping을 발급한 것이 아니다. 제품 API 담당이 report exact commit/hash를 pin하고 독자적인 runtimeMappingHash/ready를 발급해 request에 준다. producer는 opaque hash를 결합하며 current callback의 변경을 거부한다. 공통 파일을 복제하지 않는다.

hash domain은 `p0Hash('MOODLE-'+kind,value)`다. `originalBodyHash`/`originalTitleHash`도 REFLECTION-BODY/REFLECTION-TITLE domain의 canonical text hash이며 raw UTF8 bytesDigest와 다르다. 공통/AI의 원본 input/UTF-16 span·bytes hash 결합은 원문을 받는 단일 소유 adapter에서 별도로 처리한다. Moodle producer가 정규화/C2 내용 동일성을 승인하지 않는다.

[공개 source-exports](../../spikes/moodle-review-api/bootcamp-p2/source-exports.json)는 실제 관측7건(활동 미완/완,과제 없음/초안/제출,회고 선택/수정)의 facts/acquisition/receipt hash를 포함하며 원문 source/자격증명은 제외한다. `verify-export.mjs`는 report에서 request/pin을 재구성해 hash를 대조하고7건 PASS했다. 원문 sourceHash 재계산·서명/진위·live readiness 검사가 아니다.

## 검사 분모·실패 이력·정리

[actual-report](../../spikes/moodle-review-api/bootcamp-p2/actual-report.json): run3 **24/24**. 내역은 **실제 local API/소유 fixture22개**와 live harness 안의 **offline guard2개**(old source pin,주입한 기한 시계)다. CLI setup/숨김/삭제도 소유 fixture 작업이며, 전체24개를 순수 REST 성공 수로 부르지 않는다. 학습21/21·이전 review13/13·실제Gemini 수와 합산하지 않는다.

첫 run1은8개 통과 후 두 번째 participant에서 none→new record 출현으로 BCM_SOURCE_CHANGED가 됐다([초기 실패](../../spikes/moodle-review-api/bootcamp-p2/initial-failure.json)). run2는 첫 번째 participant 초기화가 빠져5개 뒤 같은 보류였다([두 번째](../../spikes/moodle-review-api/bootcamp-p2/second-initialization-failure.json)). producer의 일치 검사/자동 retry를 완화하지 않고, 두 참가자의 초기 read로 미제출 new 상태를 확인한 뒤 **다른 새 run3**에서 취득했다. 어느 내부 API가 DB 행을 생성했는지 transaction trace는 하지 않았으며 read API의 무부작용을 보장하지 않는다. producer는 불일치를 그대로 거부하고 과거 성공으로 fallback하지 않는다.

offline 신규58 + 기존 Moodle75 + P0계약20 + bridge/source계약26 + bridge adapter26 + workflow6 = **211/211 PASS**, 모두 네트워크 tripwire 하의 mock/공개 합성 벡터다. wrong reader/target/course,draft/미완/설정 없음·manual,duplicate/page/warning,삭제/같은 초 수정,sourceVersion/clock/expiry/late/mapping,취소·과거 성공 fallback 금지·receipt/facts/raw 변조를 포함한다. source-exports 상관관계7건 PASS,workspace191개/의존성 보존·diff PASS.

공통 `review-bridge-integration.mjs`의 선택 smoke는 이 branch에 PR72 `tests/ai-review-precheck/fixture.mjs`가 없어 MODULE_NOT_FOUND다. 이 스크립트는 첫 주석대로 PR71+72+74를 포함한 통합 작업본 전용이며, 이 Moodle 작업본에서 성공했다고 기록하지 않는다. AI/common 파일 복사나 승인 밖 merge로 해소하지 않았다. 위211개와 별도 분모다.

root CI는 수정하지 않아 `tests/moodle-review/` 신규58/기존75 및 실제Docker22개는 기존CI에 자동 편입되지 않는다. exact head CI는 Draft PR71에 기록한다. 실측 뒤 추가한 설정 누락UNKNOWN guard·result 상관관계 validator·진단 비노출은 offline 검증이며 cleanup 뒤 추가 실제 Moodle 재실행은0건이다.

[cleanup-report](../../spikes/moodle-review-api/bootcamp-p2/cleanup-report.json): 이번 run1/2/3 총 **15서비스 비활성·9합성 계정 suspend/session 종료·token0·폐기 token의 실제API 거부**, 소유 container만 stop,새 volume 보존. 기존 review/학습lab DB/config/secret/volume 및 stream-db는 건드리지 않았다. private var DB·비활성 자격증명 파일은 남으며 물리 완전 삭제는 보장하지 않는다.

## 재현과 남은 관문

새 빈 runtime/project/port에서만 bootstrap한다. 기존 marker/config/container/volume 재사용 초기화를 거부한다. 공개 Moodle repo의 고정commit만 archive하고 config/untracked/개인DB는 복사하지 않는다. web768MiB/1CPU,db256MiB/0.5CPU,DB hostport 없음. 첫 실행부터 두 participant의 초기 미제출 read를 포함한다.

```sh
mkdir -p var/moodle-bootcamp-p2/moodle
chmod 700 var/moodle-bootcamp-p2
git -C "$PUBLIC_MOODLE_REPO" archive 215f44380bdc3ccf852a3a22e34f8423ff64033a | tar -x -C var/moodle-bootcamp-p2/moodle
./tools/node spikes/moodle-review-api/bootcamp-p2/bootstrap.mjs
./tools/node spikes/moodle-review-api/bootcamp-p2/run.mjs
./tools/node spikes/moodle-review-api/bootcamp-p2/cleanup.mjs
```

재시험은 이전 run 자격을 먼저 폐기한 뒤 미사용 runN에 **새 course/account/target**을 만든다. 이전 run을 reset하지 않는다. 보고서는 마지막 run으로 갱신되므로 이전 공개 결과를 보존하고 mapping revision/hash를 바꾼다. 이 고정 project에는 이미 volume/marker가 있어 위 bootstrap은 의도대로 거부한다.

제품 API capability schema/DB/CAS/불변 evidence/decision,raw/auth lease 최소값·회고 원문/AI3topic 연결은 단일 API/통합 담당의 후속이다. metadata hash는 실명/진실/학원 인정을 보증하지 않는다. P3동의이의/P4배정TEST/P5E2E는 관계/계획만,grant/outbox HOLD·paymentAllowed=false·독립NO_GO·C2합성-only/개인자료 제한,400/500제외·예치율/배정/충전/PG/회수/분쟁시간OPEN을 유지한다. develop/main merge·배포·외부 연락은 없다.
