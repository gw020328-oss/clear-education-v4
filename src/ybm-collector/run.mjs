import {createInterface} from 'node:readline';
import {openOfficialClient} from './client.mjs';
import {createRoute} from './route.mjs';
import {probeYbmHome} from './probe.mjs';
import {startChrome} from '../mac-collector/chrome.mjs';
import {prepareLocalDiagnostic} from './binding.mjs';
import {createCapture} from './capture.mjs';
import {loadAttestorTrust} from './trust.mjs';
import {createExtraction} from './extraction.mjs';
import {createProofSecrets} from './proof-secrets.mjs';
import {generateAndVerify} from './proof.mjs';
import {endpoints} from './source-policy.mjs';

// Default mode is transport only. Explicit collection-check mode adds a bound
// local HTML diagnostic, never attestation or a payment eligibility decision.
export async function runYbmRoute(session, {signal, interactive = false, collectionCheck = false, proofCheck = false, loadTrust=loadAttestorTrust, prove=generateAndVerify, openClient = openOfficialClient, probe = probeYbmHome, launchBrowser = startChrome, input = process.stdin, output = console.log} = {}) {
  if(proofCheck&&collectionCheck)throw new Error('MIXED_EXECUTION_MODES');
  const collecting=collectionCheck||proofCheck;
  if(collecting&&!interactive)throw new Error('INTERACTIVE_COLLECTION_REQUIRED');
  const deadline = AbortSignal.timeout(30 * 60 * 1000);
  const proofCancel=new AbortController();
  const scope = AbortSignal.any([signal, deadline,proofCancel.signal].filter(Boolean));
  let connection, route, browser, lines,diagnostic,capture,collectionResult,removeAbort,proofSecrets,scoreIndex,proofResult,generating=false,userEnded=false;
  try {
    if(collecting)diagnostic=await prepareLocalDiagnostic(proofCheck?{attestorTrust:await loadTrust({signal:scope})}:{});
    connection = await openClient({signal: scope,proofMode:proofCheck});
    route = await createRoute({client: connection.client, signal: scope});
    const live = AbortSignal.any([scope, route.signal]);
    const publicCheck = await probe(route, {signal: live});
    live.throwIfAborted();
    browser = await launchBrowser(session, {synthetic: false, proxyUrl: route.proxyUrl, headless: !interactive, signal: live});
    const {targetInfos} = await browser.send('Target.getTargets');
    const page = targetInfos.find(target => target.type === 'page');
    if (!page) throw new Error('BROWSER_PAGE_MISSING');
    const {sessionId} = await browser.send('Target.attachToTarget', {targetId: page.targetId, flatten: true});
    const navigation = await browser.send('Page.navigate', {url: 'https://exam.toeic.co.kr/'}, sessionId);
    if (navigation.errorText) throw new Error('PUBLIC_ROUTE_NOT_READY');
    live.throwIfAborted();
    if (interactive) {
      output('CLEAR: 전용 Chrome이 준비되었습니다. 이 창에서만 YBM에 직접 로그인해 주세요.');
      if(collecting){
        output(proofCheck?'새 로컬 테스트 지갑에 결합한 실제 증명 생성·독립 검증 단계입니다. 지급은 비활성입니다.':'새 로컬 테스트 지갑에 결합한 원천 형식 진단입니다. 증명 생성·검증·지급은 비활성입니다.');
        output('로그인 후 ready를 입력하면 지정된 성적·접수 내역 두 페이지의 메모리 수집을 켭니다. close로 언제든 종료합니다.');
        if(proofCheck)proofSecrets=createProofSecrets(browser);
        capture=createCapture({browser,...(proofCheck?{extractionFactory:collection=>createExtraction(collection,{finish:false,onPair:pair=>{scoreIndex=pair.scoreIndex;}}),onSourceRequest:(...args)=>proofSecrets.capture(...args)}:{}),collection:diagnostic.collection,signal:live,onProgress:({role})=>output(role==='score'?'성적 원천 형식 확인 완료. 시험접수 → 접수확인/변경/취소에서 해당 시험의 자세히 보기를 열어 주세요.':'접수 원천 형식 확인 완료. 두 원천의 같은 시험 여부를 확인합니다.')});
      }else{
        output('현재는 로그인 연결 확인 단계입니다. 성적 원본 수집·증명 생성·지급은 비활성입니다.');
        output('확인을 마치면 이 터미널에 close를 입력해 종료합니다. 연결이 끊기면 새 로그인으로 다시 시작해야 합니다.');
      }
      lines = createInterface({input, terminal: false});
      await new Promise((resolve, reject) => {
        let ready=false;
        const abort = () => reject(new Error(deadline.aborted ? 'ROUTE_SESSION_EXPIRED' : 'ROUTE_RESTART_REQUIRES_LOGIN'));
        const userClosed=()=>{userEnded=true;if(generating)proofCancel.abort();resolve();};
        lines.once('close', userClosed);
        browser.closed?.then(userClosed);
        if(capture)capture.done.then(result=>{collectionResult=result;resolve();},reject);
        lines.on('line', line => {
          if(line.trim()==='close')lines.close();
          if(capture&&!ready&&line.trim()==='ready'){
            ready=true;
            void (async()=>{
              await capture.arm();
              output('수집 준비 완료: 성적 확인 목록을 엽니다. 개인정보를 터미널에 입력하지 마세요.');
              const next=await browser.send('Page.navigate',{url:endpoints.score},sessionId);
              if(next.errorText)throw new Error('SOURCE_NAVIGATION_FAILED');
            })().catch(reject);
          }
          if(capture&&line.trim()==='status')output(JSON.stringify({scope:'BOUND_SOURCE_DIAGNOSTIC_STATUS',...capture.summary()}));
        });
        live.addEventListener('abort', abort, {once: true});
        removeAbort=()=>live.removeEventListener('abort',abort);
        if (live.aborted) abort();
      });
      live.throwIfAborted();
      if(proofCheck&&collectionResult?.complete&&!userEnded){
        generating=true;
        output('두 원천 연결 완료. 같은 client로 새 증명 2건을 생성한 뒤 별도 프로세스에서 검증합니다.');
        proofResult=await prove({client:connection.client,routeClient:route.client,diagnostic,secrets:proofSecrets,scoreIndex,signal:live,onStep:step=>output(JSON.stringify({scope:'YBM_PROOF_PROGRESS',...step}))});
        generating=false;
        output('증명 서명·신청 결합·원천 연결 독립 검증 완료. 전용 Chrome을 종료하고 임시 프로필을 정리합니다. 지급은 실행하지 않았습니다.');
      }
      if(collectionCheck&&collectionResult?.complete)output('진단 완료: 성적·접수 기록의 같은 시험 연결을 확인했습니다. 전용 Chrome을 정상 종료하고 임시 프로필을 정리합니다. 새 증명 검증·지급은 실행하지 않았습니다.');
    }
    return {scope:proofCheck?'YBM_BOUND_PROOF_VERIFICATION':collectionCheck?'BOUND_SOURCE_LAYOUT_DIAGNOSTIC':interactive ? 'YBM_LOGIN_ROUTE_ONLY' : 'ANONYMOUS_PUBLIC_ROUTE', ...publicCheck, browserNavigated: true, sameClient: route.client === connection.client, cdpListeningPort: false, rawCapture:collecting?Boolean(capture?.summary().bodyReads):false, liveProof: Boolean(proofResult?.proofVerified), payment: false,...(proofCheck?{verification:proofResult??{complete:false,proofVerified:false,paymentAllowed:false}}:{}),...(collectionCheck?{collection:collectionResult??{complete:false,proofVerified:false,paymentAllowed:false}}:{})};
  } catch(error) {
    if(capture)output(JSON.stringify({scope:'BOUND_SOURCE_DIAGNOSTIC_FAILURE',...capture.summary(),proofVerified:false,paymentAllowed:false}));
    throw error;
  } finally {
    generating=false;removeAbort?.();
    lines?.close();
    try {await capture?.close();}
    finally {
      proofSecrets?.close();diagnostic?.close();
      try { if (browser) await browser.close(); }
      finally { try { await route?.close(); } finally { await connection?.close(); } }
    }
  }
}
