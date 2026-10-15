# 다중 조건 독립청구 — 공개 합성 경계 검증

2026-10-15, 기준 develop `0590fd0`(PR #61 병합). **제품 independentClaim=NO_GO, grant/outbox=HOLD, 예치 정책 OPEN**을 유지한다. 최종 동기화에서 PR #63 병합 develop `890ad93`을 `1fd2fa8`로 반영했고 39개 회귀·inventory 재생성 대조·workspace 검사를 다시 통과했다. 이 폴더는 공식 증명 검증기나 지급 계약이 아니다. 실제 원천 증명·학습·후기 조건을 연결한 독립청구를 구현했다고 주장하지 않는다.

이번 변경은 별도 spike와 전용 공개 합성 CI뿐이다. `src/`, 제품 HTTP/DB/web/금고/키·기존 패키지·Windows를 수정하지 않았다. PR #63은 최초 확인 당시 OPEN, head `610faa0`이었다. 그 제품 통합과 충돌하지 않도록 M1/M2를 읽기 전용으로 소비한다. 기존 800점+80% 원천 실험은 역사적 단일 정책 회귀이며 최신 두 상품 전체의 조건으로 사용하지 않는다.

## 새 구현과 실제 시험 범위

- `capabilities.mjs`: 실제 M1 컴파일 객체의 공통 ALL + tier별 ANY/ALL 그래프를 읽어 조건별 원천·완전성·ruleHash·미구현 검증기 관문을 출력한다. 평가기/증거 수락기/서명자가 아니다. 소스 capability를 caller가 VERIFIED로 등록할 API가 없으며 모든 출력은 `claimAuthority=false`, `paymentAllowed=false`다.
- `ReturnBoundary.sol`: 새 메모리 EVM에서 직접 코드 지문·함수 selector·정확한 반환 길이/값을 고정하는 **ABI 동작 시험용** harness. 임의의 성공 fixture가 실제 proof를 검증하는 것은 아니다. `WireFixture`는 빈값/false/true/revert/비정규 bool/잘린 반환/추가 바이트를 만들 뿐 witness나 자격 사실을 서명하지 않는다.
- `availability.test.mjs`: 기존 funding-lab을 수정 없이 새 메모리 인스턴스로 실행한다. CLEAR/원천/증명기관 클라이언트를 전혀 시작하지 않은 상태에서 이미 합성 fixture 자격·전액 배정된 권리는 relayer가 한 번만 지급받고, 부족액이나 미자격을 지급으로 바꾸지 못한다. 실제 서비스를 가동했다가 장애를 주입한 시험이나 L2 새 증명 취득 시험이 아니다.
- `inventory.json`: 실제 M1 합성 프로필에서 재생성되는 결정적 관문 목록. 시험 성공 인증서나 실제 공식 상품 정책이 아니다. CI에서 생성 결과와 바이트 대조한다.

로컬 새 14개(정책 그래프 10, ABI EVM 1, 가용성 분리 3) + 기존 동일 행/OPRF/임시 서명 경계 25개 = **39 PASS / 0 FAIL / 0 SKIP**. ABI 한 시험 안에서는 3개 반환 계약의 교차 거부, EOA/코드 지문/다른 selector/빈 calldata/비정규 반환/revert/코드 변경을 각각 검사한다. 임시 서명 회귀의 원문은 인공 receipt다. 기존 로컬 TLS/native 통합 14개는 과거 실행 근거를 재사용했으며 이번에 다시 실행하지 않았다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test spikes/independent-claim-boundaries/*.test.mjs spikes/direct-proof-feasibility/record-policy.test.mjs spikes/direct-proof-feasibility/attestor-extension.test.mjs
./tools/node --import ./tests/ybm-collector/network-guard.mjs spikes/independent-claim-boundaries/report.mjs
```

고정 Node/lockfile을 쓰며 새 외부 의존성을 추가하지 않았다. 시험에는 외부 네트워크 차단 guard가 적용된다. Ganache의 Node native 모듈이 없어 JS fallback 경고가 있었으나 실패/skip은 없었다. 실제 계정/로그인/원문 proof/기존 DB·체인·키/유료 호출/공개 체인 거래/공식 운영자 연락·배포는 수행하지 않았다.

## 근거 갱신: 실제·합성·미검증

| 근거 | 확인된 범위 | 여전히 미검증 |
| --- | --- | --- |
| [W02 실제 증명](../../docs/w02/ybm-proof-verification.json), `1a99de4` | 공식 attestor의 접수·성적 쌍 생성/독립 검증 | 전체 이력/최고점/제품 자격/실제 지급 |
| [실제 표 공증](../../docs/current/EXAM_LIFECYCLE.ko.md), PR #32 `6aad3a2` | 실제 계정 TOEIC 3행 표의 공식 서명·별도 검증·서명 후 변조 거부 | 표의 무결성과 계정 전체 이력/기간 포괄성은 다름. 생성 중 실제 선택 누락·전체성/동일인/개인정보 최소 공개 미검증 |
| [H2 등록 접수](../../docs/current/history-intake-verification.json), `bca6568` | 새 실제 등록 문맥 증명/독립 검증/영속 접수·재개봉. `RECEIVED_UNVERIFIED_COVERAGE` | 계정-신청자 실명, 원천 기간/전체성. 빈 계정은 layout 미지원, proof/부재 증명 없음, UNKNOWN |
| [원천 결합 확장](../direct-proof-feasibility/ATTESTOR_EXTENSION.ko.md) | 로컬 실제 TLS→정규 시험 ID→native OPRF→임시 attestor 서명 통합 14개 | 공식 hosted 배포, 실제 YBM 확장 predicate, 제품 ABI/온체인 연결 |
| [OPRF 후속](../direct-proof-feasibility/SOURCE_BOUND_FOLLOWUP.ko.md) | Mac native 9개 기대 관찰. 같은 사업/시험 재발급·지갑 변경 안정성 후보 | 키 불일치 미거부 반례 포함. threshold=1 pin만 적용, 일반 threshold 감사·실제 ID 유일성·키 수명 미결 |
| [verifier 공개 관찰](../direct-proof-feasibility/verifier-readonly-report.json) | 10/13 Amoy block50035178의 코드/소스/ABI·epoch/registry 중첩 | 새 실제 proof의 eth_call 호환성, 현재 릴리스 지문/운영 승인 |
| [M1/M2](../../docs/current/MVP_EVALUATOR.ko.md) | 최신 공통 정책 및 합성 경로/선택/최종 금액 후보 | 온체인 실행 의미, 실제 source authority, 결과의 제품 자격/지급 권한 |
| [Moodle 인계](../../docs/current/TEAM_HANDOFF.ko.md) | 일별 core/export/로컬 읽기·기관 계정 후보 검증의 진전 | 원천 전체성/공식 지표/주체 연결의 제품 인증, 실제 사람의 시청, 온체인 facts |
| [TEST 재원 실험](../../docs/current/TEST_FUNDING_LAB.ko.md) | 자격 fixture 고정, 부분 충전→전액 배정→단회 지급·재조회 | source 자격, 독립 새 수집, 상용 PG/예치/부족 재원 정책 |

공식 문서/운영 지원을 새로 확인해 hosted 미지원이 영구 확정됐다고 판단하지 않는다. 이번에는 저장된 근거를 우선 사용했고 새 실제 proof/공개 RPC를 호출하지 않았다. Sourcify 웹 재열람은 도구에서 접근 실패하여 새 외부 증거로 세지 않았다.

## 컨트랙트가 확인해야 하는 조건과 권한

최신 [PRD](../../docs/current/MVP_PRD_20261014.ko.md)·[정책 계약](../../docs/current/MVP_POLICY_CONTRACT.ko.md)을 따른다. 50~300%는 조건/금액 후보, 400%는 사전검토만, 500% 제외다. 아래 출처는 필요한 신뢰 경계이며 아직 배포된 verifier 목록이 아니다.

| 필수 명제 | 출처/검증자와 고정 규칙 | 남는 권한·제품 관문 |
| --- | --- | --- |
| 기간 내 목표 성적 한 건 | YBM TLS + 신뢰 witness, 같은 행의 시험/날짜/점수/유효 상태 predicate와 신청/owner 결합 | 단일 성적 성공은 전체성·후기·LMS를 충족하지 않음. 비공개 predicate/안정 nullifier의 hosted/회로 경로 미완성 |
| 과거 이력/미응시/최고점 | 정의한 계정·기간·시험 종류의 인증된 완전한 집합, 정정/미발표/빈 응답 의미 | DOM 전체 가림/표 공증 및 caller complete=true로 계정의 모든 이력을 입증하지 못함. H2 UNKNOWN 유지 |
| 일별 학습/진도 | 기관/LMS 계정·강좌·활동·기간·revision을 고정한 원천 사실, 유효시간/진도/배속/정상종료·일별 날짜의 고정 연산 | 원천 기관을 신뢰. 실시간 거짓 telemetry 한계 유지. TLS 서명은 LMS가 말한 사실의 출처이며 사람의 집중 시청 증명이 아님 |
| 모의시험 완료 | 기관에서 해당 신청자/강좌의 완료를 인증하는 API/증거와 허용 verifier | 현재 실제 원천 verifier 미연결. 단순 bool/학생 제출값을 수락하면 안 됨 |
| 후기 적합성·실제 게시/작성자 | 고정 내용 규칙 + 실제 게시·작성자·기간/유지 사실의 검증 또는 공개된 제한적 심사 권한 | 내용/이미지 사전검토는 게시 사실이 아님. 사람이 재량 승인해야 한다면 그 거부권이 남음 |
| Vision/블로그 400 | 코드/모델의 사전검토 결과와 근거만 표시 | 지급 입력 아님. AI 결과 서명/검토 run hash를 자격 증명으로 승격하지 않음 |
| tier 선택·금액·최초 제출/정정 종료 | 동의한 policyHash에 묶인 결정적 규칙, source fact와 최초 제출 revision/selection/finality 검증 | M2 entitlement hash만으로 체인 검증 완료 아님. 자동 max/합산/하위 차액 추가 지급 금지 |
| 재원/수령인/단회 지급 | 고정 등록 동의/chain/contract/scope/recipient/amount, 전액 예약, 공통 spent 상태 | 기존 v4 issuer 서명을 이름만 바꿔 allocation 서명으로 넣으면 독립청구 아님. 부족액의 추가 충전은 후원자 의존 |

YBM형 그래프는 후기 AND 모의시험 AND 학습 AND 성적이다. 시원스쿨 100%는 공통 후기 AND (학습 OR 성적+baseline)이며 출석 분기에 baseline을 몰래 요구하지 않는다. 50/200/300도 각각 고정된 그래프를 소비한다. 개별 OR 한 경로가 충족돼도 최신 M2의 상위 tier 미확인·선택/최종성 관문은 별도다. 이 spike가 M2 결정을 다시 구현하거나 그 차단을 해제하지 않는다.

학생 서명은 정책/주체/수령인 연결이고 학습·성적 사실을 보증하지 않는다. 기관 fact 서명은 해당 기관의 기록을 신뢰하는 별도 오라클 권한이다. CLEAR가 API 토큰을 독점하거나 최종 pass를 서명하면 새로운 필수 승인자/가용성 의존성이 된다. 누구나 reserve를 호출할 수 있어도 그 앞의 facts를 CLEAR만 발급하면 전체 독립성은 해결되지 않는다.

## ABI 결과에서 얻은 구체적 제한

과거 패키지 `@reclaimprotocol/verifier-solidity-sdk@1.0.4`는 void verifyProof, 10/13 Sourcify로 확인한 배포 구현은 bool ABI에 성공 때 명시 return이 없어 false가 기본값인 코드였다. 따라서 **false를 무조건 실패로 보거나 모든 no-revert를 성공으로 보는 양쪽 모두 일반 규칙으로 쓸 수 없다.** 원본 소스/bytecode/selector/ABI/성공 의미를 배포별로 고정해야 한다. 기존 `BoundedAdapter`는 이 false-success를 모형화한 보존 실험이다.

새 harness는 3개 계약을 섞지 않으며 잘못된 길이·bool 2·trailing data·revert·코드/selector 교체를 거부한다. 이것은 공식 Solidity ABI로 실제 Reclaim proof를 호출한 시험이 아니다. 임의 calldata를 받아 true/void를 반환하는 함수가 proof verifier가 되지 않는다.

특히 proxy의 extcodehash는 구현 슬롯·업그레이드·registry/storage 변경을 고정하지 않는다. 이 harness는 **직접 불변 코드의 wire 경계 전용**이며 관찰된 Amoy proxy에 그대로 적용할 수 없다. 실제 adapter는 고정 구현/registry/epoch를 검사할 수 있는 배포 설계와 state-dependent verification을 별도로 해결해야 한다. 코드 지문 pin만으로 proxy 안전성을 주장하지 않는다. staticcall을 사용하는 harness와 실제 nonpayable verifier의 state 동작 호환성도 미검증이다.

## 중단 시나리오와 개인정보

| 중단 | 이미 검증·전액 예약된 권리(L1) | 기발급 proof를 아직 검증/예약하지 않음 | 새 증거 취득/재발급(L2) |
| --- | --- | --- | --- |
| CLEAR API/서명 서비스 | 고정 체인 claim만으로 가능해야 함. 합성 funding lab에서 외부 서비스 없이 단회 지급 확인 | 사용자가 필요한 자료/공개 정책/직접 호출 도구를 갖고 있고 독립 verifier가 있으면 가능 후보. 제품 미구현 | 수집기 authority/session 및 기관 토큰 의존 해결 전 NOT_IMPLEMENTED |
| LMS/YBM 원천 | 확정 권리를 새 원천 조회로 다시 잠그지 않아야 함 | 저장된 증거의 유효 기간/정정 최종성/전체성 및 독립 검증 가능성에 따라 다름 | 해당 원천의 새로운 사실 확인은 불가/보류. 체인이 원천 가용성을 만들지 못함 |
| witness/OPRF 제공자 | 확정 뒤 새 서명/OPRF를 요구하지 않는 구조여야 함 | 이미 유효한 서명은 고정 registry/epoch/정책으로 검증 가능 후보. 실제 새 proof 호환성 미확인 | 새 발급·OPRF는 중단. 키 손실/회전은 안정 nullifier와 spent 이관 문제 |
| 후원자 충전 | 예약분은 전용/조기 회수 금지, 고정 기한만 집행 | 자격이 있어도 부족분이 있으면 reserve/claim 불가 | 증거 생성 가능성과 자금 조달 가능성은 별개 |
| RPC/체인 | 가스/RPC/체인 가용성은 필요. 상태 모르면 UNKNOWN | 동일 | 동일 |

합성 L1 시험은 생성자에서 배포자가 자격 fixture를 제공한 제한을 그대로 갖는다. 실제 “CLEAR 서버를 꺼도 모든 신규 환급 가능”의 증거가 아니다. 부족분 충전 의존성을 예치 OPEN 상태에서 임의로 제거하거나 공용 부족풀 선착순 경쟁으로 대체하지 않는다.

공개 체인에는 원문 성적/날짜/번호/이름/LMS ID/제출자료/쿠키/저엔트로피 단순 hash를 올리지 않는다. 기존 확장은 attestor가 원문을 보며, CLEAR 자체 운영이면 CLEAR가 원문 수신자다. 자체 서버 배포는 공식 witness 등록을 만들지 않으며 새 키/발급 거부/사실 조작 권한이 남는다. 주소·금액·tier·사업 nullifier도 추론/연결 위험이 있어 최소 공개와 동의가 필요하다. fixture 값의 비노출 시험을 실제 데이터 privacy circuit 검증으로 표시하지 않는다.

## 공격 거부 기준과 잔여 가정

- 같은 행/시험의 날짜·점수·ID 결합, 다른 행 가림/구버전 star 제거 우회: 기존 17개 record 회귀에서 검사. 합성 HTML 형식만이며 새 750 정책 parser/실제 서버 보장으로 일반화하지 않음.
- 재발급/다른 지갑에서도 같은 사업 nullifier: 기존 로컬 native 근거. 사업 scope/정규 ID/OPRF key를 claimant가 선택하지 못해야 하며 실제 정규 ID 유일성·취소/재발급·키 이관 미검증.
- policy/recipient/owner/chain/consumer/witness/epoch/시간/서명 뒤 nullifier 변조: 기존 임시 서명 8개 회귀 재실행. 실제 TLS 새 실행/official witness가 아님.
- amount 변조: 새 그래프 시험에서 정책·금액 변경의 별도 hash/quote 확인. 실제 금액의 온체인 검증은 미구현. 기존 funding lab은 고정 fixture 금액만 지급하므로 상품 금액식의 원천 검증 성공이 아님.
- 한 성적 proof/M2 FINAL_SYNTHETIC/Vision pass를 전체 자격으로 승격: 관문 목록·합성 최종 결과의 claimAuthority=false를 유지. 소스 서명 검증/수락 API는 제품 통합 담당의 후속.
- 후기/학습/모의시험 원천 사실과 태그를 공격자가 만들어도 valid로 인정하는 실제 adapter는 이 PR에 없다. 실제 adapter가 생기면 인증된 facts 바꿔치기·범위 누락·정정·다른 source와 결합 공격을 추가해야 함.
- 검증기 empty/false/true 혼용, ABI 깨짐, code/selector 변경: 이번 실제 로컬 EVM에서 거부. malicious pinned verifier의 거짓말/프록시 업그레이드/registry 변경을 해결한 것은 아님.

## 11/7 시연과 외부 의존 판단

지금 자체 진행 가능한 범위는 합성 M1/M2 그래프의 필요 증거 표시, 미검증 조건 보류, 원천 결합 공격 회귀, ABI 계약 시험, 별도 인메모리 TEST의 전액 예약 후 단회 청구다. 실제 Reclaim/H2·짧은 Moodle·Vision 실측은 각 모듈의 근거와 라벨을 유지하고 전체 실상품 지급 성공으로 결합하지 않는다. 400은 사전검토만, 500 제외다.

현재 확장 설계를 **공식 hosted witness에서** 실행하려면 공식 운영자의 코드·키·로그/보존 정책 검토와 배포가 필요하다. provider 설정 등록만으로 임의 OPRF/정규화 코드를 실행할 근거는 없다. 자체 호스팅은 기술적 대안 후보지만 공식 신뢰·CLEAR 불개입·동일 privacy를 자동 보장하지 않는다. 공식 운영자 없이 가능한 다른 회로/독립 실행 증명 경로의 불가능성을 증명한 것은 아니며, 이번 범위에서 구현·감사되지 않았으므로 11/7 완료를 약속하지 않는다.

기관 LMS의 공식 사실/계정 연결과 후기·모의시험의 인정 권한을 확보하지 못하면 실제 다중 조건 상품 독립청구는 NO-GO다. AI 결과에 자체 서명해서 완료로 바꾸지 않는다. 먼저 단일 성적의 개인정보 비공개·원천 결합·안정 nullifier 및 실제 공식 verifier 호환성을 별도 관문으로 통과시켜야 하며, 그 성공 후에도 학습/서류가 남는다.

후속의 작은 단위는 (1) 고정 공식 verifier의 배포·epoch·성공 의미 확인 및 허용된 새 proof의 read-only eth_call, (2) 독립 request 구성/새 취득 경로와 서비스 중단 시험, (3) 원천별 좁은 facts와 고정 정책 의미/주체/최초 제출/금액/중복 결합이다. 실제 proof가 필요해지는 단위에서는 목적·공개될 최소값을 먼저 확정하고 사용자에게 Mac의 새 로그인/수집 1회만 요청해야 한다. 기존 개인 proof를 열거나 과거 성적을 변조해 테스트를 만들지 않는다. 아직 그 사용자 작업을 요청하거나 실행하지 않았다.

## 인터페이스 인계 — 제안만

제품 통합은 기존 Evidence 수락/M2/원장/API 담당이 소유한다. 이 spike는 sourceBinding·ruleHash·policyHash·selection/facts revision·최초 제출·finality를 재평가하는 두 번째 제품 엔진을 만들지 않는다. 통합 담당은 단순 entitlement digest/DocumentPrecheck/current flag를 온체인 claim authority로 내보내지 않아야 한다.

후속 verifier 입력 제안은 독립 고정 등록/정책에서 온 application/recipient/chain/consumer/businessScope/source/verifier/key/epoch/기간/amount policy와, 인증된 원천 facts/proof를 분리하는 것이다. source attestation에는 어떤 좁은 사실을 보증하는지 명시하고, AI/학생/기관/공식 witness/CLEAR의 권한을 합치지 않는다. 실제 wire/schema/ABI 동결은 이 문서에 포함하지 않는다. 이 관문 목록은 `DRAFT_INTERFACE / RESEARCH_ONLY`이며 제품 API 반환 계약이 아니다.

## 직접 코드 리뷰

주 세션이 새 diff를 직접 검토했다. 별도 사람 승인/독립 보안 감사가 아니다. M1 컴파일 객체의 provenance/불변성을 유지하고, 새 모듈에 증거 수락·키·서명/지급 권한이 없는지 확인했다. ABI harness의 임의 다른 함수 호출이 성공으로 읽히지 않도록 code pin과 함께 selector pin 및 빈 calldata 거부를 넣었다. 원천 truth/프록시 상태를 검증하지 못한다는 제한은 코드·시험·보고서에 함께 남겼다. availability 시험은 기존 fixture trust를 바꾸지 않고 새 메모리 체인만 사용한다. 새 경계에서 추가로 발견한 미해결 코드 결함은 없으며, 위 제품 NO-GO 항목은 그대로 남는다. 최종 커밋/CI 결과는 연결 Draft PR 본문과 checks를 따른다.
