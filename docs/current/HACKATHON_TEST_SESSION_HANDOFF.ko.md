# 현재 정상 시연 작업의 인계 입구

2026-10-20. 현재 단위를 중단하거나 새 세션을 만든 기록이 아니다. 사용자는 현재 작업을 마친 뒤 새 개발 세션으로 나누어 인계하도록 요청했다. 생성·최종 분배는 본부가 인계 확인 후 진행하며 기존 채팅은 아직 보관하지 않는다.

현재 목표는 [첫 정상 우선 addendum](HACKATHON_TEST_OPERATIONS.ko.md)의 **한 신청 실제 원천→AI→동일 판정·100 TEST 전액 배정→양측 동의→accept/claim→canonical receipt·정확 수령·중복 거부**다. 최신 상태는 [기계 인수표](hackathon-test-intake.json)를 따른다. 합성 원천으로 실제 체인 지급100 TEST는 완료했으나 실제 원천 전체 시연은 아직 완료되지 않았다. 새 복구·추가 평가·플랫폼·Mac/Windows 확대는 후순위다.

| 소유자 | 작업본 / 현재 기준 | 현재 다음 한 작업과 소유 경로 |
| --- | --- | --- |
| 통합 | `clear-education-v4` / `codex/python-bootcamp-p0`, PR78 | 단일 실행 순서·실제 차단점·검토 source pin과 최종 인수. `docs/current`, `specs/bootcamp` |
| API | `clear-bootcamp-api-store` / `codex/bootcamp-e5-api-bridge`, PR102·937f982 API checkpoint / 62f2c59 소유 인계 병합 | 실제 source consumer와 실행 entry 구현, v5 지문 소비 대기. `src/bootcamp`, `tools/bootcamp`; 후속 미커밋은 API 소유자가 보존·확정 |
| 금고/P1 | `clear-hackerrank-bootcamp` / `codex/hackathon-normal-source-entry`, PR100 고정a4·후속2be/4d·5465178·8851775 | 실제 형식 진단 명령 준비, 중앙 로그인 안내 대기. `src/hackerrank-evidence`; 고정 금고/typed 변경 이력 보존 |
| Moodle | `clear-moodle-review-api` / 기존 전용 브랜치, PR87·d3709a0 인계 | API가 확정한 binding으로 기존 source를 마지막에 fresh 획득. [정상 인계](../moodle/REVIEW_API_NORMAL_PATH_HANDOFF.ko.md) |
| AI | `clear-ai-review-precheck` / `codex/ai-first-normal-handoff`, PR101·1276b91 | 같은 신청의 현재 원문 packet 연결, 새 단1회 승인 전 호출0. [정상 인계](../ai-vision/REVIEW_PRECHECK_FIRST_NORMAL_HANDOFF.ko.md) |

API가 발급했던 `normal-live-4d15aa1e...` 준비는 원천0·배정0이고 중단 중 최초접수1800초창이 만료됐다. 옛 신청/DB/키/체인은 보존하며 시간을 고쳐 재사용하지 않는다. 실제 HR/AI 준비 후 마지막 시점에만 필요한 새 run/application을 발급한다. 불변 mapping을 바꿔야 한다면 소유자들이 필요성을 확인하고 옛 체인을 보존한 별도 격리 realm으로만 준비한다.

실행된 합성 명령은 `./tools/node tools/bootcamp/normal-chain.mjs --synthetic-source`이며, 저장 결과의 sourceMode/realSourceVerified=false를 유지한다. 이미 성공한 run3를 인계 확인용으로 재실행하지 않는다. 실제 원천 단일 명령은 API 담당이 확정 중이다. 키/쿠키/raw proof/token은 이 문서·채팅에 복사하지 않고 소유자의 안전 설정 참조만 전달한다. 기존 준비 metadata와 private 결과 파일은 소유 위치에 그대로 둔다.

각 담당은 자기 현재 소작업을 끝낼 때 기존 전용 문서에 짧게 **현재 성공/차단점, repo·worktree·branch·commit/PR, 미커밋 소유자와 보존법, 실행 명령·소유 환경/프로세스·공개 pin, 실제/합성 구분과 검증, 다음 한 작업/소유 경로**를 남긴다. 다른 담당 파일을 중복 편집하거나 독립 후속 고도화를 시작하지 않는다. **PR21/PR36 등 끝난 과거 작업으로 돌아가지 않는다.** 현재 정상 시연 완료 또는 사용자가 필요한 차단점에서 단위를 종료하기로 결정한 뒤 본부에 이 입구와 소유 인계를 전달한다.

2026-10-20 추가 인수: 통합 소유자가 API937의 bridge·원자 ledger·current/권한 및 실제 source consumer/entry를 읽고 [memory 호환 v5](../../specs/bootcamp/hackathon-test-memory-source-intake-v5.json)에 API27·producer seam6·entry3개 지문을 고정했다. 기존 v1–v4 및 정상3개 delta는 보존하며, 금고 소유자가 새 consumer/guard를 명시 소비하고 관련 검사를 마치기 전에는 결합 CI 인수가 아니다. 이 기록은 실제 HR trust·proof·새 AI 호출·실제 source 전체 시연 승인이 아니다.

HackerRank [비수락 형식 진단 안내](https://github.com/gw020328-oss/clear-education-v4/blob/8851775fa4f34e1af0a858436cf3dea648eda9af/docs/hackerrank/LAYOUT_DIAGNOSTIC.ko.md)는 금고/P1 작업본의 `./tools/node src/hackerrank-evidence/layout-launch.mjs`다. 새 Chrome에서 본인 로그인 뒤 ready, 같은 탭 본인 인증서 화면을 여는 사용자 행동이 필요하다. 원문 없는 구조만 반환하고 proof/API 수락/지급은 하지 않는다. root는 정확 코드177줄을 읽었으며 실제 로그인0이다. 본부에서 한 번 안내하도록 조정하며 다른 담당이 중복 로그인·유료 승인 질문을 보내지 않는다.
