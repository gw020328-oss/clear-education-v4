# 등록 이력 → 목표 성적: 합성 계약과 구현 경계

2026-10-14 H2 후속: [격리 등록 접수](HISTORY_INTAKE.ko.md)는 H1의 두 목적을 별도 영속 ledger/독립 검증/관리형 수집기에 연결한다. 기존 H1 SYNTHETIC 및 HTTP/DB 계약은 보존한다. 로컬 모듈 연결과 실제 웹/기관 등록·자격 완료를 구분하며 미확인 전체성/신원/공식 기간은 UNKNOWN이다.

2026-10-14, `clear-exam-lifecycle.1`. 기준 develop `cd21b95d463305424532efe014834c3ae01a8745`. [PR #31](https://github.com/gw020328-oss/clear-education-v4/pull/31)의 공식 요구사항 보강을 이 흐름으로 확장한다. [PR #32](https://github.com/gw020328-oss/clear-education-v4/pull/32)는 별도 Draft 연구 의존성이다. 이 PR은 #32 코드를 복사·병합하거나 실제 수집기를 연결하지 않는다.

승인된 작은 구현 단위 **H1**은 스키마·용도/기간/문맥 검증·합성 영수증/상태 결합이다. [순수 합성 구현](../../src/exam-evidence/lifecycle.mjs), [스키마](../../src/exam-evidence/lifecycle-schema.mjs), [시험](../../tests/exam-evidence/lifecycle.test.mjs)이 정본이다. 기존 HTTP/DB/서명/금고 계약과 M0 `clear-m0.2` 예제는 대체하지 않는다. 실제 Moodle 연동·원천 검증 BLOCKED, grant/outbox HOLD, 독립 청구 제품 NO-GO, 소비자 합의 PENDING을 유지한다.

## 실제 연구 결과와 제품 관문

#32 head `6aad3a2b32dac3aea1dd545df8326864a1d990a6`의 [보고서](https://github.com/gw020328-oss/clear-education-v4/blob/6aad3a2b32dac3aea1dd545df8326864a1d990a6/docs/spikes/history-proof/README.ko.md)·[검증 기록](https://github.com/gw020328-oss/clear-education-v4/blob/6aad3a2b32dac3aea1dd545df8326864a1d990a6/docs/spikes/history-proof/verification.json)·history-policy/verifier 코드를 읽고 대조했다. 보고된 성공은 한 실제 계정에서 반환된 TOEIC 3행 표 전체의 공식 Reclaim 서명, 별도 오프라인 검증, 진단 owner/nonce/신선도, 서명 후 변조 거부다. 공증자 1개, SnarkJS/Groth16 자식 연산, 검증 요청까지 107초·송신 117,809바이트·32MiB 상한 유지, 합성/회귀 59개는 그 실험의 저장된 결과다. 이번 H1에서 재실행한 수치가 아니다.

`wholeHistoryTableClaim=true`와 `proofVerified=true`는 **fullHistoryProven=false, sourceCoverageConfirmed=false, accountIdentityBound=false, paymentAllowed=false**와 함께 읽는다. 실제 빈 계정·다건/페이지 분할·생성 단계의 선택적 누락 공격·신청자 결합·개인정보 최소 공개·Groth16 신뢰 가정 검토가 남아 있다. 표 내부 가림 거부의 합성 시험과 실제 악성 증명 생성 시험은 다르다. 전체 표의 무결성을 등록일 기준 2년 전체 이력으로 올리지 않는다.

2026-10-14 재열람한 [YBM 공식 FAQ](https://exam.toeic.co.kr/customer/csMain.php)는 2년이 지난 성적의 조회·재발급 불가를 안내한다. 따라서 환급 시점 조회만으로 등록 당시의 과거 기간을 복원하지 않는다. [시원스쿨 안내와 미결 경계](EXAM_HISTORY_REQUIREMENTS.ko.md)를 따른다. 수집 당시 신선도 검증과 나중의 자격 자료 사용은 별도 단계다.

## 용도와 등록 사건

| 항목 | BASELINE_HISTORY | ACHIEVEMENT |
| --- | --- | --- |
| 시점/의미 | 과거 이력이 필요한 정책·경로의 등록 단계 | 수강 후 또는 정책의 성적 인정 기간 |
| 조건 | 고정된 과거 기간 전체의 목표 미달/미응시 | 별도의 인정 시험 성적 |
| 적용 | 시원스쿨 100% 성적·200/300%, 400% 구조화 | 반별 성적 조건. YBM에 baseline을 일괄 강제하지 않음 |
| 미지원 | 전체성/계정/빈 목록 미확인 → UNKNOWN | 계정/서명/점수/발표일 미확인 → UNKNOWN |
| 결과 사용 | 독립된 baseline 결과 | 별도 achievement 결과. 이후 반별 규칙에서 결합 |

50%·100% 출석 대안에 과거 이력을 추가하지 않는다. `baselineRequired`는 경로별로 검토하고 동의 때 고정할 정책값이며 UI가 보류를 우회하기 위해 토글할 값이 아니다. H1은 이 값이 고정된 한 문맥을 검사하며 학원 전체 정책 컴파일러가 아니다.

실제 ‘수강 신청일’의 결제/접수/동의/승인 사건과 시간대·양 끝 경계는 공식 적용 검토 전 OPEN이다. H1의 등록 사건은 **SYNTHETIC_TERMS_ACCEPTED**이고 신뢰하는 시험 clock으로 생성기가 한 번 고정한다. 제출값에 등록 시각을 받아 소급 수정하지 않는다. 실제 등록 서비스에서 이 사건을 채택했다는 뜻이 아니다.

합성 예제는 2030-03-01 00:00 KST를 T로 사용한다. baseline은 `[T−730일,T)`, 등록 후 수집/수락 허용은 `[T,T+600초]`, 수락 때 수집물 최대 나이는 300초다. **730일은 윤년을 포함한 공식 달력상 2년 규칙이 아닌 시험용 초 단위 가정**이다. 목표 성적 시험일은 `[T+1일,T+100일)`, 제출/수락은 T+114일까지다. 실제 인정 기간·보완 기한과 같다고 주장하지 않는다. 등록 직후 허용 오차 안에 수집해도 baseline 기간을 수집일 기준으로 밀지 않는다. 앞부분이 원천에서 만료/누락되면 UNKNOWN 또는 기간 불일치로 차단한다.

`examAt`(시험), `availableAt`(발표/조회 가능), `collectedAt`(취득), `acceptedAt`(검증 수락), `evaluatedAt`(이후 평가)을 구분한다. availableAt은 시험 이전/수집 이후일 수 없고 미확인이면 UNKNOWN이다. baseline의 시험이 등록 전에 있었어도 발표가 등록 이후면 H1에서는 PUBLICATION_AFTER_REGISTRATION으로 보류한다. 미발표 시험의 실제 공식 취급은 추측하지 않는다.

## 코드 API와 단회 수락

이 절은 모듈 API이며 HTTP endpoint가 아니다. [M0 schema](../../specs/m0/schema.mjs)는 LifecyclePolicy/Binding/Registration/Session/Submission/Receipt/Evaluation 정의를 추가로 노출한다. 기존 M0 mock 명령을 이 모듈 호출로 자동 교체하지 않는다.

| 호출 | 반환/의미 |
| --- | --- |
| `createSyntheticExamLifecycle({policy,binding,clock})` | 복사한 고정 정책/신청 문맥과 메모리 registry. SYNTHETIC만 허용 |
| `registration()` | 고정 등록 사건/시각·정책 digest·binding의 복사본 |
| `openSession(purpose,{sessionId,nonce})` | 용도·고정 기간·별도 nonce/증거 revision·수락 기한. 같은 ID/nonce 재사용 거부 |
| `accept(submission)` | 정확한 세션/정책/기간·수집 당시 신선도를 검사해 합성 영수증을 한 번 수락. 실제 서명 검증기 아님 |
| `evaluate({baseline,achievement})` | 두 결과를 독립 확인해 MET_SYNTHETIC / NOT_MET / UNKNOWN 결합. `productEligible=false`, `paymentAllowed=false` 고정 |

두 용도 모두 applicationId·policyVersion/digest·participantRef·bindingRevision·recipientRef·instanceId·registeredAt에 묶인다. participantRef는 가상 내부 참조이며 실명 인증 완료 표시가 아니다. 용도·세션·nonce·revision·증거 digest도 일치해야 한다. 용도 전환, 타 신청/정책/지갑 재사용, 다른 기간, 중복 수락, 같은 증거 digest의 재사용을 거부한다. 실제 원천 시험의 안정 중복키/nullifier 구현은 아니다.

새 세션 revision은 이전 결과를 현재 판정에서 보류시키고, 늦은 이전 작업은 거부한다. 목표 성적은 한 건만 수락하여 자동 최고점 선택을 하지 않는다. H1 합성 규칙은 **최초 수락된 목표 시험 참조와 시험일을 고정**하고 후속 정정은 같은 시험 식별자만 허용한다. 실상품의 ‘최초 제출’ 사건/철회/정정 의미는 Q-TIER로 남는다. 반별 50~300% 조건·금액·명시 tier 선택·상위 UNKNOWN 보류와 400% 사전검토 제한은 [기존 계약](M0_CONTRACT.ko.md)을 유지한다. H1 결과를 실제 금액 확정이나 기존 금고로 보내는 adapter는 없다.

빈 목록은 서명/계정 결합뿐 아니라 COMPLETE_SYNTHETIC 및 NO_RECORD_SYNTHETIC가 모두 명시된 시험에서만 합성 미응시를 모델링한다. 실제 #32의 빈 계정 성공으로 표시하지 않는다. 부분/페이지 불명·기간 불명·미확보 baseline·뒤늦게 조회 불가인 기록은 UNKNOWN이다. 낮은 과거 점수 한 건이 전체성을 대신하지 않는다. 모든 합성 영수증은 proofVerified/accountIdentityBound/fullHistoryProven을 false로 유지한다.

## 보존과 무결성

구현은 메모리 registry에 최소 영수증과 도메인 분리 SHA256 pin을 저장한다. 원본 rows/점수·발표일·원본 proof를 영수증에 넣지 않는다. 영수증은 용도/문맥/기간·수집/수락 시각·인공 verifier/profile version·입력/원천 digest·당시 신선도·상태/사유를 포함한다. 새 hash를 계산한 클라이언트 변조도 내부 pin과 다르면 거부한다. **이 hash는 서명이나 발행자 인증이 아니다.** 테스트용 신뢰 인자/메모리를 소유한 호출자가 authority이며 실제 사용자 입력에서 검증 플래그를 받아서는 안 된다.

이후 평가는 수락 시 신선도 기록과 현재 보존 pin·문맥/revision을 검사하며 300초 TTL을 다시 적용하지 않는다. 원천 조회 만료도 자동 미응시나 자동 영수증 폐기 사유가 아니다. 새 자료/정정으로 revision이 바뀌면 이전 결과가 다시 현재가 될 수 없다. 원천 취소·trust epoch 폐기·분쟁 판정은 실제 제품 검토 전 미구현이다.

영구 저장/재시작 복원/서명 영수증/삭제 스케줄은 **설계만 있고 미구현**이다. 새 인스턴스는 외부 영수증을 hash만으로 import하지 않는다. 후속 M3 저장 단위는 서버가 인증한 append-only 수락 기록과 고정 pin, 정책/주체/수령인/용도/revision, 최소 조건 결과, 최초 시험의 비공개 안정 commitment, 신뢰 profile/검증기 버전·당시 신선도와 수집/수락 시각을 원자적으로 보존해야 한다. receipt 무결성/정정·폐기 상태를 복원하지 못하면 UNKNOWN으로 보류한다.

보존 기간은 동의한 신청·평가·이의 기간의 종료 기준과 삭제/백업 예외를 먼저 정해야 한다. 개인정보나 낮은 엔트로피 원문 값의 공개 hash, 원본 성적표/proof의 영구 저장 또는 체인 게시를 허용하지 않는다. 실제 commitment의 비밀키/비공개 저장·접근 제어·삭제 정책과 서명 receipt 신뢰/키 교체는 별도 검토한다. 재평가에 더 많은 원천 facts가 필요하다면 최소성/동의를 다시 검토해야 하며 digest만으로 원본을 복원할 수 있다고 가정하지 않는다.

## 화면 상태와 오류 인계

등록 화면은 정책이 요구할 때만 ‘등록 당시 과거 이력’을 표시하고 고정 기준일/기간·수집 허용 시각·신뢰 상태를 따로 보여준다. 수강 후 성적 화면은 ‘목표 성적 제출’로 별도 단계다. 두 증명 카드에 각각 session/revision·수집/수락 시각·보류 사유를 표시하며 소급 등록이나 baseline→achievement 전환 버튼은 없다.

| 상태/오류 | 화면 처리 |
| --- | --- |
| baseline 미확보 / BASELINE_MISSING | 등록 이력 미확보·보완 필요. 목표 성적 성공과 별개로 보류 |
| COVERAGE_UNKNOWN / EMPTY_UNCONFIRMED | 전체 기간 또는 빈 목록의 의미 미확인. 미응시로 표시하지 않음 |
| ACCOUNT_UNVERIFIED / SOURCE_UNVERIFIED | 주체/원천 미확인. 실명 인증 완료·자격 완료 표시 금지 |
| PUBLICATION_UNKNOWN / PUBLICATION_AFTER_REGISTRATION | 발표 시점 확인/정책 검토 필요. 시험일과 혼동 금지 |
| COLLECTION_WINDOW_CLOSED / ACQUISITION_TIME | 취득/수락 기한 경과 또는 신선도 실패. 임의 재등록/기간 이동 금지 |
| PERIOD_MISMATCH / EXAM_PERIOD / EXAM_TIME | 고정 인정 기간과 불일치. 클라이언트 보정 금지 |
| PURPOSE_MISMATCH / BINDING_MISMATCH / SESSION_BINDING | 현재 신청·정책·용도의 세션인지 확인. 다른 신청 자료 재사용 금지 |
| SESSION_CONSUMED / SESSION_REUSE / SOURCE_REUSE | 중복 수락/증거 재사용. 새 nonce로 자동 우회하지 않음 |
| SESSION_SUPERSEDED / RECEIPT_SUPERSEDED | 새 revision 상태를 사용. 늦은 결과로 덮지 않음 |
| RECEIPT_INTEGRITY / FIRST_ACHIEVEMENT_MISMATCH | 자료 무결성/최초 시험 결합 충돌. 자동 승인 없이 보류 |
| MET_SYNTHETIC | 합성 시험 조건만 충족. 결제/청구 활성화 없음 |

[합성 6개 흐름](../../specs/m0/lifecycle.json)은 정상 2단계, baseline 미확보, 빈 목록, 표 전체지만 범위 미확인, 이력 비필수, 장기 보존 영수증이다. [프런트 인계](FRONTEND_M0_HANDOFF.ko.md)에 따라 Claude Code는 화면/상태/오류 설계에 소비한다. 실제 업로드/지갑 서명/수집 버튼의 제품 연결은 H2/M3 승인과 계약 후속이 필요하다.

## 완료와 후속

H1: 독립 SYNTHETIC 계약·고정 등록 시각·용도/문맥/기간 검증·메모리 단회 수락·영수증 pin·분리 평가 및 합성 테스트 구현. M0 명세에는 추가 schema/예제와 checker를 연결했다. M1/M2/M3 전체 완료가 아니다.

H1 작성 당시 H2 후속 계획(현재 진행/실행 결과는 [H2 접수 문서](HISTORY_INTAKE.ko.md) 우선): #32 코드/암호 가정 검토, 실제 기간/빈 목록/다중 페이지/악성 누락·주체 결합·최소 공개 관문을 먼저 해결한다. 그 뒤 승인된 실제 adapter와 durable receipt/원자 수락·정정/복원을 작은 PR로 진행한다. 현재 실제 로그인·재수집·유료 API·공개 체인 거래/배포는 실행하지 않는다. PR #31/#32 자동 병합도 하지 않는다.
