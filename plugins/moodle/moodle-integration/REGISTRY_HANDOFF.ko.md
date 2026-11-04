# 기관 신뢰 registry — 합성 인수 경계

입력 C head는 `f1bff532fa9b780e34661d159358c8e8b2492611`, 고정 B 계약은 `210a739e1d8a2b8e7af2ef894b9309c1352b5a14`다. 이번 변경은 `plugins/moodle/moodle-integration/**`에 한정한다. 권장 Astra/High, 실제 실행 Astra. 모든 키는 공개된 합성 fixture 문자열에서 파생되며 실제 기관 키·credential·로그인·서명·운영 활성화를 사용하지 않았다.

## 구현과 권한 주체

`registry.php`는 owner 측 control-plane 후보이며 Moodle HTTP endpoint에서 import하지 않는다. 기존 `clear_probe.attempts`와 authority fence를 재사용한다. `registry_install.php`는 폐기 가능한 설치에 다섯 owner-only 표를 더한다. runtime/reader에는 새 쓰기 권한을 주지 않는다. 운영 DB migration은 아니다.

| 주체 | 승인하는 내용 | 서명만으로 할 수 없는 일 |
| --- | --- | --- |
| 오프라인 인수 담당자 | root public key/ref, issuerEpoch, installationRef, audience 및 외부 course/subject ↔ 내부 user/course/module 매핑 | 신뢰하지 않는 응답이나 공개 키 URL에서 root를 자동 획득하지 않음 |
| 고정 root 서명자 | controlRevision·trustEpoch와 활성 서명 키의 기간/회전/철회 | 현재 설치의 issuer/installation/audience 변경, 과거 revision/epoch 복원 |
| 활성 기관 서명자 | 승인된 매핑의 roster 상태/revision, 사전 준비된 B attempt의 정확한 tuple | 새 내부 사용자 매핑 추가, root 교체, B pending 생성, confirmation 발급 |
| 인증된 B control-plane 구성요소 | C owner 측 `stage()`에 정확한 예상 attempt tuple 전달 | 브라우저 입력을 승인된 subject/course/scope로 승격하지 않음 |
| Moodle 확인 action | 기존 native session·권한·sesskey·명시 동의 검사 후 confirmation 발급 | registry 서명을 사용자 동의로 해석하지 않음 |

fixture는 기존 공개 owner 연결을 사용한다. 운영 importer의 최소 권한 DB 역할·자격 증명·격리된 서비스 composition은 별도 인수 대상이다. DB owner와 오프라인 매핑 관리자는 신뢰 주체다. 임의 owner SQL이나 기존 `attempt_fixture.php`는 시험 전용 우회 경로이며 서명을 검증했다고 간주하지 않는다. 운영 경로에서는 검증된 importer만 attempt를 쓸 수 있도록 구성해야 한다.

## C/B 입력 계약

현재 B `.3` DTO는 변경하지 않았다. 신규 `clear-registry-envelope.1`은 제안된 control-plane 포맷이며 운영 표준 채택을 주장하지 않는다. B/common 구현은 본부 배정 전까지 수정하지 않았다.

| 단계 | 입력·정본 | C 처리 |
| --- | --- | --- |
| 승인 매핑 | 기관 및 CLEAR 담당자가 함께 승인한 issuer/installation/audience/course/subject와 내부 IDs | offline installer에서 고정. 원격 assertion에 내부 ID를 넣으면 거부 |
| B pending | 서버가 검증한 attemptRef, bindingScopeHash, issuerEpoch, installationRef, courseRef, subjectRef, audience, rosterRevision, trustEpoch, notBefore, expiresAtExclusive | `stage()`가 현재 키·roster·기간을 확인하고 `registry_pending`에 OPEN으로 한 번만 저장 |
| 기관 attempt assertion | 위 expected tuple 전체와 `type: attempt`에 대한 활성 키 서명 | canonical bytes까지 pending과 exact 비교. 검증 후 기존 attempts INSERT + pending USED + digest receipt를 한 transaction으로 commit |
| 기존 사용자 확인/조회 | 기존 confirmationRequest/observationsRequest `.3` | 변경 없음. 확인은 사용자 action에서만 mint하고 조회는 mint하지 않음 |
| 기존 B 소비 | 기존 `.3` confirmation의 registry scope·epoch·revision·신선도 | 변경 없음. 실제 signed-registry 기반 Moodle DTO를 고정 B validator에 통과시킴 |

B attempt DTO의 `expectedSubjectRef`를 control-plane의 `subjectRef`로 넘기는 책임은 인증된 구성요소에 있다. `.3` requestRef는 요청/응답 상관관계이며 기관 assertion의 authority나 nonce를 대신하지 않는다. consumed attemptRef는 다시 stage할 수 없다. 현재 후보는 설치 하나/issuer 하나/audience 하나와 서명 키 하나를 활성화하는 보수적 profile이다. 여러 기관을 같은 table head에 섞지 않는다.

## 서명 wire

Envelope exact fields는 `version`, `keyRef`, `payload`, `signature`다. payload는 canonical JSON **문자열**, signature는 Ed25519 64-byte 서명의 소문자 hex다. publicKey는 32-byte 소문자 hex다. 가변 alg, key URL, 원격 인증서 검색은 없다. envelope ≤16 KiB, payload ≤8 KiB이며 exact key 집합, ASCII opaque ref 1–128자, 정수 1..9007199254740991을 요구한다. 숫자 문자열·float·추가 필드·중복 JSON 키·비정규 JSON byte는 거부한다.

canonical JSON은 ASCII field 이름을 오름차순 정렬하고 공백 없이 JSON 인코딩한다. payload는 아래의 평면 객체만 허용한다. ref와 hex 필드의 제한 때문에 Unicode/escape/객체 중첩 해석 차이를 허용하지 않는다. envelope도 같은 정규화 후 원본 byte와 일치해야 한다.

서명 메시지는 `CLEAR\0REGISTRY\0ED25519\0V1\0` + keyRef byte length의 unsigned big-endian 4 bytes + keyRef ASCII bytes + canonical payload UTF-8 bytes다. 버전·용도 구분과 key selector를 서명에 결합한다. 실제 검증은 [PHP Sodium Ed25519 detached verification](https://www.php.net/manual/en/function.sodium-crypto-sign-verify-detached.php)을 사용한다. 공개 합성 fixture는 [seed keypair API](https://www.php.net/manual/en/function.sodium-crypto-sign-seed-keypair.php)로 재현하며 운영 키 생성 방식이 아니다. private key·seed·원본 서명은 receipt 표에 저장하지 않는다.

공통 payload fields: `type`, `issuerEpoch`, `installationRef`, `audience`, `trustEpoch`, `notBefore`, `expiresAtExclusive`.

| type | 추가 exact fields | 서명자·의미 |
| --- | --- | --- |
| trust | controlRevision, keyRef, publicKey, keyNotBefore, keyExpiresAtExclusive, status | pinned root. status ACTIVE/REVOKED. 새로운 keyRef/publicKey에는 더 높은 trustEpoch 필요 |
| roster | courseRef, subjectRef, rosterRevision, status | 활성 기관 키. 승인된 기존 매핑만 수정하며 revision은 epoch가 바뀌어도 반드시 증가 |
| attempt | courseRef, subjectRef, rosterRevision, attemptRef, bindingScopeHash | 활성 기관 키. 현재 roster/epoch와 B pending 전체가 정확히 일치해야 함 |

기간은 `notBefore ≤ DB clock < expiresAtExclusive`다. attempt의 window는 최대 120초, control/roster는 최대 86400초의 **합성 정책**이다. control은 key 유효기간 안에, roster는 control/key 안에, attempt는 control/key/roster 안에 있어야 한다. B와 기관이 운영 시간 정책·시계 오차를 승인하기 전에는 이 값을 운영 기본값으로 사용하지 않는다.

## 회전·철회·재사용 방지

- controlRevision은 매번 증가하고 trustEpoch는 감소할 수 없다. 새 서명 키는 더 높은 epoch가 필요하다. 이미 쓴 keyRef 또는 publicKey를 다시 활성화하거나 다른 selector로 재사용하지 않는다. 철회된 키는 더 높은 controlRevision으로도 되살릴 수 없다. root anchor 자체의 회전은 오프라인 재인수 대상이며 이 API로 하지 않는다.
- 모든 trust 변경은 기존 roster를 비활성화하고 attempts를 REVOKED로 바꾼다. 새 키에는 더 높은 rosterRevision이 다시 필요하다. roster 변경은 해당 course/subject의 이전 attempts를 철회한다. 정상 복구 후에도 이전 attempt/confirmation은 다시 유효해지지 않는다.
- authority를 먼저 배타 잠금한 뒤 registry head/pending/binding을 읽고 서명을 검증한다. 실제 mint의 authority SHARE lock과 직렬화한다. accepted receipt, pending 소비, attempt 등록과 철회는 같은 transaction이다. lock timeout은 fail-closed이며 잠금 획득 후 및 commit 직전에 만료를 다시 검사한다. caller의 열린 transaction에는 참여하지 않는다.
- runtime/reader는 신규 registry와 attempts를 INSERT/UPDATE/DELETE/TRUNCATE할 수 없다. raw signature 대신 envelope SHA-256, 종류, acceptance 시각만 receipt에 남긴다. 신규 표 변경도 기존 authority trigger에 참여한다.
- 현재 DB 내 revision/epoch floor·소비/tombstone은 영속 상태다. **전체 DB를 과거 backup으로 되돌리는 공격/복구까지 탐지하는 외부 witness는 구현하지 않았다.** 운영 복구 시 별도 승인된 deployment/trust floor와 현재 root/key/roster 상태를 대조하고 모든 기존 확인을 폐기하는 절차가 필요하다. 신뢰할 수 있는 DB 시계도 전제다. 상태 정리로 floor나 소비 이력을 되돌리지 않는다.
- 이미 시작된 RR 관측은 기존 snapshot을 유지한다. 철회 이후 새 조회/발급은 차단되며 기존 5초 관측 제한과 B 최종 currentness가 적용된다. 원격 기관 철회와 CLEAR commit의 전역 원자성을 제공하지 않는다.

## 기관 담당자가 제공·승인할 인수 자료

| 입력 | 담당·확인 근거 | 이번 합성 결과가 대신하지 않는 것 |
| --- | --- | --- |
| root key fingerprint/ref와 signer 권한 | 기관 보안 담당자의 승인된 별도 채널, 키 관리/회전/긴급 철회 책임자 | 응답에서 제시한 public key의 자기 주장 |
| issuerEpoch·installationRef·audience | CLEAR 및 기관이 승인한 배포/서비스 식별자와 환경 구분 | 테스트 문자열 또는 다른 기관/환경의 동일 별칭 |
| course/subject ↔ 내부 IDs | 기관 학사/계정 담당자와 CLEAR mapping 담당자의 정확한 대응표, roster revision 소유자 | 지갑 주소·사용자 입력·서명된 임의 내부 ID만으로 신원 매핑 |
| B pending 인증 | B의 승인된 서버 composition, application/mapping/scope 정본, one-time attempt 생성·만료 정책 | 브라우저가 전송한 scope/hash/subject를 그대로 신뢰 |
| transport 신뢰 | C/B 및 기관 control-plane의 고정 endpoint/허용 경로, TLS·peer 인증·인증서/키 회전·실패 정책 | registry 서명만으로 `.3` 응답 채널까지 인증되었다는 주장 |
| lifecycle·복구·시간 | 기관 키 유효기간/overlap 여부, 철회 배포 지연, 신뢰 시계/오차, backup 복구 floor, tombstone 보관 | 오래된 DB 복구·시계 rollback·분산 상태에 대한 자동 보장 |
| 합성/시험 승인 | 허용된 staging site와 합성 계정·과정·서명 키, 실패 주입·로그·보관 범위, 담당자/종료 기준 | 실제 사용자 로그인·운영 활성화 승인 |

본부 배정이 필요한 경로 제안은 B `src/agent-preview/moodle-binding/coordinator.mjs`와 신규 `registry-client.mjs`의 pending 전달 composition, 공통 `src/application/http.mjs` 및 `src/product-workflow/http-development.mjs`의 인증/서버 설정 연결이다. 파일을 생성하거나 수정하지 않았다. root/issuer/mapping 설정의 정확한 소유 경로와 importer 권한 분리는 본부가 배정해야 한다. 기존 B contract/schema 검사를 낮추지 않는다.

## 실행·증거

기존 README의 fresh synthetic Moodle 4.5.15 / PostgreSQL 16.14 / PHP 8.3.35 설치와 runtime DB config, read-only core 및 `/probe` mount를 준비한다. 전용 container 이름은 `clear-actual-reader-web`, DB는 `clear-actual-db`다. 외부 포트·기관 연결은 없다. 새 suite의 fixture reset은 이 시험의 registry와 issuer-registry-v1 행만 지운다. **운영 migration/cleanup API가 아니다.**

```sh
docker exec -e CLEAR_ACTUAL_MOODLE_PROBE=1 clear-actual-reader-web \
  php /probe/moodle-integration/registry_tests.php
./tools/node plugins/moodle/moodle-integration/registry-contract.test.mjs \
  210a739e1d8a2b8e7af2ef894b9309c1352b5a14
```

`registry_vectors.php`는 `registry-vectors.json`의 공개 합성 벡터 생성기다. 벡터는 의도적으로 만료된 고정 시각을 사용한다. PHP→Node의 독립 Ed25519 검증은 메시지 byte/해시, 정상 서명, domain 및 signature 변조 거부를 확인한다. 이 JSON을 현재 운영 assertion으로 사용하지 않는다.

신규 PHP 96개 검사는 root/서명 변조, exact schema·중복 키·범위·audience·시간·수명, 매핑 추가 금지, 낮은 revision/epoch·키 재사용 거부, native Moodle mint/조회와 roster/key 철회, 같은 attempt의 두 프로세스 동시 소비, 쓰기 후 실패/프로세스 종료 rollback, lock 대기 만료, mint fence와 권한 분리를 포함한다. 교차 검사는 세 signature type 및 실제 `.3` DTO 네 가지를 확인한다. 최종 실행 로그는 `registry-verification.txt`에 별도로 보관한다. 이전 HTTP 및 shadow 증거를 새 실행 수에 합산하지 않는다.

기존 PHP 154개와 교차 언어 42개(총 196개)도 새 schema가 있는 격리 DB에서 다시 통과했다. PHP 28개 파일 lint와 diff whitespace 검사를 통과했다. 기존 HTTP 113개는 이전 head 증거이며 이번 실행 수에 포함하지 않는다.
