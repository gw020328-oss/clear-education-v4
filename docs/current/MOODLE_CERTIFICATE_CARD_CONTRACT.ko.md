# Moodle 인증서 카드의 명시 시작과 서명 후 창 열기

2026-11-05 A 서버 후보. 기존 C 0.1.22 (`4fe337e`)에는 인증서 카드 콜백이 연결되지 않았다. 이 문서는 A 구현 계약이며 실제 Moodle 카드·HackerRank 창의 사용자 시험 완료를 뜻하지 않는다.

## 고정 포트

공용 `bind-source-session`은 신청 결합만 한다. 세션·신청·서명 조회는 인증서 수집이나 창 열기를 시작하지 않는다. Native 실행의 원천 순서가 `SOURCE_python-basic-certificate`에 도달하면 서버는 명시 시작을 기다린다. 이때까지 인증서 request와 서명 요청을 발급하지 않는다.

| 카드 동작 | runWorkflow 입력 | 서버 동작 |
| --- | --- | --- |
| start | `{action:'start-certificate', applicationId, expectedRevision, idempotencyKey}` | POST `/bootcamp/v4/applications/:applicationId/certificate-start`, 본문 `{expectedRevision}`. 명시 클릭으로만 호출한다. |
| read | `{action:'read-source-signature', applicationId}` | 기존 GET. 준비된 원본 DTO 조회만 한다. |
| sign | `{action:'approve-source-signature', reviewed}` | 방금 읽고 표시한 DTO를 그대로 전달한다. 기존 지갑 서명·정확한 요청 대조·서버 접수를 재사용한다. |

start의 정상 응답은 `{version:'clear-certificate-start-receipt.1', applicationId, criterionId:'python-basic-certificate', status:'START_ACCEPTED', paymentAuthorization:false}`다. 이 응답은 서명 준비·검증 성공·지급 동의를 뜻하지 않는다. 같은 명령 재전송은 기존 Moodle 명령 중복 차단을 유지한다. 새 키로 두 번째 수집을 시작할 수도 없다. 응답이 유실되면 자동 재전송 대신 세션을 조회한다.

## 카드 준비 상태

인증된 참가자 세션 GET은 같은 신청에 아래 `certificate`를 추가한다. 비-native·활동 전용 실행, 운영자, 미결합 신청에는 제공하지 않는다.

```json
{
  "phase": "SOURCE_python-basic-certificate",
  "certificate": {
    "version": "clear-certificate-start.1",
    "applicationId": "application-example",
    "criterionId": "python-basic-certificate",
    "state": "READY_TO_START",
    "startAllowed": true,
    "signatureReady": false
  }
}
```

`state`는 `NOT_READY`, `READY_TO_START`, `START_ACCEPTED`, `AWAITING_SIGNATURE`, `SIGNATURE_ACCEPTED`, `VERIFIED`, `UNAVAILABLE` 중 하나다. `startAllowed`는 정확한 단계와 READY_TO_START에서만 true, `signatureReady`는 정확한 단계와 AWAITING_SIGNATURE에서만 true다. C는 버전·신청·조건·단계를 일치시키고 이 준비 상태에 따라 버튼을 연다. phase 단독·바인딩 성공·재진입·조회만으로 준비를 추정하지 않는다. VERIFIED는 인증서 수집이 저장소 검증을 마쳤다는 상태이며 최종 자격·지급은 기존 evidence 판정으로 확인한다.

## 서버 경계

- 시작 시 기존 Moodle 명령 승인/실행, 참가자·신청 결합, ACTIVE 상태와 revision을 확인한다. 시작 승인 한 건의 원래 intent·identity·context·만료·CONSUMED 상태를 source authority로 유지한다. 5초 전송 grant를 연장하지 않는다.
- 시작 수락 뒤 request를 발급하며, 서명 대기와 접수 후 및 원천 호출/증빙 반영 전후에도 같은 authority를 확인한다. authority callback은 SQLite projection을 다시 읽지 않는다.
- Native 관리형 소스의 준비에서는 브라우저를 열거나 navigate하지 않는다. 서버의 원본 요청에 대한 참가자 서명을 접수하고, 서명·요청·유효기간·현재 권한을 다시 검증한 뒤 브라우저를 한 번 열어 HackerRank로 이동한다. 이후 로그인 준비 신호를 기다린다.
- 잘못된 서명, 서명 거절, 만료, 취소, 원래 intent 종료, 참가자 변경은 창을 열지 못한다. 이미 열린 창의 원천 수집 역시 권한 상실 시 차단한다. 기존 관리형 정리와 legacy 비-deferred 실행 순서는 유지한다.

## 검증 및 후속

대역 브라우저/원천·합성 지갑·HTTPS·실제 명령 예약과 저장소 회귀를 사용했다. readiness 권한 재검사와 HTTPS 시작 경로/만료 검사를 포함한 최종 관련 151개 시험이 모두 통과했다. 최종 로그는 `/tmp/clear-certificate-regression-final.log`이며 `git diff --check`도 통과했다. 실제 사용자 서명·HackerRank 창·새 증빙·AI 호출·지급은 이번 검증에서 실행하지 않았다. RE2 네이티브 모듈 부재 경고는 기존 RegExp fallback이며 시험 실패는 없었다.

C 후속은 카드의 세 콜백과 준비 상태를 이 계약에 연결하는 최소 수정이다. 기존 실행 DB/체인/브라우저를 변경하지 않고, 새 조립 후보에서 사용자 직접 start·메시지 검토·서명 → 관리형 창 열기를 확인한다. C 후보 준비 전에는 사용자에게 서명을 요청하지 않는다.

모델 추천은 서명·비동기 권한 수명 경계 때문에 GPT-6 Astra / High다. 실제 구현은 기존 GPT-6.1 Sol 세션이며, 현재 턴의 모델을 바꾸는 도구는 제공되지 않았다.
