# r8 ERROR_INVALID_CLAIM 오프라인 조사 — 2026-10-24

r8는 전송 제한을 통과하고 SDK가 `ERROR_INVALID_CLAIM` 오류 응답을 반환한 뒤, 기존 `ACCOUNT_RETURN_VALIDATION / COLLECTOR_SIGNED_CLAIM`에서 안전하게 중단됐다. **검증 실패의 세부 원인은 미확정**이다. 코드에서 확인한 결함은 이 넓은 오류의 세부 범주를 안전하게 관측하지 못하는 진단 공백이다. 특정 TLS·ZK·서명 결함을 확인하거나 고쳤다고 주장하지 않는다.

사용자는 로그인 없는 분석·수정·검증·최종 CI를 요청했다. 요청 설정은 Astra / Ultra이며 현재 턴의 실제 모델을 별도 도구로 변경·확인했다는 뜻이 아니다. 기존 검토 담당자를 재사용했다. 새 실제 실행·로그인·CA·READY·AI·지급·병합은 수행하지 않는다.

## 보존된 r8 근거

| 관측 | 결과와 한계 |
| --- | --- |
| 전체 encoded RPC frame | 64,369,573 bytes. 제한 104,857,600 bytes 이내 |
| 송신 입장 당시 socket queue / 보유량 / pending | 0 bytes / 64,369,573 bytes / 1 |
| sender 완료 | wait 18.373ms, send 17,619.041ms. 로컬 송신 완료이며 claim 유효성 증거는 아님 |
| claim RPC / SDK call | 각각 COMPLETED, 약 24,576.057ms / 36,160.094ms |
| SDK_RETURN | OBSERVED / ERROR / ERROR_INVALID_CLAIM / ATTESTOR_SDK / PROTO_ERROR_CODE |
| 첫 FAILED | ACCOUNT_RETURN_VALIDATION / COLLECTOR_SIGNED_CLAIM |
| 후속 | BC_REVISION_CONFLICT, COLLECTION_FAILED는 바깥 실패 처리 결과 |
| 완료 여부 | 실제 공식 claim 검증·certificate·Moodle·AI·지급 완료 없음. evidence 및 지급 관련 행 0 |
| 종료 | 프로세스 exit 1, 관리형 세션 0, 해당 HTTPS/RPC listener 없음, 요청 REVOKED |

진단 `.4`는 COMPLETE, truncated=false다. 오류 message/data와 반환 서명 필드 존재 여부를 당시 저장하지 않았으므로 복구하거나 추측으로 채우지 않는다. r5/r6/r7/r8의 사용 표시·진단·보고서·DB 20개 및 r8 종료 확인 1개, 이전 immutable 세대 45개를 지문으로 보존한다. r7의 로컬 32MiB 합계 제한 실패와 이번 오류는 다른 관측 경계다.

## 고정 SDK와 공식 서버 소스

두 prefix 모두 Attestor 5.1.4, zk-symmetric-crypto 5.1.6, TLS 0.1.4다. 각 패키지의 두 prefix `lib/index.js` 지문은 서로 같다. 기존 lock과 엔진 STWO를 유지한다. npm 5.1.4의 gitHead `bc36dac3657fc46b79b4ecd545262c32440b05a6`에 고정한 공식 소스를 조사했다. 이 공개 소스가 r8 시점 배포 서버의 정확한 실행 버전이라는 증거는 없다.

1. SDK `lib/index.js` 8308–8342는 unsigned ClaimTunnelRequest를 인코딩·서명한 뒤 동일 client의 claimTunnel RPC를 await하고 반환값을 그대로 돌려준다. 오류 응답도 resolve할 수 있어 SDK_CALL COMPLETED와 invalid claim이 함께 나타나는 것은 모순이 아니다.
2. 공식 [claimTunnel handler](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/handlers/claimTunnel.ts)는 tunnel 요청·transcript 대조를 먼저 수행한다. 이후 시간/claim 검증의 예외는 ERROR_INVALID_CLAIM 계열 응답에 넣는다. claim이 없으면 claimSignature는 빈 값이지만 resultSignature는 만들어질 수 있다. 응답 서명의 존재나 유효성이 유효한 claim을 뜻하지 않는다.
3. [assertValidClaimRequest / decryptTranscript](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/assert-valid-claim-request.ts)는 요청 서명, TLS 복원, packet/ZK, provider 검증을 포함한다. packet 오류의 넓은 wrapper만으로 ZK 연산 실패를 단정할 수 없다. 참여자 동의 서명과 SDK claim 요청 서명도 별개다.
4. [processHandshake](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/server/utils/process-handshake.ts)는 TLS handshake와 원천 서버 인증서 경계를 검사한다. 이는 사용자 브라우저의 로컬 CA 신뢰 성공과 별개다.
5. 고정 SDK `lib/index.js` 8523 및 CLEAR worker-response는 RPC 전에 HTTP receipt를 각각 검사한다. r8의 로컬 응답 검사 완료는 관측됐지만 서버가 복원한 transcript까지 같고 유효하다는 증거는 아니다. [HTTP provider](https://github.com/reclaimprotocol/attestor-core/blob/bc36dac3657fc46b79b4ecd545262c32440b05a6/src/providers/http/index.ts)의 recipe/response 판정 오류도 넓은 invalid-claim 경로에 포함될 수 있다.

공개 handler의 시간 검사는 클라이언트 시각이 서버보다 미래로 크게 벗어난 경우를 검사한다. r8의 총 경과 시간만 보고 단순 만료를 원인으로 결론 내리지 않는다. 배포 서버의 시간·설정·버전 차이는 미확정이다. external-rpc의 AVS 분기와 이 직접 claimTunnel 경로를 혼동하지 않는다.

과거 성공 경로의 현재 설치 버전은 5.1.5/5.1.7이지만 당시 실행 지문·엔진 override를 확정할 수 없다. 기존 [r6 조사](BOOTCAMP_R6_FAILURE_REVIEW.ko.md)의 허용된 요약만 참조했다. 과거 원문 proof·계정 응답·cookie·키를 복원하거나 재사용하지 않았다. 버전 교체나 엔진 전환을 해결책으로 선택할 근거는 아직 없다.

## 변경과 개인정보 경계

새 진단 `.5`는 SDK_RETURN 관측에 `claimReturn`만 더한다. `reasonHint`는 UNKNOWN, REQUEST_SIGNATURE, TIMESTAMP_WINDOW, TLS_HANDSHAKE, ZK_PROOF, TRANSCRIPT_PACKET, HTTP_PROVIDER_RECEIPT의 7종이다. basis는 항상 **REMOTE_ERROR_HINT**이며 검증된 원인 판정이 아니다. error/claim 및 두 서명 필드의 구조적 존재 여부 4개 boolean을 함께 남긴다. 서명 바이트·주소·요청은 기록하지 않고 실제 서명 검증 성공도 뜻하지 않는다.

분류기는 own numeric code=5의 오류만 다룬다. own data-property의 primitive message를 잠깐 읽어, 길이 2048자 이하·제어문자 없음·검토한 전체 literal/template 일치 조건에서 고정 enum으로 바꾼다. 부분 문자열 추측, 객체 문자열 변환, getter/Proxy trap 호출, data/stack/cause 접근을 하지 않는다. 알 수 없거나 긴/다른 형태는 UNKNOWN이다. 원문은 출력·직렬화·보관하지 않는다. 기존 transport 오류 분류는 계속 WeakMap 출처를 사용한다.

저장 sink도 값을 다시 허용 목록으로 제한한다. 다른 오류 코드에는 구체적인 invalid-claim hint를 붙이지 못하며, 임의 필드·문자열·객체는 폐기한다. 기존 상대 시간·128개 이벤트 상한·0600 atomic 저장·불완전 표시·정리 정책을 유지한다. 실패 응답에 claim과 두 서명 필드가 함께 있어도 기존 COLLECTOR_SIGNED_CLAIM에서 거절한다. 공식 서명, 요청·지갑 결합, replay, 신선도, lease, 동의·금액·지급 및 전송 한도는 바꾸지 않는다.

## 검증과 다음 시험에 남은 질문

합성 회귀는 모든 고정 범주, 실제 고정 protobuf 왕복, 오류와 서명 필드가 공존하는 반환의 거부, getter/Proxy/긴 메시지/부분 일치/악성 필드의 비노출, 기존 정상·실패 결과 보존을 검사한다. 로컬 테스트와 exact source/dependency pin, 최종 HEAD CI 결과는 [v17 검증](BOOTCAMP_V17_VERIFICATION.json) 및 PR102에 기록한다. 합성 검증은 실제 TLS/ZK 성공을 대신하지 않는다.

다음 승인된 단회 시험은 먼저 SDK_RETURN 코드·hint·presence와 기존 단계 시간을 함께 확인한다. REQUEST_SIGNATURE이면 요청 서명/인코딩, TIMESTAMP_WINDOW이면 시각 경계, TLS_HANDSHAKE이면 handshake 복원, ZK_PROOF이면 명시적 verifier 오류, TRANSCRIPT_PACKET이면 넓은 packet 처리, HTTP_PROVIDER_RECEIPT이면 서버 HTTP 판정으로 조사 범위를 좁힐 수 있다. UNKNOWN이나 배포 서버의 다른 메시지는 그대로 미확정으로 남긴다. 어떤 hint도 엔진 변경·시간 연장·오류 claim 수용을 자동 허용하지 않는다.

이 작업의 완료 상태는 **오프라인 코드·검증·최종 CI 완료 후 본부 재시험 지시 대기**다. 새 호스트·CA·로그인 준비를 시작하지 않는다.
