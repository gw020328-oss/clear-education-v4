# v7 소스 인수와 HR PR103 소비 방법

2026-10-22 본부가 통합 세션에 v7 intake 및 memory-stage/E5 A/B 최소 guard 변경을 지정했다. HR producer는 `e658b4026b44f800b607d2d7db64e14f3fd81666`, API/UI source candidate는 `b07be3c928e476a2b6f1414bc8287a63bac28a7a`다. 요청 검토 설정은 Astra / High이며 실제 런타임 모델 ID는 독립 확인하지 않았다.

`hackathon-test-memory-source-intake-v7.json` SHA-256은 `4b82c1356b95e284d52e166928dc70823548e4ee1e1bb6785c221398c5740107`다. v6의 36개 중 실제 변경 6개(HTTP, live HR consumer, HR collector, normal-chain/live-context/prepare-live-input)를 명시한다. HR worker/parser/recipe/verifier/prepared/managed/request/values, UI broker/HTTPS host/명시적 동의, 기존 policy/spec/YBM client/route/Mac 저장 코드의 정적·문자열 동적 import 전이 의존 85개와 의존성 잠금/고정 mapping/계약 자산 13개를 함께 고정한다. 이 중 변하지 않은 의존은 인수 기록에서 별도로 표시하며 전체를 다시 구현·중복 리뷰했다고 주장하지 않는다.

기존 v6/36개, v5 및 이전 source/정책/E2/금고 인수 기록은 수정하지 않았다. 각 원래 Git candidate와 정확한 원본 바이트를 검사한다. 새 `reviewed-source-v7` guard는 정확한 새 intake·candidate·producer·6개 변경만 소비한다. memory harness는 helper 자체도 정확히 고정하며, 기존 E4/E2 pin을 새 hash로 덮지 않고 독립 검사한다. E5 A/B guard 변경은 `normal-source-pins-v4.json`에 이전 값·새 값과 helper 추가로 기록한다. 임의 hash override/allowlist 확대나 자금·권리 계약 변경은 없다.

HR 동일 TLS hook이 구조를 검사한 response와 최종 signed fields/request/role의 private provenance 결합을 소스에서 검토했다. 실제 UI source signing은 [C2 경계 문서](BOOTCAMP_C2_UI_BOUNDARY.ko.md)를 따른다. 서버 TEST 참여자 키 fallback을 제거하고 승인 worker `.3`만 실제 소비한다. 숨긴 구조는 trusted worker의 검사이고 Attestor 단독 독립 구조 증명이 아니다. 실제 hosted 형식/증명 성공은 아직 확인하지 않았다.

로컬 guard 검증 21/21 PASS이며 변조된 intake/collector/verifier/worker/UI/동의/의존성 잠금/Mac 저장/helper를 EVM 생성 전에 거부한다. UI/기존 HTTP/원천 소비/동의 관련 34/34 PASS와 E5 A/B 보존 스크립트 PASS는 별도 분모다. 새로운 source/registry/로그인/AI/실제 신청/realm/거래는 0이다. 기존 실제 run3 지급을 재실행하지 않았다. 메모리 stage48개와 기존 AI 준비 수명20개 회귀68/68도 통과했다. 마지막 수집 전 recipe 차단 보완은 별도6/6이며 그 뒤 exact v7 guard21/21 및 A/B 보존을 확인했다. 새 head 원격 CI는 별도로 확인한다.

PR103 담당은 이 변경을 파일별 복사하거나 v6 collector hash만 교체하지 않고 기존 stacked base에 통합 인수 commit의 정상 이력을 병합한다. 현재 producer `e658`는 이미 통합 이력의 조상이므로 충돌 시 guard를 별도 편집하지 말고 통합 담당에게 알린다. 병합 후 기존 Public synthetic 실패 `39773487345`를 재실행하지 말고 새 head에 발생하는 CI만 확인한다. 필요한 로컬 검사는 `normal-source-compatibility`, `memory-source-gate`, E5 `preservation.mjs`, E5 B `source-pins.mjs`이며 공식 저장소의 고정 `tools/node`를 사용한다.

현재 범위는 호환성 인수다. persistent runtime/전체 정상 시연/실제 HR trust·proof/새 AI 승인/배포·공개 체인/자동 병합 허용으로 해석하지 않는다. 이 경계 단위 이후 일반 연결은 Sol 기본 설정으로 되돌릴 수 있으며 canonical claim receipt HTTP 조회와 브라우저 화면 연결이 남는다.
