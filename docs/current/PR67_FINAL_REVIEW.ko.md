# PR67 Mac 실패 분석·최종 실질 리뷰

요청 설정: GPT-6 Astra / High. 실제 런타임 모델 ID는 독립 조회하지 못했다. 브라우저 쿠키 전달·영속 수락 경계 분석을 위한 설정이며 CI 대기 때문이 아니다. 사용자 승인 범위는 필요한 수정과 PR67의 정상 develop 병합까지이고 main/배포는 제외한다.

## Mac 쿠키 변조 검사

기존 head `a5a3c7d2bfffbd25de25c9b9db073e855dc3166b`의 [push 실패](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38737271621/job/116429682498)는 61/62 통과, 변조 검사의 `Missing expected rejection`이었다. PR 이벤트의 Mac 성공으로 이 실패를 상쇄하지 않았다. 기존 workflow 재실행은 0회다.

검사 fixture는 `Fetch.continueRequest` ACK 직후 `Fetch.disable`을 실행했다. [Chromium 구현](https://chromium.googlesource.com/chromium/src/+/lkgr/content/browser/devtools/devtools_url_loader_interceptor.cc)의 `OnBeforeSendHeaders`는 Cookie를 네트워크 전송 직전에 적용하며, interceptor 해제 후 `OnLoaderCreated`는 변경 없는 전달 경로로 빠진다. 따라서 명령 ACK는 변조가 서버에 도달했다는 증거가 아니다.

Apple Silicon·Chrome155.0.8059.41의 새 합성 프로필/loopback 서버에서 각 조건을 미리 정한 8회씩 비교했다. `/check` 수신만 집계한 결과, 즉시 해제는 변조 전달7/8·비변조1/8, 응답까지 유지한 대조는 변조8/8이었다. 진단 초안은 favicon까지 집계하는 오류가 있어 폐기하고 `/check`만 집계하도록 고친 결과만 사용했다. 원래 CI에는 원문/요청 순서 계측이 없으므로 그 실행의 정확한 IPC 순서를 소급 입증할 수는 없다. 재현된 fixture 수명 경쟁은 동일한 실패 형태를 설명하며, 검사기의 잘못된 쿠키 수락은 재현되지 않았다. 절전·부하·막연한 flaky로 종결하지 않는다.

수정 검사는 요청 단계에서 변조하고 `interceptResponse:true`로 실제 검사 서버의 403 응답을 기다린 후 가로채기를 해제한다. 요청/응답 각각1건 및 `SYNTHETIC_COOKIE_MISMATCH`를 함께 요구한다. 성공조건 완화·skip·시간 연장·제품 쿠키 검사 변경은 없다. 기존 잘못된/누락 쿠키 거부와 첫 실패 후 정상 재전송으로 복구 불가 검사도 유지한다. 실제 Chrome 정상 왕복·취소/프로세스 종료·강제종료 복구를 포함한 Mac62/62가 통과했다.

수동 진단 재현 경로: `./tools/node tests/mac-collector/fixtures/cookie-interception-diagnosis.mjs`. 두 조건 각8회로 제한하며 성공할 때까지 반복하는 도구가 아니다. 스케줄에 따라 조기 해제 조건의 실패 횟수는 달라질 수 있다. 새로운 합성 프로필만 사용하고 쿠키 원문/실제 계정/개인 Chrome에 접근하거나 출력하지 않는다.

## 영속 수락 실질 리뷰와 수정

HTTP 사전 인증 후 transaction 재검사에서 정책 비활성화를 처음 관측하면, readiness 거부 예외로 무효화 UPDATE까지 롤백됐다. 같은 정책을 다시 활성화한 뒤 재시작하면 이전 decision이 `current=true`로 되살아났다. 순서를 고정한 새 합성 DB 회귀가 수정 전에 실패함을 확인했다.

명령 전체는 기존대로 rollback하되, 인증된 요청이 관측한 기존 epoch의 무효화만 rollback 후 별도 transaction으로 다시 기록한다. `invalidated=0`·동일 epoch 조건으로 한 번만 증가시키고 시각도 역행시키지 않는다. 실패한 증거/결과/command를 재저장하지 않는다. HTTP 내부 재검사와 직접 service preview 거부, 재활성화·재시작 후 stale 유지 회귀2개를 추가했다. 외부 정책의 관측되지 않은 비활성/재활성 이력 감시 기능은 아니다.

다음 경계를 실제 코드와 회귀에 대조했다.

- HTTP body 전 본인 세션·CSRF·소유권과 transaction 내 재인증. 다른 학생404·operator403, clock 역행/로그아웃 거부.
- browser는 고정 공개 fixture ID만 제출. Binding·sourceAccount/course·정책·증거 revision·최초 시험은 서버 구성. C2/실증명·AI 결과 자동 승격 없음.
- evidence/head/command 및 decision/snapshot/latest/command의 원자 저장·실패 rollback. CAS 한 승자, 동일키·GET/재시작 동일 target, 불변 저장과 별도 historicalResult.
- 최초 시험 교체 거부·같은 시험의 명시 정정, 선택 표시 hash·명시 최종화·기한/facts/selection revision, 보완/정책/ACK 변경의 stale.
- 두 host profile의 설정 지문·새 전용 DB·검증 HTTPS, 기존 M1/M2 소비. YBM/시원스쿨 OR·UNKNOWN·200/300 계산 후보·400 PRECHECK_ONLY·500 제외.
- 모든 응답의 실제 자격/지급/claim 권한 false, grant/outbox HOLD·independentClaim NO_GO. web/PR60·독립 청구 소유 파일·기존 개인 DB/키/체인은 범위 밖.

관련363/363(C3 HTTP21+TLS3 포함), Mac62/62, 기존 dev33/33은 이전 구현에서 통과했고 이번 변경이 dev host를 수정하지 않아 중복 실행하지 않았다. 이번 원격 CI는 기존 dev도 다시 검사한다. 원본/legacy191개·의존성 graph 보존·공개 이력 검사는 최종 커밋에서 별도로 확인한다. 자체 실질 리뷰이며 독립된 다른 사람의 승인을 주장하지 않는다.

## 최종 가용 상태

[PR67](https://github.com/gw020328-oss/clear-education-v4/pull/67)의 최신 head Checks·최종 리뷰·merge commit을 정본으로 삼는다. 모든 최종 검사와 보호/대화 조건 충족 후에만 정상 develop merge한다. 병합 SHA는 PR67 본문과 이슈65/55의 완료 기록에 기록한다. 이 문서의 커밋이 자기 자신을 포함하는 미래 merge SHA를 미리 주장하지 않는다.

단일 인계는 [MVP_SOURCE_HTTP_HANDOFF](MVP_SOURCE_HTTP_HANDOFF.ko.md), DTO/제약은 [C3 계약](MVP_EVIDENCE_HTTP_CONTRACT.ko.md), 화면 담당 지침은 [프론트 연결 프롬프트](MVP_FRONTEND_CONNECTION_PROMPT.ko.md)다. 실제 원천·동일인·실동의·개인자료 수명/마이그레이션·운영 Evidence·재원/지급·프론트 연결/사용성은 미완료다. 이 범위를 후속 자동 착수하지 않는다.
