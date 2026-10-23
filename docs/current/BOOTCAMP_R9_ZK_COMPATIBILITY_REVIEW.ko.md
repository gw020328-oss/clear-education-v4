# r9 ZK 검증 거부와 STWO 버전 호환성

2026-10-24. 기준 HEAD `36c9aed6370623a915e8eff858d96078da09f26b`. 새 실제 호스트·CA·로그인·수집·유료 AI·지급 없이 조사했다. r5~r9의 실행/실패/종료 자료와 기존 승인 지문을 보존한다.

## 확인된 사실

r9는 참가자 서명 수락과 계정 응답 검사를 통과했다. 66,901,446바이트 프레임 송신과 claim RPC가 완료됐고 SDK는 `ERROR_INVALID_CLAIM`을 반환했다. 안전 진단은 `REMOTE_ERROR_HINT / ZK_PROOF`, claim 없음·claim signature 없음·result signature 있음이다. 최초 실패는 `ACCOUNT_RETURN_VALIDATION / COLLECTOR_SIGNED_CLAIM`이며 외곽 `BC_REVISION_CONFLICT`가 원인은 아니다. 공식 계정 검증·인증서 수집·후속 AI·지급은 미도달했다. r8의 원인에 이 hint를 소급하지 않는다.

현재 5.1.4 SDK는 STWO를 enum 2로 보내고, 생성기가 반환한 binary proof를 protobuf bytes에 넣는다. 검증기는 해당 bytes를 base64로 바꿔 WASM에 넘기며 plaintext/ciphertext, nonce/counter를 외부 public input으로 공급한다. 5.1.6 verifier의 형식·개별 proof 크기·public input·STARK 실패는 모두 JavaScript `invalid proof`로 합쳐진다. 따라서 r9의 hint만으로 어느 내부 조건이 실패했는지 확정할 수 없다. [공식 SDK ZK 코드](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/utils/zk.ts), [공식 5.1.6 wrapper](https://github.com/reclaimprotocol/zk-symmetric-crypto/blob/394f777fa404ef184652b6efc5aa60884dd55c7e/js/src/stwo/operator.ts).

## 재현한 버전 불일치와 최소 수정

공식 crypto 5.1.7에는 [public input을 encryption trace에 결합하는 보안 수정](https://github.com/reclaimprotocol/zk-symmetric-crypto/commit/ec3974348444ad85adfe5e21c5152f69c7b93722)이 들어 있다. 직렬화되는 public input과 AIR/commitment 검증이 바뀌며 upstream은 prover/verifier WASM의 동시 갱신을 명시한다. JavaScript API와 engine enum은 그대로다. Cargo의 STWO revision `f117d487b39cd4441c2dbbdd7127b186f9c23564` 및 bincode 1.3도 같으므로 패키지 이름이나 엔진만 비교하면 이 차이를 놓친다.

| 생성기 → 검증기 | AES128 | AES256 | ChaCha20 |
| --- | --- | --- | --- |
| 5.1.6 → 5.1.6 | 통과 | 통과 | 통과 |
| 5.1.6 → 5.1.7 | 거부 | 거부 | 거부 |
| 5.1.7 → 5.1.6 | 거부 | 거부 | 거부 |
| 5.1.7 → 5.1.7 | 통과 | 통과 | 통과 |

[합성 시험과 실행 기록](../../spikes/stwo-compatibility/README.ko.md)은 공식 npm 무결성을 확인한 WASM으로 6개 증명을 생성하고 12개 조합을 검증했다. **버전 간 불호환은 재현했고, r9의 실제 서버 버전은 확인하지 못했다.** 과거 HR 성공 당시 정확한 런타임도 미확정이며 YBM SnarkJS 성공을 이번 결정 근거로 사용하지 않았다.

두 수집 prefix의 crypto를 **5.1.7 exact 직접 의존성**으로 고정한다. SDK 5.1.4의 공식 허용 범위 `^5.1.6` 안에 있으며 SDK·TLS0.1.4·STWO·concurrency1·총1회 정책은 유지한다. lockfile의 변경 노드는 root direct dependency와 해당 crypto 하나뿐이다. 이전 보안 결함의 회피와 새 공식 형식 채택이 변경 근거이며, r9 해결 확정은 아니다. 구형 verifier에 새 proof를 보내도 거부되므로 자동 fallback은 추가하지 않는다.

## 실제 수행 검증과 영향

5.1.6의 실제 crypto API에서 전체 AES 80바이트/ChaCha 128바이트와 tail7·다음 offset 검증을 통과했다. SDK 패킷 경로는 갱신 전후 각각 TLS1.2/1.3 × AES128/AES256/ChaCha의 6개 조합을 통과했다. 공식 TLS 암호화 → SDK `preparePacketsForReveal` → protobuf 왕복 → 다른 prefix의 공식 `verifyZkPacket`을 연결했다. 부분 가림·전체 가림 chunk 생략·마지막7바이트·TLS1.3 content type·offset·record number65537을 포함한다. 갱신 후에는 nonce/암호문/proof/숨겨진 plaintext 변조, 잘못된 offset, 해당 cipher의 잘못된 record number도 거부한다. 이 시험은 전체 TLS handshake 검증을 수행하지 않는다.

실행 지문은 두 prefix의 SDK·TLS·crypto 버전과 loader/WASM 등 15개 파일씩을 검사한다. SDK 위치에서 resolve한 crypto도 같은 5.1.7인지 검사해 중첩 구버전 잔존을 막는다. 공식 npm과 고정 Git source의 WASM SHA-256이 일치한다. 새 proof는 같은 합성 입력에서 약2~7KiB 늘었고 개별 WASM base64 상한8MiB 안에 있었다. 실제 전체 claim 크기를 예측하는 결과는 아니다. 기존 메시지100MiB·retained132MiB·deadline을 유지한다.

5.1.7이 proof에 직렬화하는 plaintext/ciphertext는 기존 public signals의 값이다. SDK는 가릴 ciphertext를 먼저 `*`로 바꾸므로 원래 비밀 plaintext/key를 새로 직렬화하는 변경으로 보이지 않는다. proof·원문 응답·쿠키·키·오류는 계속 저장하지 않는다. 기존 history SnarkJS/gnark resource는 5.1.6/5.1.7의 관련 commit에서 개별 blob까지 동일하며 해당 과거 성공 기록은 보존한다. Windows 진단의 기대 버전만 유지보수했고 Windows 제품 범위를 추가하지 않았다.

## 남은 가정과 다음 단회 시험

공개 source와 현재 원격 배포는 동일하다고 단정할 수 없다. 고정 server에는 독립 proof 검증 API가 없어 원격 확인에는 실제 TLS tunnel/claim이 필요하다. 이번에는 외부 claim 시험을 실행하지 않았다.

정상 TLS1.3 handshake→application counter reset과 SessionTicket 처리는 대응 source에서 일치했다. 실제 KeyUpdate를 걸치는 ZK packet은 TLS 측의 key/IV/counter reset과 server 측 단일 마지막 fixedIV·누적 counter가 어긋날 후보가 남는다. r9에서 KeyUpdate가 있었다는 증거는 없고 이를 고치기 위한 임의 TLS/검증 정책 변경도 하지 않았다.

최종 HEAD CI가 통과하면 본부 지시 하에 새로운 실제 1건을 시험할 수 있다. 수락 시에는 기존 독립 공식 서명·owner·요청 결합·최신성·pair·lease 검증을 모두 통과해야 한다. 다시 `ZK_PROOF`면 원격 WASM 형식/배포 지문 또는 key epoch/packet mapping을 확인해야 하며 같은 로그인을 반복하지 않는다. 원격이 새 형식이라는 확인 없이 실패를 다른 이유로 확정하지 않는다. 실행 승인이나 성공 기록은 이번 호환성 인수에 포함되지 않는다.
