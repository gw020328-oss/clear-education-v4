# 현재 정상 시연 작업의 인계 입구

2026-10-20. 현재 단위를 중단하거나 새 세션을 만든 기록이 아니다. 사용자는 현재 작업을 마친 뒤 새 개발 세션으로 나누어 인계하도록 요청했다. 생성·최종 분배는 본부가 인계 확인 후 진행하며 기존 채팅은 아직 보관하지 않는다.

최신 인수: API `ff07743bd599456686346326236dff3847d63264`는 원격8/8 SUCCESS·미해결 검토 대화0이며 Draft/BEHIND다. 이 결과는 실제 원천 시연 완료나 develop 병합 승인이 아니다. 현재 HR 차단점은 로그인 계정 유무가 아니라 **기존 로그인 Chrome 화면과 요청 결합 암호학적 proof를 연결할 안전 수집 경로**다. 본부가 기존 탭을 읽는 범위만 확인하며 Google 재시도·자체 비밀번호 설정 요청은 보류한다. 쿠키/프로필 복사나 새 extension·아키텍처 발주로 확대하지 않는다.

현재 목표는 [첫 정상 우선 addendum](HACKATHON_TEST_OPERATIONS.ko.md)의 **한 신청 실제 원천→AI→동일 판정·100 TEST 전액 배정→양측 동의→accept/claim→canonical receipt·정확 수령·중복 거부**다. 최신 상태는 [기계 인수표](hackathon-test-intake.json)를 따른다. 합성 원천으로 실제 체인 지급100 TEST는 완료했으나 실제 원천 전체 시연은 아직 완료되지 않았다. 새 복구·추가 평가·플랫폼·Mac/Windows 확대는 후순위다.

| 소유자 | 작업본 / 현재 기준 | 현재 다음 한 작업과 소유 경로 |
| --- | --- | --- |
| 통합 | `clear-education-v4` / `codex/python-bootcamp-p0`, PR78 | 단일 실행 순서·실제 차단점·검토 source pin과 최종 인수. `docs/current`, `specs/bootcamp` |
| API | `clear-bootcamp-api-store` / `codex/bootcamp-e5-api-bridge`, PR102·937f982 source / ff07743 최종 CI 8/8 | 실제 source consumer와 실행 entry 구현, v5 명시 소비·exact-head CI8/8 완료, 미해결 대화0; 실제 HR proof 연결 미완료. `src/bootcamp`, `tools/bootcamp`; 후속 소유 커밋과 원격 CI는 API 담당이 확정 |
| 금고/P1 | `clear-hackerrank-bootcamp` / `codex/hackathon-normal-source-entry`, PR100 고정a4·후속97827dd·01dd232·ced12b1 | 비수락 진단과 v5 guard 구현 완료, 기존 로그인 Chrome 탭의 안전 proof 연결은 본부와 조정. `src/hackerrank-evidence`; 고정 금고/typed 변경 이력 보존 |
| Moodle | `clear-moodle-review-api` / 기존 전용 브랜치, PR87·d3709a0 인계 | API가 확정한 binding으로 기존 source를 마지막에 fresh 획득. [정상 인계](../moodle/REVIEW_API_NORMAL_PATH_HANDOFF.ko.md) |
| AI | `clear-ai-review-precheck` / `codex/ai-first-normal-handoff`, PR101·1276b91 | 같은 신청의 현재 원문 packet 연결, 새 단1회 승인 전 호출0. [정상 인계](../ai-vision/REVIEW_PRECHECK_FIRST_NORMAL_HANDOFF.ko.md) |

API가 발급했던 `normal-live-4d15aa1e...` 준비는 원천0·배정0이고 중단 중 최초접수1800초창이 만료됐다. 옛 신청/DB/키/체인은 보존하며 시간을 고쳐 재사용하지 않는다. 실제 HR/AI 준비 후 마지막 시점에만 필요한 새 run/application을 발급한다. 불변 mapping을 바꿔야 한다면 소유자들이 필요성을 확인하고 옛 체인을 보존한 별도 격리 realm으로만 준비한다.

실행된 합성 명령은 `./tools/node tools/bootcamp/normal-chain.mjs --synthetic-source`이며, 저장 결과의 sourceMode/realSourceVerified=false를 유지한다. 이미 성공한 run3를 인계 확인용으로 재실행하지 않는다. 실제 원천 단일 명령은 API 담당이 확정 중이다. 키/쿠키/raw proof/token은 이 문서·채팅에 복사하지 않고 소유자의 안전 설정 참조만 전달한다. 기존 준비 metadata와 private 결과 파일은 소유 위치에 그대로 둔다.

각 담당은 자기 현재 소작업을 끝낼 때 기존 전용 문서에 짧게 **현재 성공/차단점, repo·worktree·branch·commit/PR, 미커밋 소유자와 보존법, 실행 명령·소유 환경/프로세스·공개 pin, 실제/합성 구분과 검증, 다음 한 작업/소유 경로**를 남긴다. 다른 담당 파일을 중복 편집하거나 독립 후속 고도화를 시작하지 않는다. **PR21/PR36 등 끝난 과거 작업으로 돌아가지 않는다.** 현재 정상 시연 완료 또는 사용자가 필요한 차단점에서 단위를 종료하기로 결정한 뒤 본부에 이 입구와 소유 인계를 전달한다.

2026-10-20 추가 인수: 통합 소유자가 API937의 bridge·원자 ledger·current/권한 및 실제 source consumer/entry를 읽고 [memory 호환 v5](../../specs/bootcamp/hackathon-test-memory-source-intake-v5.json)에 API27·producer seam6·entry3개 지문을 고정했다. 기존 v1–v4 및 정상3개 delta는 보존하며, 금고 소유자가 새 consumer/guard를 명시 소비하고 관련 검사를 마치기 전에는 결합 CI 인수가 아니다. 이 기록은 실제 HR trust·proof·새 AI 호출·실제 source 전체 시연 승인이 아니다.

HackerRank [비수락 형식 진단 안내](https://github.com/gw020328-oss/clear-education-v4/blob/8851775fa4f34e1af0a858436cf3dea648eda9af/docs/hackerrank/LAYOUT_DIAGNOSTIC.ko.md)는 금고/P1 작업본의 `./tools/node src/hackerrank-evidence/layout-launch.mjs`다. 새 Chrome에서 본인 로그인 뒤 ready, 같은 탭 본인 인증서 화면을 여는 사용자 행동이 필요하다. 원문 없는 구조만 반환하고 proof/API 수락/지급은 하지 않는다. root는 정확 코드177줄을 읽었으며 실제 로그인0이다. 본부에서 한 번 안내하도록 조정하며 다른 담당이 중복 로그인·유료 승인 질문을 보내지 않는다.

2026-10-20 v5 소비 후속: 금고 소유 guard `97827dd`가 exact v5/36개 source를 소비했고 memory consumer SHA는 `7b4e94abd861bc0a57f0bf2d433ed2ebc9ec0054147c9da6f05801e5403cd928`다. 소유 검사 memory165/API295/B20 및 보존 검사가 각각 통과했다. API `1ef53ce`의 제품708 통과와 별도로, 원격 A 검사10개 중4개가 HR SDK 정적 import 부재로 load 실패했다. 원본 로그를 보존했고 깨끗한 사본의 root-only 실패→동일 frozen HR prefix 설치 후 import 통과를 확인했다. workflow 설치만 보완한 `727254e`를 인수한 API `8ce113c`의 원격 CI는 기록 시점 진행 중이며 PR102에서 exact head로 확인한다. 기존 source937/v5와 정책·지급 조건은 바꾸지 않았다.

진단 시작 전 의존성 누락은 설치 및 고정 phase 진단 `6efc402`로 분리했다. 이후 본부 단일 실행이 로그인 대기까지 도달했으나 Google host의 CONNECT403으로 막혔고 ready0/layouts없음/proof0 상태로 정리·삭제를 확인했다. `925e3d0`은 정확 accounts.google.com 중계만 추가하며 Google 본문 관찰0·유사 host 거부 시험16개가 통과했다. Google UI 정적 자원 차단 가능성은 아직 원인 미확정이며 본부/E4가 host 이름의 제한된 근거만 확인한다. 중복 실행·로그인 재입력·실제 proof/지급 수락은 하지 않는다.

최종 CI 보완: A의 SDK 누락은 고정 HR graph 설치로, 새 SDK 초기 RE2 경고의 stdout 오염은 프로세스 시작 전 job env silent로 각각 제어 원인을 확인했다. 제품 source937/v5 및 crash fixture/exit86/stdout0/cut/복구 단언은 유지했다. 새 ff07743에서 A 서비스44·기존 E4 164, B 및 모든 Public/Mac 검사가 통과했다. 추가 local nonce 대조의 E5_SETUP1건은 원인 미확정으로 남기며 별도1PASS로 소급 해결하지 않는다.

별도 미해결: root 문서 headc9의 push run39395283156 Linux 저장소·초기화 단계가 설정15분을 넘겨18분 이상 정체했다. 사전 metadata를 보존하고 정상 취소 요청한 뒤20분에 취소 완료됐으나 job API와 전체 workflow archive에 Linux 로그가 없다. 정확한 개별 test·runner/코드 원인은 미확정이고 소스 수정·같은 head 재실행0이다. 같은 head PR3/3 또는 이후 CI 성공으로 이를 해결 처리하지 않는다. 이 제한은 기계 인수표에 별도로 고정하며 PR78은 Draft다.

2026-10-20 새 담당 인수: 본부가 사용자 요청에 따라 HR `01a158a8-8a98-78e2-a6e5-9c4a5332a70b`, Moodle·AI `01a158a8-900a-7662-bccc-557f553d21ea`, 실행통합 `01a158a8-96c6-7d31-bf99-1468c9768992`를 지정했다. 실행통합은 API 및 이 공통 문서/specs 소유를 합쳐 인수하며 기존 세션은 재개시키지 않는다. 이후 새 채팅/하위 에이전트 추가 생성은 없다. 위 생성 전 표기는 당시 기록이다.

새 소작업에서 기존 API 포트와 두 원천 담당의 계약을 대조했다. HR은 검토 pins/안전 수집 경로 미확정으로 제공 불가이며, AI의 exact packet 승인 대기가 현재 collectBridge 전체30초 안에 들어가는 별도 순서 누락도 확인했다. [첫 정상 addendum](HACKATHON_TEST_OPERATIONS.ko.md)의 최신 단락과 기계 인수표를 따른다. 새 신청·원천·유료·체인 실행0, 소스/pin 변경0이다. 원래240초 자료 유효시간을 유지한 packet 준비/승인→AI30초 분리는 다음 API 소작업이며, HR 경로 확정 전에 가정으로 구현하지 않는다.

그 뒤 본부는 HR와 독립인 AI 최소 준비/실행 분리를 Astra / High로 승인했다. API source92387a4, 정확 v6 pin 및 금고 소유 guard7b35bb3를 정상 이력으로 결합했고 공통 작업본도 이 검토된 조합을 fast-forward 인수했다. 새 packet/source/request/lease 발급 없이 승인 후 한 번 재개하며 source240초·네트워크/모델30초 및 기존 최종 검사를 유지한다. source5cc의 관련103/103, receiver923의 준비20/20, 소유 guard39/39, API 결합 gate11/11은 별도 실행 분모다. 원격 CI는 최종 push head 확인 대기이며 HR 실제 경로/새 exact 승인·전체 실제 시연은 미완료다. 상세 [API 인계](../bootcamp-execution/E5B_NORMAL_PATH.ko.md)를 따르고 일반 API 작업 추천은 Sol / High로 되돌린다.

## 2026-10-22 C0→C1 재개

사용자 승인 revision2의 C0→C1→실제 네 조건 C2→동일 판정 양측 동의/100 TEST C3 순서로 재개했다. API/공통 clean 및 원격 PR102/78의 `6962c13`·16 SUCCESS·Draft 미병합을 인수했다. 이16건은 과거 정확 head의 결과이며 새 코드의 CI로 세지 않는다.

C1 소유 source `47972c12fa57d4a92b861f5917be2acae4e80bd6`는 [짧은 프론트 인계](BOOTCAMP_C1_FRONTEND.ko.md)의 기존 인증/bootcamp handler 배선·브라우저 표시 모듈·소량 fixture를 제공한다. v1/R2/R3, source pin36개·AI 준비/승인/실행은 변경하지 않았다. 관련 HTTPS15/15·source 보존4/4 PASS이며 새 head의 필수 CI는 push 후 확인한다. 개발 호스트는 init/start 시 신청·원천·체인·signer를 만들지 않는 C1 표시/인증 전용이다. 실제 C2 런타임·개별 source 검증·claim receipt/정확 수령 HTTP·web 화면 완주는 미연결이며 이를 null/불가로 표시한다.

HR 담당은 `01a158ea-cad1-7452-8fc0-8f027e49afa4`, 입력 담당은 기존 `01a158a8-900a-7662-bccc-557f553d21ea`다. PR103 관리형 `useSource(source)` callback 안에서 같은 owner의 pins→mapping/신청→openLiveContext 수집·지급·close를 마쳐야 한다. callback 밖으로 private lease를 직렬화하지 않는다. 구조관계는 관리형 worker 검사, 원천 바이트/서명은 Reclaim, API는 같은 호출/request의 genuine lease 수락으로 구분하며 숨긴 구조의 attestor 단독/독립 검증이라 표시하지 않는다. 미확정 recipe/trust는 계속 비활성이고 실제 검증 인수 전 source 수집0이다. Moodle/AI는 user3 생성 계정·같은 API 모듈의 private 결과·기존 prepare/resume을 재사용한다. 실제 원천용 새 신청/lease·HR 로그인·유료 호출은 아직0이다.
