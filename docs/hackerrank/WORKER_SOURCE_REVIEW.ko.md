# C2 관리형 동일 응답 원천 검증

2026-10-22. 본부가 설치 SDK5.1.4의 응답 종료 → `updateProviderParams(tunnel.transcript)` → 동일 transcript 가림/증명 → `claimTunnel` 순서와 기존 process-local lease 경계를 읽고 승인한 구현이다. 현재 MVP는 신뢰하는 CLEAR worker를 사용한다. **공증 서명만으로 숨긴 JSON 전체 구조를 증명하거나 CLEAR 없는 독립 청구를 제공하지 않는다.**

## 책임과 계약

| 책임 | 구현/결과 |
| --- | --- |
| 정확한 self 경로, 전체 JSON 문법/decoded 중복키, 계정 사본 일치, 같은 인증서 행/선택/유일성 | 같은 실제 SDK TLS transcript를 검사하는 관리형 CLEAR worker |
| 최소 공개 필드의 원천 바이트 및 CLEAR 요청 context | 기존 공식 공증 서명 검증 |
| 참가자/신청/지갑/owner/nonce/시간·최종 current 및 영속 소비 | 기존 수집기와 API의 검증/원자 수락 |

recipe/sourceVersion은 `hackerrank-two-proof.3`, recordShape는 `worker-selected-certificate-fields.1`이다. request와 candidate는 `.1`, `pins/collectLease/close` 및 genuine candidate lease 계약은 유지한다. candidate.verification에 다음 세 필드가 추가된다.

```json
{"structureValidation":"TRUSTED_WORKER","disclosedFieldValidation":"ATTESTOR","independentStructureProof":false}
```

이는 단순 설정 표시가 아니라 두 서명과 private worker provenance가 모두 검증된 candidate에만 붙는다. 합성 데이터는 여전히 `SYNTHETIC_FIXTURE`/`MOCK_VERIFIED`이며 live 소비자로 전달할 수 없다. bare proof/브라우저 flag/이전 진단 결과는 worker provenance를 만들지 못한다. 상태만으로 지급 허용을 켜지 않는다.

## 같은 응답 검사와 최소 공개

[`worker-source.mjs`](../../src/hackerrank-evidence/worker-source.mjs)는 live에서 공식 SDK 호출과 callback을 직접 소유한다. 테스트 driver/clock은 합성 모드에서만 허용한다. callback은 한 번만 가능하며 `{params:{},secretParams:{}}`만 반환한다. URL/method/recipe/request/context는 변경하지 않는다. 완료 후 정확한 params/providerHash/owner/4개 CLEAR context와 추출 필드를 비교하고, role/request/config/최종 proof에 결합된 private WeakMap handle을 만든다. 수집기 내부에서만 사용하고 success/failure finally에서 폐기한다. hook 누락·재호출·중도 실패·늦은 callback·다른 proof/role/request는 거부한다. 공증 서명 검증은 기존 collector/verifier가 별도로 수행한다.

[`worker-response.mjs`](../../src/hackerrank-evidence/worker-response.mjs)는 다음을 검사한다.

- 같은 transcript의 client 요청 바이트가 고정 params와 해당 URL 쿠키로 만든 SDK 요청과 정확히 일치한다. TLS1.2/1.3과 현재 고정 SDK protocol만 허용한다.
- HTTP200, 지정 MIME/UTF-8, identity encoding, 유일한 주요 헤더, 정확한 content-length 또는 엄격한 chunk framing을 검사한다. SDK HTTP parser가 해석한 body와도 대조한다. SDK가 공개하는 상태줄/content-type/date/chunk framing에는 임의 확장 정보가 들어갈 수 없도록 제한한다.
- account는 1MiB/depth48/node32768 안에서 전체 NEXT_DATA JSON을 검사한다. script가 유일하고 `props.pageProps.prefetchedData.profile.username`과 정확히 하나인 cache `queryKey:["prefetchData"]`의 `state.data.profile.username`이 일치해야 한다. 공개는 direct profile의 username 필드 쌍 하나다.
- certificate는 64KiB/depth24/node4096/32행 안에서 전체 body.data를 검사한다. 모든 행 계정이 서명 검증된 account와 같고 ID가 유일해야 한다. Python/Basic/python_basic은 같은 행의 metadata여야 한다. 명시 선택이 없으면 target은 하나여야 한다. certificate.unique_id=test_unique_id라는 미확인 조건은 추가하지 않는다.
- 공개 필드는 같은 selected row의 id, attributes.username/status, certificate.label/level/track_slug 6개다. 원문 전체 공개나 모든 metadata 공개는 하지 않는다. SDK 자체 redaction/receipt 추출을 먼저 실행해 private 필드와 정확히 비교하고 나서 proof 생성으로 돌아간다. nested decoy가 첫 regex를 가로채면 공개 전에 실패한다.

[`source-json.mjs`](../../src/hackerrank-evidence/source-json.mjs)는 전체 문법·decoded 중복/위험 key를 검사하고 미사용 숫자는 값으로 해석하지 않는다. signed params/context/request의 기존 strictJson은 그대로다. [`source-records.mjs`](../../src/hackerrank-evidence/source-records.mjs)의 같은 행 projection은 `.2`와 `.3`이 공유한다.

원문·쿠키는 메모리 범위다. 우리 소유 byte 사본은 finally에서 덮어쓰고 문자열/객체 참조는 해제한다. SDK 원본 transcript는 SDK가 증명을 만들 때까지 유지해야 하므로 hook이 수정/삭제하지 않는다. JavaScript GC·swap의 물리적 완전 소거 보장은 아니다. 원문/쿠키/개인 식별 필드/claim은 로그·candidate·API·체인에 저장하지 않는다. 기존 관리형 worker 종료/프로필 삭제 정책을 유지한다.

## 로그인 전 신뢰 준비와 호스트 인수

[`loadManagedHackerRankTrust`](../../src/hackerrank-evidence/worker-trust.mjs)는 locked worker가 명시적으로 호출할 때만 기존 YBM public registry loader를 재사용한다. 공개 인수는 `{audience, privacyKeyId, signal?}`이며 cookie/key/claim을 받지 않는다. 결과는 독립 registry signer 1..16개, epoch1, 고정 worker recipe, 30분 수명과 `sourceReview:TRUSTED_WORKER_TRANSCRIPT_REVIEWED`, `contextReview:SIGNED_REQUEST_CONTEXT_REQUIRED`다. context의 REQUIRED는 실제 서버 성공을 미리 주장하지 않는 표현이며 서명 검사를 생략하지 않는다. `managedWorkerTrust`는 이미 독립적으로 얻은 주소를 조립하는 신뢰 host 전용 순수 함수다. 요청 body나 claim의 signer로 설정하지 않는다.

이 함수 추가는 실행 승인이나 실제 registry 조회가 아니다. pending-trust.json은 UNCONFIGURED이며 기본 CLI도 자동 활성화하지 않는다. 공식 공개 서버 소스의 epoch/context 근거는 [기존 검토](PREPARED_SOURCE_REVIEW.ko.md)에 있으며, 실제 배포 응답이 맞지 않으면 실패한다.

API 담당 인수 순서:

1. 실제 호출 조율 뒤 locked worker 안에서 registry trust를 고정한다. 호스트가 보유한 privacyKeyId에 맞는 commitmentKey를 사용한다.
2. `withManagedHackerRankSource`가 같은 client/route/새 관리형 Chrome을 소유하고 ready를 기다린다.
3. callback 안에서 source.pins로 **새** 불변 mapping을 만든다. 동일 source를 openLiveContext에 넘기고 기존 signRequest(message) 포트로 참가자 승인을 받는다.
4. 새 요청으로 두 증명을 검증해 genuine lease를 소비한다. 자동 양측 동의/지급은 이 원천 모듈의 책임이 아니다. callback 반환 전 소비를 마친다.
5. 모든 경로에서 source/lease/transport를 닫고 바깥 worker가 stopRecordedBrowser → removeSession을 수행한다.

기존 v6/36개 source 지문은 덮어쓰지 않는다. 다음 intake는 기존 의존 목록에 더해 아래 HR 모듈의 새 내용과 전이 의존성을 고정해야 한다. 이 PR은 API/AI/Moodle/금고/공통 workflow를 수정하지 않는다.

```text
src/hackerrank-evidence/collector.mjs
src/hackerrank-evidence/verifier.mjs
src/hackerrank-evidence/recipes.mjs
src/hackerrank-evidence/source-json.mjs
src/hackerrank-evidence/source-records.mjs
src/hackerrank-evidence/worker-response.mjs
src/hackerrank-evidence/worker-source.mjs
src/hackerrank-evidence/worker-trust.mjs
src/hackerrank-evidence/prepared-source.mjs
src/hackerrank-evidence/managed-source.mjs
src/hackerrank-evidence/browser-source.mjs
src/hackerrank-evidence/request.mjs
src/hackerrank-evidence/values.mjs
src/hackerrank-evidence/package.json
src/hackerrank-evidence/package-lock.json
src/ybm-collector/trust.mjs
```

기존 policy values/specs 및 YBM client/route/Mac 저장 경계도 전이 의존성이므로 기존 intake에서 유지한다. 위 목록은 이 변경의 추가 점검 범위이며 전체 실행 파일의 완전 목록이라는 뜻이 아니다.

## 검증과 실제 시험의 남은 조건

새 worker/source-trust 시험은 고정 Node24.21.0 + network guard에서 19/19 PASS다. TLS1.2/1.3, content-length/chunked, 64KiB보다 큰 private account, 명시 선택/NOT_MET, source/params/context/signature 변조, hook 미실행/재호출/실패, decoded duplicate/cache/row decoy, framing 개인정보 노출, 만료/취소, naked/위조/disposed handle 거부를 포함한다. 실제 공식 SDK의 redaction/추출을 사용하지만 HTTP 본문·공증 서명은 합성이다. 원격 기존 HR 검사는 layout 계열만 실행하므로 이 새 검증을 원격 실행한 것으로 표시하지 않는다.

최종 관련 회귀는 verifier/collector/prepared-source/managed-source/source-records/worker-source/worker-trust/integration-vector 합계 **135/135 PASS**, 실패0이다. 기존 공개 integration-vector 내용은 변경하지 않았다. 변경 문서 상대 링크와 diff 공백 검사도 확인한다. 원격 CI와 공개 이력 검사의 정확한 head별 결과는 PR103 기록을 따른다.

새 실제 로그인·증명·API 수락·registry 조회·유료 호출은 0이다. 실제 응답이 현재 source path/metadata/헤더/가림과 일치하는지와 hosted signer/context 성공은 첫 새 증명 시험에 남아 있다. API 새 intake/호스트 배선 및 다른 실제 원천 준비를 본부가 함께 확인한 뒤, 사용자에게 **관리형 Chrome의 본인 HackerRank 로그인 → 준비 완료 한 번 → 같은 신청의 참가자 승인**을 한 곳에서 안내한다. 비밀번호·쿠키·옛 proof를 대화로 받거나 재사용하지 않는다.
