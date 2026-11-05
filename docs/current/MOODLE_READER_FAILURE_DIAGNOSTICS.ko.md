# r21 첫 원천 실패의 제한된 진단 후보

base ed1ef69ddb4f9be0a92f888b3a4bd5fa8f36b1ce. r21 application 연결 후 첫 activity-complete는 REVIEW_UNAVAILABLE로 실패했고 기존 정상 cleanup 세 항목이 완료됐다. 실제 PHP issue/exact revoke 격리 확인은 성공했다. 현재는 최초 lower exception/HTTP status가 남지 않아 원인은 확정하지 않았다.

네트워크 없는 실제 normalMoodleFullReadClient + createPinnedReadTransport 조합은 site_info/contents/completion 세 고정 메서드의 숫자 입력→form 문자열 및 Response 계약을 통과했다. 이 결과를 실제 원천 성공으로 취급하지 않는다.

진단 변경은 read transport의 기존 거절 코드를 유지하면서 원 예외를 cause로 보존하고 100..599 HTTP 상태만 non-enumerable 필드로 보존한다. 취소/시간 초과/401/403/기타 실패를 성공으로 전환하지 않는다. D executionErrorSummary의 허용 코드에 고정 네트워크/TLS/선택 거절 코드만 추가한다.

별도 owner 진단 wrapper는 허용된 고정 메서드명/HTTP status/D 안전 요약만 최대16건 기록하며 인자·URL·query·body·토큰·원본 오류 message/stack을 기록하지 않는다. getter/proxy는 읽지 않으며 진단 저장 실패가 원래 예외를 가리지 않는다. 조립 후보 /private/tmp/clear-a-moodle-activity-20261105/native-owner-runtime.diagnostics-candidate.mjs 및 native-owner-diagnostics.diff는 실제 r21에 적용하지 않았다. 실제 적용 시 새 파일 pins와 loader/host 해시 및 실행 이름이 필요하다.

집중 진단4 PASS와 변경 경계 관련 기존 client/collection 진단14 PASS. 기존 시험의 RE2 native 모듈 누락 경고는 있었지만 총14개는 통과했다. 실제 전체 실패는 아직 미재현이며 새 로그인·서명·HR·AI·지급을 실행하지 않았다. 실패한 r21을 복원하거나 hotpatch하지 않는다.

실제 read 진단이 필요하면 현재 동적 참가자 권한과 고정 service2/user3를 확인하는 별도 임시 진단 backend에서 site_info 한 메서드만 실제 동일 TLS/transport로 호출하고 토큰은 finally에서 즉시 exact revoke해야 한다. 판정·근거 발급/새 application 생성은 하지 않는다. 이 단계의 실행 범위는 본부에 제시 후 확정한다.

## 승인된 실제 좁은 조회 결과

site_info 1회, 이어 contents(course2) 1회와 completion(course2,user3) 1회가 실제 동일 TLS/전송 경로에서 모두 성공했다. 후속 두 호출 HTTP200, 응답은 메모리에서 폐기했다. 각 진단의 exact token revoke/임시 컨테이너·볼륨 제거 및 stage pins 전후 동일성을 확인했다. 이 결과는 기존 r21의 전체 source-session 성공이나 원인 해소가 아니다. 추가 실조회·전체 재실행은 하지 않았다.

상위 adapter의 client.call은 consumer authority()를 전후 수행한다. 이 authority가 던진 고정 오류도 bootcamp.mjs catch에서 REVIEW_UNAVAILABLE로 변환되면서 원인이 사라졌다. 이 catch에 cause만 보존하고 D 허용 목록에 BC_LIVE_MOODLE_AUTHORITY를 추가했다. 오프라인 hook으로 같은 바깥 오류와 내부 권한 오류의 축약을 재현하고, 수정 후 안전 요약에 원인이 보존됨을 1개 집중 검사로 확인했다. 실제 r21 원인이 이 권한 오류였다고 확정하지 않는다. 실제 r21 metadata의 application revision2와 request expectedRevision2가 같으므로 단순 revision 불일치 가설도 입증되지 않았다.
