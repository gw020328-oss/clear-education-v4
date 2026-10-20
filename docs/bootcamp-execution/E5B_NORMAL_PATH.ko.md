# E5 B 정상 시연 작업 인계

현재 승인: 한 신청의 정상 E2E 실제 연결. 본부의 2026-10-19 직접 사용자 지시로 필요한 기존 담당 세션 간 협업은 허용되고 추가 기능·복구 확대는 첫 시연 이후다.

완료된 과거 작업: PR #36. 이를 현재 작업으로 재개하지 않는다.

작업 브랜치 `codex/bootcamp-e5-api-bridge`, 시작 HEAD `4dec3bd94ad786d2f1b52d00b5bfa1eab8f82ec0`. 기존 미커밋 B scope·private controller·원자 ledger·명령/current 연결과 시험을 보존하여 마무리한다. 4dec와 원본 실패 로그를 변경하지 않는다.

초기 체크포인트의 당시 다음 작업(아래 재개 기록에서 완료): UUID v4 challenge 전용 검사 및 시험 설정 오류를 닫고, exact B 패킷의 등록→전액 배정→게시→양측 동의→prepare/accept→별도 claim을 단일 진입점으로 연결한다. source/current/lease/nonce/금액·수령인·중복 검사를 유지한다.

초기 체크포인트에서 B 연결은 합성 원천을 명시한 오프라인 단위이며 실제 signer/sender는 차단 상태였다. 이후 격리 TEST 연결 결과는 아래 재개 기록을 따른다. 실제 Moodle/HR/AI 관측 수락은 미연결이며 fixture 성공을 실제로 표시하지 않는다. 실제 source는 신청·지갑·mapping/request/lease가 고정된 뒤 새로 수집한다. 과거 source 보고서와 AI 평가 결과는 재사용하지 않는다.

기존 금고·DB·체인·키와 v1–v4 source pin 보존, 신규 격리 TEST만 허용. production/main/develop 자동 병합·배포 없음. 기존 정책 및 미확정 Mac 원인은 유지한다.

## 2026-10-20 재개 확인

현재 branch는 `codex/bootcamp-e5-api-bridge`다. 첫 UUID/private witness 단위 `b109dfa` 이후 통합 a7, B a4, Moodle d3709a0, 정상 mapping/주소 수정 2be2737, E2 provenance 4d0f0b5, AI private result/최종 guard 1276b91을 이력으로 인수했다.

단일 실행 `./tools/node tools/bootcamp/normal-chain.mjs --synthetic-source`의 run3는 같은 인증 신청→합성4조건 MET→실제100TEST 전액 배정→양측 동의→제한서명·accept→별도claim→canonical receipt·정확100000000 atoms 수령·중복거부를 완료했다. [공개 검증 기록](normal-chain-verification.json)을 따른다. source는 SYNTHETIC_TEST_SOURCE이고 실제 Moodle·HR·AI 전체 연결 성공은 아니다. 성공한 환경은 재실행하지 않고 stopped/parked 상태로 보존했다. 코드의 정상 지급 부분을 `executeNormalPayment`로 추출하여 실제 원천 entry도 같은 순서를 사용하도록 준비한다.

`prepare-live-input.mjs`는 별도의 새 TEST identity/인증 신청·Moodle user3 mapping·custom mapping chain을 준비했으며 원천수집0·배정0다. 하루 중단으로 기존1800초 접수 window가 만료됐으므로 이를 연장하지 않는다. 실제 시작에서는 원래 입력/키/DB/체인과 기록을 보존하고 새 신청/current request/min lease만 발급한다. HR trust가 아직 UNCONFIGURED이므로 그 source mapping은 지급 활성화 근거가 아니다.

전용 `moodle-live-consumer.mjs`는 LOCAL_LMS_RECORD를 명시하고 실제 source owner getter→ACTUAL AI의 private live-result identity→최종 async fresh probe→동기 current/recheck/CAS를 결합한다. 기존 offline consumer는 유지한다. 새 유료호출은0이며 과거 평가 승인은 재사용하지 않는다. private brand가 없는 JSON/clone/offline 결과는 실제 AI 결과로 수락하지 않는다.

회귀453개 중452개가 통과했고 한 건은 E2 enum 변경에 따른 구정본SHA 직접비교였다. 구 v1핀은 보존하고 [새 delta](normal-consumer-source-delta.json)로 원본Git snapshot과 현재 owner변경 SHA를 각각 검증했다. 해당 수정·AI brand 검사16개, 추가 API/원자종료·현재성 회귀91개 통과. live consumer의 네트워크 모사는 시험용이며 실제 source 성공 건수에 합산하지 않는다.

남은 필수 입력은 fresh request-bound HackerRank pair/신뢰설정·새 실제 Moodle 자료·신규 단1회 AI 승인이다. 실제 원천 전체 연결과100TEST 정상 지급이 함께 확인되기 전에는 완료로 보고하지 않는다. 다음 유료 승인 질문은 코드와현재 원문 packet이 준비된 뒤 통합 소유자가 담당한다.

## API 소유 인계 7항목

1. **성공/차단:** run3 합성원천의 실제 격리100TEST 수령·중복거부 완료. 실제 HR recipe/registry/context·managed worker/로그인 UI·fresh source 및 AI새1call 승인은 미완료여서 전체 실제 시연은 차단이다. UNCONFIGURED를 긍정 판정으로 바꾸지 않는다.
2. **작업본/브랜치/PR:** `workspaces/clear-bootcamp-api-store`, `codex/bootcamp-e5-api-bridge`, API 소스 checkpoint `937f982`, root v5 `3c9fd00` 및 E4 guard `97827dd` 정상 이력 인수, [Draft PR102](https://github.com/gw020328-oss/clear-education-v4/pull/102). 정상 인수는 AI1276/P1 a758와 E2 4d 포함이다. 자동 병합하지 않는다.
3. **소유/보존:** `src/bootcamp/*live-consumer.mjs`, `store/model/procedure/execution-*`, `tools/bootcamp/*`는 API 소유. 키·쿠키·proof·token을 인계 문서에 복사하지 않는다. private 아래 준비 신청과 만료 window, run1/2 실패 및 run3 성공의 DB·체인·TEST 키를 보존한다. 실제 원천 준비의 옛 mapping은 HR UNCONFIGURED 그대로다.
4. **명령/환경/pin:** 합성 정상 명령은 위 기록을 재사용하고 성공 run3는 반복하지 않는다. 실제 연결은 `tools/bootcamp/live-context.mjs`의 `openLiveContext({preparationPath,withReader,hackerRank:{pins,collectLease},reviewReflection})` → `collectSources()` → `pay()` → `close()`다. 아직 실제 host HR source 설정이 없으므로 호출하지 않는다. `prepareLiveInput({hackerRankPins,identityPreparationPath})`는 REVIEWED pins에 새 불변 mapping이 필요할 때 기존 TEST identity를 재사용할 수 있다. 새 환경은 실제 시작 직전에만 만든다. 구 intake v1–v4와 새 `normal-consumer-source-delta.json`·`normal-chain-verification.json`을 함께 읽는다.
5. **검증 구분:** source/P1/API·AI 관련282개와 전용 거부경계8개 네트워크 차단 시험 통과. 실제 hosted HR proof0·새AI호출0·실제source 전체 지급0다. root v5와 E4 guard를 정상 인수했고 현재/원본937 소스36개, v1–v4/E2 원본 및 A/B 보존 검사가 통과했다. E4 소유 검증은 메모리·서명165개/API·저장소295개/B20개 통과이며, 최종 원격 CI 상태는 PR102의 해당 head에서 확인한다. 구 E2/API 지문 불일치 원본 실패 로그는 보존한다. 합성 입력의 실제 chain 지급 성공과 혼용하지 않는다.
6. **다음 한 작업:** P1 소유가 실제 trust/managed login 입구를 준비하면 정확 pins와 request-bound collector callback만 연결한다. `readHackerRankCollectorLease`를 같은 module tree에서 직접 호출하여 candidate/nonce/request/participant/wallet/hash/기한을 재검사한다. HR900초 원천창을 먼저 열고 Moodle각240초·AI30초를 마지막에 취득한다. live collection command 최대300초도 request/min lease 잔여 이하다. 원래 source freshness/120·600초·금액·수령인·배정/재사용 guard는 유지한다. 새 원천이 준비되면 root가 고정 packet/code 기준 AI최대1call 새 승인을 맡는다.
7. **끝난 작업:** PR21·PR36 검토나 과거 플랫폼 조사로 돌아가지 않는다. 첫 실제 정상 시연 이전의 새 기능·복구 확대·중복 평가·새 세션·에이전트는 진행하지 않는다.

## 2026-10-20 새 실행통합 인수 — 실제 입력 계약 확인

API `ff07743bd599456686346326236dff3847d63264`, 공통 기록 `778d5dbcd3b1a903f197c0b09dde5fd2ff63f99c`의 clean 작업본을 인수했다. 새 실행통합 채팅은 `01a158a8-96c6-7d31-bf99-1468c9768992`이며, 새 HR 및 Moodle·AI 담당과 직접 계약을 대조했다. 이번 단위의 추천은 GPT-6.1 Sol / High였고 실제 실행 모델 ID는 독립 확인하지 못했다.

현재 API 접점은 구현돼 있다. HR의 검토된 설정과 수집 경로가 없는 상태에서 다른 callback이나 임의 설정으로 연결하지 않는다. `prepareLiveInput`은 identity·불변 mapping·TEST realm을 준비하지만, 실제 원천을 소비하는 신청은 **`openLiveContext`가 반환한 `metadataPath`의 applicationId/participantId**다. 준비 파일의 과거 applicationId로 원천이나 AI packet을 만들지 않는다. `openLiveContext` 자체도 새 신청을 만들므로 단순 readiness 확인용으로 실행하지 않는다.

| 포트 | 실제 입력 계약 | 이번 인수 결과 |
| --- | --- | --- |
| HR `pins()` | `audience`, `trustConfigHash`, `recipeHash`, `expectedClaimOwner`, `selectedCertificateId`, `dataMode=RECLAIM_SIGNED_RECORD` | 준비 전 정확 pins 필요. 새 HR 담당 확인상 live recipe·registry signer·hosted context 미확정으로 아직 제공 불가 |
| HR `collectLease(request, options)` | API가 발급한 요청과 `signal`, `isAuthorized`, `signRequest(message)`를 전달; 같은 API 모듈 트리의 private collector lease 반환 | 현재 상위 `runHackerRankCollection`은 내부에서 새 owner·전용 Chrome을 만들어 사전 pins 계약에 직접 주입 불가. low-level 동일 collector 인스턴스의 2단계 연결은 HR 경로 확정 뒤 소유자가 결정 |
| Moodle `withReader(fn)` | 소유 `spikes/moodle-review-api/e6/runtime.mjs`의 reader를 직접 주입 | import만으로 수집하지 않음. 고정 신청의 `query()`/`collect()` 대신 consumer가 생성한 이번 요청/current resolver 사용 |
| AI `reviewReflection(args)` | 이번 원문 lease·context·request와 동일 트리의 `prepareFirstNormalReflectionPacket` / `runFirstNormalReflection` 사용 | private result brand가 있어야 수락. 다른 작업본에서 생성한 result나 JSON 복사본 사용 불가. 정확 packet 승인과 현재 전체30초 접점의 순서가 미완료 |

목표 순서는 **HR 안전 수집·검토 pins와 Moodle/AI callback 준비 → 새 단1회 승인 gate의 구현·검토 → 마지막 시점에 준비 realm/실제 신청 발급 → HR → 활동 → 본인 과제 → 회고 exact packet 준비·본부의 새 승인·AI → 같은 현재 판정의 전액 배정·양측 동의 → accept/claim → canonical receipt·100000000 atoms·중복 거부 → close**다. 현재 그대로 실행 가능한 확정 명령은 아니다. HR source900초, Moodle 각240초, 회고 collectBridge 전체30초와 AI 최대30초가 각각 적용된다.

AI 담당과 확인한 두 번째 차단점: clearance는 `approval.planHash/contextHash/codeHead/day`의 정확 일치를 요구하며 packet에는 source 만료도 포함된다. 따라서 사전 원문·프로필 승인만으로 미래 새 packet을 자동 승인할 수 없다. 현재 callback 내부에서 사람을 기다리면 전체30초 수집 제한이 이미 진행된다. 필요한 최소 후속은 **같은 request/source handle로 packet 준비·human gate를 완료한 뒤 AI30초 검증 시작**을 분리하는 API 접점이며, 원래240초·요청/권한 만료는 그대로 유지해야 한다. 제한을 조용히 늘리거나 옛 승인을 재사용하지 않는다. HR 경로가 미확정인 이번 단위에서는 먼저 구현하지 않았으며 이 원문 수명 접점을 변경할 때는 Astra / High 실질 경계 검토가 필요하다.

이 인수에서는 source/API 제품 코드와 고정 핀을 변경하지 않았고, 준비된 독립 실행 명령이 있다고 주장하지 않는다. 새 신청/realm/lease·실제 source/AI·체인 거래0이며 성공 run3 및 전체 시험 재실행0이다. 기존 만료 신청·DB·키·실패 기록과 Linux CI 정체의 미확정 원인은 보존한다. 다음 한 작업은 HR 안전 경로와 AI 승인 순서가 확정됐을 때 **기존 포트의 소유 callback만** 연결하는 것이다.

## 독립 AI 준비·실행 분리 단위

위 대조 뒤 본부가 HR 경로와 독립적인 API 최소 수정을 승인하고 민감 원문 수명·동일 요청 경계에 Astra / High를 지정했다. 실제 런타임 모델 ID는 독립 확인하지 못했으며, 이 경계를 마치면 일반 API 구현의 추천을 Sol / High로 되돌린다.

`store.prepareBridgeReflection(context, applicationId, {requestId, expectedRevision}, {signal, timeoutMs:30000})`는 인증된 현재 reflection 요청만 준비한다. 기존 Moodle source handle을 유지한 채 정확 packet과 code/day snapshot, `isCurrent()`·`dispose()`만 반환한다. 원문·source handle·AI 결과는 반환하지 않으며 journal/grant/key/model에 접근하지 않는다. 준비 네트워크의30초 제한이 끝난 뒤 호출자는 source 원래240초 이내에서 본부의 이번 packet 승인을 기다린다. `isCurrent()`는 로컬 권한·수명 검사이며 외부 원문 무변경 보증은 아니다.

이후 기존 `collectBridge`의 같은 request/revision으로 한 번만 진행한다. source를 fresh probe하여 원문 hash/format을 대조하고, **준비한 같은 packet/code/day**와 실제 현재 host getter를 `reviewReflection`에 전달한다. AI owner는 기존 `runFirstNormalReflection`에 새 exact approval 및 실제 currentApprovalHash를 주입해야 한다. 기존 private live-result 검사·모델30초·최종 source fresh probe·동기 권한/current/CAS는 유지된다. 원문/권한/요청/코드/날짜 변경·만료·취소·실패 후에는 동일 준비를 재사용하거나 자동 재수집하지 않는다. 만료되면 새 입력과 새 승인이 필요하다.

실제 entry는 선택적인 `reflectionHost:{codeState(),day()}`를 받는다. `collectSources({prepareReflection:true})`가 HR/활동/과제 이후 reflection packet을 반환하며 `AWAITING_EXACT_REFLECTION_APPROVAL`에서 멈춘다. 본부의 exact 승인을 소유 callback에 구성한 뒤 `collectSources()`를 다시 호출하면 **새 request/source window를 발급하지 않고** 같은 reflection 요청을 한 번 재개한다. 기존 인자 없는 직접 수집 경로는 보존했다. 호스트 codeState/day는 실제 현재 값의 동기 조회이며 준비 값만 되돌리는 대역을 운영에 주입하지 않는다.

변경 소스는 `store.mjs`, `moodle-live-consumer.mjs`, `tools/bootcamp/live-context.mjs` 세 파일이다. 관련103건 중102PASS/1FAIL 최초 로그는 보존했다. 실패는 무승인 fixture의 codeHead 누락이 먼저 `NORMAL_CODE`로 거부됐는데 시험이 뒤의 `NORMAL_APPROVAL_REQUIRED`만 예상한 문제였다. 정상 codeHead·승인 scope 없음으로 fixture를 좁힌 뒤 신규20/20이 통과했다. 이후240초 준비 상한을 명시한 최종 소스에서 같은 관련103/103이 통과했다(신규20 포함). 최초 실패 실행을 소급 성공으로 바꾸지 않는다. 실제 모델/실제 수락·체인 양성 검증은 수행하지 않았다. 후속 정확 source pin 및 guard 소비 검증 전 결합 CI 인수는 대기다.

AI 담당의 exact callback 대조 후 `92387a49a7808af0f7b240021aafcd01edc17253`는 실제 current code/day getter의 객체 receiver도 보존한다. this를 사용하는 호스트로 준비·실행 getter까지 신규20/20을 확인했다. 103건은 앞선5cc 소스, receiver 보완20건은923 소스의 검증이며 분모를 합산하지 않는다. [검증 기록](reflection-preparation-verification.json)과 공통 v6 후보 pin을 따른다. 실제 승인 packet의 codeHead는 **guard·문서·필수검사를 마친 최종 통합 작업본의 clean HEAD**로 고정한다. 승인 대기 중 이 HEAD가 달라지면 새 승인 없이 진행하지 않는다.

금고 소유 `7b35bb3dc47d5604f305cc4e063e003dbb1a79a8`를 정상 이력으로 인수했다. 소유 실질 경계 검토에서 차단 소견0, 네트워크 차단39/39 및 보존 검사 통과다. API 결합 `2ad4fdf52158a30ca36f22d9e8b80c37e464a902`에서 새 guard11/11과 A/B 보존을 확인했다. memory consumer SHA는 `7b80e10bd887179c2fce338570ed31eadca9980cd7b7978e8076896c82cb1b5f`이며, 기존 v5 원본36개와 현재 v6의36개/3delta를 각각 검사했다. EVM 생성 전 중단점만 사용해 chain/key-provider/거래0이다. v6 후보 파일 자체의 PENDING 표기는 당시 기록으로 보존하며 이 절과 별도 검증 기록이 명시 소비 사실이다. 원격 필수 CI는 최종 push head에서 확인하며, 이 결과를 HR trust·실제 AI/전체시연 인수로 표시하지 않는다.
