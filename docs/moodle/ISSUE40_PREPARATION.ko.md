# 이슈 #40: 공통 계약 전 독립 준비

2026-10-15. 기준 `origin/develop` = `21776f53d7660597b94a37c89139316e43eeb673`.
[이슈 #40](https://github.com/gw020328-oss/clear-education-v4/issues/40)의 준비 PR이며 L1/L2/L3 전체 완료가 아니다. 기존 [M0](../current/M0_CONTRACT.ko.md)의 `clear-m0.2`는 mock용이고 소비자 합의는 PENDING이다. M1 [#37](https://github.com/gw020328-oss/clear-education-v4/issues/37), M2 [#38](https://github.com/gw020328-oss/clear-education-v4/issues/38)의 버전·커밋·예제·소유 경계·착수 신호 뒤 연결한다.

## 이번 변경

- [평가 사례](../../tests/moodle-preparation/cases.mjs): 90/100일 합성 장기 이력, 7일/70%의 다른 정책 사례와 정확경계·진도/배속 미확인·종료/날짜·중복·원천/계정/수정/페이지 실패를 준비한다. `TEST_VECTOR_ONLY`이며 제품 DTO나 실제 평가 결과가 아니다. expected는 검토용 기대값이고 evaluator 실행으로 얻지 않았다.
- 같은 source facts에 85%와 90%의 다른 시간 정책을 적용하는 기대 결과를 제공한다. 수집기는 브랜드를 판단하지 않고 사실을 제공하며, 제한된 규칙 타입/버전 설정을 받는 별도 평가기가 판정하는 방향이다. 90/100일·60/90%를 일반 엔진의 고정 분기로 만들지 않는다.
- [패키지 검사기](../../spikes/moodle-preparation/preflight.mjs): 명시적으로 지정한 공개 실험 패키지만 [독립 고정 지문](../../spikes/moodle-preparation/source-pins.json)과 읽기 전용 대조한다. 패키지가 보내는 manifest를 새 trusted pin으로 채택하지 않는다. 네트워크·Docker·토큰·DB·키를 취득/사용하지 않는다. 지문 일치는 source 진위/사람의 시청/기관 승인·제품 연결을 뜻하지 않는다.
- [격리 환경 계획](../../spikes/moodle-preparation/environment-plan.json): 새 project/loopback port/volume 후보를 예약하는 문서 데이터다. 실행 가능한 compose나 환경 생성기가 아니다. PostgreSQL image digest는 아직 null이며 새 환경 시작 전에 확정한다. 기존 환경의 source mounts/volume/계정/토큰을 재사용하지 않는다.

원본 `output/CLEAR_개발계획_2026-10-14/moodle/REVIEW.txt`와 normalized-schema/example, `output/CLEAR_Moodle_오류수정검증_2026-10-14`를 재검토했다. 앞선 schema는 `DRAFT_INTERFACE`이므로 새 제품 schema로 복사하지 않았다. 과거 실제 30초 재생/REST 성공과 실시간 fake 허용 한계는 [기존 연결 명세](../current/LEARNING_PROVIDER.ko.md) 및 위 실험 패키지와 구분한다. 코드나 기존 실제 환경을 실행하지 않았다.

## 공통 담당에게 필요한 계약

| 합의 대상 | 준비한 구분 / 아직 필요한 결정 |
| --- | --- |
| 규칙·단위 | TIME/PROGRESS를 별도 취급, ms 유효시간/영상구간/위치와 progressBps 분리. 새 rule DTO·초 절삭/반올림·종료 의미·타입/한도·version은 M1 계약 필요 |
| 기간/시간대 | calendar 시작일·일수·endExclusive·현재일 cutoff. 미래일뿐 아니라 아직 닫히지 않은 오늘도 확정 결석으로 처리하지 않는 사례 제공 |
| 활동 | 허용 목록과 필수 목록 분리, bonus/download 제외·OT 포함은 profile inventory 설정. 모의시험/후기는 별도 evidence로 남김 |
| 주체/기관 | institution/provider instance/course/subject binding과 revision의 독립 trusted context. `local_clearwatch_read`는 토큰 주체의 본인 기록만 읽음 |
| 원천/전체성 | `NO_RECORD`와 `UNAVAILABLE`, 숨김/누락과 부분페이지, current revision·동일revision 내용 충돌·정정 미확인 구분. manifest API는 L2에서 별도 구현 필요 |
| 의미/capability | 현 read에는 공식 progress·속도 준수·current revision·전체기간 export가 없음. 정책 설정으로 사실/의미를 발명하지 않고 UNKNOWN. 신규 기관은 별도 취득/의미 검증 필요 |
| 결과/최종성 | 로컬 학습 PASS/IN_PROGRESS/NOT_REQUIRED와 공통 MET/COLLECTING/요구제외의 정확 변환, ON_HOLD/NOT_MET 우선순위, FINAL 조건을 M2에서 합의 |
| 소유 경로 | 이번에는 `tests/moodle-preparation`, `spikes/moodle-preparation`, `docs/moodle`만 사용. 후속 L1/L2/L3 전용 경로, shared DTO import와 L4 수락/DB 변경은 공통 담당과 확정 |

학습 PASS는 전체 자격 PASS가 아니며 재원 배정·지급도 아니다. 시원스쿨 성적 OR 경로의 학습 NOT_REQUIRED를 출석 의무로 변환하지 않는다. 데이터/프로필이 unsupported이면 질문/보류이며 임의 코드를 생성하거나 지급 gate를 끄지 않는다. 400% 자동 자격·지급 금지, 500% 시연 제외는 capability 경계로 유지하고 엔진 전체를 해당 환급 숫자에 고정하지 않는다. 예치 정책 미확정, grant/outbox 보류, 독립 청구 제품 NO-GO와 Mac 실패 원인 미확정은 유지한다.

## 실행과 검증의 의미

고정 Node 24.21.0 환경에서:

```sh
./tools/node --test tests/moodle-preparation/*.test.mjs
./tools/node spikes/moodle-preparation/preflight.mjs --source-package /absolute/public/package
./tools/npm run verify:workspace
./tools/node tools/check-public-content.mjs HEAD
```

신규 clone에 고정 런타임이 없으면 기존 검증된 Node 배포본의 `bin`을 현재 명령의 PATH에만 넣을 수 있다. 공통 `.toolchain`/전역 Node를 수정하지 않는다. root dependencies/lock/scripts/CI는 변경하지 않으며 이 준비 시험을 기존 CI에 자동 추가했다고 주장하지 않는다.

fixture 시험은 corpus의 합성 표시·날짜/장기 수·경계 벡터·서로 다른 기대값의 일관성만 검사한다. 패키지 시험은 읽기 도구의 정상/변조/누락/경로/심볼릭링크/크기 거부를 검사한다. **L1 평가기가 이 사례들을 통과했다는 증거가 아니다.** 코드 작성/검사 통과와 실제 Moodle 재생·API/기관 연결·제품 자격/지급을 별개로 보고한다.

2026-10-15 로컬 검증: 합성 평가 벡터 45개를 준비하고 corpus/패키지 도구 시험 11개 통과(실패/skip 0). 명시 지정한 기존 공개 패키지 32파일 지문 일치, workspace의 원본/legacy 191파일·공개 reference 4개 보존 검사 및 diff 검사 통과. 최초 패키지 실행에서는 한글 파일명을 거부하는 입력 검사가 발견돼 Unicode 문자 경로를 허용하되 traversal/절대경로/심볼릭링크 거부를 유지하는 수정과 회귀시험을 추가했다. 원천 내용은 바꾸지 않았다. 실제 API/Docker/평가기·지급 시험은 실행하지 않았다. 원격 CI는 PR의 최종 head에서 별도 확인한다.

검사기는 일반 파일시스템의 오프라인 도구다. 공격자가 동시에 상위 디렉터리를 교체하는 환경의 보안 sandbox를 제공하지 않는다. 고정된 공개 자료에만 사용하며 알려지지 않은 계정·DB·secret 경로를 넘기지 않는다. 결과에는 절대 입력 경로·파일 내용·원천 raw 오류를 출력하지 않는다.

## 후속 PR

1. 공통 계약 적합성: 버전·예제·소유 경계를 기록하고 test notation을 소비자 계약에 명시적으로 매핑한다. 현재 준비 상태를 #40에 남기며 긴 폴링을 하지 않는다.
2. L1: 설정된 규칙을 받는 순수 일별 평가기. 같은 기록/다른 정책, UNKNOWN, 현재일/미래·자정/중복·OR를 실제 evaluator 인수시험으로 실행한다.
3. L2: 새 격리 Moodle에 export/current revision/일관 snapshot·정정·명시적 absence를 추가. 설치/업그레이드/롤백·라이선스와 원천 의미 검증.
4. L3: 공통 binding/권한을 사용하는 read-only HTTPS driver. credential 비노출·부분실패·redirect/revocation·변경검사. exchange/begin을 호출해 playback을 방해하지 않음.
5. L4/L5: 공통 소유자와 collection 수락·복구를 합의한 뒤 짧은 새 실제 재생. 장기 합성90/100일과 `LOCAL_LAB`을 명확히 분리.

실제 원천의 의미/권한·소비자 적합성 및 공통 통합 검토 전에는 제품 자격 gate를 유지한다. 이번 PR은 Draft이며 자동 병합하지 않는다.
