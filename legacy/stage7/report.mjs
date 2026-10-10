import { readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { jsonFile,sha } from './lib/process.mjs';
const root=fileURLToPath(new URL('./',import.meta.url)),out=join(root,'artifacts');
const data=JSON.parse(await readFile(join(out,'comparison-results.json'))),reg=JSON.parse(await readFile(join(out,'regression-results.json'))),preserve=JSON.parse(await readFile(join(out,'preservation-results.json'))),browser=JSON.parse(await readFile(join(out,'browser-checks.json'))),tap=await readFile(join(out,'stage7-tests.tap'),'utf8');
const passed=Number(tap.match(/^# pass (\d+)$/m)?.[1]??0),failed=Number(tap.match(/^# fail (\d+)$/m)?.[1]??-1);
if(data.protocolSha256!==sha(await readFile(join(root,'COMPARISON_PROTOCOL.md'))))throw new Error('PROTOCOL_CHANGED');
const summary={comparisonScenarios:data.summary.scenarios,comparisonProtocolMatches:data.summary.protocolMatches,existingTestsPassed:reg.totalPassed,newTestsPassed:passed,newTestsFailed:failed,totalAutomatedTestsPassed:reg.totalPassed+passed,preservation:preserve,secretAudit:{exactGeneratedSecretMatches:data.summary.secretMatches,filesScanned:data.results.reduce((n,r)=>n+r.secretAudit.filesScanned,0),logStreamsScanned:data.results.reduce((n,r)=>n+r.secretAudit.logStreamsScanned,0),additionalOutputsScanned:data.results.reduce((n,r)=>n+(r.secretAudit.additionalOutputsScanned??0),0)},actualUsers:0};
await jsonFile(join(out,'verification-summary.json'),summary);
const outcome=v=>`${v.success?'지급':'거절/실패'} ${v.elapsedMs.toFixed(1)} ms${v.code?' · '+v.code:''}`;
const rows=data.results.map(r=>`| ${r.id} | ${outcome(r.central)} | ${outcome(r.onchain)} | ${r.central.userActionCount}/${r.onchain.userActionCount} | ${r.protocolMatch?'일치':'불일치'} |`).join('\n');
const race=data.results.find(r=>r.id==='concurrent-replay'),loser=race.onchain.attempts.find(a=>a.transactionHash&&!a.success);
const md=`# 중앙 방식–온체인 방식 공정 비교 결과

**최종 판정: 특정 고위험 상황에서만 조건부 지지.** 독립 중앙 실행자가 중단된 상황에서 살아 있는 체인으로 기존 조건을 집행하는 좁은 기술적 권한을 확인했다. 주 서비스·발급자 중단 대응, 증빙 휴대성, 사전 예치는 양쪽의 공통 효과다. 체인·RPC·가스 의존성과 복구 부담을 감안하면 일반 교육 환급에 블록체인이 필요하다는 결론까지 뒷받침하지 않는다.

최종 실행: ${data.completedAt}. 실제 사용자 **0명**. 중앙은 모의 원장, 온체인은 무가치 TEST 토큰이다. 외부 보안 감사·실자금·공개 배포를 하지 않았다.

## 사전 동결 조건과 실제 결과의 차이

[COMPARISON_PROTOCOL.md](COMPARISON_PROTOCOL.md)는 구현 전에 동결했다. SHA-256은 \`${data.protocolSha256}\`이며 실행/검사에서 일치했다. 시나리오·금액·기한·기대값을 결과에 맞춰 변경하지 않았다. **${data.summary.protocolMatches}/${data.summary.scenarios}개 쌍**이 예상 판정과 일치했다. 중앙 ${data.summary.centralSuccess}개 지급/${data.summary.centralFailure}개 거절·실패, 온체인 ${data.summary.onchainSuccess}개 지급/${data.summary.onchainFailure}개 거절·실패다. 잘못된 입력의 정상 거절도 포함한 인위적 조건 집계로서 신뢰도·실패율·우열 점수가 아니다.

구현 후에는 시계 관측·입력 해시·공개 입력 보관·호출 결과 수 계측을 보강하며 전체 비교를 재실행했다. 동결 규칙의 변경은 없다. 브라우저에서 완료 뒤 남은 조건 문구가 다시 보이는 것을 발견해 7단계 UI의 완료 안내를 고쳤다. OS 파일 선택은 Chrome 권한 문제로 완료하지 못해 **사전에 허용한 동일 데모 입력**을 양쪽에 사용했다. 실제 확장 지갑 승인은 수행하지 않았다. 모바일은 브라우저 확대 배율을 고려해 DOM 실측 390×844로 확인했다.

## 실행 표

시간은 각 자동 클라이언트의 요청 시작부터 지급 확인 또는 실패 반환까지다. 중앙/온체인 순서로 실행하며 판정 초는 고정했다. acceptedToConfirmedMs는 중앙의 HTTP 요청 수신→검증/commit, 온체인의 전송 hash 수신→영수증/지급 검증으로 시작점이 다르므로 직접 성능 비교하지 않는다. 공통 요청→확인 시간을 주 측정값으로 삼았다. UI 중단 CLI의 프로세스 시작 시간은 cliProcessElapsedMs에 따로 있다. 로컬 시간·호출 수를 실제 운영망 성능·비용·사용성으로 일반화하지 않는다.

| 시나리오 | 중앙 결과·요청→확인 | 온체인 결과·요청→확인 | 자동 청구 호출 수 중앙/온체인 | 동결 예상 |
|---|---|---|---|---|
${rows}

각 쌍은 같은 참가자·50,000,000 최소 단위·기한·동의와 서명을 사용했다. [원시 JSON](artifacts/comparison-results.json)의 두 클라이언트 입력 SHA-256, 중앙의 성공 처리 입력 해시, [보관 입력](artifacts/inputs/)을 대조했다. 온체인 거래는 같은 JSON의 receipt/signature를 ABI로 인코딩하므로 JSON 자체가 체인에 저장되는 것은 아니다. 중앙 시각은 별도 clock.txt, 온체인 시각은 실제 마지막 블록 timestamp로 관측했다. chain-down에서는 중단 후 온체인 상태를 알 수 없다고 표시하고 이전 값만 별도로 남겼다.

각 시나리오의 필수 구성요소, 실패 구성요소, 추가 승인, 사용자 복구, 계정·가스·RPC, 준비금, 변경·정지·회수 주체, 권리와 책임은 JSON의 각 rail에 기록했다. 자동 청구 호출 수는 실제 반환된 결과 수이며 사람의 행동 관측값이 아니다. 실제 UI 성공 경로는 중앙 ${browser.central.observedActionTrace.length}회, 온체인 ${browser.onchain.observedActionTrace.length}회의 버튼 trace였다. 가스 준비·환경 구축·실제 지갑 승인·실패한 파일 선택 1회는 이 성공 trace에 포함하지 않는다. 이 숫자로 사용성 우위를 판정하지 않는다.

## 두 방식이 공통으로 해결한 문제

1. **휴대 가능한 증빙과 자동 검증**: 서명 파일을 가진 참가자는 학교 로그인·DB·API나 발급자의 새 승인 없이 이미 고정된 수령자로 청구할 수 있었다. main-down, issuer-down, both-down에서 양쪽 모두 지급했다. UI 두 프로세스를 실제 종료한 뒤에도 각자 별도 CLI 프로세스로 저장 파일을 읽고 지급했다.
2. **사전 예치**: 등록 시 참가자별 50 TEST 상당을 전액 확보하고 지급 때 소진했다. 학교의 사후 유동성이나 추가 승인에 의존하지 않는다. underfunded에서 중앙 자금은 1 최소 단위 부족, 온체인 허용량도 1 단위 부족으로 등록이 실패했고 어느 쪽도 지급하지 않았다. 법적 자산 분리나 실제 금융기관 보관을 입증한 것이 아니다.
3. **일회성과 고정 수령자**: 위조·중복·다른 수령자·기한 만료는 양쪽 거절했다. 경쟁 청구와 재청구에서 누적 지급은 각각 정확히 50 TEST 상당 1회였다. 전달자가 증빙을 제출하더라도 수령 주소를 바꿀 수 없었다. 중앙은 BEGIN IMMEDIATE와 지급 PK, 온체인은 고정 계약의 상태 전이로 보장했다.

이번 실행 경로에 **AI 모델은 없다**. 따라서 서명 구조·독립 집행의 효과를 AI의 효과라고 부르지 않는다. AI가 제출 판단을 도울 수 있다는 가능성, 정확성·시간 절감은 측정하지 않았다.

## 해결하지 못한 사실 검증

missing에서는 서명 4개 중 마지막이 없어 양쪽 모두 거절했다. false-attestation에서는 실제 제출을 하지 않은 상태에서 mock issuer가 정상 서명을 발급했고 양쪽 모두 지급했다. 원래 issuer의 issue-all 자체가 교육 제출 DB를 확인하지 않는 실험 구현이다. 이 조건은 실제 기관의 거짓 행동을 관측했다는 뜻이 아니다. 정상 서명은 발급자 주장과 조건의 일치를 검증하며 **학습 성과나 실제 제출 사실의 참을 증명하지 않는다**. 다른 정상 시나리오도 mock 증빙이며 실제 수강생 데이터가 아니다.

## 블록체인만 추가한 권리

executor-down에서 독립 중앙 지급 실행자의 실제 프로세스를 종료한 뒤 중앙 청구는 접속 실패했고, 온체인은 기존 저장 증빙으로 지급했다. 따라서 **특정 중앙 지급 실행자의 새 승인이나 가동을 거치지 않고, 살아 있는 체인과 정직한 RPC에서 고정된 예치 조건을 집행하는 기술적 청구 경로**가 추가된다. 수령자와 가스 보유 전달자를 분리하므로 제삼자가 대신 전달해도 수령자가 바뀌지 않는다.

이 실험이 확인한 것은 실행자 중단이다. 악의적인 지급 거부·DB 변경은 중앙 운영자가 코드/원장을 통제한다는 구조 분석이며 실제 조직의 악의 증거가 아니다. 또한 법적 권리의 유효성이나 분쟁 집행력을 평가하지 않았다. 로컬 Ganache를 단일 운영자가 통제하므로 분산 운영망의 검열 저항성을 실증한 것도 아니다.

## 블록체인 때문에 추가된 부담

- chain-down에서는 유일한 체인 프로세스와 모든 **제공된** RPC가 실제 사라져 온체인만 실패했고 중앙은 지급했다. 전 세계 체인·인터넷 장애 실험은 아니다.
- no-gas에서는 새 전달 지갑이 예상 거래비용을 감당하지 못해 온체인만 거래 전 거절했고 중앙은 지급했다. 가스 획득이나 다른 가스 보유 전달자 사용이 필요하며 대납 서버는 없다. Ganache 잔액 조작으로 실패를 성공으로 바꾸지 않았다.
- 전달 지갑, 가스, 올바른 체인/RPC, 신뢰 manifest 보관·검증이 추가된다. 동시 경쟁의 패한 온체인 거래는 revert로 끝났고 가스 ${loser?.gasUsed??'미기록'} 단위를 소비했다. 중앙의 재청구 거절에는 사용자 가스가 없다. 중앙 운영 비용이 없다는 뜻은 아니다.
- 조건 변경·관리자 동결·조기 회수 제한은 장점이지만 고정 설정 오류·수령 키 유실·버그 복구도 어렵게 한다. 임의 복구/업그레이드 기능을 추가해 이를 해결한 것으로 표현하지 않는다.

## 같은 기준의 권한·의존성 비교

| 기준 | 독립 중앙 에스크로 | 온체인 금고 |
|---|---|---|
| 청구 시 학교/issuer 추가 승인 | 없음 | 없음 |
| 지급 실행의 필수 계층 | 실행자 서버·영속 원장·서버 시계 | 체인·정직한 RPC·고정 토큰·전달 지갑·가스 |
| 파일 직접 제출·UI 장애 대안 | 독립 화면 / 실행자 API CLI | 독립 화면 / 체인 RPC CLI |
| 새 청구 계정·지갑 | 로그인·새 지갑 불필요 | 별도 서비스 로그인 불필요, 전달 지갑 필요 |
| 동일 증빙의 등록 | 같은 EOA 동의 서명 사용 | 같은 EOA 동의 서명 사용 |
| 준비금 | 참가자별 영속 모의 원장 50 TEST 상당 | 참가자별 금고 50 TEST |
| 변경·정지 통제 | 독립 운영자가 코드·DB·실행을 통제 | 계약/토큰에 관리자 변경·동결 없음; 테스트 체인 운영자는 체인을 정지·조작 가능 |
| 만료 전 회수 | 정상 원장 API에서 불가, 운영자의 DB 권한은 남음 | 계약에서 불가; 만료 후 sponsor 고정 반환 |
| 사용자가 통제하는 복구 | 저장 파일로 다른 UI/CLI 사용, 실행자 복구는 운영자 필요 | 저장 파일·다른 전달 지갑/동일 체인 접속 사용, 체인 전체 복구는 사용자만으로 불가 |
| 정정·복구 가능성 | 운영자의 복구 권한/백업이 장점이자 신뢰 전제 | 변경 제한이 강하지만 오류 정정/키 유실 복구가 어려움 |
| 새 책임 | 파일·기한 관리, 실행자와 원장 신뢰 | 파일·키·지갑·가스·RPC·manifest·기한 관리 |

중앙에 고의적 지연이나 추가 학교 승인, 비영속 원장, 단일 UI만 두는 약한 조건을 적용하지 않았다. 실제 중앙 운영자의 서명 검증/원자적 일회 지급은 온체인과 같은 수준으로 제공했다. 중앙 등록도 같은 체인 명세를 사용하지만 청구와 서버 재시작에는 체인 조회가 없다는 것을 chain-down으로 확인했다. 두 시스템의 자금은 각각 별도로 예치한 비교 원금이며 동일 원금의 이중 지급이 아니다.

## 어느 조건에서 유리한가

**중앙 방식이 유리한 조건**은 독립 실행자를 충분히 신뢰할 수 있고 지갑·가스·RPC 운영 부담을 줄이거나 오류 정정이 중요한 경우다. 체인 중단과 전달자 가스 부족에서도 중앙 지급이 계속됐다. 중앙 서버/원장 운영과 장애 복구 부담은 운영자에게 남는다.

**온체인 방식이 유리한 조건**은 독립 실행자 자체의 중단·승인권에 의존하지 않는 것이 중요한 경우이며, 체인·정직한 RPC·가스·정확한 고정 설정이 유지돼야 한다. 이 좁은 추가 권한을 위해 감수할 비용이나 실제 위험 빈도는 이번 실험에서 측정하지 않았다.

## 검사와 증거의 범위

- 동결 장애/정상/오류 시나리오 **${data.summary.protocolMatches}/${data.summary.scenarios}** 일치. 실제 종료 PID/exit/접속 불가 증거를 각 행에 보관했다. UI 토글로 중단을 흉내 내지 않았다.
- 새 자동 검사 **${passed} 통과 / ${failed} 실패**. 별도의 두 OS 원장 작성자가 동시 실행해 정확히 한 번 지급했고, 실행자 재시작 뒤 지급/재청구 상태를 유지했다. 정상/compact/v=0/객체 signature/high-s/추가 필드/잘못된 타입/1MiB/깊은 JSON의 중앙 HTTP 판정이 공통 검증기와 일치했다. 두 UI의 실제 응답 HTML 동일성, CSP/Host/경로/demoMode를 검사했다.
- 기존 회귀 **${reg.totalPassed}/80**: stage2 60, stage3 3, stage4 6, stage6 11. 합계 자동 테스트 **${reg.totalPassed+passed}개**이며 별도 17개 시나리오를 다시 더해 테스트 수를 부풀리지 않는다. 원시 TAP과 기존 단계별 결과는 artifacts에 있다.
- 별도로 stage7 JavaScript 모듈 16개의 Node 문법 검사가 통과했다(artifacts/syntax-checks.json). JSON 집계·문서 표의 숫자와 두 입력 해시의 일치도 확인했다.
- 실제 Chrome: main/issuer 종료 후 새 탭에서 같은 데모 파일, 정상 지급, 재청구 거절, 누락 파일 오류, 접속 주소 변경 초기화/거절, 같은 DOM 실측 390×844를 확인했다. 중앙 ${browser.central.localRequestToConfirmedMs.toFixed(1)} ms, 온체인 ${browser.onchain.localRequestToConfirmedMs.toFixed(1)} ms는 각각 한 번의 로컬 버튼 실행 관측이다. 실제 확장 지갑 대신 가스가 배정된 Ganache 잠금 해제 전달자를 사용했다.
- stage2~6 **${preserve.beforeFiles}개 파일**: 변경 ${preserve.changed.length}, 추가 ${preserve.added.length}, 누락 ${preserve.missing.length}. 원본과 기존 실행 기록을 보존했다. 기존 8545·4400 프로세스를 종료/변경하지 않았다.
- 시나리오의 sponsor/learner/issuer/relayer 생성 키를 저장 파일 ${summary.secretAudit.filesScanned}개 관측, 자식 로그 ${summary.secretAudit.logStreamsScanned}개 스트림, 추가 결과/CLI 출력 ${summary.secretAudit.additionalOutputsScanned}개와 정확 문자열 대조한 결과 일치 **${summary.secretAudit.exactGeneratedSecretMatches}건**. 이는 실제 수행한 범위의 검사이며 시스템 전체 메모리/환경/외부 로그에 대한 비밀 유출 보증이 아니다. 브라우저 fixture의 5개 파일·6개 로그도 일치 0건이었다. 개인키·시드는 보고서/화면/증빙에 넣지 않았다.

## 입증하지 못한 주장

실제 OS 파일 선택 완료, 실제 확장 지갑 승인/변경/잠금/교체 조작, 독립 대체 RPC 서버, 현실 분산망의 finality/reorg/검열 저항, 물리 전원 차단·디스크 손상·은행/PG 원자적 지급, 신뢰 UI와 manifest의 안전 배포, 악성 RPC, 다른 토큰 안전성, 법적 독립 예치, 실자금 안전성은 미검증이다. 재시작 검사는 프로세스 SIGTERM과 영속 SQLite의 재오픈이며 전원 손실 복구 시험이 아니다.

지급 코드와 실제 결과에서 새 승인 호출이 필요하지 않음을 확인했지만 전체 네트워크 트래픽을 계측하지 않았으므로 “중단 후 요청 0건” 같은 수치를 만들지 않는다. 학교·발급자 미협조, 거짓 서명, 체인/토큰 장애의 한계는 남는다. 실제 사용자가 없으므로 선호·편의·시장 수요·이탈·분쟁 감소는 판단하지 않는다.

## 공모전에서 사용할 수 있는 한 문장

“보관한 서명 증빙과 독립 사전 예치는 중앙·온체인 모두 학교 중단 뒤 환급을 가능하게 했고, 온체인은 체인·RPC·가스가 정상일 때 중앙 지급 실행자 중단에도 고정 조건을 집행하는 좁은 권한을 더했다.”

## 최종 판단과 다음 단계

**특정 고위험 상황에서만 조건부 지지**한다. 동결 판정 규칙대로 executor-down의 추가 권한은 확인됐지만 chain-down/no-gas의 추가 실패도 확인됐다. 대부분의 핵심 효과는 강한 중앙 에스크로에도 있었다. 독립 실행자 위험의 실제 빈도와 추가 운영 부담의 교환 가치를 모르는 상태에서 일반적인 블록체인 필요성이나 시장성을 확정할 수 없다.

8단계로 진행할 수 있다. 다만 실제 파일 선택·확장 지갑 검증과 실제 사용자 연구는 남은 과제로 넘기고, 이번 결과를 실자금 서비스 출시 승인으로 사용하지 않는다. 다음 단계의 구체적 범위는 별도 요청에 따른다.
`;
await writeFile(join(root,'COMPARISON_RESULTS.md'),md);
console.log(JSON.stringify({scenarios:data.summary.protocolMatches,existingTests:reg.totalPassed,newTests:passed,preserved:preserve.allPreserved}));
if(failed!==0||passed!==21||reg.totalPassed!==80||!preserve.allPreserved||data.summary.protocolMatches!==17)process.exitCode=1;
