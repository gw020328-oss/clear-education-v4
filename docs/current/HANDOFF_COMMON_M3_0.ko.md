# 공통 M3-0 인계 — 2026-10-15

다음 큰 작업 전에 새 세션 전환을 권장한다. 이 세션은 PR36 및 M1/M2/AI/Moodle/Mac의 여러 최종 통합에서 새 M3 API·저장·공개 원문 수집 설계로 역할이 바뀌었다. 과거 v4/M0/M1/M2의 실행/제안과 실제/합성 관문을 함께 참조해 정본을 혼동할 위험이 있다. 실제 컨텍스트 잔량 수치는 조회하지 못했으며 대화수/자동압축 횟수만으로 판단하지 않았다. 현재 작은 단위는 검사/커밋·Draft PR까지 마쳤고 새 기능을 더 늘리지 않는다. 조정이 인계를 확인한 뒤 기존 세션은 중복 구현을 이어가지 않는다. 이번 문서가 세션 생성·삭제/아카이브 승인이나 기존 DB/키·유료/병합 권한 확대는 아니다.

## 정확한 작업 위치·기준

- repository/worktree: `/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4`
- origin: `https://github.com/gw020328-oss/clear-education-v4`, branch: `codex/product-evidence-contract`
- 기준 develop: `4ae548b8c844f482418f3abfb20a2f1886cac398`(PR54 merge)
- 계약 초기: `4018e32693efe990d70cef5f2524984efab5f977`, 원문/저장 후속: `91430c6feec97fec5de62fdd2a889146005351dc`
- 코드 검토 HEAD: `48d211774d6c78bd2332738c500cc590264c1a48`. 이후 문서 커밋에는 제품 코드 변경이 없다. 인계 파일 자신의 commit은 자기참조할 수 없으므로 최종 branch HEAD/CI는 아래 명령과 PR58 메타데이터로 확인한다.
- 공통 Draft [PR58](https://github.com/gw020328-oss/clear-education-v4/pull/58), 이슈 [55](https://github.com/gw020328-oss/clear-education-v4/issues/55). 자동 병합 승인 없음. 정확한 최신 head의 필수CI/리뷰가 필요하다.
- [AI PR57](https://github.com/gw020328-oss/clear-education-v4/pull/57): 담당은 아직 source 후속 작업 중인 상태에서 이 문서를 작성했다. 준비 완료 인계 전 head를 병합/수정하지 않는다.
- [Moodle PR56](https://github.com/gw020328-oss/clear-education-v4/pull/56): `202ce35cb3c9596b8dcf38b8bd1611ca7cc45033` Draft, 실제 실행 commit `3d73b45a3ef4c58ab51e42a3ebd74ed9f33f9516`. 보고서 실측21/21,CI는 PR의 최신 head를 따름. 원인 미확정 선행run3 기록도 보존.

## 최신 승인·정본과 구현 범위

사용자는 공통 API·저장 계약 정리 → AI·Vision 연결 착수, Moodle1502 실제 재시험·이슈 최신화, 공개 URL 원문 등록/수집 시점 보관을 승인했다. 새 개발/시험/이슈/Draft PR까지만이며 자동 병합/배포는 승인되지 않았다.

정본 제안은 [PRODUCT_WORKFLOW_CONTRACT](PRODUCT_WORKFLOW_CONTRACT.ko.md), 실행 타입은 `src/product-workflow/contract.mjs` 및 `source-contract.mjs`다. **아직 develop 미병합 Draft**임을 유지한다. `src/product-workflow/private-db/review-ledger/public-fetch/source-collector/source-store.mjs`와 `specs/m3/demo.mjs`를 추가했다. 기존 application·HTTP·금고·schema4·의존성/lockfile과 엄격한 F0 view는 그대로다. 새 /mvp 경로는 예약된 API이며 HTTP에 등록하지 않았다. 정책/신청/실제 동의·실제 업로드·인증된 Evidence·M2 판정 저장·재원 adapter/화면은 후속이다.

- 문서 run: 기존 metadata inputHash와 별도 actual bytes manifest/assetsHash, Binding/정책/rule/plan/display/원문bundle/agreement/submission/route revision·run/attempt를 결합한다. ruleVersion은 planVersion이다. VISION signature-only input은 IMAGE_NOT_DECODED로 보류한다. 완전 decode·개인자료 업로드는 아직 없다.
- 새 합성 workflow.sqlite: 앱 전체 revision과 scope head, retry·cancel·timeout·stale·단회 receipt·멱등 조회·DB 재개봉. 내부 resolver/worker 신뢰 API이며 브라우저/모델 JSON을 직접 넘기지 않는다. raw 이미지/텍스트/추출 이름·점수·quote·provider 응답은 저장하지 않는다.
- sources.sqlite: exact HTTPS 허용 공개URL 또는 PASTE/FILE의 raw/text/image bytes와 각각의 SHA256·scope/locator·요청·최종URL·실패 resourceRequests를 불변 snapshot/bundle로 보관.30일 만료·명시 purge는 논리적 삭제이며 디스크 잔재 완전 삭제가 아니다. 확정 정책/개인자료 운영 보관 관문은 OPEN이다.
- fetch: 허용URL/public DNS IP검사→고정 IP/TLS hostname,동일origin·허용URL redirect,timeout/size/resource caps. 쿠키·사용자headers·script·form·자동링크추적 없음. 실제 웹사이트 수집은 실행하지 않았고 합성 transport로만 검증했다. HTML은 PARTIAL/JS 미실행·미수집 이미지·휴리스틱/UTF8 한계를 보존한다.
- source lookup: institution/product/cohort·raw/text/image 지문/만료를 검증. snapshot/bytes를 await 직후 복사한다. missing/partial는 보완, 읽혀도 READABLE_UNVERIFIED. M1 Source rawHash는 RESPONSE_BODY.sha256, normalizedHash는 textArtifactId.sha256,normalizerVersion=extractionVersion,capturedAt=collectedAt,locator는 정확한 block이다. host 독립 pin·origin을 자동 repin/합성 승격하지 않는다.

## 소유권·연계

공통은 `src/product-workflow/`, `specs/m3/`, 공통API/DB·정본문서/rootCI만 소유한다. AI는 `src/document-precheck/`, `src/ai-policy/`의 전용 consumer adapter와 전용tests/docs만 소유한다. Moodle은 별도 재시험 소유 파일만 변경한다. 다른 worktree checkout/reset·DB/체인/키를 수정하지 않는다. F0 `origin/codex/frontend-shell:web/src/adapter/contract.js`의 엄격한 ApplicationView/list/get interface는 읽기 확인했고 새 namespace로 보존했다. 프론트 수락/화면은 PENDING이며 연락/승인되지 않은 세션에 메시지를 보내지 않는다.

승인된 이번 연계 세션: AI `01a13887-c25c-71f0-b4d9-478ab5a3de76`(Sol/Medium), Moodle `01a13888-3c80-7762-bb07-1bd41e084834`(Sol/Medium). 공통은 계약4018e32와 후속91430c6/48d2117의 정확한 DTO·소유권·착수 신호를 AI에 전달했다. AI는 contract를 이력merge해 Draft57로 연결 중이며 URL을 직접 fetch하지 않는다. 유료 호출0을 요구했다. 세션 간 메시지는 이 통합/재시험 범위만 허용됐다.

이슈39 본문은 PR54 v4 정상T01 개선·충돌T04/누락V02 유지·실제5생성+5count/오류0/합성3사례 한계·과거원장보존·프로젝트/환경키/Tier1 복구확인·실청구 미확인으로 수정했다. 계정/메일/키suffix·결제ID는 공개하지 않았다. 이슈40은1502 새run4의21/21을 완료 체크하고1501의과거15+6과 구분했다. 둘 다 운영 원천/동의/영속 수락 등 후속이 있어 OPEN이다.

## 검사·재현과 실패/한계

고정 Node24.21.0만 사용한다. 신규 공통36개 tripwire 회귀,합성 새DB 데모,workspace 원본/legacy191개·의존성보존 PASS. CI에 전용glob+demo를 편입했다. 초기계약10→ledger/source28→최종36은 중복 총계를 합산하지 않는다. 두 프로세스의 상충 완료는1건만 수락, 재시작/중복/만료/철회/CAS,같은metadata 다른bytes,SSRF/DNS rebinding/redirect/MIME/limits,원문불변/만료/부분·누락/mutable lookup을 검사했다. 실제 URL/개인자료/AI/체인 호출은0이다. 최종 head의 원격 CI 성공 여부는 PR58에서 확인한다.

```sh
git status --short --branch
git fetch origin
gh pr view 58 --json headRefOid,state,isDraft,statusCheckRollup
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/product-workflow/*.test.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs specs/m3/demo.mjs
./tools/npm run verify:workspace
./tools/npm run verify:dependencies
./tools/node tools/check-public-content.mjs HEAD
```

Moodle1502의 OS시계역행/300초 상한은오프라인fixture이며 실제OS조작·실대기가 아니다. run3로그인실패(AUTH_LOGIN_FAILED=3)의정확원인도 미확정이다. 이번21/21성공이나Mac53경합수정으로 모든과거실패를해결했다고하지 않는다. 실제기관HTTPS/공식출석의미/신원/90·100일/운영Evidence/DB수락은OPEN이다. 과거본인YBM 수집·새증명을 재실행하지 않는다.

## 바로 다음 작업과 전환

1. PR58·57·56의 최신 head/CI/중복diff/담당동결상태와 이슈55/39/40을 확인한다. 이 PR들의 자동 병합 권한은 없다.
2. 공통 계약과 AI 두adapter가 같은 source/byte/run commit을 사용하는지 읽고, 새 합성 DB의host begin→AI summary→complete/restart를 통합 검증한다. 기존 사용자DB는 사용하지 않는다.
3. 이 작은 단위 검토가 끝난 뒤 M3-1 HTTP/정책·신청/실동의 저장 범위를 새 승인·작은 Draft PR로 정한다. 필요 원천/실명/보관·삭제와 운영자의 검토 권한을 추측으로 활성화하지 않는다.

조정이 문서를 확인해 새 세션을 만들면 기존 공통 세션은 추가 구현을 멈추고 결과 조회/인계 질의에만 응답한다. 진행 턴을 강제로 중단하거나 세션을 임의 삭제/아카이브하지 않는다. 실제 실행 요청 설정은 GPT-6.1 Sol / High(설계·여러모듈), 다음 확정명세 일반구현 권장은 Sol/Medium이다. 현재턴에서 설정을 임의 전환했다고 주장하지 않는다. 어려운 증명/서명/자금/민감정보 수명 충돌이 나타나면 증거를 정리하고 Astra/High 실질리뷰 필요성을 판단한다.

### 새 세션 시작 프롬프트

공통 M3 인계를 이어받아라. repo/worktree는 위 경로이며 먼저 AGENTS.md와 이 인계, PRODUCT_WORKFLOW_CONTRACT를 읽어라. 현재 develop와 Draft58/AI57/Moodle56의 정확한 head·CI·담당 동결상태를 새로 확인하고 기존 브랜치/미커밋 변경을 보존하라. 인계코드HEAD48d2117과 후속 문서커밋을 구분하라. 이 단계는 API/저장 계약·bytes/source snapshot·합성 run ledger/consumer module이며 HTTP/실동의/운영Evidence/판정·재원 전체연결 완료가 아니다. 먼저 소비자 통합 검증 결과/미결을 정리하고 다음 작은 승인 범위를 따른다. 본문에 없는 유료·로그인·proof·DB/체인/키 변경·자동병합 권한은 추론하지 마라. 예치율/배정/충전정책OPEN,400%사전검토만/500%제외,원천/동일인미확인 차단,grant/outbox HOLD·독립claim NO-GO와 기존자산을 보존하라. 다음 일반 구현은 Sol/Medium 권장이고 필요한 검사·소유권·개인정보 기준은 그대로 유지하라.
