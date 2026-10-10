# W02 provider 작성 세션 오류 진단

2026년 10월 10일 12:06–12:07 KST 관측 · 추천 **GPT-6 Astra / high** · 브라우저·인증·외부 서비스 경계를 구분하는 기술 확인.

**내장 브라우저에만 생기는 오류가 아니다. 로그인된 Chrome에서도 재현됐으며, 수동 작성 화면에 설정된 세션 서버의 DNS 주소 해석이 실패한다.** 현재 웹 앱이 호출하는 `dev-tool.reclaimprotocol.org`에서 두 공개 DNS resolver 모두 A·AAAA 응답을 반환하지 않았다. 따라서 로컬 코드 수정이나 재로그인으로 수동 작성 경로를 복구할 근거는 없다.

이름 해석 실패는 확인했지만, 해당 DNS 레코드가 사라진 이유나 Reclaim이 공식적으로 이 서버를 중단했는지는 확인하지 못했다. W02 실제 YBM 연결은 계속 미완료다.

## 비교 결과

| 검사 | 결과 | 해석 |
| --- | --- | --- |
| 로그인된 Codex 내장 브라우저 | Retry 후 동일한 `GenerateSession … Response closed without headers` | 현재도 재현 |
| Chrome | 사용자가 같은 계정 로그인 후 동일 오류 | 내장 브라우저 전용 문제 가설 배제 |
| 공개 웹 앱 코드 | 수동 builder의 gRPC-Web 대상이 `https://dev-tool.reclaimprotocol.org` | 실제 화면에 배포된 서버 설정 확인 |
| 운영체제 DNS 조회 | 서버 이름을 주소로 해석하지 못함 | 브라우저 바깥에서도 연결 선행 조건 실패 |
| Google DNS A·AAAA | NOERROR, Answer 없음 | IPv4·IPv6 접속 주소 없음 |
| Cloudflare DNS A·AAAA | NOERROR, Answer 없음 | 독립 resolver에서도 동일 |
| 대조군 `devapi.reclaimprotocol.org` | Google DNS에서 정상 주소 응답 | Reclaim 전체 도메인 또는 모든 DNS 요청의 실패는 아님 |
| TLS·CORS 사전 확인 | DNS에서 막혀 도달하지 못함 | 인증서 오류나 CORS 거부라고 분류할 수 없음 |

DNS 응답은 **NXDOMAIN이 아니라 NOERROR/NODATA**다. 도메인 전체가 없다고 단정하지 않고, 검사한 A·AAAA 접속 주소가 없다는 사실을 기록한다. DNS 설정을 바꾸거나 브라우저 쿠키를 다른 브라우저로 복사하지 않았다. Chrome 로그인은 사용자가 직접 완료했다.

브라우저 오류 문구 자체는 여러 연결 실패에서 나타날 수 있다. 이번 진단은 그 문구만으로 원인을 추정하지 않고 배포된 endpoint와 DNS 조회 실패를 함께 확인했다. Chrome 확장의 일반 경고는 이 세션 오류의 원인으로 채택하지 않았다.

## 근거

- [배포된 웹 앱 JavaScript](https://dev.reclaimprotocol.org/static/js/main.05e68e77.js): 수동 `ChatBackendClient`가 `channel.SessionService.GenerateSession`을 호출하며 backend 상수는 위 호스트다. 공개 파일만 내려받아 확인했고 로그인 토큰은 읽지 않았다.
- [브라우저·배포 코드 비교 기록](session-browser-comparison.json): 관찰 범위와 JavaScript SHA-256.
- [로컬 연결 진단](session-network-diagnostics.json): 자격 증명 없는 DNS/TLS/OPTIONS 시도. 세션 생성 API를 별도 스크립트로 호출하지 않았다.
- [DNS 교차 확인](session-dns-crosscheck.json): Google·Cloudflare의 A·AAAA 응답 및 정상 대조군.

공식 provider 안내는 기존 DevTool의 중단 예정과 AI Agent 사용 권고를 설명한다. 이는 대체 흐름을 검토할 근거지만, 이번 DNS 장애가 의도적인 중단 때문이라는 증거는 아니다. [공식 provider 안내](https://docs.reclaimprotocol.org/wtf-are-providers)

## 해결 방법과 권고

| 방법 | 필요한 조치 | 현재 판단 |
| --- | --- | --- |
| 수동 작성 경로 복구 | Reclaim 운영자가 기존 세션 서버의 DNS·서비스를 복구하거나, 프런트엔드의 backend 주소를 지원되는 새 endpoint로 수정 | 사용자 PC에서 고칠 수 있는 설정 문제가 아님. 운영자 확인 필요 |
| 공식 대체 작성 경로 검토 | AI Agent 또는 콘솔의 AI-Powered builder에서 비용·인증 정보 이동·추출 정책 검토 가능성을 확인한 뒤 YBM provider 작성 | 일정상 먼저 검토할 후보. 생성 성공은 아직 확인하지 않음 |

**권고는 대체 작성 경로의 적합성부터 확인하는 것이다.** 기존 세션 서버 복구를 기다리면서 반복 로그인·Retry를 하는 것보다, 현재 유지되는 작성 흐름이 CLEAR의 조건을 충족하는지 확인하는 편이 낫다. 다만 실제 provider의 원천·버전·정책·문맥·TEE 검증 조건은 그대로 유지한다.

Chrome에서 `New Provider → AI-Powered Beta` 입력 화면까지 열렸다. 공개 프런트엔드 코드상 첫 Next는 URL을 화면 상태에 저장하고, 설명을 입력한 두 번째 Next는 `api.reclaimprotocol.org/api/providers/register/ai-manual-auth`로 provider 등록을 시작한다. 따라서 입력 화면을 열어 본 사실을 provider 등록 성공으로 표현하지 않는다. 등록 요청·AI 실행·실제 로그인·증명 생성을 진행하지 않았다.

`devapi`나 `api` 주소가 DNS에서 확인된다는 이유만으로 기존 gRPC endpoint를 임의 교체하지 않는다. 같은 서비스·메서드를 지원한다는 근거가 없으므로 그 방식은 해결책으로 검증되지 않았다.

## 다음에 사용자가 필요한 시점

지금은 추가 로그인이나 조작이 필요 없다. 내장 브라우저와 Chrome의 Reclaim 로그인은 완료됐다. 다음 확인은 대체 builder의 비용과 데이터 처리 방식이다. 실제 YBM 인증 또는 모바일 앱 연결이 필요한 화면에 도달하면 대상 앱·전송 자료·수행할 조작을 먼저 설명하고 사용자에게 안내한다.

W02 상태는 **원인 진단 완료 / 수동 세션 오류 미해결 / 실제 증명 미검증**이다. 제품 코드·과거 실험 원본은 수정하지 않았다. 이번 변경은 작업본의 진단 기록과 진행 상태 문서에 한정된다.

다음 W02 작업에도 **GPT-6 Astra / high**를 권고한다.
