import {createInterface} from 'node:readline';
import {openOfficialClient} from './client.mjs';
import {createRoute} from './route.mjs';
import {probeYbmHome} from './probe.mjs';
import {startChrome} from '../mac-collector/chrome.mjs';

// Login transport only. Collection awaits application/recipient binding and
// reviewed source policy. Never enables Network/Fetch or reads cookies/HTML.
export async function runYbmRoute(session, {signal, interactive = false, openClient = openOfficialClient, probe = probeYbmHome, launchBrowser = startChrome, input = process.stdin, output = console.log} = {}) {
  const deadline = AbortSignal.timeout(30 * 60 * 1000);
  const scope = AbortSignal.any([signal, deadline].filter(Boolean));
  let connection, route, browser, lines;
  try {
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
      output('현재는 로그인 연결 확인 단계입니다. 성적 원본 수집·증명 생성·지급은 비활성입니다.');
      output('확인을 마치면 이 터미널에 close를 입력해 종료합니다. 연결이 끊기면 새 로그인으로 다시 시작해야 합니다.');
      lines = createInterface({input, terminal: false});
      await new Promise((resolve, reject) => {
        const abort = () => reject(new Error(deadline.aborted ? 'ROUTE_SESSION_EXPIRED' : 'ROUTE_RESTART_REQUIRES_LOGIN'));
        lines.once('close', resolve);
        browser.closed?.then(resolve);
        lines.on('line', line => { if (line.trim() === 'close') lines.close(); });
        live.addEventListener('abort', abort, {once: true});
        lines.once('close', () => live.removeEventListener('abort', abort));
        if (live.aborted) abort();
      });
      live.throwIfAborted();
    }
    return {scope: interactive ? 'YBM_LOGIN_ROUTE_ONLY' : 'ANONYMOUS_PUBLIC_ROUTE', ...publicCheck, browserNavigated: true, sameClient: route.client === connection.client, cdpListeningPort: false, rawCapture: false, liveProof: false, payment: false};
  } finally {
    lines?.close();
    try { if (browser) await browser.close(); }
    finally { try { await route?.close(); } finally { await connection?.close(); } }
  }
}
