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
