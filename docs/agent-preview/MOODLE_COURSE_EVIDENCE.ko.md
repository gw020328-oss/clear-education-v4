# Moodle 강좌의 고정 네 조건 읽기 계약

Base `2910202784d0d63b59600000e2a6d787bccc5b16`. 최초 후보는 `fa9e6aacde62ec38e924504085898f6278d62df5`이며, 최종 권한 재검사는 이 후보 위 별도 delta다. 구현은 `src/agent-preview/moodle-binding/course-evidence.mjs`의 `createCourseEvidenceReader`다.

## C/A 조립

Moodle 호스트는 서버에서 확인한 요청 핸들로만 `reader.read(handle)`을 호출한다. C/A가 제공하는 `resolveScope(handle)`은 Moodle 설치, 현재 로그인, 등록·강좌·대상 참가자 열람 권한, 해당 참가자의 기존 CLEAR 신청 매핑을 검증한다. 이 포트는 `{courseRef,participantRef,applicationId,role,authorityRef,clearContext}`를 반환한다. `applicationId`는 여기서 **기존 bootcamp slug**다. `role`은 `PARTICIPANT` 또는 `COURSE_OPERATOR`다. `authorityRef`는 Moodle 세션·등록·역할·서버 매핑 현재성이 달라지면 바뀌는 owner 발급 참조다. `clearContext`는 별도 현재 CLEAR 인증 세션의 `{token,wallet,chainId,csrf}`다. Moodle 인증은 CLEAR 인증과 별도로 검증한다. 교사 요청에는 그 교사의 CLEAR 운영자 권한을 사용한다.

선택 포트 `readSourceStates(scope)`는 인증 비밀을 제외한 같은 서버 scope를 받아, 확인된 연결 및 대기 작업만 반환한다. 조회는 부수 효과 없이 실행한다. 각 항목은 `{criterionId,connection,pendingAction}`이다. connection은 `CONNECTED / UNCONNECTED / UNKNOWN`이다. 대기 작업은 connected일 때만 줄 수 있다. 회고는 `APPROVE_REFLECTION_ANALYSIS`, HackerRank는 `HACKERRANK_LOGIN / APPROVE_RECLAIM_PROOF / SIGN_RECLAIM_REQUEST`를 허용한다. 확인된 대기 작업이 없으면 null이다. 포트 미제공 또는 항목 누락 시 UNKNOWN/null을 사용한다. 기존 승인·서명 경로는 작업 수행 시 자기 권한과 유효기간을 확인한다.

B는 위 조회 뒤 scope를 재확인한다. scope가 일치하면 현재 bootcamp 신청의 기존 동기 `store.getDecisionEvidence(clearContext, applicationId)`를 사용한다. S4가 동일 스냅샷에서 CLEAR 주체·신청 권한을 검사한다. B는 응답을 구성한 뒤 반환 직전에 owner resolver를 한 번 더 호출하고 최초 scope와 비교한다. resolver는 매 호출에서 Moodle 및 CLEAR 권한과 매핑의 유효기간을 확인한다. 참조 문자열이 같아도 권한이 폐기되거나 만료되면 거부해야 한다. B가 독립적으로 Moodle principal이나 bootcamp 매핑을 인증할 수 없으므로 실제 host 연결은 검토된 owner resolver에 의존한다. URL ID, 브라우저 slug 또는 지갑으로 resolver를 채우지 않는다. 별도 공용 HTTP route는 추가하지 않았다.

## 응답

`clear-moodle-course-evidence.1`은 `{version,role,observedAt,decision,applicationActive,criteria,usableForPayment}`다. decision은 `{id,revision,recordedConditionsStatus}`다. `usableForPayment`는 false다. 기존 네 조건의 순서와 판정은 S4 기록을 따른다.

각 행은 `{criterionId,recordedState,source,evidence,failure,pendingUserAction}`다.

- source는 `{kind,connection,dataMode,verification,currentness}`다. 저장된 `LOCAL_LMS_RECORD / RECLAIM_SIGNED_RECORD / SYNTHETIC_FIXTURE`를 구분한다. 미기록이면 dataMode와 verification은 null이다. currentness는 이 읽기가 원천을 재조회하지 않으므로 UNKNOWN이다.
- evidence는 `{id,availability,verifiedAt,validUntilExclusive,originalHttpAvailable,facts}`다. 시각은 Unix seconds다. availability에는 `MISSING / UNAVAILABLE / DELETED / EXPIRED / SUPERSEDED / INVALIDATED / APPLICATION_INACTIVE / VALID_AS_RECORDED`가 있다. originalHttpAvailable은 false다.
- 수강 facts는 완료 상태·방식·시각, 과제 facts는 제출 상태·시각, 회고 facts는 세 주제의 상태와 확인된 근거 위치, HackerRank facts는 발급 상태·취득 시각·저장된 증명 만료 시각이다. 회고 위치는 UTF-16 offsets만 전달한다. 기존 S4에서 모델 실행 정보가 제공되지 않아 회고 modelExecution은 UNKNOWN이다.
- failure는 가용 상태 문제가 있으면 해당 상태, 그 외에는 `NOT_MET / MISSING / UNKNOWN` 또는 null이다. 만료된 MET을 현재 충족으로 표시하면 안 된다. evidence와 source.connection을 함께 사용한다. 조작은 활성 신청의 참가자에게 확인된 pendingUserAction만 표시한다.

## A 지급 owner 포트에 제안하는 매핑

B의 0x64hex 신청 ID와 bootcamp slug를 각각 검증하고, owner가 명시적으로 연결한다. 서버 전용 매핑에는 mappingRevision, Moodle 설치·강좌·대상 subject, B applicationId·bindingRef·bindingRevision·expiry, bootcamp applicationId·participantId·courseOperatorRef·policyHash·runtimeMappingHash, 매핑 expiry를 둔다. C는 Moodle 현재 권한을, A는 별도 CLEAR 권한과 bootcamp 대상 결합을 확인한다. B 학생 권한으로 기존 coordinator.bindingStatus를 실행할 때 bindingRef/revision/expiry를 비교한다. 교사 경로는 독립적으로 권한 확인이 가능한 경우에만 연결한다. 최종 현재성은 같은 매핑·권한 및 최소 expiry를 사용한다. 이 제안은 지급 권한이나 검증된 owner 매핑 구현을 제공하지 않는다. 실제 권한 조립은 독립 Astra/High 검토 대상이다.

## 검증과 연결 상태

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test \
  tests/agent-preview/course-evidence.test.mjs \
  tests/bootcamp-store/decision-evidence.test.mjs \
  tests/bootcamp-store/moodle-live.test.mjs \
  tests/bootcamp-store/reclaim-live.test.mjs
```

Node 24.21.0에서 신규4와 기존15, 총19 통과. 기존 S4 저장소를 실제로 읽어 네 조건, 미기록·만료, 읽기 전후 DB 동일, 권한 변경/다른 CLEAR 주체 거부를 확인했다. 실제 기록 모드 표현은 metadata fixture와 기존 producer 모의/오프라인 회귀로 확인했다. 격리 Moodle Page의 수동 완료를 P0 자동 완료 조건으로 변환하지 않는다. 이전 Moodle Page HTTP COMPLETE 검증과 D `2910202/ff0bef2` prepare/no-grant 검증은 별도 증거다. 이 변경에서 기관 실계정의 수강·과제·회고·Reclaim을 새로 수집하거나 실제 모델을 호출하지 않았다.

남은 조립은 C/A의 실제 서버 권한 resolver, 검토된 mapping/currentness owner 포트, 기록/대기 상태 연결과 Moodle 화면 소비다. 필요할 때 사용자가 실제 로그인·증명 승인·서명을 수행한다. 지급 판정·동의·영수증은 A의 기존 시스템이 제공한다.

최종 권한 재검사 delta는 course-evidence 검사 5개를 통과했다. 새 회귀는 S4 근거 읽기 중 동일 참조의 권한 폐기와 기한 도달, 그리고 강좌 매핑 변경을 각각 주입했다. 세 경우 모두 최종 확인에서 거부됐다. 앞선 19개 결과는 최초 후보의 검증 기록이다.
