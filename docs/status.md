# 개발 현황

## 2026-10-21 공개 현황

원격 확인 **2026-10-21 11:04 KST**. develop은 [028e69e](https://github.com/gw020328-oss/clear-education-v4/commit/028e69ed8af878bfdef741d58f6ac32c8be3baf2), main은 [84e0d51](https://github.com/gw020328-oss/clear-education-v4/commit/84e0d51685c5c6f29b5d3ba10f39009032748a26)다. 마지막 문서 병합 이후 새 기능 병합은 없다. 아래는 열린 PR과 공개 보고서의 저장된 결과이며 이번 자동화의 재실행 결과가 아니다. 모든 신규 구현은 **develop 작업 브랜치 기준, develop/main 미병합**이다.

main에서 재현할 수 있는 제공 범위는 기존 ProofAdapter 합성 테스트 36개와 문서 CI다. 기존 코드·의존성·설치/실행 방법은 유지하며 아래 미병합 기능의 로컬 명령은 제공하지 않는다.

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

## 2026-10-19 공개 현황

원격 확인 **2026-10-19 11:02 KST**. main [8f50a53](https://github.com/gw020328-oss/clear-education-v4/commit/8f50a531d7f04c311f9929fcce36bbf53c64a518)과 develop [97d5024](https://github.com/gw020328-oss/clear-education-v4/commit/97d5024ebb1a8371ae8a996cf76624af9e067269)은 어제 문서 병합 이후 새 기능 병합이 없다. main의 기존 코드·의존성·설치/실행 방법은 그대로다.

새 [E1 #84](https://github.com/gw020328-oss/clear-education-v4/pull/84)·[unsigned E2 #85](https://github.com/gw020328-oss/clear-education-v4/pull/85)·[AI E6 준비 #86](https://github.com/gw020328-oss/clear-education-v4/pull/86)·[Moodle 재수집 준비 #87](https://github.com/gw020328-oss/clear-education-v4/pull/87)·[비지급 E4 #88](https://github.com/gw020328-oss/clear-education-v4/pull/88)·[E3 검토 절차 #89](https://github.com/gw020328-oss/clear-education-v4/pull/89)와 갱신된 [TEST 계획 #78](https://github.com/gw020328-oss/clear-education-v4/pull/78)은 **develop/main 미병합**이다. 공개 PR이 보고하는 합성 구현·격리 fixture·unsigned 준비를 main 제공 기능이나 실제 모델/원천 인수·권한 발급·지급으로 안내하지 않는다. AI Python 실제 평가는 기본 차단/품질 N/A이며, #88은 payoutEnabled=false로 지급 활성화가 아니다.

#89의 정확한 head fb9e6d3a9f35c8d12b80f0c84e01d8a6db9aeda1는 [push Mac FAILURE](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142228451)·[PR Mac SUCCESS](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39142236991)다. 후속 [Mac 시험 PR #90](https://github.com/gw020328-oss/clear-education-v4/pull/90)의 head 41354e0283709f74dd64a9dc6435703c804853c6에서는 [PR](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39187720556)·[push](https://github.com/gw020328-oss/clear-education-v4/actions/runs/39187717033) 세 검사가 모두 성공했지만, 미병합 시험 보강이며 과거 실패 원인 해결이나 main 제품 복구 완료의 증거가 아니다.

나머지 기존 열린 PR과 C1~C3의 develop 구현 범위·제약은 아래 날짜별 기록을 참고한다. 선행 기능 이력이 섞인 PR은 문서 PR로 취급하지 않는다. 이번 갱신은 공개 PR/CI만 대조했으며 실제 계정·원문·모델 API·서명/지급을 실행하지 않았다.


## 2026-10-18 공개 현황

원격 확인 **2026-10-18 12:11 KST**. main은 [`72fe051`](https://github.com/gw020328-oss/clear-education-v4/commit/72fe051c1aad6b99def4d864cd2e3841308e857c), develop은 [`9c542c3`](https://github.com/gw020328-oss/clear-education-v4/commit/9c542c38892d0a5d5e71fcbe4f87f1017d8fe843)이며 어제 이후 새 기능 병합은 없다. main의 공개 코드·의존성·기존 설치/실행 방법은 그대로다.

새로 열린 [#78 부트캠프 계획](https://github.com/gw020328-oss/clear-education-v4/pull/78), [#79 HackerRank 오프라인 증거](https://github.com/gw020328-oss/clear-education-v4/pull/79), [#80 합성 증거 ledger](https://github.com/gw020328-oss/clear-education-v4/pull/80), [#81 지급 권한·풀 재원 경계 리뷰](https://github.com/gw020328-oss/clear-education-v4/pull/81)는 **develop/main 미병합**이다. 계획·합성 producer·설계 리뷰를 현재 main에서 실행 가능한 기능이나 최종 정책·실제 지급으로 안내하지 않는다. #79는 기본 UNCONFIGURED_BLOCKED·새 실제 공식 proof 0, #80은 기본 DISABLED/합성 인수·실제 수락 불가이며, #81은 새 지급 키/서명/거래를 구현한 PR이 아니다.

확인한 최신 head는 #78 `733fe69`, #79 `0da3abe`, #80 `66893ea`, #81 `c9c0ee0`이며 각 PR/push의 공개 이력·합성 시험·Mac 복구 CI가 성공했다. CI 성공은 병합·운영 기능·실제 자격/지급 검증이 아니다. 일부 PR의 base diff에는 미병합 선행 기능 이력이 포함되므로 문서만 바꾼 PR로 취급하지 않는다.

[Moodle #71](https://github.com/gw020328-oss/clear-education-v4/pull/71)의 격리 fixture와 [AI #72](https://github.com/gw020328-oss/clear-education-v4/pull/72)의 Python 회고 세 항목 MOCK 검토도 미병합이다. 실제 기관/본인·전체 AND·지급이나 실제 Python 회고 모델 품질 성공으로 확대하지 않는다. 아래 2026-10-17의 main 재현 경로와 develop C1~C3 상태는 그대로 유지하며, 이번 문서 작업은 로그인·실제 proof·새 유료 모델 호출을 수행하지 않았다.


## 2026-10-17 공개 현황

확인 시각 **2026-10-17 11:08 KST**. main은 [`58261aa`](https://github.com/gw020328-oss/clear-education-v4/commit/58261aa2465bfc4b34d181dde2757add6eec7283)이며 제공 코드·의존성·기존 시작 명령은 그대로다. main에서 재현하는 경로는 기존 ProofAdapter 합성 테스트 36개와 문서 CI다. 아래 새 기능 코드는 main에 포함되지 않는다.

develop은 [4756589659a40c8f8fe45452a698b8a56487628c](https://github.com/gw020328-oss/clear-education-v4/commit/4756589659a40c8f8fe45452a698b8a56487628c)(PR #67 병합)이다. [고정 커밋의 HTTP 인계](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/current/MVP_SOURCE_HTTP_HANDOFF.ko.md)와 [C3 계약](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/current/MVP_EVIDENCE_HTTP_CONTRACT.ko.md)을 참고하면 원문/학생 신청·합성 표시 확인·C2 합성 문서 검토·C3 고정 fixture 수락과 M2 결과 영속 조회가 구현됐다. **develop 기준, main 미반영**이며 실제 동의·운영 원천/신원·개인자료·최종 자격/지급·팀원 화면 통합은 미완료다. 과거 공개 현황에서 열린 PR로 적은 #41~#48은 현재 develop에 병합됐다.

[격리 Moodle 1502 재시험](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/moodle/RETEST_1502.ko.md)은 새 합성 계정/강좌를 실제 로컬 브라우저/API에서 확인한 저장 결과 21/21 PASS다. 실제 학원·장기 학습·집중·전체 환급 자격의 증거가 아니다. [Gemini 재평가](https://github.com/gw020328-oss/clear-education-v4/blob/4756589659a40c8f8fe45452a698b8a56487628c/docs/ai-vision/GEMINI_RECOVERY_EVALUATION.ko.md)는 합성 자료 3사례에 실제 생성 5회, v4 작은 비교 3/3 기록이며 실제 학생 문서·진위/전체 이력 성능이 아니다. 이번 자동화는 로그인·API 재실행·새 유료 호출을 하지 않았다.

[#67 최종 head `973ac05`](https://github.com/gw020328-oss/clear-education-v4/pull/67)의 [PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38751820489)·[push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38751808131)는 세 검사 모두 SUCCESS다. 반면 [#61](https://github.com/gw020328-oss/clear-education-v4/pull/61)의 push Mac은 CANCELLED로 6/6 성공이 아니다. 정확한 head의 CI와 병합 커밋·실제 서비스 검증을 구분한다. source/identity·grant/outbox HOLD, 독립 청구 NO_GO, 지급 불가, 400% 사전검토 전용·500% 제외를 유지한다.

열린 개발 PR은 [#60](https://github.com/gw020328-oss/clear-education-v4/pull/60) · [#66](https://github.com/gw020328-oss/clear-education-v4/pull/66) · [#69](https://github.com/gw020328-oss/clear-education-v4/pull/69) · [#70](https://github.com/gw020328-oss/clear-education-v4/pull/70) · [#71](https://github.com/gw020328-oss/clear-education-v4/pull/71) · [#72](https://github.com/gw020328-oss/clear-education-v4/pull/72) · [#73](https://github.com/gw020328-oss/clear-education-v4/pull/73) · [#74](https://github.com/gw020328-oss/clear-education-v4/pull/74) · [#75](https://github.com/gw020328-oss/clear-education-v4/pull/75)다. 모두 확인 시점 미병합이며 해당 연구/프론트/후기 연결 성과를 main 제공 기능으로 안내하지 않는다. 아래 이전 날짜의 기준 커밋과 열린 PR 표는 당시 기록이다.


## 2026-10-15 공개 현황

원격 확인: **2026-10-15 11:52 KST**. 기본 브랜치 main의 제공 범위와 develop에서 진행한 구현·실험을 구분한다. 아래 저장된 실제 실행·시험 결과를 이번 문서 작업의 재실행으로 표현하지 않는다.

| 브랜치 | 확인한 커밋과 제공 범위 |
| --- | --- |
| main | [`2af7736d650ae75d7de9caad6c8d71c88ac45421`](https://github.com/gw020328-oss/clear-education-v4/commit/2af7736d650ae75d7de9caad6c8d71c88ac45421), [CI 구성 PR #49](https://github.com/gw020328-oss/clear-education-v4/pull/49) 병합. 기존 코드·의존성·README 사용법 그대로, ProofAdapter 합성 테스트 36개가 공개 재현 경로 |
| develop | [`5eb651a8664ea81a203431d7a8f9a24ab3972f55`](https://github.com/gw020328-oss/clear-education-v4/commit/5eb651a8664ea81a203431d7a8f9a24ab3972f55), [진행 문서 PR #44](https://github.com/gw020328-oss/clear-education-v4/pull/44) 병합. [해당 커밋의 상세 현황](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/status.md)은 develop 기준이며 main 기능·배포 완료가 아님 |

### develop에서 확인한 진행 — main 코드에는 미반영

- 제품 증명 세션·합성 결과 단회 수락과 별도 로컬 등록 이력 접수·실제 수집기 연결이 병합됐다. [등록 접수 설명](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/HISTORY_INTAKE.ko.md), [비식별 실행 기록](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/history-intake-verification.json), [PR #35](https://github.com/gw020328-oss/clear-education-v4/pull/35). 저장된 실제 성공은 표 증명·공식 서명·독립 검증·접수/DB 복구 범위다. 전체 이력·신원·제품 자격·지급은 미확인이다. 빈 응답 관찰은 인증된 미응시 결과나 성공한 타 사용자 수집이 아니다.
- [TEST 재원 실험 PR #36](https://github.com/gw020328-oss/clear-education-v4/pull/36)은 새 인메모리 체인과 인공 자격 fixture에서 부분 충전·전액 배정·고정 수령인 단회 지급을 검증했다. [실험 설명](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/TEST_FUNDING_LAB.ko.md), [저장된 합성 기록](https://github.com/gw020328-oss/clear-education-v4/blob/5eb651a8664ea81a203431d7a8f9a24ab3972f55/docs/current/test-funding-lab-verification.json). 실제 원천 자격·PG·원화·실자금·제품 지급 성공이 아니다.
- 확인 시점 [#41](https://github.com/gw020328-oss/clear-education-v4/pull/41), [#42](https://github.com/gw020328-oss/clear-education-v4/pull/42), [#43](https://github.com/gw020328-oss/clear-education-v4/pull/43), [#45](https://github.com/gw020328-oss/clear-education-v4/pull/45), [#46](https://github.com/gw020328-oss/clear-education-v4/pull/46), [#47](https://github.com/gw020328-oss/clear-education-v4/pull/47), [#48](https://github.com/gw020328-oss/clear-education-v4/pull/48)은 열린 개발 PR이다. 검사 성공이나 PR 생성만으로 main/develop 반영을 주장하지 않는다.
- 실제 Moodle·원천 자격 검증 BLOCKED, grant/outbox HOLD, 독립 청구 제품 NO-GO, 400% 자동 자격·지급 금지를 유지한다. 실제 자격/지급 통합·사업 단위 시험 재사용 방지·타 사용자 실제 수집·비개발자 합성 사용성·운영 배포는 후속이다. Mac CI 최초 timeout의 원인도 미확정이다.

### main 문서 PR 검증

[Main documentation CI](../.github/workflows/main-docs-ci.yml)는 공개 Git 이력, 문서 링크·제목·자동화 문서 전용 변경 범위, 기존 main ProofAdapter 합성 테스트를 검사한다. 구성 PR의 정확한 head `4c69067267dd981a5e413a7e0f3a5ec5470ea1e1`에서 [PR CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38673134697)와 [push CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38672583222)의 Public content history/Public synthetic tests가 모두 통과했다. 이는 실제 YBM·지급·배포 검증이 아니다. 이후 문서 PR은 각 최신 head의 전체 CI와 문서 범위를 다시 확인한다.

## 이전 main 기준의 기록

아래 기록과 다음 단계는 당시 main 코드의 범위이며 최신 develop의 구현 상태와 구분한다. 이 문서 갱신은 develop 기능 코드를 main에 가져오거나 기존 실행 방법을 변경하지 않는다.

기준: 2026.10.10. 아래는 단계별 검증 범위를 구분한 기록입니다.

| 영역 | 확인한 결과 | 아직 확인하지 않은 범위 |
| --- | --- | --- |
| 기존 Stage14/15 | AI·검토·서명·예치·직접 청구 로컬 시제품과 과거 실행 기록 | 실제 YBM 통합 환급 서비스 |
| 기존 YBM 진단 | 실제 계정 1개, 응시자·성적 증명 1쌍 연결 | v4 새 신청·지갑 연결, 다계정 안정성, 실명 인증 |
| 기존 Amoy 실험 | 과거 상태의 로컬 포크에서 검증 계약 호환성 | 공개 체인 거래·지급, 현재 배포 상태 |
| W01 | 별도 작업본, 코드 참고본 191개, 환경·의존성 준비 | 제품 구현 완료 |
| W02 | 오프라인 합성 시험 36개 통과 | 실제 증명 생성, TEE, 자격 판정, 지급, DB 동시성 |

각 시험의 수를 합산해 정확도나 제품 완성률로 사용하지 않습니다. 상세 근거는 [감사 기록](reference/AUDIT.ko.md)과 [W02 결과](w02/REPORT.ko.md)에 있습니다.

## 다음 단계

1. 기존 실제 YBM 성공 경로와 새 버전의 TEE·지갑·문맥 호환성 확인
2. 수집 클라이언트 격리, 최소 정보 추출, 임시 저장·삭제 경계 구현
3. 새 실제 증명을 새 신청에 연결하고 800점·시드 수강률 80% 판정과 로컬 지급 검증
4. 중복·변조·기한·장애·직접 청구 및 삭제 검사
5. 비개발자 최소 2명의 사용성 시험

실제 증명 시연과 합성 자료를 사용한 사용자 체험은 별도 결과로 보고합니다. 수동 provider 작성 도구의 오류는 기존 직접 생성 경로 전체가 실패했다는 의미가 아닙니다.

## 후속 범위

실명 본인확인, 실제 학원 API, 원화 지급, 공개 Amoy 지급, 여러 교육기관 지원과 실제 도입·예치 의향 검증은 후속 과제입니다. [PRD](reference/PRD.ko.md)
