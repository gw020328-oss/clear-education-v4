import fs from 'node:fs';
import {resolve} from 'node:path';
import {root,read,save,sha} from '../lib/io.mjs';
const out=process.argv[2],e=read(out+'/execution.json'),t=read(out+'/timeline.json'),v=read(out+'/video-validation.json'),ai=read(`artifacts/ai/attempt-${e.aiAttempt}.json`);
if(e.status!=='PASS'||!e.actualLiveResponse||ai.status!=='VALID'||!v.allFramesDecoded||!v.underThreeMinutes)throw Error('DELIVERY_VALIDATION_FAILED');
const before=read(out+'/pre-filming-hashes.json'),changed=[];
for(const [p,h] of Object.entries(before))if(!fs.existsSync(resolve(root,p))||sha(fs.readFileSync(resolve(root,p)))!==h)changed.push(p);
if(changed.length)throw Error('PREEXISTING_FILE_CHANGED');
const textFiles=[],secretFindings=[];
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,entry.name);if(entry.isDirectory())scan(p);else if(/\.(json|txt|srt|md)$/.test(p))textFiles.push(p);}}
scan(resolve(root,out));for(const suffix of ['.json','.reserved.json','.request.json','.response.txt'])textFiles.push(resolve(root,`artifacts/ai/attempt-${e.aiAttempt}${suffix}`));
for(const p of textFiles){const s=fs.readFileSync(p,'utf8');if((process.env.GEMINI_API_KEY&&s.includes(process.env.GEMINI_API_KEY))||/\bAIza[\w-]{20,}\b|"privateKey"\s*:/.test(s))secretFindings.push(p.slice(root.length+1));}
if(secretFindings.length)throw Error('SENSITIVE_OUTPUT_DETECTED');
const captures=[['01-CLEAR-introduction',5],['02-live-AI-review',29],['03-approved-and-deposited',89],['04-four-completion-receipts',108],['05-independent-claim',134],['06-refund-success',151],['07-duplicate-rejected',164]];
for(const [name,second]of captures){const raw=second>=t.trim.start?second+t.trim.removedSeconds:second;const f=t.frames.reduce((a,b)=>Math.abs(b.t-raw)<Math.abs(a.t-raw)?b:a);save(out+'/captures/'+name+'.jpg',fs.readFileSync(resolve(root,out,f.path)));}
const summary={at:new Date().toISOString(),status:'PASS',preexistingFilesChecked:Object.keys(before).length,preexistingFilesChanged:changed,sensitiveTextFilesChecked:textFiles.length,sensitiveFindings:secretFindings,video:v,ai:{attempt:e.aiAttempt,httpStatus:ai.httpStatus,status:ai.status,model:ai.actualModel,latencyMs:ai.latencyMs,additionalCallsUsed:1,additionalCallsAuthorized:2,maximumAdditionalUSD:.06,reservedEstimateUSD:ai.estimatedCostUSD,usageEstimatedUSD:ai.usageEstimatedCostUSD,actualBilledUSD:null},checks:e.checks,reviewMethod:'Every frame decoded; entire 0-to-end timeline visually inspected using contact sheets sampled every 4 seconds. No real-time playback claim.',historicalChecksumPreserved:true};
save(out+'/delivery-verification.json',summary);
const text=`# CLEAR 공모전 시연 영상 — 촬영·검증 보고서

## 결과물

- 최종 영상: CLEAR-demo-subtitled.mp4 — ${v.durationSeconds}초, ${v.width}×${v.height}, H.264, 한국어 자막 포함, 무음.
- 원본: CLEAR-original-recording.mp4 — ${t.rawDuration.toFixed(3)}초, 1920×900 브라우저 실제 화면 연속 캡처. JPEG 원프레임은 frames/에 보존.
- 자막: subtitles.ko.srt. 캡처: captures/ (7개). 육안 검토 자료: video-review/.
- 화면 바깥에 180px 자막 영역을 추가하여 최종 16:9로 제작. 약 5fps 가변 프레임률이므로 일반 30fps 영상보다 마우스 움직임은 덜 부드러움.
- 원본 ${t.trim.start.toFixed(2)}~${t.trim.end.toFixed(2)}초의 AI 응답 대기 ${t.trim.removedSeconds.toFixed(2)}초만 제거. 성공 결과나 상태를 합성하지 않음.

## 실제 AI 생성

- 이번 촬영 중 Gemini ${ai.actualModel} 요청 1회, HTTP ${ai.httpStatus}, VALID, ${(ai.latencyMs/1000).toFixed(2)}초. 실시간 결과만 사용, 저장 응답 재생 없음.
- 승인한 추가 2회 중 1회만 사용하고 성공 즉시 종료. 보수적 요청 비용 추정 $${ai.estimatedCostUSD}, 응답 사용량 기반 추정 $${ai.usageEstimatedCostUSD}. 실제 청구 금액은 독립 검증하지 않음.
- 50/30 TEST가 충돌하는 고정 시연 안내문 사용. AI가 만든 확인 질문을 화면에서 확인하고 자동화가 검토자 역할로 50 TEST를 입력·승인.
- 과거 attempt-7의 HTTP 500 및 실패 촬영은 그대로 보존. 당시 caseId 기록은 complete이지만 실제 요청 본문은 conflict 안내문이었으며 기록 자체를 사후 수정하지 않음. 이번 attempt-${e.aiAttempt}는 conflict로 올바르게 기록.

## 장면과 근거

| 최종 시간 | 실제 실행 및 검증 |
|---|---|
| 0:00–0:15 | CLEAR 첫 화면, 서비스 설명 |
| 0:15–0:50 | 실제 AI 요청·초안·원문 근거·금액 충돌 질문 |
| 0:50–1:15 | 미해결 상태 승인 차단, 답변 후 승인, 양측 로컬 계정 서명 및 조건 해시 |
| 1:15–1:35 | 실제 로컬 스마트 컨트랙트에 50 TEST 예치 |
| 1:35–1:55 | 모의 발급자가 서명한 완료 확인서 4개 보관 |
| 1:55–2:10 | 메인 앱·발급 서버 실제 종료. PID 소멸과 메인 health 접속 실패 확인. 독립 RPC의 eth_chainId 응답 성공 |
| 2:10–2:35 | 독립 조건 검사 및 실제 환급. 잔액 +50 TEST, Paid/Transfer 이벤트, 거래 영수증 |
| 2:35–2:47 | 같은 증빙으로 recovery.claim 재호출 거절. UI 검사에도 이미 지급된 상태 표시 |
| 2:47–2:56 | 검증 범위 및 후속 개발 과제 |

환급 거래: ${e.receipt.txHash??e.receipt.transactionHash??'(execution.json receipt 참조)'}

중복 청구는 ALREADY_SETTLED_OR_NOT_ENROLLED 사전 검사에서 거절되므로 두 번째 온체인 거래를 전송한 장면은 아님. 별도 핵심 테스트에서는 온체인 중복 청구 거절도 검증.

독립 화면의 운영기관 API 요청은 0건. 다만 로컬 블록체인, 독립 RPC 및 별도 복구 화면 서버는 실행 상태이며 모든 서버가 꺼진 시연이 아님.

## 테스트 및 화면 검사

- 이번 촬영 실행 검사 ${e.checks.length}개 전부 통과: execution.json.
- 핵심 테스트 36/36: ../core-tests-1789374145805.json.
- 격리 회귀: stage6 11/11, stage11 binding 28/28: ../regression-1789374145192/.
- 현재 CLEAR 문구·메타데이터·호환성 검사 7/7: ../branding-static-1789374217749.json.
- 사전 전체 흐름 리허설: ../browser-1789373167138/result.json. 기존 모바일·데스크톱 검증: ../branding-1789372594608/. 이번 녹화는 데스크톱 1920×900으로 수행.
- 메인·독립 화면 탭 제목 CLEAR 확인. 현행 app/recovery 사용자 소스에서 구 브랜드 검색 결과 없음. 금고 기능 일반 명사 및 내부 식별자 유지.
- 최종 영상 전체 프레임 ${v.decodedFrames}개 디코딩 성공, 시간 순서 정상. 시작부터 끝까지 4초 간격 모든 접촉시트 육안 검사. 실시간 전체 재생을 했다는 의미는 아님.
- 화면 자막과 결과가 겹치지 않도록 별도 하단 영역 사용. 주소창·북마크바·개발자 도구·OS 알림은 브라우저 뷰포트 캡처에 포함되지 않음. macOS 데스크톱 화면 녹화 권한 불필요.
- 출력 텍스트 ${textFiles.length}개에서 실제 API 키 값/키 형태/개인키 필드 검사 이상 없음. 육안 화면 검사에서도 비밀값·개인정보 노출 없음. 주소와 서명은 임시 로컬 시연 계정의 공개 자료.

## 보존 및 구현 범위

- 촬영 직전 존재하던 ${Object.keys(before).length}개 파일 SHA-256 일치, 변경·삭제 0개. 과거 실패 결과·체크섬·캡처 보존. 이번 결과는 별도 폴더에 생성.
- 이번 작업에서 새로 만든 촬영·인코딩·검토·보고 스크립트 및 승인 기록만 추가/보완. production 앱, 스마트 컨트랙트, 함수/API/스키마, COST_LOCK은 변경하지 않음.
- 촬영용 서버 복사본에서만 명시 승인한 추가 AI 요청 경로 사용. 운영 앱의 기존 6회 한도는 그대로 유지하므로 기본 실행으로 추가 실시간 호출이 무제한 가능해진 것은 아님.

## 제출 전 사용자가 확인할 사항

1. 최종 MP4를 제출할 기기에서 한 번 재생해 글자 크기와 한국어 자막을 확인할 것.
2. 음성·배경음악 없는 버전이며, 공모전의 파일 용량·코덱·업로드 규칙을 직접 확인할 것. 확인되지 않은 대회 규정을 충족했다고 주장하지 않음.
3. 실제 사람 참여·실제 4주 경과·외부 지갑·테스트넷·실제 결제 연동 시연이 아님. 고정 시연 시계·모의 발급자·가치 없는 로컬 TEST 토큰 사용.
4. 사전 예치금과 유효한 증빙을 확보한 경우만 검증. 증빙 미발급 대응은 후속 과제.
`;
save(out+'/REPORT.ko.md',text);
console.log(JSON.stringify({out,status:'PASS',preexistingFilesChecked:Object.keys(before).length,sensitiveFindings:0,captures:captures.length}));
