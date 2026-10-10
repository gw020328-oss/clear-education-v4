# W02 ProofAdapter 기술 확인

2026년 10월 10일 · 추천 **GPT-6 Astra / high** · 증명 신뢰 경계와 신청·지갑 결합 검토에 사용하기 위한 권고다. 실제 모델 자동 전환을 뜻하지 않는다.

**오프라인 기술 시험 36개는 통과했고, 실제 브라우저 YBM 연결은 미완료다.** 고정 SDK를 별도 spike에 설치해 서명·문맥·두 시험 기록의 연결을 확인했다. 사용자가 Reclaim 개발자 콘솔 로그인을 완료했지만, 등록된 앱과 개인 provider는 없었다. 수동 provider 작성 도구가 세션 생성에 실패해 실제 연결 확인을 진행하지 못했다.

## 확인한 연결 경로

원본의 `verify-linked.mjs`와 `prove-linked.mjs` 코드를 읽었다. 과거 private 증명·정책·쿠키·키 파일과 실행 결과는 읽거나 재실행하지 않았다. 기존 생성기는 개발자가 포착한 요청·쿠키, 임시 owner 키, 진단 context를 사용한다. 현재 신청의 사용자 브라우저 경로로 바로 재사용할 수 없다.

현행 npm registry에서 `@reclaimprotocol/js-sdk` **5.8.2**를 확인하고 `spikes/w02-proof-adapter/package-lock.json`에 정확히 고정했다. 배포 파일·source map의 지문과 확인 위치는 [sdk-inspection.json](sdk-inspection.json)에 있다. browser-extension-sdk **0.5.1**은 후보 버전만 조회했으며 설치·확장 권한 부여는 하지 않았다. 루트 의존성은 W01 그대로다.

공식 웹 흐름은 서버 요청 생성 → 클라이언트 시작 → 서버 검증이며 provider의 정확한 버전을 저장해야 한다. SDK 기본 portal은 원격 브라우저 방식이므로 자동 선택에 맡기지 않고, 실제 provider에 맞는 클라이언트와 인증 정보의 이동 경로를 확인해야 한다. [공식 SDK 사용 안내](https://docs.reclaimprotocol.org/manual/js-sdk/usage), [확장 SDK 서버 설정](https://docs.reclaimprotocol.org/browser-extension/web-integration/setup)

## SDK에서 추가로 확인한 조건

| 항목 | 확인 결과 | CLEAR 적용 |
| --- | --- | --- |
| signed context | `setJsonContext`는 `reclaimSessionId`를 넣고, claim identifier 계산에 context가 포함됨 | 신청 binding hash·역할·서버가 시작한 SDK 세션을 모두 비교 |
| owner | 서명 메시지에는 owner가 포함되지만 공식 문서는 이 필드를 legacy로 설명함. 요청 API에서 사전 ownerPublicKey 지정 경로는 확인되지 않음 | 합성 시험에서는 원래 owner 결합 요구를 유지. 브라우저 지원을 확인하기 전 설계 통과로 처리하지 않음 |
| 공증자 검사 | `assertVerifiedProof`는 복구한 signer 중 신뢰 집합에 속한 사람이 한 명이라도 있는지 검사 | 기술 시험에서는 사전 고정한 한 signer·한 witness와 정확히 일치하도록 추가 검사 |
| 원천 정책 | SDK policy hash는 URL·method·body·추출/가림 규칙을 다룸. 모든 header를 고정하는 검사는 아님 | 인증·header 정책을 별도로 검토. 서명 통과만으로 허용된 YBM 요청이라고 판단하지 않음 |
| TEE | init의 기본 attestation 요청과 실제 verification은 별개. 검증은 별도 설정이 필요 | 실제 후보 경로에서는 TEE 검증을 명시하고 실패 시 차단. 이번 시험은 TEE 통과를 주장하지 않음 |
| unsigned 자료 | 편의 추출 필드와 publicData를 서명된 의미의 대체로 쓰면 안 됨 | signed context의 추출값을 사용하고 불일치 거절 |
| 기본 callback | 명시하지 않으면 SDK의 기본 Reclaim callback이 선택됨 | 원본 보존 경계를 검토한 CLEAR callback을 명시하기 전 실제 요청 생성 금지 |

owner의 문서상 의미는 [공식 데이터 형식](https://docs.reclaimprotocol.org/troubleshooting/anatomy)과 비교했다. SDK 5.8.2의 서명 계산에서 owner가 여전히 포함되는 것과, 이를 사용자 지갑 소유의 근거로 삼을 수 있다는 것은 별개의 사실이다. **사전 owner 결합이 안 되는 웹 경로를 사용할 경우 새 설계 검토가 필요하다.** 이 요구를 몰래 빼거나 세션 문자열 일치만으로 동일 보장이라고 선언하지 않았다.

TEE 검증을 생략하거나 SDK의 `hasNoPii`/content-validation 우회 옵션으로 실제 YBM 검증을 통과시키는 경로는 구현하지 않았다. 테스트에서는 외부 TEE를 흉내 내지 않고 낮은 수준의 서명/정책 함수만 시험했다.

## provider와 콘솔 확인

[공개 active provider API](https://api.reclaimprotocol.org/api/providers/active) 응답 20,368개를 이름·설명·YBM/TOEIC 로그인 도메인으로 검색했으며 일치 후보는 없었다. 비공개·미등록 provider의 존재 여부까지 판단하는 결과는 아니다. 불투명한 문자열 안의 우연한 `ybm` 문자는 검색 근거에서 제외했다. 결과와 응답 지문은 [public-provider-discovery.json](public-provider-discovery.json)에 남겼다.

사용자가 직접 로그인한 콘솔에서는 My Applications가 비어 있었고 My Providers는 0개였다. `New Provider → Manual`은 모바일 앱 연결을 요구했고, 세션 생성에서 `GenerateSession UNKNOWN: Response closed without headers`가 표시됐다. Retry 한 번도 `Session Generation Failed`로 끝났다. 이는 현재 Codex 내장 브라우저에서 관찰한 오류이며 서비스 전체 장애라고 단정하지 않는다. [console-inspection.json](console-inspection.json)

앱 생성·secret 발급/열람·provider 등록·유료 AI builder 실행은 하지 않았다. 가입 자체는 사용자가 처리했다. 새 YBM 로그인이나 증명 생성도 시작하지 않았다.

## 오프라인 시험

[시험 코드](../../spikes/w02-proof-adapter/test/adapter.test.mjs)에서 36개가 통과했다. 공식 SDK의 실제 서명 검증 코드를 사용하되 시험용 공증자·owner·학습자 키는 매 실행마다 메모리에서 생성한다. source는 `example.invalid` 합성 주소이며 실제 YBM 또는 zkTLS 증명과 구분한다.

- 신청·정책·runtime·세션·nonce·chain·contract·instance·수취 지갑 바꿔치기 거절.
- context 변조, 미신뢰 서명자, 추가 서명자, identifier 불일치, 원천 URL·추출 정책 변경 거절.
- owner 불일치, 오래된/생성 전/미래 증명, 만료 세션 거절.
- 두 증명의 시험 종류·실제 달력 날짜·수험번호 연결과 점수 형식 검사.
- unsigned 추출값 변경, 증명 누락, 과대 입력 거절.
- 같은 프로세스의 중복 callback은 한 번 수락하며, 소비한 세션에 새 증명을 넣으면 재사용으로 거절.

성공 결과도 `paymentAllowed=false`, `realYbmVerified=false`다. 최고점 선택·800점·수강률 80% 자격 평가는 W05이고, 실제 서버·DB 원자성·HTTP 수신·TEE·증명 생성·삭제 작업·지급은 이번 시험 범위 밖이다. 신뢰 서버 record를 입력으로 받는 spike를 그대로 공개 endpoint에 노출하면 안 된다.

## 실제 시험 전 남은 조건

| 순서 | 필요한 결과 | 현재 상태 |
| --- | --- | --- |
| 1 | 수동 builder 또는 검토 가능한 공식 provider 작성 경로 사용 가능 | 현재 수동 builder 세션 오류 |
| 2 | YBM 접수·성적 원천의 필수 필드와 추출 규칙, provider ID·정확한 버전·policy hash | 미확정 |
| 3 | 참가자 브라우저 문맥·owner·지갑 결합 방식과 TEE 검증 경로 | 브라우저 실측 필요 |
| 4 | 테스트용 앱 credential, 명시적 callback, 원본 저장/로그/백업 경계 | 미준비 |
| 5 | 사용자 직접 YBM 로그인, 새 증명 한 쌍 생성, 실제 binding 검사 | 아직 요청할 시점 아님 |

정적 요구사항은 [provider-requirements.json](provider-requirements.json)에 정리했다. 과거 코드에서 확인한 POST 접수 조회와 GET 성적 조회를 출발점으로 삼지만 현행 추출 규칙은 확정하지 않았다. 필수 필드는 시험 종류·시험일·수험번호·총점이다. 실명 인증을 하지 않는 PRD이므로 이름·생년월일을 기본 추출 대상으로 추가하지 않는다.

현재 다음 조치는 **provider 작성 세션 오류의 원인·사용 가능한 클라이언트 확인**이다. 이후 앱 생성은 용도·provider·callback·보관 경로가 정리된 상태에서 진행한다. 수동 builder의 모바일 앱 연결 및 실제 YBM 로그인에 사용자 조작이 필요해지면 그 시점에 안내한다. 비밀번호·쿠키·앱 secret을 채팅으로 보내는 절차는 없다.

## 보존과 일정

원본 프로젝트·실험 경로의 작업 전후 메타데이터, 선택된 원본/legacy 파일 해시는 [preservation-after.json](preservation-after.json)에 기록한다. 원본과 과거 private 자료는 수정하지 않았다. 새 코드·의존성·보고서는 별도 작업본의 spike와 docs/w02 안에 있다.

W02 전체 상태는 [verification.json](verification.json)의 **OFFLINE_PASS_LIVE_BLOCKED**다. 10월 13일까지 브라우저의 실제 원천·문맥 결합 경로를 확인한다는 P1 목표는 아직 통과하지 않았다. W03–W05의 독립 작업은 가능하지만, 실제 YBM 연결이 끝난 것으로 일정표를 갱신하지 않는다.

다음 W02 재개도 **GPT-6 Astra / high**를 권고한다. W03 지갑·네트워크 시험을 별도로 시작할 경우에는 **GPT-6.1 Sol / high**를 권고한다.
