import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createMoodleLoginIntents, MOODLE_LOGIN_INTENT} from '../../tools/bootcamp/moodle-login-intent.mjs';

const hex = n => n.toString(16).padStart(64, '0');
const wallets = {PARTICIPANT: '0x' + '12'.repeat(20), COURSE_OPERATOR: '0x' + '34'.repeat(20)};
const scope = {installationRef: 'installation', courseRef: 'course-two', subjectRef: 'student',
  actorRefs: {PARTICIPANT: 'student', COURSE_OPERATOR: 'teacher'}};
const proof = (domain, {ownerRunId, intentRef, launchCode, challenge}) =>
  createHmac('sha256', 'synthetic test key').update([domain, ownerRunId, intentRef, launchCode, challenge ?? ''].join('\n')).digest('hex');
const browserProof = input => proof('BROWSER', input);
const finishProof = input => proof('FINISH', input);
const context = role => ({wallet: wallets[role], token: 'fixture', chainId: 1, csrf: 'fixture'});
function fixture() {
  let wall = 1000, mono = 0, seq = 0, sessionRef = hex(70), revoked = false, loggedOut = false, verifyHook, authHook;
  const operations = [], registry = new Map();
  const owner = createMoodleLoginIntents({ownerRunId: 'run-demo', runExpiresAtExclusive: 1800, scope, wallets,
    now: () => wall, monotonic: () => mono,
    deriveBrowserProof: browserProof, deriveFinishProof: finishProof,
    async verifyMoodle({operation, request}) {
      operations.push({operation, request});
      assert.deepEqual(registry.get(request.requestRef), {operation, request}, 'only exact C-registered operations are authorized');
      await verifyHook?.(operation, request);
      if (revoked) throw Error('MOODLE_SESSION_REVOKED');
      assert(wall < request.expiresAtExclusive);
      const {installationRef, courseRef, subjectRef, actorRefs} = scope;
      return {ownerRunId: request.ownerRunId, role: request.role, installationRef, courseRef,
        subjectRef, actorRef: actorRefs[request.role], sessionRef, expiresAtExclusive: 1600};
    },
    authenticateClear(c) {
      authHook?.();
      if (loggedOut) throw Error('CLEAR_SESSION_REVOKED');
      return {role: c.wallet === wallets.PARTICIPANT ? 'participant' : 'operator', wallet: c.wallet, expiresAt: 1700};
    },
  });
  const input = (role, extras, operation = extras?.handback ? 'finish' : extras?.intentRef ? 'status' : 'start') => {
    const request = {version: MOODLE_LOGIN_INTENT, requestRef: hex(++seq), ownerRunId: 'run-demo',
      moodleAuthorityRef: hex(90), role, expiresAtExclusive: wall + 5, ...extras};
    registry.set(request.requestRef, {operation, request: structuredClone(request)});
    return request;
  };
  async function launch(role = 'PARTICIPANT') {
    const start = input(role), issued = await owner.issue(start);
    const popup = owner.bootstrap(), other = owner.bootstrap();
    assert.notEqual(popup.bootstrapCookie, popup.challenge);
    const binding = {ownerRunId: start.ownerRunId, intentRef: start.requestRef, launchCode: issued.launchCode};
    const redeem = {code: issued.launchCode, browserProof: browserProof({...binding, challenge: popup.challenge}), ...popup};
    assert.throws(() => owner.redeem({...redeem, bootstrapCookie: undefined}), /MOODLE_LOGIN_LAUNCH/);
    assert.throws(() => owner.redeem({...redeem, bootstrapCookie: other.bootstrapCookie}), /MOODLE_LOGIN_LAUNCH/);
    assert.throws(() => owner.redeem({...redeem, ...other}), /MOODLE_LOGIN_LAUNCH/);
    assert.throws(() => owner.redeem({...redeem, browserProof: finishProof(binding)}), /MOODLE_LOGIN_LAUNCH/);
    const redeemed = owner.redeem(redeem);
    assert.throws(() => owner.redeem(redeem), /MOODLE_LOGIN_LAUNCH/);
    const next = (extra, operation) => input(role, {intentRef: start.requestRef, ...extra}, operation);
    return {start, redeemed, next, finishProof: finishProof(binding), complete: () => owner.complete(redeemed.browserBinding, context(role))};
  }
  return {owner, operations, input, launch, advance(n){wall += n; mono += n * 1000;},
    drift(n){mono += n;}, replace(){sessionRef = hex(71);}, originalSession(){sessionRef = hex(70);}, revoke(){revoked = true;},
    logout(){loggedOut = true;}, hold(fn){verifyHook = fn;}, onAuthenticate(fn){authHook = fn;}};
}

for (const [role, route] of [['PARTICIPANT', '/onboarding'], ['COURSE_OPERATOR', '/operator']]) {
  test(role + ' needs the original Moodle tab to finish after its own CLEAR login', async () => {
    const x = fixture(), a = await x.launch(role);
    assert.equal(a.redeemed.location, route);
    assert.equal((await x.owner.status(a.next())).status, 'WAITING');
    await assert.rejects(x.owner.complete(hex(222), context(role)), /MOODLE_LOGIN_BROWSER/);
    const wrongRole = role === 'PARTICIPANT' ? 'COURSE_OPERATOR' : 'PARTICIPANT';
    await assert.rejects(x.owner.complete(a.redeemed.browserBinding, context(wrongRole)), /MOODLE_LOGIN_CLEAR_ACTOR/);
    x.advance(10); // The start lease is dead. Completion makes no C authority request.
    const beforeComplete = x.operations.length;
    assert.deepEqual(await a.complete(), {status: 'AUTHENTICATED_PENDING_MOODLE'});
    assert.equal(x.operations.length, beforeComplete);
    await assert.rejects(a.complete(), /MOODLE_LOGIN_BROWSER/);

    const statusInput = a.next(), status = await x.owner.status(statusInput);
    assert.deepEqual(x.operations.at(-1), {operation: 'status', request: statusInput});
    assert.equal(status.status, 'RETURN_REQUIRED');
    const finishInput = a.next({handback: status.handback, finishProof: a.finishProof});
    assert.equal((await x.owner.finish({...finishInput, finishProof: hex(333)})).status, 'UNAVAILABLE');
    assert.equal((await x.owner.finish(finishInput)).status, 'CONNECTED');
    assert.deepEqual(x.operations.at(-1), {operation: 'finish', request: finishInput});
    assert.equal((await x.owner.finish(finishInput)).status, 'UNAVAILABLE');

    const current = await x.owner.status(a.next());
    assert.equal(current.status, 'CONNECTED');
    assert.equal(current.handback, null);
    x.logout();
    assert.equal((await x.owner.status(a.next())).status, 'UNAVAILABLE');
  });
}

for (const failure of ['replace', 'revoke', 'logout', 'expiry']) {
  test('return cannot be confirmed after ' + failure, async () => {
    const x = fixture(), a = await x.launch();
    await a.complete();
    const {handback} = await x.owner.status(a.next());
    if (failure === 'expiry') x.advance(60);
    else x[failure]();
    assert.equal((await x.owner.finish(a.next({handback, finishProof: a.finishProof}))).status, 'UNAVAILABLE');
    assert.notEqual((await x.owner.status(a.next())).status, 'CONNECTED');
  });
}
test('end is terminal and carries the entire fresh request to the verifier', async () => {
  const x = fixture(), a = await x.launch();
  await a.complete();
  const {handback} = await x.owner.status(a.next()), end = a.next({}, 'end');
  assert.equal((await x.owner.end(end)).status, 'UNAVAILABLE');
  assert.deepEqual(x.operations.at(-1), {operation: 'end', request: end});
  assert.equal((await x.owner.end(a.next({}, 'end'))).status, 'UNAVAILABLE');
  assert.equal((await x.owner.finish(a.next({handback, finishProof: a.finishProof}))).status, 'UNAVAILABLE');
});
test('an expired monotonic verification lease cannot create or complete a binding', async () => {
  const x = fixture();
  x.hold(operation => { if (operation === 'start') x.drift(5000); });
  await assert.rejects(x.owner.issue(x.input('PARTICIPANT')), /MOODLE_LOGIN_LEASE_EXPIRED/);
  x.hold(undefined);
  const a = await x.launch();
  await a.complete();
  const {handback} = await x.owner.status(a.next());
  x.hold(operation => { if (operation === 'finish') x.drift(5000); });
  assert.equal((await x.owner.finish(a.next({handback, finishProof: a.finishProof}))).status, 'UNAVAILABLE');
  assert.equal((await x.owner.status(a.next())).status, 'UNAVAILABLE');
});
test('an expired popup challenge or launch cannot start authentication', async () => {
  const x = fixture(), q = x.input('PARTICIPANT'), popup = x.owner.bootstrap();
  const issued = await x.owner.issue(q);
  const b = {ownerRunId: q.ownerRunId, intentRef: q.requestRef, launchCode: issued.launchCode, challenge: popup.challenge};
  x.advance(120);
  assert.throws(() => x.owner.redeem({...popup, code: issued.launchCode, browserProof: browserProof(b)}), /MOODLE_LOGIN_LAUNCH/);
});
test('ending the same intent while a finish is in flight prevents connection', async () => {
  const x = fixture(), a = await x.launch();
  await a.complete();
  const {handback} = await x.owner.status(a.next());
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  x.hold(operation => { if (operation === 'finish') { entered.resolve(); return release.promise; } });
  const pending = x.owner.finish(a.next({handback, finishProof: a.finishProof}));
  await entered.promise;
  assert.equal((await x.owner.end(a.next({}, 'end'))).status, 'UNAVAILABLE');
  release.resolve();
  assert.equal((await pending).status, 'UNAVAILABLE');
  assert.equal((await x.owner.status(a.next())).status, 'UNAVAILABLE');
});

test('end awaiting authority cancels a finish that connected in the meantime', async () => {
  const x = fixture(), a = await x.launch();
  await a.complete();
  const {handback} = await x.owner.status(a.next());
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  x.hold(operation => { if (operation === 'end') { entered.resolve(); return release.promise; } });
  const pending = x.owner.end(a.next({}, 'end'));
  await entered.promise;
  assert.equal((await x.owner.finish(a.next({handback, finishProof: a.finishProof}))).status, 'CONNECTED');
  release.resolve();
  assert.equal((await pending).status, 'UNAVAILABLE');
  assert.equal((await x.owner.status(a.next())).status, 'UNAVAILABLE');
});

test('end starting during FINISHING still cancels after finish commits', async () => {
  const x = fixture(), a = await x.launch();
  await a.complete();
  const {handback} = await x.owner.status(a.next());
  const finishEntered = Promise.withResolvers(), finishRelease = Promise.withResolvers();
  const endEntered = Promise.withResolvers(), endRelease = Promise.withResolvers();
  x.hold(operation => {
    if (operation === 'finish') { finishEntered.resolve(); return finishRelease.promise; }
    if (operation === 'end') { endEntered.resolve(); return endRelease.promise; }
  });
  const finishing = x.owner.finish(a.next({handback, finishProof: a.finishProof}));
  await finishEntered.promise;
  const ending = x.owner.end(a.next({}, 'end'));
  await endEntered.promise;
  finishRelease.resolve();
  assert.equal((await finishing).status, 'CONNECTED');
  endRelease.resolve();
  await ending; // Simulate a lost end response and retry with a fresh C request.
  assert.equal((await x.owner.end(a.next({}, 'end'))).status, 'UNAVAILABLE');
  assert.equal((await x.owner.status(a.next())).status, 'UNAVAILABLE');
  assert.equal((await x.owner.finish(a.next({handback, finishProof: a.finishProof}))).status, 'UNAVAILABLE');
});

test('two simultaneous finishes consume the pending handback once', async () => {
  const x = fixture(), a = await x.launch();
  await a.complete();
  const {handback} = await x.owner.status(a.next());
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  x.hold(operation => { if (operation === 'finish') { entered.resolve(); return release.promise; } });
  const finishing = x.owner.finish(a.next({handback, finishProof: a.finishProof}));
  await entered.promise;
  assert.equal((await x.owner.finish(a.next({handback, finishProof: a.finishProof}))).status, 'UNAVAILABLE');
  release.resolve();
  assert.equal((await finishing).status, 'CONNECTED');
  assert.equal(x.operations.filter(op => op.operation === 'finish').length, 1);
});

test('status repeatedly projects the same handback and never extends the pending deadline', async () => {
  const x = fixture(), a = await x.launch();
  await a.complete();
  const first = await x.owner.status(a.next());
  assert.equal(first.expiresAtExclusive, 1060);
  for (const seconds of [10, 20, 29]) {
    x.advance(seconds);
    const next = await x.owner.status(a.next());
    assert.equal(next.status, 'RETURN_REQUIRED');
    assert.equal(next.handback, first.handback);
    assert.equal(next.expiresAtExclusive, first.expiresAtExclusive);
  }
  x.advance(1);
  assert.equal((await x.owner.status(a.next())).status, 'EXPIRED');
  assert.equal((await x.owner.status(a.next())).status, 'EXPIRED');
  assert.equal((await x.owner.finish(a.next({handback: first.handback, finishProof: a.finishProof}))).status, 'UNAVAILABLE');
});

test('end awaiting authority cancels locally completed authentication, with no revival', async () => {
  const x = fixture(), a = await x.launch();
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  x.hold(operation => { if (operation === 'end') { entered.resolve(); return release.promise; } });
  const ending = x.owner.end(a.next({}, 'end'));
  await entered.promise;
  await a.complete();
  release.resolve();
  await ending;
  assert.equal((await x.owner.status(a.next())).status, 'UNAVAILABLE');
  await assert.rejects(a.complete(), /MOODLE_LOGIN_BROWSER/);
  assert.equal(x.operations.filter(op => op.operation === 'complete').length, 0);
});

test('a different Moodle session cannot end the original connection', async () => {
  const x = fixture(), a = await x.launch();
  await a.complete();
  const {handback} = await x.owner.status(a.next());
  assert.equal((await x.owner.finish(a.next({handback, finishProof: a.finishProof}))).status, 'CONNECTED');
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  x.hold(operation => { if (operation === 'end') { entered.resolve(); return release.promise; } });
  const ending = x.owner.end(a.next({}, 'end'));
  await entered.promise;
  x.replace();
  release.resolve();
  assert.equal((await ending).status, 'UNAVAILABLE');
  // A mismatched identity cannot access the old connection either.
  assert.equal((await x.owner.status(a.next())).status, 'UNAVAILABLE');
  x.originalSession();
  assert.equal((await x.owner.status(a.next())).status, 'CONNECTED');
});

for (const operation of ['finish', 'status']) {
  for (const expiry of ['request wall', 'request monotonic', 'pending', 'abort', 'close']) {
    test(operation + ' rejects expiry or cancellation during its final CLEAR authentication: ' + expiry, async () => {
      const x = fixture(), a = await x.launch();
      await a.complete();
      const {handback} = await x.owner.status(a.next());
      if (expiry === 'pending') x.advance(59);
      const controller = new AbortController();
      let calls = 0;
      x.onAuthenticate(() => {
        if (++calls !== (operation === 'finish' ? 2 : 1)) return;
        if (expiry === 'request wall') x.advance(5);
        if (expiry === 'request monotonic') x.drift(5000);
        if (expiry === 'pending') x.advance(1);
        if (expiry === 'abort') controller.abort();
        if (expiry === 'close') x.owner.close();
      });
      const request = operation === 'finish' ? a.next({handback, finishProof: a.finishProof}) : a.next();
      const result = await x.owner[operation](request, {signal: controller.signal});
      assert.equal(result.status, 'UNAVAILABLE');
      assert.equal(result.handback, null);
      x.onAuthenticate(undefined);
      if (expiry !== 'close') assert.notEqual((await x.owner.status(a.next())).status, 'CONNECTED');
    });
  }
}
