# 개발 현황

## 2026-10-23 시험 클라이언트·원천 실패 현황

원격 확인 **2026-10-23 11:17 KST**. develop은 [7609921](https://github.com/gw020328-oss/clear-education-v4/commit/7609921095b0144b70181fe12e0fcd826f88b36c), main은 [99221a5](https://github.com/gw020328-oss/clear-education-v4/commit/99221a521b7496e78c4c1f16febe2e74a92b97a5)다. 10월 21일 문서 PR #105/#104 이후 두 기준 브랜치의 새 기능 병합은 없다. 아래는 공개 PR·보고서의 저장된 결과이며 이번 자동화에서 실행한 결과가 아니다.

[#103](https://github.com/gw020328-oss/clear-education-v4/pull/103)은 10월 22일 [3321891](https://github.com/gw020328-oss/clear-education-v4/commit/33218918c785288c6ab78358737503c97d47ef99)로 **codex/bootcamp-e5-api-bridge 작업 브랜치에만 병합**됐다. develop/main 병합이 아니다. [고정 head의 원천 검토](https://github.com/gw020328-oss/clear-education-v4/blob/e658b4026b44f800b607d2d7db64e14f3fd81666/docs/hackerrank/WORKER_SOURCE_REVIEW.ko.md)는 hackerrank-two-proof.3의 같은 TLS 응답 구조를 신뢰하는 CLEAR worker가 검사하고 최소 공개 필드를 공증 서명이 검증하는 책임을 구분한다. independentStructureProof=false이며 숨긴 JSON 전체 구조의 독립 증명이나 실제 새 proof·수락 성공을 뜻하지 않는다. 저장된 135/135는 합성 로컬 검증이고 실제 로그인/새 proof/API 수락/registry 조회/AI/체인/지급은 해당 PR에서 0건이다.

[#78](https://github.com/gw020328-oss/clear-education-v4/pull/78)·[#102](https://github.com/gw020328-oss/clear-education-v4/pull/102)의 [backend 시험 클라이언트 보고](https://github.com/gw020328-oss/clear-education-v4/blob/85212551fd8e86b22b2c0c0b3525100e9579f2f7/docs/current/BOOTCAMP_BACKEND_TEST_CLIENT.ko.md)에는 제품 web/·프론트 PR #60과 별개인 최소 정적 시험 페이지와 두 외부 테스트 지갑의 명시적 인증·원천 메시지 서명·동의·receipt 조회 준비가 추가됐다. **develop 작업 브랜치 기준, main 미반영이며 develop에도 아직 미병합**이다. 제품 프론트 완료·배포·실제 통합 시험 성공으로 설명하지 않는다.

공개 보고서의 실제 r2 실행은 두 역할 SIWE·신청 결합 뒤 원천 요청 단계에서 COLLECTION_FAILED로 종료됐다. 원천 요청·증거·이벤트 0건으로, 원천 서명·AI 호출·TEST 지급에 도달하지 않았다. 실제 하위 예외는 미보존이다. 동일 구성의 합성 재현에서 SQLite 트랜잭션 중첩 진입과 체크섬/소문자 지갑 비교 결함을 재현했고, source 후보 34d3661을 새 v11 intake에 명시 인수했다. [v11 검증 기록](https://github.com/gw020328-oss/clear-education-v4/blob/85212551fd8e86b22b2c0c0b3525100e9579f2f7/docs/current/BOOTCAMP_V11_VERIFICATION.json)은 기존 core159개 중 live-context.mjs 한 파일 변경, 정적 브라우저 5개 자산 불변, 이전 intake/guard·r2 기록 보존을 보고한다. 원천 세션 회귀21/21·지문 변조/보존35/35·자산 연결2/2는 각각 별도 검사다. **수정 후 실제 재시험·새 로그인·새 원천 lease·유료 AI 호출은 없으며** 기존 source 만료·서명·지급 정책도 연장/변경하지 않았다. 과거 합성 원천 run3의 100 TEST 성공을 이 실제 시험의 성공으로 재사용하지 않는다.

### 이번에 변경된 PR의 정확한 head CI

| PR / 상태 | 확인 head SHA | 완료 SUCCESS / 표시 검사 | 실행 근거 |
| --- | --- | --- | --- |
| [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78) / OPEN | cd9b80cbf3c44fe15d0bc3944bbb80e2a699fae5 | 9/9 | [run 39822069109](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822069109) · [run 39822069143](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822069143) · [run 39822069112](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822069112) · [run 39822069114](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822069114) · [run 39822520961](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822520961) |
| [#102](https://github.com/gw020328-oss/clear-education-v4/pull/102) / OPEN | 85212551fd8e86b22b2c0c0b3525100e9579f2f7 | 9/9 | [run 39821952947](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39821952947) · [run 39821952769](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39821952769) · [run 39821952848](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39821952848) · [run 39821952710](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39821952710) · [run 39822185212](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39822185212) |
| [#103](https://github.com/gw020328-oss/clear-education-v4/pull/103) / MERGED | e658b4026b44f800b607d2d7db64e14f3fd81666 | 3/4 | [run 39773494117](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39773494117) · [run 39773487345](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39773487345) |

#103의 Public synthetic tests는 FAILURE(STAGE_SOURCE_PIN)이며 전체 성공으로 처리하지 않는다. #78/#102의 새 head는 각각 표시 검사9개가 모두 SUCCESS지만, 본문의 과거 head944afaf 18/18을 최신 head 결과로 재사용하지 않는다. 검사 개수는 테스트 사례 수가 아니며 후속 head 성공이 #103 당시 실패를 소급 성공으로 바꾸지 않는다. 이 자동화는 기능/CI를 수정하거나 해당 기능 PR을 병합하지 않았다.

이전 날짜별 열린 PR·준비·미실행 표기는 당시 기록이다. 현재 상태는 이 절을 우선한다. 실제 자료 전체 연결·새 증명·100 TEST 수령의 전체 시연과 제품 인수는 여전히 미완료이며, 기존 합성/실제 AI 평가·Mac 원인 미확정 기록은 보존한다. 이번 작업은 공개 근거만 대조했고 새 로그인·원문/키 접근·유료 호출·서명·거래·배포를 하지 않았다.

## 2026-10-21 미병합 연결·평가 현황

원격 확인 **2026-10-21 11:04 KST**. develop은 [028e69e](https://github.com/gw020328-oss/clear-education-v4/commit/028e69ed8af878bfdef741d58f6ac32c8be3baf2), main은 [84e0d51](https://github.com/gw020328-oss/clear-education-v4/commit/84e0d51685c5c6f29b5d3ba10f39009032748a26)다. 마지막 문서 병합 이후 새 기능 병합은 없다. 아래는 열린 PR과 공개 보고서의 저장된 결과이며 이번 자동화의 재실행 결과가 아니다. 모든 신규 구현은 **develop 작업 브랜치 기준, develop/main 미병합**이다.

- **TEST 지급 실험:** [#93](https://github.com/gw020328-oss/clear-education-v4/pull/93)의 새 memory EVM, [#95](https://github.com/gw020328-oss/clear-education-v4/pull/95)의 소유 Geth·canonical reader/영속 envelope, [#100](https://github.com/gw020328-oss/clear-education-v4/pull/100)의 제한된 B 포트, [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78)·[#102](https://github.com/gw020328-oss/clear-education-v4/pull/102)의 API 연결이 단계별로 보고됐다. [정상 경로 보고](https://github.com/gw020328-oss/clear-education-v4/blob/6962c1394b82aac633a686e1d197475d1803aacb/docs/bootcamp-execution/E5B_NORMAL_PATH.ko.md)의 저장된 run3는 **합성 원천**으로 같은 신청·100 TEST 전액 배정·양측 동의·accept/claim·canonical receipt·정확 100000000 atoms 수령·중복 거부를 확인했다. 실제 로컬 격리 체인 실행이지만 실제 학습/원천 자격·실자금·공개 체인 지급 성공은 아니다. 성공 run3를 재실행하지 않았다.
- **AI 평가:** [#94](https://github.com/gw020328-oss/clear-education-v4/pull/94)는 Free Tier 준비 기록이고, [#96](https://github.com/gw020328-oss/clear-education-v4/pull/96)·[#97](https://github.com/gw020328-oss/clear-education-v4/pull/97)의 유료 v1/v2는 각 첫 호출 후 중단·채점 미완료 기록이다. 후속 [#98](https://github.com/gw020328-oss/clear-education-v4/pull/98)의 [v3 실제 평가 보고](https://github.com/gw020328-oss/clear-education-v4/blob/a70183d0ccde07bf8b6473d806ae8dbf39918d07/docs/ai-vision/REVIEW_PRECHECK_E6_WIRE_V3_ACTUAL_20261019.ko.md)는 공개 합성 Python 8건에 실제 생성 8회·HTTP2xx 8회, **7 PASS·1 NEEDS_IMPROVEMENT(PY05)**, topic 상태 23/24·기대 PRESENT 근거 21/21을 기록했다. 실행 코드 636817f와 결과 기록 a70183d를 구분한다. 이는 독립 holdout·실제 학생 자료·일반 정확도·지급 자격 입증이 아니다. 이전 중단/과거 평가 횟수와 합산하지 않으며 개별 thinking 누락과 invoice 미확인을 보존한다.
- **실제 원천 연결의 남은 공백:** [#87](https://github.com/gw020328-oss/clear-education-v4/pull/87)은 생성된 합성 계정의 실제 로컬 Moodle 읽기와 consumer 인계를 진행했다. [#101](https://github.com/gw020328-oss/clear-education-v4/pull/101)·[#102](https://github.com/gw020328-oss/clear-education-v4/pull/102)는 같은 request/source의 회고 packet 준비와 정확 승인 후 단회 실행을 분리했다. 새 정확 packet 승인 없이 모델 호출을 허용하는 변경이 아니다. [#103](https://github.com/gw020328-oss/clear-education-v4/pull/103)의 [HackerRank 원천 검토](https://github.com/gw020328-oss/clear-education-v4/blob/043abb4f1bcc396a2fb631c80c94bc71576c7381/docs/hackerrank/SOURCE_EXTRACTION_REVIEW.ko.md)는 실제 중첩 응답용 제품 recipe·hosted trust·새 request-bound proof pair가 남았고 pending trust는 UNCONFIGURED/API HOLD임을 명시한다. #103 base는 develop이 아닌 #102 작업 브랜치다. 실제 Moodle·HR·AI 전체 연결부터 100 TEST 수령까지의 시연은 미완료다.
- **Mac 실패 보존:** [#89](https://github.com/gw020328-oss/clear-education-v4/pull/89)의 새 head는 표시된 CI 6/6 SUCCESS로 바뀌었으나 이전 push Mac 실패를 소급 성공으로 바꾸지 않는다. [#98](https://github.com/gw020328-oss/clear-education-v4/pull/98) 실행 head의 최초 STALE_RECOVERY:EPERM 실패 및 부적절한 재실행 기록, [#99](https://github.com/gw020328-oss/clear-education-v4/pull/99)의 제한된 진단/제어 반례와 로컬 exit137 원인 미확정도 유지한다. 새 head의 CI 성공은 과거 실패 원인 해결의 증거가 아니다.

### 정확한 최신 head의 표시된 CI

아래는 확인 시점 GitHub PR/push check rollup이다. 검사 개수는 테스트 사례 수가 아니다. 공유 head의 #78/#102는 같은 16개 검사를 각각 표시하므로 서로 합산하지 않는다. CI가 각 전문 로컬/실제 원천 시험을 모두 실행했다는 뜻도 아니다.

| PR | head SHA | 완료 SUCCESS / 표시 검사 | 실행 근거 |
| --- | --- | --- | --- |
| [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78) | 6962c1394b82aac633a686e1d197475d1803aacb | 16/16 | [run 39404426285](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426285) · [run 39404427481](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404427481) · [run 39404426274](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426274) · [run 39404426750](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426750) · [run 39404426344](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426344) · [run 39404426772](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426772) · [run 39404420829](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404420829) · [run 39404423557](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404423557) |
| [#87](https://github.com/gw020328-oss/clear-education-v4/pull/87) | 364871ea139daed385f8c0ccd7033d03b8f24928 | 6/6 | [run 39401948532](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39401948532) · [run 39401942286](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39401942286) |
| [#89](https://github.com/gw020328-oss/clear-education-v4/pull/89) | c3b71c710f558529680e255222857f0e81fe1dcb | 6/6 | [run 39188332272](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39188332272) · [run 39188329405](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39188329405) |
| [#93](https://github.com/gw020328-oss/clear-education-v4/pull/93) | 17dca2eea07f50e4e15c3dc11f8b57169c7d3f9b | 6/6 | [run 39195667286](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39195667286) · [run 39195665213](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39195665213) |
| [#94](https://github.com/gw020328-oss/clear-education-v4/pull/94) | 74db9d1b4cf92aefda2d1b0d3a7588b7fe149e0c | 6/6 | [run 39199121268](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39199121268) · [run 39199117192](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39199117192) |
| [#95](https://github.com/gw020328-oss/clear-education-v4/pull/95) | 0e6d4225e5b645e57e3988dc426937b08069ead8 | 8/8 | [run 39217025497](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39217025497) · [run 39217020516](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39217020516) · [run 39217025519](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39217025519) · [run 39217020520](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39217020520) |
| [#96](https://github.com/gw020328-oss/clear-education-v4/pull/96) | 92d48daf5b3989ccced070177eae652d1347e211 | 6/6 | [run 39203112277](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39203112277) · [run 39203108887](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39203108887) |
| [#97](https://github.com/gw020328-oss/clear-education-v4/pull/97) | 6d084a9f93dbd1f4a015c2a6badb62ba70ee83ee | 6/6 | [run 39216795980](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39216795980) · [run 39216791076](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39216791076) |
| [#98](https://github.com/gw020328-oss/clear-education-v4/pull/98) | a70183d0ccde07bf8b6473d806ae8dbf39918d07 | 6/6 | [run 39223904324](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39223904324) · [run 39223899314](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39223899314) |
| [#99](https://github.com/gw020328-oss/clear-education-v4/pull/99) | f4f9994e3add8b0054ad493a6db095b5e243d6f4 | 6/6 | [run 39222272987](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39222272987) · [run 39222245822](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39222245822) |
| [#100](https://github.com/gw020328-oss/clear-education-v4/pull/100) | a4a05c7aa6a1614760273e78edb5ba6ccb556232 | 9/9 | [run 39226115657](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226115657) · [run 39226107105](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226107105) · [run 39226115619](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226115619) · [run 39226115632](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226115632) · [run 39226107045](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39226107045) |
| [#101](https://github.com/gw020328-oss/clear-education-v4/pull/101) | eaba9c0b6293b8904f75e218db0b60c7d429bf02 | 6/6 | [run 39401956172](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39401956172) · [run 39401950712](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39401950712) |
| [#102](https://github.com/gw020328-oss/clear-education-v4/pull/102) | 6962c1394b82aac633a686e1d197475d1803aacb | 16/16 | [run 39404426285](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426285) · [run 39404427481](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404427481) · [run 39404426274](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426274) · [run 39404426750](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426750) · [run 39404426344](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426344) · [run 39404426772](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404426772) · [run 39404420829](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404420829) · [run 39404423557](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39404423557) |
| [#103](https://github.com/gw020328-oss/clear-education-v4/pull/103) | 043abb4f1bcc396a2fb631c80c94bc71576c7381 | 4/4 | [run 39444463889](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39444463889) · [run 39444455554](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39444455554) |

이전 날짜별 미실행·Draft·실패·열린 PR 표는 해당 시점 기록이다. 최신 원격 사실은 이 절을 우선한다. 다른 작성자의 기능/stacked PR은 문서 전용 PR으로 취급하거나 이 자동화에서 병합하지 않는다. 이번에는 공개 문서·CI만 대조했으며 실제 로그인·원문·키·새 모델 호출·서명·체인 거래·배포는 수행하지 않았다.

## 2026-10-19 미병합 준비·CI 현황

원격 확인 **2026-10-19 11:02 KST**. develop은 [97d5024](https://github.com/gw020328-oss/clear-education-v4/commit/97d5024ebb1a8371ae8a996cf76624af9e067269)(문서 PR #82), main은 [8f50a53](https://github.com/gw020328-oss/clear-education-v4/commit/8f50a531d7f04c311f9929fcce36bbf53c64a518)(문서 PR #83)이다. 어제 이후 새 기능 병합은 없다. 아래는 각 열린 PR 설명·공개 검증이 보고한 범위이며 현재 develop/main 기능이나 운영 인수 완료가 아니다.

| 열린 PR | 새로 확인한 준비/작업 | 활성화와 미검증의 구분 |
| --- | --- | --- |
| [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78), [#84](https://github.com/gw020328-oss/clear-education-v4/pull/84) | E0 TEST 운영 profile·E0~E7 인수 계획, E1 고정 producer 연결과 원문/session/current 무효화 합성 경계 | TEST profile/별도 namespace의 미병합 의존 이력. 운영 source·서명·지급 인수와 구분 |
| [#85](https://github.com/gw020328-oss/clear-education-v4/pull/85) | 고정 review/source window에 결합한 unsigned TEST v3 | 성공도 unsigned 사전 검사. usableForIssuance/paymentAllowed=false, 실제 signer/현재 체인·지급 권한 아님 |
| [#86](https://github.com/gw020328-oss/clear-education-v4/pull/86) | E6 Python 회고 자료·기본 차단 평가 실행기/횟수·예약 guard 준비 | 실제 모델 실행 0, 승인/endpoint 비용·출력 상한 근거 미해소. 과거 일반 후기 승인을 재사용하지 않으며 Python 품질은 N/A |
| [#87](https://github.com/gw020328-oss/clear-education-v4/pull/87) | 새 격리 Moodle fixture·stop/start 재수집 기록·비동기 raw getter 준비 | 보고 시점 환경 보존과 token/raw lease 상태를 구분. E1 민감 경계·전체 조건·AI·제품 runtime ready·지급 인수 아님. 이번 문서 작업은 로컬 환경에 접속하지 않음 |
| [#88](https://github.com/gw020328-oss/clear-education-v4/pull/88) | E4 TEST 의무/예약·원자 target 교체·종료의 비지급 준비 계약 | payoutEnabled=false, accept/claim 활성화 없음. 선행 E3 인수와 후속 실행 계약은 별도 |
| [#89](https://github.com/gw020328-oss/clear-education-v4/pull/89) | E3 검토 절차·두 역할 DTO·E4 인계, 고정 cap/재검증·이의 경계 | stacked Draft·미병합. push Mac 실패가 있어 전체 CI 성공으로 표시하지 않음 |
| [#90](https://github.com/gw020328-oss/clear-education-v4/pull/90) | Mac hard-kill trial별 supervisor·소유 프로세스/삭제 순서 시험 보강 | 시험 전용 변경이며 제품 복구 코드 수정·과거 timeout 단일 원인 입증 아님. legacy 합산 60초에서 회당 60초로 예산 단위가 달라진 점도 구분 |

### 정확한 최신 head의 원격 CI

| PR / head | PR·push 실행 | 확인 결과 |
| --- | --- | --- |
| [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78) `040e31107d97c98a9a5fe588153aa828039f9519` | [실행 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39139721068) / [실행 2](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39139716600) | 6/6 SUCCESS; 미병합 |
| [#84](https://github.com/gw020328-oss/clear-education-v4/pull/84) `6b4b0cf2d847937aebc6da69f9e7df62e926fa50` | [실행 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39136605335) / [실행 2](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39136594968) | 6/6 SUCCESS; 미병합 |
| [#85](https://github.com/gw020328-oss/clear-education-v4/pull/85) `d9407b06b8a13122a489193119c1899929f83fe4` | [실행 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39137293165) / [실행 2](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39137290110) | 6/6 SUCCESS; 미병합 |
| [#86](https://github.com/gw020328-oss/clear-education-v4/pull/86) `e9ea4547d795ee833a8175c02c0cc23b21a7d823` | [실행 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39141738504) / [실행 2](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39141734345) | 6/6 SUCCESS; 미병합 |
| [#87](https://github.com/gw020328-oss/clear-education-v4/pull/87) `22640db091d5d3ac5d8a3535280b393d6f618d65` | [실행 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39138081645) / [실행 2](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39138073059) | 6/6 SUCCESS; 미병합 |
| [#88](https://github.com/gw020328-oss/clear-education-v4/pull/88) `d287b3789a678a1e6984b583e4c85859e9e97a22` | [실행 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39141692233) / [실행 2](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39141689785) | 6/6 SUCCESS; 미병합 |
| [#89](https://github.com/gw020328-oss/clear-education-v4/pull/89) `fb9e6d3a9f35c8d12b80f0c84e01d8a6db9aeda1` | [실행 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142236991) / [실행 2](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142228451) | 5/6 SUCCESS; push Mac FAILURE, PR Mac SUCCESS; 미병합 |
| [#90](https://github.com/gw020328-oss/clear-education-v4/pull/90) `41354e0283709f74dd64a9dc6435703c804853c6` | [실행 1](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39187720556) / [실행 2](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39187717033) | 6/6 SUCCESS; 미병합 |

각 성공 6건은 PR/push의 Public content history·Public synthetic tests·Mac synthetic recovery다. [PR #89 push 실패](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142228451)와 [PR #90 후속 성공](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39187720556)은 서로 다른 head/시험이며 실패를 재실행 통과나 원인 해결로 대체하지 않는다. PR #90 본문의 원격 진행 중 표시는 작성 당시 기록이고 위 표는 이번 조회 상태다. root CI 성공만으로 각 전용 로컬 시험 전부의 coverage나 실제 source·모델·지급 성공을 주장하지 않는다.

이 PR들은 선행 미병합 기능 이력을 포함할 수 있으며 이 문서 자동화에서 수정·병합하지 않는다. 기존 #60·#66·#69~#75·#79~#81도 미병합이다. 새 TEST 운영 profile과 기존 제품/실험의 정책을 섞지 않고, 실제 원천·동일인·민감자료/모델 승인·발급/지급·독립 청구의 미해소 관문은 각 버전의 공개 근거를 따른다. 새 로그인·원문 수집·유료 모델·서명/거래를 실행하지 않았고, 저장된 시험 수를 서로 합산하지 않는다.


## 2026-10-18 미병합 작업 현황

원격 확인 **2026-10-18 12:11 KST**. develop은 [`9c542c3`](https://github.com/gw020328-oss/clear-education-v4/commit/9c542c38892d0a5d5e71fcbe4f87f1017d8fe843)(문서 PR #76), main은 [`72fe051`](https://github.com/gw020328-oss/clear-education-v4/commit/72fe051c1aad6b99def4d864cd2e3841308e857c)(문서 PR #77)이다. 어제 확인 이후 새 기능 병합은 없다. 아래는 열린 PR의 제안/작업이며 현재 develop/main 기능·최종 정책·배포 완료가 아니다.

| 열린 PR | 공개된 작업 범위 | 미검증·차단 |
| --- | --- | --- |
| [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78) | Python 부트캠프 P0와 versioned addendum·후속 백로그, oracle/재원·화면·가스·계측 경계 제안 | 기존 동결/새 revision을 구분. 새 signer·allocation ledger·worker·운영 지급 구현 완료가 아님 |
| [#79](https://github.com/gw020328-oss/clear-education-v4/pull/79) | 참가자 request와 HackerRank 보유형 인증을 결합하는 오프라인 producer | 기본 UNCONFIGURED_BLOCKED. 새 실제 개인/공식 hosted proof 0, 실제 grammar·trust·collector 수명·원자 제품 수락은 미검증 |
| [#80](https://github.com/gw020328-oss/clear-education-v4/pull/80) | 별도 bootcamp ledger의 합성 증거 수락·nonce/current·멱등/재시작·무효화 | 기본 DISABLED/SYNTHETIC_FIXTURE, realAcceptanceReady=false. 100 TEST는 후보 금액이며 실제 source 연결·권한 발급·재원/지급 완료가 아님 |
| [#81](https://github.com/gw020328-oss/clear-education-v4/pull/81) | 지급 권한의 취소/회전·확정 후 권리·공용 풀·relayer 경계 설계 리뷰 | 최종 ABI/encoding·accept/revoke 경합·풀 회계/예약 귀속의 결정 관문이 남음. 새 권한 키·지급 서명·거래 구현 아님 |

#79/#80/#81의 develop diff에는 미병합 선행 #74/#78 등의 의존 이력이 포함된다. PR 제목이나 고유 커밋의 문서 변경만 보고 문서 전용 PR로 판단하지 않는다. 이 자동화는 이 PR들을 수정하거나 병합하지 않는다. source/identity·grant/outbox HOLD, paymentAllowed/productionEnabled=false·독립 청구 NO_GO 등 각 작업의 차단을 해제하지 않는다.

[Moodle #71](https://github.com/gw020328-oss/clear-education-v4/pull/71) head `488a09ce8af62aad2067680dbb459eb0358f452e`는 새 합성 계정/강좌의 격리 fixture와 활동·과제·회고 출처를 다룬다. 실험 fixture는 제품 runtime mapping ready나 실제 기관/최종 AND·지급의 증거가 아니다. [AI #72](https://github.com/gw020328-oss/clear-education-v4/pull/72) head `f98e1040c01034b59fba7f1d5fe1c230965d628a`는 Python 회고 세 항목 원문 근거의 MOCK 검토이며 실제 Python 회고 모델 품질 성공이 아니다. PR #72는 담당 전용 로컬 시험과 기존 root CI coverage를 구분해야 한다. 두 PR 모두 미병합이다.

### 정확한 열린 head의 CI

| PR / head | PR CI / push CI | 확인 상태 |
| --- | --- | --- |
| [#78](https://github.com/gw020328-oss/clear-education-v4/pull/78) `733fe693f4fd2e16977b0c52ef88e35ee9687f2c` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39002878174) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39002875162) | 세 검사 양쪽 SUCCESS; 미병합 |
| [#79](https://github.com/gw020328-oss/clear-education-v4/pull/79) `0da3abe89e2361ac75c19a331e7910afa7ecc70a` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39000201167) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39000192081) | 세 검사 양쪽 SUCCESS; 미병합 |
| [#80](https://github.com/gw020328-oss/clear-education-v4/pull/80) `66893eab4bdafc574147ebee497e3f5a9edafb08` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39000849334) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39000840775) | 세 검사 양쪽 SUCCESS; 미병합 |
| [#81](https://github.com/gw020328-oss/clear-education-v4/pull/81) `c9c0ee069e01407eccca66022326136cf5dbe35f` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39002754526) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39002746624) | 세 검사 양쪽 SUCCESS; 미병합 |

세 검사는 Public content history, Public synthetic tests, Mac synthetic recovery다. CI 성공은 해당 workflow의 공개/합성 검사 성공이며 PR의 모든 신규 로컬 시험 포함·실제 원천/모델/지급·병합 완료를 뜻하지 않는다. 저장된 로컬/실제 실험 결과를 이번 문서 확인에서 재실행하지 않았으며 시험 수를 합산하지 않는다.

기존 미병합 #60·#66·#69·#70·#73·#74·#75와 아래 2026-10-17의 구현 범위·한계는 유지한다. 최신 제안과 현재 병합된 C1~C3 구현을 구분한다.


## 2026-10-17 원격 확인

확인 시각 **2026-10-17 11:08 KST**. develop은 [4756589659a40c8f8fe45452a698b8a56487628c](https://github.com/gw020328-oss/clear-education-v4/commit/4756589659a40c8f8fe45452a698b8a56487628c)(PR #67 병합), main은 `58261aa2465bfc4b34d181dde2757add6eec7283`(PR #50 문서 병합)이다. 아래 추가 구현은 develop 기준이며 main 기능 코드·배포 완료가 아니다. 시험·실제 API 결과는 저장된 공개 보고서를 대조했으며 이번 문서 작업의 재실행이 아니다.

| develop 병합 PR | 확인한 추가 범위 | 미완료·구분 |
| --- | --- | --- |
| [#41](https://github.com/gw020328-oss/clear-education-v4/pull/41)~[#48](https://github.com/gw020328-oss/clear-education-v4/pull/48), [#51](https://github.com/gw020328-oss/clear-education-v4/pull/51) | M1 정책 계약·M2 증거/후보 평가·L1 합성 학습 평가·AI/Vision 준비/정책 결합 | 단계별 합성 구현이며 공식 원천 자격·제품 지급 성공이 아님 |
| [#52](https://github.com/gw020328-oss/clear-education-v4/pull/52), [#56](https://github.com/gw020328-oss/clear-education-v4/pull/56) | [격리 Moodle API/재생](moodle/LOCAL_API_LAB.ko.md), [1502 재시험](moodle/RETEST_1502.ko.md): 새 합성 계정·강좌를 실제 로컬 Moodle/브라우저/API로 검사한 저장 결과 21/21 PASS | LOCAL_LMS_RECORD/LOCAL_LAB이며 실제 학원·장기 이력·집중·최종 자격·지급 검증이 아님 |
| [#47](https://github.com/gw020328-oss/clear-education-v4/pull/47), [#54](https://github.com/gw020328-oss/clear-education-v4/pull/54), [#57](https://github.com/gw020328-oss/clear-education-v4/pull/57) | [Gemini 재평가](ai-vision/GEMINI_RECOVERY_EVALUATION.ko.md), [공통 workflow adapter](ai-vision/WORKFLOW_ADAPTERS.ko.md): 합성 자료의 실제 API 생성 5회/3사례, v4 작은 비교 3/3; 원문/문서 mock adapter 연결 | 실제 학생 서류·진위·저자·전체 이력 성능이 아님. 새 유료 호출·기존 승인 재사용 없음 |
| [#58](https://github.com/gw020328-oss/clear-education-v4/pull/58), [#59](https://github.com/gw020328-oss/clear-education-v4/pull/59), [#61](https://github.com/gw020328-oss/clear-education-v4/pull/61), [#63](https://github.com/gw020328-oss/clear-education-v4/pull/63), [#67](https://github.com/gw020328-oss/clear-education-v4/pull/67) | [HTTP 인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md), [C3 합성 증거·평가 계약](current/MVP_EVIDENCE_HTTP_CONTRACT.ko.md): 원문 archive/검토, C1 학생 신청/합성 표시 확인, C2 합성 bytes 접수/검토, C3 고정 fixture 수락→M2 결과 영속화·GET/재시작 복구 | 새 namespace/독립 DB의 합성 흐름. 실제 동의·C2 receipt의 C3 실연결·운영 원천/신원·개인자료·재원/지급·팀원 web 연결 미완료 |
| [#53](https://github.com/gw020328-oss/clear-education-v4/pull/53) | Mac 합성 쿠키 검사를 초기 탭 탐색 경합에서 분리 | 해당 보정/CI 성공과 과거 모든 timeout 원인 해결을 동일시하지 않음 |

[최신 C3 공개 검증](current/mvp-evidence-http-verification.json)은 `evidenceAcceptanceReady=false`, `realDataAllowed=false`, `c2ReceiptImport=false`를 유지한다. source/identity HOLD, grant/outbox HOLD, 독립 청구 NO_GO, 지급 불가, 400% 사전검토 전용·500% 제외를 유지한다. 등록 이력 실제 표 증명과 합성 TEST 지급은 별도 기록이며 전체 제품 자격·지급·타 사용자 시험으로 승격하지 않는다. 각 단계 시험 수는 합산하지 않는다.

### 병합 head와 CI의 구분

| PR / 정확한 최종 head | PR CI / push CI | 확인 결과 |
| --- | --- | --- |
| #67 `973ac05e56a89e8c76728f6b490cefbcf40a7a39` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38751820489) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38751808131) | Public content history·Public synthetic tests·Mac synthetic recovery 양쪽 모두 SUCCESS |
| #63 `230a951e0e22babc3c1e751e52bba196e41aefba` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38733410892) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38733401299) | 세 검사 양쪽 모두 SUCCESS |
| #61 `95b397cc662b255fc777afc898e7b56cc6a444d9` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38724301462) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38724292331) | PR 세 검사와 push 필수 두 검사 SUCCESS, push Mac CANCELLED. 6/6 성공으로 기록하지 않음 |

위 CI는 해당 head의 공개/합성 검사이며 merge commit 자체·실제 계정·운영 지급 검증을 대신하지 않는다. 검증 JSON의 PENDING_FINAL_HEAD_CI 등 당시 상태와 현재 원격 병합 상태를 구분한다.

### 진행 중인 별도 PR

[#60](https://github.com/gw020328-oss/clear-education-v4/pull/60) · [#66](https://github.com/gw020328-oss/clear-education-v4/pull/66) · [#69](https://github.com/gw020328-oss/clear-education-v4/pull/69) · [#70](https://github.com/gw020328-oss/clear-education-v4/pull/70) · [#71](https://github.com/gw020328-oss/clear-education-v4/pull/71) · [#72](https://github.com/gw020328-oss/clear-education-v4/pull/72) · [#73](https://github.com/gw020328-oss/clear-education-v4/pull/73) · [#74](https://github.com/gw020328-oss/clear-education-v4/pull/74) · [#75](https://github.com/gw020328-oss/clear-education-v4/pull/75). 확인 시점 모두 develop 미병합이다. 프론트·독립 청구·Reclaim wrapper 연구·Moodle 후기/AI/C2 연결·범위 제안은 각 작성자의 작업이며 이 문서 자동화에서 수정·병합하지 않는다. 특히 열린 연구 PR의 proof/CI 성공을 현재 develop 또는 main 기능으로 설명하지 않는다.

## 이전 시점 기록

아래 날짜별 Draft·후속·열린 PR·차단 표기는 당시 스냅샷이다. 현재 병합 여부와 구현 범위는 위 확인 절을 우선하고 실제 기능 사용은 각 최신 계약의 한계를 확인한다.

2026-10-16 후기 연결 계약 Draft: [Moodle 후기→C2/AI 공통 계약](current/MOODLE_REVIEW_C2_CONTRACT.ko.md)은 develop4756589와 미병합 PR71/72를 대조한 제안이다. registry·별도 사실 receipt/본문 지문·C2 revision/run 결합·원자 수락/원문 수명 후속을 정의한다. 제품 HTTP/DB 연결·LOCAL 수락·합성-only 제한 해제는 없으며 신규400/500 제외·grant/outbox HOLD·독립청구 NO_GO를 유지한다.

2026-10-15 C2 최종 수명 보완24e75f2: pending upload도logout/C1기준변경에서중단, 동일ACK재생은보존. 관련309/309(C2 HTTP21/TLS2·공통DELETE1 포함)·기존dev33·TLS/의존성/191개보존 PASS. PR63 Draft최종headCI는후속기록정본, 자동병합금지.

2026-10-15 C2 최신: PR63 Draft, 구현0a9945b·시작정리/fixture04efb92. 합성문서 exact C1/C2확인·서버Binding/실bytes·검토/보완·GET/재시작·메모리수명 연결. 관련306·기존dev33·추가시작정리1·TLS데모/의존성/191개보존 PASS, 최종headCI는PR63. PR61 추가pushMac은cancelled/원인UNKNOWN, 재실행0. full decode/실동의/운영개인자료·Evidence/M2/재원/실화면 미완료. [단일 인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md). 아래는 이전 상태 기록이다.

2026-10-15 최신: PR61 실질리뷰 fix8c5411b·최종95b397c, 필수CI4/4 성공 후 정상 develop merge0590fd0. 추가Mac PR성공/push진행중(미확정)을 분리 기록했다. C2는 최신develop의codex/mvp-document-http·하위#62에서 계약만 정리했으며 HTTP/업로드/실동의 미구현. 다음 일반 구현 요청은 Sol/Medium. [단일 인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md), [C2 계약](current/MVP_DOCUMENT_HTTP_CONTRACT.ko.md). 아래는 이전 기록이다.

2026-10-15 PR61 실질 검토: 코드8c5411b에서 시계 역행 중 저장된 확인/신청 조회와 POST재생의 transaction 내부 session 재검사 누락을 보완. 관련285·학생HTTPS재시작·원본보존 PASS. 사용자 승인된 develop 정상병합은 정확 최종head CI 뒤 진행한다. [단일 인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md). 아래는 이전 상태 기록이다.

2026-10-15 최신 통합: PR59 최종head112e93a·CI6/6 성공 후 develop `2bb6d291b77ba397f8544995557db78b3ce54724` 정상 병합 완료. C1 기존2354b70을 보존하고 최신develop을 정상 merge(c19a10f), 선행 의존 해소. 관련283/기존dev33·source/student HTTPS재시작·보존/의존성 PASS. PR61은 Draft·미병합, 최종headCI 확인은 PR61/이슈55. C2·실동의 미완료, PR60/web은 별도 소유다. [단일 인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md). 아래는 이전 시점 기록이다.

<!-- PR59 review update: historical entries below retain their original dates. -->
2026-10-15 PR59 최종 실질 검토: `7402f7f`에서 COMMITTING 첫 preview 혼합, 시계 역행 시 미만료 draft 조기 삭제, 생성/검토 시각 이전 결과 노출을 보완했다. 관련272·기존 개발환경33·합성 HTTPS 재시작·의존성/원본 보존 PASS. 최종 원격 CI 후 사용자 승인된 develop 정상 병합 예정이며, C1 PR61은 `2354b70`으로 보존해 그 뒤 기반 갱신한다. C2/실동의·PR60/web은 이 검토 범위 밖이다. [단일 인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md).

# 개발 현황

## 2026-10-15 C1 학생 신청·합성 확인 후속 Draft #61

PR59정확head11e27ac 의존, 별도codex/mvp-student-application-http, 코드7c56442/680bce3. 학생본인신청·host합성조건/정확표시hash·SYNTHETIC_ACK_ONLY·단일DB원자멱등/GET복구·정책변경시명시선택/새확인·불변이력/restart를 연결했다. 신규학생HTTP/HTTPS11포함관련278개·기존dev33개·검증HTTPS서명로그인/재시작demo·보존/공개검사PASS. 파일접수/문서검토/보완C2·실동의/게시·운영Evidence/재원·실제화면은미구현이다. source/student버전과팀원복붙지침은[단일인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md)를따른다. 프론트PR60/head4219a53/서준형소유와web-only경로를읽기확인했고web편집0. PR59의조건부develop병합은추가승인됐으나아직리뷰대기이며학생후속PR은Draft·자동병합없음. 예치/보관/배정/충전OPEN·400%자동자격/지급금지·500%제외·grant/outboxHOLD·독립claimNO-GO유지.

## 2026-10-15 원문 HTTP 연결 Draft #59

[프론트 인계·API 정본](current/MVP_SOURCE_HTTP_HANDOFF.ko.md), 코드032215f, 기준develop7f60965. A/B의초대지갑세션·operator/CSRF/loopbackHTTPS·새DB 원문등록/조회→mock초안→정확표시검토·취소/멱등/CAS·GET복구/재시작을 연결했다. 관련267개(신규HTTP/HTTPS15포함)·기존dev33개·새합성HTTPS데모·보존/공개검사PASS. 실제사이트/유료모델0, 기존사용자DB/키/체인접근0. 서준형이web/소유자이며 통합세션은web/를편집하지않았다. 학생신청/실동의/업로드·문서검토/보완HTTP(C)와실제화면·운영Evidence/재원은미구현이다. Draft59는미병합이며최종head원격CI는PR을따른다. 예치/배정/충전OPEN·400%자동자격/지급금지·500%제외·grant/outboxHOLD·독립claimNO-GO를유지한다.

## 2026-10-15 PR56 → PR58 → PR57 통합 검토

- Moodle #56은 develop `edb3efcdc2af0ff045a24dc95b6957f54818e3de`에 병합됐다. 정확 head202ce35의 PR Mac 취소 job을1회 재실행해62/62·실패/취소/skip0, PR/push6checks SUCCESS를 확인했다. 최초 실행은 Chrome lifecycle/hard-kill 단계 후15분상한 CANCELLED이며 구체 정체 원인은 미확정이다. capacity notice로 원인을 단정하지 않는다. 실제1502 재시험은 반복하지 않았고 기존6+새3행/토큰·세션 정리/중지 컨테이너·볼륨 보존 기록을 유지했다. 새 오프라인99개와 workspace/공개검사가 통과했다.
- 공통 #58은 develop `5f902dc38f5f050e7907f815d7e98b0d8d028aaf`에 병합됐다. 실질 리뷰에서 보관합계와 별개인 누적 수신량 제한을 보완했다(`39379ec`). HTTPS stream이16MiB를 공유하고 실패읽기도 차감·소진후 후속dispatch를 차단한다. 최종head39379ec의 PR/push6checks SUCCESS, 공통38개·새합성DB데모·원본/legacy191개·의존성·공개검사 PASS다.
- AI #57은 공통 병합 이력을 반영했고, 차분은 두 consumer adapter·전용tests/docs와 이번 통합 현행 문서 정리다. 결합 상태에서 관련308개 PASS(공통38개/호스트3개 포함, 중복합산 금지), 데모·mock7/7·binding 예제 byte 대조·workspace PASS를 확인했다. 최종 head의 원격CI와 병합 여부는 [PR57](https://github.com/gw020328-oss/clear-education-v4/pull/57)의 최종 리뷰를 정본으로 삼는다. 기존306개 기록은 수정 전 검사 범위다.

실제 유료 AI/URL 수집/개인자료·기존 DB/키·체인 접근0. HTTP·실제 동의·업로드/완전decode·운영 Evidence·영속 M2 판정·재원/화면은 미구현이다. 예치·배정·충전정책OPEN,자격/재원분리,400%사전검토만/자동자격·지급금지,500%제외,원천/동일인미확인보류,grant/outbox HOLD·독립claim NO-GO를 유지한다. 세 담당 채팅은 completed/idle을 확인했고 추가 구현·아카이브/삭제를 요청하지 않았다. 아래 Draft/실패/검사 기록은 이전 시점의 이력이다.

## 2026-10-15 M3-0 연결 준비 (Draft)

PR #54가 develop `4ae548b`에 병합됐다. 새 v4의 정상 T01 개선과 충돌 T04/누락 V02 유지, 합성3사례·5생성+5count/HTTP오류0은 [새 평가 기록](ai-vision/GEMINI_RECOVERY_EVALUATION.ko.md)을 따른다. 프로젝트/기존 환경 키/Tier1 복구는 조정 세션이 사용자와 확인했으며 식별자는 공개하지 않는다. 실제 청구액은 미확인이다. 아래 v3 과잉 보류 기록은 당시 상태다.

[제품 연결 계약](current/PRODUCT_WORKFLOW_CONTRACT.ko.md)·공통 Draft PR #58은 API/저장 단계, bytes manifest, 새 합성 검토 ledger와 제한 URL 원문 archive를 준비한다. HTTP 등록/학생 동의/실제 업로드/운영 Evidence·판정 저장·재원 표시 전체 연결은 후속이다. AI #57은 미병합 계약을 소비하는 별도 Draft다. [1502 실제 재시험 PR #56](https://github.com/gw020328-oss/clear-education-v4/pull/56)의 새 실측21/21을 이슈40에 반영했고, 과거1501의15+6과 구분한다. run3 로그인 실패의 정확 원인은 미확정이다. Draft PR은 아직 develop 완료 사실이 아니다.

추가 유료 호출·실제YBM 수집·실자금/체인·배포는 없고, 예치정책OPEN·400%사전검토만/500%제외·원천/동일인미확인 차단·grant/outbox HOLD·독립claim NO-GO와 기존자산 보존을 유지한다.

## 2026-10-15 소비자 최종 통합

이 절은 아래 11:22 KST 조회보다 최신인 통합 기록이다. main 통합·배포·실제 지급 완료가 아니다. 최종 head별 원격 검사와 병합 시각은 각 PR의 기록을 따른다.

| 범위 | develop 통합 및 한계 |
| --- | --- |
| M1/M2 #43/#46 | `3781f58` / `1f98d5f`. 공통 합성 정책·증거·금액 후보 평가. HTTP/DB·실제 자격 수락은 미구현 |
| Moodle 준비·L1 #41/#45 | `6b311de` / `6bb476f`. 일별 평가의 기간 완료는 조회 시각이 아닌 원천 관측 시각 기준 |
| AI 준비·소비자 #42/#47 | `f5f386e` / `b2a1933`. 근거 있는 초안과 순수 사전검토, 자동 게시/자격 없음 |
| Mac 보정 #53 | `8785ef3`. 통제된 초기 탭 navigation 경합을 전용 target으로 수정. 과거 실패의 실제 원인 확정은 아님 |
| 합성 Moodle export/driver #48 | `3f6985e`. 원자 revision/manifest·페이지 전체성, M2 합성 bridge. 실제 기관/제품 수락 아님 |
| 격리 로컬 Moodle #52 | `b0c6ea4`. 인증된 로컬 읽기·정규화·일별 평가, 비동기 문맥/취소·관측 하한 보강. 제품 Evidence 연결 없음 |
| AI 후속 #51 (이 변경) | 충돌 필드 보류, 실제 policy/rule hash·정확 표시 기준 결합, 배타 평가 원장과 실제 소규모 결과. 실제 학생 동의·서명·DB·Evidence 수락 없음 |

검증 범위는 서로 구분한다. AI 전용77개·mock7/7·저장된 응답 재처리·binding 예제 대조, Moodle LOCAL39개+일별/driver/M2 60개 및 별도 PHP clock9개를 오프라인 CI에 편입했다. #52의 실제 짧은 재생15+사후6건은 clearapi2026101501 기록이다. 보정된1502의 실제 DB/재생은 재시험하지 않았다. 원래 DB/키/체인/금고를 보존했다.

Gemini v3는 승인된 생성/사전계수 각각5회 중 HTTP오류3건·응답2건이다. T04 충돌값은 null 유지, 정상 T01은 불필요한 질문/flag 때문에 과잉 보류가 남았다. 추가 유료 호출 없음. 예약 US$0.02452와 성공응답 부분 추정 US$0.0011717은 실제 전체 청구 확인값이 아니며, 충전 프로젝트 연결도 미확인이다. [상세 평가](ai-vision/GEMINI_V3_REEVALUATION.ko.md).

멘토 예치 비율/풀/배정/충전/회수 정책 OPEN,400%자동자격·지급금지,500%제외,실제기관 Moodle·원천/동일인 미확인 BLOCKED,grant/outbox HOLD,독립청구 제품 NO-GO를 유지한다. 운영 원천·동의·단회 수락/복구와 실제 서류/장기 학습 검증, AI 과잉 보류는 #39/#40 후속으로 남는다. Mac 과거 timeout/cookie실패/CANCELLED 원인도 일괄 해소로 기록하지 않는다.


## 2026-10-15 원격 확인

공개 근거 확인: **2026-10-15 11:22 KST**. 원격 브랜치·병합/열린 PR·정확한 head의 CI와 공개 비식별 보고서를 대조했다. 아래 실제 실행과 시험 수는 저장된 기록이며 이번 문서 작업에서 재실행하지 않았다.

| 원격 대상 | 확인 상태 |
| --- | --- |
| main | [`375051e00f8f45a8266a6158024c84d3898b11c9`](https://github.com/gw020328-oss/clear-education-v4/commit/375051e00f8f45a8266a6158024c84d3898b11c9). 아래 develop 결과 미반영 |
| develop | [`21776f53d7660597b94a37c89139316e43eeb673`](https://github.com/gw020328-oss/clear-education-v4/commit/21776f53d7660597b94a37c89139316e43eeb673), PR #36 병합. main보다 107커밋 앞서며 서비스 배포 완료를 뜻하지 않음 |
| 열린 기능 PR | [#41 Moodle 준비](https://github.com/gw020328-oss/clear-education-v4/pull/41), [#42 AI/Vision 합성 준비](https://github.com/gw020328-oss/clear-education-v4/pull/42), [#43 공통 정책 계약](https://github.com/gw020328-oss/clear-education-v4/pull/43). 모두 develop 미병합. 이 문서 갱신 PR은 확인 이후 별도 생성 |

### develop에 추가로 병합된 범위

기존 PR #1~#8 이후 아래 PR은 모두 develop 대상 병합으로 확인했다. main 통합·운영 배포·전체 제품 완료와 구분한다.

| 병합 PR | 확인한 범위와 공개 근거 |
| --- | --- |
| [#9](https://github.com/gw020328-oss/clear-education-v4/pull/9), [#14](https://github.com/gw020328-oss/clear-education-v4/pull/14) | 팀 인계와 [독립 로컬 합성 HTTPS 개발 환경](current/LOCAL_SYNTHETIC.ko.md) |
| [#16](https://github.com/gw020328-oss/clear-education-v4/pull/16), [#17](https://github.com/gw020328-oss/clear-education-v4/pull/17), [#19](https://github.com/gw020328-oss/clear-education-v4/pull/19) | [제품 증명 세션·영속 nonce](current/PROOF_SESSIONS.ko.md), [전체 시험 증거의 합성 계약](current/EXAM_EVIDENCE.ko.md), [독립 검증·세션별 결과 단회 수락](current/PRODUCT_PROOF.ko.md). 실제 원천 전체성·제품 자격/지급은 차단 유지 |
| [#20](https://github.com/gw020328-oss/clear-education-v4/pull/20), [#25](https://github.com/gw020328-oss/clear-education-v4/pull/25) | [학습 증거 계약](current/LEARNING_EVIDENCE.ko.md)·[합성 provider 및 Moodle 명세](current/LEARNING_PROVIDER.ko.md). 실제 Moodle 취득·기관/계정 연결 완료가 아님 |
| [#23](https://github.com/gw020328-oss/clear-education-v4/pull/23), [#27](https://github.com/gw020328-oss/clear-education-v4/pull/27), [#29](https://github.com/gw020328-oss/clear-education-v4/pull/29) | [안전한 오류·응답 유실 복구](current/API_RECOVERY.ko.md), [증명 세션 지갑 승인](current/PROOF_WALLET.ko.md), [구독 가능한 클라이언트 흐름](current/PROOF_FLOW.ko.md). 완성된 참가자 화면·실수집/지급 통합을 뜻하지 않음 |
| [#21](https://github.com/gw020328-oss/clear-education-v4/pull/21) | 직접 증거 청구·Windows 호환성의 격리 spike. [Windows 11 공개 합성 기록](../spikes/windows-compatibility/windows11-teammate-report.json)은 realYbm=false·productionReady=false이며 암호화/강제 종료/24시간 정리 등 미검증 관문 유지 |
| [#30](https://github.com/gw020328-oss/clear-education-v4/pull/30), [#31](https://github.com/gw020328-oss/clear-education-v4/pull/31) | [새 MVP 계획](current/MVP_PLAN_20261014.ko.md), [M0 합성 계약](current/M0_CONTRACT.ko.md), [등록 이력→목표 성적의 H1 합성 검증](current/EXAM_LIFECYCLE.ko.md), [후기 사전검토 명세](current/REVIEW_PRECHECK.ko.md). M0 소비자 합의 PENDING, 실제 사업 정책·제품 인터페이스 미동결 |
| [#32](https://github.com/gw020328-oss/clear-education-v4/pull/32), [#33](https://github.com/gw020328-oss/clear-education-v4/pull/33), [#34](https://github.com/gw020328-oss/clear-education-v4/pull/34), [#35](https://github.com/gw020328-oss/clear-education-v4/pull/35) | 표 공증 spike와 [별도 로컬 등록 접수·원천 경계·관리형 실제 수집기 연결](current/HISTORY_INTAKE.ko.md). 최종 병합 `ef138da14b9b3493554fbc357550b03e6c2d5d01`. 아래 실제/미검증 범위 참조 |
| [#36](https://github.com/gw020328-oss/clear-education-v4/pull/36) | [부분 충전·전액 배정 TEST 실험](current/TEST_FUNDING_LAB.ko.md), 병합 `21776f5`. 기존 v4 금고·제품 DB·동의 경로를 바꾸지 않은 격리 실험 |

### 완료·진행·미검증의 구분

- **저장된 실제 등록 접수 성공:** [비식별 기록](current/history-intake-verification.json), 실행 코드 `bca6568`. 성적이 있는 계정에서 새 로컬 등록 문맥의 표 증명·공식 서명·독립 오프라인 검증·영속 receipt 수락·DB 재개봉 복구·프로필 삭제가 성공했다. 상태는 RECEIVED_UNVERIFIED_COVERAGE/UNKNOWN이다. 전체 이력·원천 범위·실명/신청자 결합·제품 자격·지급은 false/미확인이다.
- **빈 응답 관찰은 미응시 증명이 아님:** 사용자가 지정한 이력 없는 계정의 응답은 SOURCE_LAYOUT_UNSUPPORTED/UNKNOWN으로 종료했다. 새 서명 생성·receipt 수락·미응시 승인은 하지 않았다. 이를 타 사용자의 성공한 실제 수집이나 인증된 빈 이력으로 세지 않는다. 실제 다건 계정·숨은 페이지/필터·공식 등록 기간·수강 후 ACHIEVEMENT는 미검증이다.
- **합성 TEST 지급:** [저장된 검증](current/test-funding-lab-verification.json), 실행 코드 `390eccd8420fb28dd77694eebc77d5632e4af076`. 새 인메모리 TEST 체인에서 40+60 TEST 충전→100 TEST 전액 배정→고정 수령인 1회 지급·재조회/중복 재시도를 검증했다. 자격은 생성자가 신뢰한 인공 fixture이며 실제 원천 자격·PG·원화·실자금·제품 지급 성공이 아니다. 새 시험 28개와 기존 금고 회귀 78개는 별개 범위이며 다른 단계 총계와 합산하지 않는다.
- **보류와 후속:** 실제 Moodle·원천 자격 검증 BLOCKED, grant/outbox HOLD, 독립 청구 제품 전환 NO-GO, 400% 자동 자격·지급 금지를 유지한다. 사업 단위 동일 시험 nullifier, 실제 웹 등록/동의·정책·금액 확정, PG/재원 책임, 운영 배포, 타 사용자 실제 수집과 비개발자 합성 사용성 시험은 후속이다. Mac CI timeout의 최초 원인은 미확정이다.

### 정확한 head의 CI

아래 병합 PR의 최종 head에서 Public content history, Public synthetic tests, Mac synthetic recovery가 PR/push 각각 성공했다. 재실행 통과를 과거 실패 원인의 해결로 표현하지 않는다.

| PR / 정확한 head | PR CI / push CI | 확인 결과 |
| --- | --- | --- |
| #32 `0be735d61ed47e2d5dbb5b288dd26eed104a6ad3` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38542470643) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38542462827) | 최종 성공. 최초 Mac 실패 원인 미확정 |
| #33 `04e71df5e381f61e7f49dd4ff2a4b7f22e1d58a1` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38536961078) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38536955128) | 성공 |
| #34 `4da7a65cf350576e3da41900b75287a08210dffd` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38541499690) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38541492772) | 최종 성공. 과거 Mac timeout 원인 미확정 |
| #35 `b02a51ad6223fcd64871b8891f7ced2879ac46e6` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38543004399) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38542998121) | 성공 |
| #36 `9cf82914425da3b886b406f4d26a26fb3d42d70a` | [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38668219870) / [push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38668162252) | 성공 |

확인 시점 main `375051e`와 develop `21776f5` 자체의 check-runs와 Actions 실행은 각각 0건이다. [workflow](../.github/workflows/public-synthetic.yml)는 develop/main 대상 PR과 codex/** push를 검사한다. head CI 성공을 병합 커밋 검증이나 실제 계정·지급·배포 검증으로 옮겨 적지 않는다.

열린 #41 `7ac1f2ca8777115104987926af7e7f588956219e`, #42 `0afe4cc19882e21566b4260b7278ee7e11262bc5`, #43 `3b540193e12085c0da38157364e3c59212493c9b`의 Public synthetic tests는 확인 시점 진행 중이었다. Public content history/Mac synthetic recovery의 일부 완료만으로 전체 CI 통과나 develop 반영을 주장하지 않는다. 이후 상태는 각 PR의 Checks를 확인한다.

## 이전 날짜의 현황 기록

아래 2026-10-12~14의 기준 커밋·열린 PR·완료/후속 표는 당시 스냅샷이다. 최신 원격 상태는 위 절을 우선하고, 다음 구현 범위는 최신 승인과 해당 계획을 확인한다.

2026-10-14 M0 추가: [합성 계약](current/M0_CONTRACT.ko.md)·[결정/미결 질문](current/M0_DECISIONS.ko.md)·[프런트 시작 문서](current/FRONTEND_M0_HANDOFF.ko.md)를 우선한다. 첫 mock의 필드·예제는 FIXED_FOR_M0_FIXTURES이며 소비자 합의는 PENDING이다. 아래 넓은 설계의 wire/ABI·실제 조건은 여전히 미동결이다. 제품 기능과 M1 이후 구현은 포함하지 않으며 실제 Moodle·원천 검증 차단, grant/outbox 보류, 독립 청구 NO-GO를 유지한다.

2026-10-14 최신 확인: develop `6d941a1fe0669b89730da1472d23ecd7caab22f4`, PR #29와 #21 병합 완료. [구현 차이·근거](current/MVP_GAP_20261014.ko.md)가 현재 구현/실험/미검증을 구분한다. [새 정본 PRD](current/MVP_PRD_20261014.ko.md)와 [단계별 계획](current/MVP_PLAN_20261014.ko.md)은 문서 설계이며 기능 완료가 아니다. 실제 Moodle 제품 연동·원천 검증 차단, grant/outbox 보류, 독립 청구 제품 전환 NO-GO는 유지한다. 아래 2026-10-12~13의 상태·다음 단계·PR 표는 당시 이력이며 새 작업 순서는 최신 계획을 따른다.

공통 세션 흐름(2026-10-13): [이슈 #28](https://github.com/gw020328-oss/clear-education-v4/issues/28), [클라이언트 흐름 계약](current/PROOF_FLOW.ko.md). PR #27 병합 `77d1c4b` 위에서 생성·검토·지갑 승인·세션/결과 조회·취소와 응답 유실 복구를 구독 가능한 상태로 연결했다. F0 화면은 별도이며 HTTP/DB/정책/금고/Moodle 계약을 변경하지 않는다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류·독립 청구 제품 전환 NO-GO를 유지한다.

공통 증명 세션 승인(2026-10-13): [이슈 #26](https://github.com/gw020328-oss/clear-education-v4/issues/26), [지갑 승인 도구](current/PROOF_WALLET.ko.md). PR #25 병합 `51ee66b` 위에서 기존 B1 서명/HTTP 계약을 재사용하는 `authorizeProofSession`을 추가했다. 검토한 문맥·독립 owner 공개키·중단/만료·응답 유실을 검사한다. 실제 Moodle 연동·원천 검증 차단과 grant/outbox 보류는 유지하며 HTTP/DB/정책/금고/화면은 변경하지 않는다.

학습 provider 후속(2026-10-13): PR #23 병합 `7ee183d` 기준으로 [이슈 #24](https://github.com/gw020328-oss/clear-education-v4/issues/24)의 [합성 시드 provider와 Moodle 최소 연결 명세](current/LEARNING_PROVIDER.ko.md)를 추가했다. 기존 B3/평가기 경계를 재사용하며 기관/강좌/계정·고정 활동·완료와 수정 시각을 구분한다. 실제 Moodle API 연결·원천 검증은 BLOCKED, grant/outbox 보류도 유지한다. 공식 API 조사·합성 시험을 실제 학습/지급 완료로 기록하지 않는다.

공통 API 복구(2026-10-13): PR #20 병합 `4a0cdc6` 기준으로 [이슈 #22](https://github.com/gw020328-oss/clear-education-v4/issues/22)의 [안전한 오류·요청 복구 계약](current/API_RECOVERY.ko.md)을 구현했다. 기존 import/HTTP message 호환성, 허용 목록 code, 취소/timeout, 쓰기 응답 유실 후 결과 확인을 다룬다. 화면/서버 경로/DB·정책·금고는 유지하며 실제 원천 검증 차단과 grant/outbox 보류를 해제하지 않는다. 최신 head·CI·병합 상태는 연결 PR을 확인한다.

B3 공통 작업(2026-10-13): PR #19의 develop 병합 `3f8ef79` 위에서 [학습 증거 계약과 합성 adapter](current/LEARNING_EVIDENCE.ko.md)를 구현했다. [이슈 #13](https://github.com/gw020328-oss/clear-education-v4/issues/13). 실제 제공자/API·인증·영속 연결은 BLOCKED이며 HTTP/DB/UI·정책·금고는 변경하지 않는다. CLEAR 추가 지급 서명 전용 grant/outbox 및 종속 확대는 별도 구조 검증 전까지 보류한다. 기존 실제 YBM 원천 전체성 차단을 유지하며, 최신 head/검증/병합 상태는 연결 PR을 확인한다.

B2b 구현 추가(2026-10-13): [이슈 #18](https://github.com/gw020328-oss/clear-education-v4/issues/18), [제품 수집·검증 결과 수락](current/PRODUCT_PROOF.ko.md). B2a PR #17 병합 기준 `72b057a`에서 합성 driver/owner 결합·별도 검증 프로세스·schema 4의 세션별 단회 수락을 구현했다. 실제 YBM 전체 원천·실수집·자격/지급은 계속 차단한다. 아래 표는 과거 기록이며 최신 B2b PR의 head/CI/병합 상태를 확인한다.

B2a 구현 추가(2026-10-13): [이슈 #12](https://github.com/gw020328-oss/clear-education-v4/issues/12), [전체 시험 증거 계약](current/EXAM_EVIDENCE.ko.md). B1 PR #16 병합 기준 `2c51823`에서 범위/페이지/종료/건수·접수/성적 대조와 최고점 합성 검증을 구현했다. 실제 원천 inventory와 계정/기간 전체성은 미확인으로 실제 자격 판정 차단을 유지한다. 아래 표는 과거 기록이며 새 B2a 병합·CI 상태는 연결 PR을 따른다.

B1 구현 추가(2026-10-12): [이슈 #15](https://github.com/gw020328-oss/clear-education-v4/issues/15)와 [제품 증명 세션 문서](current/PROOF_SESSIONS.ko.md)를 확인한다. C1은 PR #14로 develop에 병합됐으며 B1은 세션·승인 nonce·현재 예치 재검증을 추가한다. 아래 과거 표의 제품 proof 미구현 표시는 당시 기준이다. B1의 AUTHORIZED는 지갑 결합 승인만 의미하며 실제 proof 수락·시험 중복 차단·outbox는 미연결이다. 최신 병합/CI 상태는 연결 PR을 따른다.

공개 근거 확인: **2026-10-12 14:11 KST**. 원격 main/develop·PR·정확한 커밋의 CI와 공개 비민감 보고서를 대조했다. 아래 시험 수와 실제 증명 결과는 저장된 실행 기록이며 이번 문서 작업에서 재실행한 결과가 아니다.

## 원격 반영 범위

| 대상 | 확인한 상태 |
| --- | --- |
| main | [`375051e00f8f45a8266a6158024c84d3898b11c9`](https://github.com/gw020328-oss/clear-education-v4/commit/375051e00f8f45a8266a6158024c84d3898b11c9), 개발 기준본. 아래 develop 결과 미반영 |
| develop | [`841052a6bfc6f306d6139e63e4110a890e046e0c`](https://github.com/gw020328-oss/clear-education-v4/commit/841052a6bfc6f306d6139e63e4110a890e046e0c), PR #8 병합 커밋. 아래 최신 구현·진단 결과의 기준 |
| 열린 PR | 확인 시점 [#5](https://github.com/gw020328-oss/clear-education-v4/pull/5) 문서 갱신 Draft 1개. 이 문서의 병합 이후 상태는 PR 링크에서 확인 |

| 병합 PR (모두 develop 대상) | 범위 | 병합 커밋 |
| --- | --- | --- |
| [#1](https://github.com/gw020328-oss/clear-education-v4/pull/1) | W02 검증·Mac 저장 경계·협업 CI | `dd7ec920fafbaf44ee9ac848f6fabb9ee5e7a467` |
| [#2](https://github.com/gw020328-oss/clear-education-v4/pull/2) | Mac 전용 YBM 접속 경로 | `dc08a37e8f37387daf1159a85a2dd6087e8f538f` |
| [#3](https://github.com/gw020328-oss/clear-education-v4/pull/3) | 신청·수취 지갑 결합과 실제 원천 형식 진단 | `d880fd65a99109c6802df364fdb40c44d60c0247` |
| [#4](https://github.com/gw020328-oss/clear-education-v4/pull/4) | 동일 client 새 증명 생성·독립 검증과 시작 실패 정리 | `366417e3fd7b0cc64ed905cd65a4880955313419` |
| [#6](https://github.com/gw020328-oss/clear-education-v4/pull/6) | 합성 정책 컴파일러·결정적 시드 자격 평가 | `7e713c49c04c3f17a257acd1978a47d763c6f6a5` |
| [#7](https://github.com/gw020328-oss/clear-education-v4/pull/7) | 지갑 인증·신청 조건 동의·SQLite 영속 상태 | `b1229e51b703f0eabfe230ac96460378fcc8381d` |
| [#8](https://github.com/gw020328-oss/clear-education-v4/pull/8) | 금고 설정·최종 계약 동의·예치 확인/복구 | `841052a6bfc6f306d6139e63e4110a890e046e0c` |

PR #8은 2026-10-12 13:54:01 KST에 병합됐다. develop 병합은 서비스 배포나 main 통합 완료를 뜻하지 않는다. 과거 보고서의 Draft·미병합·다음 단계 표기는 작성 당시 기록으로 보존하며 현재 상태는 위 PR과 아래 범위를 따른다.

## 완료·진행·미검증

| 영역 | 확인한 결과와 근거 | 남은 범위 |
| --- | --- | --- |
| 기존 Stage14/15·YBM·Amoy | [감사 기록](reference/AUDIT.ko.md)의 저장된 시제품·실제 YBM 1쌍·과거 로컬 포크 결과 | 현재 v4 제품 통합·배포·실제 지급의 근거가 아님 |
| W01·W02 A/B | [환경 준비](w01/REPORT.ko.md), [ProofAdapter 107개](w02/W02A_REPORT.ko.md), [원천 추출·격리 62개](w02/W02B_REPORT.ko.md) | 합성 시험 자체는 실제 계정 수집·지급 검증이 아님 |
| Mac 저장·복구 | [관리형 저장·합성 패키지](w02/MAC_STORAGE_REPORT.ko.md), [종료·복구 보정](w02/PR1_FIX_REPORT.ko.md) | 모든 기기 호환성·디스크 흔적 완전 삭제는 보장하지 않음. 기존 ZIP은 합성 전용 |
| W02 실제 원천/증명 | [형식 진단](w02/ybm-binding-verification.json) `3b62622`, [증명 보고서](w02/YBM_PROOF_REPORT.ko.md)와 [공개 기록](w02/ybm-proof-verification.json) `1a99de4`: 본인 접수·성적 claim 2건(1쌍) 새 생성·독립 검증·프로필 삭제 성공 | 메모리 진단 신청·테스트 지갑 범위. 실제 목록 완전성·최고점·제품 자격·지급 미확인 |
| 합성 정책·자격 평가 | [PR #6 보고서](current/POLICY_EVALUATOR.ko.md): canonical 정책 hash·기간 내 단일 최고점·800점 AND 정수 시드 80%·결측/충돌 보류 | SYNTHETIC/publishable=false. 실제 원천 목록 완전성·시드 API·제품 proof 연결 미완료 |
| 지갑 인증·영속 신청 | [PR #7 보고서](current/WALLET_APPLICATIONS.ko.md): SIWE 로그인·policyHash 고정 신청·별도 신청 조건 동의·SQLite 재시작/경쟁/멱등 복구 | 합성 EOA/provider 검증. 실제 확장 지갑 UI·원격 운영·암호화/백업/삭제 운영 미검증 |
| 금고·최종 동의·예치 | [PR #8 보고서](current/VAULT_ENROLLMENT.ko.md): 배포/설정 지문 검증·TermsAcceptanceV4·CONSENTED→FUNDING_PENDING→ENROLLED·예치 거래/이벤트/준비금 확인·중단 복구 | 새 메모리 EVM·무가치 TEST 토큰 검증. 실제 금액/날짜 승인·운영 배포·실자금 예치 미실행.ENROLLED는 확인 블록의 예치 기록이며 실시간 권리 추적은 후속 |
| 권한·지급·독립 청구 | PR #8 금고의 불변 발급 권한·신청/시험 중복 차단·고정 수취인 단회 지급/회수·T/T+3/T+10을 합성 서명으로 계약 단위 검증 | 제품 proof 세션·영속 proof nonce·반별 HMAC nullifier·발급 outbox·청구 패킷/클라이언트·실제 자격/지급 통합 미완료 |
| 타 사용자·제품화 | [Mac MVP 기준](current/MAC_MVP.ko.md), [기존 합성 ZIP 안내](current/MAC_TOOL_GUIDE.ko.md) | 타 사용자 자기 PC/계정 실제 수집 최소 1건·비개발자 2명 합성 사용성 시험·실제 기능 배포 미완료 |

실제 증명 성공 실행 코드는 [`1a99de4bfcb60bc486e420b12aab33550f927d2e`](https://github.com/gw020328-oss/clear-education-v4/commit/1a99de4bfcb60bc486e420b12aab33550f927d2e)다. 동일 Attestor client, 공식 claim 서명·identifier·owner·진단 신청/수취 지갑·params/context·신선도·두 원천 시험 연결을 독립 프로세스에서 검증한 기록이다. `listComplete`, `highestScoreAssessed`, `eligibilityAssessed`, `payment`는 false다. 원본 증명이나 개인정보를 다시 읽지 않고 공개 기록만 대조했다.

PR #7의 원자 nonce 소비는 로그인·신청 조건 동의 범위이고 PR #8은 최종 계약 동의·예치 범위를 추가했다. 이를 제품 proof의 영속 nonce 소비·시험 재지급 방지·권한 발급 완료로 확대하지 않는다. PR #8 최종 계약 payload/서명은 예치 복구 목적으로 저장하지만 로그인/신청 조건 서명·개인키·원본 proof는 저장하지 않는다. 과거 PR #7의 digest-only 설명과 범위를 구분한다.

공증자 claim 검증을 전체 TLS/ZK transcript 재검증·추가 TEE·실명 확인으로 설명하지 않는다. 추가 TEE는 [승인된 Mac MVP](current/MAC_MVP.ko.md)의 후속 보장이며 과거 TEE 시험 통과를 뜻하지 않는다.

## 저장된 시험 결과와 정확한 커밋의 CI

PR #4의 초기 400개·후속 407개, PR #6의 519개, PR #7의 577개, PR #8의 **655개(실패/skip 0개)**는 각 공개 보고서에 저장된 해당 단계의 로컬 실행 총계다. 서로 더하거나 이번 문서 검증의 재실행 결과·정확도·제품 완성률로 사용하지 않는다. PR #8 신규 금고/신청/지갑/HTTP/복구 검사는 78개다. 실제 claim 2건도 시험 총계에 더하지 않는다.

| CI 근거 | 정확한 대상 | 결과와 한계 |
| --- | --- | --- |
| [실제 성공 코드 PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38194206010), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38194203348) | `1a99de4bfcb60bc486e420b12aab33550f927d2e` | 성공. 실제 계정 결과는 별도의 공개 실행 기록 |
| [PR #4 최종 PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38195044654), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38195040083) | `0a08b4ef518abc1255da9ee1314a724fbaae2294` | 세 검사 성공. PR attempt 1 Mac 실패, attempt 2 최종 성공 |
| [PR #6 CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38197019369), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38196985221) | `e29d646a306d8aadab501caeb8310d4caa4323b0` | 완료·success |
| [PR #7 CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38203645907), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38203633788) | `f22d0221709bb62dd7216cd77eb221d94282fce6` | 완료·success |
| [PR #8 CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38205187296), [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38205184092) | `c31ca8dc1bd5642f70669d948c9072378abaf3ee` | 완료·success |
| 확인 시점 main/develop tip | 위 `375051e`·`841052a` | 각 check-runs 0건·status 항목 0건·Actions 실행 0건. PR head 성공을 병합 커밋 CI 성공으로 옮겨 적지 않음 |

세 검사 이름은 Public content history, Public synthetic tests, Mac synthetic recovery다. [현재 workflow](../.github/workflows/public-synthetic.yml)는 develop/main 대상 PR과 `codex/**` push에서 실행하며 develop/main push 자체는 대상으로 하지 않는다. 따라서 병합 커밋 자체의 CI는 자동으로 실행되지 않는다. 문서 PR #5의 최종 head와 CI는 [PR 본문·Checks](https://github.com/gw020328-oss/clear-education-v4/pull/5)에서 확인한다. 모든 CI는 공개·합성 검사이며 실제 로그인·실자금 지급·운영 배포의 증거가 아니다.

## 다음 단계와 남은 결정

1. W08: 진단 proof와 제품 신청/최종 계약 문맥을 연결하고 제품 proof 세션·영속 nonce·검증 필드 전달을 구현한다. 실제 원천 목록 완전성과 인정 시험 선택을 합성 선언으로 대체하지 않는다.
2. W09/W10: 반별 HMAC 시험 nullifier·영속 권한/outbox·청구 패킷/클라이언트·체인 상태 재검증을 연결한다. 예치 후 DB 중단 복구와 지급·회수/기한/중복 경계를 통합 검증한다.
3. 실제 날짜·금액 승인, 운영 배포 지문·release 서명, issuer/outageSigner 키 관리, 실제 확장 지갑 UI와 DB 암호화·백업·마감 후 삭제 운영을 확정·검증한다. pending manifest는 usableForClaim=false를 유지한다.
4. 준비된 새 제품 문맥에서 새 동의·예치·YBM 증명·실제 자격·로컬 1회 지급·원본 삭제 후 독립 청구를 검증한다.
5. 타 사용자 자기 PC/계정 실제 수집 최소 1건과 비개발자 2명 합성 과업 시험을 별도 결과로 보고한다.

이 항목들은 후속이며 이번 문서 갱신에서 실제 로그인·새 증명·자금 이동·배포를 실행하지 않았다. main 통합은 전체 통합 검증 뒤 별도 develop→main PR로 진행한다. 실명 확인·실제 학원 API·원화 지급·공개 Amoy 지급·여러 교육기관 지원은 후속이다. [원래 PRD](reference/PRD.ko.md)와 [최신 Mac MVP](current/MAC_MVP.ko.md)를 함께 읽고 날짜별 계획을 완료 사실로 해석하지 않는다.

## 2026-10-15 C2 병합·C3 합성 증거/평가 저장 Draft

PR63 최종head230a951의 raw TTL observer 정리 보완·관련312/312·CI6/6 이후 develop890ad93cfb3677c5b4107428095c6f0b15efa9a4로 정상 병합했다. [프론트 인계](current/MVP_SOURCE_HTTP_HANDOFF.ko.md)·[복붙 지침](current/MVP_FRONTEND_CONNECTION_PROMPT.ko.md)에 실제 병합 근거를 반영했다.

후속 이슈65/C3는 최신 develop에서 새 evidence/evaluation 단일 DB·본인 세션/서버 binding·최초 시험/명시 선택/합성 최종성·보완/stale·원자 명령/결과 저장·GET/재시작을 연결하는 Draft다. YBM과 시원스쿨은 같은 인터페이스의 host 합성 profile이며 실제 원천/동일인·실동의·개인자료/금고·재원/지급을 연결하지 않는다. [상세 계약](current/MVP_EVIDENCE_HTTP_CONTRACT.ko.md)·최종 검증 JSON/PR의 exact head를 따른다. 새 PR 자동 병합 미승인.
