# 첫 외부 CLEAR 실행 승인안

입력은 `Python 기초 강의 완료` 한 줄이다. UTF-8 27바이트이며 끝 개행을 붙이지 않는다. 학생 식별자, 쿠키, 지갑 또는 Moodle 원본은 Gemini 본문에 들어가지 않는다. 조건 문구, 절 위치, 고정 capability 목록, 프롬프트와 응답 스키마가 전송된다.

```sh
./tools/node deploy/agent-preview/tests/first-run-preflight.mjs
```

| 확인 항목 | 값 |
| --- | --- |
| sourceHash | `bc7629386f02cdc0f68a8d213dfc29218b331ace75b12a6c9061db3638052bca` |
| 승인 원장 bodyHash | `ac7ed3efc93f48f855f2ae66e8a63997be54d04feea790261593892c9f17643c` |
| countTokens 실제 JSON 바이트 SHA-256 | `4392fc0c20a31b7d471cb4671c8f694e51fde617ac6590ed427bf0f2b9266045` |
| generateContent 실제 JSON 바이트 SHA-256 | `b927bf8350d4fa3f8d20c63ee8635835ab6b129a8af1a768e0718b8f00fe9a2d` |
| 모델 및 API | `gemini-3.5-flash-lite`, Gemini Developer API Standard, `generativelanguage.googleapis.com/v1beta` |
| 요청 한도 | countTokens 최대 1, generateContent 최대 1, 자동 재시도 0, 총 45초 이내 |
| 토큰 한도 | countTokens 4,096 이하일 때만 생성, maxOutputTokens 2,048 |
| 생성 비용 추정 상한 | **USD 0.0063488** = (4096 × 0.30 + 2048 × 2.50) / 1,000,000 |
| B approvalBindingHash | 배포 및 인증된 현재 학생 context 발급 뒤 확정 |

비용은 위 토큰 한도에 2026-11-04 확인한 Standard 단가를 적용한 추정치다. 출력 단가는 thinking을 포함한다. countTokens는 생성 없이 세는 별도 요청이다. provider가 청구하는 최종 토큰과 비용은 usage 영수증으로 대조한다. 추정치를 공급자 청구 한도로 간주하지 않는다. [Gemini 단가](https://aistudio.google.com/docs/pricing#gemini-3-5-flash-lite) · [Gemini Billing](https://ai.google.dev/gemini-api/docs/billing/)

## 승인 대상과 실행 순서

2026-11-04 사용자 AWS 계정 보유 확인 후 우선 추천은 AWS Lightsail Linux/Unix public IPv4 1GB/40GB, 기본 월 USD 7로 변경했다. 계정 접근·도메인·실측 자원·최종 요금은 미확인이고 인프라 생성 및 비용은 아직 승인되지 않았다. `../RAILWAY.ko.md`의 최신 비교를 따른다. 아래는 기존 Railway 대안이다.

기존 배포 제안은 Railway Hobby의 독립 preview 서비스 1개, Singapore `asia-southeast1-eqsg3a`, 지속 볼륨 1개, 고정 HTTPS origin이다. 월 최소 USD 5이고 compute usage hard limit 제안은 USD 10/월이다. 한도 도달 시 해당 workspace 서비스가 중지되므로 전용 workspace에서 적용한다. 세금과 Gemini 비용은 별도다. 이전 AWS 계정은 배포 대상으로 확정하지 않았다. Railway 계정 접근과 새 비용이 승인되면 로그인, 전용 프로젝트·볼륨·HTTPS origin·한도 설정, 컨테이너 업로드, 키 등록이 필요하다. [Railway 가격](https://docs.railway.com/pricing/plans) · [리전](https://docs.railway.com/deployments/regions) · [사용량 한도](https://docs.railway.com/pricing/cost-control)

1. B/C exact 통합 후보를 받는다. C가 의도한 `python-intro` 조건과 실제 테스트 강좌의 승인된 Moodle Page mapping을 연결한다. D 계획에서 보이는 `python-intro`는 공개 계획의 참조다. 학생 본인, 현재 ACK 신청, 등록, 강좌, Page binding은 B/C에서 확인한다.
2. B/D 역할과 HTTPS origin, audience, keyRef, 새 epoch, 정책 시간 한도, 모델과 limits hash를 확정한다. 승인할 후보의 Git SHA, source manifest digest, 이미지 digest, 실제 origin과 대상 mapping을 기록한다. 인프라 동의는 별도이며 Gemini 호출은 이 릴리스에 대한 한 건의 입력 승인과 결합한다.
3. 인프라 승인 범위에서 배포 준비 후 모델 키와 미사용 승인 없이 HTTPS 거부·인증·재시작을 검사한다. 승인 DB와 peer replay DB는 별도의 SQLite 파일로 같은 단일 인스턴스의 private 지속 볼륨에 보관한다. 파일 손실·복원 또는 키 교체 시 새 epoch와 키를 발급한다.
4. 사용자 승인 이후 기존 소유 Gemini 키를 서버 비밀로 설정한다. B 인증 학생의 현재 context가 발급되면 B issuer가 만든 `approvalBindingHash`를 신뢰된 운영 경로로 받아 exact bodyHash와 함께 D 원장에 1건만 등록한다. 요청 body에서 binding을 받아 등록하는 경로를 만들지 않는다. 미리 승인한 배포·학생·대상과 달라지면 등록을 거부한다. context 만료 이전에 등록과 실행을 완료하며 지문 또는 만료를 새 값으로 임의 대체하지 않는다.
5. B가 서명 generate를 호출한다. 검증된 조건과 허용 도구를 표시하고 명시적 검토를 받는다. B가 현재 권한을 다시 확인하고 C의 관측을 검증한 후 서명된 result를 보낸다. 모델이 미지원이나 불명확을 반환하면 관측 전에 멈춘다. 실패·응답 유실·재시작에도 승인 소진은 유지된다.

## D 런타임에 필요한 최소 연결

- 지금 배포 이미지의 `runtime.mjs`는 v0 HMAC HTTP와 `createService({config,store})`를 조립한다. v0의 execute는 실제 adapter가 없어 503이며 학생 권한을 판정할 수 없다. `tests/offline-peer.mjs`의 B peer 경로와 TLS는 로컬 전용이고 manifest에서 제외된다. `offlinePeerContext`는 모의 모델 전송기만 허용한다.
- 인수 뒤 D에 명시적 release profile을 추가한다. B가 소유한 검증된 wire codec/replay 구현을 exact 통합 SHA에서 사용하며 v0로 폴백하지 않는다. 서버 간 세 POST만 동일 profile에 연결한다. 경로·Host·TLS·sender/receiver/audience/epoch/keyRef·clock·replay 검사를 통과한 요청만 처리한다. fixture를 패키지에 포함시키는 방식으로 활성화하지 않는다.
- generate의 exact `{sourceText,approvalRef}` 및 서명 meta를 사전에 등록한 issuer context와 결합한다. 원장 소비 키는 B approvalBindingHash와 canonical 모델 bodyHash다. config-only 승인 재사용을 거부한다. 기존 count→generate 구간의 단회 소비, 잠금 뒤 시각, abort 및 await 이후 만료 검사를 재사용한다. 응답은 검증된 AST `{input,proposal}` DTO로 돌려보낸다.
- execute는 B의 인증 학생 검토가 서명한 `{draftId,proposalHash}`의 receipt 전용이다. D는 저장된 context/source/proposal/draft와 결합하며 응답 서명 및 만료 검사 뒤 상태를 반영한다. observation-result는 B의 최종 auth와 C 관측 검사를 통과한 exact triple만 받고 context, target, freshness, replay를 재검사한다. D에서 C를 직접 호출하거나 자격을 판정하지 않는다. 실제 provenance 및 receipt 버전은 B 통합 담당과 확정한다.
- 이 연결에는 서명·권한·승인 수명 검토가 필요하다. B/C 통합 인수와 Astra / High 독립 리뷰까지 현재 외부 서버는 503 경계를 유지한다.

로컬 재현은 exact 문구를 모델 fixture에 넣고 D의 검증된 AST로 `moodle.activity.public` 계획을 구성한 뒤 B 학생 fixture에서 TLS로 서명 generate, review, result를 검증한다. 실제 Gemini 분류 결과와 기관 Moodle 관측 증거는 실행 후 별도로 기록한다.

## 운영자 절차: PR156 고정 후보와 B 등록 계약

이 절차는 첫 AI 미리보기 경로의 인계다. 고정 네 조건, 양측 동의, 로컬 체인 100 TEST와 Moodle 지급 영수증은
기존 지급 경로에서 별도로 완료해야 한다. 이 peer의 review 및 observation receipt는 지급 영수증이 아니다.

고정 D: `ff0bef2c57312ddbf7006c295dbc583e3938a822` (Draft PR156, 473 source files,
manifest `56bd9cb874332ef39ca8a26ab49d4ea06c82b66fa841c023c4f6dca153a440d1`).
Linux amd64 platform manifest:
`sha256:2077eda6b247faa26fcbea411c68e35550827ae4688455c1664252ac4b2972d3`.
이 지문은 로컬 이미지에서 확인했으며 레지스트리 pull 주소가 아니다.
B 재현 기준: `2910202784d0d63b59600000e2a6d787bccc5b16`.
B의 등록 서비스는 이 커밋에서 `LOCAL_SYNTHETIC_ONLY`이며 TLS client는 `127.0.0.1`과
명시 CA만 허용한다. **현재 B에 승인된 원격 전송 경로는 없다.** 외부 환경을 정해도 B가 별도의
원격 전송 구성을 구현·검토하기 전에는 실제 B→D 요청을 진행할 수 없다.

### 로컬 재현 (합성 데이터만)

서로 다른 clean worktree에 위 B와 D 커밋을 checkout하고 B의 lockfile 기준 의존성을 설치한다.
아래는 B worktree에서 실행한다. D는 B 테스트가 exact HEAD 및 clean tree를 검사하므로
이 운영 문서 브랜치를 D 테스트 대상으로 사용하지 않는다.

```sh
env -u GEMINI_API_KEY CLEAR_D_REGISTERED_WORKTREE=/absolute/path/to/pinned-D \
  ./tools/node --test tests/agent-preview/preview-registered.test.mjs
```

- 재현 결과 13 통과·1 skip. 실제 D 런타임의 로컬 HTTPS prepare는 성공했고 원장이 비어 있었다.
  승인 없는 generate는 422, Gemini 자격증명 읽기 및 provider fetch 모두 0회다.
- 별도 OFFLINE 모드에서만 모의 승인을 등록해 서명 generate/review/observation을 진행한다.
  이 결과는 실제 분류나 기관 관측으로 표시하지 않는다. 설치 C .3 테스트는 별도 환경 없이는 skip이다.
- 실제 이미지 bootstrap/UID1000/재시작 검사 재현에는 아래 스크립트를 사용한다.
  시작과 검사는 모두 같은 컨테이너의 loopback에서 이루어지며 TLS 자체는 위 B 시험에서 검증한다.
  두 시험을 합쳐도 원격 프록시·공개 인증서·기관 계정 검증이 완료된 것은 아니다.

```sh
# 이미지 존재와 로컬 index 지문 일치 확인 후 실행. 태그만 신뢰하지 않는다.
docker image inspect clear-agent-preview:peer-ff0bef2 --format '{{.Id}} {{.Os}}/{{.Architecture}}'
# 예상: sha256:b6b75a77b9c74b4a581885ec8b63b0185a7f2f1f83ebf72a0e0051eb7ed05bea linux/amd64
docker run --pull never --rm --network none --platform linux/amd64 \
  --mount "type=bind,source=$PWD/deploy/agent-preview/tests/peer-image-operator-smoke.mjs,target=/smoke.mjs,readonly" \
  clear-agent-preview:peer-ff0bef2 node /smoke.mjs
```

### 외부 운영 인수 순서 (대상·접근·비용 확정 후)

1. **대상과 배포 고정.** 승인 자료에 계정/리전/인스턴스/정확 HTTPS origin/인증서 발급자와
   신뢰 경로/이미지 지문/D·B·C 커밋을 기록한다. 서버에는 소스 지문 검증을 거친 이미지와
   UID1000 전용 private state 디렉터리만 배치한다. 승인 원장과 peer replay DB를 같은 디렉터리의
   별도 SQLite 파일로 유지한다. 신뢰되지 않은 복구·DB 손실·키 교체 때에는 새 epoch와 키가 필요하다.
2. **HTTPS 및 계약 검증.** Linux host에서 D 내부 포트는 127.0.0.1에만 둔다.
   같은 호스트의 TLS 프록시가 exact Host(:port 포함)를 보존하며 4개 POST 경로만 전달한다.
   HTTPS origin은 B pin, D config 및 D pin에서 동일해야 한다. 인증서 SAN은 그 호스트와 일치해야 하며,
   B는 승인 CA로 chain과 hostname을 검증한다. 사설 CA의 경우 공개 CA 인증서만 신뢰 파일로 전달한다.
   CA 서명키/TLS 개인키는 B로 보내지 않는다. 신뢰 검사 비활성화와 리다이렉트 추종은 금지한다.
   프록시 access/body 로그를 비활성화하고 크기/속도 제한, 허용된 B 접근 경로, 실제 실패·거부 상태를 확인한다.
3. **owner 스냅샷 및 context.** D release JSON의 고정 config/pin/target/receipt 버전이 확정되면
   B owner에 그 JSON의 canonical releaseHash, 별도 release snapshot(epoch/artifact/model/limits),
   고정 도구·대상과 난수 approvalRef를 전달한다. 브라우저 제공 ID나 URL만으로 scope를 구성하지 않는다.
   B에서 Moodle 로그인과 별도로 CLEAR 학생/신청/강좌/수령인 권한을 확인한 뒤 exact 입력 context를 발급한다.
   B의 서버 내부 `ownerRegistration` 출력을 브라우저/공용 API/로그를 거치지 않고 D 운영자에게 전달한다.
   해당 JSON과 release는 UID1000의 0600 파일, HMAC은 별도 0600 파일이다.
   `CLEAR_PEER_RELEASE`, `CLEAR_PEER_REGISTRATION`의 절대 경로를 지정하고
   이미지 명령을 `node deploy/agent-preview/peer-main.mjs`로 명시한다. 기본 Docker CMD는 v0이다.
4. **등록 후 별도 승인.** 승인 원장이 비어 있는 상태에서 B가 서명 prepare를 수행하고
   `registered:true`, `paymentAllowed:false` 영수증을 확인한다. **같은 실제 실행 context에서
   무승인 generate를 리허설하지 않는다.** B의 실패 상태가 terminal이므로 거부 검사는 별도 합성 context에서 한다.
   실제 입력별 사전 승인을 확인한 운영자만 같은 release/registration/DB와
   `CLEAR_APPROVED_RELEASE_HASH`, `CLEAR_APPROVED_BODY_HASH`, `CLEAR_APPROVED_BINDING_HASH`를
   지정해 동일 이미지에서 `node deploy/agent-preview/peer-register.mjs`를 실행한다.
   이 명령은 모델을 호출하지 않는다. 이후 B의 generate에만 그 approvalRef를 사용한다.
5. **시연과 종료.** 전송 전에 B/C가 현재 권한과 binding을 다시 확인한다. generate의 검증된 draft를
   검토하고 B의 review, 승인된 C 관측, B 서명 result 전달 순서로 진행한다. grant 소비 후 실패·응답 유실·재시작은
   재시도 권한이 아니다. context는 최대 120초이므로 사람의 검토와 승인을 먼저 준비하고,
   발급 후 실제 해시가 사전 검토와 어긋나거나 시간 내 exact 승인이 불가능하면 중단한다.
   이전 context/approvalRef를 재사용하거나 만료를 연장하지 않는다. 기관 원문이나 증명은 인계 기록에 넣지 않는다.

### 외부 실행 승인에 넘길 자료

- 인프라 후보: 기존 AWS 계정의 Lightsail 서울 Linux/공인 IPv4 1GB/40GB 1대, 기본 월 USD 7 제안.
  계정 접근·크레딧·도메인과 DNS·세금·추가료·정확 endpoint는 미확인이다.
  AWS 예산 알림은 청구 상한이 아니다. 유료 자원 생성·외부 공개·실계정 로그인은 승인되지 않았다.
- 유료 모델 후보: 위 한 줄 입력·wire hashes와 동일한 Gemini Developer API Standard
  `countTokens` 최대 1회 → 통과 시 `generateContent` 최대 1회, 자동 재시도 0회,
  전체 최대 45초(부모 만료가 더 빠르면 단축), 입력 4096/출력 2048 tokens.
  위 단가 기준 생성 비용 추정 상한 USD 0.0063488이며 공급자 청구 한도가 아니다.
  실제 origin/epoch/releaseHash/현재 B context의 approvalBindingHash가 확정되기 전에는 원장에 적재하지 않는다.
- 본인 조작: AWS가 확정되면 사용자 본인 로그인/MFA 및 비용 결정, Moodle/CLEAR 본인 로그인,
  필요한 증명 동의·지갑 서명은 각 UI에서 직접 한다. 비밀번호·키·토큰·원본 증명을 채팅이나 PR에 붙이지 않는다.
