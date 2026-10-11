# W02 A 직접 경로 합성 호환성 시험 결과

2026년 10월 11일 · GPT-6 Astra / high 권고 · 별도 v4 작업본

**합성 시험 107개가 통과했다. 기존 36개와 직접 경로 시험 71개다.** 직접 경로의 임시 owner·참가자 지갑·신청 문맥·원천 정책 연결을 시험했고, TEE 자료가 없는 기존 생성 형태는 현재의 필수 TEE 검사에서 거부됨을 확인했다. W02 A는 완료했으며, 실제 YBM 수집·지급 및 W02 전체는 아직 미완료다.

**해결 권고는 기존에 성공한 공식 공증자 서명 기반 zkTLS 경로를 MVP의 기본 검증 방식으로 검토하고, TEE를 별도 추가 보장으로 구분하는 것이다.** 이는 현재 v4의 필수 TEE 요구를 변경하는 제안이다. 이번 작업은 제안만 기록했으며 `mayGenerateRealProof=false`, `paymentAllowed=false`와 기존 TEE 차단을 유지했다.

## 실행한 시험

| 범위 | 결과 | 의미 |
| --- | --- | --- |
| 기존 W02 오프라인 시험 | 36 / 36 통과 | 기존 SDK 형태의 합성 서명·정책·문맥·재사용 거부 회귀 |
| 직접 경로와 TEE 음성 시험 | 71 / 71 통과 | 직접 경로의 binding 검사와 필요한 TEE 누락·변조 차단 |
| 실제 YBM 로그인 및 생성 | 실행하지 않음 | 새 실제 성적 검증이나 생성 경로 재현을 주장하지 않음 |
| 정상 하드웨어 TEE 증명 | 확보·검증하지 않음 | 합성 실패 사례 통과를 TEE 정상 연동 성공으로 해석하지 않음 |

작업본 루트의 재현 명령:

```sh
./tools/npm --prefix spikes/w02-proof-adapter test
./tools/npm run verify:workspace
```

시험은 고정한 SDK 5.8.2·ethers 6.17.0을 사용한다. 임시 시험용 키와 인공 claim은 메모리에서만 생성했다. 원천은 `example.invalid`이며 실제 YBM·TLS transcript·zk 증명 생성이 아니다. 테스트 프로세스의 `fetch`는 호출되면 실패하도록 바꿨고 호출 시도도 0회였다. 공개 패키지 메타데이터와 문서 조회는 이 오프라인 시험과 별도다.

결과와 파일 지문은 [기계 판독 기록](w02a-verification.json)에 있다. 동결 참고 코드 191개와 원본 프로젝트의 해당 191개 파일은 W01 지문과 일치하고, 루트 의존성 그래프도 보존됐다. 다만 작업본 전체 검사 `verify:workspace`는 기존 참고 문서 지문 불일치로 실패했다. 이전 문서 정리 커밋 `375051e`가 참고 문서 4개의 링크를 바꾼 뒤 W01 지문이 그대로 남아 있는 상태다. 이번 W02 A에서는 해당 문서와 기준 지문을 수정하지 않았다. 이 별도 문제를 합성 시험 성공과 구분하며, 전체 보존 검사가 통과했다고 기록하지 않는다. 기존 증명·쿠키·개인키를 읽거나 과거 실행기를 다시 실행하지 않았다.

## 직접 경로에서 확인한 것

[direct-route.mjs](../../spikes/w02-proof-adapter/direct-route.mjs)는 수집기나 지급용 verifier가 아닌 합성 검사 함수다. 서버가 만든 불변 record를 신뢰 입력으로 받으며, 외부 HTTP 입력을 받아 그 record를 만드는 기능은 없다.

- 지갑과 별개의 임시 owner를 참가자 지갑의 EIP-712 서명에 결합할 수 있다. application·policy·runtime·nonce·owner·chain·contract·instance를 바꾸면 거부한다.
- 새 신청에 다시 동의해도 이전 신청의 proof를 가져오면 signed context가 일치하지 않아 거부한다. 실제 브라우저에서 owner 공개키를 주고받는 단계는 아직 구현하지 않았다.
- 직접 경로는 `http` provider와 내부 source policy bundle을 사용한다. 콘솔 provider ID나 가짜 `reclaimSessionId`를 만들어 검사에 맞추지 않는다. hosted/direct 경로 교환과 역할별 요청 ID 교환은 거부한다.
- 서명이 맞더라도 URL·method·추출·가림 규칙·header가 고정 정책과 다르면 거부한다. 별도 시험으로 SDK hash가 `Accept` header 변경을 구분하지 않음을 확인했고, 직접 경로의 전체 params 비교가 이를 잡는다.
- 변조·미신뢰 서명자·다른 owner·기간 밖 proof·잘못된 시험키·불필요한 이름 필드·unsigned 점수 변경을 거부한다. 두 역할의 날짜 표기가 달라도 같은 유효 날짜로 정규화해 연결한다.
- 입력을 비동기 검증 전에 복사해 호출 중 객체 변경의 영향을 받지 않는다. 반복 검사에도 지급이나 nonce 소비는 발생하지 않는다. 영속 DB·다중 worker·일회 수락은 W06/W08 과제다.

이 spike는 서명된 JSON의 정확한 canonical 표기를 요구한다. 중복 키를 조용히 정규화하지 않기 위한 제한이며, 유효하지만 다른 공백·정렬을 쓴 실제 proof까지 수용하는 범용 parser가 아니다. 서버가 원본 proof를 고쳐서 서명을 맞추는 방식으로 바꾸지 않는다. 128 KiB 상한도 합성 시험 값이며 TEE 포함 실측 전 제품 상한으로 확정하지 않는다.

## TEE 차단 원인

| 구분 | 10월 9일 기존 성공 경로 | 현재 v4 필수 TEE 경로 |
| --- | --- | --- |
| 생성 | 동일 공식 Attestor client로 `createClaimOnAttestor` → `claimTunnel` | 증명에 별도 TEE 자료와 요청 nonce 결합 필요 |
| 반환 형태 | claim, 서명, witness 주소 등을 proof로 변환 | `proof.teeAttestation`, attestation nonce·앱·세션 정보 필요 |
| 확인한 보장 | 공식 registry에 있는 공증자 서명, 허용 원천 정책, YBM 두 기록의 연결 | 위 검사에 더해 하드웨어 attestation 검증을 요구 |
| 결과 | 실제 계정 1개의 과거 생성·검증 성공 | 기존 형태를 SDK TEE 검사에 넣으면 필수 자료 누락으로 거부 |

현재 공개 npm 메타데이터의 최신 버전도 attestor-core 5.1.4, js-sdk 5.8.2로 확인됐다. core의 `createClaimOnAttestor` 구현은 `claimTunnel`을 호출한다. 해당 반환 타입에는 v4의 SDK TEE 검증기가 바로 요구하는 `teeAttestation`·`claimAttestation`이 없다. 과거 proof 변환 코드도 이를 만들거나 보존하지 않는다. **현재 경로의 형식 불일치가 확인된 것이며 Reclaim 전체가 TEE를 지원하지 않는다는 결론은 아니다.**

SDK 5.8.2의 검증 두 가지를 혼동하지 않아야 한다.

1. `teeAttestation`은 verifier-app 측 TEE 자료와 요청 nonce·앱·세션·시간·토큰을 검사한다.
2. `attestorTeeAttestation`은 witness의 claim 서명과 공증자 주소에 묶인 서버 TEE 보고서를 검사한다. 첫 번째 검증과 독립적이다.

이번 시험은 필수 자료 없음, 빈 proof 배열, 단일 proof, 임의 성공 boolean, witness에 붙인 가짜 보고서, 잘못된 앱·세션·nonce·시각·형식·서명 없는 JWT를 거부했다. 실제 SDK validator를 호출했으며 TEE verifier나 신뢰 루트를 통과하도록 mock하지 않았다. 일부 음성 시험에서는 합성 오류 로그만 가렸다. shape-only TEE 시험은 claim 서명 검증과 별도로 수행했고 실제 하드웨어 증명으로 집계하지 않는다.

빈 배열은 SDK의 개별 배열 helper에 넘기기 전에 wrapper에서 거부하도록 보완했다. 이는 전체 `verifyProof`가 빈 배열을 허용한다는 주장이 아니다. 또한 성공 boolean을 수신해서 신뢰하지 않고, 실제 검증 결과가 필요하다.

앱 secret을 발급하거나 nonce 문자열을 넣는 것만으로 없는 TEE 자료가 생기지 않는다. core에 `claimTeeBundle`이 존재하지만 별도의 검증 bundle과 생성 경로를 요구한다. 단순 RPC 이름 교체나 기존 claim의 포장은 해결책이 아니다. SDK 공식 안내도 세션 재사용 방지를 호출자 책임으로 두고 추가 하드웨어 검증 설정을 별도로 설명한다. [공식 SDK 안내](https://docs.reclaimprotocol.org/manual/js-sdk/usage)

## 해결 방향과 권고

PRD의 F05 및 신뢰 경계는 허용 원천·서명·정책·시험키·신청·지갑·유효 시간 검증과 공증자 신뢰를 요구한다. **사용자가 확정한 PRD에 TEE라는 별도 필수 조건은 없다.** TEE 필수는 W02 기술 선택과 [현재 요구사항](provider-requirements.json)에 추가된 조건이다. 이를 성공 사례가 없다는 뜻이나 사용자가 추가 인증을 하지 않았다는 문제로 설명하면 안 된다.

| 대안 | 해야 할 일 | 남는 신뢰와 일정 영향 | 권고 |
| --- | --- | --- | --- |
| 기존 공식 공증자 서명 기반 zkTLS로 MVP 진행 | TEE를 필수에서 추가 보장으로 바꾸는 기술 결정을 명시. 고정 원천 정책·공증자 집합·지갑 binding·freshness·중복 방지·수집 삭제 검사를 유지 | 공증자 운영·서명 키·실행 환경을 신뢰. 하드웨어 실행 무결성을 확인했다고 말할 수 없음. 과거 성공 경로를 활용할 가능성이 가장 큼 | **MVP 우선 권고, 아직 적용하지 않음** |
| TEE 필수 유지 | 지원되는 generator가 실제 TEE 자료를 반환하는 경로 확보. YBM 동일 연결 로그인, owner 사전 결합, 두 원천, 개인정보 경계를 다시 검증 | 추가 앱/provider 또는 다른 client가 필요할 수 있음. 정상 샘플 및 YBM 호환성 미확보로 일정 불확실 | 하드웨어 보장이 필수라면 선택 |

첫 번째 안도 검증 생략을 허용하지 않는다. source params 비교·공증자 서명·owner/context·신선도·정확한 시험 연결·원자적 중복 방지를 모두 통과해야 하며, 실제 수집·지급은 새 시험으로 입증해야 한다. 자체 로컬 Attestor를 공식 Attestor로 바꾸어 부르거나 합성 증명을 실제 증명으로 세지 않는다. 공증자 및 CLEAR 판정·발급 서버에 남는 신뢰를 문서·화면·발표에서 명시한다.

두 번째 안을 추진할 때 필요한 확인은 구체적이다. “공식 Attestor의 같은 client를 유지하는 직접 HTTP 생성에서 SDK 5.8.2의 verifier-app TEE bundle을 반환할 수 있는가, 지원되는 generator와 버전은 무엇인가, owner·사용자 context를 생성 전에 지정할 수 있는가”를 확인해야 한다. 타인이나 Reclaim 지원팀에 메시지를 보내지는 않았다.

이번 작업의 결정 상태는 **TEE 요구 변경 제안, 미적용**이다. 결과를 성공으로 만들기 위해 현재 차단을 끄지 않았다. 실제 수집 전에 이 기술 선택을 확정해야 한다. 로그인 없는 W02 B의 합성 수집·연결 격리 준비는 두 안에 공통으로 필요하므로 먼저 진행할 수 있다.

## 다음 단계에서 확인할 원천 추출 문제

공개 core 서버 소스에서 `extractedParameters`가 비어 있지 않을 때 입력 context의 같은 필드를 교체하는 분기를 확인했다. 따라서 요청 builder가 해당 필드를 넣지 않는 것만으로 모든 악성 client를 막았다고 주장할 수 없다. **허용 policy가 필수 필드의 원천 추출을 반드시 수행하고, 누락·빈 매치에서는 실패하는지** 실제 provider 검증 함수와 합성 HTTP 응답으로 시험해야 한다. 이번 71개 시험의 입력은 인공 서명 claim이므로 이 원천 추출 문제를 해결한 것으로 세지 않는다.

다음 W02 B의 범위는 다음과 같다.

- 합성 원천으로 원천 필드 추출·빈 매치·문맥 주입·UTF-8·복수 시험 행을 확인한다.
- 신청마다 client·owner·쿠키·브라우저 프로필을 격리하고 연결 단절 시 자동 재사용을 막는다.
- 서버 API·로그·오류·백업에 쿠키·키·HTML이 없고, 프로필·임시 저장·종료·crash 정리가 작동하는지 검사한다.
- TEE 선택과 무관하게 실제 수집의 저장 경계를 통과하기 전에는 YBM 로그인을 요청하지 않는다.

W02 B 추천은 **GPT-6 Astra / high**다. 10월 13일 연결 경로 판정, 10월 21일 실제 로컬 지급, 11월 7일 시연 목표는 유지하되, 현재 TEE 경로 및 수집 준비가 완료된 것으로 일정표를 바꾸지 않는다. 새로운 YBM 로그인이 필요할 때는 준비된 경로와 처리 범위를 먼저 안내한다.

## 변경 파일과 근거

- [합성 직접 경로 검사](../../spikes/w02-proof-adapter/direct-route.mjs), [새 시험](../../spikes/w02-proof-adapter/test/direct-route.test.mjs)
- [기존 성공 경로와 v4 적용 설계](V4_ROUTE_DESIGN.ko.md), [정확한 버전·소스·실행 기록](w02a-verification.json)
- [공식 core 생성 코드](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/client/create-claim.ts), [공식 core 원천 검증 코드](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/assert-valid-claim-request.ts)

제품 `src/`·`contracts/`, 기존 코드 참고본과 실험 원본은 변경하지 않았다. 새 실행 코드는 격리된 spike에만 있으며 서버 수신·브라우저 수집·체인 거래를 구현하거나 실행하지 않았다.
