// Continuous actual browser recording; live AI only with explicit bounded authorization.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chrome} from './browser.mjs';
import {root,read,save,sha} from '../lib/io.mjs';
import {cases} from '../policy/product.mjs';
const endpoints=read(process.argv[2]),live=process.argv.includes('--live'),out=`artifacts/clear-film-${Date.now()}`;
const aiAttempt=Number(process.argv.find(x=>x.startsWith('--attempt='))?.split('=')[1]??7);
fs.mkdirSync(resolve(root,out,'frames'),{recursive:true});
const beforeFiles={};
function inventory(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=resolve(dir,e.name);if(e.name==='.runtime'||p===resolve(root,out))continue;if(e.isDirectory())inventory(p);else if(e.isFile())beforeFiles[p.slice(root.length+1)]=sha(fs.readFileSync(p));}}
inventory(root);save(out+'/pre-filming-hashes.json',beforeFiles);
const b=await chrome(),frames=[],events=[],checks=[];let recording=false,recordTask,started,editDelay=0,trimEnd=24,mouse={x:70,y:70};
const need=(ok,id)=>{checks.push({id,passed:!!ok});if(!ok)throw Error(id);};
const stamp=(id,detail={})=>{events.push({t:(performance.now()-started)/1000,id,...detail});console.log(JSON.stringify({out,event:id}));};
const at=async t=>{const remaining=(t+editDelay)*1000-(performance.now()-started);if(remaining>0)await delay(remaining);};
async function scan(){const s=await b.evaluate(`(()=>{const t=document.body.innerText+' '+document.title+' '+[...document.querySelectorAll('input,textarea')].map(x=>x.value).join(' ');return {old:/약속금고|환급 약속 금고/.test(t),secret:/\\bAIza[\\w-]{20,}\\b|privateKey|GEMINI_API_KEY|GOOGLE_API_KEY/.test(t),brand:document.title.startsWith('CLEAR'),overflow:document.documentElement.scrollWidth>innerWidth}})()`);need(!s.old&&!s.secret&&s.brand&&!s.overflow,'visible-brand-layout-secret-check');}
async function cursor(){await b.evaluate(`(()=>{if(!document.querySelector('#film-pointer')){const x=document.createElement('div');x.id='film-pointer';x.textContent='';Object.assign(x.style,{position:'fixed',width:'18px',height:'18px',border:'3px solid #5741d9',background:'#ffffffbb',borderRadius:'50%',zIndex:'2147483647',pointerEvents:'none',left:'70px',top:'70px'});document.body.append(x)}})()`);}
async function move(x,y){await cursor();const old={...mouse};for(let i=1;i<=12;i++){mouse={x:old.x+(x-old.x)*i/12,y:old.y+(y-old.y)*i/12};await b.call('Input.dispatchMouseEvent',{type:'mouseMoved',...mouse});await b.evaluate(`Object.assign(document.querySelector('#film-pointer').style,{left:'${mouse.x-9}px',top:'${mouse.y-9}px'})`);await delay(35);}}
async function focus(selector){await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'smooth'})`);await delay(700);}
async function click(selector){await focus(selector);const r=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await move(r.x,r.y);await delay(400);await b.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r});await b.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r});}
async function type(selector,value){await click(selector);await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);await b.call('Input.insertText',{text:value});need(await b.evaluate(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`),'typed-value-exact');}
const subtitles=[
 [0,7,'CLEAR | 조건은 명쾌하게, 환급은 투명하게','AI 환급 조건 검토와 블록체인 직접 환급 서비스'],
 [7,15,'운영기관이 환급금을 미리 맡기고, 참가자가 완료 확인서로 직접 청구합니다.','로컬 시제품의 실제 작동 화면 · 무음 시연'],
 [15,26,'AI가 안내문에서 환급 조건 초안을 만들고 원문 근거를 연결합니다.','저장된 시연 응답 · 이전 Gemini 응답 재생 (새 AI 호출 없음)'],
 [26,38,'환급액 · 활동 기간 · 완료 조건 · 발급자 · 청구 마감을 검토합니다.','저장된 시연 응답 · 인용 근거를 펼쳐 원문과 대조'],
 [38,50,'AI가 결정하지 않습니다. 빈칸과 충돌은 사람이 확인합니다.','저장된 시연 응답 · 50 / 30 TEST 충돌을 확인 질문으로 표시'],
 [50,61,'미해결 질문이 있으면 승인할 수 없습니다.','자동화가 검토자 역할 수행 · 최종 50 TEST를 확인하고 질문에 답변'],
 [61,69,'운영기관과 참가자가 확인한 조건만 실행 계획으로 확정됩니다.','검토 승인 후 운영기관 역할과 참가자 역할이 각각 서명'],
 [69,75,'승인된 조건의 디지털 지문(조건 해시)을 생성합니다.','서명·조건 해시는 실제 로컬 실행 결과'],
 [75,95,'운영기관이 환급 재원을 금고 계약(스마트 컨트랙트)에 예치합니다.','50 TEST는 로컬 시연용 토큰이며 실제 화폐가 아닙니다.'],
 [95,115,'참가자는 지정 발급자가 서명한 완료 확인서(증빙) 4개를 보관합니다.','고정된 시연 시계와 모의 발급자를 사용했습니다.'],
 [115,119,'운영기관 앱과 완료 확인서 발급 서버의 종료를 실행합니다.','블록체인과 별도 독립 환급 화면은 계속 실행됩니다.'],
 [119,130,'운영기관 앱과 완료 확인서 발급 서버를 종료했습니다.','프로세스 종료·메인 접속 실패 확인 / 로컬 체인·독립 RPC는 실행 중'],
 [130,143,'이미 받은 유효한 증빙으로 운영기관의 추가 지급 승인 없이 직접 청구합니다.','조건·양측 서명·준비금·완료 확인서 4개를 독립 화면에서 검사'],
 [143,155,'환급 성공: 참가자 잔액 +50 TEST · 지급 이벤트와 영수증 확인','이번 실행에서 독립 화면의 운영기관 API 요청 0건'],
 [155,167,'같은 환급은 한 번만 지급됩니다.','동일 조건과 증빙의 재청구 검사에서 이미 지급된 상태를 확인하고 거절'],
 [167,176,'현재 검증 범위: 사전 예치금과 유효한 완료 확인서를 확보한 경우의 로컬 직접 청구','실제 지갑·테스트넷·결제 연동과 증빙 미발급 대응은 후속 개발 과제입니다.']
];
try{
 await b.size(1920,900);await b.navigate(endpoints.mainURL);await b.wait('Boolean(document.querySelector("#cached"))');await cursor();await scan();
 started=performance.now();recording=true;
 recordTask=(async()=>{while(recording){const t=(performance.now()-started)/1000;const r=await b.call('Page.captureScreenshot',{format:'jpeg',quality:88,captureBeyondViewport:false});const path=`frames/${String(frames.length).padStart(6,'0')}.jpg`;save(out+'/'+path,Buffer.from(r.data,'base64'));frames.push({t,path});await delay(160);}})();
 stamp('introduction');await at(15);await type('#source',cases.find(c=>c.id==='conflict').source.text);await click(live?'#live':'#cached');await b.wait('Boolean(document.querySelector("#approve")) || document.querySelector("#notice").textContent.includes("완료하지 못")');
 let actualLive=live&&await b.evaluate('Boolean(document.querySelector("#approve"))');
 if(live&&!actualLive&&process.argv.includes('--require-live')){stamp('live-request-failed');throw Error('LIVE_AI_FAILED_RECORDING_PRESERVED');}
 if(live&&!actualLive){stamp('live-request-failed-cached-fallback');await delay(3e3);await click('#cached');await b.wait('Boolean(document.querySelector("#approve"))');}
 trimEnd=Math.max(24,(performance.now()-started)/1000);editDelay=trimEnd-24;
 if(actualLive){subtitles[2][3]='이번 촬영 중 실제 Gemini 응답 생성 · 승인된 추가 요청 1회';subtitles[3][3]='실시간 생성된 초안 · 인용 근거를 펼쳐 원문과 대조';subtitles[4][3]='실시간 생성된 초안 · 50 / 30 TEST 충돌을 확인 질문으로 표시';}
 else if(live){subtitles[2][3]='실시간 요청 실패 후 저장된 시연 응답으로 전환 · 재시도 없음';}
 await b.evaluate('scrollTo({top:0,behavior:"smooth"})');await scan();need(await b.evaluate('Boolean(document.querySelector(".questions"))'),'actual-conflict-question-present');stamp(actualLive?'live-conflict-review':'cached-conflict-review');
 await at(25);await click('.field:nth-child(3) details summary');await at(31);await focus('#field-issuer');await at(38);await focus('.questions');need(await b.evaluate('document.querySelector("#approve").disabled'),'unresolved-blocks-approval');stamp('conflict-question-and-disabled-approval');
 await at(50);await click('#confirm');need(await b.evaluate('document.querySelector("#approve").disabled'),'confirmation-alone-not-enough');await at(54);await type('#field-amount','50');await type('[data-question]','최종 환급 금액은 50 TEST로 확인했습니다.');need(await b.evaluate('!document.querySelector("#approve").disabled'),'resolved-review-enabled');stamp('human-resolved-conflict');
 await at(61);await click('#approve');await b.wait('Boolean(document.querySelector("#provider"))');await click('#provider');await b.wait('!document.querySelector("#participant").disabled');await click('#participant');await b.wait('!document.querySelector("#deposit").disabled');stamp('both-signatures');
 await at(69);await click('#screen details summary');await scan();stamp('signed-condition-hashes');await at(76);await click('#deposit');await b.wait('Boolean(document.querySelector("#issue"))');await b.evaluate('scrollTo({top:0,behavior:"smooth"})');await scan();stamp('actual-50-test-deposit');
 await at(96);await click('#issue');await b.wait('!document.querySelector("#outage").disabled');await b.evaluate('scrollTo({top:0,behavior:"smooth"})');need(await b.evaluate('window.demo.getState().receipts.length===4'),'four-issued-receipts');stamp('four-signed-receipts-stored');
 await at(115);await click('#outage');await b.wait('Boolean(document.querySelector("#inspect"))');await b.wait('document.querySelector("#outage").textContent.includes("종료 확인")');await cursor();await scan();
 const outage=read(endpoints.run+'/outage.json');need(outage.mainUnavailable&&outage.issuerExited,'outage-record');const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};need(!alive(endpoints.mainPID)&&!alive(endpoints.issuerPID),'both-processes-exited');let refused=false;try{await fetch(endpoints.mainURL+'/health',{signal:AbortSignal.timeout(2000)});}catch{refused=true;}need(refused,'main-health-refused');const rpc=await(await fetch(endpoints.independentRPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})})).json();need(rpc.result==='0x7a69','chain-still-running');stamp('outage-independently-confirmed',{outage,mainConnectionRefused:refused});
 await at(130);await click('#inspect');await b.wait('!document.querySelector("#claim").disabled');stamp('independent-condition-inspection');await at(139);await click('#claim');await b.wait('Boolean(window.demoReceipt)');const receipt=await b.evaluate('window.demoReceipt');need(receipt.settled&&receipt.balanceIncrease==='50000000'&&receipt.paidEvent&&receipt.transferEvent,'real-payment');stamp('actual-refund-paid',{receipt});await at(147);await click('details summary');await focus('#receipt');await scan();
 await at(155);const duplicate=await b.evaluate('window.recovery.claim().then(()=>"UNEXPECTED_SUCCESS").catch(e=>e.message)');need(duplicate==='ALREADY_SETTLED_OR_NOT_ENROLLED','same-evidence-reclaim-blocked');await click('#inspect');await b.wait('document.querySelector("#notice").textContent.includes("ALREADY_SETTLED")');await focus('#notice');stamp('duplicate-refused',{duplicate,method:'unchanged recovery.claim; existing inspect button displays same settled-state rejection'});
 await at(167);await b.evaluate('document.querySelector("details").open=false;scrollTo({top:0,behavior:"smooth"})');await scan();stamp('scope');await at(176);recording=false;await recordTask;
 const recoveryRequests=b.network.filter(x=>x.documentURL.startsWith(endpoints.recoveryURL));need(recoveryRequests.filter(x=>x.url.startsWith(endpoints.mainURL)).length===0,'measured-no-business-requests');need(b.network.every(x=>new URL(x.url).hostname==='127.0.0.1'),'loopback-only-browser-requests');need(b.errors.length===0,'no-browser-exceptions');
 save(out+'/timeline.json',{duration:176,rawDuration:176+editDelay,trim:{start:24,end:trimEnd,removedSeconds:editDelay,reason:'Remove only excess live AI waiting time'},width:1920,height:900,method:'Continuous browser viewport capture during actual interaction; no still-image reconstruction',frames,subtitles,events});
 const ts=t=>new Date(t*1000).toISOString().slice(11,23).replace('.',',');save(out+'/subtitles.ko.srt',subtitles.map(([a,z,l,s],i)=>`${i+1}\n${ts(a)} --> ${ts(z)}\n${l}\n${s}\n`).join('\n'));
 save(out+'/execution.json',{at:new Date().toISOString(),status:'PASS',checks,events,receipt,duplicate,endpoints,frames:frames.length,externalAICalls:live?1:0,actualLiveResponse:actualLive,aiAttempt:live?aiAttempt:null,cacheCase:actualLive?null:'conflict',humanRoles:'AUTOMATED_LOCAL_DEMO',mockIssuer:true,mockClock:true,browserRequests:b.network,recoveryBusinessRequests:0,sensitiveScreenChecks:checks.filter(x=>x.id==='visible-brand-layout-secret-check'),recordingPermission:'CDP viewport capture; macOS desktop recording permission not required',presentationChanges:'Temporary visible cursor only; no business results or application source modified'});
 console.log(JSON.stringify({out,status:'PASS',frames:frames.length}));
}catch(e){recording=false;if(recordTask)await recordTask;save(out+'/failure.json',{error:/^[a-zA-Z0-9_-]+$/.test(e.message)?e.message:'FILMING_FAILURE',events,checks,frames:frames.length});console.log(JSON.stringify({out,status:'FAIL'}));process.exitCode=1;}finally{await b.close();}
