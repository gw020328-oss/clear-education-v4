# B2b 제품 수집 연결·독립 검증 결과 단회 수락

2026-10-13, 오규원. [이슈 #18](https://github.com/gw020328-oss/clear-education-v4/issues/18), 선행 [B1 #16](https://github.com/gw020328-oss/clear-education-v4/pull/16)·[B2a #17](https://github.com/gw020328-oss/clear-education-v4/pull/17), 기준 develop `72b057ae736ac94ae3f7ac9818d2746897f2932e`.

**제품 세션과 합성 수집 driver를 연결하고, 별도 프로세스의 검증을 통과한 최소 시험 snapshot만 DB에 한 번 수락한다. 실제 YBM 수집·원천 완전성·자격/지급은 계속 차단한다.** 공식 공증자 검증을 구현했다거나 실제 제품 수집을 완료한 것으로 해석하지 않는다.

## B2a 차단 조건과 이번 선택

[B2a 원천 계약](EXAM_EVIDENCE.ko.md)은 독립적으로 인증된 전체 inventory의 pin을 요구한다. 현재 W02의 한 접수·성적 쌍은 전체 계정/시험/기간 포괄성, 모든 상태·페이지/종료·일관된 snapshot을 증명하지 못한다. 실제 YBM inventory를 신뢰할 방법도 미확인이다. 이 조건을 이번 구현에서 낮추지 않았다.

기존 W02 진단 수집기·공식 Attestor client·원천 정책·실제 성공 기록은 그대로 보존한다. 새 제품 경로는 `synthetic-product-proof.1` 전용이며 REAL_YBM/기존 진단 입력과 호출자 `verified:true`를 받지 않는다. 실제 HTML·기존 증명 두 건을 합성 manifest에 포장해 제품에서 사용하는 것은 금지한다.

합성 경로의 신뢰 근거는 서버 설정에 고정된 **합성 원천 공개 주소**다. 테스트에서만 별도로 만든 임시 원천 키가 전체 inventory manifest에 서명한다. 검증기는 이 서명을 검증한 다음에만 manifestHash를 B2a의 신뢰 pin으로 넘긴다. 사용자가 bundle과 함께 제공한 hash나 signer 주소를 신뢰하지 않는다. 이 키는 공식 YBM/공증자 키가 아니며 실제 원천의 완전성을 보증하지 않는다.

## 구성과 흐름

| 구성 | 책임 |
| --- | --- |
| [product-session.mjs](../../src/ybm-collector/product-session.mjs) | 새 owner 생성, B1 승인 세션과 owner 일치, 합성 driver 호출, owner 보유 서명, 서버 제출, 정상/실패/중단 정리 |
| [contract.mjs](../../src/product-proof/contract.mjs) | 전송 필드 허용 목록, 합성 원천·owner 서명 문맥, 독립 검증과 B2a 전체성 호출 |
| [independent.mjs](../../src/product-proof/independent.mjs) / [worker.mjs](../../src/product-proof/worker.mjs) | 제한된 별도 프로세스, 환경·입력 최소화, 타임아웃/중단/시작 실패·IPC 오류 처리, close 이후 결과 반환 |
| [proof-sessions.mjs](../../src/application/proof-sessions.mjs) | 최신 인증·세션·예치 재검사, DB 원자 단회 수락·멱등 영수증, 내부 검증 snapshot 조회 |
| [schema.sql](../../src/application/schema.sql) | schema 4, proof_results의 세션별 유일성·불변 결과 |

1. `createProductCollector()`가 메모리에 새 owner를 만든다. 반환된 ownerPublicKey로 B1 세션을 생성하고 수취 지갑이 B1 challenge를 승인한다. 사용자 지갑 승인을 수집기가 대신하지 않는다.
2. 수집기에 신뢰한 서버의 AUTHORIZED 세션 view, 합성 source driver, 서버 제출 함수를 제공한다. driver profile·세션/owner·만료를 수집 전에 확인한다. 실제 Chrome이나 YBM/공증자 연결은 열지 않는다.
3. driver는 B2a bundle과 합성 원천 서명만 반환한다. 수집기는 임의 필드와 다른 binding을 거부하고, 전체 제출 원천 envelope에 세션 owner로 서명한다. driver에는 owner 개인키·로그인 token을 전달하지 않는다.
4. 서버는 본인 참가자·동일 로그인 세션·CSRF·지갑/체인·현재 B1 승인·허용 원천 정책/서버 키를 확인한다. 입력을 엄격히 검사하고 분리된 사본으로 고정한다. 요청 데이터가 await 중 변경돼도 검증/저장할 제출은 바뀌지 않는다.
5. 별도 검증 프로세스가 합성 원천 서명, B1 owner 공개키에 대한 보유 서명, B1 typed binding, 정책/기간/신선도·B2a 전체성을 검증한다. 성공하더라도 실제 proofVerified는 false다.
6. 서버는 검증 프로세스 종료 후 현재 체인·예치·제출 기간을 다시 읽는다. SQLite 쓰기 lock은 이 대기 동안 보유하지 않는다.
7. DB transaction 안에서 로그인/세션·취소/만료·신청/예치·원천 정책·관측 신선도·요청 중단을 재검사한다. 세션별 결과 한 건과 최소 snapshot을 한 번에 저장한다. B1 승인 nonce를 다시 소비하지 않는다.

B1의 `ISSUED/AUTHORIZED/CANCELLED/EXPIRED` 상태는 유지한다. `ACCEPTED_SYNTHETIC`은 별도 결과 영수증 상태이며 자격 판정·시험 중복 예약·grant 발급이 아니다. 같은 시험을 다른 제품 세션에 제출하는 것은 B4의 nullifier/중복 예약 책임이며 이번 세션별 단회 수락으로 해결됐다고 주장하지 않는다.

## 서명과 전송 계약

서버 설정은 `createApplicationService({..., proofSourceSigner})`의 공개 주소 하나다. 기본 null이면 제품 증거 수락을 차단한다. 주소는 정규화하고 DB 환경 설정에 고정한다. HTTP 입력·환경 변수의 임의 키·결과에 딸린 signer 주소로 바꾸지 않는다. private key는 서버 설정/DB에 넣지 않는다. 기존 C1의 기본 정책/설정은 이 기능을 자동으로 켜지 않는다.

제출 객체는 정확히 `{profile, bundle, sourceSignature, ownerSignature}`다. profile=`synthetic-product-proof.1`, bundle은 B2a `{manifest,pages}`이며 모든 중첩 필드도 허용 목록을 검사한다. 두 서명은 65바이트 hex다.

- sourceSignature: EIP-191 `signMessage(getBytes(hash({purpose:'CLEAR_SYNTHETIC_SOURCE_INVENTORY_V1', manifestHash:hash(manifest)})))`.
- ownerSignature: EIP-191 `signMessage(getBytes(hash({purpose:'CLEAR_PRODUCT_OWNER_POSSESSION_V1', sourceHash:hash({profile,bundle,sourceSignature})})))`.
- `hash`는 기존 canonical JSON→keccak256이다. 다른 서명 용도의 도메인 문자열과 구분한다. manifest는 B1 bindingDigest를 통해 신청/지갑/정책/runtime/세션/nonce/owner/만료 및 chain/vault/instance를 결합한다.
- 원천 서명은 전체 manifest와 그 안의 페이지 지문을 인증한다. owner는 공개키 문자열만 제공하는 것이 아니라 대응 개인키로 제출에 서명해야 한다. 서명 검사 뒤 B2a가 모든 페이지/상태/기간을 대조한다.

합성 원천이 거짓 inventory에 서명하면 이 경로는 그 거짓을 알아낼 수 없다. 실경로에는 공식 원천 인증과 실제 포괄성 확인이 별도로 필요하다. B2a의 account-scoped examKey/subjectRef를 실제 개인정보·시험 nullifier로 자동 승격하지 않는다.

## 독립 검증·민감정보 수명

입력 body는 최대 64 KiB다. worker IPC는 신뢰한 정책의 최대 10,000개 강의 ID를 포함하므로 1 MiB 상한이며 이를 초과하면 잘라서 처리하지 않고 거부한다. 서버 프로세스별 검증 자식은 최대 4개, 각 30초다.

부모는 정책·공개 B1 세션의 필요한 필드·서버 고정 원천 주소·최소 제출·서버 시각만 전송한다. 로그인 token/CSRF/최종 동의 서명/체인 관측은 전달하지 않는다. 원문 HTML·쿠키·개인키·transcript·unsigned 추출 사본·verified flag의 추가 필드는 IPC 전에 거부한다. 허용된 필드에 악의적으로 비밀을 인코딩하는 임의 내부 코드를 탐지하는 보장은 아니다.

worker는 PATH/LOG_LEVEL만 상속하며 stdout/stderr는 버린다. Node 권한으로 src/node_modules/package.json 이외의 파일 읽기, 파일 쓰기·자식 실행·addon·worker thread를 허용하지 않는다. 고정 worker에서 net connect·DNS lookup·UDP·fetch도 차단한다. 이는 감사된 고정 검증 코드에 대한 방어이며 OS 전체 네트워크 격리나 악성 런타임 sandbox를 보증하지 않는다. Node 24의 권한 기능만으로 네트워크가 격리된다고 주장하지 않는다.

성공/실패 메시지는 한 번만 받으며 정상 종료와 **close**를 확인한 뒤 반환한다. 시작 실패(error/close만 발생), 동기·비동기 IPC 실패, 중복 메시지, 시간 초과/AbortSignal에서는 실패로 처리하고 실행 중 자식을 종료한다. 실패 응답은 `PRODUCT_VERIFICATION_FAILED` 고정 코드이며 원문/서명/개인정보·worker 오류를 반환하지 않는다.

수집기는 원문 제출을 기존 RawProofMemory에 잠시 보관하고 종료 경로마다 Buffer를 0으로 덮어쓰고 staging을 해제한다. 세션 만료·외부 중단·collector.close는 진행 중 작업을 중단하고 source.close를 기다린다. source driver는 close에서 보유한 자원/작업을 종료해야 하는 신뢰한 내부 구현이다. owner와 envelope 참조는 해제하며 같은 collector/owner를 재사용하지 않는다. JS/IPC 문자열 복사·SDK 메모리·OS swap의 완전 삭제 보장은 아니다.

이 합성 제품 경로는 프로필·HTML·쿠키 파일을 만들지 않는다. 기존 실제 Mac 프로필의 종료/재시작 정리 경로는 변경하지 않는다. 실제 수집을 켜기 전에는 관리형 저장 경계·수집 adapter·공식 원천을 다시 검증해야 한다.

정상 수락 뒤 source.close가 실패하거나 응답이 유실되면 클라이언트 오류와 DB 수락이 함께 존재할 수 있다. 오류를 보고 미수락으로 단정하지 말고 GET result로 확인한다. cleanup 실패를 성공으로 숨기지 않으며, commit된 영수증을 클라이언트 오류 때문에 되돌리거나 두 번째 결과로 덮지 않는다.

## DB·단회 수락·재시도

schema 4는 v1/v2/v3의 로그인·신청·금고·B1 세션/소비 기록을 보존하면서 proof_results를 추가한다. 환경이 일치하는 경우 한 transaction으로 이관한다. proofSourceSigner는 첫 schema 4 생성/이관 시 고정되며, null도 고정값이다. 이후 키 변경/활성화를 동일 DB의 설정 수정으로 우회하지 않는다. 키 회전·운영 전환은 별도 설계이며 기존 DB/체인 reset으로 해결하지 않는다.

schema 3 이상에서 proof_sessions가 없거나 schema 4에서 proof_results가 없으면 시작을 거부한다. 환경 불일치·알 수 없는 버전은 거부하며 이관 DDL도 rollback한다. 구버전 앱과 같은 DB를 동시에 열지 않는다.

proof_results는 proofSessionId PK로 세션당 하나이며 submissionHash, snapshotHash, verifierVersion, sourceSigner(공개), acceptedAt, observedAt, 최소 snapshot, 수락 때 체인 관측만 저장한다. raw bundle/manifest·source/owner 서명·개인키·쿠키를 저장하지 않는다. 결과 UPDATE는 DB trigger로 막는다. 시험별 개인정보 최소 저장/보존 운영을 실제 데이터에 적용하는 일은 아직 승인·검증되지 않았다.

- 첫 수락은 독립 검증 후 30초 안에 완료하고, 원천 observedAt은 현재보다 미래가 아니며 최대 300초 전이어야 한다. 체인 관측도 B1의 30초 상한과 현재 제출 기간 조건을 따른다.
- 동일 canonical 제출은 기존 영수증만 반환한다. 동시 두 프로세스도 한 레코드로 수렴한다. 다른 제출은 PRODUCT_RESULT_CONFLICT이며 기존 결과를 덮지 않는다.
- 이미 수락된 동일 제출 재시도도 현재 로그인·동일 세션·취소/만료·현재 예치/체인을 검사한다. 다만 과거 영수증 반환은 원천 관측의 300초를 갱신하거나 새 검증으로 취급하지 않는다.
- 내부 `getAcceptedExamSnapshot`은 최신 로그인/세션·체인을 다시 검사하고 observedAt 300초 및 저장 snapshot 지문을 확인한 뒤 불변 사본을 반환한다. HTTP로 시험키·점수를 제공하지 않는다. B4의 발급 transaction/시험 중복/체인 검사 책임을 대신하지 않는다.
- 외부 검증/RPC 동안 logout/cancel/expiry/예치 변경 또는 HTTP 연결 중단이 발생하면 commit 전에 차단한다. commit 이후 연결이 끊긴 경우는 위 영수증 복구 절차를 따른다.

## HTTP와 F4 인계

기존 동일 origin HTTPS, Secure/HttpOnly 쿠키, 지갑·체인 헤더, POST CSRF 및 64 KiB 제한을 유지한다.

| 메서드·경로 | 요청 | 응답 |
| --- | --- | --- |
| POST `/applications/:id/proof-sessions/:sid/evidence` | 위 최소 서명 제출 객체 | ACCEPTED_SYNTHETIC 영수증, 동일 제출 멱등 |
| GET `/applications/:id/proof-sessions/:sid/result` | 없음, 본인 신청 | NOT_ACCEPTED 또는 과거 수락 영수증 |

영수증은 proofSessionId, state, submissionHash, snapshotHash, acceptedAt(epoch 문자열), verifierVersion, dataMode=SYNTHETIC, liveSupported=false, collectionEnabled=false, proofVerified=false, paymentAllowed=false다. NOT_ACCEPTED는 ID/상태/위 flags만 포함한다. GET result는 다른 로그인에서도 본인 과거 수락을 확인할 수 있고, 취소/만료 뒤에도 이 과거 사실을 보존한다. 현재 자격/청구 가능성을 뜻하지 않는다.

409: PRODUCT_RESULT_CONFLICT, PRODUCT_AUTHORIZATION_REQUIRED, PRODUCT_RESULT_MISSING, PRODUCT_VERIFICATION_STALE, PROOF_SOURCE_INCOMPLETE 및 기존 예치/상태 오류. 422: PRODUCT_VERIFICATION_FAILED/필드·서명 오류. 429: PRODUCT_VERIFIER_BUSY. 413: 본문/IPC 크기 제한. 기존 인증/Origin/CSRF 오류와 410 만료 규칙도 유지한다. 상세 검증 실패 원문은 반환하지 않는다. 기존 브라우저 adapter의 오류 축약과 proof 서명/수집 UI는 F4 후속이다.

`/verified`, `/consume`, `/callback`, `/snapshot` API는 없다. accepted=true 같은 클라이언트 선언을 받지 않는다. F4는 지갑 승인, 합성 결과 수락, 실제 원천 미확인, 자격/권한 발급을 구분해야 한다. B3의 학습 snapshot이나 B4/B5 grant/outbox를 구현하지 않았다.

## 검증·재현

```sh
./tools/npm run test:product-proof
./tools/node --test tests/product-proof/*.test.mjs tests/exam-evidence/*.test.mjs tests/proof-sessions/*.test.mjs tests/application/*.test.mjs tests/vault/*.test.mjs tests/dev/*.test.mjs tests/policy/*.test.mjs
./tools/npm run verify:dependencies
./tools/npm run verify:workspace
```

합성 원천/owner 서명 변조, 페이지·binding·신선도·불완전 목록, 신뢰 설정 미구성/불일치, caller mutation, IPC 비밀 필드 거부, 실제 자식 시작 실패/시간 초과/중단/close, 수집 staging 정리·cleanup 실패·중단, loopback HTTPS 경계·연결 종료, RPC 중 인증/취소/만료/예치 재검사, 재시작·동일/다른 결과 별도 프로세스 경쟁, commit 전/후 SIGKILL 복구, schema 이관/rollback/유실·신뢰 변경 거부를 검사한다.

별도 DB 경쟁 worker의 체인 reader는 실제 합성 EVM에서 얻은 고정 관측을 사용해 DB 원자성을 분리 검사한다. 서명/B2a 검증은 실제 새 검증 자식에서 수행한다. commit 전 crash 시험은 합성 최소 결과 row를 직접 삽입한 미완료 transaction을 중단하며, 정상/commit 후 시험은 실제 수락 메서드를 사용한다. 기존 B1 EVM 거부 시험과 합성 체인의 현재 정산 거부 시험을 함께 유지한다.

실제 계정·원본 증명·기존 DB/체인/키는 읽거나 변경하지 않았다. 최신 실행 수·공개 이력 검사·CI와 병합 여부는 연결 PR의 정확한 head를 확인한다.

2026-10-13 로컬 검증: B2b 47개를 포함한 제품/정책 회귀 414개, 기존 YBM 합성 수집기 153개, Mac 저장·복구 44개로 총 611개 통과(실패/skip 0). 의존성·원본/legacy 191개와 공개 참고 문서 4개 보존 검사도 통과했다. 실제 원천 검증 결과는 추가되지 않았다.
