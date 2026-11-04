# 설치 Moodle peer 소스 인수

PR153 `58953582eb1a625093486e61e207ba5944a8b32e`와 B `4705a3ffc197bcbe4bb127ece40f4ef429b0dc72`를 이력 병합했다. 소스 후보는 `300f21bac357287cbf6cc88ee3d99da8b0825f48`다. 후속 v65는 v64의 검사를 계승하고 원래 v64 파일 지문을 확인한다. 정확히 검토한 HTTP/코디네이터 두 변경만 선행 지문으로 대조한 후 최종 현재 지문을 다시 검사한다. peer/context/HTTP/local 네 모듈과 기존 개발 HTTP 호스트를 추가 인수한다. 총 소스229개, wallet24개 및 보존 artifact11개로 중복 제외263개가 후보 커밋에 결합한다. 후속 guard와 consumer는 별도로 지문 검증한다.

## 권한 검토

B7dd6e38→4705a3f의 production 변경은 observation bridge에서 명시 LOCAL_SYNTHETIC_ONLY 모드의 LOCAL_SYNTHETIC_HTTP 전송기를 허용하는 부분이다. HTTP 구현은 테스트 fixture의 고정 127.0.0.1:18767/observations에 있으며, peer canonical MAC/pin/replay 및 full .3의 subject/course/scope/currentness 검증을 유지한다. 일반 HTTP endpoint나 환경변수로 전송기를 활성화하는 경로는 추가되지 않았다. 최초 confirmation 요청은 준비 필요 오류로 CANCELLED 처리된다. C owner CLI 준비 뒤 같은 attempt의 새 requestRef를 생성해 기존5초 읽기 경계에서 다시 조회한다. 20초 owner 준비 제한은 읽기 제한과 별개다.

기존 설치 C 및 D 통합6/6, binding/context39/39 결과를 재사용했다. 판정은 격리 합성 계정의 설치 Moodle 관측 범위에서 수락이다. C의 native Page 수동 완료를 관측하며 모델은 OFFLINE fixture다. B의 다음 runtime 연결 delta와 A1957d7d 진단 UI는 이번 통합 범위에 포함하지 않는다.

## 검증 경계

v65 provenance는 후보 커밋의 모든 지정 blob과 현재 bytes, 선행 guard 보존, 변경·추가 파일 변조 및 이전 소스 rollback 거부를 검사한다. memory stage 생성 전 검증 실패 시 실행 카운터가 증가하지 않아야 한다. 기존 normal compatibility와 stage 실행 및 E4/E5 보존 검사를 함께 수행한다. 최종 CI 상태는 이 후보 Draft PR의 최신 commit 검사를 따른다.
