# 공식 attestor 소스 확장: 원천 결합 통합 시험

2026-10-13. **로컬에서 원천 TLS→정규 시험 ID→사업별 native OPRF→attestor 서명→공개 증명 검증을 연결했다. 공식 hosted 지원과 실제 YBM 적용은 아직 NO-GO다.** CLEAR의 추가 지급 서명이나 공개 성적·수험번호·단순 공개 hash로 대체하지 않았다. 제품 collector/API/금고/live 설정은 변경하지 않았다.

## 확인된 확장 범위

[공식 provider 설명](https://docs.reclaimprotocol.org/wtf-are-providers)과 [provider 배포 안내](https://docs.reclaimprotocol.org/agents/usage)는 URL·추출 규칙 등 provider 설정을 다룬다. 이 설정을 등록하는 것만으로 임의의 정규화 함수와 사업별 OPRF 연산을 공식 서버에서 실행할 수 있다는 근거는 찾지 못했다.

설치된 attestor-core 5.1.4의 gitHead `bc36dac3657fc46b79b4ecd545262c32440b05a6`를 고정했다. [assertValidClaimRequest](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/assert-valid-claim-request.ts)는 owner 요청 서명·TLS handshake/인증서·복호화 검증 뒤 provider 판정을 호출한다. 바깥의 [claimTunnel](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/handlers/claimTunnel.ts)은 실제 중계 터널과 제출 암호문의 일치부터 검사하고 최종 claim에 attestor가 서명한다.

이 사이에 후보 서버 코드를 연결했다. **공식 upstream에 이미 제공되는 CLEAR 플러그인이나 공식 서버의 배포 성공을 뜻하지 않는다.** 공식 운영자가 이 기능과 키 운영을 검토·배포해야 공인 witness 경로가 된다. 자체 서버에 새 키를 만들면 공식 witness가 되는 것도 아니다. 공식 운영자 연락·배포·실제 계정 호출은 하지 않았다.

## 구현된 경계

1. 전용 `clear-private-exam-v1` provider만 받는다. 일반 HTTP provider의 context는 호출자 필드를 보존하므로, `qualified`나 `nullifier`를 context에 넣고 유효한 서명을 받았다는 사실만으로 자격을 판단하면 우회된다. 실제 로컬 attestor가 서명한 stock HTTP 증명도 새 검증기가 거부하는 시험을 포함했다.
2. 서버 설정에 URL/GET/HTTP params/사업 scope/OPRF key fingerprint/레코드 정책을 고정한다. 인증된 TLS hostname·터널 host/port를 URL과 직접 대조하고, HTTP 요청의 경로·Host·Connection 앞부분을 가림 없이 정확히 대조한다. HTTP 헤더의 Host만 검사해서 다른 TLS 원천을 허용하지 않는다.
3. 서버 응답의 모든 TLS application record를 직접 인증·복호화해야 한다. 서버 측 zkReveal/TOPRF/raw replacement/미공개 record와 구버전 client를 거부한다. 원천 응답의 완료·HTTP 200·실제 DOM 행을 검사하고 같은 행에서 기간/800점 조건과 시험 식별자를 확인한다. 이 후보는 클라이언트의 OPRF 결과·임의 공개 범위를 받지 않는다.
4. 이전 원형의 비공개 정규 ID/사업 scope를 native OPRF에 넣는다. 전체 결과를 32바이트로 직렬화하며 threshold=1 공개 share pin을 유지한다. 정책 해시에는 원천 params·레코드 정책·scope·키 지문·확장 revision이 포함된다. 상세한 키 수명과 native 소스/바이너리 관찰 한계는 [이전 후속 기록](SOURCE_BOUND_FOLLOWUP.ko.md)을 따른다.
5. context는 허용 필드만 새로 만든다. `binding`에는 신청·고정 수취인·chainId·소비 계약 주소를, `sourceBound`에는 revision·정책·scope·키 지문·nullifier·조건 충족만 넣는다. claim owner·timestamp도 공식 서명에 포함된다. 호출자는 binding을 제시할 수 있지만 독립 검증기는 **별도로 신뢰한 등록/예치 상태**와 반드시 대조한다. 자기 context 자체를 신뢰 기준으로 쓰지 않는다.
6. 공개용 projection에는 claim/서명자/claim 서명만 남긴다. 전체 SDK response/request/transcript는 공개하지 않는다. 검증기는 정확한 스키마·canonical encoding·정책·등록 binding·신선도·고정 witness·공식 claim identifier와 실제 EIP-191 서명을 검증한다. 추가 필드와 서명 후 nullifier 변경을 거부한다. 이 자바스크립트 검증기는 제품 온체인 adapter가 아니다.

## 개인정보와 신뢰 범위

합성 공개 proof의 params/context/envelope에는 이름·성적·시험일·수험번호·쿠키·원문·중간 identity hash가 없다. 주소·신청 ID·사업 scope·정책·조건 충족 및 같은 사업 안에서 연결 가능한 nullifier는 공개된다. OPRF는 출력 길이를 늘렸다는 이유만으로 256bit 보안을 보장한다고 주장하지 않는다.

**이 후보에서 attestor는 원문 응답을 본다.** 공개 체인/검증자에게 개인정보를 공개하지 않는 경로이며 attestor에게도 원문을 숨기는 회로는 구현하지 않았다. 공식 운영자의 로그·보관 정책, 질의 제한·키 관리도 실제 배포 전 관문이다. 기존 `oprf-raw`를 단순 켜거나 CLEAR의 별도 pass 서명을 추가하는 방식은 사용하지 않는다.

## 검증 결과

| 검사 | 결과와 범위 |
| --- | --- |
| 실제 loopback TLS 1.3 + 수정한 공식 서버 + native OPRF + 실제 임시 attestor 서명 | `attestor-extension-check.mjs` 14개 PASS. 인증서 검증을 켠 새 로컬 HTTPS 원천이며 원문은 합성 자료다. |
| 부적격 행·호출자 판정/params 주입·stock provider 오용 | claim 서명 발급 또는 공개 검증 거부 |
| 다른 owner/신청으로 새 TLS 증명 발급 | 동일 사업에서 같은 nullifier, 새 binding과 서명 검증 성공 |
| 수취인/chain/계약/owner/witness/key/시간 변경·서명 후 nullifier 변경 | 독립 공개 검증 거부 |
| owner가 다시 서명한 암호문/정책/미공개 서버 record/변환 metadata 변조 | 실제 claimTunnel 경로에서 거부. 단순 요청 서명 오류만 검사하지 않음 |
| 네트워크 차단 오프라인 경계/공개 검증 회귀 | 신규 8개 + 기존 레코드 17개 = 25개 PASS. 인공 receipt와 OPRF 대역이므로 실제 TLS/native 시험과 구분 |
| 공식 hosted attestor·실제 YBM·공개 체인 | NOT_RUN |

기계 판독 결과는 [attestor-extension-report.json](attestor-extension-report.json)에 있다. 임시 witness/OPRF 키, 인증서, 원문 및 proof는 보고서에 저장하지 않는다. 실제 테스트 signer는 새 임시 키이며 공식 registry에 등재된 키가 아니다. `officialSignatureFormat=true`는 공식 형식과 검증 코드 사용만 뜻한다.

재현은 저장소의 고정 Node/lockfile 의존성 준비 후 실행한다.

```sh
# Linux/Mac 공개 합성 CI: 외부 네트워크 차단, native 다운로드 없음
./tools/node --import ./tests/ybm-collector/network-guard.mjs --test spikes/direct-proof-feasibility/record-policy.test.mjs spikes/direct-proof-feasibility/attestor-extension.test.mjs
# 선택: Mac arm64, Node 24.21.0, openssl. 공개 upstream 자료 다운로드 필요.
./tools/node spikes/direct-proof-feasibility/attestor-extension-check.mjs
```

`prepare-attestor-extension.mjs`는 고정 upstream commit을 `.toolchain`에 새로 추출하고 수정 대상 원본 두 파일의 SHA256을 확인한다. 후보 hook과 loopback 바인딩만 적용하며 기존 설치 SDK를 변경하지 않는다. native 파일 4개도 앞선 보고서의 고정 SHA256과 대조한다. 테스트 CA는 해당 프로세스에서만 추가하고 시스템 신뢰 저장소를 바꾸지 않는다. 원천/attestor 서버는 127.0.0.1에만 열고 임시 키 파일과 native 폴더는 종료 시 제거한다. upstream `.env.test` 및 예제 키는 로드하지 않는다.

## 남은 제품 관문

공식 운영 확장·승인된 witness 및 사업 수명 동안 유지되는 OPRF 키가 필요하다. 그 뒤 실제 YBM 형식/날짜+수험번호의 유일성과 재발급 안정성·시험 소유/접수/취소 관계를 검증해야 한다. 이번 결과는 단일 합성 성적 행의 조건이며, 기존 800점 AND 수강률 80%/최고점·전체 목록 정책을 해결하지 않는다.

공통 spent registry·공식 verifier ABI에 맞춘 온체인 adapter·새 금고/동의·등록 상태에서 구성하는 독립 수집 경로도 미구현이다. CLEAR 없이 새 증명을 만드는 제품 전체 흐름이나 기존 예치의 이전을 완료했다고 기록하지 않는다. 외부 공식 배포 지원이 확인되기 전 제품 GO·일정 확약은 할 수 없다.

이 확장 구현 당시 PR #21은 팀원 Windows11 결과 대기로 Draft였다. 이후 팀원 결과는 [Windows 평가](../windows-compatibility/ASSESSMENT.ko.md)에 반영했다. 당시 전달 ZIP은 보존하고 bootstrap/보고서 수정은 후속 소스로 구분한다. 제품 NO-GO는 유지한다.
