import React, {useEffect,useRef,useState} from 'react';
import {createProductSession} from './product-session.mjs';
import {createNormalBootcampClient} from '../bootcamp/normal-client.mjs';
import {createTestDriver,createTestAutoReader} from '../../tools/bootcamp/test-client/driver.js';
import {testActionAvailability} from '../../tools/bootcamp/test-client/review-window.js';
const Details=({value})=><details><summary>확인할 상세 내용</summary><pre>{JSON.stringify(value,null,2)}</pre></details>;
const criterionNames={'activity-complete':'학습 활동 완료','assignment-submitted':'과제 제출','reflection-topics':'회고 평가','python-basic-certificate':'Python (Basic) 인증서'};
export function ProductPanel({session,wallet,config}) {
  const [state,setState]=useState(null),[packet,setPacket]=useState(null),[regBusy,setRegBusy]=useState(false),[error,setError]=useState('');
  const [ack,setAck]=useState(null),[auto,setAuto]=useState(true),[tick,setTick]=useState(0);
  const live=useRef(null),alive=useRef(true),registrationAbort=useRef(null);
  useEffect(()=>{
    alive.current=true;const product=createProductSession({session,wallet,config});
    const driver=createTestDriver({session:product.bridge,createNormalClient:createNormalBootcampClient,elapsedNow:()=>performance.now(),
      changed:s=>{if(alive.current)setState(s);}});
    const reader=createTestAutoReader({driver,visible:()=>document.visibilityState==='visible'});
    live.current={product,driver,reader};
    const visible=()=>reader.sync();document.addEventListener('visibilitychange',visible);
    const timer=setInterval(()=>{if(alive.current){setTick(t=>t+1);reader.sync();}},1000);
    void driver.config().then(()=>driver.login()).then(()=>reader.sync()).catch(()=>{});
    return ()=>{alive.current=false;registrationAbort.current?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);reader.close();driver.cancel();};
  },[session,wallet,config]);
  const a=state?.bootstrap?.aiApproval;
  const approvalKey=JSON.stringify(a?[a.applicationId,a.bodySha256,a.planHash,a.contextHash,a.runBindingHash,a.model]:null);
  const s=live.current?.driver.snapshot()??state;
  if(!s)return <section><p>신청 화면을 준비하고 있습니다.</p></section>;
  const participant=s.bootstrap?.role==='PARTICIPANT',bound=!!s.bootstrap?.applicationId,busy=s.busy||regBusy||s.ended;
  const availability=testActionAvailability(s,{ack:!!a&&ack===approvalKey,readerEnabled:auto,visible:document.visibilityState==='visible'});
  const action=fn=>async()=>{if(busy)return;setError('');setPacket(null);try{await fn();}catch{}live.current?.reader.sync();};
  const register=submit=>async()=>{
    if(busy)return;setRegBusy(true);setError('');live.current.reader.setEnabled(false);
    const controller=new AbortController();registrationAbort.current=controller;
    try{if(submit){await live.current.product.submitRegistration(packet,{signal:controller.signal});if(alive.current)setPacket(null);}
      else{const p=await live.current.product.readRegistration({signal:controller.signal});if(alive.current)setPacket(p);}}
    catch{if(alive.current){setPacket(null);setError(live.current.product.registrationUnknown?'수령 지갑 등록 결과가 불명확합니다. 다시 서명하지 말고 실행 담당자에게 알려주세요.':'수령 지갑 등록 상태가 바뀌었거나 확인에 실패했습니다. 최신 상태를 다시 읽어주세요.');}}
    finally{registrationAbort.current=null;if(alive.current){setRegBusy(false);live.current.reader.setEnabled(auto);}}
  };
  return <section><h2>{participant?'참가자 신청':'운영자 검토'} · 로컬 TEST</h2>
    <p>참가자 지갑으로 100 TEST를 지급하는 시험입니다. 각 승인과 서명은 내용을 확인한 뒤 직접 진행하세요.</p>
    <p>신청: {s.applicationId??'아직 생성되지 않음'} · 서버 단계: {s.bootstrap?.phase??'확인 중'}</p>
    <p role="status">{error|| (s.error?`${s.error.code} · ${s.error.outcome==='UNKNOWN'?'처리 결과 미확인 — 새 요청을 보내지 마세요.':'현재 상태를 확인하지 못했습니다.'}`:busy?'선택한 작업을 처리하고 있습니다.':'서버의 현재 상태를 표시합니다.')}</p>
    <button disabled={busy} onClick={action(()=>live.current.driver.refresh())}>최신 신청·판정 읽기</button>
    <label><input type="checkbox" checked={auto} disabled={regBusy} onChange={e=>{setAuto(e.target.checked);live.current.reader.setEnabled(e.target.checked);}}/>상태 자동 읽기</label>
    <p>양쪽 Chrome 창을 보이는 상태로 유지하세요. 자동 읽기는 승인이나 서명을 실행하지 않습니다.</p>
    {participant&&<><button disabled={busy||!!s.applicationId} onClick={action(()=>live.current.driver.create())}>새 신청 만들기</button>
      <button disabled={busy||!s.applicationId||bound} onClick={action(()=>live.current.driver.bind())}>이 신청의 증빙 확인 시작</button>
      <h3>인증서 확인 승인</h3><button disabled={busy||!bound} onClick={action(()=>live.current.driver.approval())}>인증서 확인 메시지 읽기</button>
      {s.approval&&<><p>HackerRank 인증서 확인용 서명입니다. 지급 동의는 별도입니다.</p><Details value={{message:s.approval.message,expiresAt:s.approval.expiresAt}}/>
        <button disabled={busy} onClick={action(()=>live.current.driver.sign())}>표시한 인증서 확인 메시지 서명</button></>}
    </>}
    <h3>조건 확인 결과</h3><ul>{(s.view?.criteria??s.operations?.evidence?.criteria??[]).map(r=><li key={r.criterionId}>{criterionNames[r.criterionId]??r.criterionId}: {r.state} {r.current?'':'(최신 여부 미확인)'}</li>)}</ul>
    {a&&<><h3>이번 회고의 AI 평가 승인</h3>
      <p>생성된 로컬 Moodle 회고 1건을 Gemini로 전송합니다. 원문 최대 2048 bytes, 전체 요청 최대 8192 bytes, 출력 최대 1024 tokens, 호출 1회이며 자동 재시도는 없습니다. 지급 동의와 별개입니다.</p>
      <p>예상 가격 시나리오는 USD 0.00346이며 실제 청구액이나 공급자의 금액 상한을 보장하지 않습니다. 전송 중 USD 0.05를 넘을 가능성도 있습니다.</p>
      <Details value={a}/><label><input type="checkbox" checked={!!a&&ack===approvalKey} disabled={busy} onChange={e=>setAck(e.target.checked?approvalKey:null)}/>이번 입력·모델·외부 전송·비용 안내를 확인했습니다.</label>
      <p>{availability.ai.reason}</p><button disabled={busy||!availability.ai.enabled} onClick={action(()=>live.current.driver.approveAi())}>이번 입력의 AI 평가 1회 승인</button></>}
    {participant&&bound&&<><h3>수령 지갑 등록</h3><p>등록 서명과 참가자·수령 주소가 로컬 체인의 공개 거래 데이터에 포함됩니다. 100 TEST의 수령 지갑을 고정하는 별도 서명입니다.</p>
      <button disabled={busy||live.current.product.registrationUnknown} onClick={register(false)}>수령 지갑 등록 내용 읽기</button>
      {packet&&<><Details value={packet}/><button disabled={busy||packet.status!=='AWAITING_SIGNATURE'} onClick={register(true)}>표시한 수령 지갑 등록에 서명·제출</button></>}
    </>}
    <h3>최종 판정과 지급 동의</h3><p>수령 주소: {s.bootstrap?.expectedPayment?.recipient??'확인 중'} · 금액: 100 TEST</p>
    {s.view&&<Details value={{decision:s.view.decision,target:s.view.target,funding:s.view.funding,consent:s.view.consent}}/>}
    <p>{availability.consent.reason}</p><p>검토 여유: {Math.max(0,Math.floor((s.reviewWindow?.reviewMs??0)/1000))}초</p>
    <button disabled={busy||!availability.consent.enabled} onClick={action(()=>live.current.driver.consent('AGREE'))}>표시한 같은 판정에 동의</button>
    <button disabled={busy||!s.view||s.consentReplayPending} onClick={action(()=>live.current.driver.consent('WITHDRAW'))}>이 판정의 동의 철회</button>
    {s.consentReplayPending&&<button disabled={busy} onClick={action(()=>live.current.driver.replayConsent())}>같은 동의 요청의 결과 확인</button>}
    <h3>100 TEST 수령 확인</h3><button disabled={busy||!bound} onClick={action(()=>live.current.driver.receipt())}>지급 영수증 읽기</button>
    {s.receipt&&<><p>{s.receipt.claim.state==='INCLUDED'?'100 TEST 수령 검증 완료 · 블록 포함 확인, 최종 확정은 아님':'아직 수령을 확인하지 못했습니다.'}</p><Details value={s.receipt}/></>}
    {(s.busy||regBusy)&&<button onClick={()=>{registrationAbort.current?.abort();live.current.driver.cancel();}}>진행 요청 취소</button>}
  </section>;
}
