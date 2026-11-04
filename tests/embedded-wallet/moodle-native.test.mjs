import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createMoodleFrontDoorPolicy} from '../../tools/bootcamp/moodle-front-door.mjs';
import {createMoodleLoginBrowser} from '../../tools/bootcamp/moodle-login-browser.mjs';
import {createMoodleLoginIntents, MOODLE_LOGIN_INTENT} from '../../tools/bootcamp/moodle-login-intent.mjs';
import {createMoodleLoginProofs} from '../../tools/bootcamp/moodle-login-wire.mjs';
import {validateCourseWalletView, validateCourseWalletCommand, MOODLE_WALLET_VERSION} from '../../src/embedded-wallet/moodle-native-contract.mjs';

const origin = 'https://127.0.0.1:9477', hex = n => n.toString(16).padStart(64, '0');
const routes = [
  {owner: 'C', path: '/local/clearbridge/index.php', methods: ['GET'], query: ['id'], walletDocument: true},
  {owner: 'C', path: '/local/clearbridge/login_action.php', methods: ['POST'], query: []},
  {owner: 'C', path: '/theme/styles.php', methods: ['GET'], query: [], slashArguments: true},
  {owner: 'A', path: '/auth/nonce', methods: ['POST'], query: []},
  {owner: 'A', path: '/local/clearbridge/wallet-return', methods: ['GET'], query: ['privy_oauth_code', 'privy_oauth_state', 'privy_oauth_provider']},
];
const request = (url, method = 'GET', headers = {}) => ({url, method, socket: {encrypted: true},
  headers: {host: '127.0.0.1:9477', origin, 'sec-fetch-site': 'same-origin', ...headers}});
const policy = () => createMoodleFrontDoorPolicy({origin, routes});

test('fixed route inventory separates callback, private authority and encoded paths', () => {
  const p = policy();
  assert.equal(p.classify(request('/local/clearbridge/index.php?id=2')).owner, 'C');
  assert.equal(p.classify(request('/theme/styles.php/boost/123/all')).owner, 'C');
  assert.equal(p.classify(request('/local/clearbridge/wallet-return?privy_oauth_code=synthetic')).owner, 'A');
  for (const path of ['/local/clearbridge/index.php?id=2&id=3', '/local/clearbridge/index.php?privy_oauth_code=synthetic',
    '/local/clearbridge/login_authority.php', '/auth%2fnonce', '//auth/nonce', '/theme/styles.php/../index.php',
    '/theme/styles.php/%2e%2e/index.php', '/local/clearbridge/index.php?id=2#fragment', '/onboarding']) {
    assert.throws(() => p.classify(request(path)), /MOODLE_FRONT_DOOR/);
  }
  assert.throws(() => p.classify(request('/auth/nonce', 'POST', {origin: 'https://example.test'})));
  assert.throws(() => p.classify(request('/auth/nonce', 'POST', {'sec-fetch-site': 'cross-site'})));
  assert.throws(() => p.classify(request('/auth/nonce', 'POST', {authorization: 'not-a-real-token'})));
});

test('gateway requests never send CLEAR cookies/CSRF to PHP or Moodle sessions to A', () => {
  const p = policy(), headers = {cookie: 'MoodleSession=synthetic; __Host-clear-session=synthetic; privy-token=synthetic',
    origin, host: 'attacker.test', 'x-wallet': 'synthetic', 'x-chain-id': '1', 'x-csrf-token': 'synthetic',
    'x-clear-command-binding':'synthetic','x-clear-command-ref':'synthetic', 'x-forwarded-host': 'attacker.test', 'x-clear-document-nonce': 'attacker', authorization: 'synthetic'};
  const c = p.requestHeaders('C', headers, 'a'.repeat(32)), a = p.requestHeaders('A', headers);
  assert.equal(c.cookie, 'MoodleSession=synthetic');
  assert.equal(a.cookie, '__Host-clear-session=synthetic');
  for (const key of ['x-wallet', 'x-chain-id', 'x-csrf-token', 'x-clear-command-binding', 'x-clear-command-ref', 'authorization', 'x-forwarded-host']) assert.equal(c[key], undefined);
  assert.equal(c.host, '127.0.0.1:9477'); assert.equal(c['x-clear-document-nonce'], 'a'.repeat(32));
  assert.equal(a['x-clear-document-nonce'], undefined);
  assert.throws(() => p.requestHeaders('A', {cookie: '__Host-clear-session=a; __Host-clear-session=b'}));
});

test('response cookies and redirects cannot cross owner boundaries', () => {
  const p = policy(), clear = '__Host-clear-session=synthetic; Path=/; HttpOnly; Secure; SameSite=Strict';
  const moodle = 'MoodleSession=synthetic; Path=/; HttpOnly; Secure; SameSite=Lax';
  assert.deepEqual(p.responseHeaders('A', {'set-cookie': clear})['set-cookie'], [clear]);
  assert.deepEqual(p.responseHeaders('C', {'set-cookie': moodle})['set-cookie'], [moodle]);
  for (const [owner, cookie] of [['A', moodle], ['C', clear], ['A', clear + '; Domain=127.0.0.1'],
    ['A', clear.replace('SameSite=Strict', 'SameSite=None')], ['C', moodle.replace('; Secure', '')]]) {
    assert.throws(() => p.responseHeaders(owner, {'set-cookie': cookie}));
  }
  assert.equal(p.responseHeaders('C', {location: origin + '/local/clearbridge/index.php?id=2'}).location,
    '/local/clearbridge/index.php?id=2');
  for (const location of ['//example.test', 'https://example.test', '/local/clearbridge/wallet-return?privy_oauth_code=synthetic',
    '/local/clearbridge/index.php?token=synthetic']) assert.throws(() => p.responseHeaders('C', {location}));
});

test('native view and commands accept only display fields and exact actions', () => {
  const view = {version: MOODLE_WALLET_VERSION, role: 'participant', phase: 'IDLE', busy: false,
    providers: [], choices: [], selectedChoiceId: null, networkReady: false, authenticated: false,
    allowedActions: ['connect-google'], error: null};
  assert.deepEqual(validateCourseWalletView(view), view);
  for (const patch of [{csrf: 'synthetic'}, {providers: [{providerId: 'provider-1'}]}, {phase: 'AUTO_SIGNING'},
    {selectedChoiceId: 'choice-1'}, {authenticated: true}, {allowedActions: ['connect-metamask']},
    {error: {code: 'RAW_PROVIDER_ERROR', outcome: 'UNKNOWN'}}]) assert.throws(() => validateCourseWalletView({...view, ...patch}));
  assert.deepEqual(validateCourseWalletCommand({action: 'select-wallet', choiceId: 'choice-1'}), {action: 'select-wallet', choiceId: 'choice-1'});
  for (const command of [{action: 'sign-in', signature: 'synthetic'}, {action: 'request'}, {action: 'select-wallet'},
    {action: 'connect-metamask', providerId: '0x123'}]) assert.throws(() => validateCourseWalletCommand(command));
});

async function invoke(browser, path, body, cookie = '') {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(req, request(path, 'POST', {'content-type': 'application/json', cookie}));
  const headers = {}; let status, text;
  const res = {setHeader(k, v) { headers[k.toLowerCase()] = v; },
    writeHead(s, h = {}) { status = s; for (const [k,v] of Object.entries(h)) this.setHeader(k,v); }, end(v) { text = v; }};
  await browser.handle(req, res);
  return {status, headers, body: JSON.parse(text)};
}

for (const role of ['PARTICIPANT', 'COURSE_OPERATOR']) test('native JSON handoff retains proof and one-use binding for ' + role, async () => {
  let now = 1000;
  const proofs = createMoodleLoginProofs(hex(1)), wallets = {PARTICIPANT: '0x' + '12'.repeat(20), COURSE_OPERATOR: '0x' + '34'.repeat(20)};
  const owner = createMoodleLoginIntents({ownerRunId: 'fixture-run', runExpiresAtExclusive: 1500,
    scope: {installationRef: 'fixture', courseRef: 'course-2', subjectRef: 'student', actorRefs: {PARTICIPANT: 'student', COURSE_OPERATOR: 'teacher'}},
    wallets, deriveBrowserProof: proofs.deriveBrowserProof, deriveFinishProof: proofs.deriveFinishProof,
    now: () => now, monotonic: () => (now - 1000) * 1000,
    verifyMoodle: async ({request: q}) => ({ownerRunId: q.ownerRunId, role: q.role, installationRef: 'fixture', courseRef: 'course-2',
      subjectRef: 'student', actorRef: q.role === 'PARTICIPANT' ? 'student' : 'teacher', sessionRef: hex(3), expiresAtExclusive: 1400}),
    authenticateClear: c => ({wallet: c.wallet, role: role === 'PARTICIPANT' ? 'participant' : 'operator', expiresAt: 1400})});
  const browser = createMoodleLoginBrowser({origin, moodleOrigin: origin, ownerRunId: 'fixture-run', intents: owner, now: () => now, native: true});
  const q = {version: MOODLE_LOGIN_INTENT, requestRef: hex(4), ownerRunId: 'fixture-run', moodleAuthorityRef: hex(5), role, expiresAtExclusive: 1005};
  const boot = await invoke(browser, '/moodle/connect/bootstrap', {});
  assert.equal(boot.status, 200); assert.deepEqual(Object.keys(boot.body).sort(), ['challenge', 'expiresAtExclusive']);
  const cookie = boot.headers['set-cookie'].split(';')[0], issued = await owner.issue(q);
  const input = {code: issued.launchCode, challenge: boot.body.challenge,
    browserProof: proofs.deriveBrowserProof({ownerRunId: q.ownerRunId, intentRef: q.requestRef, launchCode: issued.launchCode, challenge: boot.body.challenge})};
  assert.equal((await invoke(browser, '/moodle/connect/redeem', input)).status, 403);
  assert.equal((await invoke(browser, '/moodle/connect/redeem', {...input, browserProof: hex(20)}, cookie)).status, 403);
  const redeemed = await invoke(browser, '/moodle/connect/redeem', input, cookie);
  assert.equal(redeemed.status, 200); assert.equal(redeemed.headers.location, undefined);
  assert.match(redeemed.body.commandBinding,/^[a-f0-9]{64}$/);
  assert(!JSON.stringify(redeemed.headers).includes(redeemed.body.commandBinding));
  assert.deepEqual(redeemed.body, {status: 'WAITING', role: role === 'PARTICIPANT' ? 'participant' : 'operator', expiresAtExclusive: 1300,commandBinding:redeemed.body.commandBinding});
  assert.equal((await invoke(browser, '/moodle/connect/redeem', input, cookie)).status, 403);
  assert.equal(browser.matches('/moodle/connect'), false); assert.equal(browser.matches('/moodle/connect/google-start'), false);
  assert.equal((await invoke(browser, '/moodle/connect/bootstrap', {role})).status, 403);
  now = 1500;
  assert.equal((await invoke(browser, '/moodle/connect/bootstrap', {})).status, 403);
  owner.close(); proofs.close();
});

test('native bootstrap cannot be enabled on separate origins', () => {
  assert.throws(() => createMoodleLoginBrowser({origin, moodleOrigin: 'http://127.0.0.1:18768', ownerRunId: 'fixture',
    intents: {}, now: () => 1000, native: true}), /MOODLE_LOGIN_NATIVE_ORIGIN/);
});
