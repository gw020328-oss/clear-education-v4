# 과거 성공 경로 대조와 같은 owner의 수집 연결

## 현재 작업: 새 실제 증명 쌍을 기존 정상 흐름에 연결

사용자의 전체 정상 흐름 우선 지시에 따라 일반 진단·schema 확장은 중지했다. 과거 Agent도 같은 `createClaimOnAttestor`를 사용하므로 이미 신청/owner/서명/관리형 저장 경계가 있는 현재 수집기를 재사용한다. 아래 과거 로그인 복구·진단 실행 안내는 현재 실행 지시가 아니다.

[`withManagedHackerRankSource`](../../src/hackerrank-evidence/managed-source.mjs)가 공식 client와 동일 route의 새 관리형 Chrome을 열고, 준비 완료 후 `useSource(source, {signal})`에 기존 `pins/collectLease/close` 객체를 넘긴다. API 담당자는 이 callback 안에서 pins로 새 불변 mapping을 만들고 동일 source를 기존 `openLiveContext`에 전달한다. callback 종료 전에 lease 소비를 마쳐야 하며 종료/취소/실패 시 source와 lease를 폐기하고 모든 transport를 닫는다. 바깥 locked worker의 `stopRecordedBrowser → removeSession` 책임은 그대로다. pending/합성/잘못된 trust는 네트워크 전에 거부한다. API·Moodle·AI·금고 파일은 변경하지 않았다.

**실제 연결 완료는 아니다.** 새 host 연결부는 오프라인 transport 대역으로 수명/owner 전달을 검증했고, 새 실제 proof는 0건이다. 현재 결정적인 차단점은 `recipes.mjs`의 합성 flat 응답과 실제 dashboard NEXT_DATA/중첩 certificate 응답의 차이다. 원천 경로·중복·같은 행 관계를 보장하면서 필요한 값만 공개하는 실제 recipe와 해당 검증을 먼저 구현해야 한다. 전체 개인 응답 공개, JSONPath 선택만으로 경로를 입증했다고 간주, strict parser 일괄 완화는 적용하지 않았다. 원천 규칙이 준비되기 전 새 로그인은 요청하지 않는다.

독립 signer는 기존 YBM의 공개 registry 조회 경로를 재사용할 수 있다. 공식 attestor-core 소스 revision `5db03f0622569740f72dd8f3295c22c3707905d6`의 [claimTunnel](https://github.com/reclaimprotocol/attestor-core/blob/5db03f0622569740f72dd8f3295c22c3707905d6/src/server/handlers/claimTunnel.ts#L74)은 epoch1, [request 검증](https://github.com/reclaimprotocol/attestor-core/blob/5db03f0622569740f72dd8f3295c22c3707905d6/src/server/utils/assert-valid-claim-request.ts#L142)은 입력 context에 providerHash/extractedParameters를 넣는 구현이다. 이는 배포 서버나 설치 SDK5.1.4의 동일 revision 확인이 아니며 실제 signed response 검증을 대체하지 않는다. pending trust는 UNCONFIGURED다.

로컬 검증: 고정 Node24.21.0/network guard에서 새 host 수명7개+기존 prepared-source10개, 17/17 PASS. 정상/중간 실패/ready 취소/브라우저 종료/route 취소/정리 실패, private 오류 비노출과 동일 owner 전달을 확인했다. 실제 proof 또는 API 수락 시험이 아니다. 직전 진단 head `250946e`의 원격4개 검사는 모두 SUCCESS다. 최신 head 결과는 PR 기록을 따른다.

## 이전 준비와 조사 기록

2026-10-20. 새 PR 기준은 API PR102의 실제 로컬/원격 ref `codex/bootcamp-e5-api-bridge`, 커밋 `6962c1394b82aac633a686e1d197475d1803aacb`다. 이 기준은 이전 HR head `7b35bb3`를 포함한다. 기존 HR 작업본은 미커밋 변경 없이 인수했으며 옛 브랜치는 보존하고 `codex/hackerrank-prepared-owner-lease`로 분리했다. 선행 코드가 develop에 없으므로 API 브랜치 대상 stacked Draft PR로 차분을 제한한다.

**새 request-bound proof는 아직 0건이다.** 이번 변경은 신청 전에 공개 owner를 고정하고 같은 수집기로 검증된 lease를 반환하는 저수준 연결부다. 공식 로그인 가능성, 실제 recipe, 독립 signer/epoch 신뢰 설정, hosted signed context는 미확정이다. pending trust는 UNCONFIGURED이며 합성 recipe를 승격하지 않았다.

## 과거 성공이 입증한 것과 입증하지 않은 것

허용된 `artifacts/hackerrank-reclaim-spike/certificate-join-summary.json`, `verify-certificate-join.mjs`, `mcp-console.mjs`, `verify-claim.mjs`와 그 디렉터리에 설치된 공개 패키지 코드만 읽었다. 원문 claim·개인 프로필·`.env`·`~/.reclaim/claims`는 읽거나 복사하지 않았고 옛 실행기를 실행하지 않았다.

| 경계 | 과거 자료/설치 코드 | 현재 수집기 |
| --- | --- | --- |
| 실제 결과 | 요약은 계정/인증서 username과 owner 일치, 두 서명 검증 성공을 기록한다. 검증기는 identifier 재계산·서명 및 네 필드 변조 거부를 검사한다. | 새 요청의 참가자 지갑 승인·owner·nonce·만료와 두 role의 signed context를 추가로 요구한다. |
| 로그인 | 요약과 검증기에는 당시 선택한 로그인 제공자나 입력 방식이 없다. | 관리형 Chrome의 Google unsafe-browser 거부는 기존 인계 사실이다. 재시도하지 않았다. |
| Chrome/전송 | 설치된 Agent 0.1.32의 `lib/cdp/launcher.js`는 별도 profile/CDP port를 사용하고 proxy 인수를 넣지 않는다. `lib/proof/attestor.js`는 proof 때 URL로 별도 client를 만든다. | `run.mjs`는 공식 client를 먼저 만들고 같은 client의 TLS route로 Chrome을 띄운다. proof도 그 동일 client여야 한다. |
| SDK | 과거 실험 폴더에 현재 설치된 attestor-core는 5.1.5다. 이 버전이 과거 실행 순간에도 같았다는 증거는 아니다. | 현재 prefix는 5.1.4 고정이다. 의존성을 변경하지 않았다. |
| 공식 endpoint/신뢰 | Agent는 명시 override→환경 override→fallback 순서로 endpoint를 결정한다. 서명 검증기는 claim에 적힌 attestor address를 사용한다. | 독립 검토된 signer allowlist/epoch가 필요하다. 과거 요약으로 실제 endpoint나 공식 registry 신뢰를 확정할 수 없다. |
| 추출 | 과거 검증기는 특정 사용자 URL 및 특정 첫 인증서의 네 필드를 기대한다. 정확한 당시 selector/recipe는 이 검증기만으로 복원할 수 없다. | 필수 username/records capture, 동일 계정·동일 레코드, 중복 ID·모호한 선택 거부를 요구한다. |
| 인증 대조 | authenticated/anonymous replay boolean은 요약 작성 코드의 상수다. 당시 관찰 보고로만 취급한다. | 로그인·익명·다른 계정 대조의 새 실측 근거가 필요하다. |
| owner/context | 과거 owner 일치는 로컬 실험용이며 CLEAR 참가자·신청 결합이 아니다. Agent 기본 proof 호출에는 CLEAR context 인수가 없다. | 내부 난수 owner와 정확한 네 request context 필드 및 SDK 추출 두 필드를 검증한다. |

위 설치 코드 차이는 인증 네트워크 경로를 구분하는 근거다. 당시 환경 설정·실행 인수가 남아 있는 비밀없는 자료로 확인되지 않았으므로 과거 실제 로그인 경로를 완전히 재현했다고 하지 않는다. proxy 차이를 Google 거부의 원인으로 단정하거나, 옛 프로필/CDP/쿠키·인증 우회 경로를 도입하지 않는다.

## 공식 비밀번호 경로 확인

HackerRank **Community** 공식 문서 두 건을 2026-10-20 읽었다. Work/기업 SSO 설명을 이 계정에 적용하지 않는다.

- [Update or Reset Password](https://help.hackerrank.com/articles/2403570133-update-or-reset-password)는 Settings → Password의 현재 비밀번호 변경과, 로그인 화면의 Forgot Password → 본인 email/username·인증 → Reset Link 절차를 안내한다.
- [Troubleshooting Login Issues](https://help.hackerrank.com/articles/4147773232-troubleshooting-login-issues)는 Google 등 소셜 가입자는 같은 플랫폼으로 로그인하도록 안내한다. Google 가입 계정의 최초 자체 비밀번호 설정 가능 여부는 명시하지 않는다.

따라서 공식 복구 후보는 존재하지만 **이 Google 가입 계정에 적용 가능하다는 결론은 아직 없다.** 공식 화면을 사용자가 직접 확인할 경우에도 계정 변경·복구메일 발송 여부는 본인이 선택한다. 본부 한 곳에서만 안내하며, 담당자가 비밀번호·쿠키·복구 링크·메일 원문을 받지 않는다. 현재 브라우저 조작·복구메일 발송·로그인 재요청은 0이다.

다음 가장 작은 사용자 행동 후보는 평소 Chrome의 본인 HackerRank Community 계정에서 공식 Password/복구 경로가 자체 비밀번호 설정을 지원하는지 직접 확인하고 **가능/불가만** 본부에 알리는 것이다. 실제 수집 재로그인은 실행 준비가 끝난 뒤 안내한다. 이 확인만으로 recipe/trust가 검토 완료되거나 새 proof가 성공한 것은 아니다.

## 최소 구현

[`prepareHackerRankSource`](../../src/hackerrank-evidence/prepared-source.mjs)는 신뢰된 관리형 worker 내부에서 사용할 `pins() / collectLease(expectedRequest, options) / close()`를 제공한다. 외부 JSON 요청으로 함수를 받는 HTTP API가 아니다. 브라우저나 네트워크 연결을 직접 열지 않고, host가 이미 소유한 동일 client/route와 URL 한정 cookie reader를 받는다.

1. 검토 완료된 config와 선택 인증서를 snapshot으로 고정하고 저수준 collector를 **한 번** 생성한다. `pins()`는 audience·trust hash·recipe hash·expected owner·선택 ID·dataMode만 반환한다.
2. host는 이 owner로 새 mapping을 준비할 수 있다. 아직 실제 mapping/신청을 만들지 않았다. 수집 요청은 API가 발급한 `.1` expectedRequest를 사용하며 이 모듈에서 임의 요청/nonce를 발급하지 않는다.
3. `collectLease`는 요청의 config/owner/선택/시간과 현재 권한을 확인한 뒤 정확한 `requestMessage`를 host의 `signRequest`에 전달한다. 기존 collector가 참가자 서명과 새 proof pair를 다시 검증한다.
4. 서명·쿠키 읽기 전후 및 lease 반환 전에 취소/권한을 확인한다. 수집은 성공/실패를 포함해 한 번만 가능하다. 실패하면 owner와 노출된 lease를 폐기하며 host 예외 원문을 반환하지 않는다.
5. 성공 시 기존 모듈의 private WeakMap으로 검증되는 candidate-only lease만 반환한다. 실제 cookie/claim/context/key는 반환하지 않는다. 성공 후에도 pins는 동일하고 원래 요청/trust 만료 검사가 유지된다.
6. `close()`는 진행 중 collector를 취소하고 lease를 폐기한다. host는 준비 후 수집을 하지 않은 경우도 반드시 close해야 한다. 브라우저/route/공식 client 종료와 `stopRecordedBrowser → removeSession`은 기존 host 책임이며 정리 실패 시 source.close로 lease도 폐기해야 한다.

이 모듈은 공식 로그인 대체물이 아니다. `run.mjs`나 API `live-context.mjs`에 자동 연결하지 않았다. 인증·recipe·trust 확보 후 host가 준비부터 종료까지 같은 객체를 보유하는 연결이 남아 있다. API/금고/AI/공통 v6 source pin은 변경하지 않았다. 합성 fixture 모드는 그대로 표시되며 live consumer는 이를 받아들이지 않는다. durable nonce 소비·최종 current/CAS는 기존 API 책임이다.

## 검증 및 다음 한 작업

고정 Node24.21.0과 network guard로 신규 준비 연결 10개 + 기존 collector 9개, 총 **19/19 PASS**다. 다른 인스턴스 owner/선택 ID/config hash 거부, 정확한 owner key의 두 role 사용, 서명 대기 중 요청 snapshot 보존, 동시/재호출 거부, 서명·쿠키 대기 중 권한 취소, abort/close, 비공개 host 오류 차단, 원래 요청/trust 만료, lease 위조 거부를 포함한다. 최초 17개 실행도 PASS였으며 RE2 native 부재 경고는 기존 SDK의 native RegExp fallback이다. 최종 실행은 기존 실행 정책대로 시작 전 LOG_LEVEL=silent를 지정했고 설치/SDK는 변경하지 않았다. 실제 원천 regex 적합성 검증이 아니다.

기존 `e5b/source-pins.mjs`의 v5/v6 각 36개 source 보존 검사와 `git diff --check`도 PASS다. 새 연결부는 아직 그 검토 manifest나 API 실행기로 인수하지 않았다. 기존 CI workflow는 HR 개별 시험을 직접 실행하지 않으므로 이 19개는 로컬 network-blocked 결과이며, 원격 일반 CI 성공으로 대체해 표시하지 않는다. 소유 범위 밖 CI/공통 pin 편집 없이 이 한계를 본부에 전달한다.

새 로그인/계정 변경/공식 proof/신청/체인/AI 호출/설치/유료 작업은 모두 0이다. 성공한 run3와 전체 suite를 재실행하지 않았다. 다음 한 작업은 본부가 위 공식 복구 후보의 계정 적용 가능 여부를 사용자와 확인하는 것이다. 불가이면 같은 Google 경로를 반복하지 않고 blocker를 유지한다. 가능이어도 먼저 관리형 비수락 형식 진단과 실제 recipe·독립 trust 검토를 완료해야 한다.

권장/요청 모델은 민감 인증·서명 경계이므로 Astra / High다. 현재 턴의 실제 runtime model을 확인하거나 변경했다는 주장은 하지 않는다. 새 채팅/하위 에이전트는 생성하지 않았다.
