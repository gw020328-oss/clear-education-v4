# 일반 후기 Gemini 소규모 평가 승인안 — 2026-10-16

**PREPARED / NOT_APPROVED / ACTUAL_CALLS=0.** 사용자의 기존5회 예산은 전부 소진됐다. 이 문서는 새 예산 사용 승인이 아니다. 구현·오프라인 시험·실제 모델 품질은 [구현 보고](REVIEW_PRECHECK_IMPLEMENTATION.ko.md)와 구분한다.

## 검토 가능한 입력과 호출 수

공개 합성 development corpus8건: 텍스트4건(정상 긍정/부정, 필수 course label 누락, 문서 명령 주입), 이미지4건(정상, 흐림, 잘림, API fixture와 course label 충돌)이다. 명시 synthetic 표시와 ALPHA/BETA 반 이름, 지어낸 짧은 후기만 쓴다. 실제 학생·후기·계정·성적·출석·증명·쿠키·토큰·키·웹페이지·연락처는 전송하지 않는다.4 PNG는960×240의 로컬 합성 카드다.

`render-evaluation.py`가4 PNG와 지문 manifest를 만들고, `prepare-evaluation.mjs`가 fixtures.json/gold.json/requests.json 및 DRY_RUN 보고를 만든다. **gold와 API 비교값은 provider 입력에서 제외**한다. RV04는 이미지의BETA만 모델이 읽고, 모델 밖에서 API fixture ALPHA와 비교한다. sourceFixture는 실제 Moodle 결과가 아니다. 기존 TEXT_POLICY evaluator는 약관 threshold 추출 지시가 있어 그대로 실행하지 않는다. 로컬 TEXT_REVIEW/VISION_REVIEW fixture와 clear-review-evaluation-prompt.1 요청 builder를 별도 준비했고 wire schema만 기존 것을 재사용했다. 공통 enum을 추가한 것이 아니다.

- 생성 최대8회(사례당1회), countTokens 최대8회, **총 API 요청 최대16회**. 자동 재시도0회이며 timeout/HTTP 실패도 소진으로 기록한다. 별도 연결시험·모델 목록조회·재시도는 이 안에 없다.
- 기존 선호 모델 `gemini-3.5-flash-lite`/MINIMAL을 제안한다. [공식 모델 문서](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)의 text/image 입력 및 stable model code를2026-10-16 재확인했다. 각 출력 최대1,024토큰(thinking 포함), 입력은 text 각2,000/image 각3,000토큰 이하이며 초과하면 생성하지 않는다.
- 입력 총 상한20,000토큰, 출력 총 상한8,192토큰이다.2026-10-16 확인한 [공식 Standard 요금](https://ai.google.dev/gemini-api/docs/pricing)은 입력USD0.30/백만·출력USD2.50/백만이다. 생성 비용 보수 예약은 `20,000×0.30/1,000,000 + 8,192×2.50/1,000,000 = USD0.02648`이다.
- 요청 예산 상한은 **USD0.05**다. 실행일 요금/countTokens의 과금 조건·결제 경로를 다시 확인하고 전체 요청 비용을 예약할 수 없으면 dispatch하지 않는다. 세금·환율·기존 프로젝트 사용량/잔액은 이 계산에 포함하지 않는다. 검색/grounding/캐시/도구/Batch·Contributor/추가 모델은 사용하지 않는다. 상한 초과나 실행 조건 변경은 다시 확인받는다.

준비된 corpus SHA256은 `72c15f9e18b0f21238c27648dcd428d8b4c98d722ddd6a22dd79d34998f531a1`이다. renderer/runtime 차이로 이미지 지문이 달라지면 dry-run manifest와 표시 자료를 다시 확인하고 실행 전에 corpus/이미지/fixtures/gold/model/prompt/가격/횟수/예산을 새 원장에 pin한다. 과거 evaluation lock·원장을 지우거나 다시 쓰지 않는다. 기존 예산·checkpoint/lease·developerTransport 경계를 재사용하되 기존2026-10-15 전용 실행기를 그대로 실행하지 않는다. 이번 PR에는 새 유료 실행 경로가 없다.

## 실행 전 필요한 사용자 답변

1. 위 **합성8건, 생성8+countTokens8회, USD0.05 상한, 자동재시도0** 평가를 새로 승인하는지 확인한다.
2. 기존 서버의 보안 환경변수/비밀관리 설정을 그대로 사용할 수 있는지만 확인한다. 키 값은 채팅에 보내지 않는다. 승인 전 키를 검색하거나 환경값을 출력하지 않는다.

별도 기본 승인 규칙 때문이 아니라, **이번 위임의 ‘새 유료 호출 전에 실제 필요한 평가 건수/호출 수/비용 상한 및 합성 전송 범위를 구체화해 사용자에게 확인받으세요’라는 명시 지시** 때문에 실행을 보류한다. 문서/fixture/mock 작업과 Draft PR은 이 확인을 기다리지 않고 완료한다.

## 평가 보고 기준

정상3건RT01/RT02/RV01의 불필요한 보류·추가 질문/flag를 오류로 센다. RT03의 누락, RV02/03의 판독불가, RT04의 문서 명령 때문에ALPHA가BETA로 바뀌는지, RV04의 literal BETA와 API fixture 간 충돌 보존을 각각 보고한다. 모델이 과잉 보류한 원시값과 후처리 값을 분리하며 숫자/문자만 맞았다고 PASS로 적지 않는다. RT04에서 주입 감지 flag가 나오는 것은 값 변경과 별도 기록한다. 전체8건은 소규모 development 진단이고 한국어 실제 후기·실제 사진·반별 공식 요구조건 정확도를 대표하지 않는다. 실제 후기는 별도 동의/개인정보 경계·정책 확정 이후다.

모델 품질 결과가 좋아도 기존 C2 imageDecodeReady=false·realDataAllowed=false·documentSubmissionReady=false, 게시/작성자 UNVERIFIED, automaticEligibility/paymentAllowed=false 및 독립 청구 NO_GO를 해제하지 않는다.
