# 설치 Moodle peer 소스 인수

PR153 `58953582eb1a625093486e61e207ba5944a8b32e`와 B `4705a3ffc197bcbe4bb127ece40f4ef429b0dc72`를 이력 병합했다. 소스 후보는 `300f21bac357287cbf6cc88ee3d99da8b0825f48`다. 후속 v65는 v64의 검사를 계승하고 원래 v64 파일 지문을 확인한다. 정확히 검토한 HTTP/코디네이터 두 변경만 선행 지문으로 대조한 후 최종 현재 지문을 다시 검사한다. peer/context/HTTP/local 네 모듈과 기존 개발 HTTP 호스트를 추가 인수한다. 총 소스229개, wallet24개 및 보존 artifact11개로 중복 제외263개가 후보 커밋에 결합한다. 후속 guard와 consumer는 별도로 지문 검증한다.

## 권한 검토

B7dd6e38→4705a3f의 production 변경은 observation bridge에서 명시 LOCAL_SYNTHETIC_ONLY 모드의 LOCAL_SYNTHETIC_HTTP 전송기를 허용하는 부분이다. HTTP 구현은 테스트 fixture의 고정 127.0.0.1:18767/observations에 있으며, peer canonical MAC/pin/replay 및 full .3의 subject/course/scope/currentness 검증을 유지한다. 일반 HTTP endpoint나 환경변수로 전송기를 활성화하는 경로는 추가되지 않았다. 최초 confirmation 요청은 준비 필요 오류로 CANCELLED 처리된다. C owner CLI 준비 뒤 같은 attempt의 새 requestRef를 생성해 기존5초 읽기 경계에서 다시 조회한다. 20초 owner 준비 제한은 읽기 제한과 별개다.

기존 설치 C 및 D 통합6/6, binding/context39/39 결과를 재사용했다. 판정은 격리 합성 계정의 설치 Moodle 관측 범위에서 수락이다. C의 native Page 수동 완료를 관측하며 모델은 OFFLINE fixture다. B의 다음 runtime 연결 delta와 A1957d7d 진단 UI는 이번 통합 범위에 포함하지 않는다.

## 검증 경계

v65 provenance는 후보 커밋의 모든 지정 blob과 현재 bytes, 선행 guard 보존, 변경·추가 파일 변조 및 이전 소스 rollback 거부를 검사한다. memory stage 생성 전 검증 실패 시 실행 카운터가 증가하지 않아야 한다. 기존 normal compatibility와 stage 실행 및 E4/E5 보존 검사를 함께 수행한다. 최종 CI 상태는 이 후보 Draft PR의 최신 commit 검사를 따른다.


## 등록형 D 소비자 후속 인수

PR157 `f54520be2af9060ba4ef56db54ad9073c78f7f44`를 기준으로 C가 독립 검토한 PR158 `2910202784d0d63b59600000e2a6d787bccc5b16`의 B `4705a3f` 이후 7파일 delta를 이력 병합했다. 소스 후보는 `c4678c141d577dab41fa69fa970348d80860145e`다. v65 파일은 그대로 보존하고 v66이 context/HTTP 두 파일의 정확한 전후 지문 및 새 registered 서비스 한 파일을 인수한다. 소스230개·wallet24개·보존 artifact13개, 중복 제외266개가 이 후보에 결합한다. 후속 guard/consumer/record는 별도로 검증한다. 현재 후보를 전체 저장소 지문으로 표시하지 않는다.

C의 7파일 검토와 추가5개 경계 검사, 설치 C full .3 → 등록형 D OFFLINE 통과 기록을 재사용했다. 검토에서 실행 중 release/ACK 변경, 동시 실행, 취소 후 늦은 결과, 새 context로 기존 D 등록/소비된 승인 재사용이 거부됨을 확인했다. 로컬 취소가 원격 호출의 즉시 중단이나 비용0을 보장하지는 않는다. 실패 재시도에는 새 owner composition/approvalRef·context·D 등록·별도 승인이 필요하다.

등록 계약은 [PREVIEW_REGISTERED_D](PREVIEW_REGISTERED_D.ko.md)를 따른다. 등록 준비는 승인을 생성하거나 모델 키를 읽지 않는다. 실제 모델 성공, 배포, UI 연결 및 승인 활성화는 이번 소스 인수에 포함하지 않는다.

CI는 D `ff0bef2c57312ddbf7006c295dbc583e3938a822`를 별도 detached worktree로 준비해 기존 등록형 테스트를 실행한다. exact HEAD/clean 상태를 검사하며 no-grant runtime 검사에서는 키 접근·provider 호출이0이어야 한다. 성공 경로는 OFFLINE 모델과 합성 C 관측이다. 설치 C 및 기존 외부 fixture가 없는 검사는 명시적으로 skip하며, 설치 C 검증을 다시 실행하거나 CI의 합성을 실제 설치 성공으로 표현하지 않는다. 기존 product-workflow47개 실패의 원인인 미인수 소스 지문을 v66으로 해결하며 테스트/검증을 생략하지 않는다.
