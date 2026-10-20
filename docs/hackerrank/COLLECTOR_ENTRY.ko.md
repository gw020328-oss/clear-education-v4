# 첫 정상 TEST용 HackerRank 수집 입구

최신: [focused 비교 준비](SOURCE_EXTRACTION_REVIEW.ko.md)는 계정 사본·같은 인증서 행·선택 경로의 값 없는 진단을 구현한다. 목록만으로 종료하지 않고 선택 관찰까지 기다리며 기존 수명/정리 경계를 유지한다. production extractor/recipe/trust 활성화가 아니며 다음 사용자 준비 신호 전 실제 실행은 보류한다.

2026-10-20 최신: schema.2 실행49450 후 [추가 로그인 없는 원천·추출 검토](SOURCE_EXTRACTION_REVIEW.ko.md)를 기록했다. 공개 코드의 계정 경로/인증서 의미와 실제 계정 재확인을 구분하며, 현행 진단을 그대로 반복하지 않는다. 실행 코드·verifier·trust 변경0, 실제 proof0/API HOLD다. 아래82588 준비 기록보다 이 검토를 우선한다.

현재 준비 범위: 이번82588의 account 2차 parser 실패·certificate flat 구조 미확정을 바탕으로 [다음 단1회 진단 준비](LAYOUT_DIAGNOSTIC.ko.md)의 `HACKERRANK_LAYOUT_SCHEMA.2`를 보완한다. 두 parser 상세 거부 사유, 허용/가림 경로·자료형, 행별 필드와 한도 표시만 반환한다. 본부에 준비 완료를 보고한 뒤 사용자 준비 신호 전에는 실제 창/재로그인을 시작하지 않는다. 실제 proof0·trust UNCONFIGURED는 유지한다.

최신 실제 진단: 자체 비밀번호 로그인은 사용자 완료 확인을 받았고 account/certificate 응답을 한 번 관찰했다. 기존 진단은 두 응답 후 정상 자동 종료(exit0/profilesDeleted:true)했으며, 계정 경로·인증서 JSON 해석은 아직 미확정이다. [진단 최신 결과](LAYOUT_DIAGNOSTIC.ko.md)의 strict parser 제한 구분과 값 없는 schema 관찰 보완을 따른다. 아래 실제 로그인0/복구 미확정은 이전 기록이고, **새 request-bound proof0·trust UNCONFIGURED**는 계속 유효하다.

2026-10-20 새 PR 후속: [과거 경로 대조·준비 연결](PREPARED_SOURCE_REVIEW.ko.md)에 같은 collector의 owner를 미리 고정하는 `prepareHackerRankSource`를 추가했다. `pins → collectLease` 저수준 seam만 합성 검증했으며 기존 run/API에 자동 연결하지 않았다. 공식 Community 복구 후보는 확인했지만 Google 가입 계정 적용 가능성·실제 recipe/trust는 미확정이고 새 proof는 0건이다. 로그인 재요청은 본부의 실행 준비 후에만 한다.

최신 2026-10-20 새 담당 인수: 기존 일반 Chrome은 로그인되어 있으나 안전한 request-bound proof 연결은 미완료다. [기존 Chrome 경로 검토](EXISTING_CHROME_ROUTE_REVIEW.ko.md)에 공식 확장 후보, 현재 collector/API 계약 차이, 정확한 외부 차단점과 다음 한 작업을 기록했다. 아래 새 전용 Chrome 재로그인 안내는 현재 실행 지시가 아니다. Google 재시도·비밀번호 변경·쿠키/프로필 복사·새 확장 설치를 수행하지 않는다.

2026-10-20. 실제 원천→AI→100 TEST 정상 시연의 P1 소유 부분이다. 기존 verifier/recipe/pending trust와 .1 request/candidate 형식은 변경하지 않는다. **실제 로그인·원천 수집·공식 hosted proof 생성은 아직 0건이다.** `pending-trust.json`은 계속 UNCONFIGURED다.

## 연결 함수

`src/hackerrank-evidence/run.mjs`의 `runHackerRankCollection(session, options)`를 **새 관리형 저장 worker 안에서** 호출한다. `CLEAR_LOCKED=1`은 기존 locked launcher의 내부 표시다. 외부 HTTP/브라우저 입력으로 session/config/functions를 받아 실행하는 API가 아니다. 실제 실행은 host의 잠금·저장 preflight 및 기존 Chrome 종료/프로필 삭제 책임이 연결되어야 한다. 현재 독립 로그인 CLI/제품 UI는 제공하지 않는다.

정확한 타입은 `run.d.mts`와 `collector.d.mts`다. trusted host가 제공할 함수는 다음과 같다.

1. `waitForReady({signal})`: 새 전용 Chrome에서 본인이 로그인한 후 명시적으로 수집을 시작한다. 기존 사용자 프로필/세션을 재사용하지 않는다. 쿠키/비밀번호를 터미널에 입력하지 않는다.
2. `issueRequest({claimOwner, trustConfigHash, recipeHash, signal})`: API가 현재 신청·participant/wallet·runtimeMappingHash에 결합한 기존 `clear-hackerrank-request.1`을 새로 발급한다. nonce/900초 이하 기간은 API 소유다. `.2` bridge request와 이 P1 요청의 연결도 API가 등록한다.
3. `approveRequest({request, message, signal})`: `requestMessage(request)` 전체에 대한 참가자 승인 envelope를 돌려준다. 수집 동의이며 추가 지급 서명이 아니다. expectedRequest는 서버 발급값이며 envelope.request로 대신하지 않는다.
4. `submit({candidate, recheck, lease, signal})`: 원문 없는 candidate와 process-local lease만 API에 넘긴다. lease는 `read/recheck/isCurrent/dispose`를 제공한다. API는 임의 객체의 메서드를 신뢰하지 않고 **같은 모듈에서 직접 import한 `readHackerRankCollectorLease(lease)`**로 매 수락 직전 검증한다. 이 함수는 private WeakMap identity와 발행한 동일 verifier의 receipt WeakMap·expectedRequest·현재 시각을 검사하고 `{candidate,binding}`을 반환한다.

브라우저 종료와 candidate lease의 수명은 분리한다. lease에는 raw proof/claim context/cookie/owner key가 없으며 원래 request/trust/proof 만료 또는 dispose 뒤 사용할 수 없다. API는 여기에 실제 mode/신청/계정/정책·mapping·`.2` request/lease/current/nonce·중복 방지와 원자 CAS를 추가한다. `durableConsumptionPerformed=false`를 자체 수락으로 바꾸지 않는다. JSON/spread로 복제한 lease와 같은 모양의 콜백은 거부한다. 모듈을 다른 사본으로 로드하면 같은 identity로 인정되지 않는다.

## 수집과 정리 경계

- 수집기 안에서 새 proof owner를 만들고 공개 주소만 요청 발급에 제공한다. owner key는 외부 인수/출력/파일로 전달하지 않는다.
- 첫 account claim의 신뢰한 signer/epoch, 실제 서명, owner, 요청 hash/role/recipe/providerHash, 시간 및 필수 username을 확인한 뒤에만 certificate URL을 구성한다. username 인수나 첫 번째 인증서 하드코딩은 없다. 최종 proof pair는 기존 P1 verifier에서 다시 검사한다.
- context에는 새 요청에 따른 네 필드만 넣고 `extractedParameters`를 클라이언트에서 주입하지 않는다. 고정 SDK 5.1.4, STWO, 동시성1, 최대시도1, 동일 official client를 사용한다. HR prefix의 별도 TLS 인스턴스도 WebCrypto로 초기화한다. recipe를 런타임 응답/OPRF 결과로 다시 쓰지 않는다.
- 쿠키는 고정 dashboard URL 또는 서명으로 확인한 username의 certificate URL에 대한 `Network.getCookies`만 허용한다. 전체 cookie dump/개인 프로필/원문 파일/로그 API는 없다. foreign domain·중복 이름·헤더 주입을 거부한다.
- abort/close는 client 연결 종료를 요청하고 진행 중 작업의 종료를 기다린다. finally에서 key/claim/secret 참조를 해제한다. JS/SDK 문자열·GC·OS swap의 완전 소거를 주장하지 않는다.
- run은 브라우저→route→client 정리를 모두 시도하고 실패를 고정 코드로 반환한다. 정리 실패 때 인계한 candidate lease도 폐기한다. host는 run이 끝난 뒤 기존 `stopRecordedBrowser` 확인→`removeSession` 순서를 유지하며, 이 단계가 실패해도 lease를 폐기해야 한다. 실제 사용자 환경에서 이 조합의 전체 실행/정리는 아직 미실행이다.

## 실제 시작 전에 남은 정확한 공백

`syntheticRecipe()`는 발명한 본문용이라 live로 승격하지 않는다. 실제 authenticated dashboard와 인증서 전체 레코드의 구조/계정 통제 의미, anonymous·다른 계정/인증서 혼입 거부, 필수 capture와 SDK empty-extraction 반례를 검토해야 한다. 공식 registry에서 별도로 얻은 signer/epoch 및 hosted signed request context도 확인해야 한다. proof가 자기 선언한 attestor address로 신뢰 목록을 만들지 않는다.

이번 함수는 REVIEWED config가 없는 상태에서 owner·연결·브라우저·쿠키 읽기를 시작하지 않는다. 따라서 현행 pending config로 로그인을 요구할 단계가 아니다. 실제 원천 형식 관찰용 안전한 명령과 검토 입력, host 잠금/정리/승인 callback 연결을 먼저 준비하고 본부 한 곳에서 최소 행동을 요청한다. 이전 proof나 만료된 request를 새 실행으로 재사용하지 않는다.

연결 시 HackerRank 및 공식 Reclaim attestor/registry에 접속한다. 현재 외부 호출/요금 발생은 0이며 향후 서비스 비용·제약을 확인하기 전 무료라고 단정하지 않는다. 실제 서명 원문은 attestor 및 이 메모리 verifier의 처리 범위이고 공개 저장소/체인/보고서에는 게시하지 않는다. 기존 개인정보 비공개·추가 지급 서명 없음 조건을 해제하지 않는다.

## 검증

`LOG_LEVEL=silent ./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/hackerrank-evidence/*.test.mjs`

네트워크 차단 상태에서 기존 P1와 신규 collection/cookie/lease 경계를 검사한다. 임시 무작위 키의 실제 EIP191 서명 및 발명한 응답을 사용한다. 정상 pair·틀린 요청/서명·trusted signer의 잘못된 context·첫 증명 실패 시 certificate 미접근·재실행 거부·취소·원문 없는 결과·lease 위조/만료/dispose를 포함한다. 실제 hosted SDK 증명 생성/Chrome 로그인 통합을 대신하지 않는다. 타입 파일은 선언 구문 검사이며 전체 TypeScript typecheck를 주장하지 않는다.

## 2026-10-20 현재 단위 인계 — 7항목

1. **성공/차단:** request-bound collector와 process-local branded lease, 원문 없는 형식 진단 CLI를 준비했다. 실제 HR 로그인/증명 0건, pending trust는 UNCONFIGURED다. 실제 계정 통제 의미·recipe·registry signer/epoch·hosted context 검토가 다음 차단점이다. API가 보고한 합성 source의 canonical claim/exact100TEST 성공을 실제 source 성공으로 표시하지 않는다.
2. **작업본/이력:** `workspaces/clear-hackerrank-bootcamp`, `codex/hackathon-normal-source-entry`. collector `a7587d153aad982e0dc86d11d84ae1dfc6f58508`, E2 호환 `5465178`, 진단 `df352f3686a6fe7897f1f0e11483acddb1af576e`. 기존 [PR100](https://github.com/gw020328-oss/clear-education-v4/pull/100)은 a4a05c7 고정이며 후속 패킷은 API [PR102](https://github.com/gw020328-oss/clear-education-v4/pull/102) 통합 담당과 연결한다. 자동 merge/deploy 없음.
3. **미커밋/보존:** 위 구현·검증·공개 안내는 모두 커밋했다. `.toolchain/hackathon-test-vault/e5b/`의 합성 검증 로그와 기존 private 인계 문서는 소유 작업본에 보존한다. 키/쿠키/raw proof/token을 새 문서·fixture로 복사하지 않는다. 기존 TEST 환경은 초기화하지 않는다.
4. **재현/환경/pin:** 위 network-guard HR 시험 명령 및 `tests/hackathon-test-vault/normal-source-compatibility.test.mjs`; E4 회귀 명령은 `.github/workflows/hackathon-e5.yml`의 Frozen E4 단계다. 정상 source intake `specs/bootcamp/hackathon-test-normal-source-intake-v1.json` SHA `410ec5bab91a365cee6909328b0c1a2f847283738b27f66aaf911e2300f47dc9`, 기존 E2/v1/v4 원본 보존. 실제 진단 명령·사용자 행동·외부 전달·비용 제한은 [LAYOUT_DIAGNOSTIC.ko.md](LAYOUT_DIAGNOSTIC.ko.md). 아직 실제 명령 실행 전이다.
5. **검증 구분:** HR 108 PASS(신규 진단14), E4/메모리/서명+원본 snapshot 165 PASS, 모두 fail/cancel/skip0. A/B source 보존 검사 PASS. 고정 launcher/worker 구문 및 개인정보/ready/정리 순서 코드 리뷰 완료. 합성 검증이며 실제 Mac 로그인·SDK hosted proof·actual-source end-to-end 증거가 아니다.
6. **다음 한 작업/소유:** 본부 한 곳에서 위 준비된 비수락 진단을 안내해 실제 형식의 값 없는 요약을 얻고, P1 소유 `src/hackerrank-evidence/` 및 `docs/hackerrank/`에서 recipe 검토를 진행한다. 실제 proof host는 단일 run의 issueRequest가 만든 owner를 먼저 받아 새 mapping/app/.2 request를 발급하고 같은 run의 submit lease를 API에 인계해야 한다. API input 만료·이전 owner·다른 run 재사용은 금지한다. API 937f982 source v5 인수는 root 소유다.
7. **종료 작업:** PR21/36은 다시 시작하지 않는다. 새 세션/에이전트 생성, 기존 채팅 archive, 독립 고도화는 수행하지 않는다. 정상 시연 완료 또는 사용자의 차단점 종료 결정 뒤 본부가 다음 인계를 결정한다.

## 2026-10-20 실제 진단 시작 실패 후 최소 인계 — 7항목

1. 본부 실행은 ready/login prompt 전에 종료됐다. 로컬 정적 검사에서 ybm-collector 의존성 세 모듈 누락을 확인해 설치했다. 실제 접속/Chrome 기동/프로필 삭제 성공은 아직 확인하지 않았다.
2. 소유 작업본/branch는 위와 같다. phase/preflight 수정과 정확 실행 안내는 이 절과 같은 커밋이다. 별도 v5 guard는 `97827ddbeb1eb90007de57cd9053fa9cc1a86aee`, 정상 이력 merge는 `d080211`이다. PR100 고정/API PR102 후속 인수.
3. 수정은 커밋으로 보존하고 설치한 node_modules 및 합성 로그는 ignored 상태다. 키·쿠키·기존 프로필·DB·raw proof를 읽거나 복사하지 않았다. 원문 실패 로그를 요청하지 않는다.
4. 정확 명령은 [LAYOUT_DIAGNOSTIC.ko.md](LAYOUT_DIAGNOSTIC.ko.md)의 기존 주작업본 pinned Node 직접 경로다. 현재 worktree의 ybm prefix에 lockfile 기반 npm ci --ignore-scripts 설치 완료. launcher는 저장/네트워크 전에 모듈 경로를 확인하고 worker는 고정 phase만 출력한다.
5. 세 SDK 모듈의 network-blocked/silent import PASS, HR108 PASS 및 최종 phase/cleanup 진단14 PASS, launcher/worker 구문 PASS. import 점검의 최초 기본 SDK 경고는 silent 설정으로 정정했다. 합성 검증이며 실제 source 성공은 아니다.
6. 다음 한 작업은 본부가 수정된 명령으로 단계 식별 실행을 한 번 수행하는 것이다. 본 담당은 실제 재실행/로그인 요청을 하지 않았다. 로그인 안내 여부는 본부가 기동 상태를 확인한 뒤 결정한다. 소유 경로는 layout-launch/run/worker 및 진단 문서다.
7. 일반 복구 고도화/동시 진단/기존 사용자 프로필·볼륨 삭제/새 세션/PR21·36/자동 merge·deploy 없음. 기존 개인정보 경계와 추가 지급 서명 없음 조건 유지.

## 2026-10-20 Google 로그인 중계 후속 인계 — 7항목

1. 본부 보고: 로그인 화면까지 기동했지만 사용자가 선택한 Google popup이 중계 403으로 차단됐다. 이전 실행 ready0, 본부 close 정리 중이며 삭제 성공은 미단정이다.
2. 기존 clear-hackerrank-bootcamp / codex/hackathon-normal-source-entry에서 이 절과 같은 커밋으로 최소 수정한다. 기존 API source/v5 guard는 바꾸지 않는다.
3. 변경 소유는 layout-run, 진단 시험과 기존 HR 안내 두 문서뿐이다. OAuth URL/state/code/화면/원문/쿠키/키 복사 없음. 기존 사용자 프로필 접근 없음.
4. 정확 accounts.google.com:443만 HR 진단 TLS 중계에 추가했다. 미확인 정적 host와 Google API/서브도메인은 거부한다. 기존 route 기본값/YBM은 그대로다. 명령은 LAYOUT_DIAGNOSTIC.ko.md의 고정 Node 직접 경로다.
5. network-blocked 진단16 PASS, fail/cancel/skip0. 새2개는 실제 loopback 중계의 허용/거부와 Google 본문/cookie/proof 접근0을 검증했다. 관찰기는 기존 HR 두 응답만 유지하고 코드 리뷰에서 변경 범위를 확인했다. 실제 Google 로그인 성공은 아직 미검증이다.
6. 다음 한 작업은 본부가 이전 실행 정리를 확인한 뒤 단일 진단을 다시 여는 것이다. 여기서는 재실행·동시 브라우저·사용자 로그인 요청을 하지 않는다. 추가 host는 실제 필요 확인 뒤 별도 판단한다.
7. 새 SDK/scope/가입/보안설정/유료/일반 복구/PR21·36/새 세션/자동 merge·deploy 없음. 공식 attestor가 추가 Google 목적지·연결 메타데이터·TLS 암호문을 중계한다는 점을 진단 문서에 반영했다.

Google ‘다음’ 무반응 후속은 중계 권한을 추가하지 않고 종료 시 고정 후보4개의 거부 CONNECT host/category/count만 내도록 했다. 임의host/URL/본문/계정정보는 보존하지 않는다. `scope:HACKERRANK_LAYOUT_LOGIN_TRANSPORT`의 값은 중계 차단의 한정된 근거이며 계정 보안 차단이나 필수 script 여부를 단정하지 않는다. networkblocked 진단17 PASS, actual재실행0. 본부가 정리 후 단일실행을 소유하며 자세한 후보/해석/제한은 기존 LAYOUT_DIAGNOSTIC 마지막절이다. 별도A CI누락수정727254e는API에인계했다.

본부의 실제 요약 fonts.gstatic.com1/www.google.com17/www.gstatic.com5 및 단일 실행 정상 정리 보고를 받아 HR 진단에 정확한 이3개 host만 추가 허용했다. accounts와합쳐4 exact/443이며 미관찰ssl.gstatic/다른Google/API/서브도메인은거부한다. www.google.com을정적CDN이나필수script로단정하지않는다. 진단17PASS/Google네host본문·cookie·proof관찰0/실제담당재실행0. 추가TLS목적지·메타데이터중계범위를기존진단문서에반영했고본부가단일정상로그인시험을소유한다. source/v5/YBM/P1actualcollector불변.
