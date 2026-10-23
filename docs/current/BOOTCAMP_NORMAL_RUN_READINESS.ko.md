# 실제 한 건 실행 전 본부 일괄 준비표

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
