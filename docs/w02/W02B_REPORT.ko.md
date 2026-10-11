# W02 B 원천 추출과 연결 격리 및 저장 경계 시험 결과

2026년 10월 11일 · 별도 v4 작업본 · 권고 모델 GPT-6 Astra / High

**신규 합성 시험 62개와 기존 회귀 시험 107개가 모두 통과했다.** 추가로 독립 Chrome 프로필 2개의 합성 HTTP 접속과 Linux 컨테이너의 tmpfs 수명 주기를 확인했다. W02 B의 합성 시험은 마무리했지만, **실제 수집용 저장 경계는 미통과이며 W02 C 로그인은 아직 시작하지 않는다.** TEE 필수 요구도 그대로 유지한다.

제품 `src/`·`contracts/`·기존 참고 코드·과거 실험 원본은 변경하지 않았다. 실행 코드는 [별도 W02 B spike](../../spikes/w02-collector-boundary/README.ko.md)에만 추가했다. 실제 YBM 증명·쿠키·비밀번호·개인키를 읽거나 수집하지 않았으며, 합성 성적을 실제 지급 자격으로 인정하지 않는다.

## 실행 결과

| 묶음 | 결과 | 확인 범위 |
| --- | --- | --- |
| 원천 추출 | 24 / 24 통과 | 설치한 공식 attestor-core 5.1.4의 HTTP provider 함수에 인공 요청·응답과 실제 가림 처리를 적용 |
| 연결과 프로세스 격리 | 16 / 16 통과 | 독립 자식 프로세스·임시 owner·쿠키·프로필, 합성 TCP 연결 유지, 단절·종료·중복 시작 |
| 저장과 입력 경계 | 22 / 22 통과 | 합성 전용 envelope, 크기·schema·경로·symlink 거부, 24시간 경계·재시도·삭제 |
| 기존 W02 A 회귀 | 107 / 107 통과 | 기존 서명·신청·지갑·정책 결합 및 TEE 거부 시험 |
| 독립 Chrome 합성 접속 | 4개 확인 통과 | 전용 headless Chrome 2개, 서로 다른 HttpOnly 쿠키, 디스크 프로필 생성 및 시험 후 제거 |
| Linux tmpfs 수명 주기 | 7개 확인 통과 | 제한 컨테이너, 파일 권한, 삭제, 보관 상한, 디스크 대체 거부, 용량 초과, 강제 종료 후 초기화 |
| 실제 수집 저장 경계 | **미통과** | VM swap 활성, tmpfs `noswap` 옵션 거부, macOS·호스트 백업·실제 브라우저 전체 저장 경계 미확인 |

62개는 Node 시험 수다. Chrome·컨테이너 확인 항목을 합쳐 ‘시험 180개’처럼 계산하지 않는다. [기계 판독 결과](w02b-verification.json)에 시험 이름, 버전, 파일 지문, 보존 결과와 환경 제한을 기록했다.

## 원천 추출에서 확인한 문제와 적용 방향

원천 HTML은 `example.invalid`용으로 새로 작성한 합성 문법이다. 현재 YBM 페이지를 복사하거나 추정해 만든 실서비스 policy가 아니다. provider의 요청 생성·응답 가림·receipt 검증 함수는 실제 구현을 호출했고 TLS·zk 생성·공증자 서명은 실행하지 않았다. 설치 스크립트를 실행하지 않아 선택 의존성 RE2는 로딩되지 않았으며 SDK의 native RegExp 대체 경로가 사용됐다. 실제 수집 runtime의 정규식 엔진까지 일치했다고 보지 않는다.

**필수 추출 규칙을 고정해야 한다.** 허용한 각 행 안에서 시험 종류·시험일·수험번호·총점을 함께 추출하면 필드 누락·잘못된 시험·행 간 조합·보이는 중복 행을 거부한다. UTF-8 한글·이모지가 앞에 있어도 byte 가림 위치와 텍스트 추출을 분리해 올바른 값을 얻었다. 쿠키·비밀 POST 값·Set-Cookie·합성 이름은 가림 결과에 남지 않았다.

반대로 `contains: TOEIC`처럼 이름 붙은 필드를 추출하지 않는 느슨한 policy는 `extractedParameters={}`를 반환할 수 있다. 고정 core 서버 소스는 비어 있지 않은 결과에만 입력 context의 같은 필드를 교체한다. 이 병합 분기를 별도로 재현하니 **완전한 schema를 갖춘 가짜 입력 값도 남을 수 있었다.** schema 검사만으로 원천성을 증명할 수 없다. 실제 서버 전체의 서명 실행을 재현한 것은 아니며, 허용 policy 고정과 필수 추출 실패 처리가 필요한 이유다. [고정 버전 서버 코드](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/assert-valid-claim-request.ts)

또한 **첫 매치 가림은 두 번째 표를 숨길 수 있다.** 표가 두 개면 원문 검사에서는 거부되지만, 실제 provider의 첫 표 가림 결과만 검사하면 선택한 시험 값이 통과하는 사례를 재현했다. 로컬 사전 검사만으로 악성 client까지 막았다고 주장할 수 없다. 한 쌍의 증명은 확인한 시험 기록의 근거로 제한하고, 전체 시험 목록의 완전성이나 최고점 검색 완료의 근거로 확대하지 않는다. 실제 policy 확정 시 행 선택·중복·페이지 누락을 다시 시험하고, 부분 조회의 낮은 점수로 영구 탈락시키지 않는다. 전체 최고점 선택은 W05/W08에서 검증된 시험 집합과 조회 범위를 함께 다룬다.

이번 synthetic policy는 표의 최소 필드 전체를 드러내는 시험 도구다. 실서비스의 다른 시험·개인정보까지 공개하도록 채택한 정책이 아니다. 정책 hash를 새로 확정하기 전에는 v4 실제 provider 요구사항을 충족한 것으로 표시하지 않는다.

## 연결 격리와 실제 브라우저 확인

두 신청을 서로 다른 프로세스로 실행했고, 같은 신청의 합성 로그인과 두 증명 명령은 같은 TCP 연결을 사용했다. 신청 사이에서는 pid·owner 공개키·쿠키·프로필·연결 ID가 달랐다. 한 역할만 얻은 뒤 연결을 끊으면 `RETRY_REQUIRED`로 종료되고 자동 재접속하지 않았다. 새 세션은 새 owner와 쿠키를 사용했다. 취소·만료·정상 종료·SIGKILL·부모 IPC 단절에 대한 정리도 확인했다.

서명된 합성 지시서의 만료·origin·runtime·mode·nonce와 신청당 동시 시작 제한을 검사한다. 이번 선택은 **부모가 상속하는 IPC**이며 수집용 HTTP 포트를 열지 않는다. 지시서 서명은 시험용 Ed25519 키로 검증했다. 실제 웹↔native messaging 연결, 참가자 지갑과 연결한 서버 지시서, 설치·업데이트·사용자 경험은 아직 구현하지 않았다. 입력의 origin 문자열 검사는 실제 브라우저 origin 인증을 대신하지 않는다.

합성 자식 프로세스의 TCP client는 Reclaim Attestor client가 아니다. 공개 core 소스는 실제 client 객체를 전달하면 이를 사용하고 URL 설정만 전달하면 전역 pool 경로를 선택한다. 실제 이식 때는 **전용 client 객체 전달, `maxRetries: 1`, 단절 후 폐기**를 적용하고 Reclaim WebSocket 경로에서 다시 확인해야 한다. `maxRetries: 1`은 해당 구현상 총 시도 1회를 뜻한다. 이를 이번 generic TCP 시험만으로 검증 완료 처리하지 않는다. [생성 코드](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/client/create-claim.ts), [재시도 코드](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/utils/retries.ts)

Chrome 154.0.8037.99는 개인 프로필과 분리된 headless 프로필 두 개로 loopback 합성 HTTP 사이트에 접속했다. 각 프로필에 발급한 HttpOnly 쿠키가 각자 동일 원천으로 돌아오는 것을 확인했다. 실제 YBM·Reclaim 페이지에는 접속하지 않았다. 프로필에는 디스크 Cookie DB가 생겼고 종료 후 시험 디렉터리를 제거했다. **삭제 확인은 디스크에 기록되지 않았다는 뜻이 아니다.** 이 경로는 실제 인증정보 수집에 사용하지 않는다.

Chrome의 DOM 출력·자동 종료 확인은 두 차례 시간 초과였다. 합성 원천의 인증 요청 두 건은 도착했으며 display-link 오류가 관찰됐지만 원인으로 단정하지 않는다. 최종 probe는 원천 서버의 쿠키 대조를 수락 기준으로 삼고 명시적으로 브라우저를 종료한다. 화면 렌더링·사용자 과업·브라우저 crash dump 격리는 이 결과의 범위 밖이다.

## 저장 경계와 남은 차단

합성 staging은 지정 문자열 두 개만 받는 닫힌 schema다. 실제 proof 수신 API가 아니다. cookie·HTML·key·transcript·추가 필드·중복 JSON 키·잘못된 UTF-8·크기 초과·경로 변경을 저장 전에 거부한다. 오류는 고정 코드이며 입력 내용을 응답하지 않는다. 최초 보관 시각을 재시도로 연장하지 않고, 24시간 직전 유지와 경계 시점 삭제, 재시작 후 원래 시각 보존을 확인했다. 패킷 발급 등의 사건에 대응하는 삭제 함수도 검증했다. 실제 발급 이벤트·백업·DB·주기적 정리 서비스·동시 처리의 원자성은 아직 연결되지 않았다. 중간 쓰기 파일은 성공으로 재사용하지 않고 저장 오류로 중단한다.

Linux 컨테이너는 기존 로컬 이미지의 고정 image ID로 만들었다. 새 이미지를 내려받지 않았다. root 읽기 전용, 비권한 사용자, cap 제거, 외부 네트워크 없음, host bind mount 없음, Docker 로그 없음, core dump 0, cgroup swap 한도 0을 확인했다. tmpfs의 파일 권한 0600, 디스크 대체 실패, 1 MiB 상한 초과 실패, SIGKILL 후 같은 컨테이너 재시작 시 tmpfs 비어 있음을 검사했다. 생성한 컨테이너는 제거했다. 컨테이너 Node는 24.19.0이며 프로젝트 시험 Node 24.21.0과 다르다. 제품 runtime 일치 검증으로 세지 않는다.

그러나 guest 전역 swap은 활성 상태이고, 이 환경의 Docker는 tmpfs `noswap` 옵션을 거부한다. cgroup swap 한도 0은 관찰했지만 tmpfs별 `noswap`과 호스트 VM 메모리·백업 경계를 대체했다고 인정하지 않았다. Linux 문서도 tmpfs의 swap 가능성과 `noswap`을 구분한다. [Linux tmpfs 문서](https://cdn.kernel.org/doc/html/latest/filesystems/tmpfs.html)

권고는 실제 수집·검증 환경에 **swap 및 dump가 통제된 Linux 환경을 먼저 준비해 측정하는 것**이다. 서버 staging과 참가자 브라우저를 각각 검증해야 한다. VM을 쓰면 guest 설정뿐 아니라 호스트 swap·스냅샷·백업도 포함한다. Mac/Windows의 일반 디스크 프로필을 쓰고 사후 삭제하는 안으로 보장 수준을 자동 변경하지 않았다. 기존 시스템의 swap·보안 설정·실행 중 컨테이너도 바꾸지 않았다.

## 다음 순서와 로그인 시점

| 순서 | 할 일 | 완료 기준 | 추천 |
| --- | --- | --- | --- |
| W02 B 후속 준비 | 실제 수집 대상 OS와 휘발 저장 경계 구성 | 브라우저 profile/cache/temp/crash와 서버 staging, swap·dump·백업·강제 종료까지 확인 | GPT-6 Astra / High |
| W02 C 전 기술 결정 | W02 A의 TEE 유지 또는 추가 보장 분리안 확정 | 현재 요구와 실제 생성 경로의 일치, 변경 시 명시적 결정 기록 | GPT-6 Astra / High |
| W02 C 실행 | 실제 client·최소 원천 policy·지갑 사전 결합으로 새 한 쌍 생성 | 최신 YBM 추출·서명·문맥·보관/삭제 확인. 지급 권한 없음 | GPT-6 Astra / High |

**현재 사용자 로그인은 필요하지 않다.** 저장 경계와 TEE 결정을 해결하고, 개인정보 처리 범위가 준비된 W02 C 직전에 YBM 로그인을 안내한다. 기존 Reclaim 콘솔 로그인은 다시 요구하지 않는다. 11월 7일 목표와 실제 YBM 로컬 지급 1건 요구는 유지하며, 이 합성 결과로 실측 완료를 대신하지 않는다. 모델 권고는 작업 난도에 따른 판단이며 자동 설정 변경이나 성능 실측 주장이 아니다. [OpenAI 모델 선택 안내](https://developers.openai.com/api/docs/guides/model-selection)

## 보존과 재현

원본 프로젝트·실험 디렉터리 전체의 파일 수와 메타데이터 지문을 작업 전후 비교했다. 원본·legacy 소스 191개도 W01 지문과 대조했다. 기존 `verify:workspace`는 이전 `375051e`의 참고 문서 링크 정리로 생긴 문서 4개의 지문 불일치 때문에 계속 실패한다. 이번에 해당 문서나 기준 지문을 바꾸지 않았으며 작업본 전체 검사를 통과로 기록하지 않는다.

```sh
./tools/npm --prefix spikes/w02-collector-boundary test
./tools/npm --prefix spikes/w02-proof-adapter test
./tools/node spikes/w02-collector-boundary/test-storage-container.mjs
./tools/node spikes/w02-collector-boundary/test-storage-container.mjs .toolchain/w02b/container-noswap.json --require-noswap
./tools/node spikes/w02-collector-boundary/test-browser-synthetic.mjs
```

컨테이너·Chrome probe는 명시적으로 실행하는 환경 시험이며 일반 Node 시험과 별도다. 설치된 도구와 같은 이미지가 있어야 한다. 실제 인증정보·원본 증명을 인수나 fixture에 넣지 않는다.
