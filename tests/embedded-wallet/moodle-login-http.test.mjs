import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createHmac, randomBytes} from 'node:crypto';
import {createServer, request} from 'node:https';
import {createServer as tcpServer} from 'node:net';
import {mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Wallet, id} from 'ethers';
import {createCertificates, loadTls} from '../../src/dev/tls.mjs';
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampFrontendServer} from '../../tools/bootcamp/frontend-server.mjs';
import {createNormalMoodleLogin} from '../../tools/bootcamp/moodle-login-owner.mjs';
import {createMoodleLoginProofs} from '../../tools/bootcamp/moodle-login-wire.mjs';

const now = () => Math.floor(Date.now() / 1000);
const hex = () => randomBytes(32).toString('hex');
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
async function frontendPort() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const first = tcpServer(), second = tcpServer();
    try {
      const port = await listen(first);
      await new Promise((resolve, reject) => {
        second.once('error', reject);
        second.listen(port + 2, '127.0.0.1', resolve);
      });
      return port;
    } catch {
      // The product RPC proxy owns the adjacent port.
    } finally {
      await close(first);
      await close(second);
    }
  }
  throw Error('TEST_PORT_UNAVAILABLE');
}
const cookies = reply => reply.headers['set-cookie'].map(cookie => cookie.split(';')[0]);
function send(origin, path, ca, {body, headers = {}} = {}) {
  return new Promise((resolve, reject) => {
    const req = request(origin + path, {ca, method: body === undefined ? 'GET' : 'POST',
      headers: {...(body === undefined ? {} : {'Content-Type': 'application/json'}), ...headers}}, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, text}));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('PHP public HMAC vectors agree with A for both proofs', () => {
  const proofs = createMoodleLoginProofs('ab'.repeat(32));
  const input = {ownerRunId: 'fixture-run', intentRef: '11'.repeat(32), launchCode: '22'.repeat(32), challenge: '33'.repeat(32)};
  assert.equal(proofs.deriveBrowserProof(input), 'da639afbb788b1f9bc2db5fa0c5afa6fa251282213be4d763be286c07b0cb8ca');
  assert.equal(proofs.deriveFinishProof(input), 'fe20a18a839aa91169577488c303c676fd6361a72cdd8bb881544ce11946323b');
  proofs.close();
});

test('private authority, public popup and existing CLEAR SIWE round trip for both Moodle roles', async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'clear-moodle-login-fixture-')));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const fingerprint = createCertificates(directory), tls = loadTls(directory, fingerprint);
  const ca = readFileSync(join(directory, 'ca.pem')), reverseKey = hex(), proofKey = hex();
  const roleScope = {installationRef: 'fixture-install', courseRef: 'fixture-course', subjectRef: 'fixture-student',
    actorRefs: {PARTICIPANT: 'fixture-student', COURSE_OPERATOR: 'fixture-teacher'}};
  const ownerRunId = 'fixture-run', moodleOrigin = 'http://127.0.0.1:18768', chainId = 12345;
  const registry = new Map(), sessions = {PARTICIPANT: hex(), COURSE_OPERATOR: hex()};
  let substituteCorrelation = false;
  const reverse = createServer(tls, async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const envelope = JSON.parse(raw), q = envelope.request;
    const mac = createHmac('sha256', reverseKey).update(['CLEAR-MOODLE-AUTHORITY-A-TO-C-1', req.headers['x-clear-timestamp'],
      req.headers['x-clear-nonce'], 'POST', req.url, createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');
    if (req.method !== 'POST' || req.url !== '/local/clearbridge/login_authority.php' || req.headers.host !== '127.0.0.1:18768'
        || req.headers.cookie || req.headers['x-clear-signature'] !== mac
        || registry.get(q.requestRef) !== raw) { res.writeHead(403); res.end(); return; }
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({version: 'clear-moodle-login-authority-result.1', requestRef: substituteCorrelation ? hex() : q.requestRef,
      ownerRunId, moodleAuthorityRef: q.moodleAuthorityRef, role: q.role, intentRef: q.intentRef ?? null, status: 'OK',
      installationRef: roleScope.installationRef, courseRef: roleScope.courseRef, subjectRef: roleScope.subjectRef,
      actorRef: roleScope.actorRefs[q.role], sessionRef: sessions[q.role], expiresAtExclusive: now() + 200}));
  });
  const reversePort = await listen(reverse);
  t.after(() => close(reverse));
  const port = await frontendPort();
  const origin = 'https://127.0.0.1:' + port, participant = Wallet.createRandom(), operator = Wallet.createRandom();
  const auth = createApplicationService({directory: join(directory, 'auth'), origin, chainId, instanceId: id('moodle-login-fixture'),
    participants: [participant.address], operators: [operator.address]});
  t.after(() => auth.close());
  const login = createNormalMoodleLogin({options: {moodleOrigin, scope: roleScope, proofKey, reverseKey,
    reverseCa: ca, connectionPort: reversePort}, ownerRunId, runExpiresAtExclusive: now() + 240,
    authentication: auth, wallets: {PARTICIPANT: participant.address.toLowerCase(), COURSE_OPERATOR: operator.address.toLowerCase()}, now});
  t.after(login.close);
  const webRoot = join(directory, 'web');
  mkdirSync(join(webRoot, 'assets'), {recursive: true});
  writeFileSync(join(webRoot, 'index.html'), '<h1>fixture</h1>');
  writeFileSync(join(webRoot, 'clear-wallet-app.html'), '<meta name="clear-wallet-app" content="synthetic00001">\n');
  for (const file of ['onboarding.js', 'operator.js']) writeFileSync(join(webRoot, 'assets', file), '// fixture');
  const frontend = createBootcampFrontendServer({authentication: auth, store: {origin}, tls, sourceMode: 'REGISTERED_TEST_SOURCE',
    chainId, webRoot, moodleLogin: login.browser, normalUi: {walletRuntime: {instanceId: id('moodle-login-fixture')}},
    network: {chainId, rpcUrl: 'http://127.0.0.1:' + reversePort}});
  t.after(async () => { await close(frontend.server); await frontend.drain(); });
  await frontend.ready;
  await new Promise((resolve, reject) => {
    frontend.server.once('error', reject);
    frontend.server.listen(port, '127.0.0.1', resolve);
  });
  const proofs = createMoodleLoginProofs(proofKey);
  t.after(proofs.close);
  const issue = (operation, role, extra = {}) => {
    const q = {version: 'clear-moodle-login-intent.1', requestRef: hex(), ownerRunId, moodleAuthorityRef: hex(),
      role, expiresAtExclusive: now() + 5, ...extra};
    registry.set(q.requestRef, JSON.stringify({operation, request: q}));
    return q;
  };
  const doc = {'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document'};
  const same = {origin, 'sec-fetch-site': 'same-origin'};
  const get = (path, opts) => send(origin, path, ca, opts);
  substituteCorrelation = true;
  await assert.rejects(login.owner.issue(issue('start', 'PARTICIPANT')), /MOODLE_LOGIN_AUTHORITY_RESPONSE/);
  substituteCorrelation = false;

  for (const [role, wallet, path] of [['PARTICIPANT', participant, '/onboarding'], ['COURSE_OPERATOR', operator, '/operator']]) {
    const boot = await get('/moodle/connect', {headers: doc});
    assert.equal(boot.status, 200);
    assert.equal(boot.headers['referrer-policy'], 'no-referrer');
    assert.match(boot.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(boot.headers['set-cookie'][0], /^__Host-.*; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=/);
    async function start(bootstrap) {
      const challenge = /data-challenge="([a-f0-9]{64})"/.exec(bootstrap.text)[1];
      assert(!bootstrap.text.includes(cookies(bootstrap)[0].split('=')[1]));
      const q = issue('start', role), launch = await login.owner.issue(q);
      const input = {ownerRunId, intentRef: q.requestRef, launchCode: launch.launchCode, challenge};
      return {input, body: {code: launch.launchCode, challenge, browserProof: proofs.deriveBrowserProof(input)}};
    }
    let {input, body} = await start(boot);
    assert.equal((await get('/moodle/connect/redeem', {body, headers: same})).status, 403);
    let redeemed = await get('/moodle/connect/redeem', {body, headers: {...same, cookie: cookies(boot)[0]}});
    assert.equal(redeemed.status, 303);
    if (role === 'PARTICIPANT') {
      const nextBoot = await get('/moodle/connect', {headers: doc});
      const next = await start(nextBoot), oldBinding = cookies(redeemed)[1];
      const headers = {...same, cookie: [cookies(nextBoot)[0], oldBinding].join('; ')};
      assert.equal((await get('/moodle/connect/redeem', {body: next.body, headers})).status, 403);
      await login.owner.end(issue('end', role, {intentRef: input.intentRef}));
      redeemed = await get('/moodle/connect/redeem', {body: next.body, headers});
      input = next.input;
    }
    assert.equal(redeemed.status, 303);
    assert.equal(redeemed.headers.location, path);
    assert.doesNotMatch(redeemed.headers.location, /[?#]/);
    const binding = cookies(redeemed)[1];
    const claim = headers => get('/moodle/connect/google-start', {body: {}, headers});
    assert.deepEqual(JSON.parse((await claim(same)).text), {start: false});
    assert.equal((await claim({...same, origin: moodleOrigin, cookie: binding})).status, 403);
    const claims = await Promise.all([claim({...same, cookie: binding}), claim({...same, cookie: binding})]);
    assert.deepEqual(claims.map(reply => JSON.parse(reply.text).start).sort(),
      role === 'PARTICIPANT' ? [false, true] : [false, false]);
    const shell = await get(path + (role === 'PARTICIPANT' ? '?privy_oauth_code=synthetic' : ''), {headers: doc});
    assert.equal(shell.status, 200);
    assert.equal(shell.headers['set-cookie'], undefined);
    assert.equal((await get('/__embedded/config')).status, 200);
    assert.equal(JSON.parse((await get('/__embedded/config')).text).moodleLogin, true);
    const nonce = await get('/auth/nonce', {body: {wallet: wallet.address, chainId}, headers: same});
    const challengeMessage = JSON.parse(nonce.text);
    const verified = await get('/auth/verify', {body: {nonce: challengeMessage.nonce,
      signature: await wallet.signMessage(challengeMessage.message)}, headers: {...same, cookie: cookies(nonce)[0]}});
    assert.equal(verified.status, 200);
    const session = JSON.parse(verified.text), contextHeaders = {...same, 'x-wallet': wallet.address, 'x-chain-id': String(chainId)};
    const sessionCookie = cookies(verified)[0];
    const cookie = [binding, sessionCookie].join('; ');
    assert.equal((await get('/auth/moodle-complete', {body: {}, headers: {...contextHeaders, cookie}})).status, 403);
    const complete = await get('/auth/moodle-complete', {body: {}, headers: {...contextHeaders, cookie, 'x-csrf-token': session.csrf}});
    assert.equal(complete.status, 200);
    assert.deepEqual(JSON.parse(complete.text), {status: 'RETURN_TO_MOODLE'});
    assert.match(complete.headers['set-cookie'][0], /Max-Age=0$/);
    const {intentRef} = input;
    const status = await login.owner.status(issue('status', role, {intentRef}));
    assert.equal(status.status, 'RETURN_REQUIRED');
    const finishProof = proofs.deriveFinishProof(input);
    const finish = await login.owner.finish(issue('finish', role, {intentRef, finishProof, handback: status.handback}));
    assert.equal(finish.status, 'CONNECTED');
    assert.equal((await login.owner.status(issue('status', role, {intentRef}))).status, 'CONNECTED');
    await login.owner.end(issue('end', role, {intentRef}));
    assert.equal((await login.owner.status(issue('status', role, {intentRef}))).status, 'UNAVAILABLE');
  }
});
