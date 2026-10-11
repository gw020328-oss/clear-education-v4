import {createInterface} from 'node:readline';
import {openOfficialClient} from './client.mjs';
import {createRoute} from './route.mjs';
import {probeYbmHome} from './probe.mjs';
import {startChrome} from '../mac-collector/chrome.mjs';
import {prepareLocalDiagnostic} from './binding.mjs';
import {createCapture} from './capture.mjs';

// Default mode is transport only. Explicit collection-check mode adds a bound
// local HTML diagnostic, never attestation or a payment eligibility decision.
export async function runYbmRoute(session, {signal, interactive = false, collectionCheck = false, openClient = openOfficialClient, probe = probeYbmHome, launchBrowser = startChrome, input = process.stdin, output = console.log} = {}) {
  if(collectionCheck&&!interactive)throw new Error('INTERACTIVE_COLLECTION_REQUIRED');
  const deadline = AbortSignal.timeout(30 * 60 * 1000);
  const scope = AbortSignal.any([signal, deadline].filter(Boolean));
  let connection, route, browser, lines,diagnostic,capture,collectionResult,removeAbort;
  try {
    if(collectionCheck)diagnostic=await prepareLocalDiagnostic();
    connection = await openClient({signal: scope});
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
      if(collectionCheck){
        output('새 로컬 테스트 지갑에 결합한 원천 형식 진단입니다. 증명 생성·검증·지급은 비활성입니다.');
        output('로그인 후 ready를 입력하면 지정된 성적·접수 내역 두 페이지의 메모리 수집을 켭니다. close로 언제든 종료합니다.');
        capture=createCapture({browser,collection:diagnostic.collection,signal:live});
      }else{
        output('현재는 로그인 연결 확인 단계입니다. 성적 원본 수집·증명 생성·지급은 비활성입니다.');
        output('확인을 마치면 이 터미널에 close를 입력해 종료합니다. 연결이 끊기면 새 로그인으로 다시 시작해야 합니다.');
      }
      lines = createInterface({input, terminal: false});
      await new Promise((resolve, reject) => {
        let ready=false;
        const abort = () => reject(new Error(deadline.aborted ? 'ROUTE_SESSION_EXPIRED' : 'ROUTE_RESTART_REQUIRES_LOGIN'));
        lines.once('close', resolve);
        browser.closed?.then(resolve);
        if(capture)capture.done.then(result=>{collectionResult=result;resolve();},reject);
        lines.on('line', line => {
          if(line.trim()==='close')lines.close();
          if(capture&&!ready&&line.trim()==='ready'){
            ready=true;capture.arm().then(()=>output('수집 준비 완료: 성적 확인 목록과 연결할 시험의 접수 확인 상세를 열거나 새로고침해 주세요. 개인정보를 터미널에 입력하지 마세요.'),reject);
          }
        });
        live.addEventListener('abort', abort, {once: true});
        removeAbort=()=>live.removeEventListener('abort',abort);
        if (live.aborted) abort();
      });
      live.throwIfAborted();
    }
    return {scope:collectionCheck?'BOUND_SOURCE_LAYOUT_DIAGNOSTIC':interactive ? 'YBM_LOGIN_ROUTE_ONLY' : 'ANONYMOUS_PUBLIC_ROUTE', ...publicCheck, browserNavigated: true, sameClient: route.client === connection.client, cdpListeningPort: false, rawCapture:collectionCheck?Boolean(capture?.summary().bodyReads):false, liveProof: false, payment: false,...(collectionCheck?{collection:collectionResult??{complete:false,proofVerified:false,paymentAllowed:false}}:{})};
  } finally {
    removeAbort?.();
    lines?.close();
    try {await capture?.close();}
    finally {
      diagnostic?.close();
      try { if (browser) await browser.close(); }
      finally { try { await route?.close(); } finally { await connection?.close(); } }
    }
  }
}
