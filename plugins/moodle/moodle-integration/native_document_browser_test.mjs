// Actual Chrome + isolated Moodle; the upstream fixture injects only synthetic probes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const origin = 'https://127.0.0.1:19474';
const syntheticWallet = process.argv.includes('--synthetic-wallet');
const actualOperator = process.argv.includes('--actual-operator');
const expectDisabled = process.argv.includes('--expect-disabled');
const profile = await mkdtemp(join(tmpdir(), 'clear-c-native-csp-browser-'));
const child = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--ignore-certificate-errors', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], {stdio: ['ignore', 'ignore', 'pipe']});
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Chrome startup timeout')), 15000);
    child.stderr.on('data', chunk => {
      output += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.on('exit', () => { clearTimeout(timer); reject(Error('Chrome exited')); });
  });
  const host = new URL(endpoint).host;
  const tabs = await (await fetch('http://' + host + '/json/list')).json();
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, {once: true}));
  let sequence = 0;
  const pending = new Map();
  let csp = '', cacheControl = '';
  const syntheticRpcMethods = [];
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, {resolve, reject});
    socket.send(JSON.stringify({id, method, params}));
  });
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.id) {
      const task = pending.get(value.id); pending.delete(value.id);
      if (value.error) task.reject(Error(value.error.message)); else task.resolve(value.result);
    } else if (value.method === 'Fetch.requestPaused') {
      const p = value.params;
      if (actualOperator && p.request.url === 'http://127.0.0.1:19475/') {
        const responseHeaders = [{name:'Access-Control-Allow-Origin',value:origin},
          {name:'Access-Control-Allow-Methods',value:'POST'}, {name:'Access-Control-Allow-Headers',value:'content-type'},
          {name:'Content-Type',value:'application/json'}];
        if (p.request.method === 'OPTIONS') {
          void call('Fetch.fulfillRequest', {requestId:p.requestId,responseCode:204,responseHeaders});
          return;
        }
        const body = JSON.parse(p.request.postData);
        if (!['eth_chainId','eth_getCode'].includes(body.method)) throw Error('Unexpected synthetic RPC');
        syntheticRpcMethods.push(body.method);
        void call('Fetch.fulfillRequest', {requestId:p.requestId,responseCode:200,responseHeaders,
          body:Buffer.from(JSON.stringify({jsonrpc:'2.0',id:body.id,result:body.method==='eth_chainId'?'0x7a69':'0x'})).toString('base64')});
        return;
      }
      void call(p.request.url.startsWith(origin + '/') ? 'Fetch.continueRequest' : 'Fetch.failRequest',
        {requestId: p.requestId, ...(p.request.url.startsWith(origin + '/') ? {} : {errorReason: 'BlockedByClient'})});
    } else if (value.method === 'Network.responseReceived' && value.params.type === 'Document') {
      const headers = Object.fromEntries(Object.entries(value.params.response.headers).map(([k,v]) => [k.toLowerCase(),v]));
      csp = headers['content-security-policy'] ?? ''; cacheControl = headers['cache-control'] ?? '';
    }
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw Error('Browser expression failed');
    return result.result.value;
  };
  const until = async expression => {
    for (let i = 0; i < 100; i++) {
      try { if (await evaluate(expression)) return; } catch { /* navigation */ }
      await delay(100);
    }
    throw Error('Browser condition timeout: ' + expression);
  };
  await call('Page.enable'); await call('Network.enable'); await call('Fetch.enable');
  await call('Emulation.setDeviceMetricsOverride', {width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await call('Page.addScriptToEvaluateOnNewDocument', {source: `window.__cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.__cspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI,file:e.sourceFile,line:e.lineNumber}));`});
  if (actualOperator) {
    await call('Page.addScriptToEvaluateOnNewDocument', {source: `window.__providerMethods=[];
      const provider={on(){},removeListener(){},async request({method}){window.__providerMethods.push(method);
        if(method==='eth_requestAccounts'||method==='eth_accounts')return ['0x'+'a'.repeat(40)];
        if(method==='eth_chainId')return '0x7a69';if(method==='wallet_switchEthereumChain')return null;
        throw Error('No signing in this synthetic provider');}};
      window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',
        {detail:{info:{rdns:'io.metamask',uuid:'11111111-1111-1111-1111-111111111111'},provider}})));`});
  }
  const navigate = async path => { await call('Page.navigate', {url: origin + path}); };
  const roles = actualOperator ? [['editingteacher','configure.php']] : [['student','index.php'], ['editingteacher','configure.php']];
  for (const [actor, path] of roles) {
    await call('Network.clearBrowserCookies');
    await navigate('/login/index.php');
    await until('!!document.querySelector("#username") && document.readyState === "complete"');
    await evaluate(`document.querySelector('#username').value='synthetic-${actor}';document.querySelector('#password').value='Public-Synthetic-Only-2026';document.querySelector('#login').requestSubmit();true`);
    try {
      await until('location.pathname !== "/login/index.php" && document.readyState === "complete"');
    } catch (error) {
      console.log(await evaluate(`({path:location.pathname,error:document.querySelector('#loginerrormessage')?.textContent,title:document.title})`));
      throw error;
    }
    await navigate('/local/clearbridge/' + path + '?id=2');
    try {
      await until('window.__clearAmd === ' + JSON.stringify(origin));
    } catch (error) {
      console.log(await evaluate(`({path:location.pathname,title:document.title,mcfg:!!window.M?.cfg,scripts:document.scripts.length,body:document.body.innerText.slice(0,700)})`));
      throw error;
    }
    const first = await evaluate(`({cfg:M.cfg.wwwroot,meta:document.querySelector('meta[name="sc-nonce"]')?.content,nonces:Array.from(document.scripts).filter(s=>s.textContent.includes('//<![CDATA[')).map(s=>s.nonce),bad:!!window.__clearUntrusted,handler:!!window.__clearHandler,violations:window.__cspViolations,ui:!!document.querySelector('[data-clear-wallet-ui]')})`);
    const nonce = /'nonce-([A-Za-z0-9+/]{32})'/.exec(csp)?.[1];
    assert.ok(nonce && first.nonces.length >= 6 && first.nonces.every(n => n === nonce));
    assert.equal(first.meta, nonce);
    assert.equal(first.cfg, origin); assert.equal(first.ui, true);
    assert.equal(first.bad, false); assert.equal(first.handler, false);
    assert.ok(first.violations.some(v => v.directive === 'script-src-elem' && v.blocked === 'inline'));
    assert.ok(!first.violations.some(v => v.blocked === 'eval'));
    assert.ok(cacheControl.includes('no-store'));
    if (expectDisabled) {
      assert.equal(await evaluate(`!!document.querySelector('script[src="/clear-assets/moodle-native.js"]')`), false);
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-wallet-action]')).every(button=>button.hidden)`), true);
      console.log('PASS ' + actor + ' invalid full scope cannot mount the wallet module or expose controls');
    }
    if (syntheticWallet || actualOperator) {
      const moduleNonce = await evaluate(`document.querySelector('script[type="module"][src="/clear-assets/moodle-native.js"]')?.nonce`);
      assert.equal(moduleNonce, nonce);
      const click = async action => {
        await until(`!!document.querySelector('[data-wallet-action="${action}"]') && !document.querySelector('[data-wallet-action="${action}"]').disabled && !document.querySelector('[data-wallet-action="${action}"]').hidden`);
        await evaluate(`document.querySelector('[data-wallet-action="${action}"]').click();true`);
      };
      const choose = async kind => {
        await until(`document.querySelector('[data-wallet-select="${kind}"]').options.length > 1`);
        assert.equal(await evaluate(`document.querySelector('[data-wallet-select="${kind}"]').value`), '');
        await evaluate(`{const select=document.querySelector('[data-wallet-select="${kind}"]');select.selectedIndex=1;select.dispatchEvent(new Event('change',{bubbles:true}));}true`);
      };
      if (actor === 'editingteacher') {
        await choose('provider');
        if (actualOperator) assert.deepEqual(await evaluate('window.__providerMethods'), []);
        await click('connect-metamask');
      } else {
        await until('window.__nativeFixture?.mounted === true');
        assert.deepEqual(await evaluate('window.__nativeFixture.actions'), []);
        await click('connect-google');
      }
      await choose('wallet'); await click('select-wallet'); await click('check-network');
      await until(`!document.querySelector('[data-wallet-action="sign-in"]').disabled && !document.querySelector('[data-wallet-action="sign-in"]').hidden`);
      if (actualOperator) {
        const methods = await evaluate('window.__providerMethods');
        assert.ok(methods.includes('eth_requestAccounts') && methods.includes('wallet_switchEthereumChain')
          && methods.includes('eth_accounts') && methods.includes('eth_chainId'));
        assert.ok(!methods.some(m => /sign/i.test(m)));
        assert.deepEqual(syntheticRpcMethods, ['eth_chainId', 'eth_getCode']);
        console.log('PASS actual A bundle + synthetic EIP-6963 provider: explicit connect, choice, network; no sign-in/signature');
      } else {
        await click('sign-in');
        await until(`!document.querySelector('[data-wallet-action="finish-connection"]').disabled && !document.querySelector('[data-wallet-action="finish-connection"]').hidden`);
        assert.equal(await evaluate('window.__nativeFixture.actions.includes("finish-connection")'), false);
        await click('finish-connection');
        await until(`document.querySelector('[data-wallet-stage="login"]').textContent.includes('was confirmed')`);
        assert.deepEqual(await evaluate('window.__nativeFixture.actions'),
          [actor === 'editingteacher' ? 'connect-metamask' : 'connect-google','select-wallet','check-network','sign-in','finish-connection']);
        console.log('PASS ' + actor + ' synthetic adapter composition: exact config, explicit controls and separate finish');
      }
      const screenshot = await call('Page.captureScreenshot', {format: 'png'});
      await writeFile('/private/tmp/clear-c-native-csp-evidence/' + actor + (actualOperator ? '-actual-a' : '-synthetic') + '.png',
        Buffer.from(screenshot.data, 'base64'));
    }
    await call('Page.reload');
    await until('window.__clearAmd === ' + JSON.stringify(origin)
      + ' && document.querySelector(\'meta[name="sc-nonce"]\')?.content !== ' + JSON.stringify(nonce)
      + ' && document.readyState === "complete"');
    const next = /'nonce-([A-Za-z0-9+/]{32})'/.exec(csp)?.[1];
    assert.ok(next && next !== nonce);
    console.log(JSON.stringify({actor, mcfg: true, amd: true, trustedScripts: first.nonces.length,
      untrustedBlocked: true, noStore: true, freshNonce: true,
      violations: [...new Map(first.violations.map(v => [v.directive + ':' + v.blocked, v])).values()]}));
  }
  await navigate('/my/');
  await until('location.pathname === "/my/" && document.readyState === "complete" && !!window.M?.cfg');
  assert.equal(await evaluate('Array.from(document.scripts).some(s=>s.nonce)'), false);
  assert.equal(csp, '');
  console.log('PASS non-native Moodle route retains parent requirements');
} finally {
  socket?.close();
  child.kill('SIGTERM');
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  await rm(profile, {recursive: true, force: true});
}
