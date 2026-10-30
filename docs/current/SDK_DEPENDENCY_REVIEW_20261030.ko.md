# Privy 의존성 재검토 — 2026-10-30

## 후속 적용 — 공식 backport와 viem 최소 호환 선언

이전의 미수정 검토 뒤, 명시 승인된 후속 범위에서 SDK manifest/lock과 오프라인 패치·빌드 관문을 변경했다. Zod 공식 [PR6699](https://github.com/colinhacks/zod/pull/6699) commit `540f40974ff131ab96130b8fcc29af14bb750395`를 고정했다. 3.25.76의 v3와 동봉 v4/core, Porto 4.6.7의 v3 export까지 **설치된 2개 Zod 패키지·12개 파일**을 검증/패치한다. npm 버전 번호는 그대로다. source/ESM/CJS, core/classic/mini와 실제 production chunk를 확인했다. 적용 순서와 지문·실패 처리: [패치 안내](../../tools/embedded-wallet/patches/README.md).

Privy react-auth 3.51.0/ethereum 0.2.5에 scoped override로 viem **2.57.13 / ox 0.14.59**를 유지한다. ethereum의 upstream exact peer 선언을 수정된 공식 버전처럼 설명하지 않는다. 이는 로컬 검증된 호환 예외다. `npm ci --strict-peer-deps --ignore-scripts` 649개 설치가 경고 없이 peer 검증을 통과했다(deprecation 안내는 남음). 정상 personal-sign, 실제 V2 wire digest/복구, 잘못된 struct 거부를 모두 유지했다. 강제 downgrade나 typed-data 검사 제거는 없다.

지갑/인증·등록/V2·화면 회귀 **296/296**, 그 안의 SDK 의존성·실제 entrypoint 검사 **28개**와 로컬 Attestor 격리 검사 **2개**를 통과했다. 크기 32의 작은 초과 입력으로 원소 방문 0회, 정상 값/async/상위 refinement/정확 길이, 무제한 입력의 잔여 위험을 구분했다. 패치 drift면 앞의 유효한 파일도 쓰지 않으며, 중복 적용은 no-op이다. source pin은 새 v42로 인수하며 v1–v41 원문은 보존한다. 최종 커밋 CI는 PR125 결과를 따로 확인한다.

현재 audit은 **영향 패키지 32개(high25/moderate7/critical0), 고유 advisory 4개**다: Zod GHSA-mrhx-c7xc-m3w5, decode-uri-component GHSA-qr28-fpjm-wq7f/GHSA-vcc3-ghjq-m6fr, uuid GHSA-w5hq-g745-h8pq. lock dedupe로 기존 ws advisory 2개가 빠졌지만 전파 노드의 등급/수는 달라졌다. 버전 기반 audit은 이 로컬 Zod 패치를 인식하지 않는다. 감사 숨김/제외/강제 수정은 하지 않았다. **상한 없는 x402 컬렉션·나머지 advisory·SDK 전체 도달성은 미해결**이며, 완전한 안전 판정이 아니다.

공식 endpoint는 2026-10-30 04:20:58 UTC(13:20 KST) 정상 경로 각 1회에서 `/address`403·SDK WebSocket403이었다. 03:06 UTC 다른 관측의 `/address`200·WS403과 구분한다. 로그인/claim은 0건이며 반복·우회 접속은 없다. 공식 문서와 npm5.1.4 gitHead를 고정한 별도 self Attestor는 공개 example.com 증명 생성/서명 검증, 미인증·다른 host 거부, **실제 제품 verifier의 공식 signer 신뢰 목록에서 UNTRUSTED_SIGNER 거부**까지 확인했다. [격리 실행·제약](../../tools/local-attestor-review/README.md). 이 로컬 결과는 공식 hosted 복구·독립 공증·제품 proof 수락이 아니다. BGP 검사는 이 랩에서만 비활성이고, 제품 trust/fallback은 바꾸지 않았다.

기존 인증 호스트·DB·체인·사용자 권리와 web/PR60은 보존했다. 실제 계정 로그인·개인 자료 수집·유료 AI·사용자 지갑 서명/거래·100 TEST 지급은 이번 후속에서 실행하지 않았다. 운영자 MetaMask 지정은 입력별 직접 승인 이전 단계이며 자동 AI 호출을 허용하지 않는다.

## 이전 미수정 검토 이력

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
