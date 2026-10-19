# 첫 정상 100 TEST 경로의 회고 consumer 최소 인계

2026-10-19 우선순위 변경을 적용한다. 추가 모델 품질 평가·8건 확대·프롬프트 실험·Vision/RAG·복구 확장은 보류한다. 이번 범위는 **한 application의 현재 원문으로 3topic 회고를 읽고 같은 신청의 정상 consumer에 넘기는 접점**이다. AI가 전체 AND 판정·재원 배정·동의·서명·accept/claim을 대신하지 않는다. P0/R3·필수 guard를 바꾸지 않는다. 최신 핵심 완료 기준은 실제 Moodle·HackerRank/Reclaim 자료→AI→같은 신청의 실제100TEST 수령이다. 아래 합성 명령은 접점 확인용이며 실제 자료 시연을 대체하지 않는다.

## 연결된 단계와 정확한 공백

| 단계 | 확인한 현재 연결 | 이번 인계에서 남은 것 |
| --- | --- | --- |
| Moodle 게시물→원문/receipt | producer의 정확 selectedPost/author/course/forum·두 번 읽기·request/pin/현재성 검사와 원문 보존 lease | 정상 run의 실제 선택 application/participant/게시물 pin 및 현재 source/권한 lease를 API/원천 소유자가 확정 |
| 원문→3topic | 기존 E6 borrowed-lease/core가 원본 UTF-8 hash·UTF-16 span/quoteHash·context/current를 검사 | 현행 core/E6 wrapper는 **MOCK 전용**. 실제 모델용으로 execution을 MOCK라고 바꿔 우회하지 않음 |
| 3topic→동일 신청의 Evidence | 공통 createMoodleConsumer의 observationAdapter(context)→receipt→candidate.facts→recheck/reference 경로 존재 | 현행 consumer는 fixtureOnly·OFFLINE_SYNTHETIC_FIXTURE·mock 모델을 고정. ACTUAL fresh 결과의 전용 수신/출처·deadline 접점은 공통 소유자가 연결해야 함 |
| 같은 신청의4조건→current decision | API 소유 테스트에4개 producer의 합성 입력을 같은 ledger decision으로 결합하는 정상 경로 존재 | AI는 새 DB/API/판정 코드를 만들지 않음. 같은 participant/wallet/policy/evidence/decision의 현재성 수락은 API 소유 |
| 100TEST 배정→양측동의→제한승인→accept→claim | E5/계약·실행 소유 범위 | 이 AI 단위의 tx/receipt/100TEST 수령은 **미실행·N/A**. 호출/서명/하드코딩 verified로 실제 성공을 만들지 않음 |

현재 이 담당에게 특정 정상 application/participant/wallet·현재 decision·원문 lease가 전달되지 않았다. 임의 example ID나 과거 평가의 본문/결과를 현재 신청으로 꾸미지 않는다. 정상 run의 단일 worker·새 격리 TEST chain·양측 조기 동의 경로를 통합/실행 소유자가 정하며, AI는 아래 인계만 맞춘다.

## 읽기 전용으로 확인한 소유 접점

- API snapshot `4dec3bd94ad786d2f1b52d00b5bfa1eab8f82ec0`, `src/bootcamp/moodle-consumer.mjs` SHA256 `b7be51ce477fc4937c8354637a82d1494b9a8906bf3a88430494e7885ab96712`.
- 같은 snapshot `src/bootcamp/model.mjs` SHA256 `899f1b2bf423ca478027d15825dea8a2ba6ce5f607ff611c2b1e4d6d72481231`.
- Moodle snapshot `22640db091d5d3ac5d8a3535280b393d6f618d65`, `src/review-evidence/moodle/bootcamp.mjs` SHA256 `0e77c68c856163c9f50a5d7b3e5ab0c159ae1a2bd1dbf6262c771d9d34bc2e98`.

공통 API 작업본의 다른 파일은 진행 중 변경이 있었으며 위 consumer/model은 읽기 시점 변경 없음으로 확인했다. 스냅샷 인계이며 작업 중인 소유 파일을 복사/편집/merge하거나 API 소유 테스트를 실행하지 않았다. 위 파일이 바뀌면 통합이 이 접점을 최신 코드와 대조한다.

producer의 `OBSERVED_LOCAL_API`/LOCAL_API_TOKEN·HOST_FIXTURE_PIN_ONLY·usableForAcceptance=false를 source 서명/실명 인증으로 승격하지 않는다. AI의 `OBSERVED_TARGET`도 별도 host context 상태이지 source 진위 인증이 아니다. producer `h('REFLECTION-BODY', body)`와 AI의 원본 UTF-8 SHA256 inputHash는 별개의 지문이며 같은 값으로 치환하지 않는다.

## API가 한 번에 공급할 최소 입력

원문과 credential은 이 인계 문서/로그에 넣지 않는다. API의 인증된 in-process owner가 다음을 묶어 제공한다.

1. **신청·권한:** applicationId/participantId/수령 wallet의 같은 신청 결합, 선택 policy의 version/hash, criterion=`reflection-topics`, capability=`REFLECTION_REQUIRED_TOPICS.1`. wallet/actor·역할·원문 권한 검증은 API 소유이며 모델에 주소나 계정 식별자를 보내지 않는다.
2. **현재 수락 대상:** bound request version/hash·nonce와 예정 evidenceId/evidenceRevision·runtimeMappingHash·현재 decisionRef(id/revision/hash). policy/evidence/decision version은 공통 소유 envelope에서 검증하고 기존 exact-key reflection context에 새 필드를 몰래 추가하지 않는다.
3. **동일 원천:** sourceId/version/hash/receiptHash, 선택 게시물·author/course/forum pin, messageFormat(1=원본 HTML,2=plain), 원본 inputHash. normalizer가 있으면 version/normalizedHash를 별도 유지하고 원문 span으로 오인하지 않는다.
4. **수명:** 실제 owner의 read/isCurrent와 auth/raw/query/request/source freshness의 최소 만료, current context resolver·nowMs·취소 signal. sourceStatus/rawAvailable/current는 owner의 현재 권한·원천을 반영해야 하며 상수 true나 평가 JSON으로 구성하지 않는다.
5. **이번 관찰:** 새 runId/attempt·현재 profile/model/prompt 버전. 이전 사례의 response hash/평가 점수는 현재 관찰의 출처가 아니다.

`candidate.originalBody`는 owner lease getter를 유지한다. AI borrowed handle의 release는 참조만 놓고 공유 owner.dispose를 대신 호출하지 않는다. 시작·읽기 전후·dispatch·응답 완료·소비/공통 수락 직전에 같은 context/source/pin/lease/current를 다시 검사한다. 원문·quote는 메모리에서만 사용하고 저장 수락에는 topic state와 원본 `{sourceId,start,end,quoteHash}`·원본 body hash·관찰 run/profile·출처 결합만 넘긴다. API는 기존 candidate identity/recheck와 DB/CAS·nonce·중복/원자 수락을 유지한다.

UNCERTAIN/CONFLICT는 UNKNOWN/HOLD, MISSING은 보완/미충족으로 남긴다. PRESENT도 원본 span/hash 검증 없이는 근거가 아니다. AI의 CHECKED가 source 인증이나 전체 MET를 뜻하지 않는다. 현재 공통 predicate가 허용한 합성 수락과 실제 원천 인수를 구분한다. 부족한 source/권한/current를 모델의 긍정 답변으로 대체하지 않는다.

## 현재 쓸 수 있는 실행과 쓸 수 없는 실행

AI 소유의 **합성·네트워크 차단 접점 확인** 명령(실제 모델/신청 인수/TEST 지급 아님):

```sh
PATH=/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4/.toolchain/node-v24.21.0-darwin-arm64/bin:$PATH ./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/ai-review-precheck/e6-leased-reflection.test.mjs
```

API 소유자가 현재 작업을 검증 가능한 지점에 마친 뒤 참고할 기존 **단일 신청·4조건 합성 ledger 연결** 테스트는 `tests/bootcamp-store/consumers.test.mjs`의 `all four real producer implementations compose synthetic inputs into the same ledger ALL decision`이다. 이름의 real producer implementations는 실제 모듈을 쓴다는 뜻이며 입력은 synthetic이고 회고는 명시적 MOCK이다. 이 테스트를 실제 Moodle/실제 모델/온체인100TEST 수령으로 보고하지 않는다. API 작업본에서 소유자가 실행할 때의 명령:

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test --test-name-pattern='all four real producer implementations compose synthetic inputs' tests/bootcamp-store/consumers.test.mjs
```

실제 모델로 현재 정상 신청을 읽는 **fresh 단1건 실행 명령은 아직 연결되지 않았다.** 기존8건 `run-e6-paid-wire-v3.mjs`를 재실행하거나 저장 평가를 observationAdapter로 반환하지 않는다. 현행 core의 execution=MOCK·모델 고정, consumer의 fixtureOnly/producer provenance, default1초·최대30초 mock timeout을 실제 transport라고 위장하지 않는다. API 소유자가 전용 수신 접점과 현재 deadline을 연결하고 AI 소유가 고정 Gemini transport/schema/prompt를 그 접점에 제공하는 최소 변경이 필요하다. 공통 코드는 이 문서에서 수정하지 않았다.

## 실제 모델이 필요한 경우의 최소 행동·예산

최근 v3 승인은 최대8회를8회 사용해 종료됐고 정상 신청의 **승인 잔여 생성0건**이다. US$0.004858의 낮은 조건부 비용이 새 호출 권한을 만들지 않는다. v1/v2/v3 승인·spent/journal은 보존한다. 이번 실제 Gemini/count/키 읽기0이며 아직 새 실행 승인 질문을 제시하지 않는다.

정상 입력과 위 접점이 고정되면 한 번에 검토할 최소안은 **새 현재 회고1건·generateContent최대1/count0·retry/continuation/대체0**, 기존 `gemini-3.5-flash-lite`/MINIMAL·현재 topic schema/prompt·원문 literal grounding이다. 모델에는 불필요한 계정·wallet·credential·gold·과거 정답을 보내지 않는다. sourceId/body/format과3topic만 포함하고 owner의 전송 권한·자료 범위를 먼저 확인한다. raw/auth/current는 전송과 수락 양쪽에서 유효해야 한다.

본문≤2048/전체≤8192 UTF-8바이트·요청 maxOutputTokens1024의 기존 최소 범위를 사용한다. timeout은 사용할 승인된 port의 상한과 남은 lease 이하로 고정한다. 기존 mock의30초 상한을 평가용45초 설정으로 조용히 바꾸지 않는다. 입력3000·결합 생성1024 토큰을 가정하면 2026-10-19 확인한 [Standard 단가](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) 기준 **US$0.00346**의 조건부1건 시나리오다. 토큰·thinking 결합 상한/청구/확정 cash cap은 미검증이고 진행 중 호출은 가정을 넘을 수 있다. 실제 실행 전 날짜·정확 code/input/policy/권한·가격·한도를 결합한 최소 새 승인이 필요하다. 키 값이나 새 프로젝트를 요구하지 않는다.

## 통합이 다음에 읽을 인계

가장 먼저 필요한 것은 **정상 신청1개의 식별/현재 pin·lease를 가진 소유 입력과, 실제/합성 출처를 명시한 consumer 수신 접점**이다. 그 전에는 임의 participant의 fresh AI 성공이나 tx를 보고하지 않는다. AI 인계 이후의4조건 current decision→100TEST 전액배정→같은 decision 양측 동의→제한승인→accept→claim→canonical receipt/정확 수령·중복 거부는 API/실행 소유가 같은 application으로 이어 확인한다. 예산 선확보를 최종 decision 배정으로 부르지 않는다.

이번에는 문서의 전용 인계만 추가한다. 새 플랫폼/registry/lease 구현·공통 API/DB/HTTP/schema/web·정책/R3·계약/지급·모델/gold/prompt는 변경하지 않는다. 최신 직접 사용자 허용에 따라 기존 API·Moodle 담당 세션에 정상 신청/현재 원문 lease·실제 모델 수신 접점만 협업 요청했다. 원문/쿠키/키는 채팅이나 공개 파일로 요청하지 않았다. 새 에이전트/채팅·자동 merge·상용 배포·추가 모델평가·새 Mac/Windows 조사/재실행은 없다. 기존 Mac 최초 실패는 이 경로의 AI 성공이나 새 CI 성공으로 해결 처리하지 않는다.
