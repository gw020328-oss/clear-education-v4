# Moodle 지급 표시 연결 계약 후보

기준 `735243fd30617470651675013beaff96f5c4afbe` (PR159). A 후속 별도 후보이며 B의 현재 binding/두 신청 ID mapping과 C의 서버 진입 계약이 확정되기 전에는 활성화하지 않는다. 기존 `web/src/bootcamp/**`, B moodle-binding 및 C Moodle plugin 파일은 변경하지 않는다.

## 기존 경로 재사용

실제 지급 절차는 기존 CLEAR 인증 origin의 `/onboarding`(참가자 내장 지갑), `/operator`(운영자), v3 procedure/decision-evidence/recipient-registration/review-consents 및 v4 payment-receipt를 재사용한다. 등록·검토·동의·서명·불명 응답의 같은 키 조회는 기존 driver가 담당한다. Moodle 표시 adapter는 거래나 쓰기 요청을 만들지 않는다.

`normal-receipt.mjs`는 owner 보고서와 canonical claim을 대조하고 수령인·토큰·100000000 atoms·신청·정책·runtime mapping·수락 판정 및 checkpoint를 검사한다. ACCEPT나 transaction hash만으로 100 TEST 수령을 표시하지 않는다. 지급 이후 현재 조건이 만료되어도 저장된 수락 대상과 새로운 현재 판정은 별개다. `INCLUDED`는 최종 확정 전이며 `finalized=false`를 유지한다.

중요: `live-context.mjs`의 `getSession`은 `readers.observe(role)`도 실행한다. 서버 간 polling은 이 메서드나 `/bootcamp/v4/session`을 대리 호출하지 않는다. 일반 getApplication/getOperationsProjection/getProcedure도 tick/refresh로 clock·decision·evidence·요청 상태를 변경할 수 있다. 따라서 이 경로는 사용하지 않는다. 신규 moodle-payment-snapshot은 owner 고정 DB를 readOnly로 열어 SELECT snapshot과 별도 fresh CLEAR 인증만 수행한다. 기존 normal-receipt는 이 snapshot을 authorize로 받는 별도 인스턴스로 구성하며 기존 live-context의 receipt 인스턴스를 주입하지 않는다. 양측 최근 검토 화면 신호는 실제 인증 창의 조회에만 남긴다.

## 소유 경계와 연결 제안

- C: 현재 Moodle 로그인·강좌 권한 확인, Moodle PHP 진입/화면 및 서버 간 인증 운반.
- B: 현재 학생/강좌 binding 검증 및 명시적 B applicationId ↔ bootcamp applicationId mapping. 기존 B의 0x64hex ID와 bootcamp의 slug ID를 동일시하지 않는다. READ_PREVIEW/ACK/paymentAllowed=false를 지급 권한으로 승격하지 않는다.
- A: 별도로 인가한 CLEAR 세션과 고정 수령인·정책·runtime mapping으로 기존 지급 API를 호출하는 인증 창, 읽기 전용 지급 상태/영수증 투영.

A의 `resolveScope(serverHandle)` owner port는 B가 검증한 현재 mapping과 별도 현재 CLEAR context를 내부에서 결합한다. `authentication.authorizeWorkflow(context,false)` 및 snapshot의 `whoami`가 현재 CLEAR 권한·기한을 확인한다. 이 포트는 private composition이며 브라우저 JSON으로 구성하지 않는다. 조회 전후 같은 binding revision, 신청, 정책/runtime, 수령 대상, 역할 및 세션을 확인한다. 원래 만료와 5초 조회 상한을 늘리지 않는다. Moodle URL의 userId/courseId만으로 mapping을 만들지 않는다.

B가 제공할 최소 mapping 후보는 requestRef, bindingRef/revision, installation/course/subject의 내부 참조, bootcamp applicationId, policyHash/runtimeMappingHash, CLEAR actor role/wallet와 고정 recipient/token 및 원래 만료다. CLEAR context는 A 내부에서만 유지하며 B/C 응답이나 browser 메시지로 보내지 않는다. 이 필드 목록은 B/C 합의 전 후보다.

A의 `clear-moodle-payment-status.1` 응답은 version/requestRef/mappingRevision/bindingRef/bindingRevision/role/관측·만료 시각, 저장된 판정 상태, 동일 publication의 양측 기록된 consent, canonical 영수증 상태·100 TEST·블록 포함/최종성만 투영한다. 네 조건의 상세·근거·부족 사유는 B의 별도 course-evidence DTO를 사용한다. A는 원천을 재조회하지 않으므로 sourceCurrentness=NOT_RECHECKED이며 recordedConsent는 재검토된 지급 권한이 아니다. token/CSRF, wallet 주소, 원문/증명/서명, source URL, 내부 context는 전달하지 않는다. `displayOnly=true`, `paymentAuthority=false`이며 쓰기 실행 권한으로 사용하지 않는다. C는 응답 requestRef/bindingRevision과 서버 간 응답 인증을 대조해야 한다.

## 인증 창 결과

Moodle 내 화면은 유지하고 기존 CLEAR 인증/서명은 top-level 창으로 연다. iframe·CSP·SameSite/HttpOnly/Secure cookie 보호를 완화하지 않는다. 인증 창 결과 메시지 후보는 `{version:'clear-moodle-auth-window-result.1', requestRef, status:'REFRESH_REQUIRED'}`다. exact origin/source-window/requestRef를 확인하더라도 이 메시지는 새 서버 조회를 유도하는 힌트일 뿐이며 인증·동의·지급 성공 증거가 아니다. 메시지가 없어도 사용자는 수동으로 서버 상태를 다시 확인할 수 있다.

C는 힌트 후 B/A의 인증된 서버 상태를 다시 조회한다. requestRef는 단독 bearer 권한이 아니고 현재 Moodle·CLEAR 결합, 세션/기한을 계속 요구한다. popup에 실제 로그인/서명이 필요한 시점은 사용자에게 안내하며 자동 승인하지 않는다.

## 국소 검증 범위

학생/운영자 동일 신청 조회, 네 조건 및 같은 판정 consent 투영, canonical 100 TEST 영수증, 잘못된 수령 대상/정책/runtime/role/신청, await 중 로그아웃·binding 변경·만료, 알 수 없는/reorged receipt, 원문/비밀 필드 비노출 및 읽기에 따른 write/review-heartbeat 부재를 검사한다. 기존 PR139 실제 지급 기록과 PR159/C 설치 검증은 재사용한다. 새 실제 로그인·증명·유료 모델·체인 실행이나 외부 활성화 완료를 주장하지 않는다.


## 신규 A 모듈의 정확한 owner 입력

`openMoodlePaymentSnapshots({databasePath, authentication, resolveOperatorBindings, now})`는 새 private reader다. readOnly/connection query_only를 강제하고 최초 metadata와 파일 identity를 보존한다. 학생 자기 신청 및 운영자 현재 courseOperatorRef를 SELECT 전후 인가한다. 현재 publication과 같은 decision/scope의 마지막 consent만 기록 상태로 표시한다. 만료 증거/요청을 갱신하거나 취소하지 않는다.

`createMoodlePaymentReader({mapping, resolveScope, authentication, snapshots, receiptSource, now, monotonic})`는 동일 authentication에 결합된 위 reader만 받는다. 일반 store getter로 교체하면 구성 단계에서 거부한다. receiptSource의 정확한 필드는 runtimeHash/readReport/readCanonicalClaim/selfAttestor다. 이 포트는 owner의 보고서와 읽기 전용 canonical claim을 제공하며 HTTP로 구성하지 않는다.

mapping은 mappingRevision, installationRef/courseRef/subjectRef, bApplicationId/bindingRef/bindingRevision/bindingExpiresAtExclusive, applicationId/participantId/courseOperatorRef/policyHash/runtimeMappingHash, participantWallet/operatorWallet/recipient/token, expiresAtExclusive를 가진다. resolveScope 결과는 정확히 requestRef/authorityRef/authorityEpoch/expiresAtExclusive/mapping/role/clearContext다. role은 PARTICIPANT 또는 COURSE_OPERATOR이며 private clearContext는 기존 네 필드 그대로다. mapping·authority epoch는 owner의 폐기 가능한 정본에서 가져와야 한다. 객체를 임의로 만들어 반환하는 함수는 실제 인가 구현이 아니다. 폐기 epoch를 되돌리거나 같은 authorityRef/epoch로 재활성화하면 안 된다. 교사의 독립 currentness를 제공할 수 없으면 resolver가 UNAVAILABLE로 거부해야 한다.

반환 기한은 요청 시작+5초, mapping, binding, resolver가 확인한 Moodle 권한, 현재 CLEAR 세션 기한의 최솟값이다. equality에서 거부하며 벽시계 역행 및 monotonic 5000ms를 검사한다. canonical await 전후 전체 scope/context/epoch와 저장 snapshot을 다시 대조한다. 조회 실패 때 이전 성공을 캐시하거나 반환하지 않는다. 동의는 현재 recorded decision과 같아야 하지만 지급 영수증의 acceptedDecision은 독립적인 역사적 수락 대상이므로 새로운 현재 판정과 합치지 않는다.

아직 실제 B/C owner resolver, HTTP transport, 인증 창 결과 발행/소비, 실행 host 조립은 없다. B/C 검토와 별도 공유 파일 배정 뒤 연결한다. 이 신규 모듈의 국소 성공은 Moodle 로그인·수령인 결합의 실제 완료를 뜻하지 않는다.


## 국소 결과

Node24.21.0과 외부 네트워크 차단에서 신규 projection18·snapshot14 및 기존 normal-receipt/decision-evidence29, 총61/61 통과했다. 두 역할을 조회한 전후 bootcamp DB 전체 테이블과 DB bytes, authentication DB bytes, 명령 카운트가 같다. 만료된 pending 요청·증거 상태 보존, withdraw 우선 및 새 recorded decision으로 과거 동의 이동 금지, 잘못된 주체/강좌/수령 대상, DB symlink·파일 교체 거부, 최소 만료/벽시계 역행/monotonic deadline 및 await 중 logout/authority epoch 변경을 확인했다. 실제 chain receipt 입력은 합성 fixture이며 canonical reader 함수 자체는 기존 구현을 재사용했다. 이 시험은 실제 지급 재실행이 아니다.

재현 명령:

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test   tests/bootcamp-store/moodle-payment-projection.test.mjs   tests/bootcamp-store/moodle-payment-snapshot.test.mjs   tests/bootcamp-store/normal-receipt.test.mjs   tests/bootcamp-store/decision-evidence.test.mjs
```

외부 보고에는 합성 검증 결과·코드 지문만 사용하며 비밀·원문·실제 사용자 식별 자료를 포함하지 않는다. 실제 owner resolver의 정본 epoch/ABA 방지와 교사 currentness는 B/C 계약 조립 및 독립 리뷰의 남은 관문이다.
