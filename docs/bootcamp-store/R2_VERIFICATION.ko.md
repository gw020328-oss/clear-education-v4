# R2 / E1 검증 기록

2026-10-18. 소유 worktree의 `be0b6991006dd01b503b9381d02e3a724dc49c4b` 위 미커밋 구현을 보존하여 검토했다. 모든 시험은 공개 합성 source와 새 임시 SQLite/인공 지갑을 사용했다. 실제 source acceptance/fresh proof pair/개인 자료/기존 DB·키·체인 접근은 0건이다.

## 반례와 수정

수정 전 33개 소비자·반환 경계 시험에서 16개 반례가 실패했다. retained Moodle candidate가 close/expiry/auth·raw·query 단축/revoke 뒤 원문을 계속 돌려주었고, 일부 v1/history/operator pagination에서 source refresh 도중 logout·role 변경·clock expiry를 놓쳤다. collect 준비 transaction과 실제 producer microtask 사이 logout 뒤에도 producer가 호출됐다. 기존 83개 PASS로 이 경계를 완료 처리하지 않았다.

수정 후 guarded 원문 accessor/metadata snapshot, producer 진입 및 Moodle 호출 전후 재검사, v1/v2 최종 clock/source/권한·role·scope 검사, await 뒤 HTTP 재검사를 추가했다. 새 action 쓰기의 rollback과 source invalidation의 commit을 분리했다. 이미 수락된 뒤 HTTP 반환이 차단되는 경우 immutable 수락은 보존한다.

## 실행 결과

| 검사 | 실제 결과 |
| --- | --- |
| 전용 store/consumer/운영/HTTP/security/SIGKILL·경쟁 | 111/111 PASS, 마지막 source callback의 로그아웃 반례 포함 |
| workflow + application | 411/411 PASS, 외부 network guard 적용. 이후 마지막 source callback 반례 2개와 collector 권한 callback 전달을 전용111개에서 재검증 |
| P1 + Moodle review + AI reflection/grounding | 241/241 PASS, 외부 network guard 적용 |
| 보존 | verify:workspace PASS, 원본191·공개 reference4·profile3 및 dependency graph 보존 |
| 의존성 | verify:dependencies PASS, 기존 ethers6.17.0/ganache7.9.2/solc0.8.30, 메모리 compile만 수행 |

최초 producer 회귀 명령은 존재하지 않는 `tests/document-review` glob 때문에 실행 전 종료했다. 경로를 `tests/ai-review-precheck/bootcamp-reflection.test.mjs`와 `grounding.test.mjs`로 바로잡아 위 241개를 실행했다. 이를 제품 결함이나 테스트 PASS로 기록하지 않았다.

실행은 pinned Node24.21.0을 사용했다. P1 SDK dependency는 기존 설치를 무시되는 node_modules에 재사용했다. root package/lock은 바꾸지 않았다. CI 변경은 기존 설치 단계의 `./tools/npm --prefix src/hackerrank-evidence ci --ignore-scripts` 한 줄이며 새 시험은 기존 workflow glob으로 발견된다.

정확 구현 commit, 최종 공개 이력 scanner·변경 소유 경계, Draft PR/CI 결과는 아래 인수 기록에 추가한다. E0 새 TEST 계약 고정 입력과 E3/E4/실제 source는 아직 인수하지 않았다. 후속 절차 설계의 입력/미결은 [R2_IMPLEMENTATION.ko.md](R2_IMPLEMENTATION.ko.md)를 따른다.
