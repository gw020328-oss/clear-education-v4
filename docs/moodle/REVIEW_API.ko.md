# Moodle 일반 후기 API: 격리 실측과 읽기 전용 사실 어댑터

2026-10-16 / 기준 develop `4756589`(PR67). 요청 설정 GPT-6.1 Sol / Medium이며 런타임 모델 ID를 독립 확인하지 않았다. 담당 범위만 변경했다. 최신 사용자 결정은 PR70의 `MVP_DECISIONS_20261016.ko.md`를 읽기만 했고, YBM750+·시원스쿨50~300%의 **일반 후기** 연결 준비에 한정한다. 400/500%는 범위 밖이며 400% 블로그 사전검토를 새로 개발하지 않았다. 원문·기존 정책을 변경하지 않았다.

## 실제 로컬 결과

[실행 요약](../../spikes/moodle-review-api/report.json): Moodle4.5.15 고정 소스 `215f44380bdc3ccf852a3a22e34f8423ff64033a`에서 합성 수강생의 실제 REST 등록→조회→수정→삭제 및 거부 사례 **13/13 PASS**. 학습21/21 재시험은 수행하지 않았다. 실제 학원 API·실제 학생·YBM 증명·모델 호출·AI 검토·자격 판정·지급을 수행한 결과가 아니다.

표준 forum 서비스를 사용했다. 함수 존재와 의미의 참고는 [Moodle 공식 API 목록](https://docs.moodle.org/dev/Web_services_Roadmap), [공식 forum API 문서](https://phpdoc.moodledev.io/4.4/d6/d39/classmod__forum__external.html)다. 실제 필드/권한 판단의 정본은 위 고정4.5 소스 `mod/forum/externallib.php`와 `classes/local/exporters/post.php`이며, 링크된4.4 문서로4.5 실행 성공을 대신하지 않는다.

| 실제 검사 | 관측 / 제한 |
| --- | --- |
| `core_webservice_get_site_info` | writer/reader의 인증된 Moodle 계정 ID. 현실 실명 본인확인 아님 |
| `mod_forum_add_discussion` | writer로 일반 후기 등록, discussion ID 반환. 목록/글 API에서 post ID 연결 |
| `mod_forum_get_forums_by_courses` + `get_forum_discussions` + `get_discussion_post` | course→forum→discussion→post, 본문 HTML·제목·작성 계정ID·생성/수정 UNIX초·view/deleted/privateReply 확인 |
| `mod_forum_update_discussion_post` | 자신의 후기 본문/제목 변경과 sourceRevision 변화 확인. 초 단위 시각은 같을 수 있어 본문도 지문에 포함 |
| forum 숨김→복구 | 조회 불가를 미게시로 반환하지 않고 거부. 복구 후 같은 본문 지문 확인 |
| `mod_forum_delete_post` | 자신의 root post 삭제 명령 성공. 이후 invalidpostid 및 대상 목록 부재 확인. 삭제의 직접 근거는 이번 명령 성공이며 일반 조회 실패만으로 삭제를 단정하지 않음 |
| 타 작성자/타 강좌/매핑 없음 | facts 반환 없이 거부 |
| reader 쓰기·미등록 outsider 조회·잘못된 토큰 | 서비스 허용 함수/강좌 권한/인증 거부 확인 |

`visible=true`는 해당 인증 reader가 관측 당시 볼 수 있었다는 뜻이다. 인터넷 공개·모든 학생 노출·기관 인정·내용의 진실성은 UNKNOWN이다. course/forum/instance 및 SourceBinding 일부는 **host pin**이며 post 응답의 직접 필드로 가장하지 않는다. reader는 이 합성 강좌에 등록된 동료 계정이고, Moodle 권한상 볼 수 있는 글을 읽는다. 제품의 학생 본인 조회/운영자 권한 API를 구현한 것은 아니다.

## 코드와 DTO 경계

- [client](../../src/review-evidence/moodle/client.mjs): 고정 loopback18766, POST body token, 네 읽기 함수만 허용, 함수별 인자 고정·비동기 이전 복사, redirect/cookie 거부, 응답256KiB·요청 timeout·취소. 쓰기는 [실험 harness](../../spikes/moodle-review-api/run.mjs)에만 있고 다른 writer token을 사용한다.
- [facts](../../src/review-evidence/moodle/facts.mjs): 기존 `validateRunContext/runContextHash`, M1 `Binding`(RunContext 내부)·`SourceBinding`, 공통 canonical digest를 재사용한다. 새 공통 enum/schema/HTTP/DB를 추가하지 않았다.
- 반환은 `clear-local-moodle-review.1 / LOCAL_LMS_RECORD / READ_ONLY_SOURCE_FACTS`. context/hash, 별도 SourceBinding, host가 고정한 실제 Moodle 계정/강좌/게시판/글 ID와 observed 시작/종료 ms, 원천 HTML·초 단위 시각·권한 flag, 내용 지문 `sourceRevision`을 담는다. 반환은 메모리의 동결 객체이며 adapter는 원문을 로그·보고서·별도의 CLEAR 영속 DB에 저장하지 않는다. Moodle 자체 DB에는 게시물이 저장된다. 호출자는 HTML을 실행하지 않고 권한/수명 경계 안에서 취급해야 한다.
- application·policyVersion/hash·requirement·submission/route/workflow revision·run/attempt는 기존 context에 그대로 포함된다. host의 현재 context와 현재 매핑 pin을 완료 전에 재대조한다. 다른 작성자/반·mapping revision·늦은 run·수정 경합은 facts 전체를 폐기한다.
- 실측 harness의 context는 기존 공개 합성 fixture의 YBM Binding을 사용한 **계약 운반 예제**다. `SourceBinding`의 기관/코스/계정 문자열도 공개 합성 pin이다. 실제 원천 facts는 LOCAL이며 SYNTHETIC Evidence로 바꾸지 않았다. 이 운반 context는 C1/C2의 실제 ACK나 source 본문으로 만든 제출 manifest가 아니다. `submissionContentBinding=NOT_ESTABLISHED`, `usableForAcceptance=false`를 명시한다. source body와 C2 제출 inputHash/bytes의 동일성을 입증하지 않는다.

목록은20개씩 최대10페이지에서 **지정 root post**를 찾는다. warning·페이지 shape 누락/중복·상한·대상 미발견을 보류한다. 부분 목록으로 전체 이력·미게시를 주장하지 않는다. 단일 post를 두 번 읽어 같은 초 수정도 지문으로 확인하지만 API 간 원자 snapshot은 아니다. 따라서 `completeness=TARGET_ONLY_NON_ATOMIC`이며 조회 직후 수정/삭제와 ABA 변경을 막지 않는다. sourceRevision은 내용 지문이고 Moodle 단조 revision·서명·불변 감사가 아니다.

| 오류 계열 | 의미 |
| --- | --- |
| REVIEW_AUTH / REVIEW_ACCESS | 인증·권한 실패. 미게시 아님 |
| REVIEW_TIMEOUT / REVIEW_UNAVAILABLE / REVIEW_RESPONSE_LIMIT | 네트워크·형식·한도 문제. 글 존재 여부 불명 |
| REVIEW_NOT_FOUND_OR_UNAVAILABLE | invalidpostid. 다른 근거 없이 삭제/미제출로 확정하지 않음 |
| REVIEW_TARGET_NOT_IN_VISIBLE_PAGES / REVIEW_PAGE_* | 불완전 목록·조회 범위·변경/한도. 빈 목록도 미게시 증명 아님 |
| REVIEW_AUTHOR_MISMATCH / REVIEW_COURSE_FORUM_MISMATCH / REVIEW_ACCOUNT_MAPPING | 대상 또는 신뢰한 연결 불일치 |
| REVIEW_SOURCE_CHANGED / REVIEW_STALE_RUN / REVIEW_STALE_MAPPING / REVIEW_CANCELLED | 수정·새 제출/정책/run·매핑 변경·취소로 결과 폐기 |

항상 identityVerified=false, academyAcceptance/contentTruth=UNKNOWN, automaticEligibility/paymentAllowed=false, independentClaim=NO_GO다. AI observation, eligibility, funding, payment는 만들지 않는다. 예치율/배정/PG·72/120시간 제안은 OPEN이며 구현 상수로 사용하지 않았다.

## 격리·재현·정리

새 compose project `clear-moodle-review-api`,127.0.0.1:18766, 전용 DB/데이터 볼륨. 기존 `clear-moodle-local-api40`/18765/DB/비밀은 변경하지 않았다. 기존 Moodle clone에서는 **공개 고정 commit의 git archive만** 읽었고 config/untracked 파일/DB를 복사하지 않았다. 신규 학습/video plugin을 설치하지 않았다. web768MiB/1CPU,DB256MiB/0.5CPU 상한이다. compose 이미지 digest는 기존 lab의 고정을 재사용했다.

빈 환경에서만 아래 순서로 준비한다. `PUBLIC_MOODLE_REPO`는 위 고정 commit이 있는 공개 Moodle git 저장소 경로다. 기존 이 실험실에는 bootstrap을 반복하지 않는다. 소스가 고정 commit인지 운영자가 archive 명령으로 보장하며 bootstrap 자체가 준비된 소스 전체를 재검증하는 기능은 없다.

```sh
mkdir -p var/moodle-review-api/moodle
chmod 700 var/moodle-review-api
git -C "$PUBLIC_MOODLE_REPO" archive 215f44380bdc3ccf852a3a22e34f8423ff64033a | tar -x -C var/moodle-review-api/moodle
./tools/node spikes/moodle-review-api/bootstrap.mjs
./tools/node spikes/moodle-review-api/run.mjs
./tools/node spikes/moodle-review-api/cleanup.mjs
```

랜덤 비밀번호/토큰은 ignored var(디렉터리700·비밀 파일600)에만 남긴다. token은1시간 기한이고 reader 서비스에 쓰기 함수를 넣지 않는다. cleanup은 해당18766 인스턴스의 이 실험실 명명 규칙에 해당하는 합성 서비스/계정만 폐기·중단하고 볼륨/학습·후기 기록은 보존한다. 새 계정으로 재시험할 경우 cleanup 후 이 project만 다시 시작하고 `setup.php runN`의 **미사용 run**을 명시한다. 이전 active credential이 있으면 setup은 거부하고 기존 course를 reset하지 않는다.

최종 [정리 실측](../../spikes/moodle-review-api/cleanup-report.json):6서비스 비활성·7합성 계정 suspend/session 종료·토큰0·폐기 token 실제 거부·소유 컨테이너 stop. run1의 정상12개 후 추가 숨김 시험은 한글 URL pathname 인코딩으로 Docker 파일을 못 찾은 harness 실패였다. fileURLToPath로 고쳤다. 새 run2 setup은 서비스 name 중복으로 일부 합성 강좌/계정만 생성하고 실패했다. run suffix와 setup DB transaction을 추가하고 **새 run3에서 최종13/13**을 확인했다. 부분 run의 계정도 마지막 cleanup에 포함했다. 중간 실패를 성공으로 합산하지 않는다. var의 비공개 DB·비활성 자격증명 파일은 로컬에 남고 디스크 완전 삭제를 보장하지 않는다.

오프라인/실제 시험은 분리한다. 새 오프라인 회귀31개(transport/facts), 기존 workflow 계약6개 총37개는 외부 네트워크 tripwire 하에서 검사한다. 이들은 mock 응답/합성 context를 사용하며 Moodle 실행13개와 분모가 다르다. CI 루트는 소유 범위 때문에 수정하지 않았으므로 신규31개/실제Docker13개는 기존 CI에 자동 편입되지 않는다.

```sh
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test tests/moodle-review/*.test.mjs tests/product-workflow/contract.test.mjs
./tools/node tools/verify-workspace.mjs
./tools/node tools/check-public-content.mjs HEAD
```

실제 Academy HTTPS/secret store·신청자 매핑 발급·후기 권한별 열람·감사 이력·retention·원천 freshness·원자 수락 및 자동 AI 소비는 후속이다. [공통 통합 제안](REVIEW_API_INTEGRATION.ko.md)을 먼저 검토해야 한다.
