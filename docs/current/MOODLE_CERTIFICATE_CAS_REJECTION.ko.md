# 인증서 시작 CAS 거절과 전역 로그인 취소 분리 후보

base 48bf3af867547fcbbc4fc4d786eb0183ccb7fc20. 실제 r22는 강의·과제 MET 후 revision5이며 인증서 source stage에서 대기한다. HR collection/signature는 아직 시작 관측되지 않았다. C030은 create/read-operation의 과거 applicationRevision을 인증서 CAS에 유지하며, read-application은 이를 갱신하지 않는다. 이 구조와 stale CAS guard는 확인했지만 실제 사용자 HRstart POST의 HTTP409/BC_REVISION_CONFLICT는 관찰하지 못했다.

A controller runWorkflow의 기존 catch는 읽기 이외 모든 실패를 cancel→authenticated=false로 처리했다. 따라서 C가 제시한 CANCELLED 시 카드 닫힘과 연결되는 코드 경로는 확인됐다. 실제 r22 요청의 원인이 이 경로였다고 확정하지 않는다.

최소 후보: API client는 POST /bootcamp/v4/applications/{id}/certificate-start 에서 HTTP409 및 정확한 서버 error BC_REVISION_CONFLICT일 때만 해당 고정 code를 보존한다. 다른 경로/메서드/상태/알 수 없는 오류는 기존 분류를 유지한다. Controller는 start-certificate의 이 정확한 code/status이며 기존 연결·epoch·session·wallet이 그대로일 때만 전역 취소를 생략하고 MOODLE_CERTIFICATE_REVIEW_CHANGED를 반환한다. workflow 객체는 기존처럼 폐기하며 자동 재시도는 추가하지 않는다.

결과는 outcome=HTTP_ERROR, serverEffect=NOT_ACCEPTED이다. POST가 실제 전송됐으므로 NOT_SENT로 분류하지 않는다. API 클라이언트의 기존 NOT_SENT는 fetch 전 실패/중단을 뜻한다. 이 예외는 사용자에게 새 읽기와 명시적 재검토가 필요하다는 의미이며 재전송·서명·권한을 승인하지 않는다. 원 intent grant도 복원하지 않는다.

서버 normal-certificate-start.mjs start()는 참가자/상태 확인 뒤 현재 application revision CAS를 검사하고, 통과한 뒤에만 captureCertificateAuthority/memoryCommitted/attempt 기록/state START_ACCEPTED/gate.resolve를 수행한다. 해당 BC_REVISION_CONFLICT는 intent 수락 이전이며 HR request/서명/창 생성이나 지급 효과가 없다. 일반409·다른command·401/403·wallet/auth 소실은 기존 전역 취소를 유지한다.

집중 API/controller 신규 3개 검사와 기존 read409/auth/write 분류 검사1개 PASS. 정확 경로/code만 보존, 연결 유지/자동 재시도 없음, 다른 command·401/403·일반409는 취소, 진단·응답에 원문 미포함을 확인했다. Controller 검사는 별도로 검증된 API 고정 오류를 주입하는 계약 검사이며 실제 r22 POST 재현이 아니다. 기존 server gate 집중 검사에서 stale CAS 거절도 재사용했다.

C 소유 workflow 제품 파일은 변경하지 않았다. C는 잠정 오류 code/outcome/serverEffect 계약에 맞춰 현재 판정의 application revision을 검토에 반영하고, 필요 시 명시적 재검토 후 새 사용자 start를 허용하는 국소 후보를 별도로 검토한다. 새 브라우저 bundle과 owner/head pins 적용은 독립 권한 검토 후 수행하며 r22 live patch는 하지 않는다.
