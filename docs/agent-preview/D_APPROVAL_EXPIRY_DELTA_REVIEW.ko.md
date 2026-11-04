# D 승인 만료 수정 독립 재검토

대상 `38aaf6334bc5bfcd1711025828dd81a9476433e4`, base `74cbb0c438b46974f1a1513aefd52e2850dcd199`. 판정: 기존 P2 승인 lock-expiry 수정됨. 공개 tunnel 승인은 포함하지 않는다.

기존 B 반례를 새 clock callback API에 맞게만 조정해 별도 Git archive에서 재실행했다. 승인 만료311ms 후 `APPROVAL_REQUIRED_OR_SPENT`, `consumedAfterExpiry:false`였다. store는 BEGIN EXCLUSIVE 잠금 후 fresh clock으로 UPDATE하고, durable commit 후 다시 검사한다. service는 countTokens 및 generateContent 각 dispatch 직전에 검사한다.

D의15개 검사와 기존 B 추가3개(별도 SQLite worker의 단회 claim 포함)를 독립 실행해 총18개 PASS: 잠금 중 만료, commit 직후 exclusive expiry에서 spent 유지, countTokens 중 만료에서 generateContent0회 및 spent 유지, 실패/재시작/동시 단회 경계 포함. commit 직후 검사는 주입 시계를 사용하며 실제 fsync 지연을 발생시킨 검사가 아니다. 실제 키/모델/API는 사용하지 않았다.

원본 증거는 `/private/tmp/clear-d-expiry-38a-review/B-test-result.txt`, `B-expiry-lock-result.json`, `deploy/agent-preview/tests/b-expiry-lock-replay.mjs`다. 후속 `125c09e` Railway와 `e839481` Docker 변경은 이 판정에서 제외한다.
