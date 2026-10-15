# L2/L3: 격리 export 프로토콜 모델과 읽기 전용 준비

2026-10-15, [#40](https://github.com/gw020328-oss/clear-education-v4/issues/40)의 합성 준비 범위. 선행 L1 [#45](https://github.com/gw020328-oss/clear-education-v4/pull/45) 최종 코드 `9da87ff`/M1 반영 이력 `b731096`, M1 [#43](https://github.com/gw020328-oss/clear-education-v4/pull/43) `3961b09`, M2 [#46](https://github.com/gw020328-oss/clear-education-v4/pull/46) `38b18cd`에 의존한다. 다른 담당의 코드를 파일 복사/수정하지 않고 feature commit들을 이력 병합했다. 공통 계약은 착수 시 develop 미병합이다.

**실제 Moodle 플러그인을 이식·설치하거나 실제 HTTP/계정 인증을 구현한 결과가 아니다.** 기존 실험환경을 건드리지 않고, 새 단일 프로세스 메모리에서 export 계약과 driver를 준비해 검증했다. 학습 facts·정책 평가·원천 취득을 분리한다. 원천 의미/진도/속도/capability를 설정으로 발명하지 않으며 모든 실행 입력은 SYNTHETIC이다.

## source 모델

[`createSyntheticExportLab`](../../spikes/moodle-export-lab/source.mjs)는 raw facts seed, 독립 SourceBinding, compiler의 ordered allowedActivityIds를 입력받는다. 활동집합 hash와 명시적인 PRESENT/NO_RECORD/UNAVAILABLE/UNKNOWN row를 대조하고, 누락된 활동을 0시간이나 NO_RECORD로 만들지 않는다.

- 별도 current revision(r1→r2…), 전체 row count, 100행 단위 ordered page descriptor·지문, terminal, manifest 지문, normalized facts 지문을 만든다. 이 값은 새 **합성 export 모델**의 메타데이터이며 기존 `local_clearwatch_read`가 제공한 값으로 표시하지 않는다.
- readManifest/readPage는 요청의 SourceBinding과 expected current revision을 대조한다. 요청한 옛 revision으로 조용히 되돌아가지 않는다. 읽기 도중 head가 바뀌면 전체 수집을 보류한다.
- head는 immutable이고 페이지는 한 head를 참조한다. 단일 JS 호출의 정정은 다음 head/감사 항목을 모두 검증한 뒤 교체한다. 유효하지 않은 변경은 revision·audit를 추가하지 않는다. 이는 DB transaction/다중서버 원자성 실측이 아니다.
- 감사 항목은 새/이전 revision, 제한된 사유 enum, factsHash다. 원문/개인정보/자유 텍스트 사유를 저장하지 않는다. 서명·tamper-proof 저장·기관 권한을 제공하지 않는다. 과거 원본 보존/분쟁 보존기간은 후속 설계 대상이다.
- recordRevision은 이 합성 profile에서 export generation과 같다. 실제 기관의 row 수정번호가 다르면 별도 의미/매핑·version으로 연결해야 한다.
- resolveSyntheticHead는 test resolver용 별도 내부 접근이다. read 응답을 trusted pin으로 복사하는 예제가 아니며 실제 source 서명·기관 인증을 대체하지 않는다. positive bridge는 테스트 권한이 별도로 승인한 합성 pin을 명시적으로 고정한다.

## read-only driver

[`collectSyntheticMoodleFacts`](../../src/learning-evidence/moodle-mvp/read-only.mjs)는 source/계정/활동/신청 결합과 현재 revision·factsHash가 독립적으로 고정된 context를 받는다. 주입된 client의 named `readManifest/readPage/close`만 호출한다. exchange/begin·동영상 재생·쓰기 요청을 하지 않는다.

프로토콜 profile은 `synthetic-moodle-export.1`, transport는 `IN_MEMORY_ONLY`다. HTTP/live transport 선언은 읽기 전에 차단한다. driver 자체에 URL/HTTP/credential/token 처리 코드는 없다. 주입 client는 신뢰한 테스트 코드이며 임의 JS를 네트워크 sandbox에 가두는 기능은 아니다.

1. JSON body 256KiB, 고정 두 겹 JSON decode, raw shape·binding/inventory/source revision·독립 facts pin 확인.
2. manifest의 고정 pageId만 조회. offset/count/ID/중복/각 page 지문/최대100페이지·10000행과 terminal 대조. 원천 URL/redirect를 따라가지 않는다.
3. 모든 페이지 뒤 manifest 재조회, 같은 revision의 내용 변경도 거부. 부분 결과·raw provider 오류를 반환하지 않음.
4. 읽기별 timeout·abort, 정상/오류/중단 모두 close를 한 번 시도. close도 timeout/실패이면 보류. close timeout은 자원 정리 완료 보장이 아니며, 실제 transport의 취소/자원 수명 구현은 후속이다.
5. 정리 뒤 서버 시계/만료를 재검사하고 immutable facts 반환. 응답 유실 재조회에 적립·DB 쓰기가 없어 중복 학습/지급을 생성하지 않음. 자동 재시도 없음. 취소/timeout 이후 늦은 응답은 이미 반환한 결과를 바꾸지 못한다.

`COLLECTED_SYNTHETIC`은 고정 합성 artifact의 취득/무결성 결과다. 진위·계정 인증·기관 승인·학습 조건·제품 수락이 아니다. collectionEnabled/sourceAuthenticityVerified/productConnected/humanAttentionProven/paymentAllowed는 모두 false다. L1과 M2도 별도 신뢰 검사를 유지한다.

## 실제 M2 소비 bridge

[`m2-bridge.test.mjs`](../../tests/moodle-mvp/m2-bridge.test.mjs)는 같은 작업본/모듈 인스턴스의 compiled WeakSet 객체로 L1 RuleObservation을 M2의 별도 합성 Evidence에 넣는다. 테스트 authority가 Evidence pin을 갱신하는 것이며 제품용 VERIFIED 변환기·수락 API가 아니다. sourceBindings, 진위/subject/semantics, coverage/current revision은 observation과 독립적으로 확인한다.

실제 bridge에서 MET/OBSERVED0·0의 NOT_MET/미확인 UNKNOWN/source 검증 UNKNOWN/현재 기간 PARTIAL coverage 보류를 확인했다. 또한 공통 M2 `1cdf75c`에서 현재 기간+observation UNKNOWN이 IN_PROGRESS로 가려지는 문제를 재현해 소유자에게 전달했다. 공통 담당이 `38b18cd`로 보정했고, 소비자 회귀에서도 UNKNOWN/SEMANTICS_UNKNOWN·entitlement=null을 확인했다. 공통 schema/evaluator를 여기서 직접 수정하지 않았다.

## 검증과 남은 관문

고정 Node24.21.0에서:

```sh
./tools/node --test tests/moodle-mvp/*.test.mjs tests/moodle-preparation/*.test.mjs tests/mvp-policy/*.test.mjs tests/policy/*.test.mjs tests/learning-evidence/*.test.mjs
./tools/npm run verify:workspace
```

332개 통과/실패·skip0: L1 35 + export/driver18 + 실제 M2 소비bridge6 + 재사용 corpus5 + M1/M2 25 + 기존 정책112/B3 131. source의 다페이지·읽기중 revision 변경·정정 충돌/rollback·명시적 누락, driver의 scope·변조/부분실패·이중 decode/크기·고정 오류·pre/mid abort·timeout/close 실패·정리후 만료·늦은응답·query 복사·쓰기 비가용을 검사했다. 기존 정책/학습 경로와 workspace 원본/legacy191파일·reference4개 보존도 통과했다. 새 시험은 전용 경로에서 실행하며 root CI를 무단 수정하지 않는다. 원격 최종 head/CI/공개 이력 결과는 PR에 기록한다.

남은 실제 L2/L3: 새 격리 Moodle 설치/플러그인 이식·GPL 패치/업그레이드/롤백, PostgreSQL snapshot/revision/audit와 권한 있는 export, 강좌/학습자 계정의 인증된 연결·최소 권한 service, 서버 HTTPS 고정 origin/함수·redirect/TLS·secret 주입/회전/폐기·로그/보존 경계, 기관의 공식 progress/speed/종료 의미와 실제 형식 검증. 이 경계를 갖추기 전 SYNTHETIC artifact를 LOCAL_LAB 또는 기관 원천으로 재표시하지 않는다.

기존 Docker/Moodle·공유 DB·체인·키·토큰, 새 실제 재생/기관 접속/유료 호출·제품 L4 HTTP/DB/웹은 사용·변경하지 않았다. 실제 Moodle/원천 BLOCKED·400% 자동 자격/지급 금지·500% 시연 제외·예치 OPEN·grant/outbox HOLD·독립청구 NO-GO·Mac 원인 미확정을 보존한다. Draft PR 자동 병합 없음. #40은 합성 L1/프로토콜 준비와 실제 원천·제품 통합 완료를 분리해 열린 상태로 유지한다.
