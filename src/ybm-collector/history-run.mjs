import {createInterface} from 'node:readline';
import {randomBytes} from 'node:crypto';
import {Wallet} from 'ethers';
import {snarkHistoryOperators,releaseSnarkOperators} from './history-snarkjs-operators.mjs';
import {makeSocket} from './socket.mjs';
import {openOfficialClient,quiet} from './client.mjs';
import {createRoute} from './route.mjs';
import {probeYbmHome} from './probe.mjs';
import {startChrome} from '../mac-collector/chrome.mjs';
import {createCapture} from './history-capture.mjs';
import {createProofSecrets} from './proof-secrets.mjs';
import {loadAttestorTrust} from './trust.mjs';
import {minimalClaim} from './proof.mjs';
import {proofErrorDiagnostic,proofSteps} from './proof-diagnostics.mjs';
import {endpoints} from './source-policy.mjs';
import {historyParams,historyPolicyHash,inspectHistory} from './history-policy.mjs';
import {verifyIndependently} from './history-independent.mjs';
import {requireValue} from './values.mjs';
export async function runYbmRoute(session,{signal,input=process.stdin,output=console.log}={}){
 const startedAt=Date.now();
 let maxLoopDelayMs=0,lastLoopTick=Date.now();
 const loopTimer=setInterval(()=>{const now=Date.now();maxLoopDelayMs=Math.max(maxLoopDelayMs,now-lastLoopTick-100);lastLoopTick=now;},100);loopTimer.unref();
 const userCancel=new AbortController();
 const scope=AbortSignal.any([signal,userCancel.signal,AbortSignal.timeout(30*60*1000)].filter(Boolean));
 let connection,route,browser,lines,capture,secrets,owner,claim,secret,removeAbort,operators;
 let active=false,closedByUser=false,generating=false,browserSummary;
 const collection={start(){active=true;},assertActive(){requireValue(active,'COLLECTION_STATE');scope.throwIfAborted();},cancel(){active=false;}};
 try{
 const trust=await loadAttestorTrust({signal:scope});
 owner=Wallet.createRandom();const expected={owner:owner.address,createdAt:Math.floor(Date.now()/1000),nonce:randomBytes(32).toString('hex')};
 connection=await openOfficialClient({signal:scope,proofMode:true,socketFactory:url=>{const socket=makeSocket(url,{proofMode:true}),send=socket.sendPromise;let lastNetworkEventAt=Date.now();for(const event of ['message','ping','pong'])socket.on(event,()=>{lastNetworkEventAt=Date.now();});socket.on('close',code=>output(JSON.stringify({scope:'HISTORY_SOCKET_CLOSE',code})));socket.on('error',error=>output(JSON.stringify({scope:'HISTORY_SOCKET_ERROR',code:['ECONNRESET','ETIMEDOUT','EPIPE','WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'].includes(error.code)?error.code:'OTHER'})));socket.sendPromise=bytes=>{if(bytes.length>32*1024)output(JSON.stringify({scope:'HISTORY_PROOF_SEND_SIZE',bytes:bytes.length,queuedBytes:socket.bufferedAmount,readyState:socket.readyState,lastNetworkEventAgoMs:Date.now()-lastNetworkEventAt}));return send(bytes);};return socket;}});
 route=await createRoute({client:connection.client,signal:scope});const live=AbortSignal.any([scope,route.signal]);
 await probeYbmHome(route,{signal:live});
 browser=await startChrome(session,{synthetic:false,proxyUrl:route.proxyUrl,headless:false,signal:live});
 const {targetInfos}=await browser.send('Target.getTargets'),page=targetInfos.find(t=>t.type==='page');requireValue(page,'BROWSER_PAGE_MISSING');
 const {sessionId}=await browser.send('Target.attachToTarget',{targetId:page.targetId,flatten:true});
 secrets=createProofSecrets(browser);
 capture=createCapture({browser,collection,signal:live,onSourceRequest:(...args)=>secrets.capture(...args),extractionFactory:()=>({
 accept(role,bytes){requireValue(role==='score','SOURCE_ROLE');browserSummary=inspectHistory(bytes.toString('utf8'));return {complete:true};},close(){}
 })});
 const nav=await browser.send('Page.navigate',{url:'https://exam.toeic.co.kr/'},sessionId);requireValue(!nav.errorText,'PUBLIC_ROUTE_NOT_READY');
 output('CLEAR HISTORY: 전용 Chrome에서 YBM에 로그인한 뒤 성적확인 목록을 열어 주세요. 로그인 후 ready를 입력하면 전체 목록 응답을 메모리에서 증명합니다. close로 종료할 수 있습니다.');
 lines=createInterface({input,terminal:false});
 await new Promise((resolve,reject)=>{
 let armed=false;const end=()=>{closedByUser=true;if(generating)userCancel.abort();resolve();};lines.once('close',end);browser.closed?.then(end);
 capture.done.then(resolve,reject);
 const abort=()=>reject(new Error('ROUTE_SESSION_EXPIRED'));live.addEventListener('abort',abort,{once:true});removeAbort=()=>live.removeEventListener('abort',abort);
 lines.on('line',line=>{
 if(line.trim()==='close')lines.close();
 if(line.trim()==='ready'&&!armed){armed=true;void(async()=>{await capture.arm();const r=await browser.send('Page.navigate',{url:endpoints.score},sessionId);requireValue(!r.errorText,'SOURCE_NAVIGATION_FAILED');})().catch(reject);}
 if(line.trim()==='status')output(JSON.stringify({scope:'HISTORY_CAPTURE_STATUS',...capture.summary()}));
 });if(live.aborted)abort();
 });
 if(closedByUser)return {scope:'YBM_HISTORY_SPIKE',cancelled:true,proofVerified:false,paymentAllowed:false};
 live.throwIfAborted();output(JSON.stringify({scope:'HISTORY_BROWSER_LAYOUT_UNTRUSTED',...browserSummary}));
 requireValue(connection.client===route.client&&connection.client.isOpen,'SAME_CLIENT_REQUIRED');
 process.env.LOG_LEVEL='silent';const {createClaimOnAttestor}=await import('@reclaimprotocol/attestor-core');
 secret=secrets.take('score');
 let latestResult,commandWaiter,busy=false;
 const commands=[];
 const nextCommand=()=>new Promise(resolve=>{if(commands.length)resolve(commands.shift());else commandWaiter=resolve;});
 const acceptCommand=line=>{const command=line.trim();if(!['inspect','retry','close'].includes(command)||busy)return;if(commandWaiter){const r=commandWaiter;commandWaiter=undefined;r(command);}else commands.push(command);};
 lines.on('line',acceptCommand);
 const finishWait=()=>{if(commandWaiter){const r=commandWaiter;commandWaiter=undefined;r('close');}};
 live.addEventListener('abort',finishWait,{once:true});lines.once('close',finishWait);browser.closed?.then(finishWait);
 let command='retry';
 while(command!=='close'&&!closedByUser){
 busy=true;
 try{
 if(command==='retry'){
 generating=true;await releaseSnarkOperators(operators);operators=snarkHistoryOperators({signal:live});let lastStep,lastProgressAt=0;const proofStarted=Date.now();
 const result=await createClaimOnAttestor({name:'http',params:historyParams(),context:{purpose:'YBM_HISTORY_SPIKE_NO_PAYMENT',historyNonce:expected.nonce,historyPolicyHash},ownerPrivateKey:owner.privateKey,secretParams:secret,client:connection.client,zkEngine:'snarkjs',zkOperators:operators,zkProofConcurrency:1,maxRetries:1,logger:quiet,onStep:s=>{if(proofSteps.has(s.name)&&(lastStep!==s.name||Date.now()-lastProgressAt>10000)){lastStep=s.name;lastProgressAt=Date.now();output(JSON.stringify({scope:'HISTORY_PROOF_PROGRESS',step:s.name,elapsedSeconds:Math.round((Date.now()-proofStarted)/1000),...(Number.isSafeInteger(s.proofsDone)?{proofsDone:s.proofsDone,proofsTotal:s.proofsTotal}:{})}));}}});
 live.throwIfAborted();claim=minimalClaim(result);
 }
 requireValue(claim,'NO_SIGNED_CLAIM');
 const verified=await verifyIndependently({proof:claim,expected,trust},{signal:live});
 const altered=structuredClone(claim),ctx=JSON.parse(altered.claim.context);
 ctx.extractedParameters.history_html=ctx.extractedParameters.history_html.replace(/Total \d+/,'Total 10');
 if(ctx.extractedParameters.history_html===JSON.parse(claim.claim.context).extractedParameters.history_html)ctx.historyNonce='altered';
 altered.claim.context=JSON.stringify(ctx);
 let tamperRejected=false;try{await verifyIndependently({proof:altered,expected,trust},{signal:live});}catch{tamperRejected=true;}
 latestResult={scope:'YBM_HISTORY_SPIKE',...verified,browserRowCountMatched:browserSummary.rowCount===verified.rowCount,signedPayloadTamperRejected:tamperRejected,selectiveProofOmissionResistance:'NOT_ESTABLISHED',paymentAllowed:false};
 output(JSON.stringify(latestResult));
 }catch(error){output(JSON.stringify({scope:'HISTORY_ATTEMPT_FAILURE',...proofErrorDiagnostic(error),sessionElapsedSeconds:Math.round((Date.now()-startedAt)/1000),maxLoopDelayMs,userCancelled:userCancel.signal.aborted,outerSignalAborted:Boolean(signal?.aborted),scopeAborted:scope.aborted,scopeTimedOut:scope.reason?.name==='TimeoutError',routeAborted:route.signal.aborted,clientOpen:connection.client.isOpen}));}
 finally{generating=false;busy=false;}
 live.throwIfAborted();
 output('CLEAR HISTORY: 결과 분석 대기 중입니다. inspect는 같은 메모리 증명을 재검사, retry는 새 증명 생성, close는 종료와 임시 자료 삭제입니다. 최대 30분 후 종료합니다.');
 command=await nextCommand();
 }
 live.removeEventListener('abort',finishWait);secret=undefined;
 return latestResult??{scope:'YBM_HISTORY_SPIKE',proofVerified:false,fullHistoryProven:false,paymentAllowed:false};
 }catch(error){output(JSON.stringify({scope:'YBM_HISTORY_FAILURE',...proofErrorDiagnostic(error),...(capture?{capture:capture.summary()}:{})}));throw new Error('HISTORY_SPIKE_FAILED');}
 finally{clearInterval(loopTimer);generating=false;active=false;removeAbort?.();lines?.close();secret=undefined;claim=undefined;owner=undefined;
 try{await capture?.close();}finally{secrets?.close();try{await browser?.close();}finally{try{await route?.close();}finally{try{await connection?.close();}finally{await releaseSnarkOperators(operators);}}}}}
}
