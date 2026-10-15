/* GPL-3.0-or-later. CLEAR local attendance experiment, HTML5 upload only. */
define(['core/ajax'], function(Ajax) {
 'use strict';
 return {init: async function(config) {
  const video=document.getElementById(config.playerid),root=document.getElementById(config.rootid);
  const status=document.createElement('p');status.id='clear-status';status.setAttribute('role','status');root.appendChild(status);
  const finish=document.createElement('button');finish.id='clear-finish';finish.className='btn btn-primary';finish.textContent='수강 종료 및 출석 확인';finish.disabled=true;root.appendChild(finish);
  const call=async(op,payload)=>JSON.parse(await Ajax.call([{methodname:'local_clearwatch_exchange',args:{cmid:config.cmid,operation:op,payload:JSON.stringify(payload)}}])[0]);
  let stopped=false,session,seq=0,lastPos=0,lastWall=performance.now(),wasPlaying=false,lastRate=1000,pending=[],chain=Promise.resolve();
  let durationMs=0,seeking=false,seekBase=0,ignoreSeek=false;
  function show(e){status.textContent=e.credited?'출석 확인 완료 · '+e.creditDay:(e.normalCloseAcknowledged?'종료 확인 · 인정 시간 부족':'저장된 수강시간 '+(e.elapsedMs/1000).toFixed(2)+'초');root.querySelector('[data-region="percent"]').textContent=(e.coverageMs/e.durationMs*100).toFixed(1);}
  function fail(error){stopped=true;video.pause();finish.disabled=true;status.textContent='기록 확인이 필요합니다. 다시 열면 마지막 저장 지점에서 이어집니다.';status.dataset.error=(error.message||String(error))+' '+(error.debuginfo||'');root.dataset.clearError='true';}
  function collect(){
   if(stopped||seeking)return;
   const now=performance.now(),pos=Math.max(0,Math.min(durationMs,Math.round(video.currentTime*1000)));
   const wall=Math.max(0,Math.floor(now-lastWall));
   // A play/pause/ended event can arrive after the media clock has advanced.
   // Account for that transition too; a stationary paused clock contributes zero.
   if(pos>=lastPos && pos-lastPos<=6000 && wall<=4000 && pos>lastPos){
    const interval={from:lastPos,to:pos,wallMs:wall,rateMilli:lastRate};const prev=pending[pending.length-1];
    if(prev && prev.to===interval.from && prev.rateMilli===interval.rateMilli && prev.wallMs+wall<=3500){prev.to=pos;prev.wallMs+=wall;}
    else pending.push(interval);
   }
   lastPos=pos;lastWall=now;wasPlaying=!video.paused&&!video.ended;lastRate=Math.round(video.playbackRate*1000);
  }
  async function request(op,intervals,position,playing,extra={}){
   const payload={sessionId:session.sessionId,token:session.token,seq:seq+1,intervals,positionMs:position,playing,...extra};
   let result;
   for(let attempt=0;attempt<2;attempt++){
    try{result=await call(op,payload);break;}
    catch(e){if(attempt===1||e.errorcode)throw e;await new Promise(r=>setTimeout(r,200));}
   }
   seq=result.seq;show(result.evidence);return result;
  }
  function enqueue(op='pulse'){
   if(stopped)return Promise.resolve();
   const run=async()=>{if(stopped)return;collect();const intervals=pending;pending=[];const pos=lastPos;return request(op,intervals,pos,wasPlaying);};
   chain=chain.then(run).catch(fail);return chain;
  }
  try{
   video.pause();session=await call('begin',[]);durationMs=session.evidence.durationMs;
   if(video.readyState<1)await new Promise(r=>video.addEventListener('loadedmetadata',r,{once:true}));
   if(Math.abs(video.duration*1000-durationMs)>100)throw Error('MEDIA_DURATION_MISMATCH');
   video.currentTime=session.evidence.positionMs/1000;lastPos=session.evidence.positionMs;lastWall=performance.now();show(session.evidence);
  }catch(e){fail(e);return;}
  video.addEventListener('play',()=>{collect();enqueue();});
  video.addEventListener('pause',()=>{collect();enqueue();});
  video.addEventListener('ratechange',()=>{collect();enqueue();});
  video.addEventListener('ended',()=>{collect();enqueue();});
  video.addEventListener('seeking',()=>{
   if(ignoreSeek||seeking||stopped)return;
   // Discard unacknowledged tail on a seek; no media jump is credited.
   seekBase=lastPos;seeking=true;wasPlaying=false;video.pause();
  });
  video.addEventListener('seeked',()=>{
   if(ignoreSeek||!seeking||stopped)return;
   const target=Math.round(video.currentTime*1000);
   chain=chain.then(async()=>{
    const intervals=pending;pending=[];
    if(intervals.length)await request('pulse',intervals,seekBase,false);
    await request('seek',[],seekBase,false,{targetMs:target});
    lastPos=target;lastWall=performance.now();wasPlaying=false;seeking=false;
   }).catch(fail);
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();enqueue();}});
  const timer=setInterval(()=>enqueue(),1000);
  finish.disabled=false;root.dataset.clearReady='true';
  finish.addEventListener('click',async()=>{
   if(stopped)return;finish.disabled=true;video.pause();await enqueue();
   await enqueue('finish');if(!stopped){stopped=true;clearInterval(timer);root.dataset.clearFinished='true';}
  });
  // Window close is never considered a successful finish. Periodic receipts preserve acknowledged progress.
 }};
});
