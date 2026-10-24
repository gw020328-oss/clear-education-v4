# 후기 출처 사실 → 기존 M1/C2/C3 통합 제안

2026-10-16. **제안이며 공통 계약 변경·제품 수락 승인이 아니다.** [실측/DTO](REVIEW_API.ko.md)와 함께 읽는다. 이번 PR은 담당 디렉터리에만 쓰고 공통 schema/DB/HTTP/application/evaluation·contracts/web·독립 청구·root package/lock/CI는 변경하지 않았다. 다른 세션 메시지/외부 연락도 없다.

## 재사용한 연결과 남은 불일치

기존 M1 `Binding`은 application·subject/bindingRevision·recipient·instance·policyHash/version·product/cohort를 묶고 `SourceBinding`은 institution/providerInstance/course/sourceAccount/accountBindingId/version을 별도로 묶는다. account binding을 신청 Binding 안에 새 필드로 꾸며 넣지 않는다. 기존 C2 `RunContext`는 plan/display/preview·sourceBundle·submission/route/workflow revision·inputHash/manifest·model/profile/run/attempt를 포함한다. 출처 조회가 끝나면 current context와 별도 source pin을 재대조하며 sourceRevision은 관측한 본문/작성자/위치/시각/flag의 canonical digest다.

현재 RunContext는 **SYNTHETIC / DOCUMENT_PRECHECK 전용**이고 C2는 등록 합성 fixture bytes만 받는다. 따라서 LOCAL_LMS_RECORD를 context.mode=SYNTHETIC인 Evidence나 C2 CHECKED로 가져올 수 없다. 이번 local facts는 기존 contract를 **상관관계 운반자**로만 재사용하며, 제출 원문 동일성·ACK·학생 권한·운영 source 진위는 입증하지 않는다. `usableForAcceptance=false`를 유지한다. C3의 실제 source import API는 없고 VERIFIED_SYNTHETIC fixture 수락만 있다.

## 공통 담당에게 필요한 별도 설계

1. **원천/계정 registry**: 인증된 host가 application/subject binding revision과 Moodle instance/course/forum/author 계정·SourceBinding을 결합하고, 검토·변경 주체/이유/시각을 남겨야 한다. 브라우저/후기 본문/AI가 이 pin을 승인하지 못하게 한다. 실명 동일인은 별도 미확정으로 남긴다. reader가 동료 계정으로 볼 수 있다는 사실을 제품의 본인 열람 권한으로 치환하지 않는다.
2. **제출 내용 결합**: 원천 HTML 원본 지문·명시한 텍스트 정규화 버전/지문·source locator/run/revision과 기존 submission inputHash/manifest 지문을 연결하는 별도 LOCAL receipt가 필요하다. 현재 합성-only RunContext의 mode를 조용히 바꾸지 않는다. 이미지/첨부는 이번 API adapter가 수집·검증하지 않는다. 사진 요건은 원문에 있을 때만 검토한다.
3. **수락 시 원자성**: async 조회 완료의 단순 current 대조만으로 영속 수락을 보장하지 않는다. 공통 host가 현재 ACK/policy·source pin·submission/workflow revision을 같은 수락 transaction/CAS에서 재검사하고, 과거 receipt/run은 이력으로 보존해야 한다. 현재 DB가 이 LOCAL receipt를 수락한다고 주장하지 않는다. 원천 수정/삭제 감시·freshness/재조회 시점도 미정이며 이번 두 번 읽기는 원자 snapshot·단조 source revision이 아니다.
4. **AI 읽기 권한/수명**: receipt locator/hash와 허용된 원문만 AI adapter에 제공하고 run/profile/token/cost/cancel/retention 경계를 먼저 정한다. HTML은 실행하지 않고 model instruction으로 신뢰하지 않는다. 원천 사실과 AI의 내용/분량 관찰은 다른 record여야 한다. TEXT/VISION 출력은 게시 진위·내용 진실·기관 인정으로 승격하지 않는다. 이번에는 실제/유료 AI를 호출하지 않았다.
5. **이력/상태**: 성공한 target 조회, 권한/네트워크 불가, 불완전 목록, 타 작성자/반, 내용 변경, 명시 삭제 command 영수증, 연결 누락을 별도로 남긴다. invalidpostid/빈 페이지가 곧 미게시·삭제는 아니다. 단일 target의 확인을 전체 수강후기/기간 이력 완전성으로 넓히지 않는다. 조건 불명확/서비스 실패는 UNKNOWN·보완 사유로 전달한다.
6. **정책·평가 분리**: 일반 후기의 requirement와 실제 학원의 인정 요건은 고정된 정책/공식 근거가 필요하다. 이번 API의 course discussion을 곧 accepted-review로 변환하지 않는다. YBM750+·시원스쿨50~300%만 제품 대상이며 원문상의400/500 경로는 원문을 보존하면서 범위 밖으로 표시한다. 기존400% 사전검토 fixture는 역사적 코드일 뿐 새 개발 범위가 아니다.

이 제안에는 새 공통 enum/HTTP route/상태 전이·기한·DB migration을 확정하지 않았다. source facts → AI observations → eligibility → funding → payment를 분리하고 paymentAllowed=false·grant/outbox HOLD·independentClaim NO_GO를 유지한다. 예치율·배정·회수·PG·72/120시간은 멘토 답변 전 OPEN이다. 이 PR을 병합해도 실제 통합/청구 허용이 열리지 않는다.

## 검증과 인수 항목

- 실제 로컬 Moodle13개: 일반 후기 CRUD·본문/작성 계정/위치·시각·숨김/복구·타 계정/반·매핑 누락·읽기 token 쓰기 거부·삭제 후 불명 상태·인증 실패. 학습21/21은 재실행하지 않았다.
- 새31개 mock/offline + 기존6개 contract: 같은 초 수정·페이지 누락/반복·늦은 submission/route/workflow/run·매핑 변경·취소·clock·응답 한도·token timeout·인자 변경/함수 우회 거부. 실제 API 시험과 별도 분모다.
- C2/M1 통합 지점은 기존 `src/product-workflow/contract.mjs`, `src/document-precheck/workflow-adapter.mjs` 및 `MVP_DOCUMENT_HTTP_CONTRACT.ko.md`; C3는 `MVP_EVIDENCE_HTTP_CONTRACT.ko.md`를 읽고 제안했다. 기존 파일은 수정하지 않았다.
- 루트 CI 편입은 공통 담당의 별도 변경이다. 이번 CI 성공이 신규 후기31개나 실제Docker13개를 실행했다는 뜻이 아니다.

## 2026-10-17 고정 계약 소비 현황

위 문서는 최초 제안 이력이다. 후속 정본 [REVIEW_BRIDGE_V1](../current/REVIEW_BRIDGE_V1.ko.md)의 fixed commit `31879659e11d9cbfa0aa88e48d825047080f4e39`를 정상 merge하여 공유 query/acquisition DTO를 import했다. Moodle 전용 [readReviewAcquisition](REVIEW_API_ACQUISITION.ko.md)는 실제 같은 read의 reader 응답과 facts/query/pin/run을 묶고 시작·완료 hash/lease/current/cancel을 확인한다. 공통 normalizer/registry/lease projection·C2 내용 결합·영속 수락/HTTP/DB는 통합 담당의 별도 관문으로 남는다. 기존 facts v1과 proposal fixture는 변경하지 않았다.
