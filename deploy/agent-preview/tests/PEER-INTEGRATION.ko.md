# D 로컬 합성 peer 하네스

B `3d6c3ff7e8252575155d553247cacab2b699026f`를 체크아웃하고 기존 lockfile 의존성을 준비한다. 이 커밋은 `a002cf77` 서명 형식과 DTO를 유지하며 fractional expiry를 보정한다.

```sh
CLEAR_B_PEER_WORKTREE=/absolute/path/to/pinned-b-checkout ./tools/node --test deploy/agent-preview/tests/peer-integration.mjs
```

`offline-peer.mjs`는 합성 테스트에서만 조립한다. B 소유 protocol, B가 발행한 context, 두 방향 핀, 독립 replay DB, 고정 target과 B 시간 정책을 주입한다. `listen()`은 127.0.0.1 임시 포트만 사용한다. HTTPS origin 핀은 서명 계약에서 유지하고 테스트 전송기만 해당 포트의 HTTP로 연결한다.

1. B 학생 fixture가 현재 신청과 binding으로 context를 발행한다. D는 합성 모델 전송기와 단회 승인 DB를 사용한다. 승인 지문은 B issuer가 계산한 `approvalBindingHash`다.
2. 서명된 generate 본문은 exact `{sourceText,approvalRef}`다. 서명된 응답은 exact `{input,proposal}`이며 B의 `acceptVerifiedDraft(context,input,proposal)`에 전달한다. `proposal`은 검증된 `{sourceText,rows}`다.
3. B의 명시적 review가 성공하면 하네스가 `confirmReview({previewContextRef,draftId,proposalHash})`를 호출한다. 이 호출은 테스트 코드 내부에 있다.
4. B가 학생 권한과 현재성을 확인한 뒤 `deliverObservation`으로 얻은 exact triple을 `/v1/preview/observation-result`에 보낸다. D는 peer 서명, replay, context/source/proposal, review, target, Unix seconds와 관측 만료를 검사하고 합성 receipt에 서명한다. 관측 결과에는 자격·지급 허가를 부여하지 않는다.

하네스에는 합성 학생 및 모델 fixture가 쓰인다. B 공용 HTTP와 Moodle plugin 통합 증거는 해당 소유자의 별도 실행을 기록한다. 하네스 파일은 배포 패키지에서 제외되며 표준 런타임은 기존 라우트 구성을 유지한다.
