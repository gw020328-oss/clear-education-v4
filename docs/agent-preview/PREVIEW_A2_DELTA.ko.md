# A2 proposal 결합 수정

기준 parent는 취소 후보 6f4ea56902cf8e2eb7bc7632d6d44424148982de다. 이 문서가 포함된 commit이 A2 별도 delta다.

- /observations, /v1/preview/execute, /v1/preview/observation-result의 요청과 응답은 zero64 proposalHash를 거부한다. prepare/generate의 사전 draft zero64와 응답 correlation은 유지한다.
- acceptVerifiedDraft의 세 번째 인자로 exact {sourceText,rows}가 필요하다. B가 현재 source/model bodyHash와 기존 AST 검증기가 계산한 proposalHash를 대조한다. nonzero 문자열만 제출하거나 검증 자료를 생략하면 거부한다. 검증 후 현재 context를 다시 검사하며 원문·절 목록을 저장하지 않는다.
- 기존 PHP/Node 정상 fixture 3개는 이미 nonzero 제안을 사용해 바이트 변경이 없다. fixture SHA256은 376b30e6f27611555ff81f7e6de598dcb1840e73a5e15290a584821af02e8069다. canonicalization/서명 필드/wire version도 동일하다. PHP 참조는 서명 바이트 fixture이며 C 운영 validator에는 이 경로별 수락 조건을 별도로 반영해야 한다.
- 독립 raw signing 코드로 유효 MAC의 zero proposal 요청·응답을 세 경로에 각각 구성하고 실제 decode/request 검증에서 거부를 확인했다. 거부 후 동일 requestRef의 유효 제안은 수락돼 replay 비소비도 검사했다.
- 원문 변경, 절 위치 변경, 임의 nonzero hash, 검증 자료 생략을 거부하고 실제 AST hash로 검토·관측까지 성공했다.
- 기존 CI guard 명령으로 strict85 + loopback20 =105개 PASS. 신규3개 검사에 위 반례를 포함한다. f710853 정상 fixture 검사와 6f4ea56 취소 회귀도 포함된다.

로컬 출력은 /tmp/clear-a2-strict.log와 /tmp/clear-a2-context.log다. C 취소/만료 리뷰와 실제 peer 연결 활성화는 본부의 별도 인수 항목이다. 기존 Draft PR155는 workflow 후보7f1daf8을 유지한다.
