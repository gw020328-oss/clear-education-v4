# 브라우저와 서버 저장 경계 준비 결과

2026년 10월 11일 · W02 B 후속 준비 · 추천 GPT-6 Astra / High

**읽기 전용 점검기와 역할별 실행 구성을 준비했고, 신규 시험 37개가 통과했다.** 두 개의 임시 Linux 컨테이너에서 브라우저용 11개 경로와 서버용 3개 경로의 배치·권한 오류 감지·쓰기 제한·강제 종료 후 초기화를 확인했다. 대상 기기는 사용자의 답변에 따라 **미확정**이다. 준비 도구 작성 완료와 실제 수집 환경 준비 완료는 구분하며, 현재 실제 수집은 허용하지 않는다.

## 준비한 내용

[준비 도구와 적용 순서](../../spikes/w02-storage-preparation/README.ko.md)는 외부 npm 의존성 없이 옮겨 사용할 수 있다. 기존 제품과 W02 A/B 코드를 수정하지 않고 새 spike에 작성했다.

| 산출물 | 목적 | 현재 상태 |
| --- | --- | --- |
| 역할별 대상 구성 | 수집 PC와 검증 서버의 임시 경로·보관 수명·필수 검토를 분리 | Linux 후보만 작성, 실제 기기와 지원 OS 확정은 미정 |
| 읽기 전용 preflight | 실제 경로 권한·소유자·symlink·하위 mount·swap·dump·권한·Node 검사 | Mac 및 Linux 컨테이너에서 실행 |
| 브라우저 실행 계획 | 전용 profile/cache/temp/XDG 경로, IPC, sandbox 유지 | JSON 출력만 수행. 브라우저 build와 대화형 화면 경로 미정 |
| 서버 실행 계획 | 원본 proof staging과 청구 자료·원장 보관 영역 구분 | JSON 출력만 수행. 실제 서버나 endpoint는 시작하지 않음 |
| 합성 컨테이너 probe | 두 역할을 서로 다른 컨테이너와 tmpfs에 배치 | 실제 파일 권한 변경 감지, root 밖 쓰기 거부, SIGKILL 후 재시작 정리 확인 |

점검기는 없는 경로를 만들거나 OS 설정을 고치지 않는다. `/run`이 tmpfs여도 하위 디렉터리에 디스크 mount가 있으면 거부하고, cgroup root를 고정 가정하지 않는다. 모르는 상태를 true로 채우지 않는다. 보고서는 현재 진단 프로세스와 선언된 경로에 대한 관찰이며, 브라우저 전체나 VM 호스트를 증명하는 attestation이 아니다. 실제 launcher에 연결할 때는 실행 직전 재검사와 경로·프로세스 고정이 필요하다.

## 현재 환경에서 확인한 것

| 관찰 | 결과 | 판단 |
| --- | --- | --- |
| 현재 기기 | macOS 26.5.2 / arm64 | Linux 후보 경계를 직접 적용한 상태 아님 |
| FileVault | 켜짐 | 디스크 암호화 확인. 기록 자체를 막는 보장은 아님 |
| macOS swap | 사용 중이며 encrypted로 표시 | ‘암호화됨’과 ‘비밀정보가 디스크에 남지 않음’을 구분 |
| 작업본 `var`의 Time Machine 제외 상태 | `Included` | 제외된 경로가 아님. 실제 백업 실행 여부까지 확인한 것은 아님 |
| Docker | 29.2.0 | 기존 합성 환경으로만 사용 |
| Linux 역할별 경로 | 수집 11개 / 서버 3개, tmpfs·0700·실행 사용자 소유 | 배치 검증 통과 |
| 컨테이너 권한 | 비권한 UID, 읽기 전용 root, cap 제거, 새 권한 금지, core dump 0, 외부 네트워크 없음, Docker 로그 없음 | 합성 환경의 제한 확인 |
| swap | guest 전역 활성, cgroup swap.max=0 | 기존 보수적 swap 조건은 미충족. 호스트 swap을 바꾸지 않음 |
| 컨테이너 Node | 24.19.0 | 고정값 24.21.0과 달라 점검기가 거부. 프로젝트 버전을 낮추지 않음 |

Docker 공식 문서도 tmpfs의 swap 가능성과 일부 mount 옵션 제한을 설명한다. 특별 권한 컨테이너로 우회하거나 호스트 설정을 바꾸지 않았다. [Docker tmpfs 문서](https://docs.docker.com/engine/storage/tmpfs/)

커널 cgroup 제한은 해당 cgroup의 자원 통제다. VM 밖의 host swap·hibernation·snapshot을 검증하는 자료가 아니다. 준비 도구는 전역 swap 비활성 또는 검토된 `noswap`+cgroup 0 조건을 로컬 검사로 다루고, 어느 경우든 호스트 계층 검토를 별도로 남긴다. [Linux cgroup v2 문서](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)

브라우저 profile 변경만으로 모든 임시 자료가 따라 이동한다고 가정하지 않는다. Chrome은 user-data와 cache 경로 규칙을 따로 가지며 crash report 저장도 확인해야 한다. 준비한 전용 profile/cache/XDG 구성은 실측할 후보이며, 이 설정으로 Chrome crash·dump·업로드 격리를 완료했다고 말하지 않는다. [Chromium user-data 문서](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md), [Chromium crash reports](https://www.chromium.org/developers/crash-reports/)

## 시험 결과

- **37 / 37 통과:** 역할별 경로, 하위 디스크 mount 선택, cgroup 경로 대응, 미확인/권한/버전/swap 조건의 거부, 실제 모드 실행 계획 거부, 브라우저 sandbox 유지, 원본과 독립 청구 보관 분리.
- **실제 합성 컨테이너 두 개:** 역할당 권한 변경 감지·허용 영역 밖 디스크 쓰기 거부·강제 종료 및 재시작 정리의 3개 확인을 수행했다. 두 역할의 경로 14개 모두 선언한 tmpfs와 소유자·권한에 일치했다.
- **실제 수집 준비 판정은 실패:** 컨테이너는 고정 Node와 swap 조건 때문에 거부됐고, Mac은 Linux 후보 환경 및 경로 조건을 충족하지 않았다. 이 거부는 시험 오류를 성공으로 바꾼 것이 아니라, 미준비 환경을 차단하는 동작을 확인한 것이다.

기존 169개는 코드 변경이 없어 이번 준비 시험 수에 다시 합산하지 않는다. 실제 Chrome·YBM·Reclaim 연결·로그인·새 증명 생성·지급은 실행하지 않았다. 이번 컨테이너는 기존 로컬 이미지로 만들고 모두 제거했다. 새 이미지나 OS를 설치하지 않았다.

## 다음 결정과 권고

사용자의 최신 답변은 **‘아직 정하지 못함’**이므로 기기를 자동 선택하거나 구매·설치하지 않았다. 현재 권고는 별도 Linux 기기를 사용할 수 있는지 먼저 확인하는 것이다. 정확한 배포판·CPU·UID·브라우저 build·메모리 상한은 기기 선택 뒤 정한다. 계획에 있는 수집 1 GiB·서버 128 MiB는 용량 후보이며 합성 컨테이너의 8 MiB 시험값을 운영 용량으로 승인하지 않는다.

| 선택 | 이어서 할 일 | 현재 상태 |
| --- | --- | --- |
| 별도 Linux PC | 읽기 전용 환경 진단, 해당 기기의 swap/dump/백업 검토, 전용 휘발 경로 구성과 합성 브라우저 실측 | 권고 후보, 접근 가능한 기기 미지정 |
| Mac의 Linux VM | guest와 macOS host의 swap·hibernation·snapshot·백업을 함께 검토 | Docker guest 검사만으로 해결되지 않음 |
| 현재 Mac의 디스크 암호화와 사후 삭제 활용 | 남는 저장 위험과 보관 보장 변경안을 먼저 비교해 명시적으로 결정 | 현재 설계 변경안일 뿐 미채택 |

실제 기기가 정해지면 관리자 권한이 필요한 설정의 대상과 명령을 먼저 구체화한다. 기존 사용자 프로필·서비스·자료를 수정하거나 전역 swap을 임의로 끄지 않는다. 서버 staging의 수명이 끝나도 이미 발급한 독립 청구 자료와 지급 원장이 함께 사라지지 않도록 분리하는 요구도 유지한다.

**지금은 실제 로그인이 필요하지 않다.** 기기 선택 → 해당 기기의 저장 경계 구성·합성 브라우저 실측 → TEE 기술 결정과 실제 수집 연결 검토 → W02 C 로그인 순서다. 다음 단계 추천도 **GPT-6 Astra / High**다. 11월 7일 목표는 유지하지만 대상 기기가 정해지기 전에는 W02 C 실측 일정을 확정하지 않는다.

## 보존 및 결과 파일

원본 프로젝트·기존 실험 디렉터리의 작업 전후 메타데이터와 원본·legacy 소스 191개의 지문을 대조했다. 제품 코드·원본 데이터·기존 OS 보안 및 백업 설정은 수정하지 않았다. 이전 참고 문서 4개의 지문 불일치로 `verify:workspace`가 실패하는 상태는 그대로 구분해 기록한다.

[기계 판독 결과](storage-preparation-verification.json), [실행 구성 후보](../../spikes/w02-storage-preparation/targets.candidate.json), [사용·적용 순서](../../spikes/w02-storage-preparation/README.ko.md).
