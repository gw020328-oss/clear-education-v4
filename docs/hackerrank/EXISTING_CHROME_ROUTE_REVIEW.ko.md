# 기존 로그인 Chrome에서 새 요청 결합 proof로 연결하는 경로 검토

2026-10-20 후속: [과거 성공 대조와 준비 연결](PREPARED_SOURCE_REVIEW.ko.md)은 공식 Community 비밀번호 복구 후보의 확인 범위와 새 `prepareHackerRankSource`를 기록한다. 아래 검토 당시 없던 동일 owner의 `pins → collectLease` seam은 합성 구현했으나 관리형 로그인/실제 recipe/trust/host 연결은 여전히 미완료다. 아래 외부 인증 차단을 해소한 것으로 읽지 않는다.

2026-10-20. 기준 `ced12b1e66e6c82aa86eabb88474247f2dcd5b10`, 작업본 `clear-hackerrank-bootcamp`, 브랜치 `codex/hackathon-normal-source-entry`. 이번 산출물은 **공식 지원 후보 하나와 현재 연결 불가 지점**이다. 실제 증명 성공이나 새 확장 도입 승인이 아니다.

## 결론과 선택한 후보

검토한 기존 Chrome 후보는 **Reclaim 호환 확장 → 서버가 만든 새 요청 → 공식 attestor의 새 account/certificate proof → 기존 수락 경계**다. 후속 UI 확인에서 Reclaim 확장은 설치 목록에 없었고, 공개 provider 목록에도 필요한 pair가 없었다. 따라서 **확장 설치만으로 해결되지 않으며 현재 승인 범위에서 바로 실행 가능한 기존 Chrome 연결 경로는 확인하지 못했다.** 새 전용 Chrome의 Google 로그인 반복, 비밀번호 변경, 기본 프로필 CDP 재시작·복사, 쿠키 추출·전달은 후보에서 제외한다.

공식 문서는 웹에서 설치된 호환 확장을 호출하는 경로를 제공하지만, 일반 웹 페이지가 다른 사이트의 로그인 세션을 바로 수집하는 API를 제공하지 않는다. 확장은 provider 인증 탭과 proof 생성을 담당한다. 따라서 기존 Chrome의 로그인 상태를 사용할 **후보**라는 판단이며, 이번 계정에서 로그인 없이 작동한다는 보장은 아니다. [공식 Web Integration](https://docs.reclaimprotocol.org/browser-extension/web-integration), [구조·권한](https://docs.reclaimprotocol.org/browser-extension/extension-integration).

현재 승인 범위에서는 이 후보를 구현·설치하지 않았다. “새 확장/새 아키텍처 대형 개발은 먼저 필요성과 최소안 보고”라는 이번 인계 조건을 따른다. 본부가 후속으로 허용한 기존 Chrome 확장 목록의 읽기 전용 확인만 수행했다. 공식 확장의 실제 배포 식별자·버전·권한·데이터 경계를 먼저 확인해야 하며, 문서의 “official extension (if available)”를 실제 설치 가능성이나 검증된 배포물로 간주하지 않는다.

## 설치·공개 provider·배포물 확인 결과

기존 일반 Chrome의 `chrome://extensions/` 전체 확장 UI에 Reclaim Extension/공식 Reclaim 호환 확장은 표시되지 않았다. 다른 확장을 Reclaim 수집기로 대체하지 않았다. 새 확인 탭만 열었고 설치/활성화/권한/개발자 모드 변경0이다. 확인 탭 닫기는 사용자의 Chrome 조작 감지로 거부됐고, 재조회도 timeout이므로 탭 종료를 확정하지 않는다. 사용자의 원래 탭·브라우저를 종료하지 않았다. 다른 확장 목록과 사용자의 다른 탭 내용은 이 문서에 복사하지 않는다.

공식 [extension 저장소 README](https://github.com/reclaimprotocol/reclaim-extension/blob/406c1b4e92ebca4f7ca88a4e052c1ea3be7989aa/README.md)가 안내한 [공개 active provider API](https://api.reclaimprotocol.org/api/providers/active)를 비인증 GET으로 한 번 조회했다. HTTP200, provider20368개 중 레코드에 hackerrank가 있는 것은 다음 두 개였다. 이 조회는 public catalog이며 사용자 HR 본문이나 개인 proof를 요청하지 않았다.

| 공개 provider ID | 원천/추출 | 필요한 조건과의 차이 |
| --- | --- | --- |
| `c8e43f39-f828-4172-9294-ffae4d722971` | `rest/hackers/{{URL_PARAMS_1}}/badges`, 첫 모델의 badge_name | Python(Basic) certificate의 ID/name/status 레코드가 아니다. 사용자 지정 경로의 배지로 본인 계정 통제를 입증할 수 없다. |
| `e368eb16-c56f-48ce-ab4c-d49e448427d0` | unread notifications, 첫 모델의 from.username | 알림 발신자의 username을 로그인 계정 소유자로 간주할 수 없다. 인증서 proof도 없다. |

두 항목의 catalog 값은 isActive/isApproved=true, isVerified=false다. catalog의 승인 flag를 CLEAR sourceReview로 승격하지 않는다. 이는 조회 시점 공개 목록에 필요한 pair가 없다는 결과이며, private provider나 미공개 지원이 전혀 없다는 뜻은 아니다.

공식 조직의 extension 저장소 HEAD `406c1b4e92ebca4f7ca88a4e052c1ea3be7989aa`는 템플릿으로 설명되어 있고 manifest version은1.0.4다. README/manifest/공식 문서에서 실제 Chrome Web Store 배포 ID와 해당 소스의 배포 일치 근거는 확인하지 못했다. 이름이 같은 비관련 확장을 설치 후보로 사용하지 않는다.

이 고정 템플릿의 [`claim-creator.js`](https://github.com/reclaimprotocol/reclaim-extension/blob/406c1b4e92ebca4f7ca88a4e052c1ea3be7989aa/src/utils/claim-creator/claim-creator.js#L259)는 claim 객체 생성 때 offscreen에 key를 요청하고, [`offscreen.js`](https://github.com/reclaimprotocol/reclaim-extension/blob/406c1b4e92ebca4f7ca88a4e052c1ea3be7989aa/src/offscreen/offscreen.js#L89)는 요청마다 난수 key를 반환한다. 이 경로는 현재 mapping 이전 owner 고정과 동일 owner의 두 proof 계약을 그대로 충족하지 않는다. 템플릿을 실제 배포 확장이나 별도 browser-extension-sdk 버전과 동일하다고 주장하지 않는다.

## 코드에서 확인한 연결 불가 지점

| 경계 | 확인한 사실 | 의미 |
| --- | --- | --- |
| 브라우저 | `run.mjs`는 `startChrome`을 호출하고, `chrome.mjs`는 별도 profile과 `--remote-debugging-pipe`, `--disable-extensions`를 사용한다. | 기존 탭을 넘기는 인수나 기존 확장 연결 입구가 없다. |
| 인증정보 | `browser-source.mjs`는 그 관리형 browser/session의 두 고정 URL에만 `Network.getCookies`를 호출한다. | 이 함수를 일반 Chrome용으로 바꾸면 기존 승인 저장·정리 경계가 달라진다. |
| 공식 attestor | `collector.mjs`는 `createClaimOnAttestor`에 `secretParams.cookieStr`, 메모리 owner key, 동일 client, 정확한 role별 context를 전달한다. | DOM이나 과거 signed claim만으로 이 호출을 채울 수 없다. |
| 신뢰 설정 | `pending-trust.json`은 UNCONFIGURED다. `recipes.mjs`의 유일한 제공 recipe는 발명한 합성 응답용이다. | 실제 dashboard의 계정 통제 의미·동일 certificate record·익명/타인 거부·공식 signer/epoch·hosted context를 검토하기 전에는 live 시작 불가다. |
| API 준비 순서 | API `ff07743`의 `live-context.mjs`는 mapping에 고정된 `expectedClaimOwner/trustConfigHash/recipeHash`와 `pins()`를 먼저 비교한다. 그 뒤 새 application을 만든다. | owner와 trust가 준비되기 전에 새 신청을 발급하지 않는다. |
| 현재 run의 owner | `runHackerRankCollection`이 내부 collector를 만들고 issueRequest 시 owner를 처음 전달한다. | mapping 이전 `pins()`와 이후 `collectLease()`에 바로 대입할 수 없다. 낮은 층 `createHackerRankCollector`의 동일 인스턴스를 준비부터 수집까지 유지하는 adapter가 필요하다. |
| lease | API는 동일 모듈의 private WeakMap으로 발급된 lease만 수락한다. | 확장의 반환 JSON을 기존 lease처럼 취급하거나 `read/recheck` 함수를 붙여 수락할 수 없다. |

Chrome 공식 설명은 136부터 기본 데이터 디렉터리의 remote-debugging port/pipe를 허용하지 않고 별도 디렉터리를 요구한다. 이를 기존 로그인 프로필에 붙는 최소 해결책으로 제안하지 않는다. 설치된 Chrome의 버전을 조회하거나 실제 사용자 프로필을 열어 시험하지 않았다. [Chrome 공식 설명](https://developer.chrome.com/blog/remote-debugging-port).

## 공식 SDK를 그대로 바꿔 끼울 수 없는 이유

공식 [JavaScript SDK 사용법](https://docs.reclaimprotocol.org/manual/js-sdk/usage)은 서버 요청 생성·설정 전달·클라이언트 실행·서버 검증의 흐름을 제공한다. [확장 사용법](https://docs.reclaimprotocol.org/browser-extension/extension-integration/usage)은 서버 생성 config와 확장 `fromConfig` 연결을 설명한다. APP_ID/APP_SECRET/provider ID가 필요하며 이번에는 계정 설정·비밀 파일을 조회하지 않았다. 비용·서비스 제한도 확정하지 않았다.

공개 upstream `reclaim-js-sdk`의 조회 시점 HEAD를 `a483dda82e2a2437d93571351c2d7f608182fdd5`로 고정해 다음을 읽었다. 로컬 `attestor-core@5.1.4`를 변경하거나 최신 JS SDK를 설치하지 않았다.

- [`Reclaim.ts`](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/Reclaim.ts#L859)의 `setJsonContext`는 임의 JSON context에 `reclaimSessionId`를 추가한다. `setContext/addContext`는 contextAddress/contextMessage 형식이다. 현재 P1는 정확히 여섯 개의 signed context 필드를 요구하므로 이 형태가 그대로 서명되어 오면 거부한다. 서명 후 필드를 삭제하거나 wrapper로 덮으면 서명·identifier의 검증 대상이 바뀌므로 해결책이 아니다.
- [`ProofRequestOptions`와 config 타입](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/utils/types.ts) 및 요청 클래스에서 mapping 이전 owner 공개키 예약·동일 owner의 두 proof 보장용 공개 handshake를 확인하지 못했다. contextAddress가 claim.owner와 같다는 계약으로 대체할 수 없다. 이 결과는 모든 Reclaim SDK에 해당 기능이 없다는 주장이 아니다.
- 같은 [`Reclaim.ts`](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/Reclaim.ts#L1537)의 실행은 확장 검사 실패 시 다른 flow로 이어질 수 있다. 기존 Chrome 세션이 목적인 이 검토에서 remote portal/app fallback을 자동 실행하면 안 된다. extension probe의 응답도 암호학적 증명이나 신뢰한 배포물 확인을 대신하지 않는다.

기존 `.1` request/verifier를 느슨하게 바꾸는 수정은 하지 않는다. 호환을 위해 별도 context/owner 계약이 필요하다면 실제 지원 근거와 변경 최소 범위를 본부·통합에 먼저 전달하고, 정확한 서명/nonce/current 결합을 유지하는 버전 처리로 검토해야 한다.

## 다음 한 작업과 최소 검토 범위

권장 경로 하나는 **기존 저수준 collector의 동일 인스턴스를 유지하는 prepare/pins → collectLease 2단계 연결**이다. 이 경로는 기존 owner 생성·정확 role별 signed context·검증기·단회 lease를 재사용하므로 코드 변경이 가장 작다. 다만 일반 Chrome의 인증 세션을 그 관리형 transport에 전달하는 승인된 공식 입구가 없고 관리형 Chrome의 OAuth가 거부된 상태이므로, **현재 실행 가능하다는 추천은 아니다.** 이 외부 인증 전제가 해결되기 전 adapter만 추가해 성공 경로가 열린다고 주장하지 않는다.

공식 확장 경로는 공개 provider pair 부재, 배포물 식별 미확정, owner/context 불일치, 저장·권한 검토를 동시에 해결해야 하므로 이번 정상 시연의 작은 대체 구현으로 권장하지 않는다. 신규 custom provider/확장 개발 승인을 설치 요청에 묶지 않는다. 현재 다음 입력은 공식 지원 경로의 배포·pair·사전 owner 지원 근거 또는 승인된 관리형 로그인 경로이며, 반복 로그인·기존 proof 재사용으로 대체하지 않는다. 본부가 이 차단점을 확인한 뒤 후속 범위를 결정한다.

도입 검토가 승인될 경우에도 최초 범위는 설치·실제 수집이 아니라 다음 지원 여부 판별까지다.

1. 공식 배포물과 제한된 HR 수집 권한, 원문·쿠키의 메모리/저장/전송/종료 수명을 검토한다. SDK 예제의 광범위 권한과 CSP 설정을 그대로 적용하지 않는다.
2. HR account와 certificate의 지원 provider/recipe, 필수 capture, 같은 계정·같은 레코드 결합, 두 claim의 사전 owner와 요청 nonce/current 결합을 확인한다. 공개 프로필의 소유 이름만으로 계정 통제를 인정하지 않는다.
3. 서버 config에서 요청을 고정하고 raw proof를 공개 로그·Git·체인에 남기지 않는 로컬 반환 경계를 정한다. 기존 branded lease는 소유 verifier를 통과한 뒤에만 발급하며 API의 durable nonce/current/중복 검사는 유지한다.

필요한 지원이 하나라도 없으면 정확한 부재를 보고하고 새 범용 확장 개발로 확대하지 않는다. 이 후보의 구현 일정·성공·비용0을 약속하지 않는다.

## 검증·보존·인계

이번 변경은 이 검토와 기존 수집 입구의 최신 인계 링크뿐이다. 제품 소스·패키지·trust·금고·mapping pin을 수정하지 않는다. 기존 성공한 전체 시험이나 합성 지급 run3는 재실행하지 않았다. 고정 Node24.21.0·기존 network-guard 아래 UNCONFIGURED collector가 BLOCKED/claimOwner=null이고 run이 TRUST_NOT_CONFIGURED로 반환되며 host port 호출0임을 확인했다(PASS). `git diff --check`도 통과했다. 이는 실제 source 수집 검증이 아니다.

사용자 Chrome의 확장 목록 읽기1회, 실제 로그인0, 쿠키/키/raw proof 읽기0, 새 hosted proof0, 새 신청0, 유료 호출0, 체인 거래0이다. 기존 체인·DB·키·실패 기록과 만료 시각을 보존한다. Google unsafe-browser의 정확한 원인도 이번 결과로 해결 처리하지 않는다.

HR 담당은 `src/hackerrank-evidence`와 관련 tests/docs만 소유한다. 통합에는 pins 준비 불가와 2단계 adapter 누락을 전달했다. 본부에는 위 후보와 승인 경계를 보고하며, 금고/프론트/다른 담당 코드를 변경하지 않는다. 권장 모델은 서명·현재성 검토의 Astra / High이며 이 채팅에서 실제 모델을 변경하지 않았다.
