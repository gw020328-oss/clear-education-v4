# W04/W05 첫 구현 단위: 합성 정책과 결정적 평가

B3 후속(2026-10-13): [학습 증거 계약·합성 adapter](LEARNING_EVIDENCE.ko.md)가 신뢰한 합성 pin의 학습 기간·필수 강의/페이지·버전·관측 신선도를 검사해 기존 learning snapshot 형식으로 전달한다. 아래 평가기와 정책 hash/800점 AND 80% 규칙은 변경하지 않았다. 실제 제공자 인증·영속 수락은 미구현이며 실제 학습 검증은 BLOCKED다.

B2a 후속(2026-10-13): [전체 시험 목록·최고점 증거 계약](EXAM_EVIDENCE.ko.md)이 고정된 원천 inventory와 모든 페이지·접수/성적을 대조한 합성 exams snapshot을 생성한다. 아래 기존 평가기의 `completeSnapshot`은 여전히 신뢰 가능한 실제 증거가 아니다. 새 함수도 SYNTHETIC 전용이며 실제 원천 전체성은 BLOCKED다. 기존 평가기 입력·정책 해시를 소급 변경하지 않는다.

2026-10-12, 기준 develop `366417e3fd7b0cc64ed905cd65a4880955313419`.
승인 우선순위는 AGENTS의 최신 승인 → MAC_MVP → PRD/설계 → SESSION_HANDOFF다.
이 문서는 이번 기능 브랜치의 범위이며 과거 실제 성공 보고서를 대체하지 않는다.

## 진단 구현과 제품 설계의 차이

| 영역 | 현재 진단 구현 | 제품에서 필요한 것 | 이번 PR |
| --- | --- | --- | --- |
| 정책 | binding.mjs의 800/80 진단 hash, 실제 평가 없음 | 버전·날짜·필수 목록·출처를 고정하고 동의·계약과 같은 hash 사용 | 합성 CoursePolicy 컴파일·검사·해시 |
| 시험 | 한 접수/성적 쌍의 서명·동일 시험 검증, 목록 완전성 false | 검증된 여러 시험의 완전성/누락 처리, 기간 내 최고 총점 | 합성 목록의 보류·최고 총점·동률 선택 |
| 학습 | 미구현 | 고정 필수 목록과 시드 snapshot, 완료율·결측·정정 처리 | 시드 입력 계약과 순수 평가 함수 |
| 신청·지갑 | 메모리 진단 authority·새 로컬 테스트 지갑 | 지갑 인증/동의 구분, 제품 DB, 예치 후 지갑 고정 | 후속 W03/W06 |
| 재사용 방지 | 메모리 nonce·상태 | DB 원자 소비, 반별 시험 nullifier, 계약 중복 차단 | 후속 W06–W09 |
| 금고·지급 | 진단 paymentAllowed=false, 신규 계약 없음 | 실제 RuntimeConfig·예치·권한 확정·독립 청구 | 후속 W07/W09/W10 |
| 실제 proof→자격 | verifier의 개인정보 없는 boolean 결과만 존재 | 검증된 최소 필드를 전달하는 비공개 내부 계약 | 후속 W08, 기존 진단 수정 없음 |

W04/W05 전체 완료를 주장하지 않는다. 먼저 제품 DB·배포 없이 검증 가능한 정책과 평가 알고리즘을 완성한다.
실제 RuntimeConfig·신청별 EIP-712 벡터는 계약 저장 필드·신청이 정해지는 W06/W07에서 연결한다.
시드 HTTP API·인증·영속 snapshot 저장도 W06 이후다. 이번 입력은 내부 합성 객체이며 네트워크 API가 아니다.
진단 authority나 W02 spike를 제품 이름으로 바꾸지 않고 `src/policy`, `src/eligibility`에 독립 구현한다.
기존 고정 root ethers의 keccak256만 사용하며 새 의존성은 없다.

## 이번 PR 완료 기준

- 엄격한 CoursePolicy 필드·타입·날짜·기간 검사. 누락/null/TBD·추가 필드·중복 강의·분모 0 거부.
- 정규화 UTF-8 canonical JSON → keccak256, 고정 해시 벡터. 버전·날짜·목록·출처·금액 변경은 새 해시.
- T+259200초 보완 종료, T+864000초 최종 청구 마감 산출. 외부 입력으로 마감 덮어쓰기 불가.
- 인정 기간 내 VALID 단일 시험의 최고 총점, 795/800 경계, 다른 시험 LC/RC 혼합 입력 거부.
- 기간 내 필수 강의 수의 정수 비교. 정확히 80%와 79.99%, 동일 중복·충돌·결측·기간 밖 검사.
- 같은 정책·입력·평가기 버전은 같은 결과. learner·policy·source·snapshot 버전 불일치 보류.
- 로컬 검사·기존 회귀·공개 이력/원본 보존 검사, CI와 담당자 코드 리뷰 뒤 develop 대상 PR. 자동 병합 없음.

## 정책 컴파일 계약

`compileSyntheticPolicy(draft)`는 정확한 키 집합만 받는다. `compiler.mjs`가 실행 schema다.
schemaVersion=4, dataMode=SYNTHETIC, examType=TOEIC_LR, minScore=800, minCompletionBps=8000,
completionRuleVersion=seed-required-completed-in-period.1을 요구한다.
지원하지 않는 완료 규칙 버전을 기존 규칙으로 실행하지 않는다.

cohortId·privacyNoticeVersion·강의 ID는 1–64자의 문자/숫자/밑줄/점/하이픈이고 NFC로 정규화한다.
강의 ID는 NFC 후 중복을 거부하고 UTF-16 순으로 정렬한다. 일반 배열의 순서는 canonical에서 보존한다.
객체 키는 UTF-16 순, 공백 없는 JSON, UTF-8 인코딩을 사용한다. 자유서술 필드는 받지 않는다.
정책·금액·시간 필드에 undefined/null을 기본값으로 치환하지 않으며 추가 필드도 거부한다.

policyVersion은 양수 10진 문자열이다. 시간·금액도 선행 0 없는 10진 문자열이며 숫자 타입으로 바꾸지 않는다.
금액은 uint256 양수, tokenDecimals는 정수 0–18이다. 처리 시각은 UTC epoch seconds(0–253402300799),
시험일은 1970년 이후 유효 YYYY-MM-DD(Asia/Seoul 달력)다. 학습 기간은 양 끝을 포함하는 epoch seconds다.
시험·학습 인정 종료는 정상 제출 마감 이후일 수 없다. 과거 성적 시연을 위해 등록 기간보다 과거 학습·시험 기간을 허용한다.

반환값은 원본과 분리된 깊은 불변 객체다. `policy`, `canonicalJson`, `policyHash`,
`requiredLectureIdsHash`, `compilerVersion`, `publishable:false`를 포함한다.
평가기에는 같은 프로세스에서 컴파일한 객체만 전달한다. 저장·전송한 draft는 다시 컴파일하여 저장된 hash와 비교해야 한다.
버전의 DB 유일성·기존 동의 불변성은 이 메모리 객체만으로 보장되지 않으며 W06 책임이다.

실제 게시 API는 없다. 실제 미정 날짜·지급액·시험 종류를 승인값으로 만들지 않는다.
테스트의 2020년 날짜, 50 TEST, TOEIC L&R, 출처 해시는 **명시적 합성 fixture**다.
이 컴파일러는 REAL_YBM 정책을 거부하고 모든 결과를 publishable=false로 표시한다.

## 합성 평가 입력과 결과

`evaluateSyntheticEligibility(compiled, input)`의 input 필드는 learnerId, expectedSeedSnapshotVersion,
exams, learning이다. 두 snapshot은 dataMode=SYNTHETIC, policyHash, learnerId,
snapshotVersion, observedAt, completeSnapshot, records를 요구한다. exams에는 sourcePolicySetHash도 필요하다.

시험 record는 status(VALID/INVALID), registration, score다. 각 원천의 examKey·examType·examDate가 같아야 하며
score만 정수 totalScore(10–990, 5점 단위)를 추가한다. LC·RC 필드는 받거나 합산하지 않는다.
examKey는 합성 불투명 ID이며 실제 수험번호·proof hash·제품 nullifier가 아니다.
같은 key의 동일 중복은 한 번, 다른 날짜·점수·유효 상태는 보류한다.
유효하고 기간 내인 총점만 비교하며 동점은 **시험일 오름차순 → NFC 시험키 오름차순**으로 선택한다.
INVALID나 기간 밖 기록은 인정 대상에서 제외한다. 완전한 빈 목록은 NOT_YET_MET다.
불완전 목록은 800점 기록이 있더라도 ON_HOLD이며 highestScoreAssessed=false다.
현재 진단의 listComplete=false를 이 합성 flag로 승격하거나 실제 최고점 확인으로 설명하지 않는다.

학습 record는 lectureId, completed(boolean), completedAt이다. false는 completedAt=null,
true는 유효한 epoch seconds가 필요하다. 관측 시각보다 미래인 완료/시험은 보류한다.
필수 강의 결측·불완전 snapshot·상충하는 중복은 ON_HOLD, 유효한 비필수 강의는 분자에서 제외한다.
동일 중복은 한 번만 세며, 기간 밖 완료도 분자에서 제외한다.
`completedCount × 10000 ≥ requiredCount × 8000`을 BigInt로 계산해 반올림 합격을 방지한다.
최대 필수 강의 10000개, 학습 record 20000개, 시험 record 100개로 한정한다.

결과는 ELIGIBLE / NOT_YET_MET / ON_HOLD와 정렬된 고정 사유 코드, 조건별 met,
사용한 policyHash·policyVersion·evaluatorVersion·snapshotVersion을 반환한다.
보류가 미충족보다 우선한다. 이는 최종 탈락이나 지급 허가가 아니다.
서명된 proof를 검증하지 않으며 VALID/completeSnapshot은 합성 입력 선언일 뿐이다.
모든 결과에 dataMode=SYNTHETIC, paymentAllowed=false가 고정된다.
정책/최상위 호출 계약 오류는 고정 코드 예외, 원천 snapshot 오류는 고정 코드 보류이며 원문을 출력하지 않는다.

시드 버전이 expectedSeedSnapshotVersion과 다르면 보류한다. 새 버전을 고정해 다시 평가하면 정정이 반영되며
기존 불변 결과는 바뀌지 않는다. 발급 직전 최신 버전 재확인·동시성·확정 뒤 권리 보존은 W09에서 구현한다.
관측 시각은 입력이며 현재 시계를 사용하지 않는다. freshness·신청·예치·제출 마감 검사는 후속 통합 책임이다.
실제 계정의 모든 시험 목록 완전성을 입증하는 원천 계약은 아직 없다.

## 실행과 다음 순서

저장소에서 `./tools/npm run test:policy`로 실행한다. 공개 합성 CI에도 동일 검사를 추가했다.
추가 로그인·실제 proof 생성·유료 호출·배포·거래는 필요하지 않다.

다음은 W03/W06의 외부 지갑 인증과 동의 분리, policyHash를 고정한 신청·DB·영속 nonce다.
그 뒤 W07 금고와 RuntimeConfig, W08 비공개 검증 필드 전달, W09 권한/중복/outbox,
W10 독립 청구, 새 제품 문맥의 실제 로컬 통합 순서다.
Mac 관리형 저장 승인·추가 TEE 보류·실명/LMS 후속·원본/legacy 보존은 유지한다.

## 로컬 검증과 담당자 코드 리뷰

2026-10-12 로컬 결과: 신규 정책/평가기 112개, 기존 YBM 153개, Mac/무결성/공개 이력 48개,
ProofAdapter 107개, 원천 경계 62개, 저장 준비 37개로 **519개 통과, 실패/skip 0개**다.
Mac 시험은 합성 Chrome 종료·강제 종료 복구와 패키지 재현을 포함한다.
verify:workspace, verify:workspace:local, verify:dependencies도 통과했다.
원본/legacy 191개 파일·공개 참고 문서 4개·의존성 그래프 보존을 확인했다.

담당자 자체 코드 리뷰에서 compiler의 모든 정책 필드가 canonical hash에 들어가는지,
동의 전 고정할 배열이 입력 객체와 분리되는지, 날짜·금액 산술 범위와 오류의 원문 비노출을 확인했다.
평가기의 누락/충돌 우선 보류, 단일 시험 선택, 정수 수강률, 합성 전용 경계와 CI 연결을 검토했다.
최신 낮은 점수로 최고점을 덮지 않는 사례와 문자열 completeness·희소 배열·목록 상한 거부 시험을 보강했다.
이 변경 범위에서 추가 차단 문제를 발견하지 못했다. 별도 팀원 승인이나 외부 독립 리뷰를 받은 것으로 표시하지 않는다.
최종 CI 결과는 PR Checks를 따른다. 이 검증은 제품 신청·영속 재사용 방지·예치·실제 자격·지급의 완료 증거가 아니다.
