# web/ — 참가자 신청 화면 (F0 골격)

[계획 F0](../docs/current/TEAM_PLAN.ko.md)의 산출물이다. **합성 데이터로 참가자 신청
목록·상세 화면의 골격**을 만들고, 후속 [C1·F1](../docs/current/TEAM_PLAN.ko.md)에서
실제 서버와 지갑을 붙일 수 있도록 데이터 어댑터를 화면과 분리했다.

이 디렉터리는 **실행 중인 서버에 연결되어 있지 않다.** 로그인·서명·거래·증명 수집은
이번 범위가 아니다.

## 설치

**없다.** 의존성 설치 단계가 없고 `web/`에 `package.json`도 두지 않았다.

## 실행

```sh
./tools/node web/tools/dev-server.mjs
# http://127.0.0.1:5173/
```

포트를 바꾸려면 `--port 5050`을 붙인다. 이 서버는 `web/` 아래 정적 파일만 내보내는
**개발용**이며 API·인증·쿠키를 다루지 않는다. loopback에만 바인딩한다. 제품의 동일
origin HTTPS 서버는 [계획 C1](../docs/current/TEAM_PLAN.ko.md)에서 추가한다.

다른 정적 서버로 `web/`을 서비스해도 동일하게 동작한다.

## 빌드

**없다.** 번들러·트랜스파일러를 쓰지 않는다. `web/`을 그대로 올리면 된다.

## 검증

```sh
./tools/node --test web/tests/*.test.mjs
```

브라우저에서 확인할 것:

| 경로 | 보이는 것 |
| --- | --- |
| `/?scenario=default` | 정상 — DRAFT·TERMS_ACCEPTED·CONSENTED·FUNDING_PENDING·ENROLLED 각 1건 |
| `/?scenario=empty` | 신청 없음 |
| `/?scenario=slow` | 로딩 (2.4초) |
| `/?scenario=authError` | `AUTH_REQUIRED` 오류 |
| `/?scenario=apiError` | `API_REQUEST_FAILED` 오류 |

화면 위 선택 상자로도 바꿀 수 있다. 목록에서 항목을 누르면 `#/applications/<id>`
상세로 간다.

## 기술 선택과 이유

**프레임워크·번들러 없이 브라우저 ES 모듈과 정적 파일만 쓴다.**

- 저장소 루트의 `devDependencies`가 **0개**다. CI는 lockfile과 `--ignore-scripts`로만
  설치하고 `verify:dependencies`가 고정 의존성을 확인한다. 번들러를 넣으면 이 PR
  하나로 수백 개 패키지와 새 lockfile이 들어온다. F0은 화면 골격이므로 그 비용을
  치를 이유가 없다.
- 설치·빌드 단계가 없어 **아무것도 설치하지 않고 검토**할 수 있다. F0의 완료 기준인
  "실서버·실서명·실거래 없이 검토 가능"과 맞는다.
- `AGENTS.md`가 "Node·DB·수집 모듈을 브라우저 번들에 포함하지 않는다"고 한다. 번들
  단계가 없으면 Node 모듈이 브라우저로 섞여 들어갈 경로 자체가 없다.
- 프레임워크가 필요해지면 **어댑터 경계를 그대로 두고** 화면 층만 교체할 수 있다.
  F1에서 지갑 연결·상태가 늘어날 때 다시 판단하는 것을 제안한다.

해시 라우팅(`#/applications/...`)을 쓴 이유는 서버 rewrite 설정 없이 정적 파일로
동작하고, C1의 동일 origin 서버에 그대로 올릴 수 있기 때문이다.

## 구조

```
web/
  index.html              진입. #chrome(머리말·시나리오) + #main(본문)
  styles.css              단일 스타일시트. 다크 모드와 좁은 화면 포함
  src/
    main.js               해시 라우팅, 화면 조립
    adapter/
      contract.js         어댑터 인터페이스 + view 계약 검사
      synthetic.js        합성 어댑터 (지연·오류 시나리오)
    fixtures/
      applications.js     다섯 상태 fixture와 시나리오
      policy.js           컴파일된 정책 fixture (동의한 조건)
    ui/
      state-labels.js     상태별 '말할 수 있는 사실'과 '금지되는 추정'
      views.js            목록·상세·로딩·빈 목록·오류
      policy-view.js      동의한 조건 구역
      dom.js              작은 DOM 도구
  tools/
    dev-server.mjs        개발용 정적 서버 (Node. 브라우저 번들 아님)
  tests/
    contract.test.mjs     view 계약 검사
    adapter.test.mjs      어댑터·상태 문구·개발 서버
```

### 어댑터 경계

화면은 아래 인터페이스만 쓴다. F1에서 `createSameOriginApi` 위에 같은 모양의 HTTP
어댑터를 만들면 화면 코드를 고치지 않고 바꿔 끼울 수 있다.

```js
listApplications()      -> Promise<ApplicationView[]>
getApplication(id)      -> Promise<ApplicationView>
getPolicy(policyHash)   -> Promise<CompiledPolicy>
describe()              -> { mode, label, scenario, note }
```

오류는 `AUTH_REQUIRED`와 `API_REQUEST_FAILED` 둘로 한정한다.
`src/application/wallet-client.mjs`의 `createSameOriginApi`가 401을 `AUTH_REQUIRED`,
나머지를 `API_REQUEST_FAILED`로 축약하므로 화면도 그 둘만 다룬다. 서버 본문·URL·지갑
오류 문구를 화면으로 내보내지 않는다.

`contract.js`의 `checkApplicationView()`는 fixture가
[API 계약](../docs/current/API_CONTRACT.ko.md)의 필드·형식과 어긋나면 **화면에 그리기
전에 깨뜨린다.** 계약에 없는 필드를 화면이 먼저 쓰기 시작하는 것을 막기 위해서다.

## 상태 표현 규칙

`src/ui/state-labels.js`는 [API 계약](../docs/current/API_CONTRACT.ko.md)의 '화면 상태'
표를 그대로 옮긴 것이다. 각 상태마다 **말할 수 있는 사실**과 **금지되는 추정**을 함께
두고 둘 다 화면에 띄운다.

| state | 화면 제목 | 금지 |
| --- | --- | --- |
| `DRAFT` | 신청 생성 | 등록·예치 완료 |
| `TERMS_ACCEPTED` | 신청 조건 확인 | 최종 계약 동의 완료 |
| `CONSENTED` | 최종 동의 저장 | 예치 완료 |
| `FUNDING_PENDING` | 예치 준비 | 거래 전송·성공 |
| `ENROLLED` | 예치 확인 | 청구 가능·자격 충족·지급 완료 |

`ENROLLED`를 환급 가능이나 지급 완료로 읽지 않도록, 상세 화면 하단에 **이 단계에서
확인되지 않는 것**(자격 판정·청구 가능 여부·지급 결과·성적 기록)을 고정으로 둔다.
`paymentAllowed`는 항상 `아니오`로 보이고, 계약 검사가 `true`를 거부한다.

## 접근성과 좁은 화면

- 목록 항목은 실제 `<a href>`다. Tab으로 이동하고 Enter로 열린다.
- 라우트가 바뀌면 `<main>`으로 초점을 옮긴다. `aria-live="polite"`로 바뀐 내용을 알린다.
- 본문 건너뛰기 링크가 있고 `:focus-visible` 표시를 지우지 않았다.
- 375px 너비에서 가로 스크롤이 생기지 않는 것을 확인했다. 정의 목록은 한 열로 떨어진다.
- `prefers-color-scheme: dark`를 지원한다.

## 이번 범위가 아닌 것

실제 로그인·지갑 서명·거래·YBM 수집, 백엔드·DB·계약 변경, proof/청구 API.
화면은 아직 없는 API를 있는 것처럼 호출하지 않으며, 연결 편의를 위해 인증·Secure
cookie·origin 검증을 약화하지 않는다. 이 어댑터는 네트워크를 전혀 쓰지 않으므로
우회가 아니라 **아직 연결하지 않은 상태**다.

## 아직 정하지 않은 것

- `web/` 시험을 CI(`.github/workflows/public-synthetic.yml`)에 넣을지. CI 변경은 다른
  담당자에게 영향이 있어 F0에서 건드리지 않았다. 위 명령은 로컬에서 실행한다.
- 루트 `package.json`에 `test:web` 스크립트를 추가할지. 같은 이유로 보류했다.

## 동의한 조건 구역

상세 화면에 **이 신청에 적용된 조건**을 보여준다. 참가자가 3단계(최종 동의)에서
무엇에 동의했는지 나중에 확인할 수 있어야 하기 때문이다. 조건을 못 바꾸게 만드는
것이 제품의 요지인데 정작 참가자가 그 조건을 볼 수 없으면 의미가 없다.

`GET /policies/:policyHash` 에 해당하며 `src/policy/compiler.mjs` 의
`compileSyntheticPolicy` 가 내보내는 모양을 따른다. 화면이 지어낸 값이 아니라
컴파일러가 강제하는 값을 그대로 쓴다.

| 컴파일러가 강제하는 것 | 화면 표시 |
| --- | --- |
| `minScore: 800` | TOEIC_LR 총점 800점 이상 |
| `minCompletionBps: 8000` | 필수 강의 10개 중 **80%** 이상 (베이시스포인트를 퍼센트로) |
| `amount: '50000000'`, `tokenDecimals: 6` | **50 TEST** (문자열 자리수로 계산. 부동소수점 금지) |
| `supplementEndAt = normalSubmitAt + 259200` | 보완 종료 = 제출 마감 **+3일** |
| `claimUntil = normalSubmitAt + 864000` | 최종 청구 = 제출 마감 **+10일** |

`checkPolicyView()` 가 이 관계들을 검사한다. 시각은 컴파일러가 서울 기준으로 기간을
검사하므로 화면도 **KST** 로 표시한다.

**충족 여부는 말하지 않는다.** 점수·이수율 실제 값은 이 응답에 들어있지도 않다.
자격 판정 화면은 계획 **F4** 이고 선행 API(B1·B2b·B3)가 아직 없다.
