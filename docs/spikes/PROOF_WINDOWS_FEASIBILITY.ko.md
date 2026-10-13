# 추가 지급 서명 없는 청구와 Windows 수집기 — 통합 기술 검증

검증일: 2026-10-13 (Asia/Seoul). 기준: `3f8ef79` (B2b / PR #19), 독립 worktree의 `codex/proof-windows-feasibility`. 이번 변경은 격리 기술 실험이며 제품 정책, 지급 허용 상태, 운영 계약을 바꾸지 않는다.

## 판단의 기준

두 실험의 공통 목표는 이미 등록·예치된 신청의 고정 수령인이 새 조건 증명을 만들고, CLEAR의 추가 지급 승인 서명 없이 청구할 수 있는 경로다. 신청·예치 동의와 증명 소유 키에 대한 참가자 위임은 이 목표와 별개다. 현행 금고는 불변이며 issuer ECDSA 서명을 요구하므로 새 계약과 새 동의가 필요하다. 기존 예치가 자동으로 새 금고로 이동한다고 가정하지 않는다.

현재 제품 정책인 TOEIC 800점 AND 시드 수강률 80%, 전체 목록 최고점, 기간·시험 중복 규칙을 유지한다. 실제 inventory 전체성 차단은 그대로다. 비교용 단일 성적/정액 실험의 성공은 현행 정책 완료나 PRD 변경을 뜻하지 않는다.

## 공통 검증 기록

공식 Node 24.21.0 darwin-arm64 배포 파일의 SHA-256을 `config/toolchain.json`과 대조한 뒤 이 worktree의 `.toolchain`에만 설치했다. npm 11.19.0 및 루트·YBM lockfile을 `--ignore-scripts`로 설치했다. 기존 작업본의 데이터·키·체인·브라우저 프로필과 의존성 디렉터리를 공유하지 않았다.

| 실행 | 결과 | 범위 |
| --- | --- | --- |
| `./tools/npm run verify:workspace` | PASS | 원본 191개, 공개 참고 문서 지문, pending manifest 차단 유지 |
| `./tools/npm run verify:dependencies` | PASS | 고정 의존성과 메모리 컴파일 |
| `./tools/node --test tests/vault/*.test.mjs tests/product-proof/*.test.mjs` | PASS 125/125 | 새 메모리 TEST 체인·임시 DB, 합성 자료 |
| `./tools/npm --prefix src/ybm-collector test` | PASS 153/153 | 네트워크 차단 합성 시험 |
| `./tools/node --test tests/mac-collector/*.test.mjs` | PASS 44/44 | 이 Mac의 합성 Chrome 수명·강제 종료 복구·압축 해제 패키지 |

Ganache는 Node24용 µWS/native bigint 바이너리가 없어 기존 JS fallback으로 실행됐다. 위 PASS는 공개 체인·실제 YBM·Windows 성공을 뜻하지 않는다. Mac 시험은 합성 전용 임시 프로필을 사용했다.

## 독립성의 서로 다른 관문

1. **기발급 청구 자료의 독립 제출:** 지급 API가 없어도 확보된 자료로 고정 수령인에게 청구할 수 있는가.
2. **새 증명의 독립 취득:** CLEAR의 session/instruction 발급 서버가 없어도 예치 기록·고정 정책·참가자 위임으로 새 증명을 만들 수 있는가.
3. **외부 서비스 가용성:** YBM/학습 원천, 공식 attestor, RPC 가용성은 계속 필요하다. CLEAR 추가 서명 제거가 이 의존성까지 제거하지 않는다.

현재 `src/ybm-collector/binding.mjs`의 `verifyInstruction`은 authoritySignature를 요구하며 `createBoundCollection`은 authority의 실행 중 세션을 계속 확인한다. 제품 B1도 서버가 발급·승인한 세션에 의존한다. 따라서 1의 합성 성공만으로 2를 완료라고 표시할 수 없다.

## 11월 7일 의사결정

기술 관문이 미실행이면 통과로 간주하지 않는다. Windows 이식 공수와 새 청구 구조의 개발·검토 공수는 각각 산정한다.

## 결과표

| 검증 | 합성/읽기 전용 결과 | 실제 환경 판정 |
| --- | --- | --- |
| A: 추가 issuer 서명 없는 고정 수령인 지급 | 새 메모리 EVM 모델 14개 기대 관찰 PASS | 실제 Reclaim privacy/nullifier·제품 금고 통합 미실행 |
| A: 점수/기간 capture 생략 | SDK receipt 6개 기대 관찰 PASS, 197점 검사 | 서로 다른 행 조합 수락 재현으로 후보 자격 판정 **FAIL** |
| A: 사업 내 시험 중복 | 동일 제공 nullifier 거부; 변경 값 수락 재현 | 원천 결합/재발급/다른 지갑의 안정값 미구현 **NO-GO** |
| A: 현 verifier | Amoy 코드·epoch·registry·Sourcify exact-match 읽기 관찰 PASS | 공식 새 proof의 정확한 ABI/epoch/witness 호환성 NOT_RUN |
| A: CLEAR 중단 후 새 수집 | 현 collection authority 의존 코드 확인 | 독립 수집 NOT_RUN |
| B: STWO 엔진 | Mac 및 Windows Server에서 각20항목 PASS | 팀원 Windows11 미실행 |
| B: Windows 저장/프로세스 | Windows Server CI 전체34 PASS / 2 BLOCKED / 7 NOT_RUN | 암호화/gnark BLOCKED; Win11·기존 Chrome창·강제 종료/재시작·24h·race 경계 NOT_RUN |
| 기존 Mac | 관련 회귀322개 PASS | 기존 실수집 성공 기록을 이번 실험 성공으로 재집계하지 않음 |

A의 시험 PASS에는 결함 후보가 기대대로 재현됐다는 관찰도 포함된다. 따라서 합성 체크 수와 제품 관문 판정이 다르다. [A 실험과 상세 근거](../../spikes/direct-proof-feasibility/README.ko.md), [B 변경 지점·설계·공수](../../spikes/windows-compatibility/ASSESSMENT.ko.md)를 함께 읽는다.

## 일정과 GO / NO-GO

**현재 근거로 11월 7일에 원래 정책·비공개 직접 청구·Windows를 동시에 제품 경로로 전환하는 결정은 NO-GO다.** 단일 성적 정책으로 축소해도 비공개 행 연결과 안정 식별값 문제가 사라지지 않는다. 공통 개발은 진행할 수 있으나 이번 보고서가 issuer 전용 작업 보류를 해제하거나 새 정책을 승인하지 않는다.

| 방향 | 남은 집중 공수 추정 | 11월 7일까지 가능한 범위 / 관문 |
| --- | --- | --- |
| A 합성 기술 시연 | 이번 실험 완료, 좁은 시연 연결 3~5일 수준 | 인공 자료·가짜 witness·미완료 privacy/nullifier를 명시한 별도 시연 가능 |
| A 실제 개인정보 보호 직접 청구 | 연구 관문 기간 미확정 + 통과 뒤 통합/검토10~15작업일 | 같은 시험의 비공개 조건·안정 nullifier·공식 새서명·독립 수집 관문이 먼저다. 원래 정책의 시드/전체 목록은 별도 |
| B Windows 수집기 | 기본12~18엔지니어 작업일; 첫 gate 즉시 통과 시 기존10~15일 추정 유지 가능 | 전담 담당과 빠른 실기기 피드백이 있다면 조건부. 강제종료/저장경계까지 통과해야 실제 로그인 안내 |
| A+B 결합 | 최소 두 작업 흐름 및 통합 회귀; 단순히 둘 중 큰 숫자로 계산 불가 | OPRF가 gnark를 요구하면 Windows native 관문이 A/B 공통 선행조건이 됨. 새 청구 공수가 B 추정에 포함되지 않음 |

10월 14일~11월 6일의 평일은 18일이다(휴일/기기 대기시간 제외 산술). 다음 날짜는 목표와 중단 판단 시점이며 작업 완료 약속이 아니다.

- **10월 15~16일:** 팀원 Windows11에서 STWO/Chrome/ACL/암호화 확인 방법을 판정한다. 동시에 A는 실제 원천의 같은 행/시험 결합과 충분한 출력 길이의 식별값 후보를 확정한다. 해결 근거가 없으면 A의 제품 전환은 계속 보류한다.
- **10월 23일 전후:** B의 OS adapter와 정상/오류/강제 종료 후 복구, PID 재사용·junction/reparse·한글/공백 경로 시험이 준비돼야 한다. 실패하면 Windows는 합성 진단 범위로 제한한다.
- **10월 28일~11월 2일:** 준비가 끝난 경로에서 타 사용자 자기 계정/PC 최소1건과 비개발자 합성 과업2건을 따로 확인한다. 시간 확보가 안 되면 실제품 지원 대상으로 표기하지 않는다.
- **11월 3~7일:** 검증한 지원 범위만 동결·회귀·시연한다. 공개 체인 거래와 유료 API는 이 일정의 자동 후속이 아니다.

A의 GO에는 실제 공식 증명에서 점수·시험일·번호 원문이 public params/context/calldata에 없을 것, 같은 시험의 재발급/다른 지갑을 같은 사업에서 거부할 것, owner/application/수령인과 출처/기간/epoch 변조를 거부할 것, CLEAR API/issuer 중단 상태에서 **새 증명 취득부터 청구까지** 완주할 것이 모두 필요하다. 사업 scope·정규화·키 회전·추측/충돌 예산도 정해야 한다. 단순 hash나 CLEAR의 새 pass 서명으로 대체하지 않는다.

B의 GO에는 일반 사용자 Win11에서 3종 STWO/독립 verifier IPC/Chrome pipe, 사용자 전용 ACL/암호화/백업·동기화 위치, Job 소유권과 전체 종료, 동시 실행·오류·재시작·TTL·PID재사용·reparse 경계가 모두 필요하다. Windows Server CI 통과만으로 충족되지 않는다.

## 팀원 전달과 변경 범위

[Windows 실행 안내](../../spikes/windows-compatibility/README.ko.md)의 두 PowerShell 명령을 사용한다. 로그인이나 YBM 계정은 필요 없다. 공유 결과는 `artifacts/windows-compatibility/report-*.json`만이며 비밀번호·쿠키·원문 proof·프로필·npm 로그를 요청하지 않는다. 이 Mac에는 팀원 PC의 원격 실행 연결이 없으므로 팀원이 실행한 정제 보고서가 다음 실제 환경 근거다.

```sh
# 커밋한 합성 소스로 전달용 ZIP 생성
./tools/node tools/package-windows-spike.mjs
```

ZIP은 `artifacts/windows-compatibility/CLEAR-Windows-Synthetic-Diagnostic.zip`, 지문/커밋/파일 목록은 같은 폴더의 `package-manifest.json`에 기록한다. 런타임·의존성은 포함하지 않고 bootstrap이 고정 공개 배포를 받는다. 외부 배포 업로드는 하지 않는다.

수정 파일 범위는 `spikes/direct-proof-feasibility/` 8개, `spikes/windows-compatibility/`의 진단·보고서, `tools/package-windows-spike.mjs`, 이 통합 보고서, 두 CI workflow다. 제품 `src/`, `contracts/`, API/DB schema, 기존 Mac 패키지와 정책 파일에는 변경이 없다. 상세 목록은 PR diff가 기준이다. 각 작은 커밋은 Draft PR에서 검토하며 병합은 별도다.

## 검토와 CI 근거

[Draft PR #21](https://github.com/gw020328-oss/clear-education-v4/pull/21)에 작은 커밋으로 정리했다. `4a8b0c3`에서 [공개 합성/Mac CI](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38336271152) 및 [Windows Server 진단](https://github.com/gw020328-oss/clear-education-v4/actions/runs/38336271261)이 성공했다. 이후 패키징/보고서 변경은 PR의 최신 검사 상태를 따른다. `windows-server-ci-report.json`은 단계별 미실행/차단을 그대로 보존한다. CI 성공은 제품 준비 완료를 뜻하지 않는다.
