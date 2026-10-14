# H2 등록 이력 접수와 완전성 경계

2026-10-14 승인 후속. 기준 develop `4fc4a82`, H1(PR #31) 병합, 연구 의존 PR #32 `534bf56` 미병합. 담당은 공통 증명/백엔드이며 web·Moodle·자금/계약 담당 경로를 수정하지 않는다.

## 변경과 완료 기준

1. H2a 원천 경계: 요청·필터·정렬·페이지/더 보기·빈 목록·기간의 관찰과 인증된 전체성을 분리한다. 공개 원천/고정 SDK/합성 공격 검토를 기록하고 달력 2년/730일 차이를 시험한다. 실제 전체성은 UNKNOWN이다.
2. H2b 접수 코어: H1과 같은 BASELINE_HISTORY/ACHIEVEMENT 목적을 별도 등록 ledger에서 사용한다. 신뢰한 로컬 등록 서비스가 정책/동의/시각을 고정한다. baselineRequired일 때만 baseline 세션을 연다. 정책/신청/목적/기간/owner/nonce/만료/개인정보 보존기한을 proof context digest에 결합한다. SQLite 단회 수락·중복 응답 복구·재시작·취소·만료 삭제를 합성 검증한다.
3. H2c 실제 수집 연결: PR #32의 표 수집·공식 서명·독립 프로세스 경계를 검토하여 새 등록 context를 수집기에 전달한다. 서버가 직접 독립 검증한 결과만 접수하고 전달된 검증 플래그는 받지 않는다. 기존 진단 proof는 새 등록에 가져오지 못한다. 새 실제 실행은 사용자가 전용 Chrome에서 로그인한 뒤 수행한다.

각 단위는 별도 커밋/PR로 검토한다. 모든 PR은 develop 대상 Draft이며 이 승인에 병합은 포함되지 않는다. 선행 PR #32는 타 작업본에서 수정하지 않는다. 의존 이력을 통합하는 경우 해당 feature 브랜치에서만 수행하고 PR 설명에 의존 diff와 새 변경을 구분한다.

## 실제 증거와 현재 미확인

PR #32의 저장된 실제 결과는 한 계정의 TOEIC 3행 표 공증·독립 검증·서명 이후 변조 거부다. 이번 후속에서 재실행한 결과가 아니다. `wholeHistoryTableClaim/proofVerified`와 `fullHistoryProven/sourceCoverageConfirmed`는 별개다. 후자는 false를 유지한다. 합성 20행·빈 표·부분 가림 시험은 실제 다건·미응시 계정의 증거가 아니다.

고정 요청은 `GET https://exam.toeic.co.kr/result/scoreList.php`, 공개 User-Agent/Accept-Encoding, query/body 없음이다. 쿠키가 서버의 사용자/숨은 필터 상태에 미치는 의미는 미확인이다. 표 밖 필터·총건수·스크립트·페이지 표시가 가려지므로 표 서명만으로 이들을 인증하지 못한다. 페이지 표시가 없다는 브라우저 관찰은 서버 총량 보증이 아니다. 여러 표/다음 페이지/외부 script/정렬/필터가 있으면 관찰하고 UNKNOWN을 유지한다. 클라이언트가 주장하는 totalCount/hash를 신뢰 근거로 승격하지 않는다.

빈 계정 실제 응답·다건 계정 및 숨은/추가 페이지·서버 필터 상태·생성 중 악성 누락의 실제 Attestor 시험은 미실행이다. 단일 표의 행 가림/선택 recipe 변경과 서명 뒤 변조의 합성 거부를 따로 기록한다. 파싱하지 못하는 빈/로그인/새 형식은 미응시 결과로 수락하지 않는다.

[YBM FAQ](https://exam.toeic.co.kr/customer/csMain.php)(2026-10-14 재확인)는 2년이 지난 성적의 조회/재발급 불가를 안내한다. [시원스쿨 안내](https://customer.siwonschool.com/common/notice/901)의 수강 신청일 기준 보유 이력 요구는 [기존 근거](EXAM_HISTORY_REQUIREMENTS.ko.md)를 따른다. 실제 등록 사건(결제/동의/승인), 타임존/끝점, 윤일 처리는 OPEN이다. KST 달력 2년 후보는 730일과 윤년에서 다르며 2월29일→2월28일 clamp는 합성 후보다. 조회가 등록보다 늦으면 원천 보존 창의 앞부분이 사라질 수 있으므로 등록 기간을 조회일에 맞춰 옮기지 않는다.

## 모듈 계약과 보존

H1 `clear-exam-lifecycle.1`은 SYNTHETIC 그대로 유지한다. H2는 별도 로컬 접수 모듈이며 기존 ENROLLED/금고 선예치 HTTP·DB를 재사용/변경하지 않는다. 새 HTTP/웹 등록 기능 전체가 완료됐다고 표시하지 않는다. 외부 request에 local trusted service API를 그대로 노출하지 않는다.

등록은 고정 정책과 내부 가명 binding, 정책별 baselineRequired, 검토용 고정 기간, 동의/삭제 기한을 가진다. 실제 공식 기간은 OPEN이므로 접수 용도에만 사용한다. collector는 개인키/쿠키를 자기 managed session에서만 가지며 offline verifier는 최소 claim과 서버 기대 context/trust만 받는다. claim 원문/성적/수험번호/HTML·계정 이름은 ledger와 로그에 저장하지 않는다.

수락 결과는 RECEIVED_UNVERIFIED_COVERAGE/UNKNOWN과 수집·수락 시각, 신뢰 profile, context digest, 비공개 keyed replay commitment만 남긴다. 단순 원문 hash를 공개하지 않는다. 같은 세션/같은 증거는 같은 receipt, 다른 증거는 충돌이다. 새 revision이 늦은 과거 세션을 대체한다. 현재 receipt는 재시작 후 복구하지만 과거의 짧은 취득 TTL을 장기 조회에 재적용하지 않는다. nonce 소비와 receipt/replay 기록은 같은 transaction이다. 삭제된 등록은 tombstone으로 재개를 차단하며 삭제로 새 자격 판정을 열지 않는다.

최소 ledger는 0700 디렉터리/0600 DB, 로컬 소유자 전용으로 격리한다. 기존 Mac managed raw-profile 정책(종료 즉시 정리, 실행 중 상한, 강제종료 후 다음 시작 정리)을 유지한다. 등록 ledger 보존기한은 고정 정책/동의 입력이며 자동 연장하지 않는다. 디스크 흔적 완전 삭제·백업 삭제·앱 미실행 중 정시 삭제 보장은 아니다. 삭제 뒤 replay tombstone 수명과 다중 호스트/공유 DB/원격 인증/키 교체는 별도 제품 관문이다.

## 상태와 금지 유지

접수 성공은 `proofVerified`와 `wholeHistoryTableClaim`만 표시할 수 있다. 미검증 범위는 `fullHistoryProven=false`, `sourceCoverageConfirmed=false`, `accountIdentityBound=false`, `productEligible=false`, `paymentAllowed=false`다. baseline의 없음/미달·목표 달성/최초 시험 고정 판단은 수행하지 않는다. ACHIEVEMENT는 별도 목적·기간의 수집 접수이며 최종 단일 시험 선택/발표일/실명 결합은 후속이다.

실제 Moodle/원천 자격 검증 BLOCKED, grant/outbox HOLD, 독립 청구 제품 NO-GO와 400% 사전검토만/자동 자격·지급 금지를 유지한다. PR #32 Mac 복구 CI 최초 실패 원인은 미확정이며 후속 진단·시험·CI 통과를 원인 해결로 해석하지 않는다.

## H2b 구현 결과와 소비자 영향

`src/exam-evidence/intake.mjs`의 `openHistoryIntake`는 별도 `history-intake.sqlite`를 사용한다. 시작 시 instanceId/mode/verifierProfile/verifierConfigDigest를 pin하고 바뀐 설정·불완전 schema를 거부한다. `register`는 내부 가명 binding과 확정한 접수 정책을 받아 clock 시각을 한 번 고정한다. 같은 입력 재호출은 같은 등록, 다른 입력은 충돌이다. `openSession`은 목적별 현재 revision·nonce·owner·기간·기한을 생성하며 `accept(sessionId, proof)`가 독립 검증 콜백을 직접 실행한다. 브라우저가 verifier result를 전달하는 API는 없다. 검증 콜백은 서버 구성 권한이며 외부 입력으로 주입하지 않는다.

`registration/session/receipt`는 소유한 로컬 서비스만 조회하며 `cancel/purge/close`가 정리 경계다. 수락 전후 현재 revision/취소/만료를 transaction 안에서 재검사한다. 응답 유실 재접수는 같은 proof commitment일 때만 기존 결과를 반환한다. `register/openSession`은 실제 웹 동의 서명/인증 구현을 대신하지 않는다. 명시한 로컬 동의 사건을 학원의 공식 수강 신청 사건으로 주장하지 않는다.

등록/세션/receipt의 private HMAC pin은 저장 손상 검출이며 호스트 관리자·DB와 키를 함께 장악한 공격자에 대한 발행자 서명이 아니다. nonce 소비·receipt·replay는 원자적이다. 키는 같은 전용 0600 DB에 있고 새 키로 과거 중복 범위를 초기화하는 API가 없다. 삭제 후에는 비공개 claim commitment와 등록 tombstone만 인스턴스 폐기까지 보존한다. 호스트/백업 전체 삭제·다중 호스트 복제는 별도다.

H2b 검증: 합성 18개에 별도 프로세스 동시 접수, transaction 도중 SIGKILL 후 rollback/재접수, 응답 유실/재시작, 취소/만료/구 revision 결과 거부, 무결성/설정/누락 schema 거부, 기한 삭제와 원문 미보존을 포함한다. 실제 cryptographic verifier·Chrome 연결은 H2c에서 검증한다. 기존 HTTP·application DB schema 4·금고·M0/H1 입력은 변경하지 않는다. CI 기존 exam-evidence glob이 새 검사를 포함한다.

## H2c 수집 연결과 보안 검토

검토용 의존 그래프는 #33(H2a) → #34(H2b), 그리고 #32(기존 수집 spike)와 #34 → H2c다. #32 `534bf56` 이력을 H2c feature 브랜치에서만 병합했다. develop/원 작업본/PR #32는 변경하지 않았다. 최종 PR은 선행 diff를 포함하므로 고유 변경은 feature 병합 커밋 이후로 검토한다. 실제 적용 전 선행 PR 검토/통합이 필요하며 Mac 미확정 원인도 그대로 남는다.

`collectIntakeHistory(managedSession,{intake,applicationId,purpose,scoreIndex,...})`가 기존 관리형 Chrome·동일 Attestor client·secret scope·SnarkJS 자식 프로세스와 새 접수 코어를 연결한다. BASELINE_HISTORY는 고정 표 전체 recipe, ACHIEVEMENT는 명시적인 scoreIndex(0~15)를 고정해 기존 최소 한 행 recipe를 사용한다. 최고점 자동 선택은 없다. 로컬 HTML은 임시 메모리에서만 관찰하며 한 행 증명에는 그 행의 최소 시험/날짜/수험번호/성적만 드러난다. ACHIEVEMENT에서 표의 16행 초과·선택 없음·빈/로그인 응답은 실패/보류한다. 목표 시험일과 인정 기간이 겹치지 않으면 거부하고, 경계일의 정확한 시각·발표일/계정 동일성은 UNKNOWN이다.

추가된 scoreIndex는 접수 session context에 포함된다. 원천 recipe 두 종류와 SDK/엔진·로그인 전 registry 신뢰 목록의 digest도 context에 묶인다. 서명 claim은 고정 목적 `CLEAR_HISTORY_INTAKE_ONLY`, 세션 context digest와 원천 정책을 포함한다. 이전 진단 purpose/nonce의 proof는 수락하지 않는다. 독립 child에는 claim·서버 기대 문맥·공개 trust만 보내며 env 최소화, stdout/stderr 비활성, 네트워크 금지, 2MiB IPC·30초 상한·자식 종료 확인을 적용한다. 검증 반환은 필수 최소 필드만 허용한다. 검증 플래그/전체성/신원 값을 외부 제출에서 받아 승격하지 않는다.

공식 registry TLS 신뢰와 1개 공증자 서명, SDK 5.1.4·SnarkJS/Groth16 회로/키의 upstream 고정 commit은 기존 신뢰 가정이다. trusted setup 독립 감사·실제 배포 버전 pin·다중 공증자 합의·OS 전체 침해 방어를 완료했다고 주장하지 않는다. prefix/suffix의 가림 때문에 표 외 페이지/필터/총량은 인증되지 않는다. 생성 중 행 가림은 공식 provider 합성 시험, 실제 서명 후 변조는 #32 저장 결과이며 새 실제 악성 생성 시험과 구분한다.

전용 명령 `./tools/node src/mac-collector/launch.mjs --ybm-registration-intake`는 **로컬 등록 접수 시험**이다. 신뢰 목록을 먼저 고정하고 이력 필요 테스트 정책/가명 등록/동의 사건을 만든 뒤 전용 Chrome 로그인을 기다린다. ready 이후 새 문맥으로 증명하며 서버 검증·DB 수락·재개봉 조회까지 연결한다. 새 CLI는 baseline 경로의 리허설이며 제품 웹 등록/실제 지갑 동의/기관 등록 시점 검증 완료가 아니다. ACHIEVEMENT는 모듈 계약/합성 연결까지이고 실제 수강 후 새 시험 시연은 미실행이다.

메타데이터는 기존 Time Machine 제외 관리형 root 아래 `history-intake-v1`의 전용 DB에 보관한다. 이 CLI 정책은 등록부터 24시간 보존 후 다음 실행에서 정리하며 원본 proof/성적/쿠키/키는 보존하지 않는다. 재사용 방지 commitment/tombstone은 인스턴스 폐기까지 남는다. 원문은 공증/연산/검증 프로세스 메모리에 들어가며 JS/SDK 복사·swap 흔적 완전 삭제 보장은 없다. 정상·취소·오류에서 자식 연산/캡처/비밀값/Chrome/route/client 정리를 기다린다. 정리 실패는 성공으로 보고하지 않는다.

검토 당시 로컬 회귀는 YBM 205개(이후 취소/정리 실패 2개 추가), exam-evidence 123개, Mac 51개가 통과했다. #33 CI 6개는 통과했지만 #34 PR CI의 Mac 검사에서 BROWSER_TIMEOUT 2건이 발생했고 push CI는 통과했다. 최초 #32 실패와 같은 원인인지 확정되지 않았으며 이력 접수 코드가 원인을 수정했다고 기록하지 않는다. 실패 기록은 PR #34에 보존하고 후속 실행 결과를 별도로 기록한다.
