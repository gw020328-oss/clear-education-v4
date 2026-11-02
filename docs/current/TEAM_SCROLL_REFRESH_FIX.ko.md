# 팀원 화면 자동 조회의 스크롤 복귀 보완

2026-11-02. PR135 병합 b129516 기준 실제 운영자 AI 승인 화면에서 스크롤이 위로 복귀하는 현상이 보고됐다. 팀원 entry의 매초 clearTeamRefresh는 refreshSession의 onChange와 마지막 render 양쪽에서 기본 render를 호출했다. 기본 shell은 사용자 화면 이동에 쓰는 scrollTo(0,0)를 실행하므로 준비 영역을 읽는 중에도 iframe 스크롤을 되돌렸다.

팀원 세션의 onChange와 clearTeamRefresh 완료 렌더에 기존 keepScroll 옵션을 전달한다. 명시적 라우트 이동과 일반 비팀원 렌더는 기존 동작을 유지한다. 자동 조회 실패 시 liveView=null로 이전 판정을 지우는 동작도 유지한다. 실제 실행의 고정 자산·서명·승인 기한은 바꾸지 않는다.

실제 main.js 연결 코드로 구성한 회귀 검사에서 수정 전 성공/실패 조회 두 경로 모두 읽던 위치618이0으로 바뀌어 실패했다. 수정 후 세션 알림과 마지막 렌더 모두 위치를 유지하고 실패 시 이전 판정은 지운다. 비팀원 경로와 기존 준비 컨트롤 검사 포함4/4 통과. 소스 호환51/51과 frozen200개 인수 통과. v54 guard/기록은 보존하고 main.js 단일 변경만 v55로 인수한다. 실제 사용자 재시험 완료의 근거는 아니다.

이번 실제 실행은 AI 승인 대기 중 BC_NORMAL_REVIEW_WINDOW_REQUIRED로 실패 대기가 됐다. FINISH로 종료했고 completed=false/profilesDeleted=true를 확인했다. 해당 신청과 실패 기록은 보존하며 승인·원천 재사용이나 기한 연장은 없다. 새 실행은 이 수정의 검증·병합 후 따로 준비한다.
