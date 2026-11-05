# 새 회고 글의 소유자 선택 후보

2026-11-05. 기존 fixture report와 그 hash는 변경하지 않는다. 새 회고는 브라우저 요청이 아닌 부팅 전 소유자 파일 `reflection-selection.json`으로 선택한다. host 설정의 `reflectionSelectionSha256`이 정확한 파일 bytes를 고정한다. 준비 검사와 worker 활성화에서 보호된 파일 권한·경로·SHA256·현재 기한을 확인하며, worker는 한 번 읽은 복제본만 준비 함수로 전달한다.

`clear-normal-reflection-selection.1`의 정확한 필드는 version/origin/participantWallet/courseId/cmId/forumId/authorId/postId/discussionId/createdAt/modifiedAt/observedAt/expiresAtExclusive다. 같은 로컬 origin·참가자 지갑, course2/cm5/forum3/author3을 요구한다. 기존 고정 post1은 이 신규 선택 입력에서 거부한다. 관측·수정 시각과 1시간 이하의 배타적 선택 기한을 검증한다. 선택 기한은 Moodle source authority나 AI 승인 기한을 연장하지 않는다.

prepareLiveInput은 UI 지갑 신원이 있는 경로에서만 이 선택을 받는다. 원래 report reflection의 selectedPostId만 새 ID로 선택하고 선택 메타데이터 전체를 별도 mapping 필드에 넣어 새 runtimeMappingHash와 새 체인 준비에 묶는다. reportHash/정책/원천 버전/다른 조건 mapping은 보존한다. 선택이 없으면 기존 경로와 post1 매핑을 유지한다. 실행 중 mapping 변경이나 이전 증빙 재활용은 없다.

회고 consumer의 기존 공식 Moodle reader 앞에서 선택된 post GET의 ID/discussion/author/created/modified/visibility/deleted/privateReply를 매 호출 전후 검사한다. 본문은 이 metadata fence에서 읽거나 복사하지 않는다. 기존 readForumTarget의 강좌·게시판 목록·작성자·가시성·동일 글 재읽기 안정성 검사와 원래 source lease·서명·현재성 검사는 계속 수행한다. 글 수정·비공개·삭제·잘못된 작성자·기한 경과는 수집을 차단한다. 글 선택은 본문 검토나 회고 MET, AI 비용 승인을 뜻하지 않는다.

합성 검증 43개 통과(normal-reflection-selection, normal-host, normal-source-session). 신규 검사는 잘못된 scope/원본 post/임의 추가 필드/선택 파일 변조/만료, source await 중 변경, 기존 공식 forum reader의 2회 관측, 본문 미열람·입력 복제와 mapping hash 변화를 포함한다. 실제 새 회고는 metadata 조회에서 post3/course2/forum3/작성자3/삭제 아님으로 확인했으나, 이 후보로 권한 있는 공식 API 수집·AI 호출·새 실행을 수행하지 않았다. 원천 진실은 선택 파일이 아닌 다음 정식 source 읽기가 검증한다. 새로운 AI 승인과 독립 경계 검토 전 runtime에 적용하지 않는다.

## 선택 reader의 취소 신호 보존

독립 검토에서 신규 metadata wrapper가 기존 client.call의 세 번째 인자 AbortSignal을 누락한 문제를 확인했다. 원래 signal 객체를 그대로 전달하고 metadata await 전후에도 기존 REVIEW_CANCELLED로 거부한다. 새 signal이나 기한을 발급하지 않는다. 실제 transport를 쓰는 합성 9개 검사에서 selected/control의 정상, pre-abort, token-await 중 취소(fetch 0), fetch-await 중 취소와 signal을 무시하는 client에서도 결과 반환을 거부하는 것을 확인했다. 기존 43개나 별도 source 기한 검사는 반복하지 않았다. 실제 네트워크·AI·새 post 선택 파일 발급은 수행하지 않았다.
