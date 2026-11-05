# 후속 `.v2.1` 순수 변환기 후보

기존 `65302013cfe6b25bc1a1722ce8d19de428ba6bc5`의 `.1` 후보·README·시험은 보존했다. 팀원 PR #167은 초기 후보를 사용하므로 이 후속을 별도로 인수해야 한다. 이 디렉터리는 공유 후보이며 제품 화면에 자동 설치되지 않는다.

## 가져올 파일과 시험

- `condition-proposal.v2.1.candidate.mjs`: 최신 후보. 원본 E 후보 SHA256은 `f9f416c891e5911507e804423104cba24ac7a6064884125df8fbb657d18d141d`.
- `condition-proposal.v2.1.success.test.mjs`, `condition-proposal.v2.1.failure.test.mjs`: 이식 가능한 집중 시험 11개.
- `fixtures.v2.1.json`: 정확 core `f5a8972b5e0f84f0dae098b2b43196ffd22cee60`의 공개 합성 원문으로 만든 native `.2` 응답 대역 두 건. 실제 모델 응답·학생 자료가 아니다.
- `network-block.v2.1.mjs`: 시험 중 fetch/TCP/HTTP/UDP 전송 차단.

저장소 루트에서 고정 Node 24.21.0으로 실행한다.

```sh
./tools/node --import ./docs/pivot/gemini-proposal-candidate/network-block.v2.1.mjs \
  --test docs/pivot/gemini-proposal-candidate/condition-proposal.v2.1.*.test.mjs
```

시험은 Node 내장 모듈과 이 디렉터리 파일만 사용한다. `npm ci`, 로컬 `workspaces` import, 미병합 core 설치, 키, 모델/서비스 호출이 필요하지 않다. 이 디렉터리만 다른 폴더로 복사해 Node 24.21.0으로 같은 상대 파일들을 실행해도 된다.

fixture를 새 core에서 재생성하는 작업은 별개다. 위 정확 core에서 `reviewModelProposal`, `proposalDto`, `prepareStructuring`을 사용했고, 생성 시 그 core의 고정 npm 의존성이 필요했다. 공유 시험은 고정 fixture를 읽으므로 그 의존성이 없다. 전체 core 또는 D 통합 suite의 재검증으로 해석하지 않는다.

## 초기 `.1`과 적용 차이

`toPanelProposal(sourceText, packet, context)`의 `context`에 `expectedBodyHash`, **현재 `expectedProposalHash`**, `now`를 준다. native `.2` 성공을 표시할 때는 서버 저장 식별자인 `draftId`, `expiresAt`도 공급한다. D 성공 envelope에는 해당 필드가 이미 있다. 식별자나 지문을 브라우저가 임의로 발급하는 계약이 아니다.

- native `clear-condition-structuring.2`의 성공 `PROPOSED`와 D의 성공 outer `clear-external-preview-draft.1`을 받는다. D는 `proposal`과 `modelCall.methods`를 추가한 확정 계약이다.
- 모델 draft는 `clear-preview-model-draft.2`만 받으며 원래 `modelRows`, source/proposal/draft hash와 guards 표시 결합을 검사·복사·동결한다. 유효 조건·질문에서 원행을 재구성하지 않는다.
- 실패는 **별도 `failureView(nativeFailure)`**로 표시한다. 성공 제안으로 변환하지 않는다. `actualModelCall: null`은 **전송 여부 미확인**이다. `Boolean(null)`이나 `?? false`로 바꾸지 않는다. true도 실제 모델 응답 수신에 대한 표시이며 도구 성공과 다르다.
- 실패 `modelCall.execution`은 누락·오타를 거절한다. native의 인수된 값은 `ACTUAL`, `OFFLINE_TEST_TRANSPORT`, 기본값 `HOST_SUPPLIED`다. D 성공은 기존 두 값만 받는다.
- D 성공 `modelCall`은 `{attempted,replied,execution,model,bodyHash,succeeded,errorCode,methods:{countTokens:{invoked,replied},generateContent:{invoked,replied}}}`다. 두 메서드 채택 상태를 검사한다. invoked는 transport 진입, replied는 guard 통과 응답 채택이지 독립적인 네트워크·과금 증명이 아니다.
- **D HTTP 오류 DTO는 변경되지 않았다.** 내부 Error 진단이 브라우저에 온다고 추정하거나 HTTP 오류를 native `.2` 실패로 조립하지 않는다.
- 기본 실행은 **DISPLAY_ONLY**다. 명시 인수된 전용 `D_SINGLE_ACTIVITY_OFFLINE.1` 계약만 활동 하나의 오프라인 관측 요청을 열 수 있다. 다중 fixture·실제 Moodle/Reclaim·지급 연결은 후속이다.

## 팀원 PR #167 인수 접점

초기 후보 파일을 덮어씌워 끝내지 말고 DI/import와 응답 소유 경계를 맞춘다.

1. 새 후보 모듈의 성공 변환과 실패 표시 함수를 명시적으로 선택한다. 기존 성공 fixture가 새 D `methods`나 `.2 modelRows`를 가진 것으로 가장하지 않는다.
2. 입력마다 `propose`에는 캐시 조회·순수 변환만 넣는다. 유료 생성은 별도 버튼에서 현재 원문·요청세대를 고정하고 기존 prepare/비용 검토/정확 bodyHash 단회 승인 후 한 번만 요청한다.
3. 응답 도착 시 요청세대·원문을 확인한 뒤 현재 proposalHash pin, bodyHash, draftId, 원만료를 저장한다. 늦은 응답은 폐기한다. 입력 변경·생성 실패에는 이전 pin·실행 버튼을 무효화한다.
4. `cacheVersion: clear-panel-model-cache.2`만 현재 모델 캐시로 쓴다. 과거 `.1` draft/plan/result는 폐기하고 현재 core로 다시 검토한다.
5. 모델 실패·실제 미확인·보류 조항을 표시한다. held/미지원 하나라도 있으면 전체 실행 금지, 수동 capability 지정으로 서버 보류를 해제하지 않는다.
6. 실행 직전 원문·핀·세대·TTL과 명시 D 실행 계약을 재검사한다. authenticated 중계 서버가 actor를 고정하며 브라우저가 D의 S2S secret을 갖지 않는다.

원문과 UTF-16 span은 그대로 보존한다. canonicalText 호환 필드도 원문이며 정규 문장으로 재작성하지 않는다. 자체 hash 검사는 자기일관성 검사이고 서버 인증/승인권이 아니다. D의 저장 원행 재검토가 필요하다.

## 검증 범위

이식한 후속 시험 11개 통과. native 원행·guards 변조/.1 거부/현재 pin/TTL/출처, D 성공 단계, 기본 표시 전용, 실패 enum 및 null을 검사한다. D exact `fb7eef079515f1343af0d6e89889cad8515d48f9`에서는 앞선 `.v2` 성공 변환기에 오프라인 HTTP generate 실제 응답을 전달한 1건이 통과했다. `.v2.1`의 추가 변경은 실패 execution 검증이며 이번 공유를 실제 모델/배포/제품 UI 통합 완료로 표시하지 않는다.

제품 `web/**`, core, workflow, 원격 `.1` 사본은 변경하지 않았다. 실제 호출·배포·merge는 이 후보 공유에 포함되지 않는다.
