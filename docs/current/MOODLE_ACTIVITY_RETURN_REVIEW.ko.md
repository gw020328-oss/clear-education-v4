# 지정 Moodle 활동 재조회: 종료된 연결 차단

2026-11-05. 기준 후보 `1e2240c7c1db70fb67e0e94ffc438eec3059bc80`의 B P2 후속이다. 로컬 검토 후보이며 실제 Moodle 조립·활성화와 지급은 포함하지 않는다.

## 원인과 수정

`QUEUED` 뒤 작업은 소모된 HTTP 권한에서 분리된 owner async scope에서 실행한다. 기존 구현은 CLEAR 참가자와 신청만 확인해, 원래 Moodle intent를 정상 종료해도 원천 호출 15회와 증빙 1건 저장이 가능했다.

이제 기존 POST 예약에서 `activity-complete` 재조회에 한정한 읽기 전용 권한 확인 함수를 한 번 확보한다. 함수는 원래 intent/identity·command binding·CLEAR context·원래 만료와 CONSUMED 상태를 확인한다. 5초 HTTP grant를 연장하거나 재사용하지 않는다. 새 wire 필드는 없다.

작업은 request 발급 전 이 함수를 확인하고 `collectBridge`의 내부 `assertAuthority` 옵션으로 전달한다. 저장소는 이를 기존 request authority와 결합하며 최종 acceptance/savepoint 검증에서도 확인한다. Moodle live consumer는 각 원천 호출 전후에 같은 권한을 확인한다. 종료가 조회 도중 발생하면 이미 시작한 호출의 응답을 수락하지 않고 다음 호출을 막는다. DB 저장 중 종료되면 증빙·nonce 소비를 롤백한다. 다른 HTTP 요청의 async scope가 원천 소유자의 권한을 바꾸지 않도록 기존 격리는 유지한다.

대상은 course=2, cmId=3, module=page의 기존 고정 강의다. 이 수정으로 과제·회고·HackerRank 작업을 새로 활성화하지 않는다. 명령 실행 시 검증한 Moodle identity와 로컬 intent 종료 상태를 결합하며, 독립적인 Moodle 외부 세션 변경을 실시간 통지하는 새 기능은 아니다.

## 합성 검증

기존 B 재현 `b-activity-ended.test.mjs`를 `tests/bootcamp-store/moodle-live.test.mjs`에 편입했다. 실제 SQLite와 대역 Moodle API를 사용한다.

- 정상 재조회: HTTP grant가 6초 경과해도 원래 연결이 유효하면 새 강의 증빙 1건이 current/MET이며 전체 조건은 UNKNOWN이다. 같은 명령과 오래된 revision 재사용은 거부한다.
- QUEUED 직후 원래 `commands.end(PARTICIPANT)`: 원천 호출 0회, request 0건, 증빙 0건. CLEAR 참가자 세션은 여전히 유효하므로 Moodle 종료 결합을 직접 검증한다.
- 원천 2번째 호출 중 원래 intent 종료: 추가 호출 없이 증빙 0건, request PENDING 유지.
- 최종 acceptance의 증빙 INSERT 직후 owner 종료: 증빙 INSERT와 nonce 소비가 롤백되어 증빙 0건, request PENDING 유지.

관련 명령/원천 회귀를 포함한 아래 27개 시험이 통과했다. 전체 CI나 실제 원천 검증을 뜻하지 않는다.

```sh
./tools/node --test tests/bootcamp-store/moodle-live.test.mjs tests/bootcamp-store/moodle-command.test.mjs tests/bootcamp-store/moodle-command-source.test.mjs
```

로그: `/tmp/clear-activity-intent-fix.log`. `git diff --check` 통과. B 재검토 이후 C 후보와 조립한다. 기존 100 TEST 지급 기록·실행 DB는 변경하지 않았다.

모델 요청/추천은 권한·비동기 수명 경계 때문에 GPT-6 Astra / High다. 실제 작업은 기존 GPT-6.1 Sol 세션에서 수행했으며, 턴 중 모델 변경 도구가 없어 Astra 적용으로 보고하지 않는다.
