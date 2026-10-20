# HackerRank 원천 의미·추출 규칙 검토

현재 우선순위는 [실제 증명 쌍과 정상 흐름 연결](PREPARED_SOURCE_REVIEW.ko.md)이다. 아래 focused 진단의 추가 실행·확장은 멈췄으며 준비 완료만으로 재로그인을 요청하지 않는다. `250946e` 원격4/4 SUCCESS로 해당 작은 단위를 마쳤다.

## 완료한 작은 단위: 고정 경로 비교의 진단 전용 준비

본부의 계속 준비 지시에 따라 [layout-focused.mjs](../../src/hackerrank-evidence/layout-focused.mjs)를 추가했다. 아래 a024aeb 조사에서 공개 근거로 확인한 경로만 비교한다. 결과는 `focusedReview.version=HACKERRANK_FOCUSED_REVIEW.1`이며 기존 schema.2 구조 요약을 유지한다. 아래 “문서만 변경/비교 코드 미구현”은 **a024aeb 당시 조사 기록**이다.

- account는 하나의 NEXT_DATA와 정확한 direct/cache 경로, queryKey `["prefetchData"]`의 유일성, 두 username의 string/기존 source ID 형식/동등성을 확인한다. 다른 query·다른 위치의 username으로 보충하지 않는다.
- certificate는 data의 최대32행 안에서 id·username·status·label/level/track_slug·두 test ID의 타입과 관계를 보고한다. ID 중복·shadow certificateId·다른 계정·교차 row·선택 ID 부재/충돌을 일치로 처리하지 않는다. **certificate.unique_id의 실제 존재는 아직 미확정**이며 누락은 UNAVAILABLE/UNRESOLVED다. attributes.certificates는 비교에 사용하지 않는다.
- 전체 JSON을 먼저 기존 bounded scanner(depth48/node32768, account1MiB/certificate64KiB)로 검사한다. 그 뒤 진단 내부의 JSON.parse 사본에서 숫자는 reviver가 즉시 타입용 sentinel로 버리며 값 비교/수치 연산에 사용하지 않는다. 필수 필드 숫자는 number로 보고하고 string으로 인정하지 않는다. 이는 아래 “수치 해석 없는 scanner” 방향의 진단 적용이며 signed strictJson은 그대로다. decoded 중복/위험 key·전체 문법·한도는 검사 전후 우회하지 않는다.
- 일반 schema.2의 unrelated PATH_DEPTH_LIMIT와 고정 경로 비교 결과는 별개다. focused 비교도 전체 JSON 검사를 통과해야 하지만, 경로를 알고 있는 필드를 찾기 위해 모든 하위 경로를 재귀 탐색하지 않는다.
- private username/query/행 ID/선택 ID는 비교 closure에만 머물며 완료·취소·close에서 참조를 해제한다. 원문 bytes는 기존 finally에서 덮어쓴다. 출력은 고정 enum/bool/type/최대32 slot이며 값·해시·임의 key·URL을 내보내지 않는다. JavaScript 문자열/GC/swap의 물리적 완전 소거 보장은 아니다.
- 관찰기는 ready 이후 같은 CDP session의 top-frame full navigation 또는 SPA navigation에서 `/certificates/<영숫자 ID>`(끝 `/` 허용)를 확인한다. 상세 페이지 본문을 읽거나 새 endpoint를 요청하지 않는다. 다른 탭/하위 frame은 제외한다. query/추가 경로는 INVALID로 표시하며 값은 출력하지 않는다.
- 자동 종료는 **account body + certificate list body + 선택 경로 관찰**의 세 조건이다. 목록만으로 닫지 않는다. 세 조건 충족은 관찰 완료이며 비교 통과가 아니다. 선택이 없으면 기존 15분 상한·close/취소를 유지한다. 종료 시 `observationsComplete`와 focused outcome을 따로 읽는다.

`STRUCTURE_AND_RELATIONS_OBSERVED`는 두 계정 사본·query·모든 행 계정·유일 선택 ID·목표 종류·허용 status·test 연결이 관찰상 일치했다는 뜻이다. FAILED status도 관계 확인에는 들어갈 수 있으므로 자격/합격 성공을 뜻하지 않는다. 여러 target이 있으면 targetCount=MULTIPLE로 남고 관찰된 명시 선택과 한 row의 연결을 별도 검사한다. 누락·미지원·충돌은 UNRESOLVED, 미관찰 입력은 WAITING_FOR_INPUT이다. 어느 경우에도 proof/account-control/account-join/request-bound는 false, API HOLD다.

관련 합성 검증은 새 focused 비교10개와 변경된 capture/runner 경계를 대상으로 한다. 다른 계정/query/ID/인증 종류·복수target·중복ID/부모·교차row·cache 충돌·숫자/타입/누락·한도·선택 대기/취소/다른frame·동시 응답·비노출 및 관찰기 전체를 거치는 합성 연결 사례를 포함한다. 기존 일반 suite를 수동 반복하지 않고 기존 HR CI wildcard가 이 파일도 실행한다. 최신 수치·원격 결과는 PR103의 해당 head 기록을 따른다.

로컬 최종 검증은 고정 Node24.21.0/network guard 아래 focused **10/10**, capture/runner **27/27**, 합계 **37/37 PASS**다. 마지막 정상 capture 연결 fixture의 구문 오류는 검사에서 발견해 수정한 뒤 해당 파일27개를 다시 통과했다. 제품 경계(values/verifier/recipes/request/collector/pending-trust) diff0, 문서 상대 링크/diff check PASS다. 기존 schema survey13개는 변경하지 않아 로컬에서 반복하지 않았고, 기존 HR CI wildcard는 세 파일을 함께 실행한다.

**현재 실행 조건:** 실제 원천 recipe·필수 검증과 통합 입력 준비를 먼저 끝낸 뒤 본부가 새 증명 한 번의 실행을 조율한다. 아래 진단 절차를 다음 로그인 요청으로 재사용하지 않는다.

## a024aeb의 추가 로그인 없는 조사 기록

2026-10-20. PR103의 `5270cf125e04e36a63ecea551967e82ff6897042` / schema.2 실제 실행 **49450**을 출발점으로 한 추가 로그인 없는 조사다. 82588·92921 결과를 이번 관찰로 바꾸지 않는다. 추천 설정은 증명·개인정보 경계 검토에 맞춘 Astra / High이며, 안내만으로 현재 턴의 실제 모델 설정이 바뀌었다고 주장하지 않는다.

**결론:** 공개 배포 코드로 계정 경로 후보와 인증서 목록의 ID·제목·상태 해석을 좁혔다. 실제 계정의 정확한 경로·값 일치와, 선택 공개된 바이트만으로 경로/중복/동일 레코드를 검증할 recipe는 미확정이다. 기존 flat 합성 recipe를 실제 nested 응답에 적용하지 않는다. verifier·recipe·trust·collector·진단 실행 코드는 변경하지 않았다. 새 로그인/창/실제 proof/신청/AI/체인/지급은 0건이다.

## 이번 실제 관찰과 조사 방법

49450은 사용자 로그인 완료 후 ready 1회, account·certificate 관찰, **exit0 / profilesDeleted:true**로 정상 자동 종료했다.

| 원천 | 49450에서 확인한 것 | 확인하지 못한 것 |
| --- | --- | --- |
| account | NEXT_DATA 1개, 1차 SIZE_LIMIT, 2차 ACCEPTED; string username 후보 2개; 모두 중간 키가 가려짐; PATH_DEPTH_LIMIT | 정확한 중간 키, 두 username 값 일치, 인증된 본인 계정 제어 |
| certificate | 1차 NUMBER_FRACTION, 2차 ACCEPTED; data object 행 1개; attributes.username/status와 일반 id는 string; attributes.certificates는 string 항목 1개 배열; 진단 한도 초과 없음 | ID·인증 종류·status의 값, nested certificate metadata, 계정과의 값 일치, 사용자 선택 ID |

인증서의 MULTIPLE_RECORDS_OR_ARRAYS_REQUIRE_REVIEW는 두 후보 배열 때문이었다. data에서 복수 사용자 행을 관찰했다는 뜻이 아니다. MISSING은 schema.2가 보고하는 의미 후보의 부재이며 원문에 다른 이름의 관련 필드가 없다는 뜻이 아니다. 원문·프로필은 삭제됐으며 복구하지 않았다.

별도의 쿠키 없는 HTTP GET으로 공식 dashboard와 Python(Basic) 소개/카탈로그를 읽고, 해당 HTML이 참조하는 hrcdn 공개 JavaScript를 대조했다. 브라우저·개인 쿠키·로그인 세션·다른 사람의 인증서/프로필은 사용하지 않았다. 익명 HTML은 메모리에서 경로와 자료형만 확인하고 저장하지 않았다. 공개 JavaScript만 작업용 임시 디렉터리에 보관했으며 저장소에 복사하지 않았다.

## 근거 위치

배포 파일의 URL·SHA-256과 module/검색어는 이번 조사 버전을 식별한다. 향후 배포가 바뀌면 같은 사실이라고 가정하지 않는다.

| ID | 공식 공개 근거와 위치 | 확인 범위 |
| --- | --- | --- |
| A | [dashboard](https://www.hackerrank.com/dashboard), 익명 HTTP200 | NEXT_DATA.props.pageProps에 prefetchedData, dehydrateState. prefetchedData.profile과 queryKey가 `["prefetchData"]`인 cache의 state.data.profile은 빈 object였다. |
| B | [49946 배포 코드](https://hrcdn.net/hrc/_next/static/chunks/49946-0db70d9fcde19ae0.js), `prefetchQuery`, `prefetchedData:g` 검색 | 서버 문맥의 prefetch 결과를 query cache와 prefetchedData 양쪽에 사용한다. SHA-256 `6b3897927a0c9a269208e49575d9758116152af8e8625954271731c14772ef9e`. |
| C | [_app 배포 코드](https://hrcdn.net/hrc/_next/static/chunks/pages/_app-253214f045228b7c.js), modules 75374, 84180, 31839, 31995 | prefetch는 `/prefetch_data?get_feature_feedback_list=true` GET. 서버 요청 쿠키를 전달하며 username query를 구성하지 않는다. profile schema는 username string을 허용하고 UI가 profile을 로그인 상태에 사용한다. SHA-256 `73bb9dc361cc0e6d0552c901ee835be201cdd140b88b0926d628a0d31fb47c87`. |
| D | [community 배포 코드](https://hrcdn.net/fcore/assets/static/js/async/hackerrank_r_community.08ac76eed4.js), getSkillsVerificationResults, modules 630709, 110593, 218196, 928144 | 목록/상세 endpoint, username query, 제목 조합, 상태 enum, 공개 인증서 경로. SHA-256 `832099e78f8722ccbc1d3618dd5f2b8cab0754676b66239673030114bbc02d9b`. |
| E | [app reducer 배포 코드](https://hrcdn.net/fcore/assets/static/js/async/hackerrank_r_app.025945207c.js), LOAD_RESULTS, certificateId:e, test_unique_id 검색 | 목록 행의 id를 certificateId로 옮기고 attributes를 결합한다. nested certificate를 시험 metadata로 분리하며 test_unique_id로 결과와 연결한다. SHA-256 `669e49be639bcd0e004b683b3f9f96d2543f6568aa09c36f7502abdac7bc66fb`. |
| F | [certificate 화면 배포 코드](https://hrcdn.net/fcore/assets/static/js/async/hackerrank_r_skills_verification.1d5cf10dae.js), module 521287, currentCertificateId 검색 | certificateId와 조합한 제목을 표시한다. 공개 상세 화면은 그 인증서의 username으로 다른 인증서 목록도 조회한다. SHA-256 `d89592cf07f6dc678be8273d3d0ddc3b26a95808e1a3794cdfa98a733fbca10d`. |
| G | [Python(Basic) 공식 소개](https://www.hackerrank.com/skills-verification/python_basic), [공개 catalog API](https://www.hackerrank.com/community/v1/certificates/python_basic) | 익명 HTTP200의 catalog attributes는 label=Python, level=Basic, track_slug=python_basic, test.type=skill이다. 시험 종류 metadata이며 개인의 합격·보유 증거는 아니다. |

SDK 근거는 설치된 고정 `@reclaimprotocol/attestor-core` **5.1.4**의 lib/index.js다. extractJSONValueIndexes는 7000행 부근, responseMatches의 첫 regex match/named group 처리는 7491행 부근이다. [공식 소스 저장소](https://github.com/reclaimprotocol/attestor-core)의 최신 버전과 설치 버전이 같다고 가정하지 않는다. 로컬 경계는 [recipes](../../src/hackerrank-evidence/recipes.mjs), [verifier](../../src/hackerrank-evidence/verifier.mjs), [collector](../../src/hackerrank-evidence/collector.mjs), [values](../../src/hackerrank-evidence/values.mjs)를 대조했다.

## 확정·후보·실제 재확인의 구분

| 항목 | 근거로 확정한 사실 | 후보 또는 실제 재확인이 필요한 부분 |
| --- | --- | --- |
| account direct 경로 | 공개 구현의 `props.pageProps.prefetchedData.profile.username` | 49450의 두 번째 가려진 경로가 이 경로였는지는 원문 삭제로 확정 불가 |
| account cache 경로 | `props.pageProps.dehydrateState.queries[*].state.data.profile.username`; queryKey `["prefetchData"]` 항목 | 49450의 첫 가려진 경로와 정확한 대응 및 두 값 일치. 임의 query/첫 배열 항목 선택 금지 |
| 두 후보의 역할 | 같은 prefetch 데이터를 direct props와 hydration cache에 담는 구현 | 독립된 두 계정 증거가 아니다. 값이 다르면 우선순위로 덮어쓰지 않고 거부 |
| 계정 통제 의미 | 고정 dashboard가 세션 쿠키를 사용하는 self-prefetch를 소비하며 익명 profile은 비어 있음 | 실제 로그인 응답의 정확 경로와 원천/서명 결합. 공개 profile·인증서·표시 이름으로 대체 불가 |
| data[i].id | 공식 목록 reducer와 화면은 certificateId/인증서 링크 ID로 사용 | 실제 ID 형식·중복·사용자 선택과 일치. 모든 일반 id를 같은 뜻으로 인정하지 않음 |
| 인증서 종류 | 공식 제목은 label·level 조합; catalog Python/Basic/python_basic 대응 | 실제 attributes.certificate metadata의 존재·타입·값. catalog로 개인 응답의 누락을 채우면 안 됨 |
| 상태 | 공식 enum PASSED=test_passed, FAILED=test_failed | 실제 status의 enum 일치. 실패 시험이 항상 발급 인증서 ID를 가진다는 보장은 없음 |
| 동일 레코드 | 목록 row attributes와 nested certificate metadata를 사용하고 test_unique_id로 UI 상태 연결 | 실제 username/status/id/metadata가 하나의 row에 있는지. UI의 다른 row 병합 결과를 증거로 쓰지 않음 |
| attributes.certificates | 실제 string 배열; 공개 코드에 첫 항목을 읽는 selector가 있음 | 원소가 ID인지 종류/표시 문자열인지 미확정. ID·종류를 보충하는 fallback으로 사용하지 않음 |

`/certificates/:certificateId`와 `/community/v1/test_results/:certificateId`는 공개 코드에 존재한다. 실제 개인 ID로 호출하지 않았다. 공개 상세에서 조회되는 username은 **인증서 소유자로 표시된 계정**일 수 있으므로 보는 브라우저의 로그인 계정과 같다고 가정하지 않는다.

## 고정할 수 있는 추출 규칙 후보

아래는 활성화된 recipe가 아닌 다음 원천 검토와 합성 반례의 기준이다.

1. account는 기존 고정 dashboard GET의 서버 응답만 사용한다. DOM 변경 후 값·입력 username·공개 프로필 이름은 배제한다. NEXT_DATA가 없거나 둘 이상이면 보류한다. JSON 전체의 크기·깊이·node·중복/위험 key·문법을 먼저 검사한다.
2. direct 경로의 string username과 **정확히 하나의** queryKey `["prefetchData"]` 항목의 string username이 원형 그대로 같아야 한다. 대소문자 변환·trim·첫 후보 선택으로 충돌을 숨기지 않는다. 일반 재귀 탐색의 unrelated PATH_DEPTH_LIMIT와 고정 경로 검사를 구분하되 JSON 전체 한도는 우회하지 않는다.
3. certificate 요청의 단일 username query는 검증된 account username에서만 유도한다. 진단에서는 값 비공개 동등성만 관찰하며 서명된 계정 결합이라고 부르지 않는다. response URL과 요청 URL 전체 일치, 기존 GET/HTTP200/MIME/cache/redirect 거부도 유지한다.
4. 인증서 후보 배열은 data만 검토한다. 최대 32개 row의 ID와 attributes를 각 row 안에서 확인한다. attributes.certificates를 별도 record 집합으로 승격하지 않는다. 전 row의 중복 ID·잘못된 타입·다른 계정 혼입을 거부하며 교차 row에서 필드를 모으지 않는다.
5. 후보 매핑은 `id → certificate ID`, `attributes.username → source username`, `attributes.status → issuer status`, `attributes.certificate.{label,level,track_slug} → 종류`다. Python/Basic/python_basic의 **같은 row 내 일관성**을 확인한다. attributes.test_unique_id와 certificate.unique_id의 존재·타입·일치도 관찰해 연결 규칙을 확정한다. 실제 구조 확인 전 후자의 존재를 가정하지 않는다.
6. target row가 하나면 유일 후보이며 여러 개면 명시 선택이 필요하다. request에 선택 ID가 있다면 그 ID·계정·종류·상태를 같은 row에서 확인한다. 선택 ID가 다른 종류이거나 중복이면 거부한다. URL/화면 선택을 관찰하지 않았다면 “사용자 선택 일치”를 true로 만들지 않는다.
7. 현재 flat username/certificate_id/certificate_name/status는 합성 recordShape다. nested 응답을 로컬에서 이 모양으로 바꿔 attestor가 추출·서명한 것처럼 context에 넣을 수 없다. 실제 원천 바이트와 연결되는 새 버전 추출 계약·독립 검증이 먼저 필요하다.

## 소수 숫자와 서명된 추출의 경계

NUMBER_FRACTION은 이번 **첫** strict 거부 원인이다. 어느 필드의 소수였는지는 진단하지 않았다. 공개 catalog에 숫자 metadata가 있다는 이유로 특정 필드라고 단정하지 않는다.

최소 판독 후보는 bounded JSON scanner가 모든 token을 검사하되, **사용하지 않는 숫자는 문법을 검증하고 값으로 변환하지 않는 방식**이다. 소수·지수·큰 정수를 무시하더라도 모든 object의 decoded key 중복(escape 별칭 포함), 위험 key, 전체 문법과 한도 검사는 유지한다. 필수 username/ID/status/종류가 숫자이면 거부한다. 전역 strictJson의 signed params/context·시간·요청 검사를 완화하지 않는다.

로컬 scanner 통과는 악의적인 수집기가 attestor에 무엇을 공개했는지 검증하지 않는다. 현재 SDK의 JSONPath는 **클라이언트 공개 범위 선택** 기능이고 responseMatches는 regex 첫 match의 named group을 추출한다. 이를 경로 유일성·동일 레코드·중복 키 보장으로 대체할 수 없다.

고정 Node24.21.0/network guard와 발명한 입력으로 다음 반례를 실행했다(**2/2 확인**, 실제 proof0):

- 중복 부모 profile key에서 SDK JSONPath가 반환한 raw 범위와 JSON.parse의 최종 값 해석이 달랐다. 기존 진단 scanner는 DUPLICATE_KEY로 거부했다.
- 경로를 고정하지 않은 username regex는 self 경로보다 앞의 다른 컨테이너 username을 추출했다. SDK 추출 성공이 self-source 성공을 뜻하지 않았다.

후속 recipe는 attestor가 확인하고 서명한 공개 바이트/추출값에서 독립 verifier가 경로·필수 field·중복·동일 row를 재검사할 수 있어야 한다. 전체 dashboard 공개는 크기뿐 아니라 email 등 불필요한 profile 값 공개 문제가 있어 단순 대안으로 채택하지 않는다. 가린 부분에 추가 동명 key/row를 숨길 수 있는지, mask 제거/접합으로 원래 없던 경로를 만들 수 있는지까지 합성 반례가 필요하다. 이를 충족하는 최소 공개 recipe는 **미확정**이다.

## 다음 한 번의 실제 관찰에 필요한 최소 항목

**지금 재로그인할 필요는 없다.** 현행 schema.2는 아래 비교를 모두 보고하지 않는다. 같은 조건으로 다시 실행하지 않고 고정 경로·값 없는 비교를 진단 전용으로 준비·검증한 뒤, 본부가 사용자 준비 신호를 받아 한 번만 실행한다. 이 문서 변경은 그 후속 진단 코드가 이미 준비됐다는 뜻이 아니다.

| 대상 | 필요한 고정 출력 | 통과/보류 기준 |
| --- | --- | --- |
| account | NEXT_DATA 개수, 두 정확 경로 존재·타입, prefetchData query 개수, username 동등성 enum | 하나의 script/한 cache 항목/두 string/동일. 누락·여러 항목·불일치·parser 한도면 보류 |
| certificate | data 행별 고정 필드 존재·타입, label/level/track_slug 목표 일치 enum, status 허용 enum 여부, ID 형식·중복 | 같은 행에 필수 필드와 일관된 목표 metadata. 다른 인증서의 필드로 보충 금지 |
| test 연결 | row test_unique_id와 nested certificate.unique_id 존재·타입·동등성 | 없거나 다르면 해당 연결 규칙을 미확정으로 유지 |
| 계정 관계 | certificate query 및 각 row username과 account username의 동등성 | 다른 계정/불일치 거부. 관찰을 account control proof로 승격하지 않음 |
| 선택 관계 | target 행 개수, 같은 탭의 인증서 경로에서 선택 ID 관찰 여부와 target ID 일치 여부 | 유일 후보와 명시 선택 일치를 분리. 미관찰 NOT_OBSERVED, 복수 후보 AMBIGUOUS |
| 종료 | 두 응답 관찰 여부, exit, profilesDeleted | 기존 15분 상한·자동 정리. 오류/취소/한도/삭제 실패는 통과가 아님 |

비교 문자열은 진단 메모리 안에서만 잠시 사용하고 값·해시·임의 key·실제 URL query·개인 ID를 결과/로그에 남기지 않는다. 원문/프로필 보존·재사용은 없다. 기존 두 body 원천을 유지한다. 상세 endpoint가 정말 필요한지는 그 결과 뒤 결정하며 미리 추가하지 않는다.

주의: 현재 관찰기는 프로필에서 목록 응답만 먼저 발생해도 자동 종료할 수 있다. 선택 ID를 최소 관찰에 포함하려면 코드 준비 단계에서 이 순서를 다뤄야 한다. 사용자에게 이미 닫힌 탭에서 인증서를 다시 열라고 요구하거나 선택 미관찰을 성공으로 처리하지 않는다.

실행 전 합성 반례는 다른 계정 query/row, 다른 인증서·선택 ID, 교차 row, 복수 target·중복 ID, 누락/null/잘못된 타입, escaped 중복·위험 key, 잘못된 queryKey/중복 NEXT_DATA, 양쪽 profile 불일치, unrelated 소수·지수·큰 정수와 뒤따르는 중복/문법 오류, 각 입력 한도, 출력의 sentinel 값/URL/해시 비노출이다. 기존 scanner 반례를 재사용하고 새 비교 경계만 추가한다.

## 상태와 후속 판단

이번 변경은 조사 문서와 최신 인계 링크뿐이다. 무관 full suite/기존 실제 시연을 재실행하지 않았다. 5270cf1의 기존 34개 진단 합성 시험 및 원격 4/4 CI 성공은 이전 검증이며 이번 조사와 구분한다. 신규 오프라인 SDK 반례 두 개는 위에 별도 기록했다.

공개 소스의 역할·규칙은 좁혔지만 실제 계정 정확 경로/동일 row/선택 관계는 후속 진단, **원천에 결합된 최소 공개 recipe는 별도 설계 관문**이다. 공식 signer/epoch 승인과 hosted signed request context도 미확정이다. 하나의 통과가 나머지를 대체하지 않는다.

pending-trust=UNCONFIGURED, actual request-bound proof0, authenticatedAccountControlProven=false, accountJoinProven=false, proofVerified=false, requestBound=false, API HOLD/paymentAllowed=false를 유지한다. 본부 보고 전후에 새 진단창·로그인·증명 실행을 자동 시작하지 않는다.
