import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const load = (name, ...deps) => {
    let module;
    new Function('define', readFileSync(new URL(
        '../local_clearbridge/amd/build/' + name + '.min.js', import.meta.url), 'utf8'))(
        (_names, factory) => { module = factory(...deps); });
    return module;
};
const validate = process.env.CLEAR_NATIVE_WORKFLOW_CONTRACT
    ? (await import(process.env.CLEAR_NATIVE_WORKFLOW_CONTRACT)).validateNativeWorkflowCommand
    : input => input;
const workflow = load('course_native_workflow');
const contract = load('course_native_wallet_contract');
const actions = ['read-session', 'create-application', 'read-application', 'bind-source-session',
    'read-source-signature', 'approve-source-signature', 'read-registration', 'approve-registration',
    'approve-reflection', 'consent', 'payment-receipt', 'decision-evidence', 'read-operation'];
const connected = (role = 'participant') => ({version: 'clear-moodle-wallet-view.1', role, phase: 'CONNECTED',
    busy: false, providers: [], choices: [{choiceId: 'wallet-one', address: '0x' + 'a'.repeat(40)}],
    selectedChoiceId: 'wallet-one', networkReady: true, authenticated: true, allowedActions: ['sign-out'], error: null});
const session = (applicationId = null, role = 'PARTICIPANT') =>
    ({version: 'clear-bootcamp-normal-session.1', applicationId, role});
const receipt = {record: {applicationId: 'app-one', operationId: 'op-one'}, current: true};
const fixture = (reply, {role = 'participant', port = true} = {}) => {
    const buttons = Object.fromEntries(actions.map(workflowAction => [workflowAction,
        {dataset: {workflowAction, workflowChoice: 'AGREE'}}]));
    const listeners = {};
    const status = {};
    const applicationStatus = {};
    const ack = {addEventListener() {}, removeEventListener() {}};
    const details = {dataset: {workflowDetails: 'session operation registration application source reflection evidence receipt'}};
    const template = readFileSync(new URL('../local_clearbridge/templates/course_refund.mustache', import.meta.url), 'utf8');
    const messages = [...template.matchAll(/data-workflow-message="([^"]+)"/g)]
        .map(([, workflowMessage]) => ({dataset: {workflowMessage}, textContent: workflowMessage}));
    const root = {
        querySelectorAll: selector => ({
            '[data-workflow-action]': Object.values(buttons), '[data-workflow-message]': messages,
            '[data-workflow-details]': [details],
        })[selector],
        querySelector: selector => ({
            '[data-workflow-status]': status, '#clearbridge-application-status': applicationStatus, '[data-workflow-ack]': ack,
        })[selector],
        addEventListener: (event, fn) => { listeners[event] = fn; },
        removeEventListener: event => { delete listeners[event]; },
    };
    let state, walletDispatch;
    const sent = [];
    const validated = [];
    const compose = load('course_native_wallet', contract, {create({dispatch}) {
        walletDispatch = dispatch;
        return {render() {}, destroy() {}};
    }}, workflow).compose;
    const mounted = compose({
        element: {dataset: {clearWalletRole: role}, closest: () => root},
        config: {appId: 'syntheticfixture123', origin: 'https://127.0.0.1:19474',
            redirectUri: 'https://127.0.0.1:19474/local/clearbridge/wallet-return', phase: 'ACTIVE_LOCAL_TEST',
            chainId: 31337, rpcUrl: 'http://127.0.0.1:19475', instanceId: '0x' + 'a'.repeat(64),
            surface: 'MOODLE_NATIVE', role, courseId: 2, sesskey: 'synthetic01'},
        validateNativeWorkflowCommand: port ? input => { validated.push(input); return validate(input); } : undefined,
        mountCourseWallet({onState}) {
            state = onState;
            onState(connected(role));
            return {
                async runWorkflow(input) { sent.push(input); return reply(input); },
                async dispatch() {},
                async destroy() {},
            };
        },
    });
    return {mounted, sent, validated, state, buttons, status, applicationStatus, details, ack, walletDispatch,
        click: action => listeners.click?.({target: {closest: () => buttons[action]}})};
};

test('explicit workflow follows returned application ID, preserves reviewed objects and verifies canonical receipt', async () => {
    const view = {version: 'clear-bootcamp-normal-view.1', displayOnly: true, applicationId: 'app-one', role: 'PARTICIPANT',
        target: {targetDecisionId: 'decision-one'}, agreedPayment: {amountAtoms: '100000000', decimals: 6, symbol: 'TEST'},
        criteria: [{criterionId: 'activity-complete', state: 'MET', current: true}]};
    const packet = {version: 'clear-bootcamp-recipient-registration.1', applicationId: 'app-one', role: 'PARTICIPANT',
        purpose: 'REGISTER_FIXED_RECIPIENT', calldataPublic: true, status: 'AWAITING_SIGNATURE',
        registrationTargetId: 'register-one', payload: {message: {recipient: '<test-recipient>'}}};
    const evidence = {applicationId: 'app-one', version: 'clear-bootcamp-decision-evidence.1', role: 'PARTICIPANT',
        manifest: {criteria: [{criterionId: 'assignment-submitted', state: 'MISSING'}]},
        availability: [{criterionId: 'assignment-submitted', status: 'EXPIRED'}]};
    const sign = {applicationId: 'app-one', approvalId: 'approval-one', requestHash: '0x' + 'a'.repeat(64),
        expiresAt: Math.floor(Date.now() / 1000) + 60, message: 'Evidence only\n<img src=x onerror=alert(1)>',
        purpose: 'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'};
    const procedure = {...receipt, version: 'clear-bootcamp-procedure-operation.1', usableForPayment: false};
    let canonical = false;
    let claimState = 'NOT_OBSERVED';
    const ui = fixture(({action}) => ({
        'read-session': session(), 'create-application': receipt, 'read-application': view,
        'bind-source-session': {applicationId: 'app-one', status: 'AUTHENTICATED_SOURCE_SESSION_BOUND', paymentAuthorization: false},
        'read-source-signature': sign, 'approve-source-signature': {...sign, status: 'PARTICIPANT_SIGNATURE_ACCEPTED',
            paymentAuthorization: false},
        'read-registration': packet, 'approve-registration': procedure, consent: procedure,
        'decision-evidence': evidence, 'read-operation': receipt,
        'payment-receipt': {applicationId: 'app-one', version: 'clear-bootcamp-normal-payment-receipt.1', role: 'PARTICIPANT',
            claim: {state: claimState, canonical, transferAmountAtoms: '100000000', finalized: false},
            balance: {receivedAtoms: '100000000', exactExpectedAmountVerified: true}},
    })[action]);
    assert.deepEqual(ui.sent, []);
    await ui.click('create-application');
    await ui.click('read-session');
    assert.equal(ui.applicationStatus.textContent, 'applicationreviewed');
    await ui.click('create-application');
    assert.equal(ui.applicationStatus.textContent, 'applicationknown');
    assert.doesNotMatch(ui.details.textContent, /app-one|op-one/);
    assert.match(ui.sent.at(-1).idempotencyKey, /^moodle-[a-f0-9-]+$/);
    await ui.click('read-operation');
    assert.deepEqual(ui.sent.at(-1), {action: 'read-operation', applicationId: 'app-one', operationId: 'op-one', kind: 'application'});
    await ui.click('bind-source-session');
    await ui.click('read-source-signature');
    assert.ok(ui.details.textContent.endsWith(sign.message));
    await ui.click('approve-source-signature');
    assert.equal(ui.sent.at(-1).reviewed, sign);
    await ui.click('read-registration');
    assert.match(ui.details.textContent, /register-one.*<test-recipient>/s);
    await ui.click('approve-registration');
    assert.equal(ui.sent.at(-1).reviewed, packet);
    await ui.click('read-application');
    assert.match(ui.details.textContent, /decision-one.*100 TEST.*activity-complete/s);
    await ui.click('consent');
    assert.equal(ui.sent.at(-1).reviewed, view);
    assert.equal(ui.sent.at(-1).value, 'AGREE');
    await ui.click('decision-evidence');
    assert.match(ui.details.textContent, /assignment-submitted.*EXPIRED/s);
    await ui.click('payment-receipt');
    assert.match(ui.details.textContent, /unconfirmed.*receiptnotobserved/s);
    claimState = 'READBACK_UNAVAILABLE';
    await ui.click('payment-receipt');
    assert.match(ui.details.textContent, /unconfirmed.*receiptunavailable/s);
    claimState = 'INCLUDED';
    await ui.click('payment-receipt');
    assert.match(ui.details.textContent, /unconfirmed.*receiptincluded/s);
    canonical = true;
    await ui.click('payment-receipt');
    assert.match(ui.details.textContent, /^received/m);
    assert.match(ui.details.textContent, /notfinalized/);
    assert.deepEqual(ui.validated, ui.sent);
});

test('cancelled pending write drops late success, clears review and locks recreation even after null binding', async () => {
    let finish;
    const ui = fixture(({action}) => action === 'read-session' ? session() : new Promise(resolve => { finish = resolve; }));
    await ui.click('read-session');
    const writing = ui.click('create-application');
    await ui.click('create-application');
    assert.equal(ui.status.textContent, 'busy');
    assert.equal(ui.sent.length, 2);
    await ui.walletDispatch({action: 'cancel'});
    finish(receipt);
    await writing;
    ui.state(connected());
    await ui.click('read-session');
    await ui.click('create-application');
    await ui.click('read-operation');
    assert.equal(ui.status.textContent, 'unknown');
    assert.equal(ui.applicationStatus.textContent, 'unknown');
    assert.equal(ui.buttons['create-application'].disabled, true);
    assert.equal(ui.buttons['read-operation'].disabled, true);
    assert.equal(ui.sent.filter(x => x.action === 'create-application').length, 1);
    assert.doesNotMatch(ui.details.textContent, /app-one|op-one/);
});

test('rejected write stays UNKNOWN, disconnected reads are discarded, and absent port or wrong role closes controls', async () => {
    const ui = fixture(({action}) => {
        if (action === 'read-session') {
            return session();
        }
        throw Object.assign(new Error('private exception'), {outcome: 'UNKNOWN'});
    });
    await ui.click('read-session');
    await ui.click('create-application');
    await ui.click('read-session');
    assert.equal(ui.status.textContent, 'unknown');
    assert.equal(ui.applicationStatus.textContent, 'unknown');
    assert.equal(ui.buttons['create-application'].disabled, true);

    let resolve;
    const late = fixture(() => new Promise(done => { resolve = done; }));
    const reading = late.click('read-session');
    late.state(connected('operator'));
    resolve(session('app-one'));
    await reading;
    assert.equal(late.details.textContent, '');
    assert.equal(late.buttons['read-session'].disabled, true);

    const absent = fixture(() => session(), {port: false});
    await absent.click('read-session');
    assert.deepEqual(absent.sent, []);
    const operator = fixture(() => session('app-one', 'OPERATOR'), {role: 'operator'});
    await operator.click('read-session');
    await operator.click('create-application');
    await operator.click('read-registration');
    assert.deepEqual(operator.sent, [{action: 'read-session'}]);
    assert.equal(operator.buttons['read-application'].disabled, false);
});

test('reflection approval requires returned authority and explicit acknowledgment for the displayed input', async () => {
    const approval = {version: 'clear-normal-exact-ai-approval-display.1', applicationId: 'app-one',
        permitted: true, approvalWindowEndsAtMs: Date.now() + 60000, bodySha256: 'input-hash', model: 'test-model',
        scenarioUsd: '0.00346', runBindingHash: 'run-binding'};
    const ui = fixture(({action}) => action === 'read-session' ? {...session('app-one'), aiApproval: approval} : {
        version: 'clear-normal-ai-approval-receipt.1', applicationId: 'app-one', runBindingHash: approval.runBindingHash,
        status: 'RECORDED', paymentConsentIncluded: false,
    });
    await ui.click('read-session');
    assert.match(ui.details.textContent, /input-hash.*test-model.*0\.00346/s);
    await ui.click('approve-reflection');
    assert.equal(ui.sent.length, 1);
    ui.ack.checked = true;
    await ui.click('approve-reflection');
    assert.equal(ui.sent.at(-1).reviewed, approval);
    assert.equal(ui.ack.checked, false);
    assert.equal(ui.buttons['approve-reflection'].disabled, true);
    assert.match(ui.details.textContent, /airecorded/);
});
