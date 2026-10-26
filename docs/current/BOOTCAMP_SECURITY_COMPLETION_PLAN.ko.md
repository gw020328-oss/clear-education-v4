# 교수 피드백: 보안 보완과 자동 지급 완료 계획

2026-10-26. 사용자 직접 요청을 본부가 기존 통합 담당에게 전달한 추가 승인 범위다. 기준 develop은 PR114 병합 `a53f6f541d45275ea92057c1beb2cf27af434855`; PR102의 백엔드 실행과 r20 실제 성공은 각자의 기존 지문으로 보존한다. 이 문서의 계획 수락은 구현·배포·실제 검증 완료를 뜻하지 않는다.

## 우선순위·담당·완료 기준

| 순서 | 담당 / 변경 | 완료 기준 | 현재 상태 |
| --- | --- | --- | --- |
| S1 | 통합: 참가자 서명에 의한 최초 수령인 등록, 별도 V2 계약·typed data·소비자 | 신청 소유자/수령인·정책/매핑·chain/contract/instance·nonce·deadline 결합. 타인 신청에 자기 서명, 잘못된 chain/contract/recipient, 만료, nonce 재사용, 수락 뒤 변경 거부. 원천 서명 재사용 금지 | 별도 V2 계약·typed data 구현 및 합성 검증; HTTP/실행 소비자 연결은 남음 |
| S2 | 통합: 체인 최초 등록 counter/event/query | 유효한 신청이 체인에 등록된 순서로 기존 allocate/nextAllocatable 실행. 정정/refresh는 최초 순서 유지. 무효/만료 중 건너뛰되 유효해지면 원래 순서, 서버 사전 지연/누락을 방지한다는 주장 금지 | V2 counter/event/순서 유지 구현·합성 검증; API 조회 연결은 남음 |
| S3 | 통합: 이의/정정/종료를 기존 observeCurrent/replaceTarget/terminate에 연결 | 기존 decisionId/revision/hash·version/epoch 재사용. 접수와 canonical 반영 분리. 오래된 승인 거부, 종료/수락 경합·정정·중복 지급·수락 권리 불변 검증. reorg/DB 대조 필요 명시 | 경로 조사; 미연결 |
| S4 | 통합: 판정 근거 manifest 및 권한 있는 조회 / 프론트: 두 역할 표시 | Reclaim pair proof 참조·검증 문맥, Moodle 응답 hash/관측시각, AI 근거·rubric/model/policy version을 기존 판정과 결합. hash만으로 제3자 검증 가능하다고 표현하지 않음. 원문 보존 기한·삭제·조회 권한 유지 | 기존 receipt 경로 조사 |
| S5 | 서준형/Claude: 기존 PR60 제품 화면 / 통합: 자동 ACCEPT/CLAIM·영수증 | 새 신청의 네 조건 실제 검증, 이번 입력 AI 승인, 양측 직접 동의 후 자동 지급. canonical receipt와 정확한 100 TEST·중복 차단 확인. 준비/실패/미수령/INCLUDED 및 finalized 상태 구분 | 제품 화면 준비와 S1~S4 검증 의존 |

## 최소 계약 영향

기존 V1 계약·ABI·소스 지문·실행 기록을 변경하거나 기존 체인/DB를 이행하지 않는다. S1은 별도 V2 계약과 새로운 인수 지문/TEST 환경으로 검증한다. 신청 ID는 고정 참가자와 정책·배포 문맥에 결합한다. 단순히 서명에서 복구한 임의 주소를 registrar가 전달한 수령인과 비교하는 것만으로 타인 신청 탈취 방지를 주장하지 않는다. 서버는 기존 신청 소유 지갑과도 대조해야 하며 원천 적격성 자체는 기존 신뢰 경계를 유지한다.

등록용 EIP-712 서명은 지급 승인·원천 인증 서명과 별개다. 참가자는 메시지만 직접 서명하고 relayer가 가스를 처리한다. 신규 HTTP/브라우저 메서드는 구현·검사 후 현행 계약에 명시하며 그 전에는 존재한다고 가정하지 않는다. EIP-712 자체는 재사용 방지를 제공하지 않으므로 nonce·신청·만료를 별도 검증한다([명세](https://eips.ethereum.org/EIPS/eip-712)).

등록 서명을 컨트랙트가 검증하려면 서명과 공개 등록 필드가 거래 calldata에 포함된다. 원문/proof/로그인 비밀을 체인에 올리지 않는다. 등록 서명의 체인 노출은 기존의 포괄적인 “서명 비공개” 문구와 구분하여 실제 사용자 서명 요청 전에 본부에 설명하고 확인한다. 공개 PR/이슈에는 실제 서명을 기록하지 않는다.

## 유지할 정책과 보류 범위

- 네 조건 AND: Moodle 활동, 본인 과제, 회고(수행·문제 해결 또는 확인·배운 점), 계정 결합 HackerRank Python Basic. 정확한 100 TEST, decimals 6.
- 120초 확인·재검증 1회·600초 전체 cap, 원천 currentness·최초 nonce·민감정보 수명 유지. 새 권한으로 옛 만료를 연장하지 않는다.
- `acceptedRightClaimExpiry: null` 유지. 첫 수락 기한과 수락한 권리의 청구 기한을 혼동하지 않는다. 장기 미청구 정리/학원 환수는 별도 정책 검토이며 이번 구현에 포함하지 않는다.
- 새 extractor/Vision, AA, PG escrow, 주기적 completion hash, 2-of-3, 새 플랫폼/대시보드, 실제 Windows/원격 Moodle은 보류. 보장 비율은 분모·대상 확정 뒤 별도 판단한다.
- 프론트 PR60·최신 로컬/미추적 파일·기존 DB/체인·검증 기록을 보존한다. web/는 프론트 담당 소유다. 새 세션/병렬 에이전트를 만들지 않는다.

## 실제 실행 관문과 기록

먼저 오프라인 계약/소비자/HTTP·상태 전이와 프론트 자산 검증을 마친다. 본부에 정확한 커밋·검사·남은 의존성과 사용자 행동을 전달한 뒤 새 신청의 실제 로그인, 등록/원천 메시지 직접 서명, 정확한 이번 입력 유료 AI 승인, 양측 직접 동의를 단계별 요청한다. 기존 r20 lease·서명·승인을 재사용하지 않는다. 준비 전 normal-host/CA를 실행하지 않는다. 합성 테스트용 독립 체인과 실제 사용자 실행은 구분한다.

Issue106은 실제 제품 화면 완주 전까지 OPEN이다. 문서 갱신, 구현, 오프라인 검증, 제품 실제 완주를 별도 표시한다. 후속 PR은 develop 대상 Draft로 검토/CI하며 자동 병합하지 않는다. PR114의 개별 병합 승인을 후속 PR/main 배포 승인으로 확대하지 않는다.

## 첫 구현 단위 — 검토 중, 실제 호스트 미연결

`HackathonTestVaultExecutionV2.sol`과 `recipient-registration.mjs`를 별도 추가했다. 기존 V1은 그대로이며 V2에는 서명 없는 4인자 등록 경로가 없다. 서명 메시지/신청 ID를 독립 계산한 JS와 체인 결과를 대조한다. 참가자 고정 지갑과 신청의 결합을 서버가 검증해야 하며 순수 codec의 성공만으로 HTTP 인증이 구현됐다고 보지 않는다.

Solidity 0.8.30, optimizer 200, Shanghai, V2만 `viaIR: true`로 컴파일한다. 기존 방식으로는 EIP-170 크기를 초과했고 IR 빌드의 runtime은 24,352 bytes(한도 24,576), creation은 26,887 bytes다. 남은 runtime 여유가 224 bytes이므로 후속 변경도 매번 실제 크기를 검사한다. 같은 빌드의 TEST token도 새 컴파일 지문을 갖는다. 기존 환경 manifest에 끼워 넣지 않으며 새 V2 token/vault 지문을 함께 인수해야 한다.

`./tools/node --test tests/hackathon-test-vault/recipient-registration-v2.test.mjs` 8개 통과. 무권한 서명/다른 도메인/만료/nonce 재사용/공격자 신청 대체, 체인 등록 순서/정정 후 순서 유지, 서명 등록에서 ACCEPT→CLAIM 정확한 100 TEST, 이의/정정 뒤 오래된 승인 거부, 종료 우선/수락 우선 및 수락 후 만료·키 폐기·pause에도 청구 가능, 중복 청구 거부를 합성 인메모리 체인에서 검증했다. 실제 사용자 데이터나 지갑은 사용하지 않았다.

다음 구현은 고정 신청 ID의 V2 생성·영속 결합, 별도 등록 서명 세션/HTTP, execution reader/command·manifest의 명시적 버전 선택과 인수 지문이다. S3의 API 접수→canonical 체인 반영 및 S4 근거 조회도 남아 있다. 현행 normal host는 여전히 V1이므로 프론트는 이 후보를 현재 사용 가능한 API로 취급하지 않는다.
