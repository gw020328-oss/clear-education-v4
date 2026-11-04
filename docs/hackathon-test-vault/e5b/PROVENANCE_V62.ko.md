# v62 통합 출처의 범위

PR149의 v62가 반환하는 `currentSourceCandidateHead`와 memory runtime의 `currentCompatibleSourceHead`는 이미 존재하는 통합 커밋 `c171b3d9e4370a0b3dece805fe92ca9d0e63c5a8`을 가리킨다. 이전 반환값인 preview 후보 `6dcd064d5d67679946fa0fa97bf2663cc693f54d`에는 통합된 `execution-operations.mjs`의 fence 변경이 없었다. 이 수정은 출처 기록을 바로잡으며 실행 권한·서명·지급 정책을 바꾸지 않는다.

## 무엇을 이 커밋과 대조하는가

[통합 기록](../../../specs/bootcamp/hackathon-test-preview-fence-integration-v1.json)의 `candidateScope`는 `EXACT_SOURCE_TABLES_AND_LISTED_ARTIFACTS`, `wholeRepository: false`다.

- v62가 원래 두 delta를 순서대로 적용한 실행·프론트 소스 표: 211개.
- v62의 지갑 및 빌드 입력 표: 24개. 두 표의 공통 경로 1개는 같은 지문이어야 한다.
- 추가 보존 자료 5개: v60/v61 guard 원문, preview/fence delta 원문, E5B workflow.
- 중복 제거한 전체 범위는 239개다. 실행 operations·authority, preview 화면 입력, 빌더가 포함된다.

두 표의 manifest 지문은 경로 키를 JavaScript 기본 문자열 정렬 순서로 정렬한 객체를 공백 없이 `JSON.stringify`한 UTF-8 bytes의 SHA-256 소문자 hex다. 각 값은 해당 파일 bytes의 SHA-256이다. 추가 5개 자료는 경로와 지문을 통합 기록에 직접 열거한다. v62는 표의 정확한 개수·manifest 지문과 현재 파일 bytes를 모두 검사한다.

[회귀 검사](../../../tests/hackathon-test-vault/e5/provenance.test.mjs)는 239개 **모든** 경로에 대해 `git show <candidateHead>:<path>` bytes, 현재 bytes, 선언 지문이 같은지 검사한다. candidate가 실제 commit이며 HEAD의 조상인지도 확인한다. 옛 preview 후보의 execution blob은 현재 표와 다름을 반례로 고정한다. 이 검사는 기존 E5 CI의 `*.test.mjs`에 포함되며 full-history checkout에서 실행된다. 런타임은 파일 지문을 검사하고 Git 명령이나 `.git` 디렉터리를 요구하지 않는다.

## 자기 참조를 피하는 방식

candidate는 이번 수정의 커밋이나 저장소 전체 일치를 주장하지 않는다. 수정되는 v62 guard·memory consumer·통합 기록·보존 검사·회귀 검사·문서는 위 239개 범위 밖이다. 이미 존재하는 선행 커밋의 불변 blob만 후보로 삼아 커밋에 자기 SHA를 적는 순환을 피한다.

통합 기록 bytes는 v62 guard가, v62 guard bytes는 memory consumer가, consumer bytes는 E5 보존 검사가 각각 정확한 지문으로 검사한다. 원래 v60/v61과 두 delta의 bytes·권한 검증은 그대로 보존한다. memory runtime은 `currentCompatibleSourceScope`도 함께 기록하고 하위 추가 자료 표까지 동결하여 head를 전체 저장소 버전으로 오해하지 않도록 한다.

회귀 검사는 통합 기록 또는 v62 guard의 bytes가 달라지면 EVM 생성 전에 차단되는지와, 새 합성 memory runtime의 pin에 head·scope가 전달되는지를 확인한다. 후자는 합성 토큰/금고 준비까지만 수행하며 지급 동의·청구·외부 RPC·실제 원천 호출은 하지 않는다. 실제 로그인·사용자 서명·지급은 이번 검증에 포함하지 않는다. PR 전체의 독립 보안 검토와 병합 승인은 별도다.
