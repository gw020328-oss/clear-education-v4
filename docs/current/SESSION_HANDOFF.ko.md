# CLEAR 새 세션 인계

2026년 10월 12일 PR #4 병합 후 상태다. 다음 세션의 첫 작업은 **진단용 증명 경로와 제품 신청·정책·자격·지급 설계의 차이 점검**이다. 실제 YBM 증명 2건 생성과 독립 검증은 성공했지만, 환급 자격 판정과 지급까지 완료한 제품은 아니다. 이번 인계에서는 제품 코드·과거 보고서·원본을 바꾸지 않았으며 새 로그인·증명 생성·거래·배포도 실행하지 않았다.

## 저장소와 인계 상태

| 항목 | 확인 결과 |
| --- | --- |
| 저장소 | https://github.com/gw020328-oss/clear-education-v4 |
| 작업 경로 | `/Users/ohgyuwon/Documents/ChatGPT/블록체인/workspaces/clear-education-v4` |
| 최신 원격 develop | `366417e3fd7b0cc64ed905cd65a4880955313419` |
| PR #4 | [동일 client YBM 증명 생성·독립 검증 연결](https://github.com/gw020328-oss/clear-education-v4/pull/4), GitHub 상태 MERGED, 대상 develop |
| 병합 시각 | 2026-10-12 11:20:18 KST / 02:20:18 UTC |
| PR 마지막 코드 커밋 | `0a08b4ef518abc1255da9ee1314a724fbaae2294` |
| 보존한 구현 브랜치 | `codex/ybm-proof-verification` |
| 현재 로컬 브랜치 | `codex/pr4-handoff`, 최신 origin/develop에서 만든 문서 전용 브랜치 |
| 현재 HEAD | `366417e3fd7b0cc64ed905cd65a4880955313419` |
| 미커밋 변경 | 이 인계 파일 `docs/current/SESSION_HANDOFF.ko.md`만 신규 파일로 남긴다. 인계 시작 전에는 작업 트리가 깨끗했다. |
| 외부 반영 | 인계 브랜치·문서는 커밋/푸시/PR 생성/병합하지 않았다. 같은 로컬 경로의 새 세션에서 읽을 수 있다. 원격 새 복제본에는 아직 없다. |

다음 세션은 먼저 `git status --short`, `git fetch origin`, `git rev-parse origin/develop`로 변화를 확인한다. 이 인계 파일을 보존한 뒤 새 구현은 최신 origin/develop 기반 `codex/` 브랜치에서 시작한다. 인계 파일 때문에 강제 checkout/reset/clean을 사용하지 않는다. 부모 폴더나 홈 Git은 이 프로젝트의 작업 범위가 아니다. 현재 브랜치가 origin/develop을 추적하므로 **인자 없는 push를 쓰지 않는다**. 푸시할 때는 작업 브랜치 이름을 명시하고 main/develop에 직접 푸시하지 않는다.

## 읽는 순서와 우선순위

1. [AGENTS.md](../../AGENTS.md) 전체를 읽는다. 위에서 아래로 누적된 과거 상황 설명과 최신 승인 사항을 구분한다. 각 단계 시작 전 추천 모델·추론 수준·이유를 안내하고, 실제 모델을 바꿨다고 임의로 주장하지 않는다.
2. [Mac MVP 승인 변경](MAC_MVP.ko.md)을 읽는다. 원래 PRD/설계의 strict tmpfs·필수 추가 TEE·타 사용자 실증 범위 중 바뀐 부분은 이 문서와 AGENTS의 최신 승인 절을 적용한다.
3. [PRD v0.3](../reference/PRD.ko.md)의 D01–D15, A01–A18, U01–U06과 [기술 설계](../reference/DESIGN.ko.md)의 정책·서명·평가기·DB·금고·발급·독립 청구를 읽는다. [구현 계획](../reference/IMPLEMENTATION_PLAN.ko.md)의 W03–W15를 의존 관계로 사용한다. 날짜는 목표이지 완료 근거가 아니다.
4. [실제 증명 보고서](../w02/YBM_PROOF_REPORT.ko.md)의 마지막 실제 성공/PR 검토 절과 [기계 판독 기록](../w02/ybm-proof-verification.json)을 읽는다. 그다음 [신청·지갑/원천 형식 보고서](../w02/YBM_BINDING_REPORT.ko.md), [접속 경로 보고서](../w02/YBM_ROUTE_REPORT.ko.md)를 필요에 따라 읽는다.
5. [Mac 저장 구현](../w02/MAC_STORAGE_REPORT.ko.md), [PR #1 수정](../w02/PR1_FIX_REPORT.ko.md), [협업 규칙](../github-collaboration.md), [개발 가이드](../development.md), CI workflow와 실제 코드를 확인한다.
6. 과거 실험의 이유가 필요할 때만 [v4 적용 설계](../w02/V4_ROUTE_DESIGN.ko.md), W02 A/B 및 저장 준비 기록, [기존 구현 감사](../reference/AUDIT.ko.md)를 읽는다. 원본 개인 증명이나 과거 브라우저 프로필을 열거나 실행하지 않는다.

`ybm-proof-verification.json`의 `merged:false`, 초기 `localTests.total:400`, AGENTS 말미의 Draft 표기는 **작성 시점 기록**이다. 현재 GitHub에서는 PR #4가 병합됐고 최신 검토 시험은 `preMergeReview.localTests.total:407`이다. 이 인계를 위해 원본 기록을 고치지 않았다. `docs/status.md`, `docs/README.md`의 최신 경로 설명, root package의 W01 설명도 최신 구현 전체를 반영하지 않는다. `MAC_TOOL_GUIDE.ko.md`는 기존 합성 ZIP 안내로서 여전히 실제 계정 입력 대상이 아니다. `config/toolchain.json`의 Reclaim 미선정 표기는 W01 스냅샷이며 현재 수집기 버전은 수집기 package/lockfile을 따른다.

## 실제 YBM 성공의 근거와 한계

성공 실행은 2026-10-12 KST이며 실행 코드 지문은 `1a99de4bfcb60bc486e420b12aab33550f927d2e`다. 해당 코드 커밋 시각은 11:01:52 KST, 결과 기록 커밋 `8b9a10dd4d9aef13313dd2ee737d9d40b31f7d6a`는 11:05:55 KST다. 이를 실행 이력의 시간 기준으로 사용하되, 별도로 저장하지 않은 정확한 증명 발급 시각을 만들어 기록하지 않는다.

사용자 본인의 새 로그인으로 접수·성적 signed claim 2건을 새로 생성했다. 로그인에 사용한 동일 Attestor client와 사전 결합 owner를 유지하고, 별도 프로세스에서 공식 claim 서명·identifier·owner·신청/수취 지갑 EIP-712 결합·정확한 params/context·신선도·같은 시험 연결을 검증했다. 결과는 `proofVerified`, `independentProcess`, `sameClient`, `applicationBound`, `recipientAuthorized`, `sourcePairMatched`, `sourcePolicyPinned` 모두 true다. 정상 종료 0, `profilesDeleted:true`, 잔여 관리형 session 디렉터리 0개도 확인했다.

근거는 위 보고서/JSON의 `live`, `liveAttempts`, `ciAtLiveCode`이며, [성공 실행 코드 PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38194206010)와 [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38194203348)도 통과했다. CI는 합성 검사이고 실제 로그인 증거를 대신하지 않는다. 실제 증명·성적 값·시험일·수험번호·지갑·쿠키·키·HTML은 보고서/fixture에 보관하지 않았다. 원본 증명 재생을 요구하지 말고 제품 통합 검증 시 새로운 제품 문맥의 새 증명을 만든다.

고정 원천 정책 지문은 `0x1a8946e685bef4a4c1b9b7bd27c0a1b6ac23cc96373114a5d1345a65d2e11821`이다. SDK 기본 `User-Agent: reclaim/0.0.1`을 생성 전에 공개 정책에 명시했다. 과거 정책/실패 기록은 덮어쓰지 않는다.

`src/ybm-collector/binding.mjs`의 `prepareLocalDiagnostic`는 매번 recipient·owner·authority를 메모리에 생성한다. 도메인은 `ClearCollectionDiagnostic`, scope는 `W02_LOCAL_TEST`, runtime은 `REAL_YBM_DIAGNOSTIC`, `paymentAllowed:false`다. 사용자가 승인한 새 로컬 테스트 지갑이며 외부 지갑 로그인·정책 동의·예치·제품 DB 신청이 아니다. 메모리 Map의 상태/nonce 검사는 프로세스 재시작 뒤의 영속 재사용 방지를 증명하지 않는다. 정책 hash에 800/80이 들어 있어도 자격 평가를 실행한 것은 아니다.

독립 검증은 공증자 서명 claim을 검증하는 구조다. 전체 TLS/ZK transcript를 검증 프로세스가 재검증하거나 추가 TEE를 검증한 것으로 설명하지 않는다. 프로세스의 JS 네트워크 차단은 OS 수준 sandbox 인증이 아니다.

## 완료와 남은 작업

| 구분 | 현재 상태 |
| --- | --- |
| 완료 | 별도 작업본, 원본 지문 보존, 고정 도구·의존성, PR/합성 CI 협업 |
| 완료 | Mac 전용 Chrome·관리형 임시 저장·정상/오류 삭제·강제 종료 뒤 다음 시작 전 복구 |
| 완료 | 동일 client 실제 원천 접속, 접수·성적 형식 연결, 진단용 신청/지갑 결합, 새 claim 2건 생성·독립 검증 |
| 완료 | 합성 변조·격리·실패·취소·수명 검사 및 PR #4 시작 실패 수정 |
| 미완료 | 제품 지갑 인증/동의, 정책 컴파일러, 영속 신청/세션/nonce/권한 DB, 역할·소유권 API |
| 미완료 | 인정 기간·복수 시험 선택·최고점 규칙, 800점 AND 시드 필수 강의 80% 결정적 평가 |
| 미완료 | 같은 반 동일 원천 시험 재발급/신청·지갑 변경에도 유지되는 중복 차단과 동시성 보장 |
| 미완료 | v4 지급 금고·예치·권한 확정·outbox·패킷·로컬 지급·서비스 중단 뒤 독립 청구 |
| 미검증 | 실제 최고점/목록 완전성·800점 충족·학습 충족·실제 예치·지급. 사용자에게 성적 확보 응답이 있었어도 진단 성공으로 대체하지 않는다. |
| 미검증 | 다른 사용자 자기 PC·계정 실제 수집 최소 1건, 각자 PC 테스트 사이트, 비개발자 2명 독립 과업 |
| 후속 | 실명 본인인증, 실제 학원/LMS API, 추가 TEE, 공개 Amoy/실제 돈 지급, 다기관·모바일·지갑 분실 복구 |

현재 `contracts/`는 비어 있고 신규 `src/` 구현은 mac-collector/ybm-collector다. `legacy/`의 과거 서버·계약과 `spikes/`의 합성 모듈은 참고 자산이다. 존재한다는 이유로 제품 구현 완료로 세지 않는다. `config/manifests/*.pending.json`은 청구 가능한 배포 manifest가 아니다.

## 유지할 제품 결정과 실행 경계

- 2026-11-07 목표의 우선순위는 운영자·참가자가 개발자 도움 없이 사용하는 제품 완성도다. 실제 본인 새 YBM→로컬 지급 1건, 별도 합성 신청 최소 2개 격리, 다른 사용자 자기 PC·계정 수집 최소 1건, 비개발자 최소 2명의 합성 과업을 각각 기록한다. 타 사용자 실제 수집은 Mac MVP 승인에서 추가됐으며 오래된 PRD의 추가 모집 후속 문구보다 우선한다.
- TOEIC 800점 이상 AND 수강률 80% 이상. 반 운영기간 안에 응시한 유효 검증 시험 중 최고 총점이며 다른 시험의 LC/RC를 합산하지 않는다. 필수 목록·완료 기준은 동의 전 고정한다. 기간 내 완료 필수 강의만 세고 동일 중복은 한 번, 결측/충돌은 보류한다.
- 같은 반의 동일 시험 기록 재지급 차단과 신청별 일회 지급을 모두 보장한다. 다른 시험 기록을 가진 동일인을 실명 기준으로 묶는 보장은 포함하지 않는다. 지갑 서명과 YBM 계정 기록 검증을 법적 실명 본인인증이라고 표현하지 않는다.
- 예치 후 수취 지갑 고정. 청구 자료 발급 후 운영자 취소/추가 승인 불가. 정상 제출 마감 T, 확인된 외부 장애의 해당 반 등록자 전체 보완 T+3일, 최종 청구 T+10일. 장애가 지속돼도 최종 마감 뒤 미정산 회수 허용. 최종 시연일을 자동으로 청구 마감으로 쓰지 않는다.
- 50 TEST 1회·운영자 전액 예치·참가자 보증금/수수료 없음·TOEIC L&R은 권고 기본안이며 사용자 확정으로 승격하지 않는다. 실제 반/제출 달력 날짜는 동의 전에 결정해야 한다. 과거 성적 응시일을 포함하는 가상 반과 시드 학습 시연임을 표시한다.
- 현재 Mac의 관리형 민감정보 저장이 승인 기준이다. 개인 Chrome 프로필을 재사용하지 않는다. 앱 전용 경로·사용자 전용 권한·FileVault·앱 경로만 Time Machine 제외를 사용한다. 전역 백업/swap 변경, 완전 무디스크, 삭제 후 복구 불가능 보장을 주장하지 않는다.
- 정상/오류 종료 즉시 임시 자료 삭제, 실행 중 최대 24시간, 강제 종료/전원 종료 뒤 다음 실행 전 정리 예외가 승인됐다. 서비스 청구 자료·최소 검증 이력·재사용 방지 정보의 사본은 최종 청구 마감 후 30일 이내 삭제하며 접근을 제한한다. 참가자 다운로드 사본/체인 기록은 별도다. 열린 권리의 원장/청구 자료를 임시 세션 정리로 지우지 않는다.
- 서버 raw staging은 우선 메모리 전용 설계/합성 구현이며 제품 API 통합은 남아 있다. 실제 proof·키·쿠키·비밀번호·성적표는 채팅, 보고서, 로그, Git, fixture, 일반 DB에 복사하지 않는다. 실패 오류도 허용된 고정 코드만 남긴다.
- 본인 실제 실행은 준비된 경로에서 사용자의 직접 로그인 시점에 안내한다. 초기 수집은 꺼 두고 ready 이후 시작한다. 접수 목록 `confirmList.php`에서 해당 시험의 `confirmDetail.php`가 대상이며 성적 상세 `scoreDetailToeic.php`와 혼동하지 않는다. 수집 완료 후 전용 Chrome 종료는 정상 동작일 수 있다.
- 이 인계 요청은 새 로그인·증명 생성·배포·유료 구매·공개 체인 거래·제3자 연락의 실행 지시가 아니다. 다음 작업에서 필요한 외부 실행은 당시 사용자 요청 범위에 맞춰 진행한다. 시크릿을 채팅으로 요청하지 않는다.
- PR 대상은 develop, 필수 별도 팀원 승인은 0명이다. 병합 전 코드 리뷰·필수 CI·최신 기준 브랜치·미해결 대화 검사는 유지한다. 이번 요청은 문서 작성까지이며 자동 병합하지 않는다. main 통합·브랜치 삭제·보호 우회는 수행하지 않는다.

## 다음 첫 작업과 작은 PR 순서

첫 작업 권고는 **W03–W08 제품 통합 차이 점검과 첫 PR 경계 확정**이다. GPT-6 Astra / High를 권고한다. 먼저 현재 소스와 설계의 대응표를 작성하고 아직 없는 DB/계약/API를 구분한다. 진단용 도메인·메모리 authority를 제품용으로 이름만 바꾸거나 `paymentAllowed`만 켜지 않는다. 실제 로그인 없이 합성 경계·실패 조건·첫 PR 범위를 확정할 수 있다.

| 순서 | 작은 PR 범위와 선행 조건 | 완료 기준 | 추천 |
| --- | --- | --- | --- |
| 1 | W04 정책 schema/컴파일러와 W05 시드 평가기. 앞선 차이 점검으로 재사용 자산 선정 | canonical hash·버전·날짜·필수 목록 불변, 795/800 경계, 80% 직전/정확히80%, 분모0·결측·충돌·기간 밖·다른 시험 LC/RC 혼합 거부. 같은 입력/버전의 같은 결과. 미정 날짜 정책 게시 차단 | Astra / High, 평가기 구현은 Sol / High도 가능 |
| 2 | W03/W06 외부 지갑 로그인·동의·신청/DB 상태. 정책 hash 선행 | 로그인 nonce와 동의 구분, 역할/소유권, wrong-chain/account-change 거부, 두 신청 격리, 재시작 후 영속 상태. 실제 지급/예치 없이 동의·신청까지 검증 | Sol / High, 서명/nonce 검토 Astra / High |
| 3 | W07 새 v4 금고와 신청 예치 연결 | 정확한 준비금, 고정 수취인, authorizeGrant 일회 확정, 신청 및 시험 nullifier 중복 차단, claim/reclaim T/T+3/T+10 경계, 실패 revert·잔액 불변. 발급 후 취소 경로 없음 | Astra / High |
| 4 | W08 제품 proof 세션과 기존 수집기/독립 검증 연결 | 실제 예치 신청·정책·runtime·owner/지갑·freshness 결합, DB nonce 원자 소비, callback 멱등성, 변경/재발급/다른 신청 거부, 검증 필드가 평가기로 안전하게 전달됨. 동일 원천 시험키의 안정성 별도 확인 | Astra / High |
| 5 | W09/W11 발급·outbox·패킷/삭제와 W10 독립 청구 | 같은 반 같은 시험 동시 발급에서 권한 하나만 확정, 서버 중단/재시도 시 중복 없음, 확정 거래 뒤 패킷 발급, 원본 삭제 뒤 API/issuer 중단 상태에서도 고정 지갑 직접 청구, 청구 실패 후 권리 유지 | Astra / High |
| 6 | W12 실제 로컬 지급·W13–W15 사용자 제품화 | 새 제품 신청 문맥의 새 YBM 증명→800점/시드80%→로컬 1회 지급, 실제/합성 분리. 타 사용자 수집·비개발자 과업·외부 PC·복구를 별도 검증 | 통합 Astra / High, UI Sol / High, 과업 관찰 Sol / Medium |

각 행이 크면 별도 PR로 더 나눈다. 실제 날짜/지급 기본값 확정은 실제 동의·예치 전에 사용자에게 가장 중요한 항목부터 하나씩 묻고, 미확정 값을 합성 시험에서는 명시적 fixture로만 사용한다.

특히 현재 검증기는 안전한 boolean 요약만 반환하고 `listComplete:false`, `highestScoreAssessed:false`, `eligibilityAssessed:false`, `paymentAllowed:false`를 유지한다. 최고점/자격 구현에는 서명된 검증 결과에서 필요한 필드를 비공개 내부 경계로 전달하는 새 계약이 필요하다. 로컬 HTML의 선택 행이나 unverified 전체 목록을 신뢰값으로 승격하지 않는다. 여러 검증된 시험의 결정적 선택과 조회 누락 처리, 최고점 주장의 범위를 먼저 설계한다.

재사용 방지는 proof 파일 hash나 이름/생년월일 공개 hash 대신 설계의 반별 HMAC 시험 nullifier 후보를 검토한다. DB unique 제약과 계약의 중복 차단이 함께 필요하고, 키 교체·정책 버전 변경·서버 재시작으로 동일 반 중복 범위를 초기화하지 않는다. 현재 실제 1쌍 연결 성공만으로 재발급 간 안정성을 검증했다고 기록하지 않는다.

## 검증 명령과 알려진 제약

저장소 경로에서 고정 `./tools/node`와 `./tools/npm`을 사용한다. Node 24.21.0/npm 11.19.0, root ethers 6.17.0/ganache 7.9.2/solc 0.8.30, 수집기 attestor-core 5.1.4/tls 0.1.4/parse5 8.0.1/ws 8.22.0이다. W02 A의 js-sdk 5.8.2와 수집기 core API를 혼용하지 않는다. 새 설치에는 각 lockfile의 `npm ci --ignore-scripts`를 사용하며 전역 도구/원본 의존성을 바꾸지 않는다.

```sh
./tools/npm --prefix src/ybm-collector test
./tools/node --test tests/mac-collector/*.test.mjs tests/workspace-integrity.test.mjs tests/public-content.test.mjs
./tools/npm --prefix spikes/w02-proof-adapter test
./tools/npm --prefix spikes/w02-collector-boundary test
./tools/npm --prefix spikes/w02-storage-preparation test
./tools/npm run verify:workspace
./tools/npm run verify:workspace:local
./tools/npm run verify:dependencies
./tools/node tools/check-public-content.mjs HEAD
```

최신 검토의 로컬 결과는 153 + 48 + 107 + 62 + 37 = **407개 통과**다. Mac 실브라우저/강제 종료 시험은 Apple Silicon Mac과 Chrome이 필요하며 Linux의 skip을 Mac 통과로 세지 않는다. `verify:dependencies`는 참고 계약의 메모리 내 컴파일까지이며 체인을 시작하거나 배포하지 않는다. 이력/공개용 문서 지문 검사에는 전체 Git 이력이 필요하다. 원본 `reference-inputs.json`과 공개용 `published-fingerprints.json`은 용도를 구분해 보존한다.

- PR #4에서 독립 검증 child의 spawn 실패 시 exit가 발생하지 않아 기다리던 문제를 재현·수정했다. close로 완료를 판정하고 동기 fork/IPC 실패를 고정 오류로 처리했다. 취소·시간 초과·늦은 성공 응답을 포함한 시험 7개를 추가했다. `tests/ybm-collector/verifier-lifecycle.test.mjs`를 유지한다.
- [최신 push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38195040083)의 3개 검사는 처음에 모두 통과했다. [최신 PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38195044654)는 Mac의 legacy-missing 5회 반복이 처음에 60초를 초과했고 다른 검사는 통과했다. 코드/시간 제한 변경 없이 로컬 복구 시험 5개가 통과했고(해당 반복 약 10.3초), 실패 job을 한 번 재실행한 attempt 2에서 전체 검사가 통과했다. 최초 시간 초과 원인은 특정하지 않았다. 재발하면 해당 로그와 시점을 조사하며 묵시적으로 skip하거나 제한을 완화하지 않는다.
- 실제 생성의 과거 실패는 첫 시도 원인 불명, 다음 송신 2MiB 상한, 이후 claim 2건 생성 뒤 독립 검증 거부였다. 증명 전용 32MiB/60초 상한과 SDK 헤더 사전 고정을 구현하고 후보 3의 새 세션에서 성공했다. 첫 시도나 당시 거부 원인 전체까지 소급 확정하지 않는다. 일반 중계 2MiB/10초, 수신 4MiB 제한은 유지한다.
- 원본/legacy 191파일과 과거 성공 실행기 3개의 지문 일치, 의존성 lock 보존을 PR 검토에서 확인했다. 이번 인계는 문서 작업이므로 407개 시험과 실제 YBM 실행을 다시 실행하지 않았다.

## 로컬 자료와 프로세스

확인 시점에 관리 대상 collector launch/worker·독립 verifier·CLEAR 전용 Chrome에 일치하는 실행 프로세스는 0개, 관리 루트의 session 디렉터리도 0개였다. 이는 확인한 대상의 순간 상태이며 OS 전체 프로세스나 다른 Chrome이 없다는 뜻은 아니다. 새 세션 시작 때 다시 확인한다. 개인 Chrome이나 무관한 프로세스를 종료하지 않는다.

| 위치 | 용도와 취급 |
| --- | --- |
| `~/Library/Application Support/CLEAR/collector-v4` | 관리형 임시 저장. 잔류 자료는 기존 소유권/PID/시작 시각/그룹 검증을 거치는 복구 경로로 처리한다. 수동으로 무차별 삭제하지 않는다. |
| 작업본의 `.toolchain/` | 고정 Node, 준비/과거 검증 로그, 보호 설정의 과거 스냅샷. Git 대상 제외. 최신 외부 상태는 GitHub를 재확인한다. |
| 작업본의 `artifacts/mac-collector/` | 기존 합성용 배포물. 현재 실제 증명 기능을 포함한 배포 완료 제품이라고 설명하지 않는다. |
| 작업본의 `private/`, `data/`, `var/` | 환경별 디렉터리가 존재한다. 내용을 일괄 출력/복사하지 않고 원본 증명 디스크 저장소로 전용하지 않는다. |
| `/tmp/clear-pr4-review-before.txt`, `/tmp/clear-pr4-review-after.txt` | 시작 실패 수정 전/후의 로컬 합성 시험 로그. 임시 파일이므로 영속 근거는 커밋/시험/PR/보고서를 사용한다. |
| `/tmp/clear-pr4-mac.txt`, `/tmp/clear-pr4-proof.txt`, `/tmp/clear-pr4-boundary.txt`, `/tmp/clear-pr4-storage.txt` | PR #4 회귀 시험 출력. |
| `/tmp/clear-pr4-ci-failure.txt`, `/tmp/clear-pr4-hard-kill-recheck.txt` | CI 최초 시간 초과와 로컬 재확인 로그. |
| `/Users/ohgyuwon/Desktop/dev/블록체인/refund-vault-prototype` | 보존할 원본 프로젝트. 변경/자동 실행하지 않는다. |
| `/Users/ohgyuwon/.codex/.chatgpt-projects/g-p-6a9fbda3d8e88191aa2320656de7fb49/experiments` | 과거 비공개 실험. 정확한 참조는 `docs/w02/v4-route-review.json`에 있다. 원본 proof/cookies/keys를 읽지 않고 과거 성공 실행기를 해당 경로에서 재실행하지 않는다. |
| 작업본의 `legacy/`, `docs/w01/source-copy.json`, `docs/w01/reference-inputs.json` | 보존 참고 코드와 원본 지문. 다음 변경에 맞추려고 덮어쓰지 않는다. |

## 새 세션에 전달할 첫 요청 예시

“이 인계 문서를 읽고 현재 Git 상태를 확인해 주세요. 원본과 실험 자료를 보존하고, GPT-6 Astra / High를 권고한 뒤 제품 신청·지갑·재사용 방지·시험 기간/최고점 선택·800점 AND 시드 수강률 80% 판정에 대해 현재 진단 구현과의 차이를 먼저 정리해 주세요. 첫 작은 PR의 범위와 완료 기준을 제안하고, 실제 로그인이 필요한 시점까지는 공개·합성 자료로 진행해 주세요.”
