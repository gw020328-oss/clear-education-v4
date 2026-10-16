# v2 직접 코드 리뷰

2026-10-16. 주 세션이 parser/adapter/circuit/native toolchain/메모리 IPC/재사용 및 초기 등록 모델을 직접 검토했다. 별도 사람 승인·독립 보안 감사는 아니다. PR69 v1의 기존 검증은 별도로 보존한다.

수정한 발견 사항:

- 기존 YBM source-policy와 대조해 v2 호스트의 TOE/trSB 행 표시 검사를 보강했다. 이름/클래스 누락 또는 다른 시험 표시를 거부한다. 회로의 해당 속성 검사 미완료는 별도 수락 반례로 보존한다.

- snapshot이 만료된 환경에서는 공식 목록에 없는 키 테스트가 signer 검사에 도달하지 않았다. freshness 판정과 서명 키 검사를 분리했다. 만료 결과를 공식 서명 검증 결과로 합산하지 않는다. start 포함/end 제외 경계도 명시했다.
- private registry의 비동기 서명 검증 도중 close하면 종료 뒤 상태를 기록할 수 있었다. await 뒤 closed를 다시 확인하며 실제 동시 종료 회귀를 추가했다.
- 자식의 호스트 검증 결과에 rowCount가 포함되어 원천 메타데이터가 불필요하게 노출될 수 있었다. 공개 결과에서 제거하고 부모가 정확한 고정 schema만 새로 구성하게 했다.
- 처음 만든 hang fixture는 message listener 종료 뒤 스스로 종료해 timeout을 실제 검증하지 못했다. 활성 timer로 살아 있게 변경하고 timeout 뒤 child close를 확인했다.
- 11자리 회로 거부 시험이 witness 배열 생성에서 먼저 실패했다. 배열은 10자리로 만들고 원천 11자리/declared length 11을 실제 ACVM에 넣도록 수정했다. 행/셀 상한 시험도 선택한 정상 사실을 그대로 둔 채 상한만 넘기도록 보정했다.

의도적으로 미해결 상태를 보존한 사항:

- 회로는 중복 원천 행/중복 HTML 속성/원천 행 표시 누락을 host와 동일하게 거부하지 않는다. 세 반례는 실제 ACVM 수락을 확인하는 테스트다. 이것을 완성된 검증기의 허용 사례로 채택하지 않으며 live 모드가 없다.
- 가변 전체 표와 canonical claim JSON의 escaping/Keccak/EIP-191/signature가 아직 같은 회로에 없다. 호스트의 signatureVerified를 회로 사실로 소비하는 제품 경로를 만들지 않았다.
- 공식 signer 공개 목록/TTL/epoch1의 의미는 호스트 adapter에 고정했지만 실제 공식 새 proof 검증/회로 signer pin/공식 key 회전 유효기간은 미검증이다.
- native compiler는 2KiB 회로를 만들지만 bb.js gate-size 계산이 중단된다. ACVM PASS를 proof 생성 가능성이나 실제 EVM 성공으로 표시하지 않는다.
- private checkpoint는 trusted 상태 모델이며 암호화·rollback 방지·영속 저장·동시 DB transaction이 아니다. 키/상태 초기화와 최종 spent rollback으로 중복 가능한 반례를 유지한다.
- 초기 등록 영수증은 새 등록기관 서명 신뢰를 추가한다. 이후 오프라인 행사 가능성과 최초 등록 독립성을 혼동하지 않는다. 지급/authority 활성화는 없다.
- 네트워크 차단은 JS tripwire이고 OS sandbox가 아니다. 실제 raw proof/witness를 저장하거나 기존 collector에 연결하지 않았다. child 종료와 일부 Buffer.fill을 완전한 RAM/swap 소거로 표현하지 않는다.

합성 연구 PR로 검토 가능한 상태이며 **실사용/로그인/독립 청구 GO 검토를 통과했다는 뜻은 아니다.** 다음 선행 작업은 토큰 경계가 제약되는 작은 parser 구성, host/circuit 동등성, 서명 preimage 통합 및 로컬 prover 자원 재측정이다. 범위는 전용 spike이며 공통 제품/Windows 문서는 변경하지 않는다.
