# D 로컬 합성 peer 하네스

B `3d6c3ff7e8252575155d553247cacab2b699026f`를 체크아웃하고 기존 lockfile 의존성을 준비한다. 이 커밋은 `a002cf77` 서명 형식과 DTO를 유지하며 fractional expiry를 보정한다. D 자체 검사는 OpenSSL로 임시 CA와 `127.0.0.1` IP SAN 서버 인증서를 발급한다.

```sh
CLEAR_B_PEER_WORKTREE=/absolute/path/to/pinned-b-checkout ./tools/node --test deploy/agent-preview/tests/peer-integration.mjs
```

1. B 학생 fixture가 현재 신청과 binding으로 context를 발행한다. D 합성 모델의 단회 승인은 B issuer가 발행한 `approvalBindingHash`와 정확한 모델 body 지문에 결합한다.
2. `createOfflinePeer({tls:{key,cert},protocol,key,replay,context,targetRef,timePolicy,config,store,modelTransport,clock})`를 조립한다. `tls.key`는 서버 개인키이고 상위 `key`는 B와 공유하는 32 raw byte HMAC 키다. `clock`은 Unix seconds를 반환한다.
3. `const port = await fixture.listen()`으로 127.0.0.1에 TLS 임시 포트를 연다. `fixture.configurePins(pins)`에 같은 B→D identity 및 정확한 origin `https://127.0.0.1:${port}`를 가진 3개 pin을 한 번 설정한다. path는 `/v1/preview/generate`, `/v1/preview/execute`, `/v1/preview/observation-result`다. B peer transport에도 같은 pin을 사용한다. 전송기는 테스트 CA를 신뢰하도록 명시하고 인증서와 IP 검증을 유지한다. 테스트 종료 때 `await fixture.close()`로 TLS 소켓을 닫는다.
4. 서명된 generate 본문은 exact `{sourceText,approvalRef}`다. 응답 `{input,proposal}`을 B의 `acceptVerifiedDraft(context,input,proposal)`에 전달한다. `proposal`은 검증된 `{sourceText,rows}`다.
5. B가 인증된 학생의 명시적 검토를 수락한 뒤 서명된 execute POST를 보낸다. 본문은 exact `{draftId,proposalHash}`이고 서명 메타는 현재 context/source/nonzero proposal을 결합한다. 이 경로는 검토 확인 전용이다. 응답은 exact `{version:'clear-offline-review-receipt.1',draftId,proposalHash,reviewed:true,paymentAllowed:false}`다. D는 B peer 인증을 검증하며 B가 서명하기 전 학생 권한을 확인하는 경계는 B에 있다.
6. B가 학생 권한과 현재성을 확인한 뒤 `deliverObservation`으로 exact triple을 result 경로에 보낸다. D는 서명, replay, context/source/proposal, 완료된 review, target과 관측 만료를 검사하고 합성 receipt에 서명한다. 관측 결과에는 자격·지급 허가를 부여하지 않는다.

D 자체 하네스는 B의 합성 학생 및 관측 fixture와 합성 모델을 사용한다. B 공용 HTTP와 C Moodle plugin까지 포함하는 검사는 별도로 기록한다. 하네스 파일은 배포 패키지에서 제외된다.
