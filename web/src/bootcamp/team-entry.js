// Same-origin capability is installed only by the authenticated owner frame.
import {createTestDriver,createTestAutoReader} from '/team-driver.js';
import {createNormalBootcampClient} from '/bootcamp-normal-client.mjs';
import {testActionAvailability} from '/team-review-window.js';
import {el,clear} from '../ui/dom.js';
let started=false;
async function start(){
 if(started||!window.clearTeamRuntime)return;started=true;
 const port=window.clearTeamRuntime,actor=await port.bridge.login(await port.bridge.publicRead('/__dev/config'));
 location.hash='#/bootcamp/live/'+(actor.role==='operator'?'operator':'participant');
 const box=el('section.bcx',{});document.querySelector('#app').prepend(box);
 let packet=null,ack=null,registrationBusy=false;
 const driver=createTestDriver({session:port.bridge,createNormalClient:createNormalBootcampClient,elapsedNow:()=>performance.now(),changed:()=>render()});
 const reader=createTestAutoReader({driver,visible:()=>document.visibilityState==='visible'});
 const action=fn=>async()=>{reader.setEnabled(false);try{await fn();}catch{}finally{reader.setEnabled(true);render();}};
 function render(){const s=driver.snapshot(),a=s.bootstrap?.aiApproval,availability=testActionAvailability(s,{ack:ack===a?.planHash,readerEnabled:true,visible:document.visibilityState==='visible'}),participant=s.bootstrap?.role==='PARTICIPANT';
  clear(box);const button=(text,fn,disabled=false)=>el('button',{text,disabled:s.busy||registrationBusy||s.ended||!!s.bootstrap?.failure||disabled,onClick:action(fn)});
  box.append(el('h2',{text:'신청·증빙 준비'}),el('p',{text:'현재 단계: '+(s.bootstrap?.phase??'읽는 중')}));
  if(s.bootstrap?.selfAttestor)box.append(el('p',{text:'자체 공증 TEST · 공식 hosted 또는 독립 공증 성공을 의미하지 않습니다.'}));
  if(s.error)box.append(el('p',{role:'alert',text:s.error.code+' · 현재 상태를 확인하세요.'}));
  if(s.bootstrap?.failure)box.append(el('p',{role:'alert',text:'실패 대기 · '+s.bootstrap.failure.code}));
  if(participant){box.append(button('새 신청 만들기',()=>driver.create(),!!s.applicationId),button('이 신청의 증빙 확인 시작',()=>driver.bind(),!s.applicationId||!!s.bootstrap?.applicationId),button('인증서 확인 메시지 읽기',()=>driver.approval(),!s.bootstrap?.applicationId));
   if(s.approval)box.append(el('pre',{text:s.approval.message}),button('표시한 인증서 확인 메시지 서명',()=>driver.sign()));
  }
  if(a){box.append(el('h3',{text:'이번 입력의 AI 평가 승인'}),el('pre',{text:JSON.stringify(a,null,2)}),el('p',{text:'생성 Moodle 회고를 Gemini에 전송합니다. 호출 1회·자동 재시도 없음. 가격 시나리오 USD 0.00346은 실제 청구액/상한이 아니며 전송 중 USD 0.05를 넘을 수 있습니다.'}),el('p',{text:'AI 승인 남은 시간: '+Math.max(0,Math.floor((s.aiApprovalRemainingMs??0)/1000))+'초'}));
   const check=el('input',{type:'checkbox',checked:ack===a.planHash,onChange:e=>{ack=e.target.checked?a.planHash:null;render();}});box.append(el('label',{},[check,document.createTextNode('이번 입력·모델·외부 전송·비용을 확인했습니다.')]),el('p',{text:availability.ai.reason}),button('이번 입력의 AI 평가 1회 승인',()=>driver.approveAi(),!availability.ai.enabled));
  }
  if(participant&&s.bootstrap?.applicationId&&!s.bootstrap.procedureReady){box.append(el('h3',{text:'수령 지갑 등록 · 공개 거래 데이터 안내'}),el('p',{text:'참가자·수령 주소와 등록 서명이 체인 calldata에 공개됩니다. 원천 승인과 지급 동의는 별개입니다.'}),button('수령 지갑 등록 내용 읽기',async()=>{packet=await port.normal.recipientRegistration(s.applicationId);}));
   if(packet)box.append(el('pre',{text:JSON.stringify(packet,null,2)}),button('표시한 등록 내용에 서명·제출',async()=>{registrationBusy=true;try{await port.normal.registerReviewedRecipient(packet);packet=null;}finally{registrationBusy=false;}},packet.status!=='AWAITING_SIGNATURE'));
  }
  box.append(button('최신 상태 읽기',()=>driver.refresh()));
 }
 await driver.config();await driver.login();reader.sync();render();
 await import('../main.js');
 const attach=async()=>{await window.clearTeamConnection.probe();await window.clearTeamConnection.signIn();await window.clearTeamRefresh();};await attach();
 let refreshing=false;const tick=setInterval(()=>{reader.sync();render();if(!refreshing){refreshing=true;void window.clearTeamRefresh().finally(()=>{refreshing=false;});}},1000);
 addEventListener('pagehide',()=>{clearInterval(tick);reader.close();driver.cancel();},{once:true});
}
addEventListener('clear-team-ready',()=>{void start();});void start();
