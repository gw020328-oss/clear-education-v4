# 팀원 LLM에게 처음 보낼 프롬프트

이 문서 PR이 `develop`에 병합된 뒤, 팀원이 자신의 CLEAR checkout에서 아래 내용을 새 대화의 첫 메시지로 보낸다. 첫 작업은 [계획 F0](TEAM_PLAN.ko.md)이다. 저장소 접근 권한·고정 Node 버전은 [인계 문서](TEAM_HANDOFF.ko.md)를 참고한다.

---

CLEAR v4 개발을 함께 진행하자. 저장소는 https://github.com/gw020328-oss/clear-education-v4 이고, 나는 우선 프론트엔드·지갑 UX·브라우저 검증을 맡는다. 다른 담당자는 백엔드·증명·DB·계약을 맡는다. 역할은 조정 가능한 제안이고, 이번 요청은 첫 작업 F0만 구현하는 것이다.

먼저 현재 checkout과 미커밋 변경을 확인하고, AGENTS.md → docs/current/TEAM_HANDOFF.ko.md → TEAM_PLAN.ko.md → API_CONTRACT.ko.md → docs/development.md → CONTRIBUTING.md 순서로 읽어줘. TEAM_*와 API_CONTRACT는 모두 docs/current/ 아래에 있다. 최신 origin/develop과 관련 열린 PR도 확인해 중복 작업을 피하고, 기존 변경을 덮어쓰지 마. 문서가 없다면 인계 문서 PR의 병합 여부부터 확인하고 누락된 내용을 추측하지 마.

이번 목표는 F0: web/에 합성 데이터 기반 참가자 신청 목록·상세 화면 골격을 만들고, 독립 실행·빌드·검토가 가능한 작은 PR로 올리는 것이다. 기존 웹 구현이 이미 생겼다면 재사용하고 F0 완료 여부를 먼저 확인해줘. 이미 끝난 작업이면 다음 PR을 임의로 시작하지 말고 결과를 알려줘.

프레임워크는 현재 저장소를 확인해 최소 구성으로 선택하고 이유를 적어줘. UI와 데이터 adapter를 분리해 후속 C1/F1 실제 API 연결이 가능하게 해줘. 빈 목록, 로딩, 오류, DRAFT/TERMS_ACCEPTED/CONSENTED/FUNDING_PENDING/ENROLLED를 합성 fixture로 보여줘. 화면에는 합성 데모임을 표시하고 ENROLLED를 환급 가능·지급 완료로 표현하지 마. 좁은 화면과 키보드 사용도 확인해줘. API가 아직 실행 서버로 제공되지 않는 점을 고려하고 인증·Secure cookie·origin 검증을 약화해 연결하지 마.

실제 로그인·서명·거래·증명 수집, 백엔드/DB/계약 변경, 미래 proof/청구 API 구현은 이번 범위 밖이다. 개인키·쿠키·실제 개인정보를 읽거나 저장하지 마. legacy/와 docs/reference/를 수정하지 마. Node/DB/수집 모듈을 브라우저에 넣지 마.

최신 origin/develop에서 codex/frontend-shell 브랜치를 만들되 같은 이름이 있으면 상태를 확인해 덮어쓰지 마. ./tools/node와 ./tools/npm을 사용하고 전역 환경을 변경하지 마. 필요한 프론트 의존성은 web/ 안에 한정하고 설치·실행·빌드·검증 방법을 문서화해줘. 관련 검증, verify:workspace, 변경 내용 리뷰와 공개 이력 검사를 수행하고 develop 대상 PR을 올려줘. 미완료는 Draft로 표시하고 코드/화면 검증과 CI 결과를 정확히 적어줘. PR 병합·브랜치 삭제·권한 변경은 하지 마.

시작할 때 현재 구현, F0 범위와 수정할 파일, 추천 모델·추론 수준을 짧게 알려주고 바로 진행해줘. 필요한 정보가 있으면 독립 가능한 작업을 계속하면서 질문해줘. 마지막에는 PR 링크, 실행 방법, 검증 결과, 남은 의존성을 정리해줘.

---

후속 작업에서는 위 프롬프트의 목표를 해당 계획 ID 하나로 교체하고, 병합된 의존 PR 링크를 덧붙인다. 대화 기억만으로 현재 상태나 API를 판단하지 않는다.
