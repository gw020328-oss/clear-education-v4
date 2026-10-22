# C3 사람 동의 대기의 canonical 조회 갱신

2026-10-22. 일반 연결 추천/요청은 Sol / High이며 실제 런타임 ID는 독립 확인하지 않았다. v8 최종f84b6f7의 최신 CI18/18 SUCCESS를 확인한 뒤 진행한 최소 후속이다. Mac 최초 실패1회와 승인된 동일 코드 단일 job 재시험 성공은 [기존 PR102](https://github.com/gw020328-oss/clear-education-v4/pull/102)·PR78 본문 및 원본 로그로 따로 보존한다.

`execution-development`의 canonical procedure snapshot은 조회 후5초에 만료한다. 기존 실제 driver는 START_REVIEW 뒤 한 번만 갱신하고 사람 동의를 기다렸기 때문에5초를 넘기면 `BC_E3_REGISTERED_SNAPSHOT_EXPIRED`가 날 수 있었다. C1/C2의 합성 procedure fixture에는 이 실제 cache 만료가 없었다. TTL을 늘리거나 만료 검사를 생략하지 않는다.

동의 대기의 소유 read callback은 기존 신청 권한 확인→readonly connection.refresh→현재 procedure/권한 재검사를 수행한다. 대기 함수는 async read를 기다리고 취소 신호를 즉시 반영하며 늦은 결과를 동의로 수락하지 않는다. 원래 target의 application/판정/hash/allocation/consent scope/firstStart/review cap/source 만료 비교는 유지한다. worker heartbeat도 기존20초 간격의 lease 확인일 뿐 source/reviewcap 갱신이 아니다.

실제 HTTP의 procedure GET 및 review-consents POST 앞에도 같은 소유 refresh를 연결한다. HTTP는 기존 인증/역할/CSRF 검사를 먼저 통과하고, await 뒤 기존 store 권한/CAS와 서버가 관측한 취소를 다시 확인한다. 연결이 끊어진 직후 서버가 아직 관측하기 전의 POST는 이미 처리될 수 있으므로 응답 손실은 기존 operation lookup/원래 멱등 키로 확인한다. 취소를 동의 철회로 간주하거나 자동 POST 재시도를 하지 않는다.

실제 source 진행 중 아직 host가 chain application을 결합하지 않았다면 v3 procedure/동의는 `BC_NORMAL_PROCEDURE_NOT_READY`다. 그 단계의 조건은 기존 v2 operations로 조회하고, host의 검토 준비 후 v3 view/명시 동의를 사용한다. 준비 전 funding0이나 지급 완료를 임의 표시하지 않는다. receipt GET의 null/고정 수령인·금액/canonical 판독/수락권리 보존은 유지한다. 새 endpoint·거래·서명·source/session renewal은 없다.

네트워크 차단 관련39/39 PASS. 모델링한5초 cache를6초·12초에 실제 만료시키고 readonly 갱신 후 양측 별도 동의가 완료되며 원래 source/review cap이 같음을 확인했다. async read 중 취소/로그아웃·원래 source 만료·대상 변경, HTTPS GET/동의 앞 refresh와 서버 관측 취소 뒤 미기록을 포함한다. 이는 합성 소유 port/HTTPS 검증이며 실제 지갑/HR/AI/시연 지급이 아니다.

첫 local23/24는 async 첫 read 전 heartbeat를 이미 수행했다고 가정한 기존 시험 예상1건을 발견했다. 첫 신규16/17의 취소 시험은 client abort가 서버에 관측되기 전에 gate를 해제한 순서 문제였다. 두 원본 로그를 보존하고 서버 취소 관측과 동의 권한을 구분하도록 시험 순서만 바로잡았다. 제품 권한·cap은 낮추지 않았다. 실제 행동/새realm0, HR producer·금고/서명 정책·5초 TTL·web변경0이다.

정확 source candidate는 `26d451701186632ba7a37729b9937f28ce3a1f83`다. 새 v9 intake SHA는 `19261eca5c089bf8ae68626bfdfff87b935bb7c4b0a9c783bb52709c9a2870fc`이며 현재135개 source/자산 중 HTTP/explicit-consents/live-context/normal-chain4개 변경만 인수한다. v8의135개·intake·helper/guard 원본과 이전 v7/v6은 원래 Git snapshot으로 보존한다. guard는 새 reviewed-source-v9 및 normal-source-pins-v6로 exact delta만 소비한다. 변조/세대/원본 보존26/26 및 A/B 보존 PASS이며 새 head CI는 별도로 확인한다. 실제 원천/지갑/AI 시연 완료로 해석하지 않는다.
