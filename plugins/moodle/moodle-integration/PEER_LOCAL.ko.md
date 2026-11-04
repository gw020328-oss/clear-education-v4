# C /observations 로컬 합성 연결

`clear-preview-peer.1` B a002cf77 계약(3d6c3ff7의 fractional expiry 수정 후에도 wire 동일)에 대한 C 수신기다. Moodle 4.5.15 / PHP 8.3.35 / PostgreSQL 16의 **합성 Page 수동 완료**만 관찰한다. 기관·실제 학생·유료 모델·운영 배포용 활성화가 아니다.

## 설치와 활성화 경계

`python3 plugins/moodle/moodle-integration/build_peer_zip.py OUTPUT.zip`은 local_clearbridge 0.1.2(2026110402) ZIP을 만든다. Korean strings와 `observations.php`, `peer/protocol.php`를 포함하고 tests 및 Moodle integration의 owner/schema/fault/router 도구를 포함하지 않는다. 4.5.15 새 설치에서 설치했다. ZIP만 설치하면 endpoint는 404다.

격리 환경에서만 `CLEAR_ACTUAL_MOODLE_PROBE=1`, `CLEAR_HTTP_LIFECYCLE_PROBE=1`과 site shortname `clear`를 사용한다. Apache는 exact `/observations`만 설치된 `/local/clearbridge/observations.php`로 rewrite한다. endpoint는 원래 REQUEST_URI를 검사하므로 query, 다른 경로, direct PHP alias, GET, 다른 content type/encoding을 거부한다. Moodle bootstrap 후 응답 Content-Type을 다시 `application/json`으로 설정한다. cookie는 읽기 권한이 아니며 NO_MOODLE_COOKIES를 bootstrap 전에 설정하고 응답 Set-Cookie도 제거한다.

코어 `/var/www/html`과 C integration `/probe`는 읽기 전용 mount다. 기존 guarded adapter/reader/신뢰 profile과 restricted DB 역할 설치가 별도로 필요하다. 운영 설치를 대신하는 자동 schema migration은 포함하지 않는다. runtime `config.php`에 `$CFG->clearbridge_synthetic_peerconfig`로 웹 루트 밖 JSON을 지정한다. 이 JSON은 `keyBase64`(32 raw bytes의 표준 base64), `pin`, `replayPath`, `profilePath`만 가진다. key/profile/pin은 운영자 신뢰 입력이며 HTTP에서 변경할 수 없다. replay 디렉터리는 해당 PHP uid 소유 0700, DB는 0600·regular file·single link이며 SQLite FULL synchronous와 exclusive claim을 사용한다. 저장소 유실/백업 복구 때는 새 key와 deploymentEpoch가 필요하다.

이 로컬 설치는 `clear-c-peer-web`, `clear-c-peer-db`, 코드/데이터/replay 전용 볼륨을 사용한다. DB는 internal network에만 있고 web port는 `127.0.0.1:18767`에만 공개된다. Docker Desktop의 internal-only network는 host port를 만들지 않아 web에 전용 HTTP bridge를 추가하고 재시작했다. 기존 데모 18766과 별도이며 쿠키 이름도 `MoodleSessionClearPeer`로 분리한다. native 확인 fixture 서버는 컨테이너 loopback 18767에만 listen하고 호스트에 공개되지 않는다. Apache에는 fixture router를 연결하지 않는다.

## B 단일 통합 인수

기계 endpoint: `http://127.0.0.1:18767/observations`.

Pinned origin은 계속 `https://synthetic.invalid`다. B는 `OFFLINE_TEST`의 명시적 fetchImpl에서 이 exact origin/path만 loopback URL로 매핑한다. HTTPS/운영 activation 계약을 완화하지 않는다. 반환 response URL도 해당 테스트 매핑 계약에 맞춰 처리한다.

```json
{"keyRef":"synthetic-key","sender":"B","receiver":"C","audience":"synthetic-C-observations","deploymentEpoch":"epoch-1","path":"/observations","origin":"https://synthetic.invalid","maxClockSkewSeconds":0}
```

키는 공개 합성 byte `0x11` 32개다. hex 문자열을 HMAC key로 쓰지 않는다. `/observations` proposalHash는 nonzero이며 valid MAC의 zero도 replay claim 전 거부한다. canonical envelope·서명 field order·길이 prefix·exact metadata·방향/epoch·독립 replay floor를 검증한다. 정상 응답은 요청 signing bytes의 requestHash와 같은 context/source/proposal/requestRef를 유지하며 부모 만료 이내로 서명한다.

B coordinator가 만든 **exact** `clear-moodle-confirmation.3` JSON을 다음 owner-assisted CLI의 stdin으로 보낸다. CLI는 attemptRef/requestRef/issuerEpoch/bindingScopeHash를 변경하지 않고 기존 합성 target에 등록한 뒤 native manager cookie→fixture login→sesskey·명시 확인→guarded mint를 실행한다. `confirmation` 필드는 full `.3` receipt다. B는 이를 정상 preview/complete 경로로 저장해야 하며 C의 standalone test scope로 교체하면 안 된다.

```sh
docker exec -i -u www-data clear-c-peer-web \
  php /probe/moodle-integration/peer_fixture.php --stdin < exact-b-confirmation-request.json
```

같은 attempt/scope의 후속 조회는 **기존 내부 `/lookup` HTTP**를 사용한다. 새로운 register/login을 실행하지 않는다. 각 B 요청의 새 requestRef를 포함한 원문을 `{"request": <exact B confirmation request>}`로 감싸 아래 stdin에 보낸다. 응답 `{"ok":true,"result":<full .3>}`의 result를 사용한다. 캐시하거나 requestRef/시각을 클라이언트에서 고치지 않는다. 이 서버는 컨테이너 loopback 전용이므로 호스트의 `http://127.0.0.1:18767/lookup`은 같은 endpoint가 아니다(Apache에는 노출하지 않음).

```sh
docker exec -i -u www-data clear-c-peer-web curl -fsS \
  -H 'Content-Type: application/json' --data-binary @- \
  http://127.0.0.1:18767/lookup < wrapped-b-confirmation-request.json
```

`peer_lookup_test.py`로 첫 발급 후 같은 attempt의 서로 다른 requestRef 두 번을 실제 HTTP로 조회했다. 새 requestRef·observedAt·checkedAt가 실제 reader에서 반환되고 confirmedAt/ref/expiry/세대/revision은 유지됐다. 전후 DB 확인서 수와 native session 영속 bytes의 집계 digest도 같았다. 기존 NO_MOODLE_COOKIES + confirmation read-only 경로 그대로이며 새 endpoint 수정은 없다.

`--stdin` 없는 호출은 C 자체 반례용이며 random attempt 및 b×64 scope를 만든다. B 통합에 사용하지 않는다. 입력당 새 attempt만 허용하고 기존 attempt는 덮어쓰지 않는다. 실제 기관 등록 API가 아니라 격리 owner fixture CLI다. 이 CLI 실행은 authority를 갱신해 이전 확인서를 무효화하므로 B/C 작업을 직렬로 수행한다.

| 항목 | 고정 합성 값 |
| --- | --- |
| installationRef | synthetic-moodle |
| courseRef | synthetic-course |
| subjectRef | synthetic-subject |
| audience (inner .3) | synthetic-clear |
| trustEpoch / rosterRevision | 1 / 1 |
| issuerEpoch | B exact 요청 값 그대로 (C 독립 테스트 default는 issuer-probe-v1) |
| native target | user 3 / course 2 / Page CM 2 (이 새 설치 한정, wire에 노출하지 않음) |
| observation targetRef | core-page-manual-mark |
| UI 이름 | Python 기초 강의 |
| B plan 연결 | target=python-intro, tool=moodle.activity.public → core-page-manual-mark |

실제 브라우저의 합성 학생이 Page의 Mark as done을 눌렀고 native 완료 값을 `COMPLETE`로 관측했다. 이는 학습 실력·성적·자동 강의 이수 증명이 아닌 Moodle 수동 완료 상태다. 브라우저 CLEAR 이동 버튼은 기존 비활성 상태다. 이번 수신기 연결을 전체 학생 제품 플로 완료로 해석하지 않는다.

## 검증과 시각 범위

`peer_protocol_tests.php`는 B exact fixture 벡터와 nonzero proposal, canonical alias/중복/타입, pin·epoch, replay 재개/시계 역행/commit 경계 만료 및 파일 권한을 검사한다. `peer_smoke_test.py`는 exact B 모양 입력 보존, full confirmation, 실제 완료 `.3` 서명 HTTP, replay·다른 학생 scope/selector·다른 native 학생/강좌 registry를 검사한다. `peer_http_tests.py`는 후속 넓은 경계 검사 harness이며 별도로 통과 수를 확인해야 한다.

peer envelope는 최대 5초, 응답은 요청/확인서 만료보다 길지 않다. confirmation은 최대 120초이며 CLI 준비 시작부터 시간이 지나므로 응답의 expiresAtExclusive를 읽고 즉시 B 흐름을 수행한다. `.3` observedAt/checkedAt는 실제 snapshot 관측 시각이다. source code hash 시간이 만료 예산에 포함되며 제한을 늘리지 않는다. 거부 응답은 generic 403, 비활성 상태 404다.

현재 정적 web route는 native 사용자 세션을 새로 발급하지 않는다. 기존 등록·역할·세션 세대·authority·profile 검사를 모두 통과한 확인서만 읽는다. 권한 복원으로 이전 확인서를 되살리지 않는다. 운영 root/issuer 신뢰 승인, HTTPS host, 실계정 동의 UI 및 생명주기·보관/복구 인수는 별도 gate다.
