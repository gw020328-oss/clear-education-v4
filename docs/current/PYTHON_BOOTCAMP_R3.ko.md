# Python 부트캠프 계획 revision3 — 지급권리 확정 기준

2026-10-18 승인 TEST 운영 정본: [해커톤 TEST 운영/E0·계획 revision4](HACKATHON_TEST_OPERATIONS.ko.md), profile `clear-hackathon-test-operations.1`을 우선한다. P0/v1·R2/R3는 보존하며 120초·1회·600초,150+50 TEST·현재 MET ledger순, 미수락 원자 종료·수락권리 만료/회수 없음이 확정됐다. 기존 미완료 인수→격리 TEST 지급 연결을 단계별 실행하며, 과거 HOLD를 영구 개발 중지로 해석하지 않는다. production/main·자동 merge·상용 자금은 제외한다. 정책 확정과 실제 인수/활성화는 분리한다.

2026-10-17 사용자 선택을 반영한다. [R2 MVP 계약·백로그](PYTHON_BOOTCAMP_R2.ko.md)와 P0 frozen03fa643의 네 조건/100 TEST·v1 계약은 유지한다. R2 고정96bf495와 Astra 경계 리뷰c9c0ee0 이후의 **별도 결정 revision**이며, R2 JSON을 조용히 수정하지 않는다. 기계 판독 정본은 [권리 확정 결정 v1](../../specs/bootcamp/p4-right-finality-decision.json)이다.

사용자는 **체인 기록 순서로 확정하고, 먼저 승인 등록된 지급 권리는 보존**하는 B안을 선택했다. 이는 서버 정정시각이나 취소 요청시각의 우선권을 뜻하지 않는다. 같은 canonical chain의 block/transactionIndex 순서가 기준이다.

| 순서 | 확정한 의미 |
| --- | --- |
| app epoch 취소 또는 key revoke → 최초 accept | 옛 epoch 또는 폐기된 key의 최초 승인을 거부 |
| 최초 accept → 정정·epoch 취소·key revoke → claim | 저장된 고정 recipient/amount 권리를 보존. claim에 새 서버 승인·현재 key/app epoch를 다시 요구하지 않음 |
| 같은 블록 내 accept/취소 | transactionIndex 순서 적용. 높은 gas·서버 wall clock은 순서 보장이 아님 |
| accept 후 즉시 claim | 별도 guard가 없으면 같은 블록에서도 가능. 2단계라는 이유만으로 이의기간이 생긴다고 말하지 않음 |
| canonical reorg | 제거된 accept/claim을 확정으로 유지하지 않고 같은 logical operation/권리를 canonical 상태로 재평가 |

DB stale만으로 밖으로 전달된 서명이 취소되지는 않는다. 이미 ACCEPTED가 된 권리를 뒤늦은 원천 정정·key 폐기로 몰수하지 않는다. 새 승인 취득은 서버에 의존하고, 기존 권리 실행도 체인·토큰·가스 가용성과 아직 정하지 않은 실행기한 정책의 영향을 받는다. 영구권리/무조건 독립청구를 약속하지 않는다. 별도 challenge/finalize 기간은 추가하지 않았다.

이번 선택은 G1만 해결한다. 기한/미해결 자금 귀속(G2), 등록/배정/서명/key-admin 역할과 사고 처리(G3), 의무 발생·예치/배정순서(G4), TEST 환경/finality/gas(G5), 실제 원천/P3 수락(G6)은 그대로 분리한다. 72/120h·회수/배정순서·실행기한을 채우지 않는다. 승인/송금·production·grant/outbox를 켜지 않는다.

다음 작업은 기존 Reclaim 세션의 **Astra/High P4-01A: unsigned authorization encoding/strict validation**이다. 전용 모듈/시험/문서에서 domain salt·정확 필드와 ID 변환·정수/범위·구 V4 비호환·field mutation을 구현하고 제안 encoding을 exact commit으로 인수한다. 실제 signer·키관리·pool·relayer·지급 runtime은 이 단위에 포함하지 않는다. 공통 API/DB·producer·web 소유 파일을 중복 수정하지 않고, 새 type freeze는 통합 소유자가 별도 exact revision으로 소비자 영향과 함께 검토한다. P1/P2/P3의 기존 구현은 계속한다.
