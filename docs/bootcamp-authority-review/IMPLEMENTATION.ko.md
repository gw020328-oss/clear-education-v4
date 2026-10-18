# P4 순서·결정 관문·필수 인수

## 1. 구현을 열기 전 필요한 결정

리뷰 결과는 다음 선택을 사용자/통합 소유자가 고정할 근거다. 이 문서가 OPEN을 승인으로 바꾸지 않는다. 아래 관문은 P1/P2 source/DB 작업을 막지 않고 P3의 blocked consent/view/metrics도 계속할 수 있다.

| 관문 | 구체 결정 | 결정 전 가능한 범위 / 막히는 범위 |
| --- | --- | --- |
| G1 권리 확정순서 | B안: 최초 accept의 canonical 채굴 순서가 취소보다 우선하면 fixed right 보존. 또는 E안: 명시 challenge/finalize 기간/권한 | unsigned 구조·거부 test 준비 가능 / live signer·accept 활성화 불가 |
| G2 기한/귀속 | route2 anchor/기간/통지/미평가 이의 처리, authorization TTL, accepted right 실행기한, unresolved 예약 해제·환수 주체/절차 | 현재 상태는 UNKNOWN/UNRESOLVED·HOLD / route2·reclaim·replacement의 임의 상수/회수 금지 |
| G3 역할·키 사고 | app registrar/allocator/oracle signer/key administrator의 범위, keyId validity·rotation·revoke 승인 절차, accepted 권리와 사고 대응 관계 | 역할 분리 schema/unsigned fixture / 키 생성·운영 registry 없음. 전체 pause가 필요하다는 새 요구면 권리 영향 재검토 |
| G4 의무/예치·배정 | O가 생기는 business transition, 같은 등록의 canonical app key, decision 이전 hold와 final allocation 구분, 격리 시연의 명시 배정명령/순서 | 순서 없는 부족 queue/산식 가능 / 임의 FIFO·예치율·비배정 자금 출금 불가 |
| G5 체인 확정·환경 | isolated TEST chain/code/token/instance pin, 확인 깊이/finality 정책, reorg 처리 범위, native gas 예산 | read-only ABI/산식·기존 근거 검토 가능 / ‘tx 수신=확정’ 표시 금지 |
| G6 실제 자료 수락 | P1 official signer/mandatory capture/request pair·P2 실제 mapping/producer·P3 동의 권한/기한 인수 | 합성 TEST별도 경로 준비 가능 / 합성 성과를 실제 자격/지급으로 승격 금지 |

110%/20%, 72/120시간, 미해결 자금 몰수/운영자 반환, 자동 배정순서/무기한 global pause를 기본값으로 넣지 않는다. 스캐폴드에서 열지 않은 경로는 명시 거부하고 UI·문서·테스트의 완료 분모에서 제외한다.

## 2. 권장 실제 작업 단위

| 순서 | 다음 정확 단위·담당 | 코드 범위/인수/종료 조건 |
| --- | --- | --- |
| P4-01A | **다음 Astra/High 단위: unsigned authorization v2 encoding과 strict validation** | 이 리뷰의 필드 표→독립 version/type/enum/domain salt·기존 v1 ID 매핑 규칙·R2 기한 record 설계 고정. 키/송금 없이 JS/Solidity hash 일치·각 필드 mutation·구 V4 서명구조 비호환·uint/bytes 범위 시험. 공통 API 소유자에게 immutable command/consent target DTO만 인계. 실제 type freeze 별도 커밋 |
| P4-01B | G1/G2/G3 결정 후 Astra/High: 격리 TEST authorization registry/accept lifecycle | 기존 V4를 고치지 않는 별도 실험 계약. keyId immutable registry·app epoch·signed digest/nonce·exact registered target·ACCEPTED tombstone; 서명자가 app/recipient/배정을 만들지 못함. 양쪽 채굴순서와 key사고/restart 반례를 새 메모리 EVM에서 검증. 이 단계에서 처음 합성 key/signature 실행을 명시 범위로 승인받음 |
| P4-02A | Astra/High: 공용 TEST reservation 및 원자 funding ledger 인수 | 확정 deposit→한app한의무/배정·B/R/O checkpoint·shortfall incident/순서없는 queue. DB 소유자는 API 담당, contract/자금 불변식 소유자는 이 담당; 동일 파일 공동 수정 대신 exact 인터페이스 인계. source/mapping/current·CAS·expiry를 승인 직전 재검사 |
| P4-02B | G2/G4/G5 결정 후: 충전·정정/UNRESOLVED·재시작/reorg | 사전예치 정상+부족 별도. confirmed topup 후 재검사·이미 배정된 권리 보호. OPEN release/reclaim은 거부로 인수, 승인 전 자동 대체 금지. 임의 예치율/우선순위 없음 |
| P4-03 | 위 guard 인수 후 Astra/High + API/web 각 소유자: 제한 relayer와 TEST 지급 | exact outbox/nonce lease/tx replacement·unknown/reorg 복구; fixed recipient anycaller claim; native gas/TEST 분리. 새 bridge에서 gas6항목+권리 보호 인수. web은 기존 소유자에게 버전 DTO·실측 event·안내 인계 |

P4-01B와 P4-02는 target/예약 인터페이스를 먼저 공동 고정해야 한다. mock allocation=true를 production authorize에 연결하지 않는다. P4-03 종료도 실제 source/상용 자금/공개체인 운영 승인 완료와 다르다. 모든 후보 단계에서 grant/outbox HOLD·paymentAllowed=false·productionEnabled=false를 기본으로 두고, 후속 격리 실행만 별도 범위와 exact 지문으로 제한한다.

## 3. 필수 adversarial acceptance cases

아래는 **아직 새 bridge에서 실행하지 않은 필수 시험 목록**이다. `source-inspection`과 unsigned 산식 검사는 이 동작 시험을 대체하지 않는다.

| ID | 조작·실패 주입 | 요구 결과 |
| --- | --- | --- |
| T01 | chainId/contract/instance/version/name 각각 변경 | domain 거부, 다른 환경 재사용 불가 |
| T02 | 기존 V4 grant/type/EXAM nullifier를 v2에 제출 | ABI/type/domain 불일치 거부 |
| T03 | app/policy/mapping/decisionId/revision/hash 각 1필드 변경 | signature 또는 exact target 거부 |
| T04 | recipient/token/amount/allocation/consentSet/deadline hash/route 각 변경 | target/서명 거부, 송금0 |
| T05 | nonce/issuedAt/expiry/keyId/epoch 각각 변경·unknown enum·zero/overflow | 검증 거부, 소비/예약 변화0 |
| T06 | JS/Solidity encoding 순서·숫자형·동적 문자열 ambiguity·high-s/잘못된 v | 일치하는 고정 vector만 허용; malformed/recovery0 거부 |
| T07 | 소스 UNKNOWN/expired/mapping stale/P1 synthetic를 실제 mode로 변환 | 발급 금지; 동의/기한으로 우회 불가 |
| T08 | 두 proof 중 하나의 request binding 부재·다른 참가자·빈 capture spoof | P1 미결 그대로 거부/blocked; source 단독 서명을 지급승인으로 수락 금지 |
| T09 | 양측 중 한 명만 동의·역할 중복·옛 target·다른 app 동의 | route1 발급 금지 |
| T10 | route2 기한 직전/정확 경계/직후, anchor미확인, 미평가/유효/미해결 이의 | 고정한 정책 그대로; 없음/불명확은 금지, 접수만으로 임의 연장도 금지 |
| T11 | DB만 stale 후 외부 옛 서명으로 accept | on-chain 취소가 없으면 성공 가능 반례를 반드시 보존 |
| T12 | app epoch bump 채굴→old accept, 역순, 같은블록 txIndex 양순서 | 앞선 canonical 전이에 따라 거부 또는 fixed right 보존 |
| T13 | key revoke 채굴→첫 accept, 역순→claim | revoke 전 수락된 권리는 보존; 이후 첫 수락만 차단 |
| T14 | rotation 새 keyId 후 구 key 미폐기/명시폐기, keyId주소 덮어쓰기 | 단순 추가는 취소 아님; 등록값 불변, 폐기 반영 후 신규accept 거부 |
| T15 | app epoch reset/감소/구 instance·key로 재사용 | 거부, nonce/settled tombstone 보존 |
| T16 | 만료 직전/정확 expiry 첫accept, accept 후 expiry와 key revoke | exclusive accept cutoff, claim은 확정 실행기한 규칙과 저장권리만 사용 |
| T17 | signer 침해로 app 생성/수령인교체/증액·배정 안 된 승인 | 등록/allocator 권한 경계 거부. 같은 운영자가 전권 보유할 때 잔여 위험도 기록 |
| T18 | 서명 생성 직후 crash·DB저장 실패·서명저장 후outbox 실패 | 같은 logical command/nonce 복구, ‘미발급’ 가정한 재사용 금지 |
| T19 | accept 응답 유실 후 같은 digest/다른 digest, 신규key+nonce 동일app | 동일 결과조회 또는 충돌; 한app 한권리 유지 |
| T20 | ACCEPTED 후 DB정정·관리자key revoke·서버중단→제3자claim | 고정 recipient/amount 실행 가능(기한/chain guards 안에서); 새서명 요구 금지 |
| T21 | B=100/R=0에 두 병렬100예약 | 하나만 성공, B≥R; DB만 검사해 둘 다 성공 금지 |
| T22 | 같은app 새obligationID/decisionrevision/instance표기 재등록 | canonical enrollment 유일성/terminal tombstone으로 두 번째 의무 차단 |
| T23 | R포함O에 R을 다시 더함, float/음수/uintoverflow/다른token·decimals | 산식/형식 거부. 정확100000000만 |
| T24 | B120/R100/O200에서 배정된 A claim | B20/R0/O100/S80, 다른 의무/예약 보호, global pause 없음 |
| T25 | 위 부족에서 topup intent/tx제출/ACK만 기록 | B/R/S 미변경, FUNDING_PENDING 유지 |
| T26 | 확정80 topup 뒤 stale decision/expiry/이의/changed mapping | S해소와 자격승인 구분; 자동 배정/서명 금지 |
| T27 | 같은topup operation/body retry, 다른body, replacement tx/중복log | 잔액/credit 1회, body conflict 거부 |
| T28 | donation/false token·외부chain tx·잘못된 event recipient | approved accounting만. donation 소유권 OPEN이면 unattributed로 남김; 허위충전 확인 금지 |
| T29 | RESERVED 정정→새target allocate, accepted 후cancel/reclaim | release결정 없으면 UNRESOLVED 유지, 기존권리 회수/두번째100 금지 |
| T30 | transfer false/revert/reentrancy/부족 balance | nonce/settled/R/B/event 전체 revert, 지급완료 기록 없음 |
| T31 | 입금/배정/accept/claim 단계마다 DB crash·RPC 응답 유실 | chain operation/digest/state 조회로 복구; 새의무/새승인으로 중복 해결 금지 |
| T32 | deposit reorg·accept reorg·claim reorg·같은높이 다른hash | checkpoint rollback/reapply, orphanCONFIRMED 제거; logical ID/tombstone canonical 재평가 |
| T33 | 서로 다른 block B/R 또는 DBseq O 합치기, confirmations 미달 | snapshot 거부/UNKNOWN, confirmed 표시 금지 |
| T34 | relayer가 front-run claim·recipient 변경·arbitrary calldata/value | 고정권리만 송금, relayer에게TEST0, 비허용호출거부 |
| T35 | 정상 새bridge claim 가스 관측 | relayer native감소=fee, learnernative불변, learnerTEST+100, 다른예약유지, 재청구0 |
| T36 | 두 worker의 동일native nonce, restart/replacement/만료 경합 | 주소별lease·같은 intent 복구, 송신 성공만으로CONFIRMED 금지 |
| T37 | nativegas 부족·relayer중단·긴대기 | TEST권리/예약차감0, 상태대기/UNKNOWN; 기한정책 영향 명시 |
| T38 | paid/회수 terminal app을 새recipient/key/nonce로 재개 | 권리 재생성/재예약/재지급 거부 |
| T39 | 타학생/운영자 권한 밖 evidence·funding snapshot·서명key 조회 | 서버role거부, 개인정보/secret0, 새v2 DTO만 |
| T40 | events retry/newID동일logicaloperation/reorg/부분구간누락 | 중복성과0, failed 이력보존, baseline동등성 없으면 개선율N/A |

특히 T11은 DB stale만으로 취소됐다는 보장에 대한 반례이며 실제 chain 수락 가능성을 그대로 기록해야 한다.  T12/T13/T20은 선택한 B안의 권리 정의를 고정하는 시험이다. 모든 정정 후 옛 서명을 거부한다고 쓰고 T20을 동시에 통과시켰다고 주장하면 의미가 모순된다. SOURCE 오류/자료 미결 T07/T08과 정책 OPEN T10/T29는 P4를 열기 위해 자동 PASS로 바꾸지 않는다.

## 4. P3/API 소유자 인계

필요한 별도 v2 레코드는 unsigned command, immutable target+deadline record, signer key-version reference, app authorization epoch observation, allocation/right chain observation, operation/outbox state, consistent funding snapshot/incident/queue다. v1 decision/evidence를 수정해 이 상태를 끼워 넣지 않는다. 필드명/DB schema는 API 담당이 단일 소유하며 이 리뷰에서는 정의안을 전달할 뿐 공통파일을 수정하지 않는다.

API가 먼저 제공할 수 있는 것은 exact decision/consent target과 blocked 이유·current CAS, ordered ledger sequence, role view, durable metric event다. 아직 authoritative signature/chain mutation 함수는 제공하지 않는다. P1/P2 candidate 수락 단일 transaction의 nonce와 P4 authorization nonce, relayer account tx nonce는 서로 다른 공간이며 서로 대체하지 않는다. P4가 거부해도 P1/P2의 관측 기록과 오류 수정 작업은 계속 가능하다.

완료 보고는 실제 source/합성, unsigned hash/서명검증, 로컬 EVM/외부 chain, 계획/코드/측정을 별도 분모로 기록한다. 새 signer·키·계약·거래는 다음 명시 구현 단위 전까지0이다. 이번 PR은 리뷰 전용 Draft이고 merge/deploy를 수행하지 않는다.
