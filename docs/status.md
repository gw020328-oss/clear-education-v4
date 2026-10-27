# 개발 현황

## 2026-10-27 공개 현황

main의 제공 코드·의존성·기존 시작 명령은 유지한다. main 재현 경로는 기존 ProofAdapter 합성 테스트36개와 문서 CI이며 아래 develop의 새 API/계약/실행 도구를 main에서 쓸 수 있는 명령으로 안내하지 않는다.

원격 확인 **2026-10-27 11:00 KST**. develop은 [19e1c14](https://github.com/gw020328-oss/clear-education-v4/commit/19e1c1473165cdea52a42040e740b79ba3e50c03), main은 [ad82b0f](https://github.com/gw020328-oss/clear-education-v4/commit/ad82b0fee1c6e8f1374016b732e8e82184894f66)다. [#114](https://github.com/gw020328-oss/clear-education-v4/pull/114) 프론트 인계 정정, [#115](https://github.com/gw020328-oss/clear-education-v4/pull/115) S1/S2 V2 등록·실행 연결, [#116](https://github.com/gw020328-oss/clear-education-v4/pull/116) S3 이의·정정·종료가 develop에 병합됐다. 아래는 **develop 기준, main 미반영**이며 이번 자동화의 실행 결과가 아니다.

### 완료 — develop의 V2 등록과 검토 체인 연결

[S1/S2 공개 검증](https://github.com/gw020328-oss/clear-education-v4/blob/a53efe0295ae1b2f13eff960e26bcdda12fe9ed0/docs/current/BOOTCAMP_V31_VERIFICATION.json)은 고정 신청 소유 지갑/정책/배포 문맥의 chain application ID·salt·등록 nonce·원래 deadline/참가자 세션을 영속 결합하고, recipient-registration GET/POST와 client 메서드로 별도 EIP-712 등록 서명을 접수한다고 보고한다. 접수와 canonical 체인 등록/최초 순서를 구분한다. 등록 서명/공개 필드는 calldata에 포함되며 기존 V1 환경·계약·DB·실제 r20을 이행하지 않는다. 합성 참가자/원천·실제 벽시계·새 격리 Geth의 HTTP 등록→양측 동의→정확100 TEST·중복 거부 검증이다. 새 실제 사용자 지갑/원천/AI 지급 성공으로 표시하지 않는다.

[S3 공개 계약/검증](https://github.com/gw020328-oss/clear-education-v4/blob/b545a93a5fd04dc54e1df9a87185f5f81454fc1c/docs/current/BOOTCAMP_S3_CHAIN_REVIEW.ko.md)은 서버 이의·평가·재검증·종료 원장을 기존 worker의 OBSERVE/REPLACE/TERMINATE에 연결한다. review-chain GET과 client 조회는 접수 NOT_OBSERVED·PENDING과 canonical INCLUDED/REVERTED/REORGED·finalized=false를 구분한다. 정정은 고정 수령인·최초 등록순서·원래600초 상한/재검증1회와 새 판정의 동의를 유지한다. 서버 접수와 체인 포함은 원자적이지 않아 먼저 전송/포함된 ACCEPT 권리는 회수·변경·만료시키지 않는다. 원천 진실성이나 평가 authority 신뢰 제거를 보장하지 않는다.

#115의 최종 E5B53/53·API/store713/713과 #116의 E5B57/57(신규 S3 4경로 포함)·API/store721/721은 각 실행 범위다. 서로 합산하거나 실제 사용자 완주 수로 바꾸지 않는다. #115의 초기 E5B49/50, #116의 초기55/57 및 과거 pin/시계 fixture 실패는 보존하며 최종 head 성공으로 덮지 않는다. S3의 새 격리 Geth·합성 HTTP 이의/정정/종료·ACCEPT 우선/권리 보존 시험을 실제 운영 이의 처리/평가 authority 인수로 표시하지 않는다. 이번 후속은 새 로그인/Reclaim·유료 AI·사용자 지갑·normal-host/CA·공개 체인 실행을 하지 않았다.

### 진행 — 미병합 S4, 남은 제품 프론트

열린 [#117](https://github.com/gw020328-oss/clear-education-v4/pull/117)의 [읽기 계약](https://github.com/gw020328-oss/clear-education-v4/blob/9b3e61b383df9b506a0adeff5b813a39b836f97e/docs/current/BOOTCAMP_S4_DECISION_EVIDENCE.ko.md)·[합성 검증](https://github.com/gw020328-oss/clear-education-v4/blob/9b3e61b383df9b506a0adeff5b813a39b836f97e/docs/current/BOOTCAMP_S4_VERIFICATION.json)은 정확한 저장 decisionId/revision/hash의 근거 메타데이터와 최소 manifest 읽기를 제안한다. 판정 당시 상태와 조회 시점 availability를 분리하며 원천 현재성 UNKNOWN·원문 HTTP 없음·독립 재검증/지급 근거 불가를 명시한다. 저장되지 않은 model/prompt/rubric/policy 문자열 버전은 UNAVAILABLE이고 현재 설정으로 추정하지 않는다. 아직 develop/main 기능이 아니다.

S4 로컬 신규 연결30/30·최종 원문/원천 만료 구분6/6·합성 V2 지급/조회불변1/1은 별도 검사다. 최초 전체726/727의 역사 pin1건 실패와 보정 후 해당 client38/38도 구분한다. 제품 web/PR60의 S5 실제 완주·실제 평가 authority 입력·장기 worker 복구·원격 기관 Moodle·Windows 사용자 PC 실측·상용 배포는 미완료다. 현재 열린 PR은 #60과 #117 두 건이며 나머지 과거 열린 PR 표기는 이전 시점 기록이다.

### 정확한 head의 CI와 병합 범위

| PR / 현재 상태 | 검사 head SHA | 확인 시점 CI | 실행 근거 |
| --- | --- | --- | --- |
| [#114](https://github.com/gw020328-oss/clear-education-v4/pull/114) / MERGED | 87367880b38e8ab070dc310367575d5cb78e52f7 | SUCCESS 6/6 | [run 40269911912](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40269911912) · [run 40269907510](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40269907510) |
| [#115](https://github.com/gw020328-oss/clear-education-v4/pull/115) / MERGED | a53efe0295ae1b2f13eff960e26bcdda12fe9ed0 | SUCCESS 8/8 | [run 40288428711](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40288428711) · [run 40288428180](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40288428180) · [run 40288428132](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40288428132) · [run 40288423785](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40288423785) |
| [#116](https://github.com/gw020328-oss/clear-education-v4/pull/116) / MERGED | b545a93a5fd04dc54e1df9a87185f5f81454fc1c | SUCCESS 8/8 | [run 40300580376](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40300580376) · [run 40300580347](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40300580347) · [run 40300580418](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40300580418) · [run 40300571949](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40300571949) |
| [#117](https://github.com/gw020328-oss/clear-education-v4/pull/117) / OPEN | 9b3e61b383df9b506a0adeff5b813a39b836f97e | SUCCESS 4/8 · 진행 중4 | [run 40435366140](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40435366140) · [run 40435366052](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40435366052) · [run 40435366286](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40435366286) · [run 40435325323](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40435325323) |

#116 병합 tree와 검사를 통과한 b545a93 tree가 동일함을 확인했다. 병합 SHA 자체의 새 CI 실행을 주장하지 않는다. #117의4개 진행 중 검사는 통과로 간주하지 않으며 기능 PR을 이 자동화에서 병합하지 않는다. 경로 조건상 develop 문서3개 변경에는 공개 이력·합성 시험·Mac 복구의 PR/push6검사가, main 문서에는 공개 이력·합성 시험의 PR/push4검사가 적용되며, 코드 전용 E5/Windows/HR 검사를 문서 변경에서 실행했다고 주장하지 않는다.

실제 r20의 로컬100 TEST 수령 기록은 원 실행 HEAD·INCLUDED/finalized=false 범위로 보존한다. 이를 새 V2/S3/S4의 실제 재시험으로 표현하지 않는다. 이번 작업은 공개 코드/문서·CI만 대조했으며 실제 원문/proof·쿠키·개인키·민감 로그 접근, 새 로그인/유료 호출/서명/거래/배포를 하지 않았다. 이전 날짜별 미병합·준비·실패는 당시 기록이다.

## 2026-10-26 공개 현황

main의 실제 제공 코드·의존성·기존 시작 명령은 유지한다. main 재현 경로는 기존 ProofAdapter 합성 테스트36개와 문서 CI이며 아래 develop 도구·기능의 로컬 명령을 main에서 실행하라고 안내하지 않는다. develop 전체/기능 커밋을 main에 합치지 않았다.

원격 확인 **2026-10-26 13:19 KST**. develop은 [c108dc8](https://github.com/gw020328-oss/clear-education-v4/commit/c108dc8f20a86da3d48419615285a815f947b91c)로 [PR #102](https://github.com/gw020328-oss/clear-education-v4/pull/102)가 10월 25일 병합됐다. main은 [ab438d0](https://github.com/gw020328-oss/clear-education-v4/commit/ab438d0ae9ad581fd1b41792f9898b43a6cd7360)이며 기능 코드는 미반영이다. 아래는 **develop 기준, main 미반영**인 구현과 공개 보고서의 저장된 결과이며 이번 자동화가 재실행한 결과가 아니다.

### 완료한 범위 — 로컬 TEST 정상 경로와 develop 통합

[현재 develop에 고정한 정상 실행 기록](https://github.com/gw020328-oss/clear-education-v4/blob/c108dc8f20a86da3d48419615285a815f947b91c/docs/current/BOOTCAMP_NORMAL_RUN_READINESS.ko.md)과 #102는 실제 r20의 실행 HEAD를 **f38ae8bd44c9da2e27f6a56650ced0f7bffe9aba**로 기록한다. 같은 신청에서 새 실제 HackerRank 계정/인증서 검증, 로컬 Moodle 데모3조건, 실제 Gemini 회고 응답1회와 지정 운영자의 정확 입력 AI 승인, 동일 판정에 대한 참여자/운영자의 별도 AGREE가 연결됐으며 네 조건이 MET였다. AI 승인과 지급 동의는 별개다. Moodle은 로컬 데모 자료이며 원격 실제 기관의 학습 성과 입증이 아니다.

6개 native bridge 단계 INCLUDED 후 canonical CLAIM receipt status1/block12, 저장 checkpoint, vault→participant Transfer와 **실측100000000 atoms =100 TEST 수령**, 중복 청구 거부를 확인한 저장 기록이다. 상태는 **INCLUDED / finalized=false**로 최종 확정이라고 표시하지 않는다. FINISH1회·exit0, 관리 세션/Chrome0·HTTPS/RPC 종료·Geth 중지/네트워크 park와 chain/keys/DB/소비된 승인 보존을 보고했다. 이 사실은 과거 합성 원천 run3와 별도이며 실패했던 r15를 소급 성공으로 바꾸지 않는다. 이번 자동화는 원본 증명·개인자료·잔액/키·실행 환경을 직접 열거나 재시험하지 않았다.

### 병합한 v29 수정과 합성 검증의 한계

[고정 통합 head의 v29 공개 검증](https://github.com/gw020328-oss/clear-education-v4/blob/8bff2be17e3ae280ff03d80f578e7727de48cb14/docs/current/BOOTCAMP_V29_VERIFICATION.json)은 준비/권한/채택 메타데이터를 같은 savepoint에서1회 쓰고 원래 target·binding·cap·현재 권한을 최종 검증하도록 보완했다고 보고한다. 순방향 초 경계의 최종 읽기 검증만 최대1회 다시 확인하고 두 번째 충돌은 rollback한다. 새 정상 TEST 환경에만1초 empty-block mining을 적용하고 원래 만료 안에서 canonical 시각을 읽어 기다린 뒤 같은 CAS를 확인한다. 기존 환경 이행·추가 거래·재서명·재동의·TTL 연장은 없다.

v29 로컬 API/store/execution633·브라우저 manifest1·호환114·E5 native46·E5B native43은 각 검사 범위이며 서로 합산하지 않는다. E5B43 중 실제 wall-clock을 쓴 **합성 원천/사용자/모델**10경로는 양성7경로의100 TEST/중복 거부와 음성3경로의 ACCEPT 송신 전 차단을 구분한다. 실제 r20 이후 새 실제 로그인/proof/유료 AI/사람 서명·동의/지급을 수행한 검증이 아니다. v28의 E5B38/41 실패와 보존되지 않은 당시 수치·미수락 조사 기록을 보존하며 새 head 성공으로 소급 덮지 않는다.

### 정확한 CI·통합·남은 작업

최종 통합 head **8bff2be17e3ae280ff03d80f578e7727de48cb14**의 PR/push 검사 **10/10 COMPLETED·SUCCESS**를 확인했다. 공개 이력·합성 시험·Mac 복구 각2개와 E5 A·E5 B·HR offline·Windows synthetic 각1개이며 테스트 사례 수가 아니다. develop 병합 커밋 c108dc8의 tree가 이 검사 head와 동일함을 별도 확인했다. 병합 SHA 자체의 새 CI 실행을 주장하지 않는다.

[run 40172949648](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40172949648) · [run 40172949636](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40172949636) · [run 40172949715](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40172949715) · [run 40172949626](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40172949626) · [run 40172946770](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40172946770) · [run 40172949646](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40172949646)

열린 PR은 #60·#66·#69·#70·#73·#75·#78·#87·#101이다. #78/#87/#101의 현재 head와 develop의 diff를 확인한 결과 남은 고유 변경은 Markdown뿐이며 runtime은 통합돼 있다. 해당 문서는 작성자 검토 없이 이 자동화가 병합하지 않는다. 나머지 연구·제품 프론트 PR의 코드 통합/동작 완료를 주장하지 않는다. 제품 프론트 연결, P2 시험 클라이언트 busy/오류 표시 후속, 예치 정책 미결, 원격 기관 Moodle·Windows 사용자 PC 실측·상용 서비스/배포는 미완료다. r20의 silent create click 원인도 미확정이다.

이전 날짜별 미병합·실패·준비 표기는 당시 기록이며 현재 병합/실행 범위는 이 절을 우선한다. 과거 AI 평가·합성 시험·실제 수령·타 사용자 시험을 혼용하거나 횟수를 합산하지 않는다. 이번 작업은 공개 코드/문서·CI만 대조했으며 새 원격 로그인·proof·유료 호출·서명·거래·배포를 하지 않았다.

## 2026-10-25 공개 현황

main의 제공 코드·의존성·기존 사용법은 유지한다. 공개 재현 경로는 기존 ProofAdapter 합성 테스트36개와 문서 CI다. 아래 미병합 API/복구 변경은 main 제공 기능이나 로컬 실행 명령이 아니다.

원격 확인 **2026-10-25 11:03 KST**. develop은 [d6ea734](https://github.com/gw020328-oss/clear-education-v4/commit/d6ea7344ad927318f921f76e77131a5704b5cd57), main은 [6a4b693](https://github.com/gw020328-oss/clear-education-v4/commit/6a4b69388470409ef4c8bb054cf8a833e4450b8a)다. 두 기준 브랜치에 새 기능 병합은 없다. 아래 후속은 **develop 작업 브랜치 기준, main 미반영이며 develop에도 미병합**이다.

[PR #102](https://github.com/gw020328-oss/clear-education-v4/pull/102)의 [고정 head v24 공개 기록](https://github.com/gw020328-oss/clear-education-v4/blob/c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb/docs/current/BOOTCAMP_V24_VERIFICATION.json)은 저장된 실제 r15에서 현재 원천4조건 MET·승인된 AI 생성1회·두 역할 직접 동의 후 BIND_CONSENTS까지 진행했다고 보고한다. REGISTER·ALLOCATE·START_REVIEW 완료는 기록됐으나 BIND는 SEND_STARTED로 남았다. 보존 진단은 MANAGED_SOURCE UNKNOWN_ERROR이고 실제 하위 예외는 미보존이다. prepared·claim job·settlement는0, 잔액 변화는 미측정(null)이다. **실제100 TEST 수령·전체 시연 완료가 아니며**, 이번 문서 작업에서 이 실행/AI를 재시도하거나 기존 realm/DB를 다시 열지 않았다.

**합성 재현과 수정:** 실제 store/evaluator/procedure·소유 bridge에 인공 원천/AI/지갑과 새 격리 TEST 체인을 사용한 별도 재현은 post-send 복구 권한 검사의 1초 경계에서 BC_E5_CLOCK_CHANGED → E5B_CONTROLLER_REJECTED와 같은 BIND/SEND_STARTED 상태를 확인했다. 이 재현 결함과 r15의 관측 패턴 일치를 구분하며 r15 원인이 확정됐다고 쓰지 않는다. #102는 이미 발급한 미반환 witness의 현재 RECOVER/RECOVER_FINAL_SYNC에서 정확한 RuleError일 때만 권한을 최대1회 재검사한다. witness·payload·binding·원래 상한을 유지하고 issuer/키/서명/seal/dispatch/broadcast는 반복하지 않는다. 다른 오류·두 번째 충돌·만료/철회·실행/commit 경계는 계속 거부하며 E4 서명/전송 코드는 불변이라고 보고한다.

같은 경계를 주입한 수정 후 합성 재현은 BIND→PREPARE→ACCEPT→정확100000000 atoms 청구·중복 거부를 확인했다. 이는 실제 r15의 재전송·복구 지급이 아니다. 공개 기록은 고유 로컬646사례(API/실행554·호환/memory gate91·native 합성 통합1)를 보고하며 이전958개·CI횟수·실제 성공과 합산하지 않는다. 날짜 변경 후 fixture38건 실패는 현재 날짜의 인공 fixture로 고치고 영향40건만 재검사했으며 strict today-price 검증은 유지했다. v24 source170개 중 runtime3개 변경, 브라우저6개 자산 불변 및 기존 r15 등 근거242개 지문 보존도 보고됐다.

**미검증과 실행 경계:** 보존되지 않은 r15 원래 예외·새 수정의 실제 원천/지급 재시험은 미확인이다. 이번 오프라인 수정은 새 실제 host/CA/login/proof/유료 AI/사람 서명·동의/지급을 실행하지 않았다. 만료·신선도·CAS·양측 동의·수령인/100 TEST·AI 단회·재사용 차단·예치 정책을 완화한 것으로 설명하지 않는다. 이 문서 자동화는 제품 코드 리뷰·수정·기능 PR 병합 또는 새 실제 실행을 수행한 것이 아니다.

### 정확한 최신 head CI

#102 head **c1e5ee2ccb3eb1ae6f9107bd3e5618cd1ee7eeeb**의 표시된 PR/push 검사 **10/10 COMPLETED·SUCCESS**를 확인했다. 공개 이력·합성 시험·Mac 복구 각2개 및 E5 A·E5 B·HR offline·Windows synthetic 각1개다. 아래6개 workflow 실행의 검사 수이며 테스트 사례 수가 아니다.

[run 40110773621](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40110773621) · [run 40110773623](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40110773623) · [run 40110773600](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40110773600) · [run 40110773526](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40110773526) · [run 40110770311](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40110770311) · [run 40110773552](https://github.com/gw020328-oss/clear-education-v4/actions/runs/40110773552)

이전 날짜별 r2/r9·준비/실패/미실행은 당시 기록이다. 현재 진행은 이 절을 우선하며 과거 합성 run3 지급이나 Python 합성 AI 평가7 PASS/1보완을 r15 또는 새 수정의 실제 성공으로 재사용하지 않는다. 이번 확인은 공개 문서·CI만 대조했고 원문·proof·쿠키·키·민감 로그 접근, 새 유료 호출·서명·거래·배포를 하지 않았다.

## 2026-10-24 공개 현황

main의 코드·의존성·기존 시작 명령은 유지한다. main에서 재현하는 제공 범위는 기존 ProofAdapter 합성 테스트36개와 문서 CI다. 아래 작업 브랜치의 crypto 변경·실행 도구는 main 제공 기능이나 설치 안내가 아니다.

원격 확인 **2026-10-24 12:14 KST**. develop은 [d6ea734](https://github.com/gw020328-oss/clear-education-v4/commit/d6ea7344ad927318f921f76e77131a5704b5cd57), main은 [44226d2](https://github.com/gw020328-oss/clear-education-v4/commit/44226d209cad07b2550395827f529f4cbef66f4a)다. 직전 문서 PR #107/#108 이후 두 기준 브랜치의 새 기능 병합은 없다.

[PR #102](https://github.com/gw020328-oss/clear-education-v4/pull/102)의 [고정 head 공개 조사](https://github.com/gw020328-oss/clear-education-v4/blob/03f8d157043fa1b1d004d5ef9d645a5767a26ffe/docs/current/BOOTCAMP_R9_ZK_COMPATIBILITY_REVIEW.ko.md)는 저장된 실제 r9가 참가자 서명 수락·계정 응답 검사 후 66,901,446바이트 프레임 송신과 claim RPC까지 진행했으나 ERROR_INVALID_CLAIM / ZK_PROOF로 중단됐다고 보고한다. 유효 claim 수락·공식 계정 검증·인증서 pair·후속 AI·지급은 미도달했다. 외곽 BC_REVISION_CONFLICT를 근본 원인으로 확정하거나 r9의 hint를 과거 r8에 소급하지 않는다. 이번 문서 확인에서 재실행한 결과가 아니다.

**진행 — develop 작업 브랜치 기준, main 미반영이며 develop에도 미병합:** 공식 crypto5.1.6/5.1.7이 AES128·AES256·ChaCha20에서 각각 자기 버전 proof는 검증하고 교차 버전은 거부하는 오프라인 행렬을 재현했다. #102는 upstream public-input binding 보안 수정이 포함된 crypto5.1.7을 두 수집 prefix에 exact 고정하고 실행 지문30개를 확인했다. SDK5.1.4·TLS0.1.4·STWO·동시성1·총1회 정책은 유지하며 자동 fallback·검증 완화·재시도는 추가하지 않았다. 이 자동화는 해당 코드·의존성을 수정하거나 보안 코드 리뷰/실행을 수행한 것이 아니다.

[공개 v18 검증 기록](https://github.com/gw020328-oss/clear-education-v4/blob/03f8d157043fa1b1d004d5ef9d645a5767a26ffe/docs/current/BOOTCAMP_V18_VERIFICATION.json)은 수집/전송473·API/실행421·pin/gate64의 서로 다른 로컬 시험958개 PASS와 합성 proof6개 생성에 대한 공식 버전행렬12개 예상 결과를 별도로 보고한다. 기록의 고유 Node 분모만 인용하며 과거 검사·CI 횟수·실제 증명 성공과 합산하지 않는다. v18 source164개·이전 불변 generation49개·r5~r9 자료27개의 지문 보존과 브라우저/API 자산 불변도 보고됐다.

**미검증:** 원격 배포 verifier 버전과 r9의 정확한 실패 원인은 확인되지 않았다. 구형 verifier도 새 encoding을 거부하므로 로컬5.1.7 성공을 원격 호환 성공으로 표시하지 않는다. 전체 TLS handshake 정확성이나 실제 KeyUpdate 발생도 입증되지 않았다. 새 원격 claim·사용자 재시험·로그인·유료 AI·지급은 이 수정에서 수행하지 않았고 전체 실제 원천→100 TEST 시연·제품 인수는 미완료다. 과거 합성 원천 run3 지급 및 합성 Python AI 평가7 PASS/1보완을 이 경로의 성공으로 재사용하지 않는다.

### 최신 head의 CI

#102 head **03f8d157043fa1b1d004d5ef9d645a5767a26ffe**에서 표시된 PR/push 검사 **10/10 COMPLETED·SUCCESS**를 확인했다. Public content history·Public synthetic tests·Mac synthetic recovery 각2개와 E5 A·E5 B·HR offline·Windows synthetic 각1개다. 아래6개 workflow 실행의 검사 수이며 고유 시험 사례 수가 아니다.

[run 39995345957](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39995345957) · [run 39995346180](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39995346180) · [run 39995346415](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39995346415) · [run 39995345908](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39995345908) · [run 39995338800](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39995338800) · [run 39995346126](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39995346126)

이전 날짜별 준비·중단·미실행 표기는 당시 기록이다. 최신 원격 사실은 이 절을 우선한다. 이번 자동화는 공개 보고서·정확한 head CI만 대조했으며 실제 원문·proof·쿠키·키·민감 로그를 읽거나 새 원격 시험/유료 호출/서명/지급을 실행하지 않았다.

## 2026-10-23 공개 현황

원격 확인 **2026-10-23 11:17 KST**. develop은 [7609921](https://github.com/gw020328-oss/clear-education-v4/commit/7609921095b0144b70181fe12e0fcd826f88b36c), main은 [99221a5](https://github.com/gw020328-oss/clear-education-v4/commit/99221a521b7496e78c4c1f16febe2e74a92b97a5)다. 10월 21일 문서 PR #105/#104 이후 두 기준 브랜치의 새 기능 병합은 없다. 아래는 공개 PR·보고서의 저장된 결과이며 이번 자동화에서 실행한 결과가 아니다.

main의 제공 코드·의존성·기존 사용법은 유지한다. main의 재현 경로는 기존 ProofAdapter 합성 테스트 36개와 문서 CI이며, 아래 작업 브랜치의 도구는 main의 로컬 명령으로 제공하지 않는다.

[#103](https://github.com/gw020328-oss/clear-education-v4/pull/103)은 10월 22일 [3321891](https://github.com/gw020328-oss/clear-education-v4/commit/33218918c785288c6ab78358737503c97d47ef99)로 **codex/bootcamp-e5-api-bridge 작업 브랜치에만 병합**됐다. develop/main 병합이 아니다. [고정 head의 원천 검토](https://github.com/gw020328-oss/clear-education-v4/blob/e658b4026b44f800b607d2d7db64e14f3fd81666/docs/hackerrank/WORKER_SOURCE_REVIEW.ko.md)는 hackerrank-two-proof.3의 같은 TLS 응답 구조를 신뢰하는 CLEAR worker가 검사하고 최소 공개 필드를 공증 서명이 검증하는 책임을 구분한다. independentStructureProof=false이며 숨긴 JSON 전체 구조의 독립 증명이나 실제 새 proof·수락 성공을 뜻하지 않는다. 저장된 135/135는 합성 로컬 검증이고 실제 로그인/새 proof/API 수락/registry 조회/AI/체인/지급은 해당 PR에서 0건이다.

[#78](https://github.com/gw020328-oss/clear-education-v4/pull/78)·[#102](https://github.com/gw020328-oss/clear-education-v4/pull/102)의 [backend 시험 클라이언트 보고](https://github.com/gw020328-oss/clear-education-v4/blob/85212551fd8e86b22b2c0c0b3525100e9579f2f7/docs/current/BOOTCAMP_BACKEND_TEST_CLIENT.ko.md)에는 제품 web/·프론트 PR #60과 별개인 최소 정적 시험 페이지와 두 외부 테스트 지갑의 명시적 인증·원천 메시지 서명·동의·receipt 조회 준비가 추가됐다. **develop 작업 브랜치 기준, main 미반영이며 develop에도 아직 미병합**이다. 제품 프론트 완료·배포·실제 통합 시험 성공으로 설명하지 않는다.

공개 보고서의 실제 r2 실행은 두 역할 SIWE·신청 결합 뒤 원천 요청 단계에서 COLLECTION_FAILED로 종료됐다. 원천 요청·증거·이벤트 0건으로, 원천 서명·AI 호출·TEST 지급에 도달하지 않았다. 실제 하위 예외는 미보존이다. 동일 구성의 합성 재현에서 SQLite 트랜잭션 중첩 진입과 체크섬/소문자 지갑 비교 결함을 재현했고, source 후보 34d3661을 새 v11 intake에 명시 인수했다. [v11 검증 기록](https://github.com/gw020328-oss/clear-education-v4/blob/85212551fd8e86b22b2c0c0b3525100e9579f2f7/docs/current/BOOTCAMP_V11_VERIFICATION.json)은 기존 core159개 중 live-context.mjs 한 파일 변경, 정적 브라우저 5개 자산 불변, 이전 intake/guard·r2 기록 보존을 보고한다. 원천 세션 회귀21/21·지문 변조/보존35/35·자산 연결2/2는 각각 별도 검사다. **수정 후 실제 재시험·새 로그인·새 원천 lease·유료 AI 호출은 없으며** 기존 source 만료·서명·지급 정책도 연장/변경하지 않았다. 과거 합성 원천 run3의 100 TEST 성공을 이 실제 시험의 성공으로 재사용하지 않는다.

### 이번에 변경된 PR의 정확한 head CI

| PR / 상태 | 확인 head SHA | 완료 SUCCESS / 표시 검사 | 실행 근거 |
| --- | --- | --- | --- |
| [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78) / OPEN | cd9b80cbf3c44fe15d0bc3944bbb80e2a699fae5 | 9/9 | [run 39822069109](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822069109) · [run 39822069143](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822069143) · [run 39822069112](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822069112) · [run 39822069114](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822069114) · [run 39822520961](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822520961) |
| [#102](https://github.com/gw020328-oss/clear-education-v4/pull/102) / OPEN | 85212551fd8e86b22b2c0c0b3525100e9579f2f7 | 9/9 | [run 39821952947](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39821952947) · [run 39821952769](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39821952769) · [run 39821952848](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39821952848) · [run 39821952710](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39821952710) · [run 39822185212](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822185212) |
| [#103](https://github.com/gw020328-oss/clear-education-v4/pull/103) / MERGED | e658b4026b44f800b607d2d7db64e14f3fd81666 | 3/4 | [run 39773494117](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39773494117) · [run 39773487345](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39773487345) |

#103의 Public synthetic tests는 FAILURE(STAGE_SOURCE_PIN)이며 전체 성공으로 처리하지 않는다. #78/#102의 새 head는 각각 표시 검사9개가 모두 SUCCESS지만, 본문의 과거 head944afaf 18/18을 최신 head 결과로 재사용하지 않는다. 검사 개수는 테스트 사례 수가 아니며 후속 head 성공이 #103 당시 실패를 소급 성공으로 바꾸지 않는다. 이 자동화는 기능/CI를 수정하거나 해당 기능 PR을 병합하지 않았다.

이전 날짜별 열린 PR·준비·미실행 표기는 당시 기록이다. 현재 상태는 이 절을 우선한다. 실제 자료 전체 연결·새 증명·100 TEST 수령의 전체 시연과 제품 인수는 여전히 미완료이며, 기존 합성/실제 AI 평가·Mac 원인 미확정 기록은 보존한다. 이번 작업은 공개 근거만 대조했고 새 로그인·원문/키 접근·유료 호출·서명·거래·배포를 하지 않았다.

## 2026-10-21 공개 현황

원격 확인 **2026-10-21 11:04 KST**. develop은 [028e69e](https://github.com/gw020328-oss/clear-education-v4/commit/028e69ed8af878bfdef741d58f6ac32c8be3baf2), main은 [84e0d51](https://github.com/gw020328-oss/clear-education-v4/commit/84e0d51685c5c6f29b5d3ba10f39009032748a26)다. 마지막 문서 병합 이후 새 기능 병합은 없다. 아래는 열린 PR과 공개 보고서의 저장된 결과이며 이번 자동화의 재실행 결과가 아니다. 모든 신규 구현은 **develop 작업 브랜치 기준, develop/main 미병합**이다.

main에서 재현할 수 있는 제공 범위는 기존 ProofAdapter 합성 테스트 36개와 문서 CI다. 기존 코드·의존성·설치/실행 방법은 유지하며 아래 미병합 기능의 로컬 명령은 제공하지 않는다.

- **TEST 지급 실험:** [#93](https://github.com/gw020328-oss/clear-education-v4/pull/93)의 새 memory EVM, [#95](https://github.com/gw020328-oss/clear-education-v4/pull/95)의 소유 Geth·canonical reader/영속 envelope, [#100](https://github.com/gw020328-oss/clear-education-v4/pull/100)의 제한된 B 포트, [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78)·[#102](https://github.com/gw020328-oss/clear-education-v4/pull/102)의 API 연결이 단계별로 보고됐다. [정상 경로 보고](https://github.com/gw020328-oss/clear-education-v4/blob/6962c1394b82aac633a686e1d197475d1803aacb/docs/bootcamp-execution/E5B_NORMAL_PATH.ko.md)의 저장된 run3는 **합성 원천**으로 같은 신청·100 TEST 전액 배정·양측 동의·accept/claim·canonical receipt·정확 100000000 atoms 수령·중복 거부를 확인했다. 실제 로컬 격리 체인 실행이지만 실제 학습/원천 자격·실자금·공개 체인 지급 성공은 아니다. 성공 run3를 재실행하지 않았다.
- **AI 평가:** [#94](https://github.com/gw020328-oss/clear-education-v4/pull/94)는 Free Tier 준비 기록이고, [#96](https://github.com/gw020328-oss/clear-education-v4/pull/96)·[#97](https://github.com/gw020328-oss/clear-education-v4/pull/97)의 유료 v1/v2는 각 첫 호출 후 중단·채점 미완료 기록이다. 후속 [#98](https://github.com/gw020328-oss/clear-education-v4/pull/98)의 [v3 실제 평가 보고](https://github.com/gw020328-oss/clear-education-v4/blob/a70183d0ccde07bf8b6473d806ae8dbf39918d07/docs/ai-vision/REVIEW_PRECHECK_E6_WIRE_V3_ACTUAL_20261019.ko.md)는 공개 합성 Python 8건에 실제 생성 8회·HTTP2xx 8회, **7 PASS·1 NEEDS_IMPROVEMENT(PY05)**, topic 상태 23/24·기대 PRESENT 근거 21/21을 기록했다. 실행 코드 636817f와 결과 기록 a70183d를 구분한다. 이는 독립 holdout·실제 학생 자료·일반 정확도·지급 자격 입증이 아니다. 이전 중단/과거 평가 횟수와 합산하지 않으며 개별 thinking 누락과 invoice 미확인을 보존한다.
- **실제 원천 연결의 남은 공백:** [#87](https://github.com/gw020328-oss/clear-education-v4/pull/87)은 생성된 합성 계정의 실제 로컬 Moodle 읽기와 consumer 인계를 진행했다. [#101](https://github.com/gw020328-oss/clear-education-v4/pull/101)·[#102](https://github.com/gw020328-oss/clear-education-v4/pull/102)는 같은 request/source의 회고 packet 준비와 정확 승인 후 단회 실행을 분리했다. 새 정확 packet 승인 없이 모델 호출을 허용하는 변경이 아니다. [#103](https://github.com/gw020328-oss/clear-education-v4/pull/103)의 [HackerRank 원천 검토](https://github.com/gw020328-oss/clear-education-v4/blob/043abb4f1bcc396a2fb631c80c94bc71576c7381/docs/hackerrank/SOURCE_EXTRACTION_REVIEW.ko.md)는 실제 중첩 응답용 제품 recipe·hosted trust·새 request-bound proof pair가 남았고 pending trust는 UNCONFIGURED/API HOLD임을 명시한다. #103 base는 develop이 아닌 #102 작업 브랜치다. 실제 Moodle·HR·AI 전체 연결부터 100 TEST 수령까지의 시연은 미완료다.
- **Mac 실패 보존:** [#89](https://github.com/gw020328-oss/clear-education-v4/pull/89)의 새 head는 표시된 CI 6/6 SUCCESS로 바뀌었으나 이전 push Mac 실패를 소급 성공으로 바꾸지 않는다. [#98](https://github.com/gw020328-oss/clear-education-v4/pull/98) 실행 head의 최초 STALE_RECOVERY:EPERM 실패 및 부적절한 재실행 기록, [#99](https://github.com/gw020328-oss/clear-education-v4/pull/99)의 제한된 진단/제어 반례와 로컬 exit137 원인 미확정도 유지한다. 새 head의 CI 성공은 과거 실패 원인 해결의 증거가 아니다.

### 정확한 최신 head의 표시된 CI

아래는 확인 시점 GitHub PR/push check rollup이다. 검사 개수는 테스트 사례 수가 아니다. 공유 head의 #78/#102는 같은 16개 검사를 각각 표시하므로 서로 합산하지 않는다. CI가 각 전문 로컬/실제 원천 시험을 모두 실행했다는 뜻도 아니다.

| PR | head SHA | 완료 SUCCESS / 표시 검사 | 실행 근거 |
| --- | --- | --- | --- |
| [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78) | 6962c1394b82aac633a686e1d197475d1803aacb | 16/16 | [run 39404426285](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426285) · [run 39404427481](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404427481) · [run 39404426274](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426274) · [run 39404426750](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426750) · [run 39404426344](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426344) · [run 39404426772](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426772) · [run 39404420829](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404420829) · [run 39404423557](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404423557) |
| [#87](https://github.com/gw020328-oss/clear-education-v4/pull/87) | 364871ea139daed385f8c0ccd7033d03b8f24928 | 6/6 | [run 39401948532](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39401948532) · [run 39401942286](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39401942286) |
| [#89](https://github.com/gw020328-oss/clear-education-v4/pull/89) | c3b71c710f558529680e255222857f0e81fe1dcb | 6/6 | [run 39188332272](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39188332272) · [run 39188329405](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39188329405) |
| [#93](https://github.com/gw020328-oss/clear-education-v4/pull/93) | 17dca2eea07f50e4e15c3dc11f8b57169c7d3f9b | 6/6 | [run 39195667286](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39195667286) · [run 39195665213](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39195665213) |
| [#94](https://github.com/gw020328-oss/clear-education-v4/pull/94) | 74db9d1b4cf92aefda2d1b0d3a7588b7fe149e0c | 6/6 | [run 39199121268](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39199121268) · [run 39199117192](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39199117192) |
| [#95](https://github.com/gw020328-oss/clear-education-v4/pull/95) | 0e6d4225e5b645e57e3988dc426937b08069ead8 | 8/8 | [run 39217025497](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39217025497) · [run 39217020516](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39217020516) · [run 39217025519](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39217025519) · [run 39217020520](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39217020520) |
| [#96](https://github.com/gw020328-oss/clear-education-v4/pull/96) | 92d48daf5b3989ccced070177eae652d1347e211 | 6/6 | [run 39203112277](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39203112277) · [run 39203108887](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39203108887) |
| [#97](https://github.com/gw020328-oss/clear-education-v4/pull/97) | 6d084a9f93dbd1f4a015c2a6badb62ba70ee83ee | 6/6 | [run 39216795980](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39216795980) · [run 39216791076](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39216791076) |
| [#98](https://github.com/gw020328-oss/clear-education-v4/pull/98) | a70183d0ccde07bf8b6473d806ae8dbf39918d07 | 6/6 | [run 39223904324](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39223904324) · [run 39223899314](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39223899314) |
| [#99](https://github.com/gw020328-oss/clear-education-v4/pull/99) | f4f9994e3add8b0054ad493a6db095b5e243d6f4 | 6/6 | [run 39222272987](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39222272987) · [run 39222245822](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39222245822) |
| [#100](https://github.com/gw020328-oss/clear-education-v4/pull/100) | a4a05c7aa6a1614760273e78edb5ba6ccb556232 | 9/9 | [run 39226115657](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226115657) · [run 39226107105](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226107105) · [run 39226115619](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226115619) · [run 39226115632](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226115632) · [run 39226107045](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226107045) |
| [#101](https://github.com/gw020328-oss/clear-education-v4/pull/101) | eaba9c0b6293b8904f75e218db0b60c7d429bf02 | 6/6 | [run 39401956172](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39401956172) · [run 39401950712](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39401950712) |
| [#102](https://github.com/gw020328-oss/clear-education-v4/pull/102) | 6962c1394b82aac633a686e1d197475d1803aacb | 16/16 | [run 39404426285](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426285) · [run 39404427481](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404427481) · [run 39404426274](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426274) · [run 39404426750](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426750) · [run 39404426344](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426344) · [run 39404426772](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426772) · [run 39404420829](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404420829) · [run 39404423557](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404423557) |
| [#103](https://github.com/gw020328-oss/clear-education-v4/pull/103) | 043abb4f1bcc396a2fb631c80c94bc71576c7381 | 4/4 | [run 39444463889](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39444463889) · [run 39444455554](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39444455554) |

이전 날짜별 미실행·Draft·실패·열린 PR 표는 해당 시점 기록이다. 최신 원격 사실은 이 절을 우선한다. 다른 작성자의 기능/stacked PR은 문서 전용 PR으로 취급하거나 이 자동화에서 병합하지 않는다. 이번에는 공개 문서·CI만 대조했으며 실제 로그인·원문·키·새 모델 호출·서명·체인 거래·배포는 수행하지 않았다.

## 2026-10-19 공개 현황

원격 확인 **2026-10-19 11:02 KST**. main [8f50a53](https://github.com/gw020328-oss/clear-education-v4/commit/8f50a531d7f04c311f9929fcce36bbf53c64a518)과 develop [97d5024](https://github.com/gw020328-oss/clear-education-v4/commit/97d5024ebb1a8371ae8a996cf76624af9e067269)은 어제 문서 병합 이후 새 기능 병합이 없다. main의 기존 코드·의존성·설치/실행 방법은 그대로다.

새 [E1 #84](https://github.com/gw020328-oss/clear-education-v4/pull/84)·[unsigned E2 #85](https://github.com/gw020328-oss/clear-education-v4/pull/85)·[AI E6 준비 #86](https://github.com/gw020328-oss/clear-education-v4/pull/86)·[Moodle 재수집 준비 #87](https://github.com/gw020328-oss/clear-education-v4/pull/87)·[비지급 E4 #88](https://github.com/gw020328-oss/clear-education-v4/pull/88)·[E3 검토 절차 #89](https://github.com/gw020328-oss/clear-education-v4/pull/89)와 갱신된 [TEST 계획 #78](https://github.com/gw020328-oss/clear-education-v4/pull/78)은 **develop/main 미병합**이다. 공개 PR이 보고하는 합성 구현·격리 fixture·unsigned 준비를 main 제공 기능이나 실제 모델/원천 인수·권한 발급·지급으로 안내하지 않는다. AI Python 실제 평가는 기본 차단/품질 N/A이며, #88은 payoutEnabled=false로 지급 활성화가 아니다.

#89의 정확한 head fb9e6d3a9f35c8d12b80f0c84e01d8a6db9aeda1는 [push Mac FAILURE](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142228451)·[PR Mac SUCCESS](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142236991)다. 후속 [Mac 시험 PR #90](https://github.com/gw020328-oss/clear-education-v4/pull/90)의 head 41354e0283709f74dd64a9dc6435703c804853c6에서는 [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39187720556)·[push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39187717033) 세 검사가 모두 성공했지만, 미병합 시험 보강이며 과거 실패 원인 해결이나 main 제품 복구 완료의 증거가 아니다.

나머지 기존 열린 PR과 C1~C3의 develop 구현 범위·제약은 아래 날짜별 기록을 참고한다. 선행 기능 이력이 섞인 PR은 문서 PR로 취급하지 않는다. 이번 갱신은 공개 PR/CI만 대조했으며 실제 계정·원문·모델 API·서명/지급을 실행하지 않았다.


## 2026-10-18 공개 현황

원격 확인 **2026-10-18 12:11 KST**. main은 [`72fe051`](https://github.com/gw020328-oss/clear-education-v4/commit/72fe051c1aad6b99def4d864cd2e3841308e857c), develop은 [`9c542c3`](https://github.com/gw020328-oss/clear-education-v4/commit/9c542c38892d0a5d5e71fcbe4f87f1017d8fe843)이며 어제 이후 새 기능 병합은 없다. main의 공개 코드·의존성·기존 설치/실행 방법은 그대로다.

새로 열린 [#78 부트캠프 계획](https://github.com/gw020328-oss/clear-education-v4/pull/78), [#79 HackerRank 오프라인 증거](https://github.com/gw020328-oss/clear-education-v4/pull/79), [#80 합성 증거 ledger](https://github.com/gw020328-oss/clear-education-v4/pull/80), [#81 지급 권한·풀 재원 경계 리뷰](https://github.com/gw020328-oss/clear-education-v4/pull/81)는 **develop/main 미병합**이다. 계획·합성 producer·설계 리뷰를 현재 main에서 실행 가능한 기능이나 최종 정책·실제 지급으로 안내하지 않는다. #79는 기본 UNCONFIGURED_BLOCKED·새 실제 공식 proof 0, #80은 기본 DISABLED/합성 인수·실제 수락 불가이며, #81은 새 지급 키/서명/거래를 구현한 PR이 아니다.

확인한 최신 head는 #78 `733fe69`, #79 `0da3abe`, #80 `66893ea`, #81 `c9c0ee0`이며 각 PR/push의 공개 이력·합성 시험·Mac 복구 CI가 성공했다. CI 성공은 병합·운영 기능·실제 자격/지급 검증이 아니다. 일부 PR의 base diff에는 미병합 선행 기능 이력이 포함되므로 문서만 바꾼 PR로 취급하지 않는다.

[Moodle #71](https://github.com/gw020328-oss/clear-education-v4/pull/71)의 격리 fixture와 [AI #72](https://github.com/gw020328-oss/clear-education-v4/pull/72)의 Python 회고 세 항목 MOCK 검토도 미병합이다. 실제 기관/본인·전체 AND·지급이나 실제 Python 회고 모델 품질 성공으로 확대하지 않는다. 아래 2026-10-17의 main 재현 경로와 develop C1~C3 상태는 그대로 유지하며, 이번 문서 작업은 로그인·실제 proof·새 유료 모델 호출을 수행하지 않았다.


## 2026-10-17 공개 현황

확인 시각 **2026-10-17 11:08 KST**. main은 [`58261aa`](https://github.com/gw020328-oss/clear-education-v4/commit/58261aa2465bfc4b34d181dde2757add6eec7283)이며 제공 코드·의존성·기존 시작 명령은 그대로다. main에서 재현하는 경로는 기존 ProofAdapter 합성 테스트 36개와 문서 CI다. 아래 새 기능 코드는 main에 포함되지 않는다.

develop은 [4756589659a40c8f8fe45452a698b8a56487628c](https://github.com/gw020328-oss/clear-education-v4/commit/4756589659a40c8f8fe45452a698b8a56487628c)(PR #67 병합)이다. [고정 커밋의 HTTP 인계](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/current/MVP_SOURCE_HTTP_HANDOFF.ko.md)와 [C3 계약](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/current/MVP_EVIDENCE_HTTP_CONTRACT.ko.md)을 참고하면 원문/학생 신청·합성 표시 확인·C2 합성 문서 검토·C3 고정 fixture 수락과 M2 결과 영속 조회가 구현됐다. **develop 기준, main 미반영**이며 실제 동의·운영 원천/신원·개인자료·최종 자격/지급·팀원 화면 통합은 미완료다. 과거 공개 현황에서 열린 PR로 적은 #41~#48은 현재 develop에 병합됐다.

[격리 Moodle 1502 재시험](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/moodle/RETEST_1502.ko.md)은 새 합성 계정/강좌를 실제 로컬 브라우저/API에서 확인한 저장 결과 21/21 PASS다. 실제 학원·장기 학습·집중·전체 환급 자격의 증거가 아니다. [Gemini 재평가](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/ai-vision/GEMINI_RECOVERY_EVALUATION.ko.md)는 합성 자료 3사례에 실제 생성 5회, v4 작은 비교 3/3 기록이며 실제 학생 문서·진위/전체 이력 성능이 아니다. 이번 자동화는 로그인·API 재실행·새 유료 호출을 하지 않았다.

[#67 최종 head `973ac05`](https://github.com/gw020328-oss/clear-education-v4/pull/67)의 [PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38751820489)·[push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38751808131)는 세 검사 모두 SUCCESS다. 반면 [#61](https://github.com/gw020328-oss/clear-education-v4/pull/61)의 push Mac은 CANCELLED로 6/6 성공이 아니다. 정확한 head의 CI와 병합 커밋·실제 서비스 검증을 구분한다. source/identity·grant/outbox HOLD, 독립 청구 NO_GO, 지급 불가, 400% 사전검토 전용·500% 제외를 유지한다.

열린 개발 PR은 [#60](https://github.com/gw020328-oss/clear-education-v4/pull/60) · [#66](https://github.com/gw020328-oss/clear-education-v4/pull/66) · [#69](https://github.com/gw020328-oss/clear-education-v4/pull/69) · [#70](https://github.com/gw020328-oss/clear-education-v4/pull/70) · [#71](https://github.com/gw020328-oss/clear-education-v4/pull/71) · [#72](https://github.com/gw020328-oss/clear-education-v4/pull/72) · [#73](https://github.com/gw020328-oss/clear-education-v4/pull/73) · [#74](https://github.com/gw020328-oss/clear-education-v4/pull/74) · [#75](https://github.com/gw020328-oss/clear-education-v4/pull/75)다. 모두 확인 시점 미병합이며 해당 연구/프론트/후기 연결 성과를 main 제공 기능으로 안내하지 않는다. 아래 이전 날짜의 기준 커밋과 열린 PR 표는 당시 기록이다.


## 2026-10-15 공개 현황

원격 확인: **2026-10-15 11:52 KST**. 기본 브랜치 main의 제공 범위와 develop에서 진행한 구현·실험을 구분한다. 아래 저장된 실제 실행·시험 결과를 이번 문서 작업의 재실행으로 표현하지 않는다.

| 브랜치 | 확인한 커밋과 제공 범위 |
| --- | --- |
| main | [`2af7736d650ae75d7de9caad6c8d71c88ac45421`](https://github.com/gw020328-oss/clear-education-v4/commit/2af7736d650ae75d7de9caad6c8d71c88ac45421), [CI 구성 PR #49](https://github.com/gw020328-oss/clear-education-v4/pull/49) 병합. 기존 코드·의존성·README 사용법 그대로, ProofAdapter 합성 테스트 36개가 공개 재현 경로 |
| develop | [`5eb651a8664ea81a203431d7a8f9a24ab3972f55`](https://github.com/gw020328-oss/clear-education-v4/commit/5eb651a8664ea81a203431d7a8f9a24ab3972f55), [진행 문서 PR #44](https://github.com/gw020328-oss/clear-education-v4/pull/44) 병합. [해당 커밋의 상세 현황](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/status.md)은 develop 기준이며 main 기능·배포 완료가 아님 |

### develop에서 확인한 진행 — main 코드에는 미반영

- 제품 증명 세션·합성 결과 단회 수락과 별도 로컬 등록 이력 접수·실제 수집기 연결이 병합됐다. [등록 접수 설명](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/HISTORY_INTAKE.ko.md), [비식별 실행 기록](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/history-intake-verification.json), [PR #35](https://github.com/gw020328-oss/clear-education-v4/pull/35). 저장된 실제 성공은 표 증명·공식 서명·독립 검증·접수/DB 복구 범위다. 전체 이력·신원·제품 자격·지급은 미확인이다. 빈 응답 관찰은 인증된 미응시 결과나 성공한 타 사용자 수집이 아니다.
- [TEST 재원 실험 PR #36](https://github.com/gw020328-oss/clear-education-v4/pull/36)은 새 인메모리 체인과 인공 자격 fixture에서 부분 충전·전액 배정·고정 수령인 단회 지급을 검증했다. [실험 설명](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/TEST_FUNDING_LAB.ko.md), [저장된 합성 기록](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/test-funding-lab-verification.json). 실제 원천 자격·PG·원화·실자금·제품 지급 성공이 아니다.
- 확인 시점 [#41](https://github.com/gw020328-oss/clear-education-v4/pull/41), [#42](https://github.com/gw020328-oss/clear-education-v4/pull/42), [#43](https://github.com/gw020328-oss/clear-education-v4/pull/43), [#45](https://github.com/gw020328-oss/clear-education-v4/pull/45), [#46](https://github.com/gw020328-oss/clear-education-v4/pull/46), [#47](https://github.com/gw020328-oss/clear-education-v4/pull/47), [#48](https://github.com/gw020328-oss/clear-education-v4/pull/48)은 열린 개발 PR이다. 검사 성공이나 PR 생성만으로 main/develop 반영을 주장하지 않는다.
- 실제 Moodle·원천 자격 검증 BLOCKED, grant/outbox HOLD, 독립 청구 제품 NO-GO, 400% 자동 자격·지급 금지를 유지한다. 실제 자격/지급 통합·사업 단위 시험 재사용 방지·타 사용자 실제 수집·비개발자 합성 사용성·운영 배포는 후속이다. Mac CI 최초 timeout의 원인도 미확정이다.

### main 문서 PR 검증

[Main documentation CI](../.github/workflows/main-docs-ci.yml)는 공개 Git 이력, 문서 링크·제목·자동화 문서 전용 변경 범위, 기존 main ProofAdapter 합성 테스트를 검사한다. 구성 PR의 정확한 head `4c69067267dd981a5e413a7e0f3a5ec5470ea1e1`에서 [PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38673134697)와 [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38672583222)의 Public content history/Public synthetic tests가 모두 통과했다. 이는 실제 YBM·지급·배포 검증이 아니다. 이후 문서 PR은 각 최신 head의 전체 CI와 문서 범위를 다시 확인한다.

## 이전 main 기준의 기록

아래 기록과 다음 단계는 당시 main 코드의 범위이며 최신 develop의 구현 상태와 구분한다. 이 문서 갱신은 develop 기능 코드를 main에 가져오거나 기존 실행 방법을 변경하지 않는다.

기준: 2026.10.10. 아래는 단계별 검증 범위를 구분한 기록입니다.

| 영역 | 확인한 결과 | 아직 확인하지 않은 범위 |
| --- | --- | --- |
| 기존 Stage14/15 | AI·검토·서명·예치·직접 청구 로컬 시제품과 과거 실행 기록 | 실제 YBM 통합 환급 서비스 |
| 기존 YBM 진단 | 실제 계정 1개, 응시자·성적 증명 1쌍 연결 | v4 새 신청·지갑 연결, 다계정 안정성, 실명 인증 |
| 기존 Amoy 실험 | 과거 상태의 로컬 포크에서 검증 계약 호환성 | 공개 체인 거래·지급, 현재 배포 상태 |
| W01 | 별도 작업본, 코드 참고본 191개, 환경·의존성 준비 | 제품 구현 완료 |
| W02 | 오프라인 합성 시험 36개 통과 | 실제 증명 생성, TEE, 자격 판정, 지급, DB 동시성 |

각 시험의 수를 합산해 정확도나 제품 완성률로 사용하지 않습니다. 상세 근거는 [감사 기록](reference/AUDIT.ko.md)과 [W02 결과](w02/REPORT.ko.md)에 있습니다.

## 다음 단계

1. 기존 실제 YBM 성공 경로와 새 버전의 TEE·지갑·문맥 호환성 확인
2. 수집 클라이언트 격리, 최소 정보 추출, 임시 저장·삭제 경계 구현
3. 새 실제 증명을 새 신청에 연결하고 800점·시드 수강률 80% 판정과 로컬 지급 검증
4. 중복·변조·기한·장애·직접 청구 및 삭제 검사
5. 비개발자 최소 2명의 사용성 시험

실제 증명 시연과 합성 자료를 사용한 사용자 체험은 별도 결과로 보고합니다. 수동 provider 작성 도구의 오류는 기존 직접 생성 경로 전체가 실패했다는 의미가 아닙니다.

## 후속 범위

실명 본인확인, 실제 학원 API, 원화 지급, 공개 Amoy 지급, 여러 교육기관 지원과 실제 도입·예치 의향 검증은 후속 과제입니다. [PRD](reference/PRD.ko.md)
