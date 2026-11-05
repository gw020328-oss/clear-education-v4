# 실제 Moodle 전체 경로 최소 결합 후보

기준 base ee5516df83da6f02c7f462f0dadbeacde19bb052. 참가자 Moodle3/강좌2, 과제 assignment1/cm4, 회고 post3/discussion3/forum3/cm5. 참가자 지갑 0x0ea0675b3ae1e92d21ca286e5cd050f64f0bbab1, 운영자 Moodle6/MetaMask 0xfcb66ddca2123836c9df2a13838d5348d837561b. P0_POLICY 및 지급 계약은 변경하지 않는다. 과제 기준은 SUBMITTED이며 채점은 요구하지 않는다.

기존 전체모드는 native 화면을 열어도 원천 reader가 별도 E6/18768이었다. worker는 moodleFirst일 때 native withActivityReader만 선택하며 누락 시 거절한다. 별도 환경으로 fallback하지 않는다. 기존 전체모드의 collectSources → 정확 회고 입력 비용승인 → 네 조건 current MET → 수령 등록 서명 → 동일 판정 양측 동의 → 지급 경로를 재사용한다. HR 요청/서명/claim owner/source lease 및 자금 코드는 수정하지 않는다.

native full reader는 기존 5개 read 외 공식 forum adapter의 정확 세 read를 허용한다. courseids[0]='2', forumid='3'/page='0'..'9'/perpage='20', postid='3'만 받는다. 선택 metadata는 기존 reflectionSelection 검사와 고정 post3/discussion3에 묶인다. 원 AbortSignal/owner 현재성/선택 유효기간을 전후 검사하며 실제 post 응답의 작성자3·시각·visibility·삭제/비공개 여부를 재검사한다. 응답은 기존 adapter와 AI 승인 경로로 반환할 뿐 원문을 로그/보고/파일에 쓰는 새 코드는 없다. 기존 adapter의 안정된 두 번 조회와 사용자 입력 비용승인을 유지한다.

PHP scope의 forumSelection이 있을 때만 서비스 allowlist에 forum 3개 read를 추가한다. prepare/issue는 기존 참가자 상태·등록·과제 권한 외 post3 metadata/동일 discussion·forum·course 및 mod/forum:viewdiscussion을 확인한다. 메타데이터 조회의 SELECT 필드에 원문/제목은 포함하지 않는다. revoke는 동적 권한·시간 소실 후에도 정확 token/service/user로 정리한다. forumSelection 없이 기존 활동 5개 경로는 유지한다.

조립 후보는 /private/tmp/clear-a-moodle-activity-20261105/r21-native-owner-runtime.candidate.mjs 및 r21-full-reader-composition.diff이다. 실제 stage에는 full mode(activityReturnOnly/certificateCardOnly 제거), fresh reflection-selection.json, 그 동일 metadata를 activity-reader-scope.json의 forumSelection에 복사하고 tracked PHP를 mount해야 한다. owner candidate는 기존 검증된 host reflectionSelection과 scope metadata 일치를 확인한다. 관련 tracked JS/PHP/selection파일과 scope/runtime를 모두 owner pins에 포함하고 pins→loader→host SHA를 다시 계산해야 한다. 아직 새 실행 디렉터리/서비스 권한에 적용하지 않았다.

집중 JS 5 PASS: native 선택/fallback 거절, 실제 readForumTarget adapter와 정확 read/원 signal, 임의 scope/추가키/coercion 거절, metadata/author/visibility/owner/expiry 거절, 취소. 실제 고정 PHP8.3 interpreter+격리 DB/API doubles 총31 PASS: 기존19와 forum 권한/metadata 거절·소실 후 revoke 등12. 실서비스 DB 권한변경·토큰발급·원문조회·Gemini 호출·HR 수집·지급은 수행하지 않았다. 별도 새 forum 권한 검토 후 실제 적용한다.

r17 HR은 종료된 이전 application/source lease의 성공 증거다. 새 application에서 현재 유효한 것으로 복사하지 않는다. 안전한 재사용 포트가 없으므로 전체모드 준비 완료 뒤 기존 카드 시작·사용자 서명·HackerRank 로그인 경로를 1회 사용한다. 회고도 이번 입력에 대한 운영자 비용승인을 기다린다.

시연 준비 순서: 검토된 source pins/ZIP/가격·운영자 지정·키 존재·고정 학생/강좌 준비 → 양측 Moodle 로그인/지갑 서명 → 신청/원천조회 → 인증서 카드 시작/서명/HR 로그인 → 운영자 exact 회고 비용 승인 → 수령인 등록 → 양측 같은 판정 동의 → 100 TEST 영수증·잔액 전후·거래 확정 기록. 실행 TTL 30분 및 원천 currentness 900초를 넘기지 않게 사용자 안내는 전체 준비 후 한 번 한다. 성공 환경은 영수증 확인 전 FINISH하지 않는다. 장기 보존/영상은 TTL 및 민감정보 수명과 구분하며 기존 정상 cleanup을 유지한다.
