# 추가 지급 서명 없는 청구: 격리 검증

2026-10-15 후속: [다중 조건·ABI·중단 의존성 검증](../independent-claim-boundaries/README.ko.md). 최신 M1/M2 합성 정책을 읽기 전용으로 소비하며 아래 800점 원형을 최신 상품 정책으로 사용하지 않는다. 제품 independentClaim=NO_GO 유지.

최신 판정: [공식 attestor 소스 확장 통합 시험](ATTESTOR_EXTENSION.ko.md). 로컬 실제 TLS→native OPRF→attestor 서명·독립 검증 14개와 오프라인 25개가 통과했다. 공식 hosted 배포·실제 YBM 적용·제품 전환은 NO-GO다. [동일 시험 결합·안정 nullifier](SOURCE_BOUND_FOLLOWUP.ko.md)는 그 전 단계이며 아래는 첫 실험 보존 기록이다.

2026-10-13, 기준 `3f8ef79`. **현 제품 전환 NO-GO**다. 로컬 모델의 추가 issuer 서명 없는 지급은 가능하지만, 원천에 결합된 비공개 조건과 안정 nullifier는 해결되지 않았다. 기존 20개 exact-match Reclaim 지급 시험과 197점 predicate 시험은 사용자 제공 `output/clear-direct-proof-feasibility-2026-10-13`의 과거 근거로 읽었으며 재실행 결과로 세지 않았다. 새 실험은 이 worktree의 의존성만 사용한다.

## 재현

저장소의 고정 Node 24.21.0 / npm 11.19.0 준비 후:

```sh
./tools/npm ci --ignore-scripts
./tools/npm --prefix src/ybm-collector ci --ignore-scripts
./tools/node spikes/direct-proof-feasibility/predicate-check.mjs
./tools/node spikes/direct-proof-feasibility/adapter-check.mjs
# 선택: 무료 공개 RPC/registry/Sourcify 읽기 전용 관찰. 트랜잭션 없음.
./tools/node spikes/direct-proof-feasibility/verifier-readonly.mjs
```

앞의 두 실험은 인공 자료만 쓴다. 합성 JSON 보고서를 이 폴더에 갱신한다. 세 번째는 관찰 시각/블록에 따라 달라지는 공개 메타데이터이며 release manifest가 아니다. 실제 proof, 지갑 키, 쿠키, 기존 DB/체인은 사용하지 않는다.

## 실행 결과와 의미

| 항목 | 관찰 | 제품 관문 |
| --- | --- | --- |
| 합성 HTTP receipt, 197개 유효 TOEIC 점수 | 800~990만 통과, 총점·시험일·수험번호 capture 생략 | 실제 TLS/공식 서명/비공개 기간 조건 미실행 |
| 기간의 양 끝과 잘못된 날짜 | 합성 거부/허용 검사 PASS | 실제 시험 상태·취소·전체성 미확인 |
| 서로 다른 행의 노출 바이트를 조합한 합성 receipt | 조건 검사 통과 재현 | **FAIL: 동일 행/시험의 자격 관계를 보장하지 못함** |
| STWO 기본 OPRF maker | 없음 확인 | BLOCKED |
| gnark OPRF 요청 생성 | native library 미패키징 상태에서 실행 차단 | BLOCKED; native 설치/빌드 성공으로 일반화 불가 |
| 짧은 hashed reveal | 6바이트 입력→6 base64문자 출력 확인 | 사업 nullifier로 안전하다고 볼 수 없음 |
| 메모리 EVM adapter | 14개 기대 관찰 PASS, 고정 수령인 1,000 wei 지급 | 합성 witness 사실 모델이며 실제 증명 자격 검사 아님 |
| 같은 제공 nullifier, 다른 신청/지갑 | 두 번째 청구 거부 | 원천이 동일 시험에 동일 값을 보장한다는 조건부 결과 |
| 같은 개념상 시험에 다른 제공 nullifier | 다른 신청 청구 허용 재현 | **FAIL: 원천 결합과 안정성 미구현** |
| CLEAR 중단 후 새 증명 취득 | 미실행 | NOT_RUN |
| 실제 YBM·공식 새서명·실제 수강률·전체 목록 | 미실행 | NOT_RUN/BLOCKED |

`predicate-report.json`의 6개, `adapter-report.json`의 14개 PASS는 **예상한 관찰의 재현 성공 수**다. 부적격 자료 수락이라는 반례도 예상대로 재현되면 체크 자체는 PASS이므로 제품 GO와 혼동하지 않는다. 보고서의 `qualificationStatus`는 두 경우 모두 NO_GO다.

## 비공개 조건의 한계

`predicate-check.mjs`는 SDK HTTP provider가 검사하는 합성 receipt 수준이다. 첫 행의 기간 내 795점과 둘째 행의 기간 밖 850점을 구성하고, 원본 바이트를 바꾸지 않은 선택적 가림에서 첫 행의 날짜/번호와 둘째 행의 점수만 보이게 했을 때 후보 regex가 통과한다. 이는 로컬 provider 경계의 결함 후보를 입증하며, 공식 attestor가 실제 TLS transcript에 서명했거나 서명이 위조됐다는 실험은 아니다. 기존 제품 전체 파서에 같은 문제가 있다고 일반화하지 않는다.

capture를 빼면 공개 claim의 extractedParameters에 점수·날짜·번호가 남지 않지만, 이 후보에서는 attestor가 조건 확인에 필요한 원문을 본다. params/context/URL/로그/calldata에 원문이 없는지까지 실제 새 증명으로 검사해야 한다. 단순한 `context.pass=true`나 서명된 임의 score는 조건 증거가 아니다. 고정된 원천 URL·메서드·응답 형식, 동일 행·동일 시험 결합, 기간·유효 상태와 소유자 연결을 함께 입증해야 한다.

## nullifier와 OPRF

고정 attestor-core 5.1.4의 `OPRF_OPERATOR_MAKERS`는 gnark만 제공하고 현재 수집은 STWO다. zk-symmetric-crypto 5.1.6 gnark loader는 Koffi 및 `${platform}-${arch}-libprove.so/libverify.so`를 요구하며 파일 URL을 문자열 치환한다. Windows native 배포·한글/공백 경로 로딩·실제 TOPRF 생성/검증은 별도 관문이다. 설치를 생략한 현재 환경의 차단을 모든 플랫폼에서 영구 불가능하다는 결론으로 바꾸지 않는다.

설치 SDK의 `binaryHashToStr`는 입력 길이에 맞춰 base64 출력을 자른다. 6문자는 최대 36bit다. 균등 독립 출력이라는 유리한 가정에서도 10만 개의 서로 다른 입력에서 생일 충돌 확률은 약 7.0%다. 이미 자른 문자열을 다시 256bit hash로 늘려도 충돌은 복구되지 않는다. 짧은 수험번호의 단순 공개 hash는 사전 추측에 취약하다. OPRF도 서버 질의 접근·속도 제한·키 보관/회전 정책이 필요하다.

공식 문서는 TOPRF의 일관된 은닉 식별값 목적을 설명하지만, 현재 YBM 경로의 서버 간 키 일치·재발급/다른 지갑 간 일치·키 회전 이후 일치·사업 범위 분리는 이번에 검증되지 않았다. 고정 `reclaim-toprf` domain만으로 CLEAR 반/사업 범위가 정해지지 않는다. 원천의 정규화된 시험 식별자와 충분한 출력 폭을 증명에 결합하고 `사업 범위 + 검증된 식별값`으로 중복을 검사해야 한다. 지갑/신청/발급시각을 nullifier 입력에 넣어 동일 시험을 다른 값으로 만들면 안 된다. 단순 hash 또는 새 CLEAR pass 서명은 해결안으로 채택하지 않았다. [공식 claim/TOPRF 설명](https://github.com/reclaimprotocol/attestor-core/blob/main/docs/claim-creation.md)

## 계약과 독립 취득

`BoundedAdapter.sol`은 새 계약의 경계 모델이다. 가짜 witness가 사실을 서명하는 fixture verifier이며 Reclaim verifier·privacy circuit을 구현하지 않는다. 증명 사실의 원천 결합을 이미 해결했다고 가정하지 않는다. 현재 금고의 sponsor/동의/TEST token/기한/회수 로직을 대체하는 제품 계약도 아니다.

모델은 등록된 learner가 proof owner를 위임하고, application·chain·contract·business scope·고정 recipient·source policy에 이를 결합한다. relayer는 수령인을 바꿀 수 없다. 정책/epoch/신선도/서명 변조·재청구와 다른 신청의 동일 제공 nullifier를 거부한다. 최초 등록·예치가 이미 허용됐다는 가정은 CLEAR 추가 지급 승인 제거와 별개다.

현행 `CourseRefundVaultV4.authorizeGrant`는 issuer ECDSA가 필수이며 EIP-1271 경로가 없다. 불변 계약의 설정 교체만으로 직접 증명을 받을 수 없고 새 동의·새 예치/이전 설계가 필요하다. 기존 예치를 자동 이동하지 않는다. 수집기는 `binding.mjs` authority 서명과 메모리 세션에 계속 의존한다. 따라서 CLEAR API를 끄고 이미 만든 자료를 제출하는 것과, 끈 상태에서 새 자료를 취득하는 것은 별도 관문이다. 후자는 공개 예치 record·고정 정책·참가자 owner 위임에서 request를 구성하는 수집 경로가 필요하며 아직 구현하지 않았다.

## 현재 verifier ABI·epoch 관찰

npm 공개 패키지 `@reclaimprotocol/verifier-solidity-sdk@1.0.4`의 `contracts/Reclaim.sol`은 `verifyProof(Proof) public view`이며 반환값이 없다. 2026-10-13 npm dist integrity는 `sha512-Kl7nyAtufxHKjp7tMrDe5Y0VWEtLSZi9offnhxRdfJ7exTzmRpdOVdPYiXToADrnPZb1ft49AlmIlke4T+sP7A==`다. 반면 Amoy 공개 proxy의 구현은 Sourcify exact-match ABI에서 `nonpayable returns(bool)`다. 반환 타입은 selector에 포함되지 않으므로 같은 함수명만 보고 ABI를 섞으면 안 된다. [공식 Solidity 안내](https://docs.reclaimprotocol.org/onchain/solidity/quickstart)

`verifier-readonly-report.json`은 RPC의 고정 블록에서 proxy/구현 code hash, epoch/witness, 공식 registry와의 겹침 및 Sourcify runtime 일치를 기록한다. 관찰된 구현의 verifyProof 본문은 성공 때 return문 없이 종료하여 false가 기본 반환되는 보관 실험과 일치한다. 일반적인 `require(verifyProof(...))`는 이 구현에서 성공을 거절한다. 동시에 모든 verifier에서 false를 성공으로 처리해서도 안 된다. ABI·코드 지문·의미를 배포별로 고정해야 한다.

관찰된 epoch 1의 시간 범위는 오래된 값이며 현재 registry의 모든 attestor가 그 epoch witness인 것도 아니다. 겹침은 새 proof의 호환성을 보장하지 않는다. 실제 proof의 서명자·epoch·선택 witness 및 정확한 ABI로 `eth_call` 성공을 확인해야 한다. 온체인 verifyProof는 원천 자격 판정기를 대신하지 않는다. source policy·epoch·시각은 애플리케이션에서도 제한해야 하며 proxy upgrade나 witness 변경 시 허용을 유지할지 거부할지 미리 결정해야 한다. [Polygon 공개 RPC 안내](https://docs.polygon.technology/pos/reference/rpc-endpoints)

## 다음 결정과 공수

먼저 같은 시험의 비공개 조건과 충분히 긴 안정 식별값을 실제 공식 경로에서 얻는 연구 관문이 필요하다. 현재 반례와 엔진 차이 때문에 이 기간을 확정 견적으로 만들 수 없다. 관문 통과 뒤에도 새 금고/동의·정책 검증·지갑 연결·독립 수집/청구·기한/회수·실행 중단·재발급 회귀에 집중 개발 약 10~15 작업일의 계획 여유가 필요하다. 기존 전체 목록과 시드 실데이터 연동은 별도 미해결 항목이다.

11월 7일까지 현재 정책을 모두 유지한 실서비스 전환을 확약할 근거는 없다. 현행 제품 개발과 분리된 합성 기술 시연은 가능하다. '기간 내 유효한 800점 이상 성적 하나/정액' 정책은 비교 후보일 뿐 PRD 변경이나 실제 지급 차단 해제가 아니다.
