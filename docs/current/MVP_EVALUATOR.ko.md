# M2 경로·증거·금액 후보 평가

2026-10-15, `clear-mvp-evaluation.1`, 이슈 [#38](https://github.com/gw020328-oss/clear-education-v4/issues/38). 선행 [M1 계약](MVP_POLICY_CONTRACT.ko.md) PR [#43](https://github.com/gw020328-oss/clear-education-v4/pull/43), feature `3961b09cbcb71c028d2dae6be2889a39849ee7c7`. M1은 develop `3781f5831f4482b62a928407ce432a2eaebb7ad8`에 병합되었고 M2는 이 기준 위의 고유 diff다. 기존 M0/H1/H2·HTTP·DB·금고 경로는 보존한다.

## 모듈 소비

`evaluateMvpEligibility(compiled,{context,evidence,selection})`은 순수 합성 평가기다. 소스는 `src/eligibility/mvp/evaluator.mjs`, 입력/출력 schema는 같은 디렉터리 `schema.mjs`다. `specs/m2/examples.mjs`의 `evaluationExample('ybm'/'siwon'/'third')`가 독립 pin·최초 성적·선택·정정 종료를 가진 인공 문맥을 제공한다. 예제의 `repinExample`은 시험 caller의 합성 authority이며 실제 제출·원천 수락 함수가 아니다.

`EvaluationContext`는 신뢰한 호출자가 고정한 application/subject/recipient/instance/policy/product/cohort binding, facts revision, evidenceId/revision/digest, requirement별 source 계정 매핑, examPins, 최초 제출 ref, 최초 제출 시각, 선택 revision과 최종성 기록을 담는다. 공개 요청 payload에 그대로 노출할 서비스 API가 아니다. M1의 필수 Evidence 필드를 바꾸지 않고 시험일·최초 시험 ref는 별도 examPins로 결합한다. 참조에는 가상의 submissionId/revision/examCommitment를 쓰며 실제 성적/수험번호/이름 commitment를 생성하지 않는다.

`validateEvaluationResult`는 소비자용 결과 shape 검사다. 그것만으로 발행자 인증·진위·단회 수락·최초 제출 기록 보존을 입증하지 않는다. 결과/entitlement를 hash만 보고 다른 프로세스·DB에서 수입하는 API가 없다. M3의 인증·영속 pin·정정/폐기·재시작 복원·원자 수락은 별도 관문이다. 실증명 재사용/민감정보·자금 권한을 새로 바꾸는 통합은 Astra/High 별도 검토 대상이며 이번 순수 일반 구현의 합성 검사를 그 검토로 대체하지 않는다.

## 평가 순서와 상태

| 항목 | 처리 |
| --- | --- |
| 정책/주체/source pin | 정책 hash/version/product/cohort, 전체 binding, 독립 sourceAccount/기관/provider/course 매핑, current evidence revision/digest, ruleHash/requirement/unit을 대조. 바꿔치기·중복/불명 ref는 고정 오류로 거부 |
| 취득·수락 | collectedAt≤acceptedAt≤evaluatedAt, 수락 당시 maxAge, 제출/보완 기간. 장기 보존 receipt의 과거 취득 TTL을 현재 시점에 재적용하지 않음 |
| 진위·전체성 | SYNTHETIC mode, 합성 authenticity/subject/semantics, sourceRevision/current를 각각 요구. BASELINE/LEARNING COMPLETE_PERIOD와 정확한 범위 필요. LOCAL_LAB/INSTITUTION은 이 평가기에서 실제 자격으로 통과하지 않음 |
| 없음·조회 실패 | baseline NO_RECORD는 합성 진위/계정/전체성/기간/current가 모두 있을 때만 합성 미응시. UNAVAILABLE/UNKNOWN/부분 목록을 없음/0점으로 바꾸지 않음 |
| 성적 | examPin의 시험일을 인정 반개구간/취득 시각과 대조하고 최초 submissionId/revision/examCommitment와 비교. 다른 시험·다른 성적표/정정 revision의 자동 교체 금지 |
| 일별 집계 | L1이 확인한 최소 BPS·유효 날짜 수를 ruleHash·단위·기간에 결합해 threshold와 days 비교. 부족한 자료를 0으로 만들지 않음. 아직 끝나지 않은 기간은 IN_PROGRESS, 원천 미확인은 UNKNOWN 우선 |
| 후기·블로그 | 일반 REVIEW의 인공 승인 assertion을 조건에 사용할 수 있으나 Vision 관찰값을 승격하는 adapter는 없음. BLOG는 항상 원천 미확인 보류. 400은 PRECHECK_ONLY |

각 RuleResult는 MET/NOT_MET/MISSING/UNKNOWN/NEEDS_SUPPLEMENT/IN_PROGRESS와 관찰 status·사유·evidence revision을 따로 반환한다. ALL은 확인된 NOT_MET이 있으면 미충족, 그렇지 않으면 보류 상태를 보존한다. ANY는 완결된 MET 대안이 있으면 충족하며 불필요한 다른 경로 자료를 요구하지 않는다. 모든 대안이 확인된 NOT_MET일 때만 OR 미충족이다. 하나라도 불명이면 임의 실패로 바꾸지 않는다. 개별 규칙의 모든 보류 사유는 결과에 남는다.

## 후보·선택·최종성

tier별 조건 상태, 대안별 결과, 산술 quote, 선택과 최종성은 분리한다. quote는 조건 미충족 때도 산술 견적으로 표시할 수 있다. 공식 선택 규칙 OPEN/선택 없음/미확인 선택은 정산하지 않는다. 합성 `EXPLICIT_SINGLE_TIER_NO_TOPUP`만 명시 선택을 인정하며 max/합산하지 않는다. 더 높은 tier가 UNKNOWN/MISSING/보완/진행 중이거나 400 사전검토 가능성이 남으면 하위 tier를 확정하지 않는다. 400은 선택해도 PRECHECK_ONLY, entitlement=null이며 500은 첫 프로필에서 거부한다.

정정 종료 전 조건·금액 충족은 CANDIDATE_SYNTHETIC이다. 최초 제출은 evidenceFrom 이상 evidenceUntil 미만, 보완 수락은 supplementUntil 미만이어야 한다. 합성 FINALIZED 기록은 supplementUntil 이상·finalizeUntil 미만에서만 평가하며 facts/selection revision을 정확히 대조한다. 최초 제출이 없거나 기한 뒤 신규 제출·정정/선택 revision 불일치·늦은 확정·AMOUNT_OPEN은 보류한다. 이미 확정된 제품 권리를 취소/덮거나 과거 결정을 현재 시계로 복원하는 영속 ledger 구현은 아니다.

FINAL_SYNTHETIC의 고정 후보 entitlement는 binding·policy·선택 tier/revision·facts revision·evidence set·전체 context(시험일/최초 제출/원천 매핑/시각/최종성 포함)·금액 규칙/정확한 atoms를 domain hash에 결합한다. 입력을 수정/동결하지 않고 결과만 deep-freeze한다. `allocationImplemented=false`, `claimAuthority=false`, `paymentAllowed=false`다. 실제 금고·PR #36 TEST 계약에 자동 전달하지 않는다.

모든 평가 결과는 proofVerified=false, productEligible=false, paymentAllowed=false, grant/outbox=HOLD, independentClaim=NO_GO다. 합성 최종 후보와 실제 원천 자격·승인·지급 권리를 구분한다.

## 검증과 소비자 후속

`./tools/npm run test:mvp-policy`: M1 10개+M2 17개, 총 27개 통과. M0의 19개 조건/금액 벡터를 실행 평가와 대조하며 불가능한 음수/상한 산술은 컴파일에서 먼저 거부한다. 새 평가는 출석 OR 성적/이력, 경계 점수, 여러 미확인 조합, 400/500, 바꿔치기·최초 시험·기간 끝·금액/정정 상태·입력 불변·context hash를 검사한다. `./tools/node specs/m2/demo.mjs`는 두 프로필 정상/이력 UNKNOWN/400 사전검토와 제3 프로필을 합성으로 출력한다. 기존 정책 112개, 학습 131개 및 M0/workspace 보존 검사를 통과했다. 원격 CI는 PR의 최종 head 결과를 따른다.

AI/Vision·Moodle에는 M1 최소 feature commit과 소유 경계·예제·착수 신호를 전달했다. AI의 세부 review plan/planDigest는 아직 policyHash에 포함된 실행 규칙이 아니며 별도 합성 사전검토 wrapper로만 소비한다. 세부 문서 필수항목의 정본 hash 결합은 소비자 적합성 OPEN이다. Moodle L1의 OBSERVED BPS/days 및 UNKNOWN/IN_PROGRESS의 null 조합은 schema 의미와 맞지만 실제 소비 bridge/원천 검증 완료를 뜻하지 않는다. 두 소비자의 후속 PR과 공통 통합 검증을 별도로 확인한다. 준비/소비자 PR의 자동 병합은 하지 않는다.

예치 비율·공용 풀·배정 순서·충전/회수/추가 보장은 멘토 미결로 남긴다. 기존 금고·DB·체인·키, 실제 Moodle/원천 차단, 400% 자동 자격·지급 금지, 500% 제외, grant/outbox 보류, 독립 청구 NO-GO와 Mac 실패 원인 미확정을 유지한다.

소비자 bridge 피드백으로 현재 기간의 FUTURE_DAYS가 관찰 UNKNOWN/MISSING/NEEDS_SUPPLEMENT를 가리는 우선순위를 보정했다. 원천/진위·전체성 차단을 먼저 확인하고, 누락·미확인 관찰을 보존한 뒤 OBSERVED 자료에만 현재 기간 IN_PROGRESS를 적용한다. 신규 회귀는 제3 프로필의 다섯 상태를 재현한다. 지급 gate는 보정 전후 모두 false다.

최종 리뷰 보정: 전체 기간 증거는 기간 종료 시점 이후에 수집해야 한다. 진행 중 학습 관찰은 IN_PROGRESS일 수 있지만, 종료 전 snapshot을 그대로 둔 채 평가 시각만 뒤로 옮기면 COVERAGE_UNKNOWN으로 보류한다. 과거 이력의 NO_RECORD도 기간 끝 이전 수집으로는 확정하지 않는다. 같은 시험/이력 Evidence의 여러 OBSERVED 점수 규칙이 서로 다른 값을 가지면 MVP_SCORE_CONFLICT로 거부한다. 두 회귀를 추가해 M1 10개+M2 17개, 총 27개가 통과했다. 예제의 완료 학습 snapshot도 기간 종료 후 취득·수락으로 보정했다.

최종 소비 대조: Moodle #48 `441d71b`의 fixture/일별 core/bridge를 별도 임시 시험 구성에서 M2 보정 `413bfaa`와 연결해 6개 PASS를 직접 확인했다. 실제 Moodle API·제품 수락 검증은 아니다. AI #47 `d46d612`의 DocumentPrecheck는 별도 planHash·UNVERIFIED·자동 자격 false를 유지하고 Evidence로 변환하지 않는다. reviewPlan→policyHash 결합과 실제 원천/소비자 통합은 계속 OPEN이다.
