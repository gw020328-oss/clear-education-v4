# Runtime heartbeat의 전진 시계 경계 로컬 수정 후보

2026-11-04. 기준은 PR153 `fed992a86367936f713774355af2921e94fe0a29`다. [E5B 실패 실행](https://github.com/gw020328-oss/clear-education-v4/actions/runs/41779569851/job/126407792081)의 runtime acquisition rollover 리허설은 START_REVIEW의 HEARTBEAT에서 `BC_E5_CLOCK_CHANGED`로 중단됐다. 실패한 heartbeat·호출자·시험은 PR149 `54ca048`과 동일했다. CI 재실행으로 덮지 않고 별도 로컬 후보를 만들었다.

## 원인과 최소 변경

heartbeat는 기존 `service`의 commit validator를 사용하지 않았다. 갱신 전후의 정수 초가 달라지면 안전하게 롤백했지만, 정상적인 전진 초 경계에서도 전체 지급 리허설이 중단됐다. 최소 합성 재현에서 HEARTBEAT_RUNTIME authorize 뒤 시계를 1초 전진하면 같은 오류가 발생하고 worker authority 테이블은 그대로였다.

소스 변경은 `src/bootcamp/execution-operations.mjs` 한 파일이며, 소스 후보 커밋은 `122f13b71c96ce8f36a50a69e2dfc4729d2c7211`이다. 기존 공통 clock guard/반복 횟수/다른 action은 유지하고 HEARTBEAT_RUNTIME만 기존 read-only commit validator 대상에 추가한다.

1. 최초 시각에 현재 서비스 권한과 원래 worker 임대가 유효한지 확인한다. runtime은 UNOBSERVED 또는 ACTIVE이고 같은 generation이어야 한다.
2. 원래 임대 만료와 runtime 전체 행을 고정하고 heartbeat 갱신을 한 번만 수행한다. 갱신 시각은 최초 시각이며, 나중의 검증 시각으로 다시 연장하지 않는다.
3. 새 시각에서 서비스 권한을 다시 확인하고, **갱신 전 원래 임대**도 아직 유효한지 검사한다. tentative extension이 원래 임대의 만료를 숨기지 못한다.
4. runtime 전체 행과 갱신 직후 worker 전체 행을 다시 대조한다. owner/incarnation/lease/fence/generation/slot/만료 지문 변화는 허용하지 않는다. global audit와 기존 transaction 잠금을 유지한다.
5. 기존 검증 루프는 검증 중 한 번의 추가 전진만 읽기 검증으로 흡수한다. 역행·반복 전진·권한 축소/철회·원래 임대 만료·runtime 변경은 롤백한다. 서명·전송·갱신 함수를 재실행하지 않는다.

이 heartbeat는 특정 신청의 지급 권한을 발급하지 않는다. 신청·원천 정책·동의·이미 발급한 capability의 만료를 연장하지 않으며, 이후 business/current/dispatch 검사는 그대로다. runtime 상태/generation/정본 변경과 서비스 권한은 heartbeat 자체의 조건이다. DB 잠금은 경쟁 writer의 진입을 막지만 파일시스템 commit 완료에 대한 실시간 SLA는 아니다.

## 소스 지문 계승

v60·v61·v62·v63 원문과 과거 delta는 byte-identical로 보존한다. [heartbeat delta](../../../specs/bootcamp/hackathon-test-runtime-heartbeat-clock-source-delta-v1.json)는 execution-operations의 exact before/after 한 건만 인수한다. v64는 해당 after bytes에 대해서만 과거 checks를 before로 대조한 뒤 최종 모든 source/wallet bytes를 현재 테이블로 다시 검사한다.

소스 후보 `122f13b`의 범위는 source 224개, wallet 24개, 추가 artifact 9개로 중복 제거 256개다. 전체 저장소를 뜻하지 않는다. v64 guard/delta/consumer와 후속 시험·이 문서는 별도 control 파일이며 후보 blob으로 주장하지 않는다. delta→v64→단일 memory consumer→preservation exact hash 연결과 Git blob provenance 검사를 유지한다.

## 검증과 인수 상태

새 집중 검사 13개는 최초/검증 중 전진, 반복 전진, 역행, 원래 임대 만료, 권한 만료·축소·서비스 변경·철회, 경쟁 writer 잠금, runtime 중지/generation 변경, 이전 owner를 검사한다. 정상 전진에도 연장은 최초 시각 기준 한 번이며 business/ledger는 변하지 않는다. 오류에서는 worker authority가 롤백되고 서명·전송은 0개다.

새 전체 Geth 합성 시나리오는 START_REVIEW heartbeat의 검증 tick에 실제 초 경계를 강제로 넣고, 기존 고정 100 TEST·6개 전송·1개 payment signature·중복 지급 차단 assertion을 유지한다. 실제 사용자 지갑/원천/지급이 아니다.

확정된 로컬 검사 결과:

- `tests/bootcamp-execution/*.test.mjs`: 293/293 통과. 새 13개 경계 검사와 기존 권한·임대·capability 불변·복구 시험을 포함한다.
- provenance: 9/9 통과. 한 파일의 exact before/after, 후보 Git blob 256개, 현재 bytes 및 변조 시 runtime 생성 전 거부를 검사한다.
- normal source compatibility: 55/55 통과.
- stage execution: 48/48 통과. actualSources=0, externalRpc=0, persistentChains=0.
- E5 preservation, E5B source pins, workspace, dependencies: 통과.
- 실패 CI의 runtime acquisition rollover 단독 합성 재현: 1/1 통과.
- normal-dispatch-clock Geth 합성 전체: 12/12 통과. 실제 heartbeat 초 경계, 각 기존 전진 경계, 응답 유실, 원천 변경·서비스 철회·만료 차단을 포함하며 기존 assertion/skip 완화 없이 약 534초에 완료했다.

exact 인수 head는 본부 인계에 기록한다. 첫 집중 병렬 실행의 SIGKILL 복구 2개는 timeout으로 취소됐고, 원래 15초 제한을 유지한 집중 순차 재검사 71개 및 위 전체 회귀 293개에서 모두 통과했다. 검사 시간 제한이나 assertion은 완화하지 않았다.

이 후보는 본부 리뷰 전 원격 PR153에 push하거나 기존 실패 CI를 재실행하지 않는다. PR149와 기존 실제 실행 자료는 변경하지 않는다.
