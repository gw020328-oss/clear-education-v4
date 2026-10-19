# E6 source·재수집 사전준비

2026-10-18. 요청 GPT-6.1 Sol / Medium, 실제 모델 ID 독립 확인 없음. PR71 `488a09c`·10/17 실측/cleanup은 보존한다. 전용 작업본에서 후속 `codex/moodle-e6-recollection`을 만들고 **E0 `67b6a0731f97df98fda7820ab24ed85a57796a83`을 정상 merge**했다(merge `8fe2418`,충돌0). 정본 [HACKATHON_TEST_OPERATIONS](../current/HACKATHON_TEST_OPERATIONS.ko.md)와 profile을 import한다. 공통 API/DB/schema/normalizer/CI/package/frozen specs/docs/current/web는 직접 수정하지 않았다.

profile `clear-hackathon-test-operations.1`,decision revision1,repo plan revision4. hash는 `testOperationsHash()`=`0x47a18b20a02a8acf89160c50601b8a2625bcae432292d9cf6d4644af0a2fdb98`다. P0 네조건 AND/100 TEST·120초/새근거 재검증1회/첫시작+600 리셋 없음은 승인값이다. 본 source 준비는 그 절차/서명/지급을 구현하지 않으며, 옛 포괄 HOLD를 승인된 TEST 개발의 영구 중단 사유로 쓰지 않는다. 기존 v1 false gate는 보존하고 새 TEST activation은 담당 인수 뒤 별도로 연결한다.

## 새 살아 있는 fixture와 mapping

기존18766/18767 lab·볼륨·개인 DB/config/secret은 읽거나 reset하지 않았다. 공개 Moodle git의 고정 tracked commit만 새 archive로 재사용했다. project **clear-moodle-e6-20261018**,port **18768**,새 e6db/e6data volume,environment **e6-20261018-run1**이다. web768MiB/1CPU·DB256MiB/0.5CPU,DB hostport 없음.

[mapping-report](../../spikes/moodle-review-api/e6/mapping-report.json)의 `reportHash=p0Hash('E6-FIXTURE-REPORT',report)`:
`0x5c475d6f41d23f119f4ed16a6e8de8276051f362717362e5bc5cc39e89a74c28`.

| mappingRevision1의 논리 대상 | 실제 새 fixture ID |
| --- | --- |
| course | 2 |
| python-intro-activity | cm3 / page1 |
| python-practice-task | cm4 / assign1 |
| python-reflection | cm5 / forum3 / 명시 selected post1 |
| participant-e6-one / application-e6-one | Moodle user3 / e6-one-account |

숫자가 옛 lab ID와 같아도 같은 원천이 아니다. environment/run/project/port/reportHash를 함께 pin한다. 생성한 합성 계정 통제는 실명/실사용자·지갑 인증이 아니다. 자동 완료 설정은 REST tracking2/isautomatic/completionview를 직접 관측했고, 설정 DB의 completionview=1 등은 **별도 setup receipt**다. manual/설정 미확인은 MET로 올리지 않는다.

**이번에는 지정 활동·과제·주 회고를 보존했다.** 삭제 검사는 별도 일회용 글만 사용했다. 같은 볼륨으로 소유 container stop/start 후 새 자격을 발급해 세 원천을 다시 읽었다. [lifecycle-report](../../spikes/moodle-review-api/e6/lifecycle-report.json)의 시점에는 지정 대상3개 생존·container 실행·새 자격으로 재수집 가능·활성 token0이다. 이는 source fixture의 관측 상태이며 **제품 runtime ready/전체4조건 MET/AI·서명·지급 완료가 아니다**. 10/17의 삭제/정리 후 ID/report는 현재 ready로 사용하지 않았다.

## source interface와 raw 수명 연결점

[`createE6MoodleClient`](../../src/review-evidence/moodle/bootcamp-client.mjs)는 고정18768/read8함수·기존 POST body token/redirect-cookie 거부/응답256KiB/timeout·취소를 재사용한다. 기존18767 factory는 유지한다. execution은 `LOCAL_SYNTHETIC_SOURCE_PREPARATION`이며 OFFLINE_SYNTHETIC_FIXTURE로 위장하지 않는다. 별도 writer는 소유 fixture CLI에서만 사용한다.

[`openMoodleSourceSession`](../../src/review-evidence/moodle/source-session.mjs)의 입력:

```js
const handle = await openMoodleSourceSession({
  request, collect, resolveCurrent, subscribeCurrent, signal, now: () => Date.now(),
});
// resolveCurrent(): { available, requestHash, pinHash, sourceEpoch,
//   authExpiresAtMs, rawExpiresAtMs, queryExpiresAtMs }
const rawSource = await handle.getRaw({signal});
handle.dispose(); // cancel()도 동일. 이미 반환된 JS 값의 물리 삭제는 보장하지 않음
```

`collect(request,{signal})`은 기존 `readBootcampMoodle` 결과를 반환하는 **신뢰한 host callback**이다. request는 participant/application/criterion/policy/evidence revision·fixture/runtime mapping·generation/attempt·sourceVersion·기한/실제reader와 결합한다. raw는 closure 안에 두고 metadata에는 facts/acquisition/hash만 둔다. callback·메타데이터 hash 자체가 인증/실명을 증명하지 않는다.

- `getRaw`는 **매번 실제 source를 새로 읽고** 기존 sourceHash와 대조한다. 수정·삭제·조회 거부·timeout·다른 current request/pin/epoch면 handle을 폐기하고 과거 성공으로 fallback하지 않는다. 새 결과도 같은 request의 원래 receipt·관측시각·expiry를 연장하지 않는다. 새 query의 실제 재수집과 기존 receipt의 acquiredAt만 변경하는 일을 구분한다.
- raw의 exclusive 유효기한은 승인된 max1800초와 **auth/raw/query의 최소값**이다. request 자체는 기존 source300초 상한을 유지한다. 기한 축소는 늘릴 수 없고 원래 timer/현재성 검사로 닫힌다. host는 auth 축소/철회·mapping 변경 시 `subscribeCurrent` 통지나 `authorityChanged()`/`dispose()`를 반드시 연결한다. 통지가 없으면 다음 검사/원래 timer에서만 변화가 관측되며 즉시 감시를 주장하지 않는다.
- `isCurrent`는 **로컬 host/lease 상태 검사**다. 외부 Moodle 변경의 실시간 oracle이 아니다. 외부 변경은 `getRaw`의 새 API probe에서 관측한다. 두 번 읽기도 원자 snapshot·전체 이력·ABA 방지/DB CAS가 아니다. API 담당이 source 현재성과 durable acceptance를 자신의 transaction에서 연결해야 한다.
- 부모/읽기 취소·dispose·기한·clock 역행 뒤에는 다시 살리지 않는다. processLeaseId는 process-local이며 JSON metadata에 raw/getter가 없다. 복원 API를 제공하지 않는다. 새 process는 새 token·새 query/실제 수집으로 새 handle을 만든다. 이미 받은 JS string·caller 사본의 물리 삭제나 강제 종료 때 정시 삭제를 보장하지 않는다.

API 작업본의 `src/bootcamp/moodle-consumer.mjs`를 읽기만 했다(HEAD6b4b0cf 시점,file SHA256 `b7be51ce477fc4937c8354637a82d1494b9a8906bf3a88430494e7885ab96712`). 당시 consumer는 offline-only client 브랜드와 동기 leased getter를 요구한다. **이 비동기 실제 raw getter는 drop-in 소비 인수가 아니다.** E1 소유자가 자기 auth/scope/CAS·비동기 원문 접근/사본·수명 경계를 인수해야 하며, 이 작업은 그 파일을 변경하거나 offline guard를 우회하지 않았다. source-only 합성 시험을 E1 민감 경계 인수로 세지 않는다.

## 시간·본문·권한

기존 facts와 source timestamp 의미는 유지한다. API completion timecompleted는 record 수정시각이며 최초 완료시각은 null,과제도 전용 submittedAt이 없어 null이다. source 수정초/관측 시작·완료ms를 별도 보존한다. 실제 timestamp를 offline/scenario clock으로 바꾸지 않았다. sourceVersion은 고정 build/profile이고 단조 record revision이 아니며 sourceHash는 선택 필드 지문이다.

자격은 **소유 CLI가 매 호출60초 token을 발급하고 finally에서 폐기**한다. token은 Node 메모리와 해당 Moodle의 native token DB에만 있으며 argv/공개 report/log/fixture에 넣지 않는다. private setup 관리자/DB 비밀은700디렉터리/600파일이며 기존 다른 lab 비밀을 복사하지 않았다. 원천 DB에 생성한 합성 게시물은 유지하지만 collector 원문 사본은 디스크에 저장하지 않는다. 60초 source token과 API 사용자의 auth/raw lease는 서로 다른 권한 수명이다. token을 매번 새로 발급한다고 사용자 auth lease를 연장하지 않는다. 전용 read token은 쓰기함수/전역 학생 조회 권한이 없으며 writer는 별도 scope다.

실제 회고는 세 topic과 ‘문제는 없었지만 경계 입력을 점검’하는 내용으로 소유 원천에 생성했다. 원문을 공개 artifact로 복사하지 않았다. [collection-report](../../spikes/moodle-review-api/e6/collection-report.json)는 실제 format1·UTF16길이/UTF8 bytes·raw bytes SHA256·`clear-review-html-subset.1` 정규화 지문만 제공한다. `ORIGINAL_BODY_HTML_UTF16`와 정규화 위치를 혼동하지 않고, normalized→original offset map은 미지원이다. canonical facts originalBodyHash와 raw bytesDigest도 다른 domain이다.

[안전 예제](../../spikes/moodle-review-api/e6/safe-reflection-example.mjs)는 **실제 body와 다른 독립 offline 텍스트**다. 원문HTML/명시 format·UTF16 span/quote bytesHash·정규화 profile 예시를 주며 AI 실행/PRESENT 판정을 포함하지 않는다. sourceStatus와 세 topic 내용 판단은 별개이고, 새 사진·긍정성/성의·최소 글자수 요건을 추가하지 않았다.

## 재수집 runner와 환경 수명

```sh
./tools/node spikes/moodle-review-api/e6/collect.mjs          # 세 원천, 사전준비 기본query45초
./tools/node spikes/moodle-review-api/e6/collect.mjs 240000   # 명시한 host query240초; 실제 auth/raw도 별도 충족해야 함
./tools/node spikes/moodle-review-api/e6/lifecycle.mjs status
./tools/node spikes/moodle-review-api/e6/lifecycle.mjs stop
./tools/node spikes/moodle-review-api/e6/lifecycle.mjs start  # 기존 volume만, 없으면 재생성요구 오류
```

기본45초는 사전준비 privacy 시험 선택이지 승인된120초 확인창을 대체하는 정책이 아니다. 실제120초 경로는 E1/E3가 source300초·최소 auth/raw/query 안에서 충분한 유효기한과 재수집/새 판정 규칙을 결합해야 한다. routine query generation을 재검증1회 횟수나600초 timer 초기화로 처리하지 않는다.

`generation.json`은 private metadata만 보존한다. 새 process도 증가된 query generation을 쓰며 raw는 복원하지 않는다. source counter는 제품 request ledger/nonce/CAS가 아니다. wx lock 충돌/손상은 보류하며 다른 프로세스 lock을 무조건 지우지 않는다. 같은 environment의 정상 stop/start는 mappingRevision1과 IDs/hash를 유지한다. volume/marker를 잃거나 새 course/account/IDs를 만들면 **새 environment + mappingRevision/report hash + API 소유 runtime mapping**을 발급하고 이전 evidence/handle을 stale 처리해야 한다. 기존 ID를 새 환경에 끼워 넣지 않는다.

최초 생성은 빈 var/moodle-e6/moodle에 공개 commit만 archive한 뒤 `e6/bootstrap.mjs`→`e6/prepare.mjs` 순서다. 이미 있는 marker/config/project/volume는 bootstrap에서 거부한다. 기존 소유 volume 시작은 lifecycle start로 분리했다. 새 원천의 raw text는 prepare에서 메모리에 생성해 API로만 전송한다. 개인 계정 로그인·외부 학교 접근·모델 호출은 없다.

## 분리된 증거와 남은 관문

- 실제 prepare: 자동완료 설정/시스템 완료,과제 DRAFT→SUBMITTED,discussion ID+작성자에 따른 명시 post 선택을 실제 API로 확인했다. 초기 prepare에는 HTTP 카운터를 설치하지 않았으므로 추정 호출 수를 보고하지 않는다.
- [실제·lease 인수](../../spikes/moodle-review-api/e6/acceptance-report.json):14/14. **REST read202/write3(거부 응답 포함)**와 real20ms lease 축소/35ms 대기·host 철회/취소 등 guard가 섞인 검사다. 각 case에 REST 횟수가 따로 있다. 14개 전체를 REST 성공 횟수라고 부르지 않는다. 별도의 일회용 글만 삭제했다.
- 초기/새 process 재수집 report는 각각 read46건,stop/start 후 status는 read23건이었다. 이 수는 prepare와 분리한다. 매번 token0·handle dispose,최종 지정대상3개 생존을 확인했다. 실제60초 token 만료 대기를 한 것은 아니며 native 만료설정·실제 token 폐기를 구분한다.
- offline 새 source-session/host/safe-example27 + 이전 관련211 + E0 contract12 = **250/250 PASS**. 네트워크 tripwire 하에서 축소/철회/expiry/late/cancel/변경/실패/fake restore 거부·정확 UTF16/hash를 검사했다. 실제 source clock을 주입시계로 바꾼 결과와 합산하지 않는다.
- source/기존 DTO·금지경로 보존 및 공개 이력 검사는 PR exact head에 기록한다. root CI는 변경하지 않았으므로 tests/moodle-review의 새27개/실제lab 검사는 원격 기본CI 자동 대상이 아니다. 추가 AI/model0,개인 source0,서명/chain/지급0이다.

현재 소유 container를 **실행 상태로 유지**하며 재수집 연결을 기다린다. token은0,collector raw handle은 dispose,origin의 지정 대상/volume는 살아 있다. 이것이 제품 runtime.ready나 E6 전체 인수 완료를 의미하지 않는다. E1/E2/E3~E5·현재 source/실제 참가자/지갑·회고 관찰·서명/지급 인수와 별도다. E0 승인 TEST 경로는 해당 인수 후 별도 activation할 수 있으며 productionfalse·기존 C2개인자료/genericupload 제한은 유지한다. main/develop merge·배포·다른 세션 연락은 하지 않았다.

## 2026-10-19 첫 정상 경로 우선

새 기능/복구 확대를 보류하고 기존 source/getter로 fresh 정상 수집을 수행했다. [정상 경로 전용 인계](REVIEW_API_NORMAL_PATH_HANDOFF.ko.md)에 연결된 source 단계,실제 API consumer의 offline-only 공백,필요한 application/participant/wallet mapping·실행 명령을 기록했다. 과거 관측을 fresh로 재사용하거나 UNKNOWN을 MET로 변경하지 않았다.
