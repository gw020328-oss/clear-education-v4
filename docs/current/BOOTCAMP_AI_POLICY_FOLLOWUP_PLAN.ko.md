# 핵심 실제 시연 이후의 AI 조건 구조화 계획

2026-10-23 / 계획 revision1 / 상태: 계획만 정리, 후속 구현 미착수. 이 문서는 구현·활성화·유료 호출 승인이 아니다. 작업 권장 설정은 Sol / Medium이며 실제 실행 모델 설정과 구분한다. 자금·증명 경계의 실질적인 변경이 생길 때만 별도 검토 필요성을 판단한다.

## 순서와 착수 조건

| 단계 | 현재 범위 | 다음 단계로 가는 조건 |
| --- | --- | --- |
| CORE-1 / 최우선 | 동일 신청의 실제 새 HackerRank 증명, 실제 로컬 Moodle 기록, 실제 Gemini 회고 검토, 양측 같은 판정의 필요한 명시 동의, 정확100 TEST 지급/수령을 완주 | 같은 app/정책/mapping·새 증명·실제 모델 provenance·두 역할 동의·고정 수령인/token·canonical receipt/Transfer 및 정확100000000 atoms 증가의 근거를 인수. 단순 제출/accept나 과거 run3·합성 fixture는 성공 대체가 아님 |
| AI-POLICY-0 / 이번 단위 | 이 계획의 인터페이스 후보·담당 경계·완료 기준 정리 | CORE-1을 방해하지 않고 계획만 기록. 코드·TEST 정책·실행 설정 변경 없음 |
| AI-POLICY-1 / 성공 뒤 첫 AI 후속 | 안내문 snapshot → 실제 제한된 Gemini 구조화 → 결정적 P0 검사 → 운영자 확인·정확 버전 확정 → 이후 신청 연결 | CORE-1 실제 성공 근거 인수 후 착수. 실제 모델 검증은 별도 승인된 소규모 호출 범위에서만 수행 |

현재 핵심 시험 준비와 [별도 시험 클라이언트](BOOTCAMP_BACKEND_TEST_CLIENT.ko.md), 필수 검증·CI·인계를 그대로 우선한다. 사용자 두 공개 주소·브라우저/CA·일정 준비 전 로그인·신청·짧은 원천 lease·유료 호출·거래를 시작하지 않는다. 현재 실제 시연 성공을 주장하지 않는다. 새 계획 때문에 원래 턴을 중단하거나 새 세션/PR·범위 확장을 만들지 않는다.

## 현재 코드와 재사용 범위

| 확인한 기반 | 재사용할 의미 | 아직 새로 필요한 부분 |
| --- | --- | --- |
| [proposal.mjs](../../src/ai-policy/proposal.mjs) | 원문 quote/locator 대조, 미확정 질문·충돌값 null, draftDigest/sourceTextDigest, revision과 이전 검토 거부 | proposePolicy는 invokeMockObservation 경로이며 execution=MOCK, actualModelCall=false, publishable=false. recordOperatorReview는 프로세스 내부 검토 기록으로 인증·게시를 제공하지 않음 |
| [source-bundle-adapter.mjs](../../src/ai-policy/source-bundle-adapter.mjs), [source-contract.mjs](../../src/product-workflow/source-contract.mjs) | 원문 bytes/snapshot/bundle hash, 원문 위치, 최신 revision 대조, 근거·coverage·제한사항 | 현재 어댑터는 MOCK 전용·actualModelCalls=0·게시 불가. 새 실제 정책 추출 어댑터와 수명·dispatch 범위 필요 |
| [gemini-evaluation.mjs](../../src/ai-policy/gemini-evaluation.mjs), [합성 자료 평가 실행기](../../tests/ai-policy/evaluate-gemini.mjs) | 실제 모델의 제한된 추출 가능성에 관한 평가 근거 | 합성 자료 평가의 실제 호출은 운영 정책 생성 성공이나 제품 게시 권한이 아님. 평가 결과/코드를 이름만 바꿔 제품 실행으로 승격하지 않음 |
| [compileBootcampPolicy](../../src/bootcamp/model.mjs), [고정 P0](../../specs/bootcamp/p0-policy.json) | 정책 전체가 P0와 정확히 같아야 컴파일되는 닫힌 지원 범위 | 제한된 추출 결과와 정확 P0의 대응 검증, 인증된 운영자 확정의 영속 저장, 이후 신청과 확정 참조의 원자 결합 필요 |
| 기존 실제 Gemini 회고 검토 | 신청에 묶인 회고 원문을 세 항목으로 검토하는 현재 정상 경로 | 정책 조건 생성과 목적·입력·승인·실행 기록을 분리. 회고용 승인/모델 결과/짧은 lease를 정책 생성에 재사용하지 않음 |

MOCK 전용 안전장치를 일괄 해제하지 않는다. 새 실제 어댑터는 별도 목적과 genuine 실행 출처를 갖추고, 기존 MOCK 함수·평가·차단 표시를 보존한다. 원문 quote 포함 여부 검사는 원문의 공식성이나 의미 전체를 자동 증명하는 것이 아니다.

## 처음 지원하는 정책은 P0 하나

| 조건/금액 | 구조화와 검사 기준 |
| --- | --- |
| 지정 Moodle 활동 | COMPLETED. 학습시간이나 퀴즈 통과로 바꾸지 않음 |
| 지정 Moodle 과제 | SUBMITTED, 성적 평가 불필요. 점수·등급 조건을 몰래 제거하거나 추가하지 않음 |
| 회고 | 수행 내용·문제 해결 과정·배운 점의 세 항목과 원문 근거. 분량/사진/감정·노력 점수 조건을 임의로 추가하지 않음 |
| HackerRank Python (Basic) | 새 관측 시 합격 인증 보유. 수강 기간 내 취득 조건을 추가하지 않고 proof 시각을 취득 시각으로 바꾸지 않음 |
| 논리/지급 | 네 조건 모두 AND, 100 TEST, decimals6,100000000 atoms |

지원 필드의 근거를 원문 snapshot의 위치/quote로 제시한다. 조건 누락·서로 다른 값·추가 조건·OR·기간 내 인증 취득·성적 요구 등은 질문/지원 불가로 남기며 확정을 막는다. 해당 절을 버리고 P0를 반환하거나 근거 없는 기본값으로 채우지 않는다. 질문 해소에 원문 보완이 필요하면 보완 내용도 새 snapshot/revision으로 고정한다. 운영자 클릭으로 미지원 조건을 지원 상태로 덮어쓰지 않는다.

100 TEST의 원문 근거와 시스템의 고정 TEST 단위 정의를 구별한다. decimals6과 atoms 환산은 운영자가 명시적으로 확인하는 기존 P0 프로필의 결정적 정의이며 AI가 안내문에서 추측한 값이 아니다. 조건 의미·금액이 모호하면 이 프로필을 숨은 기본값으로 적용하지 않는다. 기존 P0의 TEST 운영 상수/동의·원천 cap/권한·privacy gate도 그대로이며 모델이 추출·변경할 항목이 아니다.

처음 입력은 가상 Python 부트캠프의 고정 UTF-8 텍스트/파일 snapshot이면 충분하다. Moodle 신규 배포, 범용 URL 수집, OCR/다양한 문서 형식, 임의의 반 생성, 광범위한 정책 컴파일러 전환을 선행 과제로 만들지 않는다. 원문 전체와 미대응 절/coverage를 운영자가 확인한다. 결정적 검사는 schema·근거 위치·명시값·지원 범위를 검사하며 자연어의 모든 의미나 누락 부재를 자동 증명한다고 주장하지 않는다.

## 연결 흐름과 인터페이스 후보

아래는 후속 서비스 경계 초안이다. 현재 HTTP endpoint/DTO가 구현·동결됐다는 뜻이 아니며 제품 프론트가 지금 이 이름을 호출하지 않는다.

| 동작 후보 | 입력과 검증 | 결과 |
| --- | --- | --- |
| registerPolicySource | 인증된 해당 운영자, 가상 안내문 bytes/text, 기존 원문 수집/정규화 버전. 역할/범위는 인증 context에서 결정 | 불변 sourceSnapshotHash·원문 hash·source/bundle revision·근거 위치. 같은 source ID의 새 내용은 새 revision |
| preparePolicyProposal | 정확 source/bundle hash·revision과 운영자가 선택한 닫힌 P0 프로필. 최신 여부를 dispatch 전/후 검사 | 별도 purpose의 제한된 실제 모델 요청 계획·코드/입력/모델 pin. 승인된 범위 안에서만 단회 dispatch |
| inspectPolicyProposal | 같은 source와 현재 proposal revision | 조건/필요 증거/AND/100 TEST, 원문 근거, 질문·충돌 null·미지원 절, 결정적 검사 상태, 실제 모델 실행 메타데이터. 실행 정책 아님 |
| confirmPolicyProposal | 인증된 운영자, expected source/bundle revision/hash·proposal revision/draftDigest·대응할 정확 P0 policyHash. 질문/충돌/미지원 없음과 원문 대조 확인 | CAS로 영속화한 불변 confirmationRef. 최신성/원문/초안/정책 불일치면 거부. AI가 확인자나 확정 기록을 만들지 않음 |
| createApplicationFromConfirmedPolicy | 최신의 유효 confirmationRef와 예상 policyHash. 참가자/수령인·운영자 권한·실제 원천 mapping은 기존 trusted host가 결정 | 이후 새 신청에 confirmationRef+정확 policyHash를 원자적으로 고정. 확정 전 연결 차단, 응답 유실의 같은 명령만 멱등 확인 |

상태 후보는 SOURCE_PINNED → DRAFT_NEEDS_REVIEW 또는 HELD → CONFIRMED이며, 수정/오래된 요청은 STALE/거부로 다룬다. 실제 상태 이름·HTTP 경로·오류·CAS/멱등 DTO는 AI/통합 담당이 후속 착수 때 고정한다. HELD·미지원·질문 상태를 확인 버튼으로 우회하지 않는다. 모델 실패/불명 결과는 확인 가능한 정책으로 대체하지 않는다.

## 해시·revision·인증의 관계

- 원문 bytes hash와 snapshot/bundle hash·revision을 고정하고 원문 근거는 그 snapshot에 대한 locator/quote로 저장한다. 정규화 텍스트를 쓰면 원본/정규화 hash·버전·위치 기준을 구별한다.
- 초안은 source/bundle pin, proposal ID/revision, draftDigest, 지원 프로필/mapper 버전, modelRun ID에 묶인다. 원문이나 초안을 고치면 새 revision이며 이전 추출/검토/확정을 새 버전의 근거로 이월하지 않는다.
- 실제 모델 기록은 purpose, execution provenance, 요청한 model/version과 보고된 모델 메타데이터, prompt/schema hash, 정확 input/context hash, 요청/응답 식별·hash, 실제 호출 수·한도·상태를 구별한다. 미보고 usage/메타데이터는 null/미확인이고 추정으로 채우지 않는다. 키·쿠키·서명·raw proof를 이 기록에 복사하지 않는다. 이 메타데이터는 지급 권한이 아니다.
- 확정 기록은 confirmationRef, 인증된 운영자/권한 범위, 확정 시각, 정확 원문/bundle pin, proposal revision/draftDigest, modelRun 참조, 대응 검사 결과 및 실제 사용할 policyHash를 함께 묶는다. 브라우저 body나 AI가 준 reviewerRef만으로 인증된 운영자 확정으로 취급하지 않는다. 현재 recordOperatorReview만으로 이 요구를 충족했다고 표기하지 않는다.
- 첫 단계의 실제 정책은 계속 기존 P0 전체와 정확히 같아야 하며 compileBootcampPolicy의 equality gate를 유지한다. 실제 policyHash는 기존 p0PolicyHash(P0_POLICY)다. 새 provenance 필드를 P0 wire/금액/서명 domain에 삽입해 기존 hash를 바꾸지 않는다.
- 같은 P0 의미를 가진 서로 다른 원문/확정은 policyHash가 같을 수 있다. 따라서 policyHash만으로 특정 원문을 운영자가 확인했다는 사실을 대체하지 않고 별도 confirmationRef를 유지한다. 새 신청은 두 참조의 관계와 현재성을 검증하고 고정한다.
- 기존 합의 정책·신청·동의·수락 권리·수령인·token/재원·실제 Moodle/HR mapping은 AI나 새 초안으로 덮어쓰지 않는다. 새 원문/초안 뒤의 새 신청은 새 확정이 필요하며, 이미 생성한 신청의 참조는 보존한다. 과거 확정 이력 보존과 새 신청에 쓸 최신성은 별개다. 기존 mapping/증거 request의 hash 의미도 바꾸지 않는다.

## 담당 경계와 후속 구현 단위

| 담당 | 소유 작업 | 다른 담당에 전달할 것 |
| --- | --- | --- |
| AI 담당 / AI-POLICY-1A | 실제 추출 전용 제한 어댑터·prompt/schema·질문/근거·모델 메타데이터·출력 보류. 기존 원문 기반/평가 자료 재사용 여부 대조 | 고정 입력/출력 후보·근거 위치·지원 불가/질문·실제 실행 출처·소규모 검증 결과. 게시/저장/신청/지급 권한 없음 |
| 통합 담당 / AI-POLICY-1B | 결정적 P0 대응·검사, 인증/원문/초안 CAS, 확정의 영속/멱등 저장, 새 신청에 confirmationRef+policyHash 연결 | 후속 HTTP/DTO·오류·최신성·권한·snapshot 수명 계약과 정확 기준 commit. 기존 실제 원천/금고·지급 경로 보존 |
| 서준형 / AI-POLICY-1C | web/의 운영자 원문/초안/근거/질문 확인과 명시 확정, 확정된 정책에 대한 신청 연결 표시 | 1A/1B 계약이 구체화된 뒤 필요한 최소 화면. 현재 핵심 시험 클라이언트를 제품 UI 완료로 간주하지 않음 |

이번 단위는 0의 계획 정리뿐이다. 1A/1B의 구현 인수와 1C 화면 계약은 CORE-1 성공 뒤 시작한다. 구현·코드 검토 소유 파일을 겹치지 않게 정하고 기존 세션에서 진행한다. 현재 MOCK 어댑터의 flag 제거·평가 journal/승인 재사용·새 유료 dispatch는 하지 않는다. 실제 화면 계약이 구체화되면 #106에 정확 commit·변경 DTO·필요한 프론트 수정만 한 번 안내한다. 이번 계획 초안만으로 #106에 새 endpoint가 가용하다고 알리거나 팀원 추가 구현을 지시하지 않는다.

## 최소 완료 기준과 검증 범위

1. 정상 가상 안내문에서 네 조건·필요 증거·AND·100 TEST와 각 원문 근거를 구조화하고, 운영자가 전체 원문과 정확 초안을 확인해 P0로 확정할 수 있다.
2. 누락·모순·미지원 조건은 질문/지원 불가 및 null을 보존하고 확정을 막는다. 수강 기간 내 인증 취득·추가 점수·OR 등을 조용히 제거하지 않는다.
3. 존재하지 않는/다른 원문 위치·quote·hash는 거부하고, 원문·초안이 바뀐 뒤의 오래된 추출/검토/확정/CAS도 거부한다.
4. 인증되지 않은 운영자/다른 운영자 범위·브라우저/AI가 만든 확정은 거부한다. 확정 전 새 신청 연결을 차단한다.
5. 확정한 source pin·proposal revision/draftDigest·modelRun·confirmationRef·실제 P0 policyHash가 일치하고, 새 신청/기존 증거·검토·동의·지급 consumer까지 같은 고정 정책을 유지한다. 기존 성공 신청/권리/수령인은 보존한다.
6. 실제 모델 확인은 우선 정상·누락·모순·미지원의 작은 네 텍스트 사례, 사례별 최대1회라는 후보 범위로 계획한다. 이는 최대4회 호출의 제안이지 승인/예산이 아니다. 실제 모델/입력/한도/당일 가격·비용을 정한 뒤 별도 직접 승인을 받는다. stale/CAS/권한·확정 전 차단·정책 일치 검사는 결정적 offline/저장 시험으로 수행하고 실제 모델 호출을 불필요하게 반복하지 않는다.

현재는 이 완료 기준을 통과했다고 기록하지 않는다. 실제 Gemini의 조건 추출·운영자 영속 확정·새 신청 연결은 아직 미구현이다. 상용 예치 비율·배정 정책은 미확정으로 유지하며 기존 TEST 운영 프로필을 바꾸지 않는다. 새 증명 연구·범용 수집·불필요한 고도화나 성공한 핵심 경로의 전환을 추가하지 않는다.
