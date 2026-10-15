# AI/Vision 평가 준비 도구

**PREPARATION_ONLY / MOCK_ONLY / NOT_A_PRODUCT_CONTRACT**. M1/M2 소비 계약 대기 중인 #39의 독립 단위다. 공통 DTO·정책·문서 검토 API와 연결하지 않는다. 네트워크 client, 유료 모델 adapter, 이미지 생성/판독, 파일 업로더가 없다.

`case-specs.json`은 기존 31개 사례, 후기·블로그 11개, 별도 일반화 3개의 **명세 목록**이다. 실행 가능한 gold corpus나 45개 모델 평가 성공 기록이 아니다. 개발/holdout 기반 이미지·gold 라벨·원문 locator 고정은 후속이다. 현재 시연 프로필의 400%는 사전검토만, 500%는 제외한다. 평가 엔진은 브랜드별 분기 없이 요구사항/기대값을 받아 비교한다. 제3 정책 프로필의 실제 M1/M2 소비 검증은 계약 전달 뒤 수행한다.

`evaluation.mjs`의 내부 record는 평가 도구용이다. M0/M1/M2의 필드/상태가 아니며 제품 코드가 import하면 안 된다. 신뢰한 mock adapter의 응답만 받아 expected facts/labels/questions와 비교한다. 금지 label, 누락 질문, 잘못된 타입/추가 승인 필드를 실패로 기록한다. 입력·raw 응답·오류 원문은 보고서에 담지 않는다. 임의 코드를 격리하는 sandbox는 아니다.

```sh
./tools/node spikes/ai-vision-preparation/run.mjs
./tools/node spikes/ai-vision-preparation/run.mjs --self-check
./tools/node --test spikes/ai-vision-preparation/*.test.mjs
```

첫 명령은 목록 수와 지문, 준비 미완료 상태만 출력한다. `--self-check`는 작은 합성 텍스트와 scripted mock 응답으로 **평가 도구 자체**가 오류를 잡는지 확인한다. 주입 문구를 읽는 실제 모델 시험이 아니며, 전체 45개 사례를 실행하지 않는다. 실제 모델 지연/가격/정확도는 측정하지 않는다. 그 외 인자는 거부한다.

신뢰한 adapter라도 각 요청에 취소 signal을 전달하고 timeout/cancel/refusal/error를 고정 코드로 보고한다. 재시도는 없다. abort를 무시한 adapter의 늦은 응답은 해당 결과를 덮을 수 없지만, 자원/네트워크 종료를 보장하는 기능은 아니다. 실제 provider를 넣기 전에 요청 중단·비용·입력 보존을 별도 검증해야 한다.

실제 모델 adapter는 이 준비 단위에서 지원하지 않는다. ACTUAL mode는 호출 전에 거부한다. 키가 있어도 이 도구가 자동 검색/전송하지 않는다. mock response에 근거 없는 `ELIGIBLE`/`VERIFIED`가 있으면 evaluator가 실패를 검출할 수 있지만 실제 제품 gate를 검증했다는 뜻은 아니다.

자세한 기준·소유 경계·공통 담당에게 요청한 필드는 [준비 보고](../../docs/ai-vision/PREPARATION.ko.md)에 있다.
