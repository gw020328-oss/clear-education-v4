# B 등록형 D peer 소비자 후보

Base `4705a3ffc197bcbe4bb127ece40f4ef429b0dc72`. 이 문서를 포함한 커밋이 분리 후보 head다. D 입력은 `ff0bef2c57312ddbf7006c295dbc583e3938a822`, C 설치 입력은 `2abcc74abb3560cb4e4c681ee27eebd212803575`다. D deploy/C plugin은 수정하지 않았다.

## 연결 순서와 소유 경계

새 `createRegisteredPreviewService`는 `LOCAL_SYNTHETIC_ONLY` 조립과 CA 검증 loopback HTTPS 전송기만 허용한다. 기존 `createLocalPreviewService`의 offline fixture 계약은 유지한다. 실제 모델/외부 origin을 자동 활성화하지 않는다.

1. owner는 D 전체 release의 `releaseHash`, 같은 B deployment snapshot의 `{deploymentEpoch,artifactHash,model,limitsHash}`, 고정 toolBinding, `approvalRef`, modelMode를 서버 조립에서 제공한다. 브라우저가 이를 선택하지 않는다.
2. 인증된 브라우저의 `/preview/context`는 기존 exact `{version,sourceText}`로 context를 만든다. B issuer가 현재 학생·ACK·binding·release를 읽고 scopeHash/approvalBindingHash를 만든다. 원문·지갑·세션 토큰은 context 저장에 남기지 않는다.
3. 신뢰된 서버 프로세스가 `ownerRegistration(authenticationContext,{version,previewContextRef})`을 호출한다. 반환 DTO는 D의 exact `{version:'clear-peer-registration.1',releaseHash,scopeHash,context,targetRef,planTarget,approvalRef}`다. scopeHash는 새 owner-only `contexts.registrationScope`에서 얻으며 외부 입력으로 덮어쓰지 않는다. 이 메서드는 HTTP에 노출되지 않는다.
4. owner가 이 결과와 release를 private control-plane 파일로 D에 제공하고 D를 시작한다. D가 releaseHash, approval binding preimage와 시작 시 남은 만료(최대120초)를 확인한다. B 기본 context TTL은60초이며 연장하지 않았다.
5. 브라우저 `/preview/prepare`는 exact `{version:'clear-self-preview-context.1',previewContextRef}`만 받는다. B가 owner export 단계 및 현재 권한을 재확인하고 signed `/v1/preview/prepare`에 exact registration body(context/release/toolBinding/capabilities/dataMode)를 보낸다. 승인 레코드 생성 기능은 없다.
6. **별도 승인 원장**에서 해당 `approvalRef` / bodyHash / approvalBindingHash / expiry에 대한 승인이 필요하다. prepare 성공을 호출 승인으로 취급하지 않는다. 그 다음 기존 generate → review → observe HTTP 흐름을 수행한다.

실제 runtime 검사는 D의 수정 없는 `startPeerRuntime`에 새 private JSON 및 공개 합성 HMAC key 파일을 제공했다. runtime은 loopback HTTP를 열고, 테스트 전용 loopback TLS proxy가 exact Host를 보존했다. B는 사설 CA와 IP 인증서 검증을 유지했다. 이 검사는 ACTUAL_GEMINI 모드의 prepare와 **승인 없는 generate 거부까지만** 수행했다. 실제 API 키/모델 요청은 사용하지 않았다. runtime 시작 직전에 테스트 전용 환경 접근 감시를 설치해 GEMINI_API_KEY 값을 반환하지 않고 접근 횟수를 세며, provider fetch는 항상 차단한다. 실제 startup/prepare/no-grant 검사에서 키 접근0/provider 호출0을 확인했다 (`/tmp/clear-registered-key-guard-final.log`).

## receipt와 실패 상태

ACTUAL_GEMINI owner profile은 D의 `clear-preview-context-receipt.1`, `clear-preview-peer-draft.1`, `clear-preview-review-receipt.1`, `clear-preview-observation-receipt.1`만 받는다. 실제 draft의 `actualModelCall:true`/`modelProvenance:ACTUAL_GEMINI_HTTP`, observation의 `modelProvenance`, `observationProvenance:B_VERIFIED_MOODLE`, `dataMode:SYNTHETIC_ONLY`, false eligibility/payment를 exact 검사한다. D signature를 통과한 body라도 context/source/proposal/release/target와 맞지 않으면 거부한다.

성공 모델 경로는 D의 명시적 OFFLINE transport와 테스트 전용 `clear-preview-test-*` receipt를 사용한다. actualModelCall은false, modelProvenance는OFFLINE_TEST_TRANSPORT다. 실제 receipt를 모의 모델 결과로 만들어 통과시킨 증거가 아니다. 실제 draft/review/result의 유료 실행 성공은 아직 검증하지 않았다.

B draft 응답은 검증된 D draft에 owner 고정 `toolBinding` 및 `paymentAllowed:false`를 추가한다. 검토/관측 응답은 검증한 receipt를 반환한다. 기존 별도 웹 UI는 이 새 계약에 연결하지 않았다.

등록형 흐름은 ISSUED → EXPORTED → PREPARED → DRAFT → REVIEWED → DELIVERED이며, 전송·검증 실패 후에는 해당 context가 FAILED가 된다. 동일 context로 자동 재시도하거나 관측 시각을 갱신해 재전달하지 않는다. 실패 후 새 owner context/startup 및 필요한 새 승인이 필요하다. 공개 입력의 source/approvalRef/형식 오류는 dispatch 전에 거부해 기존 승인과 진행 상태를 소비하지 않는다.

검토는 `draftScope`로 현재 draft를 확인한 뒤 D에 전송하며, 정확한 검토 receipt를 받은 뒤에만 `contexts.review`를 호출한다. D가 검토를 확정했으나 응답이 유실/변조된 경우 B는 REVIEWED로 진행하지 않는다. D 승인 소비는 되돌리지 않는다. 관측은 기존 coordinator의 full .3/currentness 검사와 단회 branded triple 전달을 그대로 사용한다.

## 검증

Node24.21.0, 기존 lockfile 의존성. D 체크아웃은 exact HEAD와 clean 상태를 검사한다. D owner가 후속 작업 중이면 고정 SHA의 별도 detached worktree를 쓴다.

```sh
CLEAR_D_REGISTERED_WORKTREE=/absolute/path/to/fixed-d \
./tools/node --import ./tests/ybm-collector/network-guard.mjs \
  --test tests/agent-preview/preview-registered.test.mjs tests/agent-preview/preview-context.test.mjs

CLEAR_D_REGISTERED_WORKTREE=/absolute/path/to/fixed-d \
CLEAR_C_PEER_WORKTREE=/absolute/path/to/fixed-c \
./tools/node --import ./tests/ybm-collector/network-guard.mjs \
  --test --test-name-pattern='installed C full' tests/agent-preview/preview-registered.test.mjs
```

- 등록형 소비자13/13 + context23/23 =36 PASS, 설치 C1개는 첫 명령에서skip (`/tmp/clear-registered-final.log`).
- 고정 설치 C의 full .3 COMPLETE → B 인증 HTTP → 등록형 D OFFLINE TLS1/1 PASS (`/tmp/clear-registered-installed-c.log`). C 학생/강좌를 새로 만들거나 완료 상태를 재설정하지 않았다. 기존 owner confirmation만 새 요청으로 발급·재조회했다.
- 선행 peer/local HTTP/application/development 회귀 묶음52 PASS/4 external-fixture SKIP (`/tmp/clear-registered-regressions.log`). 이 묶음의 기존 context21개는 위23개와 겹친다.
- 실제 runtime prepare/no-grant, prepare 뒤 빈 승인 원장, 원문·approvalRef 주입 전단 거부, release drift 및 signed release 불일치, 잘못된 context receipt, proposal hash, mock→actual provenance 위장, 모델 실패 후 단회 승인 소비 유지, 잘못된 review receipt 뒤 미검토, 다른 subject/course의 C 결과 미전달, 관측 receipt 불일치 후 재전달 차단을 확인했다.
- owner export의 approvalBindingHash preimage 일치, 인증 없는 export 거부, public HTTP 미노출, draftScope가 검토를 확정하지 않음을 확인했다. 이 두 검사는 기존 context CI 명령에도 포함된다.

새 외부 D 통합 파일은 환경 변수가 없으면 명시적으로 skip한다. A 소유 source provenance guard 및 CI workflow는 변경하지 않았다. 전체 CI 성공을 주장하지 않는다.

## 실제 호출에 남은 입력

D 독립 보안 리뷰/인수, 실제 승인된 release artifact/epoch/limits와 peer origin·TLS·key identity, 현재 B context에서 발행한 owner registration, 정확 원문 bodyHash 및 approvalBindingHash에 대한 단회 사용자 승인과 유효기한, D owner의 기존 credential/transport, 그리고 외부 연결 활성화 인수가 필요하다. 이 후보는 그 정보를 브라우저나 prepare에서 생성·선택하지 않는다. 실제 유료 호출·외부 배포·UI/iframe 방어 완화·지급 경로 변경은 없다.
