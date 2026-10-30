# Privy 의존성 재검토 — 2026-10-30

검토 코드 HEAD는 `550a657f24353afba627de5a6d5bac1dd31744fd`다. **안전한 최소 수정으로 확인된 후보가 없어 SDK manifest·lock·실행 코드를 변경하지 않았다.** 설치 성공과 감사 위험 해소를 구분한다. 기존 사용자 인증 호스트·DB·체인·권리는 보존했고 로그인·유료 AI·증명·사용자 지갑 거래는 실행하지 않았다.

## 설치와 감사

고정 Node 24.21.0/npm 11.19.0으로 추적 소스만 복사한 임시 트리에서 SDK `npm ci --ignore-scripts --no-audit --no-fund`를 실행했다. 700개 설치와 onboarding/operator production 전체 chunk 빌드는 성공했다. SDK 의존성은 새로 설치했고, 변경하지 않은 공통 루트 의존성은 기존 작업본을 참조했다. 이는 전체 저장소의 완전 독립 설치 시험이라는 뜻은 아니다.

`npm audit --omit=dev --json`은 **영향 패키지 31개(high20/moderate11/critical0), 고유 advisory 6개**다. 이전 high17/moderate14·5건과 달라진 것은 새 [decode-uri-component advisory](https://github.com/advisories/GHSA-qr28-fpjm-wq7f)의 추가다. 기존 lock을 바꾼 결과가 아니다. 다른 원인은 Zod 1건, ws 2건, uuid 1건, decode-uri-component 기존 1건이다. 감사 제외나 `audit fix --force`를 사용하지 않았다.

## Zod 3

공식 npm 조회에서 Privy react-auth 최신은 3.51.0, api-base는 1.12.0(`zod ^3.25.76`), Zod 3의 최고 배포 버전은 3.25.76이었다. `zod@3.25.77`은 E404다. x402의 현재 0.7.3도 Zod 3을 사용하며, 최신 1.2.0도 Zod 3 의존성을 선언한다. 최신이라는 이유로 x402 major를 바꾸지 않았다.

[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)는 수정 버전을 4.6.6으로 표시한다. 다만 **v3 공식 수정 소스는 이미 존재한다**. [v3 수정 #6696](https://github.com/colinhacks/zod/pull/6696)과 [3.25.x backport #6699](https://github.com/colinhacks/zod/pull/6699)가 10월 28일 병합됐고, 후자는 버전 증가를 포함하지 않는다. 배포되지 않은 Git 소스를 npm 안정 버전처럼 취급하거나 Zod 4로 강제 치환하지 않았다. 패치 후에도 상한 없는 배열은 별도의 입력/크기 제한이 필요하다.

새 production bundle에서 Zod 3 코드 59,426바이트, api-base 3,884바이트, x402 30,525바이트가 출력됐다. api-base의 APIError는 단순 필드 스키마지만 x402에는 `.max()` 없는 accepts/items/kinds 배열이 있다. Privy의 x402 경로는 동적 import와 응답 JSON 처리를 포함한다. CLEAR가 x402 기능을 호출하지 않는 것과 SDK 전체 비도달성 증명은 다르다. 번들 포함만으로 공격 가능성을 입증한 것도 아니다.

외부 통신 없는 1,000개 원소 시험에서 현재 Zod 3의 `array(...).max(2)`는 실패를 반환하면서도 원소 1,000개를 모두 방문했다. 무제한 배열도 1,000개를 방문했다. OOM을 유발하는 대형 입력은 실행하지 않았다. **Zod 위험 해소 판정은 보류**한다.

## viem 후보 비교

react-auth 3.51.0은 viem 2.57.8을 고정하고, 그 안의 ethereum 0.2.5는 정확히 2.56.5 peer를 요구한다. 기존 직접 viem은 2.57.13이다. 앱 소스는 viem을 직접 import하지 않지만 하위 SDK들이 이를 소비한다.

| 임시 후보 | 실측 | 결정 |
| --- | --- | --- |
| ethereum의 peer만 scoped override | 설치는 종료됐지만 실제 해석은 2.57.8, 동일 peer 경고 | 해결 아님 |
| 앱의 직접 viem 제거 | 기존 lock 기반 해석에서 동일 경고 | 해결 아님 |
| 직접 viem 제거 + 공식 ethereum 0.2.5 직접 선언 | override 없이 `ci --strict-peer-deps` 성공. ethereum이 루트로 이동하고 루트 viem 2.56.5/ox 0.14.44, react-auth 내부 2.57.8로 분리 | 아래 검증 차이 때문에 미채택 |

세 번째 후보는 루트 viem 2.57.13/ox 0.14.59를 낮추며 다른 SDK 소비자도 영향을 받는다. [공식 변경 이력](https://github.com/wevm/viem/compare/viem%402.56.5...viem%402.57.13)에 typed-data 타입 검증·서명 변환·HTTP 취소/timeout 등 수정이 있다. 합성 EOA personal-sign 복구와 CLEAR V2의 **실제 wire 형태** digest/복구는 양쪽에서 같았다. 하지만 잘못된 `Bad-Name` struct를 현재 2.57.13은 `InvalidStructTypeError`로 거부하고 후보 2.56.5는 허용했다. 해당 typed-data 코드가 두 production bundle 모두에 포함됐다. 정상 경로 성공만으로 이 검증 후퇴를 안전하다고 판단하지 않았다. 후보의 audit도 31개/6건으로 그대로다.

초기 비교 스크립트는 codec의 문자열 chainId를 viem에 직접 넘겨 digest가 달랐다. 실제 앱처럼 ethers `TypedDataEncoder.getPayload`로 EIP712Domain을 포함한 wire를 만든 뒤 비교했다. 이 시험 작성 오류를 제품 서명 오류로 보고하지 않는다.

## 검증 결과와 후속 조건

- 기존 코드 embedded-wallet/application **194/194**, V2 등록·UI 세션·로컬 계약 **36/36**, 합계 **230/230** 통과. 새 사용자 로그인이나 제품 지급을 증명하지 않는다.
- 검토 HEAD의 필수 CI **9/9 성공·전부 종료**를 재확인했다. 같은 HEAD의 CI를 반복 실행하지 않았다. 문서 후속 커밋의 CI는 PR125에서 별도로 기록한다.
- 공식 Zod 3 호환 배포가 나오면 lock의 모든 Zod 3 복사본·스키마 크기 제한·실제 번들을 재검토한다. Privy의 peer 계약 정렬 또는 최신 viem을 유지하는 공식 조합이 다음 최소 수정 후보다.
- 버전이 없는 소스 fork/backport, SDK 내부 스키마 수정, 다른 SDK로의 전환은 별도 유지보수·서명 경계 검토가 필요한 대안이다. 이번에 도입하지 않았다. 무조건 배포를 기다리는 것만이 해결책이라고 단정하지 않는다.

공식 Attestor의 마지막 확인은 10월 29일 10:50:46 UTC의 HTTP403이다. 이번 단위에서는 재접속·지원 메일 추가 발송·답변 조회를 하지 않았다. 기존 문의의 마지막 확인 상태는 답변 대기다. **실제 100 TEST 준비 완료가 아니며 PR125 Draft/Issue106 OPEN을 유지한다.**
