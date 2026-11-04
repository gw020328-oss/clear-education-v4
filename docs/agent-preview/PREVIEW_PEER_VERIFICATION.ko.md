# B peer/context 후보 검증

Base `5f528d7e65385ec92083fe43b79849dccffc2e07`, branch `codex/moodle-preview-peer-contract`. 이 문서가 포함된 commit이 후보 head다. 프로토콜 정본은 [PREVIEW_PEER_CONTRACT.ko.md](PREVIEW_PEER_CONTRACT.ko.md)다.

변경은 새 peer-transport/preview-context/preview-http 모듈, 좁은 검사와 fixture/docs, 공통 application HTTP의 독립 preview auth export22줄, development의 별도 opt-in factory10줄이다. 기존 coordinator validation/currentness/transaction 및 기본 handler/startSourceDevelopment는 바꾸지 않았다.

## 결과

- 신규 peer/context30 + 기존 binding/currentness/student/auth HTTP/authority/source development83 = **113 PASS**.
- PHP standalone reference와 Node의 서명 바이트 digest, 전체 canonical wire, HMAC: **3 fixture 일치**. C request, C full observations.3 response, B→D triple. 기존 격리 PHP 컨테이너에서 스크립트만 실행했으며 Moodle bootstrap/DB를 사용하지 않았다.
- D exact38aaf63의 별도 delta 리뷰: D15 + B3 =18 PASS, 원래 lock-expiry 반례 거부. 상세는 [D_APPROVAL_EXPIRY_DELTA_REVIEW.ko.md](D_APPROVAL_EXPIRY_DELTA_REVIEW.ko.md).
- git diff --check 통과. 전체 제품CI/소스 pin 갱신/배포 검사가 아니다. 기존 A 소유 pin 통합을 이 후보에서 수정하지 않았다. 새 검사 CI 편입은 본부 통합 작업에 명령을 전달한다.

최종 로컬 검사 명령(Node24.21.0 고정):

```sh
./tools/node --test \
  tests/agent-preview/peer-transport.test.mjs \
  tests/agent-preview/preview-context.test.mjs \
  tests/agent-preview/binding-module.test.mjs \
  tests/agent-preview/binding-currentness.test.mjs \
  tests/agent-preview/binding-student.test.mjs \
  tests/application/http.test.mjs \
  tests/application/binding-authority.test.mjs \
  tests/product-workflow/http-development.test.mjs
```

재현에는 기존 package lock에 따른 Node 의존성이 필요하다. 이번 별도 worktree 검사는 이미 설치된 pinned B node_modules를 임시 symlink하여 실행했고 이를 commit에 넣지 않았다. 원본 출력 `/private/tmp/clear-preview-peer-final-113.txt`.

## 입증한 경계

- exact canonical bytes/HMAC, direction/path/audience/epoch/key pin, duplicate JSON 및 exponent 표현, context/source/proposal/requestHash 응답 바꿔치기, 지속 replay/restart와 clock 후퇴, SQLite 잠금 중 만료와 commit 후 소비 보존.
- 고정 URL/redirect 거부/응답 크기/시간 제한, 비협조적 전송기의 늦은 응답 무효화. 관측5초와 생성 응답45초를 분리하고 오래된 신규 생성 요청은5초에서 거부한다. 이 검사는 mock transport이며 모델을 호출하지 않는다.
- 실제 코드의 auth/C1/coordinator를 새 합성 DB로 구성해 학생 본인·ACK·권한/policy/binding/application revision, artifact/model/limits/epoch, logout, fresh snapshot 및 최종 fence를 검사했다. 실제 기관 계정/DB 검사가 아니다.
- source/subject/course/target/application 필드 주입과 context-only 호출 차단, 정확한 draft/proposal 검토, 단일 진행 관측, wall/monotonic expiry, 복사/변조/오래된/기전달 triple의 재서명 차단.
- preview HTTP 기본503, 전용 auth 쿠키/Host/Origin/CSRF, body 중복 키, 지급/RPC/admin/peer route 차단. 일반 HTTP 및 source development 회귀도 유지했다.

## 남은 연결과 관문

C native observations peer listener, D v1 peer 수신/approvalBindingHash 소비 및 observation-result 수신, B의 peer-인증 D draft 소비자와 실제 verifier 조립은 이 후보에 아직 없다. B 모듈은 callback/API를 준비했지만 owner 인증을 건너뛴 실제 연결은 제공하지 않는다. D 모델 호출 승인 레코드의 model/limits/artifact/epoch 무효화는 본 계약을 소비하는 D 후속 diff로 구현해야 한다.

본부 exact 계약 검토 전 cross-peer는 DISABLED이며 LIVE activation profile 자체가 없다. 초기 독립 composition은 loopback factory만이다. 지급 호스트/키/DB를 공개하거나 D에 공유하지 않았고, 새 유료 모델 호출·기관 로그인·공개 tunnel·배포를 수행하지 않았다. 운영 clock/whole backup rollback은 trusted owner 전제이며 복구시 epoch/key 회전은 별도 프로비저닝 의무다. C configure operator가 학생 열람 위임을 얻지 않는다.
