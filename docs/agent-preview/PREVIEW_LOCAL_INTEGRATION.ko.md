# B 로컬 미리보기 연결

Base `3d6c3ff7e8252575155d553247cacab2b699026f`. 이 문서를 포함한 커밋이 B 연결 후보다. D 외부 입력은 `bf5f41c62be8ff23bd167905e645e4915ab4e01c`이며 체크아웃 HEAD와 변경 없는 상태를 검사한다.

현재 입증 범위는 브라우저 인증 HTTPS → B 현재 학생 신청/ACK/binding → D 생성·검토 HTTPS → C 합성 observations.3 HTTPS → D 최소 관측 HTTPS → B 응답이다. D 고정 후보 검사는 실제 D approval store/service와 단회 OFFLINE 모델 픽스처를 사용한다. C 부분은 아직 B 합성 응답기다. 설치 Moodle 관측, 외부 모델 호출, 화면 표시의 완료 증거로 사용하지 않는다.

## 실행 및 결과

Node 24.21.0, 기존 lockfile 의존성 기준:

```sh
CLEAR_D_PEER_WORKTREE=/absolute/path/to/fixed-d-checkout ./tools/node \
  --import ./tests/ybm-collector/network-guard.mjs \
  --test tests/agent-preview/preview-local-integration.test.mjs
```

연결 3/3 PASS. 환경 변수가 없으면 내부 합성 HTTPS 2개만 실행하고 D 고정 후보 검사는 명시적으로 skip한다. CI의 기존 IPv4 loopback guard 단계에 이 검사를 추가했다. 기존 binding/module/currentness/student/peer/context 107개 및 application/development HTTP 11개 PASS. 전체 제품 source-pin 갱신은 포함하지 않는다.

첫 검사는 사설 CA 검증, 잘못된 Origin, 본문 identity 주입, 변조 AST, 다른 도구 선택, 잘못된 C subject, 검토 후 최소 triple 전달, 중복 전달 및 logout을 검사한다. 두 번째는 브라우저 연결 해제 시 C 요청 CANCELLED와 D 미전달을 검사한다. 세 번째는 D 고정 후보의 승인 저장소 및 countTokens/generateContent 각 1회, 실제 TLS generate/execute/result를 검사한다. 외부 네트워크와 실제 모델은 사용하지 않는다.

## 서버 조립 및 화면 계약

`createLocalSyntheticPeerTransport`는 `mode: LOCAL_SYNTHETIC_ONLY`, exact `https://127.0.0.1:port` pin, 명시적 CA가 필요하다. 인증서/IP 검증을 유지하며 redirect·환경 기반 활성화·외부 URL을 허용하지 않는다. `createLocalObservationBridge`는 진행 중인 인증 관측의 correlation만 전달하며 기존 coordinator가 full .3 DTO와 현재성을 검사한다. `createLocalPreviewService`는 generation/review/delivery 전송기와 contexts를 조립한다. 기본 handler는 비활성이고 기존 source development/payment listener에는 추가하지 않는다.

정확한 시연 원문은 `Python 기초 강의 완료`다. 고정 toolBinding은 `{tool:"moodle.activity.public",planTarget:"python-intro",observationTargetRef:"page-manual"}`다. 단일 MOODLE_ACTIVITY_COMPLETION.1 조건만 이 연결에 사용할 수 있다. 해당 target이 실제 어느 C Page인지에 대한 설치 매핑은 C 고정 CLI를 연결할 때 별도로 입증한다. 공개 core fixture의 `executePublicDemo`는 호출하지 않는다.

브라우저는 기존 nonce/verify로 발급한 `__Host-clear-preview-session` 쿠키와 `x-wallet`, `x-chain-id`, `x-csrf-token`을 사용한다. 동일 Origin/Host, TLS, participant role을 유지한다. 아래 JSON POST만 노출하며 `version`은 `clear-self-preview-context.1`이다.

1. `/preview/context`: `{version,sourceText}` → previewContextRef/sourceHash/bodyHash/model/approvalBindingHash/expiresAtExclusive/false gates.
2. `/preview/generate`: `{version,previewContextRef,sourceText,approvalRef}` → `{version:"clear-local-preview-draft.1",input,proposal:{sourceText,rows},toolBinding,provenance:"OFFLINE_TEST",paymentAllowed:false}`. input은 draftId/proposalHash와 기존 correlation 필드다.
3. `/preview/review`: `{version,previewContextRef,draftId,proposalHash}` → `{version:"clear-offline-review-receipt.1",draftId,proposalHash,reviewed:true,paymentAllowed:false}`. D의 서명된 검토 확인이 성공해야 관측할 수 있다.
4. `/preview/observe`: 같은 요청 → `{version:"clear-offline-observation-receipt.1",observation:{targetRef,status,observedAt},provenance:"OFFLINE_TEST",automaticEligibility:false,paymentAllowed:false}`. status는 COMPLETE/INCOMPLETE/UNKNOWN/INACCESSIBLE, observedAt은 Unix seconds다.

원문은 생성 호출과 초안 응답에서만 일시적으로 처리한다. context 저장에는 원문/세션 토큰/지갑을 보관하지 않는다. UI는 observation을 표시하고 실패 응답의 과거 완료 값을 재사용하지 않아야 한다. 테스트 서버는 임시 포트이며 종료 후 유지되지 않는다. 지속 실행 origin 및 학생 화면은 별도 조립 인수 항목이다.
