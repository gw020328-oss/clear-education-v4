# E5-B 구성요소 직접 코드 리뷰

2026-10-19. 범위는 새 `e5b` 실행 모듈·타입·fixture/시험·문서·전용 CI, 명시 memory v4 consumer 및 보존 검사다. 같은 작업 세션의 직접 리뷰이며 독립 보안 감사나 전체 API 통합 인수는 아니다. 요청 설정 Astra/High와 실제 모델 미확인을 구분한다. API 소스 자체는 읽거나 수정하지 않고 root 검토 v4의 17 지문과 소유 이력 병합을 확인했다.

## 검토 후 보강

- 최초 B 실행에서는 source 철회가 거부됐지만 복제된 A catch가 `E5B_` 코드를 일반 오류로 바꿔 시험 1개가 실패했다. B 고정 코드만 보존하도록 수정하고 controller의 임의 예외 원문은 여전히 폐기한다. 첫 실행 4/5, 후속 11/11, child/reorg/stop 등을 추가한 17/17, fence 포트를 추가한 18/18의 이력을 최종 검증과 구분한다.
- private reader evidence에 anchor hash만 맞고 number/time이 허위인 값을 넣을 수 없도록 실제 블록 metadata와 정확히 대조했다. 제한된 compare 포트도 두 checkpoint metadata와 현재 runtime pin을 검증한다. 기존 A 모듈은 수정하지 않았다.
- API의 일관된 과거 DB snapshot은 API 내부 journal만으로 식별할 수 없으므로 E4의 실제 영속 최고 fence를 읽는 owner 전용 포트를 추가했다. exact runtime/scope 질의, 정수 범위, 재시작 후 저장값과 body supplied counter 거부를 검사한다. 실제 API의 constructor capture/5초 preflight/CAS 소비는 후속 필수 조건이다.
- API 담당의 연결 검토 코멘트에 따라 prepareUnsigned도 accept와 같은 실제 message nonce로 관측하도록 보강했다. private query/관측 nonce 일치와 이미 consumed인 nonce의 prepare 거부를 실제 TEST chain으로 검사한다. A 파일은 보존한다.
- backend-stop 직접 claim에는 E4 envelope가 없으므로 `{applicationId,txHash}`만 받는 제한된 receipt 인수 포트를 추가했다. tx에서 기대 sender/nonce/calldata를 파생하고 실제 Transfer/RightSettled 및 accepted allocation/digest/nonce 관계를 검증한다. caller-supplied row/from은 받지 않으며 불확실은 UNKNOWN이다. API 전체 backend-stop 연결을 완료했다고 주장하지 않는다.

## 경계 검토

첫 capability는 async authorize에서 실제 chain을 읽은 후 발급한다. API의 동기 transaction 안에서 worker를 호출하는 재귀가 필요하지 않다. 각 issuer는 active callback의 private identity ticket을 한 번 소비한 뒤 미리 결합한 해당 payload만 서명한다. issuer 자체는 DB/RPC를 호출하지 않는다. Promise callback과 worker 재진입은 거부한다. 동기 callback 안의 API 실제 인증/원천/CAS 검사는 API 소유자에게 남는다.

adoption은 원래 row/manifest/bytes를 고치지 않고 별도 history를 추가한다. 현재 권한 기한과 원래 업무 기한을 분리하되 source cutoff/첫 시작+600/.3 expiry/최대120 범위를 늘리지 않는다. 새 API commit은 현재 adoptionId/hash에 결합하며 SEND_STARTED 직전 latest adoption/current/global fence를 다시 검사한다. 체인 조회 뒤 권한 변경, 응답 유실, 실제 child exit, 서명 bytes 변경을 다룬다. SEND_STARTED 이후는 hash 조회만 하며 자동 재전송하지 않는다.

claim의 business hash는 이미 고정된 권리/state에 한정한다. source 철회·key revoke·pause가 이미 accepted된 권리를 새 자격 관문으로 막지 않는다. 다만 거래 sponsor 서명은 필요하며 추가 **지급** 서명이 없다는 의미와 구분한다. 독립 sponsor claim의 receipt는 실제 token transfer와 readback으로 확인한다.

원래 E4 9개 중 consumer 1개만 root v4 명시 소비로 바뀌었다. 나머지 8개, E2/v1/v2/v3 및 A runtime 7개는 보존한다. 기존 preservation 시험 자체를 정확한 새 consumer SHA와 v4 SHA를 허용하도록 좁게 수정했다. A 인수의 다른 artifact 22개는 원래 SHA를 검사한다. 기존 9개 전부 불변이라고 기록하지 않으며 임의 지문 불일치를 허용하지 않는다.

## 남는 인수 조건

현재 source는 fixture controller 구성요소다. API4dec의 scope 계산과 B의 scope 계산이 다르므로 API가 새 계약을 명시 소비해야 한다. 과거 metadata row/global handle을 B 권한으로 재해석하지 않는다. 실제 API controller, 원천/동의/E3 검사, 전체 명령 조립, 자동 claim job, API까지 모두 멈추는 backend-stop 통합 검사는 미완료다. 해당 작업에 대한 지문/테스트/리뷰와 exact-head CI가 다시 필요하다.

로컬 Geth inclusion을 public PoS finality로 주장하지 않는다. E4 DB와 API DB를 함께 되돌리거나 같은 UID/root로 양쪽을 조작하는 상황까지 독립 보호하지 않는다. 기존 사용자 환경·키·실제 원천을 읽지 않았으며 reset/배포/병합/공개 체인/유료 호출은 없다. root의 중간 포트 코멘트는 source 동결 인수가 아니며 최종 head 검토는 별도다.

최종 로컬 수치·로그 지문은 `verification.json`, 구현/입력 SHA는 `source-pins.json`, 원격 exact-head 결과는 PR checks/본문을 따른다. 선언 파일은 Node의 TypeScript 구문 parser로 검사하며 전체 TypeScript typecheck를 수행했다고 기록하지 않는다.
