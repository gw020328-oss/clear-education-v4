# Moodle 원탭 nonce·지갑 연결 후보 0.1.12

기준 C HEAD는 `caeae8cafe5af02a6e9983e77b7a9d148b472ceb`다. A 계약/번들 검증은
`baf6c44cac209ce0e7faec4cc56434401286642c`를 별도 snapshot으로 고정했다.
이번 범위는 `plugins/moodle/**`이며 live 설치, wwwroot, 사용자 run을 변경하지 않는다.
요청 모델은 Astra / High, 실제 실행 모델은 GPT-6.1 Sol이다. 현재 턴의 모델 전환은
지원되지 않아 변경했다고 보고하지 않는다.

## 활성화 전제와 설정

설치 ZIP만으로 nonce hook이나 지갑 연결이 활성화되지 않는다. 검토·조립 후 후보
Moodle `config.php`에서 기존 설정 다음, `lib/setup.php` **이전**에 아래 파일을 include한다.

```php
require(__DIR__ . '/local/clearbridge/native_document_config.php');
require_once(__DIR__ . '/lib/setup.php');
```

기존 `moodlepageclass` 또는 `moodlepageclassfile`이 있으면 덮어쓰지 않는다. 대상 문서는
503/no-store로 거부되므로 설치 담당자는 먼저 custom class 충돌을 검토해야 한다.
다른 경로와 CLI는 기존 page/requirements 동작을 유지한다. 코어 파일은 수정하지 않는다.

private HTTP upstream은 A의 고정 HTTPS gateway만 접근할 수 있어야 한다. A는 caller의
nonce 헤더를 제거하고 매 요청 새 `x-clear-document-nonce`를 전달한다. 형식은
`/^[A-Za-z0-9+/]{32}$/`다. exact `/local/clearbridge/index.php`와
`/local/clearbridge/configure.php`의 REQUEST_URI 경로와 SCRIPT_NAME이 일치해야 한다.
누락/오염 nonce 또는 script 경로 불일치는 Moodle 초기화 전에 503/no-store로 차단한다.
OAuth callback은 이 hook의 대상이 아니며 PHP로 전달하지 않는다.

후보 `$CFG->wwwroot`, loginscope.moodleOrigin, 필요시 fixedscope.moodleOrigin 및
기존 login.browserOrigin은 A가 확정한 HTTPS origin과 정확히 같아야 한다. Host 보존
private upstream에서는 기존 검토대로 sslproxy 설정과 secure Moodle session cookie를
사용하며, 임의 forwarded header를 신뢰하지 않는다. 이 문서는 live 설정 변경 명령이 아니다.

기존 login authority 설정/전체 loginscope에 더해 `$CFG->local_clearbridge_native_wallet`은
exact8 키 `appId, origin, redirectUri, phase, chainId, rpcUrl, instanceId, surface`를 갖는다.
`surface=MOODLE_NATIVE`, `phase=ACTIVE_LOCAL_TEST`, origin은 wwwroot 및 browserOrigin과
동일하고 callback은 `origin + '/local/clearbridge/wallet-return'`다. 값은 A owner의
확정 설정을 사용한다. appId가 없는 참가자, 전체 scope·실제 세션·활성 등록·역할/권한을
통과하지 못한 페이지에서는 module을 등록하지 않는다. 임의 새 origin/App ID를 만들지 않는다.

서버가 현재 역할, 양의 courseId, sesskey를 더해 exact11 mount config를 만든다.
sesskey는 A의 기존 native login closure가 고정 same-origin C form POST에만 사용한다.
provider/A API/onState/URL/저장소/로그에 보내지 않는다. 지갑·서명·CLEAR 세션 소유권은 A에 있다.

## 스크립트 신뢰 경계

Moodle 4.5.15의 `moodle_page::magic_get_requires()`와 protected `_requires`,
`page_requirements_manager::get_head_code/get_top_of_body_code/get_end_code`의 실제
시그니처를 사용한다. 다른 Moodle 버전·별도 theme/requirements 확장은 재검토 대상이다.

head/end는 parent requirements emitter가 생성한 조각만 좁은 문법으로 파싱한다.
nonce는 정확한 `html_writer::script()` inline wrapper에만 부여한다. 예상하지 않은
markup·raw script breakout은 거부한다. 외부 linked resource의 source policy를 nonce로
확장하지 않는다. parent top-of-body에는 theme skip-link HTML이 섞이므로 마지막의
고정 `document.body.className += ' jsenabled';` 스크립트만 처리한다.
사용자/강좌 HTML, 전체 HTML, gateway 응답 전체는 이 함수에 넣지 않는다.

동일 nonce가 trusted 스크립트, `meta[name=sc-nonce]`, 고정
`/clear-assets/moodle-native.js` module 태그 및 A `embeddedCsp`에 사용된다.
YUI 3.18.1의 `_afterConfig`는 global 옵션이 없으면 `Function('return this')`를 호출한다.
trusted head에서 `YUI_config.global = window;`를 지정해 이 eval 호출을 피한다.
unsafe-inline/eval 정책은 추가하지 않는다. nonce는 객체의 요청별 필드이며 저장하거나
캐시에 넣지 않는다. 문서는 cacheable=false이고 gateway 응답은 no-store여야 한다.

## UI와 권한

C AMD는 고정 same-origin ESM의 `mountCourseWallet({element,config,onState})`만 호출한다.
A exact11 view validator 규칙과 8개 command를 C에도 고정했다. extra/잘못된 값·다른
role 상태는 현재 mount를 닫고 조작을 숨긴다. 늦은 callback은 닫힌 UI를 복구하지 못한다.
지갑/provider 자동 선택, 네트워크 자동 전환, 자동 sign-in/finish는 없다.

AUTHENTICATED는 CLEAR 로그인 표시이며 CONNECTION_PENDING에서만 별도
‘CLEAR 연결 완료’ 클릭을 보낸다. CONNECTED는 A가 기존 C finish 결과를 확인한 표시다.
기존 start/status/finish/end HMAC, 5초 lease, 원 세션·전체 scope·TTL·단회 처리는 그대로다.
표시값은 신청/수령 등록/증빙/AI/동의/지급 권한이 아니다. 사업 action은 계속 비활성이다.

## 검증과 남은 제한

격리 Moodle 4.5.15 + 실제 headless Chrome에서:

- 학생/교사 M.cfg와 core/config AMD 초기화, 7개 trusted script와 meta/module/CSP nonce 일치,
  새로고침 nonce 변경 및 no-store를 확인했다.
- raw 강좌 script와 onerror handler를 fixture로 주입해 실행되지 않음을 확인했다.
  parent skip-link의 script도 nonce를 얻지 않는다. 비대상 `/my/`는 parent 동작을 유지한다.
- exact11 config와 원탭 UI를 합성 adapter로 연결해 두 역할의 명시 선택→네트워크→로그인→
  별도 finish를 검사했다. 이는 실제 로그인·finish authority 성공 증거가 아니다.
- A baf6c44 production ESM을 별도 빌드해 실제 문서에서 합성 EIP-6963 provider 및 합성
  eth_chainId/eth_getCode 응답으로 NETWORK_READY까지 확인했다. 서명/sign-in은 실행하지 않았다.
- nonce config 9개 경계 사례, 실제 Apache 누락/오염 nonce 6개 요청, strict emitter 검사를 수행했다.
  C renderer/validator/composition 6개와 A 취소·재연결/finish proof 관련 controller 7개를 확인했다.
  기존 C login authority 전체 scope 회귀도 실행했다. 실제 문서의 scope origin을 바꾼
  음성 검사에서는 학생/교사 모두 module과 조작이 활성화되지 않았다.

YUI eval 차단은 global 옵션 보완 후 사라졌다. 기존 Moodle의 style-src-attr, data font,
외부 MathJax 차단은 남는다. 확인한 CLEAR 선택·버튼·네트워크 상태 표시와 기본 페이지
구조는 동작했지만 모든 Moodle theme/메뉴/수식·폰트 기능의 호환성을 주장하지 않는다.
실제 Google/Privy callback, MetaMask 승인·서명, 원탭 실제 auth/finish 및 A gateway의
전체 route/cookie 결합은 별도 검증 대상이다. 브라우저 검사는 A CSP 함수를 재사용한
C 전용 합성 HTTPS gateway에서 수행했고 A production gateway 전체를 검증한 것은 아니다.
검증 당시 A baf6c44에는 B가 보고한 C end UNKNOWN 뒤 재연결 및 finish 직후 지갑 현재성
재확인 두 P2의 수정이 대기 중이었다. C ZIP은 A 번들을 포함하지 않으며 실제 인증
활성화 승인을 뜻하지 않는다. 후속 A head의 수정 검증은 별도 evidence로 기록한다.

검사 파일은 이 디렉터리의 `native_document_*`, `course_native_wallet_*`,
`native_wallet_adapter_fixture.mjs`다. 로컬 evidence는
`/private/tmp/clear-c-native-csp-evidence`이며 A source/asset SHA-256도 기록한다.
합성 fixture·계정·nonce·키·browser profile은 배포 ZIP에 포함하지 않는다.
