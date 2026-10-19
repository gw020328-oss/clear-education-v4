# 후기 query/acquisition 고정 계약 소비

2026-10-17. 요청 설정 GPT-6.1 Sol / Medium이며 실제 런타임 모델 ID는 독립 확인하지 않았다. 기존 PR71/`codex/moodle-review-api`에서 공통 고정 commit **`31879659e11d9cbfa0aa88e48d825047080f4e39`**(Draft PR74)을 정상 merge했다. merge commit `2be6636`이며 충돌은 없었다. 공통 파일은 복사/직접 수정하지 않고 import한다. 이 의존 PR은 develop에 병합된 것으로 간주하지 않는다. 정본은 [REVIEW_BRIDGE_V1](../current/REVIEW_BRIDGE_V1.ko.md)이며 기존 proposal fixture를 제품 wire로 확장하지 않았다.

## 구현과 호출

[`readReviewAcquisition`](../../src/review-evidence/moodle/acquisition.mjs)는 다음 인수를 받는다.

```js
const {facts, acquisition, sourceReceiptHash} = await readReviewAcquisition({
  client, context, query,
  getCurrentQuery, getCurrentContext, getCurrentPin,
  signal, now: () => Date.now(),
});
// sourceReceiptHash === reviewAcquisitionHash(acquisition)
```

host가 발급한 `clear-review-query.1`과 context를 시작 시 clone/freeze하고 query.pin으로 기존 `readReviewFacts`를 호출한다. `readReviewFacts`의 구현·facts v1 DTO·기존 transport는 바꾸지 않았다. 같은 read 실행에 넣은 전용 client proxy가 **실제 `core_webservice_get_site_info` 응답의 userid**를 복제/포착한다. 예상 readerId를 관측값으로 복사하거나 별도 site_info 요청으로 대체하지 않는다.

시작·완료 때 공유 `assertReviewQueryCurrent`로 현재 query hash와 발급/만료 lease를 대조하고 context·pin도 재검사한다. 현재 callback 조회 사이 query 변경을 잡기 위해 context/pin 조회 뒤 query를 다시 확인한다. sourceGeneration/attempt/sourceRunId/registryHash/pin/run 등이 달라지면 폐기한다. 기존 facts의 시계 검증에 더해 래퍼의 관측 시계 역행을 거부하며, envelope/hash 계산 뒤 반환 직전에도 lease/취소를 확인한다.

성공 facts에 공유 `createReviewAcquisition({facts,query,observedReaderId})`를 적용한다. `factsHash`, sourceRevision, query/pin/registry/run, reader 및 관측 시각은 그 실행의 캡처와 묶인다. 반환되는 acquisition은 공유 DTO 그대로이고 raw HTML/자격증명은 넣지 않는다. `sourceReceiptHash`는 공유 `reviewAcquisitionHash`의 결과다. HTML은 원문 그대로 메모리 facts에 남으며 이 모듈은 정규화하지 않는다.

인증/권한/timeout/삭제·페이지 불명/본문 변경·stale·취소 때 성공 결과를 반환하지 않는다. 지난 호출의 성공 receipt를 캐시하거나 fallback하지 않는다. 기존 `REVIEW_*` 수집 오류와 공유 `RB_*` 검증 오류를 유지하며 신뢰한 callback/주입 transport의 비정형 진단은 `REVIEW_UNAVAILABLE`로 내린다. 호출자가 별도로 HTML/토큰을 출력하지 않아야 한다. 결과는 메모리 동결 객체이며 별도의 DB/로그/네트워크 API를 만들지 않았다.

## 검증 분모

[오프라인 acquisition 시험](../../tests/moodle-review/acquisition.test.mjs) **44/44**, 기존 Moodle client/facts **31/31**, 공유 bridge/source 계약 **26/26**, 총 **101/101 PASS**. 외부 네트워크 tripwire를 적용한 mock 응답·공개 합성 벡터 시험이다.

- 실제 응답 reader 관측, 원문 HTML 보존, v1 facts와 동일 결과, 공유 validator/hash 및 권한 gate.
- wrong observed reader/누락 reader, 다른 course/forum/author pin, current pin·query reader 변경, run pin 불일치.
- 시작/완료 generation/attempt/sourceRunId/registry 변경, 발급 전/정확 만료 경계/완료 callback 중·최종 발급 경계 만료.
- 늦은 submission/route/workflow/run, 계정 매핑 변경·caller query 변조, 시작/응답/완료 취소, 시계 역행.
- 권한·인증·네트워크·timeout·삭제/불완전 페이지·같은 초 수정 때 성공/fallback 없음, facts/body/hash·receipt reader 변조, 원문 형식 한도 및 진단 비노출.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/moodle-review/*.test.mjs tests/product-workflow/review-bridge-contract.test.mjs tests/product-workflow/review-source-contract.test.mjs
./tools/node tools/verify-workspace.mjs
./tools/node tools/check-public-content.mjs HEAD
```

workspace 원본191개·공개 참조4개·의존성 보존 및 diff 검사도 통과했다. 원격 CI의 exact head/결과는 Draft PR71을 따른다. root CI를 수정하지 않았으므로 **새 acquisition44개는 기존 CI에 자동 편입되지 않는다**. 원격 성공으로 해당44개를 실행했다고 표시하지 않는다.

이번 추가 실제 Moodle 시험은 **0건**이다. 네트워크 client와 facts v1은 그대로이므로 별도 API/자격증명을 새로 만들거나 Docker를 시작하지 않았다. 기존 [13/13 실제 로컬 합성 API 결과와 정리](REVIEW_API.ko.md)는 2026-10-16 구현의 근거로 보존하고, 새 acquisition 실측으로 합산하지 않는다. 기존 볼륨·계정·비밀·다른 DB에 접근하지 않았다. 실제 학원/개인자료·Gemini·지급 호출도0이다.

## 남은 관문

current callback 조회는 인증된 host가 제공한다. callback 사이의 DB CAS/원자 snapshot·전역 정책 감시·수정/삭제 이후 가용성은 보장하지 않는다. 반환 뒤 query lease 만료/새 query가 생기면 소비자는 현재성을 다시 확인해야 한다. receipt는 내용·실행 상관관계/변조 대조 수단이며 서명·실명 본인확인·기관 인정·C2 제출 동일성·운영 수락이 아니다.

공통 HTML/registry/lease·projection 발급과 양쪽 adapter 통합은 통합 담당의 후속이다. C2 submission inputHash/assetsHash와 원천 본문의 결합, raw lease/열람 권한, 영속 correlation ledger·원자 수락/HTTP/DB는 여기서 구현하지 않았다. 기존 C2합성-only/개인자료 제한을 유지한다. 이 어댑터는 신청·정책을 승인하거나 AI observations/eligibility/funding/payment를 생성하지 않는다.

공유 BRIDGE_GATES와 facts의 usableForAcceptance/paymentAllowed=false·독립청구 NO_GO를 유지한다. grant/outbox HOLD,400/500 신규범위 제외,예치율·배정·충전·PG·회수·분쟁시간 OPEN이다. develop/main merge·배포·외부 연락은 수행하지 않는다.
