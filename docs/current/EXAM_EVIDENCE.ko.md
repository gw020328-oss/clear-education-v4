# B2a 전체 시험 목록·최고점 증거 계약

B2b 후속(2026-10-13): [제품 수집·독립 검증·단회 수락 계약](PRODUCT_PROOF.ko.md)이 합성 원천 서명을 검증한 뒤 manifest pin을 이 B2a 함수에 전달하고, 검증된 최소 snapshot만 원자 수락한다. 아래 실제 원천 인증/포괄성의 미확인 조건은 그대로 유지한다. 합성 원천 키가 공식 YBM 신뢰 근거가 된 것은 아니다.

2026-10-13, 오규원(백엔드). [이슈 #12](https://github.com/gw020328-oss/clear-education-v4/issues/12), 선행 [B1 / PR #16](https://github.com/gw020328-oss/clear-education-v4/pull/16), 기준 develop `2c518230c8c98045bcbec50f58de4289d76d7ae3`.

**결론: 원천이 보증한 전체 목록을 전제로 한 계약과 합성 검증은 구현했다. 현재 YBM 경로로 실제 전체 목록·최고점·자격을 인정하는 것은 차단한다.** 이 문서의 manifest는 필요한 원천 보증의 제안이며, YBM이 실제로 제공하는 API/서명 형식이 아니다. B1의 지갑 결합 승인도 원천 목록의 진실성이나 완전성을 보증하지 않는다.

## 확인한 근거와 모르는 부분

| 구분 | 근거 | 판단 |
| --- | --- | --- |
| 저장된 실제 실행 사실 | [W02 공개 검증 기록](../w02/ybm-proof-verification.json)의 live 및 마지막 성공 시도: signedClaimsReceived=2, independentVerification=true, listComplete=false, highestScoreAssessed=false | 한 접수·성적 쌍의 성공. 전체 목록 성공 아님 |
| 현행 코드 사실 | [원천 정책](../../src/ybm-collector/source-policy.mjs)의 candidate.3, MAX_ROWS=16, 선택된 행의 가림/추출 및 joinSources | 16은 진단 선택 상한이며 전체 건수·페이지 크기·종료 증거가 아님 |
| 현행 코드 사실 | [검증기](../../src/ybm-collector/proof-verifier.mjs)의 EXACT_PAIR_REQUIRED 및 마지막 boolean 결과 | 한 쌍의 서명/params/context/owner/동일 시험 검증. 페이지 manifest·계정 전체성·상태 목록을 검증하지 않음 |
| 공식 공개 문서 사실 | 2026-10-13 확인한 [YBM 일반시험 관리규정](https://m.exam.toeic.co.kr/common/template/viewContents.php?contentsCode=37), 제2·5·11~15조 | 정기/특별시험 경로가 다르고, 성적 유효기간은 시험 시행일로부터 2년 뒤 해당 일자까지이며 조회도 유효기간 내로 제한됨. 특별시험은 단체를 통한 확인 경로이며 무효 성적은 조회가 불가할 수 있음 |
| 설계상 추론 | 위 기록·정책·공개 문서 | 현재 화면의 보이는 행만 모아도 과거/특별/무효/미발표 기록까지 빠짐없다고 결론 낼 수 없음 |
| 미확인 | 인증 후 실제 응답의 페이지/기간 필터, 전체 건수, 종료 표식, 빈 결과 의미, 변경 이력, 안정된 snapshot, 취소/결시/무효/미발표 노출, 동일 계정 결합, 비회원·다른 계정·특별/국외시험 포괄성 | 이번 작업에서 로그인·새 증명 수집을 하지 않았음. 공개 문서로 비공개 응답 형식을 추정하여 구현하지 않음 |

기존 W02 원천 지문 `0x1a8946e685bef4a4c1b9b7bd27c0a1b6ac23cc96373114a5d1345a65d2e11821`과 실제 실행 기록은 보존한다. 본 합성 정책은 다른 지문이다. 기존 정책·동의를 조용히 교체하지 않는다.

## 선택한 설계와 신뢰 경계

단일 성적·성적표는 개별 성적 사실의 증거가 될 수 있어도 전체 목록 부재의 증거가 아니다. 로컬 DOM 행 수, `completeSnapshot=true`, 선택된 행들의 서명 모음만으로 전체성을 승인하는 방식을 채택하지 않는다.

선택안은 **원천에서 인증된 범위·전체 건수·페이지 목록/지문·종료 조건을 고정한 inventory**와 각 페이지의 대조다. 원천이 snapshot을 지원하지 않는다면, 이에 상응하는 일관성/완전성 보증을 먼저 설계·검증해야 한다. 끝까지 순회했다는 수집기 주장이나 시작/끝 건수가 우연히 같다는 사실만으로 대체하지 않는다.

`assessSyntheticExamEvidence(compiled, context, bundle)`는 순수 내부 함수다. HTTP 경로, 실제 수집, 원천 서명 검증, DB 저장, nonce 소비, proof 수락 전이, 지급 권한 발급을 추가하지 않는다. 호출자와 context는 신뢰하는 내부 경계이며 외부 클라이언트가 직접 제공해서는 안 된다.

- `compiled`: 기존 컴파일러가 같은 프로세스에서 만든 합성 정책. `sourcePolicySetHash`는 새 `SOURCE_CONTRACT_HASH`와 정확히 일치해야 한다.
- `context.session`: 신뢰한 B1 서비스/DB에서 가져온 AUTHORIZED 세션 view. SYNTHETIC/비수집/미검증/미지급, 발급≤승인≤현재<만료, policy/session/application 일치와 실제 B1 typedData의 bindingDigest를 재계산한다. digest는 신청·지갑·정책/runtime·세션/nonce·owner·만료 및 chain/vault/instance domain을 결합한다.
- `context.manifestHash`: bundle과 별개 경로에서 **원천 전체성을 인증한 후** 신뢰할 호출자가 고정하는 지문. 이번에는 테스트의 합성 원천 생성기만 이 역할을 한다. 제출자가 bundle을 만든 뒤 스스로 계산해 context에 넣으면 누락 방지의 신뢰 전제가 무너진다.
- `context.now`: 서버가 고정한 epoch seconds 문자열. 외부 요청에서 받지 않는다.
- `bundle`: 아래 manifest와 페이지들. 지문은 canonical JSON→keccak256이며 원천의 서명이나 진실성을 대신하지 않는다.

공격자가 제출 페이지와 manifest의 지문을 모두 다시 계산해도 이미 고정된 context.manifestHash와 달라 보류된다. 반대로 신뢰한 원천/호출자가 기록을 함께 숨기고 새 pin까지 제공하면 이 함수는 그 거짓말을 탐지할 수 없다. 이 한계를 암호학적 전체성 검증으로 표현하지 않는다. 실제 경로에서 이 pin을 얻는 방법은 현재 미해결이다.

B1 view는 과거 승인 사실이다. 이 함수가 정상이어도 평가 중 로그아웃·취소·만료나 현재 체인 변경을 감지하지 않는다. B2b는 결과 수락 transaction 안에서 최신 인증·세션/신청/예치·만료/취소·원천 지문을 재검사하고 단회 proof 수락을 별도로 구현해야 한다.

## 최소 입력 계약

실행 schema는 [synthetic-completeness.mjs](../../src/exam-evidence/synthetic-completeness.mjs), 합성 생성 예는 [fixture](../../tests/exam-evidence/fixture.mjs)를 따른다. 누락·추가 필드·잘못된 타입·희소 배열을 거부한다.

| 객체 | 필드와 의미 |
| --- | --- |
| manifest | version=`synthetic-exam-inventory.1`, dataMode=`SYNTHETIC`, sourcePolicySetHash, policyHash, bindingDigest, learnerId(B1 수취 지갑), subjectRef(원천 계정의 불투명 bytes32), snapshotId, observedAt, scope, inventories |
| scope | examType=`TOEIC_LR`, examDateStart/End(정책과 정확히 일치, 양 끝 포함), allStatuses=true, coverageStart/End(원천이 보증하는 보존/조회 범위가 인정 기간 전체를 포함) |
| inventories | REGISTRATION, SCORE 순으로 정확히 두 개. 각각 role, totalRows, pages, terminalPageId |
| inventory.pages | pageId, offset, rowCount, pageHash. 시작 offset 0, 빠짐/겹침 없이 누적, 건수 총합 일치, 페이지 ID 유일, 마지막 ID가 terminalPageId |
| 전송 페이지 | role, pageId, snapshotId, subjectRef, bindingDigest, observedAt, offset, nextPageId, records. 모든 문맥이 manifest와 일치. 다음 페이지 ID를 정확히 연결하고 마지막은 null |
| 접수 record | examKey, examType, examDate, status(TAKEN/CANCELLED/ABSENT/INVALID/PENDING/CHANGED) |
| 성적 record | examKey, examType, examDate, status(VALID/INVALID/PENDING), totalScore(VALID만 10~990 정수·5점 단위, 나머지는 null) |

시험일은 Asia/Seoul 달력 YYYY-MM-DD, 관측 시각은 epoch seconds 문자열이다. 시험키는 NFC 정규화된 1~64자 불투명 계정 내 식별자다. 실제 수험번호·단순 수험번호 해시·proof hash·B4 nullifier로 사용하지 않는다. 동일 시험일에 여러 시험이 있을 수 있어 날짜만으로 합치지 않는다. 실제 keyed 식별자/개인정보 매핑과 동일 원천 계정 확인은 B2b에서 별도로 검증해야 한다.

이 계약은 **하나의 인증된 원천 계정 범위**의 전체성을 표현한다. 한 사람의 다른 계정·비회원·특별/국외시험까지 자동 포괄하지 않는다. 현행 TOEIC_LR 정책만으로 어떤 하위 시험/계정 범위를 인정할지 충분히 정의되지 않았으므로, 실제 정책 범위와 원천 포괄성이 합의·검증되기 전에는 실평가를 차단한다.

관측은 B1 승인 이후부터 현재까지, 최대 300초 전이어야 한다. 이는 새 합성 계약의 보수적 상한이며 YBM이 약속한 신선도가 아니다. 정책의 마지막 인정 시험일 23:59:59(서울)가 관측 이전이어야 최종 최고점을 판단한다. 아직 기간이 열려 있으면 PERIOD_NOT_CLOSED다. 미발표 결과는 기간이 지났더라도 보류한다.

원천별 최대 100행·100페이지, 총 200페이지다. 상한 초과를 잘라서 처리하지 않는다. 비어 있는 전체 목록도 원천이 고정한 0건과 빈 마지막 페이지 하나가 각각 있어야 한다. 페이지가 아예 없으면 빈 목록 성공이 아니다. 상한은 합성 평가기의 100시험 제한과 맞췄으며 실제 YBM 화면 상한이 아니다.

## 연결·제외·최고점 규칙

- 모든 접수와 성적을 examKey로 연결하고 시험 종류·시험일을 대조한다. 같은 키의 동일 중복도 페이지 중복 가능성 때문에 보류한다. 기존 평가기의 동일 중복 제거보다 보수적인 원천 검증이다.
- TAKEN 접수는 VALID 성적을 정확히 하나 요구한다. 성적 누락, 접수 없는 성적, 날짜/상태 충돌은 보류한다. 800점 이상 행이 이미 있어도 예외가 없다.
- CANCELLED/ABSENT는 그 상태에 대한 인증된 원천 근거가 있을 때만 제외하고 성적이 함께 있으면 충돌이다. INVALID는 양쪽에서 명시적으로 일치할 때만 제외한다. 실제 무효 성적 조회가 불가능하면 빈칸으로 추정하지 않고 보류한다.
- PENDING/CHANGED는 보류한다. 정정/접수 변경은 임의로 최신 행을 선택하지 않는다. 변경이 완전히 반영된 새로운 전체 snapshot과 새 pin으로 다시 평가한다. 이전 결과는 불변이며 자동으로 지급 입력을 바꾸지 않는다.
- 유효하고 범위 안인 단일 시험 총점 중 최고를 선택한다. 동점은 시험일 오름차순→시험키 오름차순. LC/RC 입력·다른 시험 점수 합성은 허용하지 않는다.
- 보류면 `status=ON_HOLD`, 고정 reasons, `snapshot=null`, `highestScoreAssessed=false`, 선택 시험·점수 null이다. 다른 부분 성공을 노출하여 자격 성공으로 오해하게 하지 않는다.
- 성공은 `COMPLETE_SYNTHETIC`이며 기존 합성 평가기의 exams snapshot을 반환한다. 빈 목록은 정상 합성 전체 목록이지만 최고점은 null이며 기존 평가기에서 미충족이 된다. 점수만으로 전체 자격을 결정하지 않는다. 학습 조건은 기존 별도 snapshot 계약을 따른다.

모든 결과는 `dataMode=SYNTHETIC`, `liveSupported=false`, `collectionEnabled=false`, `proofVerified=false`, `paymentAllowed=false`다. 최고점/시험키/최소 성적 snapshot은 비공개 내부 처리 자료이며 로그·Issue·브라우저 응답·공개 fixture에 실데이터로 넣지 않는다. 함수는 입력 원문이나 성적을 오류 메시지로 반환하지 않는다.

## 합성 검증과 현재 경로 판정

| 사례 | 기대 결과 |
| --- | --- |
| 고정된 여러 페이지와 접수/성적 모두 일치 | COMPLETE_SYNTHETIC, 결정적 최고 총점, 기존 평가기에 연결 |
| 부분 한 쌍·첫/중간/마지막 페이지 누락·추가/중복 페이지 | 보류, 최고점 없음 |
| 최고점 행 제거·manifest까지 다시 계산 | 원래 pin 불일치 또는 페이지 지문 불일치로 보류 |
| 페이지 gap/overlap/loop/조기 끝, 건수/종료 ID 불일치 | 보류 |
| snapshot/계정/세션/관측 시각이 중간에 변경 | 보류 |
| 기간 축소·valid-only 필터·보존 범위 부족·아직 열린 시험 기간 | 보류 |
| 미발표/변경 상태, 접수/성적 누락·충돌·중복, LC/RC 혼합 | 보류 |
| 인증된 취소/결시/무효 제외, 동점, 795/800, 빈 목록 | 계약대로 계산, 지급은 계속 false |
| 실제 B1 서비스의 새 합성 EVM 예치·서명 승인·재시작·취소 | 승인 context 연결 성공, nonce 추가 소비 없음, 취소한 최신 view 거부 |
| REAL_YBM 선언·이전 source policy·변조된 B1 binding | 거부/보류, 합성 함수로 실자료 승격 불가 |

현재 경로가 충족하는 조건은 한 쌍의 공식 서명·정확한 params/context/owner·신선도·동일 시험 연결이다. 충족하지 못하거나 미확인인 조건은 인증된 전체 inventory, 계정/범위 포괄성, 모든 상태, 전체 페이지/종료·snapshot 일관성, 제품 세션 기반 실제 검증 결과 수락이다. 따라서 **실제 목록 검증과 제품 자격 판정은 계속 BLOCKED**다. 해시 비교 합성 시험 성공은 이 차단을 해제하지 않는다.

## 후속 인계

B2b(오규원)는 먼저 실제 원천에서 전체 목록과 계정/범위를 검증할 수 있는지 확인하고, 가능할 때만 독립 검증 프로세스의 서명된 추출값으로 pin과 최소 필드를 구성해야 한다. 수집기가 주장하는 count/hash나 로컬 HTML을 신뢰 입력으로 넘기지 않는다. 불가능하면 원천 API/명시적 내역 제공 방식 또는 요구사항 변경 결정을 요청하고 실경로는 차단한다. 이번 작업으로 사용자 로그인을 다시 요구하거나 후보 정책/기존 수집기를 변경하지 않았다.

B1 스키마/HTTP/상태는 유지한다. B2b의 단회 검증 결과 수락과 현재 체인 재검증, B4의 시험 nullifier·중복 예약·grant/outbox 원자 기록은 별도다. 서준형의 F4는 목록 검증 보류, 기간 미종료, 성적 미발표, 원천 범위 미확인, 새 snapshot 재시도를 구분해야 한다. 아직 HTTP로 이 결과를 제공하지 않으며 proof 승인 화면을 자격 완료로 표현하지 않는다.

## 재현

```sh
./tools/npm run test:exam-evidence
./tools/node --test tests/exam-evidence/*.test.mjs tests/policy/*.test.mjs tests/proof-sessions/*.test.mjs tests/application/*.test.mjs tests/vault/*.test.mjs tests/dev/*.test.mjs
./tools/npm run verify:dependencies
./tools/npm run verify:workspace
```

시험은 새 임시 DB·무작위 테스트 지갑·메모리 TEST 체인·합성 계정/성적만 사용한다. 외부 RPC/실제 로그인/새 증명/유료 호출/지급은 없다. 구체적 로컬 실행 수와 최신 CI는 연결 PR의 검증 기록을 따른다.

2026-10-13 Apple Silicon Mac / Node 24.21.0 로컬 검증: B2a 55개 + 정책 112개 + B1/신청/금고/C1 200개 = **367개 통과, 실패/skip 0**. 마지막 B1 context schema 및 정렬 검토 보강 후 B2a 55개를 다시 실행해 통과했다. 의존성 검사, 원본/legacy 191개·공개 참고문서 4개 지문 보존, 변경 문서 로컬 링크 60개, diff 공백 검사를 통과했다. 공개 이력 검사와 최신 CI는 연결 PR에서 확인한다.

합성 source contract 지문은 `0xb3ac2a4eb8427b4ee701be3665b02828fd5e3afd832cc4f2ddc81d46f4416129`다. 계약을 바꾸면 version과 sourcePolicySetHash를 새 정책으로 고정하고 기존 동의/결과를 재사용하지 않는다. 자체 검토에서는 지문을 재계산한 누락 공격과 신뢰 pin 자체가 거짓인 경우를 구분하고, 합성 성공을 실제 전체성으로 승격하는 경로가 없는지 확인했다. 외부 독립 리뷰나 실제 목록 검증을 받은 것으로 표시하지 않는다.
