// Same-origin capability is installed only by the authenticated owner frame.
import {createTestDriver,createTestAutoReader} from '/team-driver.js';
import {createNormalBootcampClient} from '/bootcamp-normal-client.mjs';
import {testActionAvailability} from '/team-review-window.js';
import {createPreparationRenderer} from './team-render.js';
import {teamApplicationSection} from './team-application.js';
import {studentSection} from './student-view.js';
import {conditionPreview} from './condition-preview.js';
import {operatorSection} from './operator-view.js';
import {teamReceiptStatus} from './team-application.js';
import {evidenceDetail} from './live-evidence.js';
import {el,clear} from '../ui/dom.js';
let started=false;
async function start(){
 if(started||!window.clearTeamRuntime)return;started=true;
 const port=window.clearTeamRuntime,actor=await port.bridge.login(await port.bridge.publicRead('/__dev/config'));
 location.hash='#/bootcamp/live/'+(actor.role==='operator'?'operator':'participant');
 const box=el('section.bcx',{}),main=document.querySelector('#main');main.append(box);
 if(actor.role==='operator')main.append(conditionPreview());
 main.hidden=false;
 let packet=null,ack=null,registrationBusy=false,manual=false,selectedCondition=null,evidence=null,evidenceError=false,actionError='';
 let paint;
 const driver=createTestDriver({session:port.bridge,createNormalClient:createNormalBootcampClient,elapsedNow:()=>performance.now(),changed:()=>render()});
 const reader=createTestAutoReader({driver,visible:()=>document.visibilityState==='visible'});
 const action=fn=>async()=>{if(driver.snapshot().busy||manual){actionError='상태 조회를 처리 중입니다. 완료 후 다시 선택하세요.';render();return;}manual=true;actionError='';reader.setEnabled(false);render();try{await fn();}catch{actionError='작업 결과를 확인하지 못했습니다. 최신 상태를 확인하고 결과 불명 시 다시 서명하지 마세요.';}finally{manual=false;reader.setEnabled(true);render();}};
 function render(){const s=driver.snapshot(),a=s.bootstrap?.aiApproval,availability=testActionAvailability({...s,busy:false},{ack:ack===a?.planHash,readerEnabled:true,visible:document.visibilityState==='visible'}),participant=s.bootstrap?.role==='PARTICIPANT';
  if(!paint)paint=createPreparationRenderer({draw:draw,update:({state})=>{for(const button of box.querySelectorAll('button'))button.disabled=state.busy||manual||registrationBusy||state.ended||(!!state.bootstrap?.failure&&button.dataset.readonly!=='true')||button.dataset.blocked==='true';const status=box.querySelector('.team-status');if(status)status.textContent=actionError||(state.busy||manual||registrationBusy?'현재 요청을 처리 중입니다.':'서버의 현재 상태를 표시합니다.');const count=box.querySelector('.team-ai-remaining');if(count)count.textContent='AI 승인 남은 시간: '+Math.max(0,Math.floor((state.aiApprovalRemainingMs??0)/1000))+'초';const review=box.querySelector('.team-review-remaining');if(review)review.textContent='정산 여유를 제외한 검토 가능 시간: '+Math.max(0,Math.floor((state.reviewWindow?.reviewMs??0)/1000))+'초';}});
  paint({state:s,packet,ack,availability,registrationUnknown:port.normal.registrationUnknown,detailKey:[selectedCondition,evidence,evidenceError]});
 }
 function draw({state:s,availability}){const a=s.bootstrap?.aiApproval,participant=s.bootstrap?.role==='PARTICIPANT';
  clear(box);const button=(text,fn,disabled=false,readOnly=false)=>el('button.pill-btn',{'data-blocked':String(disabled),'data-readonly':String(readOnly),text,disabled:s.busy||manual||registrationBusy||s.ended||(!!s.bootstrap?.failure&&!readOnly)||disabled,onClick:action(fn)});
  box.append(el('p.team-status',{role:'status'}),el('h2',{text:participant?'신청 진행':'신청 검토'}),el('details',{},[el('summary',{text:'연결·단계 정보'}),el('p',{text:s.bootstrap?.phase??'읽는 중'})]));
  if(s.bootstrap?.selfAttestor)box.append(el('p',{text:'자체 공증 TEST · 공식 hosted 또는 독립 공증 성공을 의미하지 않습니다.'}));
  if(s.error)box.append(el('p',{role:'alert',text:s.error.code+' · 현재 상태를 확인하세요.'}));
  if(s.bootstrap?.failure)box.append(el('p',{role:'alert',text:'실패 대기 · '+s.bootstrap.failure.code}));
  if(participant&&!s.bootstrap?.procedureReady){
   if(!s.applicationId)box.append(button('새 신청 만들기',()=>driver.create()));
   else if(!s.bootstrap?.applicationId)box.append(button('이 신청의 증빙 확인 시작',()=>driver.bind()));
   else if(s.bootstrap.phase==='SOURCE_python-basic-certificate'&&!s.approval)box.append(button('인증서 확인 메시지 읽기',()=>driver.approval()));
   if(s.approval)box.append(el('pre',{text:s.approval.message}),button('표시한 인증서 확인 메시지 서명',()=>driver.sign()));
  }
  if(a&&a.status==='WAITING'&&a.permitted){box.append(el('h3',{text:'이번 입력의 AI 평가 승인'}),el('details',{},[el('summary',{text:'승인 대상 상세'}),el('pre',{text:JSON.stringify(a,null,2)})]),el('p',{text:'생성 Moodle 회고를 Gemini에 전송합니다. 호출 1회·자동 재시도 없음. 가격 시나리오 USD 0.00346은 실제 청구액/상한이 아니며 전송 중 USD 0.05를 넘을 수 있습니다.'}),el('p.team-ai-remaining',{text:'AI 승인 남은 시간: '+Math.max(0,Math.floor((s.aiApprovalRemainingMs??0)/1000))+'초'}));
   const check=el('input',{type:'checkbox',checked:ack===a.planHash,onChange:e=>{ack=e.target.checked?a.planHash:null;render();}});box.append(el('label',{},[check,document.createTextNode('이번 입력·모델·외부 전송·비용을 확인했습니다.')]),el('p',{text:availability.ai.reason}),button('이번 입력의 AI 평가 1회 승인',()=>driver.approveAi(),!availability.ai.enabled));
  }
  if(port.normal.registrationUnknown)box.append(el('p',{role:'alert',text:'수령 등록 결과가 불명확합니다. 다시 서명하지 말고 실행 담당자에게 확인하세요.'}));
  if(participant&&s.bootstrap?.phase==='AWAITING_RECIPIENT_REGISTRATION_SIGNATURE'){box.append(el('h3',{text:'수령 지갑 등록 · 공개 거래 데이터 안내'}),el('p',{text:'참가자·수령 주소와 등록 서명이 체인 calldata에 공개됩니다. 원천 승인과 지급 동의는 별개입니다.'}),button('수령 지갑 등록 내용 읽기',async()=>{packet=await port.normal.recipientRegistration(s.applicationId);},port.normal.registrationUnknown));
   if(packet)box.append(el('details',{},[el('summary',{text:'등록 서명 상세'}),el('pre',{text:JSON.stringify(packet,null,2)})]),button('표시한 등록 내용에 서명·제출',async()=>{registrationBusy=true;try{await port.normal.registerReviewedRecipient(packet);packet=null;}finally{registrationBusy=false;}},packet.status!=='AWAITING_SIGNATURE'||port.normal.registrationUnknown));
  }
  box.append(button('최신 상태 읽기',()=>driver.refresh(),false,true));
  const application=teamApplicationSection({state:s,availability,button,showCriteria:false,agree:()=>driver.consent('AGREE'),replay:()=>driver.replayConsent(),refresh:()=>driver.refresh(),readReceipt:()=>driver.receipt()});
  const preparation=el('div.live-actions',{});while(box.firstChild){const child=box.firstChild;box.removeChild(child);preparation.append(child);}
  const workflow={preparation,application,paid:teamReceiptStatus(s)?.verified===true,summary:participant?'신청부터 증빙 확인·수령까지 현재 단계에서 진행하세요.':'같은 판정·수령 주소·금액을 확인하고 지급에 동의하세요.',openCondition:id=>{selectedCondition=id;evidence=null;evidenceError=false;void action(async()=>{try{evidence=await createNormalBootcampClient({request:(...args)=>port.bridge.request(...args)}).decisionEvidence(s.applicationId,{decisionId:s.view.decision.id});}catch{evidenceError=true;}})();},detail:selectedCondition?evidenceDetail({view:s.view,criterionId:selectedCondition,evidence,error:evidenceError}):null};
  box.append((participant?studentSection:operatorSection)({view:s.view,workflow}));
 }
 await driver.config();await driver.login();reader.sync();render();
 const tick=setInterval(()=>{reader.sync();render();},1000);
 addEventListener('pagehide',()=>{clearInterval(tick);reader.close();driver.cancel();},{once:true});
}
const launch=()=>{void start().catch(()=>{const main=document.querySelector('#main');main.hidden=false;main.textContent='팀원 화면 연결을 확인하지 못했습니다. 현재 인증·서버 상태를 실행 담당자에게 알려주세요.';});};
addEventListener('clear-team-ready',launch);launch();
