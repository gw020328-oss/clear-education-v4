2026-10-25 v26: r19 ALLOCATE/PLAN의 `BC_VIEW_STALE`은 읽기 작업의 최종 동일 초 검사로 좁혀졌고, 실제 wall-clock·240초 합성 원천·현재 native 경로에서 REGISTER 뒤 같은 실패를 재현했다. PLAN만 상태/권한/원장/입력 불변인 순방향 초 경계에 한해 최대 1회 새로 읽는다. 쓰기·서명·송신·AI 재시도와 TTL 연장은 없다. 제어시계 전체 경로의 두 합성 동의→100 TEST·중복 거부와 별도로, 전체 wall-clock 시도는 ACCEPT 송신 직전 `BC_E5_CLOCK_CHANGED`로 중단했다. **실제 전체 지급 안정성을 확인한 상태가 아니므로 본부가 이 잔여 경계를 검토한 뒤 새 실제 시험 여부를 판단한다.** 원 r19 tick별 값은 보존되지 않아 과거 순간의 비교값까지 확정하지 않는다. [원인·검증·한계](BOOTCAMP_V26_VERIFICATION.json), [새 인수 지문](../../specs/bootcamp/hackathon-test-memory-source-intake-v26.json). r19 및 기존 328개 보존 기록은 재사용하지 않는다. PR102 Draft·예치 정책 미확정·merge 금지 유지.

# 실제 한 건 실행 전 본부 일괄 준비표

2026-10-25 v25: r18의 빈 executionDiagnostics는 기존 기록이 세 controller callback에만 연결된 진단 공백으로 확인했다. API transaction·native 오류 정규화 전·정상 지급 단계의 최초 고정 오류/위치/시간/송신 상태를 제한적으로 보존한다. 새 격리 체인에서 두 합성 인증 동의부터 100 TEST 지급·중복 거부까지, 봉인 전후/송신 후 오류·응답 분실·권한 만료를 재현했다. 이는 실제 r15/r17/r18의 공통 원인 확정이 아니다. 기존 v24 재확인·만료·서명·지급 정책은 유지한다. [원인·검증과 실제 경로와의 차이](BOOTCAMP_V25_VERIFICATION.json)를 우선한다. 최종 HEAD CI 확인 후 멈추며 새 실제 호스트·CA·로그인·증명·유료 AI·지급을 시작하지 않는다.

2026-10-25 v24: BIND 전송 후 복구 권한 조회의 동기 초 경계 실패를 합성 store/현재 bridge로 red→green 재현했다. exact `BC_E5_CLOCK_CHANGED`와 이미 만든 미반환 증명서에 한해 RECOVER/RECOVER_FINAL_SYNC 권한 검사만 1회 재확인하며 같은 증명서·payload·binding·만료를 유지한다. 추가 issuer/서명·거래·전송은 없다. r15의 당시 내부 예외는 미보존이므로 동일 원인 확정과 구분한다. [짧은 원인·검증 기록](BOOTCAMP_V24_VERIFICATION.json)을 우선하며 이번 수정에는 실제 재시험이 없다.

2026-10-24 v23: 원래 240초를 승인 준비·검토 최대95초/모델·E3 30초/첫 조회5초/양측 검토80초/정산30초로 배분한다. 원래 만료와 exact 승인·직접 양측 동의는 유지하며 지연 시 중단한다. AI·동의 버튼 옆에 비활성 이유와 가능한 조작을 표시하고, 조회 실패 시 이전 승인 대기 자료를 지운다. [짧은 변경·검증 기록](BOOTCAMP_V23_VERIFICATION.json)을 우선한다. 이번 수정에는 실제 재시험이 없다. 아래 v22·r14는 과거 관측이다.

2026-10-24 현행 v22: r13은 AI 승인 전달·기록까지의 왕복이 원천 유효창을 대부분 사용해 두 화면의 실제 동의 전에 만료됐다. [시간 분석과 새 순서](BOOTCAMP_R13_REVIEW_WINDOW_REVIEW.ko.md), [v22 오프라인 검증](BOOTCAMP_V22_VERIFICATION.json)을 우선한다. 정적 준비·사전 비용 승인 지갑 지정·두 화면 준비 후 HR→성찰 exact 승인·AI→활동→과제→E3→각 사용자 동의 순서다. 원래 만료를 유지하며 짧은 검토창은 중단한다. 실제 비용 승인 지갑은 아직 지정하지 않았고, 별도 재시험 지시 전에는 새 실제 호스트·CA·로그인·증명·AI·지급을 시작하지 않는다. 아래 v21과 과거 내용은 이력이다. 로컬 고유 검사 622개와 증거 183개 보존을 확인했다. 최종 HEAD의 CI 결과는 PR102와 `var/bootcamp-verification/v22-final-ci.json`에서 별도로 확인한다.

2026-10-24 현행 v21: r11은 원천 네 조건·승인 AI 1회·REGISTER/ALLOCATE/START_REVIEW를 통과한 뒤 동의 대기 조회의 `BC_VIEW_STALE`로 종료됐다. 정상 초 경계에서 같은 오류를 오프라인으로 재현하고, 실패한 동기 조회만 버린 뒤 최대 한 번 새 조회를 수행하도록 수정했다. 최초 수집 대상·고정 검토 대상·원천 만료·양측 실제 동의·100 TEST·지급 경계는 유지한다. [r11 원인과 남은 불확실성](BOOTCAMP_R11_CONSENT_READ_REVIEW.ko.md), [v21 검증](BOOTCAMP_V21_VERIFICATION.json)을 우선한다. 로컬 관련 검사 565개와 보존 대상 143개가 통과했다. 최종 HEAD CI를 확인한 뒤 별도 재시험 지시를 기다리며, 이번 작업에는 새 호스트·CA·로그인·증명·AI·서명·지급이 없다. 다음 실제 시험에는 새 신청, 새 exact AI 승인, 같은 최신 판정에 대한 실제 양측 동의가 필요하다. r10/r11의 소비된 승인·journal·전역 소비 기록은 재사용하거나 초기화하지 않는다.

2026-10-24 이전 v20: 관리형 시험마다 새 run/application/input/approval에 결합한 AI 단회 기록을 연결했다. 같은 실행·신청·승인 증거의 재사용 및 취소·응답 불명 뒤 다른 journal로 재시도하는 경우를 차단하며, r10의 이미 소비한 승인과 journal을 보존한다. [단회 기록 검토](BOOTCAMP_MANAGED_AI_RUN_REVIEW.ko.md), [v20 검증](BOOTCAMP_V20_VERIFICATION.json)을 우선한다. 최종 HEAD CI 통과 후 다음 미사용 호스트의 prepare-only HTTPS/CA까지만 준비한다. 실제 로그인·원천 수집·증명·AI·서명·지급은 시작하지 않는다. 실제 실행 시 준비된 exact 입력에 대한 새 직접 사용자 AI 승인과 기존 양측 지급 동의가 필요하다.

2026-10-24 이전 v19: r10은 HR 공식 검증·원천 네 조건·승인 AI 1회까지 성공한 뒤 최초 E3 등록의 초 경계 정합성 검사로 중단됐다. 로그인 없이 원래 실패를 재현하고 같은 대상/CAS/멱등키를 유지한 내부 등록 1회 재검증과 최신 읽기/판정 인계를 보정했다. [r10 원인·권한 검토](BOOTCAMP_R10_CURRENT_VIEW_REVIEW.ko.md), [v19 검증](BOOTCAMP_V19_VERIFICATION.json)을 우선한다. v18 증명 실행 지문·기존 원천 만료·양측 동의·100 TEST·지급 경계와 r5~r10/소비된 AI journal은 보존한다. 최종 HEAD CI 확인 뒤 새 정상 재시험 지시를 기다린다. 이번 단계에는 실제 호스트·CA·로그인·증명·AI·지급을 시작하지 않는다. 다음 실제 시험에는 새 exact AI 승인과 양측 지급 동의가 필요하다.

2026-10-24 이전 v18: r9의 `ZK_PROOF` 단서로 공식 STWO 5.1.6/5.1.7의 상호 불호환을 합성 재현했다. 공식 보안 수정을 포함한 crypto5.1.7을 두 prefix에 exact 고정하고 SDK5.1.4/TLS0.1.4/STWO와 기존 검증·전송·개인정보·지급 경계를 유지한다. [r9 호환성 조사](BOOTCAMP_R9_ZK_COMPATIBILITY_REVIEW.ko.md)와 [실행 지문](BOOTCAMP_ZK_EXECUTION_FINGERPRINTS_V1.json)을 우선한다. r9 원격 배포 버전과 실제 원인은 미확정이다. 최종 HEAD CI 확인 후 본부의 단회 재시험 지시를 기다리며 지금 새 호스트·CA·로그인·증명·AI·지급을 시작하지 않는다.

2026-10-24 이전 v17: r8는 송신/RPC 완료 뒤 ERROR_INVALID_CLAIM 반환과 COLLECTOR_SIGNED_CLAIM 거부로 종료됐다. 세부 서버 검증 원인은 미확정이다. [r8 조사](BOOTCAMP_R8_INVALID_CLAIM_REVIEW.ko.md)와 [v17 검증](BOOTCAMP_V17_VERIFICATION.json)을 우선한다. 원문을 보관하지 않는 고정 hint/presence 진단을 추가하고 이전 실패·지문을 보존한다. 최종 HEAD CI 완료 후 본부 재시험 지시를 기다리며 새 실제 실행·호스트·CA·로그인·READY·AI·지급은 시작하지 않는다.

2026-10-24 현행: r7의 최초 원인은 로컬 combined32MiB 송신 제한 초과이며 frame/queue 개별 크기는 미확정이다. [r7 전송 검토](BOOTCAMP_R7_TRANSPORT_REVIEW.ko.md)와 [v16 검증](BOOTCAMP_V16_VERIFICATION.json)을 우선한다. 단일 메시지100MiB·active+waiting132MiB·FIFO1개 및 기존보다 길어지지 않는 RPC deadline을 적용했다. 새 실제 실행·호스트·CA·로그인·READY·AI·지급을 시작하지 않고, 최종 HEAD CI까지 완료 후 본부 재시험 지시를 기다린다. r5/r6/r7 기록은 보존한다.

2026-10-23 이전: r6는 계정 SDK await reject로 실패 종료했고 원래 내부 오류는 미확정이다. [r6 조사](BOOTCAMP_R6_FAILURE_REVIEW.ko.md)와 [v15 검증](BOOTCAMP_V15_VERIFICATION.json)이 최신이다. 확인된 전송 오류 분류/타이머 결함을 오프라인으로 수정했으며 새 실제 실행 준비는 하지 않는다. 기존 r6/r5와 아래 과거 준비 기록을 보존한다. 현재 사용자 로그인/CA/지갑 행동은 필요 없다.

2026-10-23 이전: r5 후속 SDK 진단 v14의 [검증 기록](BOOTCAMP_V14_VERIFICATION.json)과 아래 마지막 절이 최신이다. 앞선 r4/r5 준비 문구는 과거 기록이다. 이번 작업에서 r6 환경·CA·브라우저·READY·실제 수집·서명·AI·지급을 시작하지 않는다.

2026-10-23 최신: r2의 원천 서명 전 실패를 재현·수정한 후보는 [v11 실행 기준 기록](BOOTCAMP_V11_VERIFICATION.json)과 [시험 자산 v3](BOOTCAMP_TEST_CLIENT_ASSETS_V3.json)를 따른다. 아래 v10 불변/완료 설명은 과거 후보 기록이다. 실제 재시험은 새 미사용 호스트·새 CA 준비 후 사용자에게 안내하며 r2 실패 기록을 보존한다.

2026-10-22. 이번 기록은 준비 확인과 사용자 행동의 취합이며 실제 실행 허가/완료가 아니다. 새 로그인·registry·source·AI·신청/realm·실제 거래는 시작하지 않았다. 각 담당은 본부 한 곳에서 아래 준비를 끝낸 뒤 한 번에 안내한다. 과거 run3 성공을 반복하지 않고 만료된 `.1` 신청/DB/키/realm도 시간을 고쳐 재사용하지 않는다.

| 구간 | 준비/담당 확인 | 사용자 행동 또는 남은 확인 |
| --- | --- | --- |
| 통합 source | HR e658 worker `.3`/genuine lease 및 API 외부 지갑/원래 세션/명시 동의 인수. v7 final3e2의 CI18/18 SUCCESS. 이번 최소 C3 변경의 새 정확 pin/CI는 별도 확인 | 소스 후보·intake·host 코드가 같은 세대인지 최종 확인. 프론트 소유자가 [C3 계약](BOOTCAMP_C3_FRONTEND.ko.md)을 실제 화면에 연결해야 함 |
| 역할/HTTPS | 참여자·운영자 공개 주소 두 개, 서로 다른 브라우저 프로필/쿠키, 출처·TLS·새 chainId/RPC 준비. 서버 참여자 키 fallback 없음 | 본인 두 공개 주소와 역할을 확정하고 각 지갑으로 로그인. 비밀키/쿠키를 채팅에 보내지 않음. 이 입력은 아직 확정 확인하지 않음 |
| HR host | 로그인 전 `loadManagedHackerRankTrust({audience,privacyKeyId})`로 독립 registry signer/epoch와 worker recipe를 고정. commitmentKey의 worker 수명·정리, 단일 `.3` 모듈 트리 | 현재 호출0. audience/privacyKeyId와 안전한 key 주입은 실행 host 준비 항목. 실제 key 값은 보고/로그에 복사하지 않음 |
| HR 계정·인증서 | 동일 managed source callback 안에서 pins→새 mapping/runtime→같은 app/request→lease 수락/소비. source 창900초, 전체 기존 cap 유지 | 새 관리형 Chrome에서 본인 HackerRank 로그인→준비완료1회→참여자 원래 UI 세션 지갑으로 정확 P1 메시지 서명. `.3` 실제 hosted 형식/context 성공은 첫 실행에서 확인해야 함. 복수 Python Basic row면 certificate 선택을 새 mapping/request와 함께 먼저 고정 |
| Moodle | 소유364871e 및 API 핵심6파일 일치. withReader만 직접 주입, fixture query/collect 금지. 생성 demo user3/course2/cm3·4·5/forum3/post1, e6-20261018-run1/18768 | 추가 Moodle 로그인/학습 행동은 기존 관측상 필요 없었으나 현재 원문/상태를 이번에 재조회하지 않았음. 실제 MET/본문 불변으로 기록하지 않음 |
| AI | 소유eaba9c0 및 API 모듈 트리 동일 private brand. gemini-3.5-flash-lite/MINIMAL/maxOutput1024, count/retry/continuation/fallback0. 본문≤2048/전체≤8192 UTF-8. 기존 승인 잔여0 | 준비된 생성 demo 원문을 기존 Gemini에 보낼 범위를 미리 안내. 실행 당일 공식 가격 검토와 server key 가용성·안전 주입 확인 후, 준비된 현재 exact packet/code/day에 generateContent 최대1 새 승인. 키 가용성은 아직 확인하지 않음 |
| 짧은 원천/AI 수명 | Moodle source 최대240초, 더 짧은 auth/raw/query/request cap 유지. 준비 네트워크30초→원래 만료 내 사람 승인→같은 packet/request 단회 재개·모델/collect 각30초 | 즉시 승인·재개할 수 있을 때만 source 창을 연다. 만료 시 승인/시각을 새로 결합하거나 옛 결과를 수락하지 않음 |
| 양측 동의·지급 | 같은 current AND 판정/100 TEST 전액 할당/공개·검토 후 역할별 실제 동의 두 건, 기존 TEST120/1/600 및 이의·서명·nonce·원천 cap 유지 | 두 역할은 같은 대상인지 각자 확인하고 최신 화면에서 AGREE. 호스트가 기존 accept/별도 claim을 한 번 수행. 재실행/자동 동의 없음 |
| 수령 인수 | 같은 app/정책/mapping·고정 수령인/token·claim tx의 canonical receipt/Transfer와 실행 당시 잔액 증가100 TEST 확인, 기존 duplicate 거부 기록 별도 보존 | [C3 receipt](BOOTCAMP_C3_FRONTEND.ko.md)의 INCLUDED와 finality 구분. 미측정/불명확은 null. 실제 결과와 두 역할 화면을 본부에 한 번 인수 |

권장 순서는 모든 설정/두 지갑·프론트/비용 안내 준비→HR 독립 신뢰 고정/관리형 로그인·ready→같은 owner pins로 마지막 시점 새 `.2` realm/HTTPS 준비→두 역할 로그인/참여자 신청 1회 결합→정확 HR P1 서명·수집→Moodle와 회고 packet 준비→새 exact AI 단1회 승인·동일 packet 재개→같은 현재 판정/전액·검토→양측 명시 동의→기존 accept/claim→정확 receipt/수령 인수다. 순서 중 새 사용자 행동이 필요한 시점은 본부가 일괄 설명하고, 준비되지 않은 단계에서 먼저 로그인을 요구하지 않는다.

현재 실제 실행 readiness는 미완료다. 공개 주소·역할별 브라우저/프론트 연결, host의 audience/privacyKeyId/안전 key source, 실행 당일 AI 가격/새 승인, 첫 실제 HR 형식/proof 성공은 미확인이다. 이 문서가 이를 성공으로 바꾸지 않는다. Moodle/AI 담당은 이번에 정적 읽기만 했고 compose 재기동·추가 진단·원문·token·key·model 호출0이었다.

후속 정적 점검의 canonical5초 snapshot 갱신 누락은 [C3 refresh](BOOTCAMP_C3_REFRESH.ko.md)의 소유 async read/HTTP 앞 refresh로 보완했다. TTL이나 원천/검토 cap은 늘리지 않았다. actual host는 API 통합 작업본의 managed-source/prepared-source/collector/openLiveContext/AI entry를 같은 모듈 트리에서 import한다. 코드 bytes가 같아도 다른 HR 작업본에서 만든 private lease나 다른 AI 모듈의 branded 결과를 전달하지 않는다. 별도 원천 담당의 withReader 포트와 private brand의 발급/소비 모듈 트리를 구분한다. 이 연결 검증도 실제 HR/AI 실행 성공을 대신하지 않는다.

## 2026-10-22 실제 호스트 준비 후속

이전 표의 host/key/registry 미준비 항목은 [실제 호스트 준비 문서](BOOTCAMP_NORMAL_HOST.ko.md)의 최신 관측으로 갱신한다. `normal-host.mjs prepare/check/serve-prepared/run --activate`를 추가했고, 실제 lockf 경계 registry1회(3 signers)·로컬 Docker/Geth/Moodle·기존 Gemini env 존재·CA 검증 HTTPS를 확인했다. 새 실제 소스/브라우저/앱/realm/유료 호출은0이다. 준비 HTTPS는 점검 후 닫았다. public origin은 `https://127.0.0.1:9445`이며 chain/RPC/app는 아직 null이다.

이제 남은 실행 의존성은 담당자의 최신 프론트 구현·정적 web 경로와 계약 수락, 두 역할 공개 주소/브라우저·CA trust 준비다. 당일 가격 재확인과 exact packet별 새 직접 AI 승인도 실제 실행 시 필요하다. 최신 managed HR `.3` 실제 증명 성공은 미확인이다. 비밀번호 설정·이전 로그인 완료는 사용자 확인 사실로 보존한다. 본부가 나머지 준비 후 한 번에 사용자에게 안내하며 지금 로그인 재시도나 source lease를 시작하지 않는다.

프론트 전달은 [Claude Code 복사 지침](BOOTCAMP_FRONTEND_CLAUDE_PROMPT.ko.md)과 GitHub Issue #106 최신 인계 댓글을 따른다. v10은 기존 source135개 중4개 delta 및 실제 host/전이 의존성24개 추가, 총159개를 정확히 기록한다. v9/135개와 이전 snapshot·guard bytes는 보존한다. 인수 범위는 실제 시연 수락이나 메모리 EVM boundary 확대가 아니다.

## 2026-10-23 제품 프론트와 독립된 backend 선시험 준비

사용자 후속 요청으로 `tools/bootcamp/test-client/`의 정적5개 자산을 구현·검사하고 기존 web-root/digest acceptance로 수락했다. [실행 안내](BOOTCAMP_BACKEND_TEST_CLIENT.ko.md)·[정확 자산 지문](BOOTCAMP_TEST_CLIENT_ASSETS_V2.json)·[확인 기록](BOOTCAMP_BACKEND_TEST_CLIENT_VERIFICATION.json)을 따른다. 제품 web/·PR60·API 계약·v10 core159개를 바꾸지 않았고 제품 프론트 완료를 뜻하지 않는다. 이제 backend 선시험의 독립 준비는 제품 프론트 구현을 기다리지 않는다. 공개 두 주소/두 프로필/사용자 CA trust·실제 실행 시 network 설정과 로그인·exact AI 새 승인은 본부가 준비 완료 뒤 한 번에 안내한다. 지금 새 관리Chrome/신청/lease/realm/유료호출은 시작하지 않았다.

## 2026-10-23 원천 진단 v12

[단계별 진단 명세](BOOTCAMP_SOURCE_DIAGNOSTICS.ko.md)와 [검증 기록](BOOTCAMP_V12_VERIFICATION.json)을 따른다. 기존 원천 159개 중 7개에 수동적 관측을 연결하고 진단 모듈 1개를 더한 정확한 160개 지문을 v12로 고정했다. 이전 v11 intake/guard는 보존했다. 브라우저/API 바이트는 V3와 같으며 [V4 자산 기록](BOOTCAMP_TEST_CLIENT_ASSETS_V4.json)은 v12 실행 지문만 연결한다. r3 원인은 미확정이고 새 실제 수집·로그인·AI·서명·지급은 미실행이다. 이 기록은 새 시험 실행 승인이 아니다.

## 2026-10-23 r4 이후 조회 충돌 수정과 v13

[좁은 보안 검토](BOOTCAMP_SIGNATURE_WAIT_REVIEW.ko.md)와 [오프라인 검증 기록](BOOTCAMP_V13_VERIFICATION.json)을 따른다. 실제 auth/store/UI에서 초 경계 `BC_VIEW_STALE`이 정상 서명 대기를 취소하는 결함을 red→green으로 확인했다. 현재 pending의 정확한 store 조회 충돌만 보류하며 호출자에게 예외는 그대로 반환한다. 실제 제출은 성공한 최신 조회와 권한·바인딩·기한·서명을 다시 검사한다. 기존 250ms 검사와 최대 300초, store 전역 검사 및 원천/AI/지급 정책은 유지한다.

v13은 브로커·진단 모듈·테스트 fixture의 정확한 세 변경을 160개 소스 지문에 반영한다. [V5 자산 기록](BOOTCAMP_TEST_CLIENT_ASSETS_V5.json)은 v13을 연결하며 브라우저 5개 자산과 normal client 바이트는 V4와 같다. v12 intake/guard/V4 manifest 및 r3/r4 실제 기록은 보존한다. 로그인 없는 회귀·보존 검사 323개가 통과했으며, 최종 커밋의 CI는 푸시 후 별도로 확인한다.

r4의 실제 최초 내부 오류는 미확정이다. 새 r5는 최종 CI 통과 뒤 별도 미사용 환경으로 준비하며, 실제 실행은 이후 사용자 준비 확인이 필요하다. 기존 prepare 도구는 환경별 CA를 생성하고 재사용 옵션이 없다. 이번 권한 수정에 별도 인증서 공유 기능을 추가하지 않으며, 현행 도구로 준비할 경우 새 CA의 수동 신뢰가 필요하다. 준비 시 브라우저·로그인·READY·신청·체인·서명·증명·AI 호출·지급은 실행하지 않는다.

## 2026-10-23 r5 이후 SDK 진단 v14: 로그인 없는 준비

r5는 서버 원천 서명 수락과 계정 응답 검사 완료를 관측한 후 `ACCOUNT_PROOF_RETURN / UNKNOWN_ERROR`로 실패했다. SDK 세부 원인과 단계 시간은 당시 기록에 없으며 소급 확정할 수 없다. r5는 사용된 실패 실행이며 재사용하지 않는다. 이번 변경은 두 고정 SDK 타입의 오류, resolved error, 반환 형태와 반환 후 검사를 구분하고 단조 상대 시간·abort·제한된 onStep 관측을 추가한다. [다음 단회 시험 관측표](BOOTCAMP_SOURCE_DIAGNOSTICS.ko.md#r5-후속-v2-sdk-경계와-상대-시간)와 [좁은 검토](BOOTCAMP_SDK_DIAGNOSTICS_REVIEW.ko.md)를 따른다.

[소스 v14](../../specs/bootcamp/hackathon-test-memory-source-intake-v14.json)는 160개 중 diagnostics/worker-source 두 runtime 바이트 변경만 허용한다. [V6 자산 기록](BOOTCAMP_TEST_CLIENT_ASSETS_V6.json)은 동일한 브라우저 5개와 normal client 바이트를 유지하고 새 실행 지문을 연결한다. 이전 intake/helper/guard/manifest 37개와 r5 사용 표시·진단·보고서·두 DB의 지문은 보존했다. 관측기 스키마 선언과 회귀 검사도 함께 갱신했다.

로그인 없는 로컬 검사는 HR 211개, API/실행 417개, pin/세대 보존·메모리 진입 차단 46개로 서로 겹치지 않는 674개 통과다. 정확 소스·원본/워크스페이스·의존성 및 선언 문법 검사도 통과했다. 최종 HEAD의 GitHub CI 확인은 커밋·푸시 후 PR102에 같은 HEAD 기준으로 남긴다. 기존 CI나 source candidate의 검사 결과를 최종 HEAD 성공으로 대체하지 않는다.

r6 환경/CA는 만들지 않았다. 실제 재시험 여부는 위 관측표·한계·최종 CI 결과를 보고 사용자에게 별도 확인받는다. 새 시도에서 SDK 내부 plain Error는 UNKNOWN일 수 있으며 ZK 시작·RPC 송신·증명 성공을 콜백으로 추정하지 않는다. 준비 범위는 코드와 읽기 전용 상태 확인이다. 기존 요청 만료·총 시도 1회·민감자료 정리·실패 후 AI/지급 0 경계를 유지한다.
