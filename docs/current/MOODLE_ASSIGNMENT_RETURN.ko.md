# 강의·과제 복귀 조회의 한정 확장

2026-11-05 A 후보. 기존 `activityReturnOnly` 실행에서 정식 Moodle 항목을 열고 돌아왔을 때 원천을 새로 읽는다. 별도 실행 엔진이나 지급 기능을 추가하지 않는다. C UI·ZIP 인수와 독립 검토 전 실제 실행에 적용하지 않는다.

서버가 고정 mapping으로 발급하는 `clear-student-condition-targets.1`은 동일 origin/course2/application의 page cm3/instance1, assign cm4/instance1, forum cm5/instance3을 제공한다. URL은 클라이언트에서 기존 정식 모듈 경로로 조립하며 브라우저가 임의 원천을 지정하지 않는다. 예전 page 단독 mapping도 유지한다. forum은 이동·조회 전용이며 이 경로에서 AI를 호출하지 않는다.

기존 `refresh-activity` 명령은 선택적 `criterionId`를 받는다. 생략하면 기존 activity-complete, 명시하면 activity-complete 또는 assignment-submitted만 허용한다. POST `/bootcamp/v4/applications/:applicationId/source-refresh` 본문은 기존 `{criterionId,expectedRevision}`이고 기존 단회 Moodle 명령 승인과 같은 참가자·신청·revision 검사를 사용한다. 원래 소모된 명령의 intent/identity/context/hash/만료를 비동기 수집까지 유지한다. 다섯 초 전송 grant를 연장하지 않는다. reflection-topics와 HackerRank는 허용하지 않는다.

기존 QUEUED/RECORDED/UNAVAILABLE/RATE_LIMITED 응답, 동시 작업 한 개·최소 5초 간격·실행당 12개 제한을 유지한다. 등록·동의·지급 쓰기는 활동 전용 실행의 기존 제한으로 막힌다. 활동 전용 실행에도 기존 null procedure ports를 선택해 미등록 지급 체인 조회를 피하고 NOT_IMPLEMENTED/null 표시를 유지한다. 일반 실행의 등록형 ports와 실패 거부는 유지한다.

검증은 `normal-assignment-return`, `moodle-live`, `moodle-native-workflow`, `normal-frontend` 43개 통과다. 합성 네트워크/저장소 및 명령 fixture를 사용했다. 실제 학습·제출·카드 갱신 성공은 아직 확인하지 않았다. 새 회고 선택과 AI 비용 승인은 별도 현재성 검토가 필요하며 과거 selectedPostId1을 새 회고로 취급하지 않는다.

같은 persistent Moodle DB의 읽기 검사에서 매핑·자동 열람 완료 규칙·과제 제출 설정·과거 완료/제출 상태는 일치했다. 그러나 교재와 과제/회고 안내는 synthetic fixture 내용이어서 실제 학습 자료의 준비가 남아 있다. 기존 학습 결과를 초기화하거나 직접 완료 처리하지 않는다. 실제 글·답안·학습 행동은 사용자가 수행한다.

## 원래 source grant의 단조 시계 상한 보정

독립 검토에서 기존 activity 경로에도 존재했던 수명 결함을 확인했다. 원 source grant의 wall 만료는 보존했지만 더 긴 intent/run 단조 시계만 검사하여, wall이 멈추고 단조 시계가 원 source grant 만료를 지난 경우 거부하지 못했다. authorization 때 저장한 command.t의 wall/mono와 원 grant 만료로 sourceMonotonicEnd를 계산한다. reserve/capture 시각에서 기한을 새로 시작하지 않는다. 수집 fence는 wall·source mono·기존 intent/run 상한을 모두 검사한다. POST의 5초 기한·단회 소비·로그아웃 검사는 그대로다.

`normal-assignment-return`, `moodle-live`, `normal-certificate-start` 24개 통과. 추가 회귀 네 개는 activity/assignment 각각의 wall/mono 배타적 만료와 예약 2초 지연에도 원래 20초 source 기한 보존, POST 만료 뒤 원 source 기한 안의 정상 fence 및 소비 명령 재실행 거부를 검증한다. 실제 런타임 적용은 독립 후속 검토 뒤다.
