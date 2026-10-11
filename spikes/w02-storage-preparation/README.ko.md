# 브라우저와 서버 저장 경계 준비 도구

대상 기기가 아직 정해지지 않은 상태에서 사용할 읽기 전용 점검기와 실행 구성 초안이다. 운영체제 설정 변경, mount, 실제 브라우저 실행, 로그인, 실제 proof 수신을 하지 않는다. 진단 결과가 모두 좋아도 `mayGenerateRealProof`는 항상 false다.

## 파일과 실행

| 파일 | 기능 |
| --- | --- |
| `targets.candidate.json` | 미확정 대상, Linux 후보, 역할별 경로·보관·외부 검토 조건 |
| `preflight.mjs` | 실제 경로·권한·mount·swap·core·현재 프로세스 권한·Node 버전 관찰 |
| `build-plan.mjs` | 브라우저·서버 설정을 JSON으로 출력. 실행이나 설치는 하지 않음 |
| `probe-container.mjs` | 현재 로컬 이미지에서 역할별 임시 컨테이너로 합성 관찰. 생성한 컨테이너만 제거 |
| `test/` | 합성 관찰값·경로 파서·실행 계획의 실패 조건 시험 |

현재 작업본 루트에서:

```sh
./tools/node --test spikes/w02-storage-preparation/test/*.test.mjs
./tools/node spikes/w02-storage-preparation/build-plan.mjs collector
./tools/node spikes/w02-storage-preparation/build-plan.mjs verifier
./tools/node spikes/w02-storage-preparation/preflight.mjs collector
./tools/node spikes/w02-storage-preparation/preflight.mjs verifier
```

preflight는 경로가 없으면 만들지 않고 실패를 기록한다. 로컬 조건 미충족 또는 읽기 실패의 종료 코드는 2다. 코드 0도 현재 프로세스·선언 경로의 제한된 관찰만 통과한 것이며 실제 수집 허용이 아니다. Linux 대상에서는 고정 Node 24.21.0을 설치·검증한 뒤 `node preflight.mjs collector`처럼 실행한다. 이 디렉터리는 외부 npm 의존성이 없다. 파일 지문은 보고서 기록과 대조한다.

컨테이너 probe를 재현하려면 현재 로컬의 `public.ecr.aws/supabase/storage-api:v1.72.1` 이미지가 필요하다. 자동 pull은 하지 않는다. 해당 이미지는 W02의 합성 시험용일 뿐 제품 이미지가 아니다.

```sh
./tools/node spikes/w02-storage-preparation/probe-container.mjs
```

## 역할별 경계

- 수집 도구: `/run/clear-collector` 아래 profile, cache, temp, downloads, crash, XDG 관련 경로. 실제 Chrome의 자식 프로세스와 모든 쓰기·업로드 경로는 별도 실측해야 한다.
- 검증 서버: `/run/clear-verifier` 아래 raw-proof, temp. 발급 시 원본 삭제 및 최초 수집 후 최대 24시간 조건은 유지한다. 독립 청구 자료·지급 원장은 이 휘발 영역에 넣지 않는다.
- 실제 환경은 역할별 전용 사용자·불변 실행 코드·검증된 tmpfs·유한 용량·dump/swap 통제·백업 및 snapshot 제외가 필요하다. 파일 지문, 설정, 관찰 시각을 묶고 실행 직전에 다시 점검한다.

mountinfo에서 가장 구체적인 하위 mount를 확인한다. `/run`이 tmpfs라는 이유로 그 아래의 디스크 bind mount를 통과시키지 않는다. cgroup 경로는 `/proc/self/cgroup`과 cgroup2 mount root를 대응시킨다. 읽을 수 없거나 모호한 상태는 통과로 간주하지 않는다.

## 기기가 정해진 뒤의 적용 순서

1. 수집 기기와 서버가 물리 Linux인지 VM인지 정하고, VM이면 모든 호스트 계층까지 확인한다. 이 단계에서 비용·설치·시스템 변경 범위를 정한다.
2. 고정 Node 및 브라우저 build를 준비한다. 실행 파일은 읽기 전용 영역에 두고, 참가자 개인 브라우저 프로필을 재사용하지 않는다.
3. 관리자와 실제 UID, tmpfs 용량, swap·dump·백업·snapshot 정책을 확인한 후 해당 전용 경로만 구성한다. 기존 경로 위에 mount해 자료를 숨기거나 기존 서비스의 swap을 임의로 끄지 않는다.
4. 읽기 전용 preflight와 합성 데이터 시험을 실행한다. 고정 runtime·권한·하위 mount·종료·용량 부족·재부팅을 검증한다. 정리 실패를 성공으로 보고하지 않는다.
5. 실제 브라우저를 합성 원천에 연결해 profile/cache/temp/crash/공유 메모리·로그·업로드·자식 프로세스의 경로를 관찰한다. `--no-sandbox`나 TLS 검증 해제로 통과시키지 않는다. 관찰 중 녹화·화면 공유·클립보드·파일 다운로드에 비밀정보가 남지 않는 사용자 흐름도 정한다.
6. 서버의 최소 proof 수신·오류·로그·정리 서비스, 수집 도구의 실제 Attestor 전용 client, 현재 원천 policy, 지갑 사전 결합을 검증한다. TEE 유지/추가 보장 분리 결정은 별도로 확정한다.
7. 위 조건을 기록한 뒤 사용자에게 W02 C의 로그인 화면과 처리 범위를 안내한다. 이 준비 도구에서 실제 모드를 켜는 옵션은 없다.

현재 Mac의 swap·Time Machine 설정을 바꾸거나 특별 권한 컨테이너를 실행하지 않았다. `.gitignore`는 백업 제외나 휘발 저장을 보장하지 않는다. 세부 결과는 [준비 보고서](../../docs/w02/STORAGE_PREPARATION.ko.md)에 있다.
