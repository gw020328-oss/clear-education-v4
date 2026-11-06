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
const nativePanels = load('course_native_panels');
const workflow = load('course_native_workflow');
const contract = load('course_native_wallet_contract');
const actions = ['start-certificate', 'read-session', 'create-application', 'read-application', 'bind-source-session',
    'read-source-signature', 'approve-source-signature', 'read-registration', 'approve-registration',
    'approve-reflection', 'consent', 'payment-receipt', 'decision-evidence', 'read-operation'];
const connected = (role = 'participant') => ({version: 'clear-moodle-wallet-view.1', role, phase: 'CONNECTED',
    busy: false, providers: [], choices: [{choiceId: 'wallet-one', address: '0x' + 'a'.repeat(40)}],
    selectedChoiceId: 'wallet-one', networkReady: true, authenticated: true, allowedActions: ['sign-out'], error: null});
const session = (applicationId = null, role = 'PARTICIPANT') =>
    ({version: 'clear-bootcamp-normal-session.1', applicationId, role});
const receipt = {record: {applicationId: 'app-one', operationId: 'op-one'}, current: true};
const certificateView = () => ({version: 'clear-bootcamp-normal-view.1', displayOnly: true,
    applicationId: 'app-one', role: 'PARTICIPANT', target: {expectedRevision: 2}, agreedPayment: {},
    decision: {id: 'decision-one', hash: 'hash-one', revision: 2, current: true, evidenceCurrent: false},
    criteria: ['activity-complete', 'assignment-submitted', 'reflection-topics', 'python-basic-certificate'].map(criterionId =>
        ({criterionId, state: criterionId === 'python-basic-certificate' ? 'MET' : 'MISSING', current: true,
            evidenceId: criterionId === 'python-basic-certificate' ? 'evidence-cert' : null, evidenceRevision: 1}))});
const certificateEvidence = () => ({version: 'clear-bootcamp-decision-evidence.1', applicationId: 'app-one', role: 'PARTICIPANT',
    currentDecision: {decisionId: 'decision-one', applicationActive: true, matchesRequestedDecision: true},
    manifest: {version: 'clear-bootcamp-evidence-manifest.1', applicationId: 'app-one',
        decision: {decisionId: 'decision-one', decisionHash: 'hash-one', decisionRevision: 2},
        criteria: [{criterionId: 'python-basic-certificate', state: 'MET', evidenceId: 'evidence-cert', evidenceRevision: 1,
            metadataStatus: 'RECORDED', verification: {integrity: 'VERIFIED'}, checks: {certificateName: 'Python (Basic)'}}]},
    availability: [{criterionId: 'python-basic-certificate', evidenceId: 'evidence-cert', status: 'VALID_AS_RECORDED'}]});
const fixture = (reply, {role = 'participant', port = true, cardRoot, stageRoot, payoutRoot, guideRoot} = {}) => {
    const buttons = Object.fromEntries(actions.map(workflowAction => [workflowAction,
        {dataset: {workflowAction, workflowChoice: 'AGREE'}}]));
    const listeners = {};
    const status = {};
    const applicationStatus = {};
    const panelStatus = {};
    const activityStatus = {};
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
            '[data-native-condition-cards]': cardRoot, '[data-native-stage-strip]': stageRoot, '[data-native-guide]': guideRoot, '[data-native-payout-summary]': payoutRoot, '[data-native-activity-status]': activityStatus, '[data-native-panel-status]': panelStatus,
            '[data-workflow-status]': status, '#clearbridge-application-status': applicationStatus, '[data-workflow-ack]': ack,
        })[selector],
        addEventListener: (event, fn, capture = false) => { listeners[event + (capture ? 'Capture' : '')] = fn; },
        removeEventListener: (event, _fn, capture = false) => { delete listeners[event + (capture ? 'Capture' : '')]; },
    };
    let state, walletDispatch;
    const sent = [];
    const validated = [];
    const compose = load('course_native_wallet', contract, {create({dispatch}) {
        walletDispatch = dispatch;
        return {render() {}, destroy() {}};
    }}, workflow, nativePanels).compose;
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
    return {mounted, sent, validated, state, buttons, status, panelStatus, activityStatus, applicationStatus, details, ack, walletDispatch,
        click: action => listeners.click?.({target: {closest: () => buttons[action]}}),
        clickLink: link => {
            const event = {target: {closest: selector => selector === 'a.crc-go' ? link : null}};
            listeners.clickCapture?.(event);
            return listeners.click?.(event);
        }};
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

test('a reflection approval stopped before submission can be refreshed and approved explicitly', async () => {
    const approval = {version: 'clear-normal-exact-ai-approval-display.1', applicationId: 'app-one',
        permitted: true, approvalWindowEndsAtMs: Date.now() + 60000, bodySha256: 'input-hash', model: 'test-model',
        scenarioUsd: '0.00346', runBindingHash: 'run-binding'};
    let attempts = 0;
    const ui = fixture(({action}) => {
        if (action === 'read-session') {
            return {...session('app-one'), aiApproval: approval};
        }
        if (++attempts === 1) {
            throw Object.assign(Error('stale'), {code: 'MOODLE_AI_REVIEW_CHANGED', outcome: 'NOT_SENT'});
        }
        return {version: 'clear-normal-ai-approval-receipt.1', applicationId: 'app-one',
            runBindingHash: approval.runBindingHash, status: 'RECORDED', paymentConsentIncluded: false};
    });
    await ui.click('read-session');
    ui.ack.checked = true;
    await ui.click('approve-reflection');
    assert.equal(ui.status.textContent, 'failure');
    await ui.click('read-session');
    assert.equal(attempts, 1);
    assert.equal(ui.ack.checked, false);
    ui.ack.checked = true;
    await ui.click('approve-reflection');
    assert.equal(attempts, 2);
    assert.match(ui.details.textContent, /airecorded/);
});

test('application evidence status follows evidenceCurrent for missing, expired and current evidence', async () => {
    const cases = [
        {evidenceCurrent: false, state: 'UNKNOWN', reasonCode: 'SOURCE_UNAVAILABLE'},
        {evidenceCurrent: false, state: 'UNKNOWN', reasonCode: 'EXPIRED'},
        {evidenceCurrent: true, state: 'MET', reasonCode: null},
    ];
    for (const {evidenceCurrent, state, reasonCode} of cases) {
        const view = {version: 'clear-bootcamp-normal-view.1', displayOnly: true, applicationId: 'app-one', role: 'PARTICIPANT',
            decision: {current: true, evidenceCurrent, conditionsStatus: state},
            target: {targetDecisionId: 'decision-one'}, agreedPayment: {amountAtoms: '100000000', decimals: 6, symbol: 'TEST'},
            criteria: [{criterionId: 'activity-complete', state, current: evidenceCurrent, reasonCode}]};
        const ui = fixture(({action}) => action === 'read-session' ? session('app-one') : view);
        await ui.click('read-session');
        await ui.click('read-application');
        const basisLines = ui.details.textContent.split('\n').filter(line => line.startsWith('basis: '));
        const expected = evidenceCurrent ? 'basis: CURRENT' : 'basis: UNKNOWN';
        assert.deepEqual(basisLines, [expected, expected], reasonCode ?? 'current evidence');
    }
});

test('current native mount feeds D role status and clears the display after disconnect', async () => {
    for (const role of ['participant', 'operator']) {
        const ui = fixture(() => { throw new Error('display must not call server'); }, {role});
        assert.equal(ui.panelStatus.textContent, 'panelconnected');
        await ui.walletDispatch({action: 'cancel'});
        assert.equal(ui.panelStatus.textContent, 'panelunknown');
        assert.deepEqual(ui.sent, []);
    }
});

function installCardDom() {
    class Node {
        constructor(tag) {
            this.tag = tag;
            this.children = [];
            this.attributes = {};
            this.handlers = {};
            this.text = '';
        }
        set textContent(value) { this.text = String(value); }
        get textContent() { return this.text + this.children.map(node => node.textContent).join(' '); }
        get ownerDocument() { return globalThis.document; }
        querySelector(selector) {
            return [...walk(this)].find(node => {
                if (selector.startsWith('.')) {
                    return node.className?.split(' ').includes(selector.slice(1));
                }
                const attr = selector.match(/^\[([^=]+)(?:="([^"]*)")?\]$/);
                return attr && Object.hasOwn(node.attributes ?? {}, attr[1])
                    && (attr[2] === undefined || node.attributes[attr[1]] === attr[2]);
            });
        }
        replaceWith(replacement) {
            const index = this.parent.children.indexOf(this);
            this.parent.children[index] = replacement;
            replacement.parent = this.parent;
        }
        get href() { return this.attributes.href; }
        contains(node) { return [...walk(this)].includes(node); }
        append(...nodes) {
            for (const node of nodes) { node.parent = this; this.children.push(node); }
        }
        replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        addEventListener(name, fn) { this.handlers[name] = fn; }
    }
    function* walk(node) {
        yield node;
        for (const child of node.children ?? []) {
            yield* walk(child);
        }
    }
    const visibility = new Map();
    globalThis.document = {
        visibilityState: 'visible',
        addEventListener: (name, fn) => visibility.set(name, fn),
        removeEventListener: name => visibility.delete(name),
        createElement: tag => new Node(tag),
        createElementNS: (_ns, tag) => new Node(tag),
        createTextNode: textContent => ({textContent}),
    };
    return {Node, walk, visibility};
}

test('native lesson return queues once and confirms only matching current lesson evidence', async () => {
    const {Node, walk, visibility} = installCardDom();
    const cardRoot = new Node('div');
    let courseId = 9;
    let revision = 1;
    let matchingEvidence = false;
    const targets = () => ({version: 'clear-student-condition-targets.1', applicationId: 'app-one',
        moodleOrigin: 'https://127.0.0.1:19474', courseId,
        targets: [{criterionId: 'activity-complete', cmId: 3, module: 'page', name: 'Python'}]});
    const view = () => ({version: 'clear-bootcamp-normal-view.1', displayOnly: true,
        applicationId: 'app-one', role: 'PARTICIPANT', target: {expectedRevision: revision}, agreedPayment: {},
        decision: {id: 'decision-one', hash: 'hash-' + revision, revision, current: true},
        criteria: [{criterionId: 'activity-complete', state: revision === 1 ? 'UNKNOWN' : 'MET',
            current: revision > 1, evidenceId: 'evidence-' + revision, evidenceRevision: revision},
        {criterionId: 'assignment-submitted', state: 'MET', current: true, evidenceId: 'outside-scope'}]});
    const ui = fixture(({action}) => ({
        'read-session': {...session('app-one'), conditionTargets: targets()},
        'read-application': view(),
        'refresh-activity': {status: 'QUEUED', operationId: 'operation-lesson'},
        'decision-evidence': {version: 'clear-bootcamp-decision-evidence.1', role: 'PARTICIPANT', applicationId: 'app-one',
            manifest: {decision: {decisionId: 'decision-one', decisionHash: 'hash-' + revision}, criteria: []},
            availability: [{criterionId: 'activity-complete', evidenceId: matchingEvidence ? 'evidence-' + revision : 'other-evidence',
                status: revision > 1 ? 'VALID_AS_RECORDED' : 'MISSING'}]},
    })[action], {cardRoot});
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const link = () => [...walk(cardRoot)].find(node => node.tag === 'a' && node.attributes.href);
    try {
        await ui.click('read-session');
        await flush();
        assert.equal(link(), undefined);
        courseId = 2;
        await ui.click('read-session');
        await ui.click('read-application');
        await flush();
        assert.equal(link().attributes.href, 'https://127.0.0.1:19474/mod/page/view.php?id=3');
        assert.equal(link().attributes.target, '_blank');
        assert.match(cardRoot.textContent, /0 \/ 4 충족/);
        const opened = link();
        opened.handlers.click();
        await ui.clickLink(opened);
        assert.equal(ui.sent.filter(command => command.action === 'refresh-activity').length, 0);
        visibility.get('visibilitychange')();
        await flush();
        assert.equal(ui.activityStatus.textContent, 'activityqueued');
        assert.equal(ui.sent.filter(command => command.action === 'read-application').length, 2);
        const refreshes = () => ui.sent.filter(command => command.action === 'refresh-activity');
        assert.deepEqual(refreshes().map(({idempotencyKey, ...command}) => command),
            [{action: 'refresh-activity', applicationId: 'app-one', expectedRevision: 1}]);
        assert.match(refreshes()[0].idempotencyKey, /^moodle-[a-f0-9-]+$/);
        visibility.get('visibilitychange')();
        revision = 2;
        await ui.click('read-application');
        await flush();
        assert.equal(refreshes().length, 1);
        assert.equal(ui.activityStatus.textContent, 'activityqueued');
        matchingEvidence = true;
        await ui.click('decision-evidence');
        assert.equal(ui.activityStatus.textContent, 'activityconfirmed');
        assert.match(cardRoot.textContent, /1 \/ 4 충족/);
        assert.ok(ui.sent.every(command => ['read-session', 'read-application', 'decision-evidence', 'refresh-activity'].includes(command.action)));
    } finally {
        ui.mounted.destroy();
        assert.deepEqual(cardRoot.children, []);
        assert.equal(visibility.size, 0);
        delete globalThis.document;
    }
});

test('three Moodle targets refresh only the clicked lesson or assignment and return matched evidence without forum writes', async () => {
    const {Node, walk, visibility} = installCardDom();
    const cardRoot = new Node('div');
    const targets = {version: 'clear-student-condition-targets.1', applicationId: 'app-one', courseId: 2,
        moodleOrigin: 'https://127.0.0.1:19474', targets: [
            {criterionId: 'activity-complete', cmId: 3, module: 'page', instanceId: 1},
            {criterionId: 'assignment-submitted', cmId: 4, module: 'assign', instanceId: 1},
            {criterionId: 'reflection-topics', cmId: 5, module: 'forum', instanceId: 3},
        ]};
    let bad = false, recorded = false;
    const view = () => ({...certificateView(), criteria: certificateView().criteria.map(row =>
        row.criterionId === 'assignment-submitted' && recorded
            ? {...row, state: 'MET', evidenceId: 'evidence-assignment', evidenceRevision: 2} : row)});
    const evidence = () => ({...certificateEvidence(), manifest: {...certificateEvidence().manifest,
        criteria: view().criteria.map(row => ({...row, metadataStatus: row.evidenceId ? 'RECORDED' : 'MISSING'}))},
        availability: view().criteria.map(row => ({criterionId: row.criterionId, evidenceId: row.evidenceId,
            status: row.evidenceId ? 'VALID_AS_RECORDED' : 'MISSING'}))});
    const ui = fixture(({action}) => {
        if (action === 'read-session') { return {...session('app-one'), conditionTargets: targets}; }
        if (action === 'read-application') { return view(); }
        if (action === 'decision-evidence') {
            const result = evidence();
            if (bad) { result.manifest.decision.decisionHash = 'other-hash'; }
            return result;
        }
        if (action === 'refresh-activity') { recorded = true; return {status: 'QUEUED', operationId: 'op-refresh'}; }
        throw Error('unexpected write');
    }, {cardRoot});
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const links = () => [...walk(cardRoot)].filter(node => node.tag === 'a' && node.className?.includes('crc-go'));
    const returned = async () => { visibility.get('visibilitychange')?.(); await flush(); await flush(); };
    try {
        await ui.click('read-session'); await flush();
        assert.deepEqual(links().map(link => link.href), targets.targets.map(t => targets.moodleOrigin + `/mod/${t.module}/view.php?id=${t.cmId}`));
        const assignment = links().find(link => link.href.includes('/assign/'));
        assignment.handlers.click(); await ui.clickLink(assignment); await returned();
        const refresh = ui.sent.filter(row => row.action === 'refresh-activity');
        assert.equal(refresh.length, 1);
        assert.equal(refresh[0].criterionId, 'assignment-submitted');
        assert.equal(refresh[0].expectedRevision, 2);
        assert.match(cardRoot.querySelector('[data-criterion="assignment-submitted"]').textContent, /충족|MET/);
        await returned();
        assert.equal(ui.sent.filter(row => row.action === 'refresh-activity').length, 1);
        const forum = links().find(link => link.href.includes('/forum/'));
        forum.handlers.click(); await ui.clickLink(forum); await returned();
        assert.equal(ui.sent.filter(row => row.action === 'refresh-activity').length, 1);
        assert.doesNotMatch(cardRoot.querySelector('[data-criterion="reflection-topics"]').textContent, /서버 검증 완료/);
        bad = true; await ui.click('read-session'); await flush();
        assert.equal(ui.status.textContent, 'failure');
        assert.doesNotMatch(cardRoot.querySelector('[data-criterion="assignment-submitted"]').textContent, /서버 판정.*충족/s);
        bad = false;
        const original = structuredClone(targets);
        for (const mutate of [t => { t.applicationId = 'other-app'; }, t => { t.moodleOrigin = 'https://other.invalid'; },
            t => { t.targets[1].cmId = 99; }, t => { t.targets[1] = t.targets[0]; },
            t => { t.targets[1].href = 'https://other.invalid'; }, t => { t.targets[2].instanceId = 99; }]) {
            Object.assign(targets, structuredClone(original)); mutate(targets);
            await ui.click('read-session'); await flush();
            assert.equal(links().length, 0);
        }
        assert.ok(ui.sent.every(row => ['read-session', 'read-application', 'decision-evidence', 'refresh-activity'].includes(row.action)));
    } finally { ui.mounted.destroy(); delete globalThis.document; }
});

test('certificate card starts only on its click, polls reads, and signs the displayed original packet on a separate click', async () => {
    const {Node} = installCardDom();
    const cardRoot = new Node('div');
    let state = 'READY_TO_START';
    let bound = false;
    const app = 'app-one';
    const phase = 'SOURCE_python-basic-certificate';
    const packet = {applicationId: app, approvalId: 'approval-cert', requestHash: '0x' + 'a'.repeat(64),
        expiresAt: Math.floor(Date.now() / 1000) + 300, message: `Exact certificate message
<keep literal>`,
        purpose: 'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'};
    const view = {version: 'clear-bootcamp-normal-view.1', displayOnly: true, applicationId: app, role: 'PARTICIPANT',
        target: {expectedRevision: 1}, agreedPayment: {}, decision: {id: 'decision-one', hash: 'hash-one', current: true},
        criteria: []};
    let ui;
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const primary = () => cardRoot.querySelector('[data-criterion="python-basic-certificate"]').querySelector('.crc-go');
    try {
        ui = fixture(({action}) => {
            if (action === 'create-application') {
                return {...receipt, record: {...receipt.record, applicationRevision: 1}};
            }
            if (action === 'bind-source-session') {
                bound = true;
                return {applicationId: app, status: 'AUTHENTICATED_SOURCE_SESSION_BOUND', paymentAuthorization: false};
            }
            if (action === 'read-session') {
                return {...session(bound ? app : null), phase, certificate: {version: 'clear-certificate-start.1', applicationId: app,
                    criterionId: 'python-basic-certificate', state, startAllowed: state === 'READY_TO_START',
                    signatureReady: state === 'AWAITING_SIGNATURE'}};
            }
            if (action === 'read-application') { return view; }
            if (action === 'start-certificate') {
                state = 'AWAITING_SIGNATURE';
                return {version: 'clear-certificate-start-receipt.1', applicationId: app,
                    criterionId: 'python-basic-certificate', status: 'START_ACCEPTED', paymentAuthorization: false};
            }
            if (action === 'read-source-signature') { return packet; }
            if (action === 'approve-source-signature') {
                state = 'SIGNATURE_ACCEPTED';
                return {approvalId: packet.approvalId, requestHash: packet.requestHash,
                    status: 'PARTICIPANT_SIGNATURE_ACCEPTED', paymentAuthorization: false};
            }
            return {version: 'clear-bootcamp-decision-evidence.1', role: 'PARTICIPANT', applicationId: app,
                manifest: {decision: {decisionId: 'decision-one', decisionHash: 'hash-one'}, criteria: []}};
        }, {cardRoot});
        await flush();
        assert.deepEqual(ui.sent, []);
        await ui.click('read-session');
        await ui.click('create-application');
        await ui.click('bind-source-session');
        await ui.click('read-session');
        await flush();
        assert.equal(ui.sent.filter(command => command.action === 'read-application').length, 0);
        assert.equal(primary().textContent, 'certificatestart-certificate');
        assert.equal(primary().disabled, false);
        assert.equal(ui.sent.filter(command => command.action === 'start-certificate').length, 0);
        primary().handlers.click();
        await flush();
        assert.deepEqual(ui.sent.filter(command => command.action === 'start-certificate').map(({idempotencyKey, ...input}) => input),
            [{action: 'start-certificate', applicationId: app, expectedRevision: 1}]);
        assert.equal(ui.sent.filter(command => command.action === 'read-source-signature').length, 0);
        await new Promise(resolve => setTimeout(resolve, 1100));
        await flush();
        assert.equal(primary().textContent, 'certificateread-source-signature');
        primary().handlers.click();
        await flush();
        assert.ok(cardRoot.textContent.includes(packet.message));
        assert.equal(ui.sent.filter(command => command.action === 'approve-source-signature').length, 0);
        primary().handlers.click();
        await flush();
        assert.equal(ui.sent.at(-1).action, 'approve-source-signature');
        assert.equal(ui.sent.at(-1).reviewed, packet);
        assert.equal(ui.sent.filter(command => command.action === 'start-certificate').length, 1);
    } finally {
        ui?.mounted.destroy();
        delete globalThis.document;
    }
});

test('certificate completed phase displays only authenticated matching VERIFIED and permits no certificate writes', async () => {
    const {Node} = installCardDom();
    const cardRoot = new Node('div');
    const completed = {...session('app-one'), phase: 'CERTIFICATE_ONLY_RECORDED',
        certificate: {version: 'clear-certificate-start.1', applicationId: 'app-one',
            criterionId: 'python-basic-certificate', state: 'VERIFIED', startAllowed: false, signatureReady: false}};
    let current = completed;
    const ui = fixture(({action}) => {
        if (action === 'create-application') { return {...receipt, record: {...receipt.record, applicationRevision: 1}}; }
        if (action === 'read-session') { return current; }
        if (action === 'read-application') { return certificateView(); }
        if (action === 'decision-evidence') { return certificateEvidence(); }
        throw Error('unexpected certificate write');
    }, {cardRoot});
    const flush = () => new Promise(resolve => setImmediate(resolve));
    try {
        current = session();
        await ui.click('read-session');
        await flush();
        await ui.click('create-application');
        await flush();
        const cases = [
            [completed, true],
            [{...completed, phase: 'SOURCE_python-basic-certificate'}, true],
            ...['NOT_READY', 'READY_TO_START', 'START_ACCEPTED', 'AWAITING_SIGNATURE',
                'SIGNATURE_ACCEPTED', 'UNAVAILABLE'].map(state => [{...completed,
                    certificate: {...completed.certificate, state,
                        startAllowed: state === 'READY_TO_START', signatureReady: state === 'AWAITING_SIGNATURE'}}, false]),
            [{...completed, phase: 'OTHER_COMPLETION'}, false],
            [{...completed, certificate: {...completed.certificate, applicationId: 'other-app'}}, false],
            [{...completed, certificate: {...completed.certificate, criterionId: 'other-criterion'}}, false],
            [{...completed, certificate: {...completed.certificate, version: 'other-version'}}, false],
            [{...completed, certificate: {...completed.certificate, startAllowed: true}}, false],
            [{...completed, certificate: {...completed.certificate, signatureReady: true}}, false],
            [{...completed, role: 'OPERATOR'}, false],
            [{...completed, applicationId: null}, false],
        ];
        for (const [value, accepted] of cases) {
            current = value;
            await ui.click('read-session');
            await flush();
            const card = cardRoot.querySelector('[data-criterion="python-basic-certificate"]');
            assert.equal(card.textContent.includes('certificateverified'), accepted, JSON.stringify(value) + ' rendered=' + card.textContent + ' sent=' + JSON.stringify(ui.sent) + ' status=' + ui.status.textContent);
            assert.equal(card.querySelector('.crc-go')?.disabled ?? true, true);
            for (const action of ['start-certificate', 'read-source-signature', 'approve-source-signature']) {
                await ui.click(action);
            }
        }
        assert.ok(ui.sent.every(command => ['read-session', 'create-application', 'read-application', 'decision-evidence'].includes(command.action)));
    } finally {
        ui.mounted.destroy();
        delete globalThis.document;
    }
});

test('certificate completed evidence uses an atomic current pair and discards failures and late session responses', async () => {
    const {Node} = installCardDom();
    const cardRoot = new Node('div');
    const completed = {...session('app-one'), phase: 'CERTIFICATE_ONLY_RECORDED', certificate: {
        version: 'clear-certificate-start.1', applicationId: 'app-one', criterionId: 'python-basic-certificate',
        state: 'VERIFIED', startAllowed: false, signatureReady: false}};
    let view = certificateView(), evidence = certificateEvidence(), fail = null, release;
    let currentSession = {...session('app-one'), conditionTargets: {version: 'clear-student-condition-targets.1',
        applicationId: 'app-one', courseId: 2, moodleOrigin: 'https://127.0.0.1:19474',
        targets: [{criterionId: 'activity-complete', cmId: 3, module: 'page'}]}};
    const ui = fixture(async ({action}) => {
        if (action === 'read-session') { return currentSession; }
        if (action === 'read-application') {
            if (fail === 'view') { throw Error('unavailable'); }
            return view;
        }
        if (action === 'decision-evidence') {
            if (fail === 'evidence') { throw Error('unavailable'); }
            if (fail === 'late') { return new Promise(resolve => { release = () => resolve(evidence); }); }
            return evidence;
        }
        throw Error('unexpected write');
    }, {cardRoot});
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const text = () => cardRoot.querySelector('[data-criterion="python-basic-certificate"]')?.textContent ?? '';
    const refresh = async () => { await ui.click('read-session'); await flush(); await flush(); };
    try {
        await refresh(); // Activate the earlier activity-only filter before certificate completion.
        currentSession = completed;
        await refresh();
        assert.match(text(), /MET|충족/);
        assert.match(text(), /Python \(Basic\).*VERIFIED|VERIFIED.*Python \(Basic\)/s);
        assert.deepEqual(ui.sent.slice(-3).map(row => row.action), ['read-session', 'read-application', 'decision-evidence']);
        const bad = [
            e => { e.applicationId = 'other-app'; },
            e => { e.manifest.applicationId = 'other-app'; },
            e => { e.manifest.decision.decisionId = 'other-decision'; },
            e => { e.manifest.decision.decisionHash = 'other-hash'; },
            e => { e.manifest.decision.decisionRevision++; },
            e => { e.currentDecision.matchesRequestedDecision = false; },
            e => { e.availability[0].status = 'EXPIRED'; },
            e => { e.manifest.criteria[0].evidenceRevision++; },
        ];
        for (const mutate of bad) {
            evidence = certificateEvidence(); mutate(evidence);
            await refresh();
            assert.doesNotMatch(text(), /원천 상태|무결성.*VERIFIED|certificateverified/s);
            assert.equal(ui.status.textContent, 'failure');
        }
        for (const failure of ['view', 'evidence']) {
            evidence = certificateEvidence(); fail = null; await refresh();
            assert.match(text(), /VERIFIED/);
            fail = failure; await refresh();
            assert.doesNotMatch(text(), /VERIFIED/);
        }
        for (const mutate of [v => { v.applicationId = 'other-app'; }, v => { v.decision.current = false; },
            v => { v.criteria[3].current = false; }]) {
            fail = null; view = certificateView(); mutate(view); await refresh();
            assert.equal(ui.status.textContent, 'failure');
            assert.doesNotMatch(text(), /VERIFIED/);
        }
        view = certificateView();
        fail = 'late';
        const waiting = ui.click('read-session');
        await flush();
        const count = ui.sent.length;
        await ui.click('read-session');
        assert.equal(ui.sent.length, count); // An in-flight pair cannot duplicate the reads.
        await ui.walletDispatch({action: 'cancel'});
        ui.state(connected());
        currentSession = session('other-app');
        await refresh();
        release(); await waiting; await flush();
        assert.doesNotMatch(text(), /VERIFIED/);
        assert.ok(ui.sent.every(row => ['read-session', 'read-application', 'decision-evidence'].includes(row.action)));
    } finally { ui.mounted.destroy(); delete globalThis.document; }
});

test('certificate start uses the current same-session view revision after application creation', async () => {
    const {Node} = installCardDom();
    const cardRoot = new Node('div');
    let bound = false;
    let revisionView = {...certificateView(), criteria: [], target: {expectedRevision: 5}};
    const ui = fixture(input => {
        if (input.action === 'create-application') { return {...receipt, record: {...receipt.record, applicationRevision: 1}}; }
        if (input.action === 'bind-source-session') {
            bound = true;
            return {applicationId: 'app-one', status: 'AUTHENTICATED_SOURCE_SESSION_BOUND', paymentAuthorization: false};
        }
        if (input.action === 'read-session') { return {...session(bound ? 'app-one' : null), phase: 'SOURCE_python-basic-certificate',
            certificate: {version: 'clear-certificate-start.1', applicationId: 'app-one', criterionId: 'python-basic-certificate',
                state: 'READY_TO_START', startAllowed: true, signatureReady: false}}; }
        if (input.action === 'decision-evidence') { return certificateEvidence(); }
        if (input.action === 'read-application') { return revisionView; }
        if (input.action === 'start-certificate') {
            assert.equal(input.expectedRevision, 5, 'server CAS requires current revision rather than creation revision1');
            return {version: 'clear-certificate-start-receipt.1', applicationId: 'app-one', criterionId: 'python-basic-certificate',
                status: 'START_ACCEPTED', paymentAuthorization: false};
        }
        throw Error('unexpected');
    }, {cardRoot});
    try {
        for (const action of ['read-session', 'create-application', 'bind-source-session', 'read-session', 'read-application']) {
            await ui.click(action);
        }
        await new Promise(resolve => setImmediate(resolve));
        for (const mutate of [view => { view.target.expectedRevision = 3; }, view => { view.target.expectedRevision = '5'; },
            view => { view.decision.current = false; }, view => { view.applicationId = 'other-app'; },
            view => { view.role = 'COURSE_OPERATOR'; }]) {
            revisionView = {...certificateView(), criteria: [], target: {expectedRevision: 5}};
            mutate(revisionView);
            await ui.click('read-application'); await new Promise(resolve => setImmediate(resolve));
            await ui.click('start-certificate');
            assert.equal(ui.sent.filter(input => input.action === 'start-certificate').length, 0);
            revisionView = {...certificateView(), criteria: [], target: {expectedRevision: 5}};
            await ui.click('read-session'); await ui.click('read-application');
            await new Promise(resolve => setImmediate(resolve));
        }
        await ui.click('start-certificate');
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(ui.sent.find(input => input.action === 'start-certificate')?.expectedRevision, 5, JSON.stringify({sent:ui.sent,status:ui.status}));
        assert.equal(ui.status.textContent, 'success');
    } finally { ui.mounted.destroy(); delete globalThis.document; }
});

test('certificate view revision from a previous wallet session is discarded before acceptance', async () => {
    let release;
    let app = 'app-one';
    const ui = fixture(({action}) => {
        if (action === 'read-session') { return session(app); }
        if (action === 'read-application') { return new Promise(resolve => { release = resolve; }); }
        throw Error('unexpected');
    });
    await ui.click('read-session');
    const old = ui.click('read-application');
    await new Promise(resolve => setImmediate(resolve));
    await ui.walletDispatch({action: 'cancel'});
    ui.state(connected());
    app = 'other-app'; await ui.click('read-session');
    release({...certificateView(), target: {expectedRevision: 99}});
    await old;
    assert.equal(ui.applicationStatus.textContent, 'applicationknown');
    assert.doesNotMatch(ui.details.textContent, /expectedRevision.*99/);
    await ui.click('start-certificate');
    assert.equal(ui.sent.filter(input => input.action === 'start-certificate').length, 0);
    ui.mounted.destroy();
});

test('certificate readiness mismatches stay closed and a lost start response cannot restart from polling', async () => {
    const {Node} = installCardDom();
    const cardRoot = new Node('div');
    let matching = false;
    let bound = false;
    const ui = fixture(({action}) => {
        if (action === 'create-application') {
            return {...receipt, record: {...receipt.record, applicationRevision: 1}};
        }
        if (action === 'bind-source-session') {
            bound = true;
            return {applicationId: 'app-one', status: 'AUTHENTICATED_SOURCE_SESSION_BOUND', paymentAuthorization: false};
        }
        if (action === 'read-operation') {
            return {...receipt, record: {...receipt.record, applicationRevision: 1}};
        }
        if (action === 'read-session') {
            return {...session(bound ? 'app-one' : null), phase: 'SOURCE_python-basic-certificate',
                certificate: {version: 'clear-certificate-start.1', applicationId: matching ? 'app-one' : 'other-app',
                    criterionId: 'python-basic-certificate', state: 'READY_TO_START', startAllowed: true, signatureReady: false}};
        }
        if (action === 'read-application') {
            return {version: 'clear-bootcamp-normal-view.1', displayOnly: true, applicationId: 'app-one', role: 'PARTICIPANT',
                target: {expectedRevision: 1}, agreedPayment: {}, criteria: [], decision: {}};
        }
        throw Object.assign(new Error('lost response'), {outcome: 'UNKNOWN'});
    }, {cardRoot});
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const primary = () => cardRoot.querySelector('[data-criterion="python-basic-certificate"]').querySelector('.crc-go');
    try {
        await ui.click('read-session');
        await ui.click('create-application');
        await ui.click('bind-source-session');
        await ui.click('read-session');
        await flush();
        assert.equal(primary().disabled, true);
        await ui.click('read-source-signature');
        assert.equal(ui.sent.filter(command => command.action === 'read-source-signature').length, 0);
        matching = true;
        await ui.click('read-session');
        await ui.click('read-operation');
        await flush();
        primary().handlers.click();
        await flush();
        assert.equal(ui.status.textContent, 'unknown');
        await ui.click('read-session');
        await ui.click('read-operation');
        await flush();
        assert.equal(primary().disabled, true);
        assert.equal(ui.sent.filter(command => command.action === 'start-certificate').length, 1);
    } finally {
        ui.mounted.destroy();
        delete globalThis.document;
    }
});

test('certificate revision comes only from current matching operation receipts and can be recovered after reconnect', async () => {
    const {Node} = installCardDom();
    const cardRoot = new Node('div');
    let bound = false;
    let returned = {...receipt, record: {...receipt.record, applicationRevision: 2}};
    const ui = fixture(({action}) => {
        if (action === 'read-session') {
            return {...session(bound ? 'app-one' : null), phase: 'SOURCE_python-basic-certificate',
                certificate: {version: 'clear-certificate-start.1', applicationId: 'app-one',
                    criterionId: 'python-basic-certificate', state: 'READY_TO_START', startAllowed: true, signatureReady: false}};
        }
        if (action === 'create-application' || action === 'read-operation') { return returned; }
        if (action === 'bind-source-session') {
            bound = true;
            return {applicationId: 'app-one', status: 'AUTHENTICATED_SOURCE_SESSION_BOUND', paymentAuthorization: false};
        }
        // The mock server's revision has advanced. Its CAS remains the final fence.
        if (action === 'start-certificate') {
            throw Object.assign(new Error('BC_REVISION_CONFLICT'), {outcome: 'UNKNOWN'});
        }
        throw new Error('procedure queries are forbidden');
    }, {cardRoot});
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const primary = () => cardRoot.querySelector('[data-criterion="python-basic-certificate"]').querySelector('.crc-go');
    try {
        await ui.click('read-session');
        await ui.click('create-application');
        await ui.click('bind-source-session');
        await ui.click('read-session');
        await flush();
        assert.equal(primary().disabled, false);
        await ui.walletDispatch({action: 'cancel'});
        ui.state(connected());
        await ui.click('read-session');
        await flush();
        assert.equal(primary().disabled, true);
        await ui.click('read-operation');
        await flush();
        assert.equal(primary().disabled, false);

        for (const invalid of [
            {...returned, record: {...returned.record, applicationId: 'other-app'}},
            {...returned, record: {...returned.record, applicationRevision: undefined}},
            {...returned, record: {...returned.record, applicationRevision: 1}},
            {...returned, current: false},
            {...returned, record: {...returned.record, applicationRevision: 2.5}},
        ]) {
            const valid = returned;
            returned = invalid;
            await ui.click('read-operation');
            await ui.click('read-session');
            await flush();
            assert.equal(primary().disabled, true);
            returned = valid;
            await ui.click('read-operation');
            await flush();
            assert.equal(primary().disabled, false);
        }
        primary().handlers.click();
        await flush();
        assert.equal(ui.sent.at(-1).expectedRevision, 2);
        assert.equal(ui.status.textContent, 'unknown');
        await ui.click('read-session');
        await ui.click('read-operation');
        await flush();
        assert.equal(primary().disabled, true);
        assert.equal(ui.sent.filter(input => input.action === 'start-certificate').length, 1);
        assert.ok(ui.sent.every(input => !['read-application', 'approve-source-signature'].includes(input.action)));
    } finally {
        ui.mounted.destroy();
        delete globalThis.document;
    }
});

// r33: a definite server rejection (nothing recorded) must not lock the page; unknown results still do.
const notAccepted = code => Object.assign(Error(code), {code, outcome: 'HTTP_ERROR', serverEffect: 'NOT_ACCEPTED'});
const certificateSession = () => ({...session('app-one'), phase: 'SOURCE_python-basic-certificate',
    certificate: {version: 'clear-certificate-start.1', applicationId: 'app-one', criterionId: 'python-basic-certificate',
        state: 'READY_TO_START', startAllowed: true, signatureReady: false}});
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a definitely rejected certificate start unlocks a manual re-read and retry without resending', async () => {
    let revision = 4, starts = 0;
    const ui = fixture(input => {
        if (input.action === 'read-session') { return certificateSession(); }
        if (input.action === 'read-application') { return {...certificateView(), criteria: [], target: {expectedRevision: revision}}; }
        if (input.action === 'start-certificate') {
            starts++;
            if (starts === 1) { throw notAccepted('MOODLE_CERTIFICATE_REVIEW_CHANGED'); }
            return {version: 'clear-certificate-start-receipt.1', applicationId: 'app-one', criterionId: 'python-basic-certificate',
                status: 'START_ACCEPTED', paymentAuthorization: false};
        }
        throw Error('unexpected');
    });
    try {
        await ui.click('read-session'); await ui.click('read-application'); await settle();
        revision = 5; // the server moved on after this review
        await ui.click('start-certificate'); await settle();
        assert.equal(ui.status.textContent, 'notaccepted');
        assert.notEqual(ui.applicationStatus.textContent, 'unknown');
        await ui.click('start-certificate'); await settle();
        assert.equal(starts, 1, 'no automatic or blind resend before a fresh review');
        await ui.click('read-session'); await ui.click('read-application'); await settle();
        await ui.click('start-certificate'); await settle();
        assert.equal(starts, 2);
        assert.equal(ui.sent.filter(i => i.action === 'start-certificate').at(-1).expectedRevision, 5);
        assert.equal(ui.status.textContent, 'success');
    } finally { ui.mounted.destroy(); }
});

test('unknown or mismatched rejections keep the existing write lock', async () => {
    for (const failure of [Object.assign(Error('MOODLE_WORKFLOW_UNAVAILABLE'), {code: 'MOODLE_WORKFLOW_UNAVAILABLE', outcome: 'UNKNOWN'}),
        Object.assign(Error('MOODLE_CERTIFICATE_REVIEW_CHANGED'), {code: 'MOODLE_CERTIFICATE_REVIEW_CHANGED', outcome: 'HTTP_ERROR'}),
        notAccepted('MOODLE_CONSENT_REVIEW_CHANGED')]) {
        let starts = 0;
        const ui = fixture(input => {
            if (input.action === 'read-session') { return certificateSession(); }
            if (input.action === 'read-application') { return {...certificateView(), criteria: [], target: {expectedRevision: 5}}; }
            if (input.action === 'start-certificate') { starts++; throw failure; }
            throw Error('unexpected');
        });
        try {
            await ui.click('read-session'); await ui.click('read-application'); await settle();
            await ui.click('start-certificate'); await settle();
            assert.equal(ui.status.textContent, 'unknown');
            await ui.click('read-session'); await ui.click('read-application'); await settle();
            await ui.click('start-certificate'); await settle();
            assert.equal(starts, 1, failure.code + ' must stay locked');
        } finally { ui.mounted.destroy(); }
    }
});

test('a consent rejected because the decision changed shows what changed and waits for a new explicit consent', async () => {
    let ledger = 70, operatorAgreed = false, consents = 0;
    const view = () => ({version: 'clear-bootcamp-normal-view.1', displayOnly: true, applicationId: 'app-one', role: 'PARTICIPANT',
        target: {expectedRevision: 8, expectedLedgerSequence: ledger, targetDecisionId: 'decision-one', targetDecisionRevision: 5,
            targetDecisionHash: 'hash-one'},
        agreedPayment: {amountAtoms: '100000000', symbol: 'TEST', decimals: 6},
        decision: {id: 'decision-one', hash: 'hash-one', revision: 5, current: true, evidenceCurrent: true, conditionsStatus: 'MET'},
        consent: {records: operatorAgreed ? [{actorRole: 'COURSE_OPERATOR', value: 'AGREE'}] : []},
        criteria: ['activity-complete', 'assignment-submitted', 'reflection-topics', 'python-basic-certificate'].map(criterionId =>
            ({criterionId, state: 'MET', current: true, evidenceId: 'evidence-' + criterionId, evidenceRevision: 1}))});
    const ui = fixture(input => {
        if (input.action === 'read-session') { return session('app-one'); }
        if (input.action === 'read-application') { return view(); }
        if (input.action === 'consent') {
            consents++;
            if (consents === 1) { throw notAccepted('MOODLE_CONSENT_REVIEW_CHANGED'); }
            return {record: {applicationId: 'app-one', operationId: 'op-consent'}, current: true};
        }
        throw Error('unexpected');
    });
    ui.details.dataset.workflowDetails = 'changes ' + ui.details.dataset.workflowDetails;
    try {
        await ui.click('read-session'); await ui.click('read-application'); await settle();
        ledger = 71; operatorAgreed = true; // the operator consented in between
        await ui.click('consent'); await settle();
        assert.equal(ui.status.textContent, 'notaccepted');
        assert.notEqual(ui.applicationStatus.textContent, 'unknown');
        await ui.click('consent'); await settle();
        assert.equal(consents, 1, 'no consent without a fresh review');
        await ui.click('read-session'); await ui.click('read-application'); await settle();
        assert.match(ui.details.textContent, /^changes\nledgersequence: 70 → 71\noperatorconsent: UNKNOWN → AGREE/m);
        assert.equal(consents, 1, 'reading never consents');
        await ui.click('consent'); await settle();
        assert.equal(consents, 2);
        assert.equal(ui.sent.filter(i => i.action === 'consent').at(-1).reviewed.target.expectedLedgerSequence, 71);
    } finally { ui.mounted.destroy(); }
});

// Real DTO shapes (A 15ff2ee): normalView() in src/bootcamp/normal-client.mjs reports the accepted
// right as CLAIMED/UNCLAIMED with receivedAtoms null; the separate receipt from src/bootcamp/normal-receipt.mjs
// reports the claim transfer as INCLUDED with finalized=false. Neither contract has a FINALIZED value.
const hex = (c, n = 64) => '0x' + c.repeat(n);
const realView = (applicationId = 'app-one', claimState = 'CLAIMED', {terminationReason = null} = {}) => ({
    version: 'clear-bootcamp-normal-view.1',
    displayOnly: true, applicationId, policyHash: hex('1'), runtimeMappingHash: hex('2'), role: 'PARTICIPANT',
    target: {expectedRevision: 9, expectedLedgerSequence: 71, targetDecisionId: 'decision-one', targetDecisionRevision: 3,
        targetDecisionHash: hex('3')},
    decision: {id: 'decision-one', revision: 3, hash: hex('3'), current: true, evidenceCurrent: true, conditionsStatus: 'MET'},
    criteria: [['activity-complete', 'MOODLE_ACTIVITY_COMPLETION'], ['assignment-submitted', 'MOODLE_ASSIGNMENT_SUBMISSION'],
        ['reflection-topics', 'MOODLE_REFLECTION_AI'], ['python-basic-certificate', 'RECLAIM_HACKERRANK']]
        .map(([criterionId, kind]) => ({criterionId, state: 'MET', current: true, evidenceId: 'evidence-' + criterionId,
            evidenceRevision: 1, reasonCode: null, expiresAt: null,
            source: {kind, hostMode: 'REGISTERED_TEST_SOURCE', actualSourceVerification: null},
            originalEvidence: {authorized: true, httpAvailable: false}})),
    agreedPayment: {amountAtoms: '100000000', symbol: 'TEST', decimals: 6},
    // procedure.mjs view(): status follows ACCEPTED first, but terminationReason is time-only (review cap).
    procedure: {id: 'procedure-one', status: claimState ? 'ACCEPTED_RIGHT_PRESERVED' : 'NOT_STARTED',
        firstStartedAt: 1793000000, reviewCapAt: 1793000600, publishedDecisionId: 'decision-one', publishedAt: 1793000100, confirmAt: 1793000220, deadlineRouteAvailable: true,
        revalidationCount: 0, revalidationLimit: 1, terminationReason, invalidationReason: null, reservationReleased: false,
        epochInvalidated: false},
    consent: {bothCurrent: true, requiredRoles: ['PARTICIPANT', 'COURSE_OPERATOR'], onchainWalletSignaturesVerified: false,
        records: [{actorRole: 'PARTICIPANT', value: 'AGREE'}, {actorRole: 'COURSE_OPERATOR', value: 'AGREE'}]},
    objection: {blocked: false},
    // Not accepted yet: acceptedRight/claimState/transactionState are null (procedure-ports chain()).
    payment: {acceptedRight: claimState ? {state: 'FIXED_RIGHT_PRESERVED', claimState, recipientRef: 'recipient-one',
        amountAtoms: '100000000', claimExpiresAt: null, requiresCurrentSource: false, requiresCurrentSigner: false,
        requiresNewSignature: false} : null,
    transactionState: claimState ? 'INCLUDED' : null, transactionHash: null, blockRef: claimState ? 'block-635' : null,
    claimState, receivedAtoms: null,
    canonicalTransferVerified: null, receiptHttpAvailable: true},
    sourceMode: 'REGISTERED_TEST_SOURCE'});
const realReceipt = (applicationId = 'app-one', {finalized = false} = {}) => ({version: 'clear-bootcamp-normal-payment-receipt.1',
    applicationId, policyHash: hex('1'), runtimeMappingHash: hex('2'), role: 'PARTICIPANT',
    currentDecision: {decisionId: 'decision-one', decisionRevision: 3, decisionHash: hex('3')},
    acceptedTarget: {decisionId: 'decision-one', decisionRevision: 3, decisionHash: hex('3'), allocationId: 'allocation-one'},
    expectedPayment: {recipient: hex('c', 40), token: hex('d', 40), amountAtoms: '100000000', symbol: 'TEST', decimals: 6},
    accept: {state: 'RECORDED_INCLUDED', transactionHash: hex('e'), recordedCheckpoint: null, canonicalNow: null},
    claim: {state: 'INCLUDED', transactionHash: hex('f'), checkpoint: {number: '635', hash: hex('9'), time: '1793000000'},
        canonical: true, finalized, transferAmountAtoms: '100000000'},
    balance: {receivedAtoms: '100000000', exactExpectedAmountVerified: true, measurement: 'CANONICAL_TRANSFER_EVENT'},
    source: {mode: 'REGISTERED_TEST_SOURCE', actualSourceVerification: false}, productionEnabled: false});
const includedText = '지급 거래를 보냈습니다. 블록체인에서 완료를 확인하고 있습니다.';
const stageOf = root => root.children[0]?.attributes['data-stage'];
const stageLine = root => root.querySelector('.crc-stage-line')?.textContent ?? '';
const uxRoots = () => {
    const {Node} = installCardDom();
    return {stageRoot: new Node('div'), payoutRoot: new Node('div')};
};

test('#173 a real CLAIMED view plus the same application\'s INCLUDED receipt shows processing, never paid, with no extra calls', async () => {
    const roots = uxRoots();
    const {stageRoot, payoutRoot} = roots;
    const ui = fixture(({action}) => ({'read-session': session('app-one'), 'read-application': realView(),
        'payment-receipt': realReceipt()})[action], roots);
    await ui.click('read-session');
    await ui.click('read-application');
    // The real view alone carries no claim inclusion, so the strip still waits for payment processing.
    assert.equal(stageOf(stageRoot), 'CONFIRM');
    assert.match(stageLine(stageRoot), /양측 확인 완료 · 지급 처리를 기다립니다/);
    await ui.click('payment-receipt');
    assert.match(ui.details.textContent, /^received/m);
    assert.match(ui.details.textContent, /notfinalized/);
    assert.equal(stageOf(stageRoot), 'CONFIRM', 'INCLUDED is not the paid stage');
    assert.match(stageRoot.querySelector('[aria-current="step"]').textContent, /양측 확인/);
    assert.equal(stageLine(stageRoot), includedText);
    assert.doesNotMatch(stageRoot.textContent, /받았습니다/);
    assert.equal(payoutRoot.children.length, 0, 'no paid summary without FINALIZED');
    // A later view read keeps the binding to the receipt of the same application.
    await ui.click('read-application');
    assert.equal(stageLine(stageRoot), includedText);
    assert.equal(payoutRoot.children.length, 0);
    assert.deepEqual(ui.sent.map(input => input.action), ['read-session', 'read-application', 'payment-receipt', 'read-application'],
        'no extra server calls');
    ui.mounted.destroy();
});

test('#173 contradicting or out-of-contract receipts are not combined and real DTOs never reach the paid stage', async () => {
    const roots = uxRoots();
    const {stageRoot, payoutRoot} = roots;
    let view = realView('app-one', 'UNCLAIMED');
    let reply = realReceipt();
    const ui = fixture(({action}) => ({'read-session': session('app-one'), 'read-application': view,
        'payment-receipt': reply})[action], roots);
    await ui.click('read-session');
    await ui.click('read-application');
    await ui.click('payment-receipt');
    // An UNCLAIMED view contradicts an INCLUDED claim receipt: hold instead of combining.
    assert.doesNotMatch(stageLine(stageRoot), /지급 거래를 보냈습니다/);
    assert.notEqual(stageOf(stageRoot), 'PAID');
    // INCLUDED requires finalized=false in the receipt contract; any other value is not promoted.
    view = realView();
    reply = realReceipt('app-one', {finalized: true});
    await ui.click('read-application');
    await ui.click('payment-receipt');
    assert.doesNotMatch(stageLine(stageRoot), /지급 거래를 보냈습니다/);
    assert.notEqual(stageOf(stageRoot), 'PAID');
    assert.doesNotMatch(stageRoot.textContent, /받았습니다/);
    assert.equal(payoutRoot.children.length, 0);
    assert.deepEqual(ui.sent.map(input => input.action),
        ['read-session', 'read-application', 'payment-receipt', 'read-application', 'payment-receipt']);
    ui.mounted.destroy();
});

test('#173 a receipt for another application is discarded and never bound to the current view', async () => {
    const roots = uxRoots();
    const {stageRoot} = roots;
    const ui = fixture(({action}) => ({'read-session': session('app-one'), 'read-application': realView(),
        'payment-receipt': realReceipt('app-two')})[action], roots);
    await ui.click('read-session');
    await ui.click('read-application');
    await ui.click('payment-receipt');
    assert.equal(ui.status.textContent, 'failure');
    assert.doesNotMatch(stageRoot.textContent, /지급 거래를 보냈습니다/);
    await ui.click('read-session');
    await ui.click('read-application');
    assert.doesNotMatch(stageLine(stageRoot), /지급 거래를 보냈습니다/);
    assert.deepEqual(ui.sent.map(input => input.action),
        ['read-session', 'read-application', 'payment-receipt', 'read-session', 'read-application']);
    ui.mounted.destroy();
});

test('#173 receipt binding is dropped on disconnect, application replacement and late responses', async () => {
    const roots = uxRoots();
    const {stageRoot} = roots;
    let app = 'app-one';
    let hold = false;
    let release;
    const ui = fixture(({action}) => action === 'read-session' ? session(app)
        : action === 'read-application' ? realView(app)
        : hold ? new Promise(resolve => { release = resolve; }) : realReceipt(app), roots);
    await ui.click('read-session');
    await ui.click('read-application');
    await ui.click('payment-receipt');
    assert.equal(stageLine(stageRoot), includedText);
    // Disconnect clears the binding; reconnecting and re-reading the view does not restore it.
    await ui.walletDispatch({action: 'cancel'});
    assert.equal(stageOf(stageRoot), 'CONNECT');
    assert.doesNotMatch(stageRoot.textContent, /지급 거래를 보냈습니다/);
    ui.state(connected());
    await ui.click('read-session');
    await ui.click('read-application');
    assert.doesNotMatch(stageLine(stageRoot), /지급 거래를 보냈습니다/);
    // Replacing the application drops the previous application's receipt.
    await ui.click('payment-receipt');
    assert.equal(stageLine(stageRoot), includedText);
    app = 'app-two';
    await ui.click('read-session');
    await ui.click('read-application');
    assert.doesNotMatch(stageLine(stageRoot), /지급 거래를 보냈습니다/);
    // A valid receipt that arrives after a disconnect is discarded.
    hold = true;
    const late = ui.click('payment-receipt');
    await ui.walletDispatch({action: 'cancel'});
    ui.state(connected());
    await ui.click('read-session');
    await ui.click('read-application');
    release(realReceipt('app-two'));
    await late;
    assert.doesNotMatch(stageLine(stageRoot), /지급 거래를 보냈습니다/);
    assert.deepEqual(ui.sent.map(input => input.action), ['read-session', 'read-application', 'payment-receipt',
        'read-session', 'read-application', 'payment-receipt', 'read-session', 'read-application', 'payment-receipt',
        'read-session', 'read-application'], 'no extra server calls');
    ui.mounted.destroy();
});

test('#173 after the review cap an accepted right still shows the processing sentence once the INCLUDED receipt is bound', async () => {
    const roots = uxRoots();
    const {stageRoot, payoutRoot} = roots;
    const ui = fixture(({action}) => ({'read-session': session('app-one'),
        'read-application': realView('app-one', 'CLAIMED', {terminationReason: 'REVIEW_CAP_UNRESOLVED'}),
        'payment-receipt': realReceipt()})[action], roots);
    await ui.click('read-session');
    await ui.click('read-application');
    // Unchanged pinned behaviour without a receipt: the time-only termination reason is shown first.
    assert.match(stageLine(stageRoot), /확인 절차가 종료되었습니다/);
    await ui.click('payment-receipt');
    assert.equal(stageOf(stageRoot), 'CONFIRM');
    assert.equal(stageLine(stageRoot), includedText);
    assert.equal(payoutRoot.children.length, 0);
    assert.deepEqual(ui.sent.map(input => input.action), ['read-session', 'read-application', 'payment-receipt']);
    ui.mounted.destroy();
});

test('#173 real-mode reflection card keeps the ABSENT/UNCERTAIN wording and the stored-decision rule', async () => {
    const {Node} = installCardDom();
    const base = realView('app-one', null);
    const view = {...base, decision: {...base.decision, conditionsStatus: 'NOT_MET'},
        criteria: base.criteria.map(row => row.criterionId === 'reflection-topics' ? {...row, state: 'NOT_MET'} : row)};
    const render = async topics => {
        const evidence = {version: 'clear-bootcamp-decision-evidence.1', applicationId: 'app-one', role: 'PARTICIPANT',
            manifest: {version: 'clear-bootcamp-evidence-manifest.1', applicationId: 'app-one',
                decision: {decisionId: 'decision-one', decisionRevision: 3, decisionHash: hex('3')},
                criteria: [{criterionId: 'reflection-topics', state: 'NOT_MET', evidenceId: 'evidence-reflection-topics',
                    evidenceRevision: 1, metadataStatus: 'RECORDED', checks: {topics}}]},
            availability: [{criterionId: 'reflection-topics', evidenceId: 'evidence-reflection-topics', status: 'VALID_AS_RECORDED'}],
            limitations: {originalTextHttpAvailable: false}};
        const cards = nativePanels.createConditionCards({getState: () => ({view,
            session: {applicationId: 'app-one', boundApplicationId: 'app-one'}}),
        read: async () => ({view}), loadEvidence: async () => evidence, storage: nativePanels.memoryStore()});
        cards.render();
        await new Promise(resolve => setTimeout(resolve, 0));
        const root = new Node('div');
        root.append(cards.render());
        cards.close();
        return root.textContent;
    };
    const absent = await render([{topicId: 'work-performed', state: 'PRESENT'},
        {topicId: 'problem-solving-process', state: 'ABSENT'}, {topicId: 'learning-takeaway', state: 'UNCERTAIN'}]);
    assert.match(absent, /문제 해결 과정 내용이 부족해요\./);
    assert.match(absent, /부족한 내용/);
    assert.match(absent, /판단하기 어려운 내용/);
    assert.match(absent, /AI 가 이 항목이 글에 있는지 확신하지 못했어요\. 없다는 뜻은 아니에요\./);
    assert.match(absent, /문제 해결 과정 내용을 더해 .*에 다시 올려 주세요\. 돌아오면 저장된 판정을 다시 읽어요\./);
    assert.match(absent, /회고 재검증 경로는 아직 연결 전이에요\. 돌아오면 서버에 저장된 판정만 다시 읽어요\./);
    assert.doesNotMatch(absent, /다시 검토를 요청해요/);
    const uncertain = await render([{topicId: 'work-performed', state: 'PRESENT'},
        {topicId: 'problem-solving-process', state: 'PRESENT'}, {topicId: 'learning-takeaway', state: 'UNCERTAIN'}]);
    assert.match(uncertain, /배운 점 항목은 판단하기 어려워요\./);
    assert.match(uncertain, /배운 점 부분을 더 분명하게 적어 .*에 다시 올릴 수 있어요\. 재검증 경로가 연결되기 전이라, 돌아오면 저장된 판정을 다시 확인해요\./);
    assert.doesNotMatch(uncertain, /부족한 내용|다시 검토를 요청해요/);
});

// Student "지금 할 일" guide (C display only). The guide button runs the same actions as the
// existing controls, in the same order, and never offers consent before the registration is SIGNED.
const guideOf = root => {
    const box = root.children[0];
    const find = cls => [...(function* walk(node) { yield node; for (const c of node.children ?? []) { yield* walk(c); } })(box)]
        .find(node => node.className === cls);
    return {key: box?.attributes['data-guide-key'], title: find('clear-guide-title')?.textContent ?? '',
        body: find('clear-guide-body')?.textContent ?? '', go: find('clear-guide-go'), toggle: find('clear-guide-toggle'),
        facts: find('clear-guide-facts')?.textContent ?? '', raw: find('clear-guide-raw-text')?.textContent ?? ''};
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const press = async root => { const {go} = guideOf(root); assert.ok(go && !go.disabled, 'guide button enabled'); go.handlers.click(); for (let i = 0; i < 6; i++) { await tick(); } };

test('guide walks a student from load to paid with one button per step and no extra or early writes', async () => {
    const {Node} = installCardDom();
    const guideRoot = new Node('div');
    const roots = {...uxRoots(), guideRoot};
    let stage = 'start';
    const viewAt = () => {
        const view = realView('app-one', ['agreed-both', 'paid'].includes(stage) ? 'CLAIMED' : null);
        if (stage === 'partial') {
            view.criteria = view.criteria.map(row => row.criterionId === 'reflection-topics' ? {...row, state: 'MISSING'} : row);
            view.decision = {...view.decision, conditionsStatus: 'NOT_MET'};
        }
        const roles = {'agreed-participant': ['PARTICIPANT'], 'agreed-both': ['PARTICIPANT', 'COURSE_OPERATOR'],
            paid: ['PARTICIPANT', 'COURSE_OPERATOR']}[stage] ?? [];
        view.consent = {...view.consent, bothCurrent: roles.length === 2, records: roles.map(actorRole => ({actorRole, value: 'AGREE'}))};
        return view;
    };
    const procedure = {...receipt, version: 'clear-bootcamp-procedure-operation.1', usableForPayment: false};
    const packet = status => ({version: 'clear-bootcamp-recipient-registration.1', applicationId: 'app-one', role: 'PARTICIPANT',
        purpose: 'REGISTER_FIXED_RECIPIENT', calldataPublic: true, status, decisionId: 'decision-one',
        registrationTargetId: 'register-one', payload: {message: {recipient: '0x0EA0675b3Ae1e92d21Ca286e5cd050F64f0BbaB1'}}});
    const ui = fixture(({action}) => {
        switch (action) {
            case 'read-session': return session(['start', 'created'].includes(stage) ? null : 'app-one');
            case 'create-application': stage = 'created'; return receipt;
            case 'bind-source-session': stage = 'partial';
                return {applicationId: 'app-one', status: 'AUTHENTICATED_SOURCE_SESSION_BOUND', paymentAuthorization: false};
            case 'read-application': return viewAt();
            case 'read-registration': return packet(stage === 'signed' ? 'SIGNED' : 'AWAITING_SIGNATURE');
            case 'approve-registration': stage = 'signed'; return procedure;
            case 'consent': stage = 'agreed-participant'; return procedure;
            case 'payment-receipt': stage = 'paid'; return realReceipt();
            default: throw Error('unexpected ' + action);
        }
    }, roots);
    const steps = [];
    const at = () => { const g = guideOf(guideRoot); steps.push(g.key); return g; };
    assert.equal(at().key, 'load');
    assert.equal(guideOf(guideRoot).toggle.textContent, '모든 단계와 기술 정보 보기');
    await press(guideRoot);
    assert.equal(at().key, 'apply');
    await press(guideRoot);
    const bind = at();
    assert.equal(bind.key, 'bind', 'a created but unbound application asks to start the condition check (r45)');
    assert.equal(bind.go.attributes['data-guide-action'], 'bind-source-session');
    await press(guideRoot);
    assert.equal(at().key, 'refresh');
    await press(guideRoot);
    const partial = at();
    assert.equal(partial.key, 'conditions');
    assert.match(partial.title, /\(3\/4\)/);
    assert.match(partial.body, /남은 조건: 회고/);
    stage = 'met';
    await press(guideRoot);
    assert.equal(at().key, 'register-read', 'all MET: check the receiving wallet first, never consent');
    await press(guideRoot);
    const signStep = at();
    assert.equal(signStep.key, 'register-sign');
    assert.match(signStep.facts, /받는 지갑: 0x0EA0…baB1/);
    assert.match(signStep.facts, /받는 금액: 100 TEST/);
    assert.match(signStep.raw, /0x0EA0675b3Ae1e92d21Ca286e5cd050F64f0BbaB1/, 'exact signing payload stays viewable');
    await press(guideRoot);
    assert.equal(at().key, 'refresh', 'a write clears the reviewed view');
    await press(guideRoot);
    assert.equal(at().key, 'register-read');
    await press(guideRoot);
    assert.equal(at().key, 'consent');
    await press(guideRoot);
    assert.equal(at().key, 'refresh');
    await press(guideRoot);
    assert.equal(at().key, 'wait-operator');
    stage = 'agreed-both';
    await press(guideRoot);
    assert.equal(at().key, 'receipt');
    await press(guideRoot);
    const paid = at();
    assert.equal(paid.key, 'paid');
    assert.equal(paid.title, '100 TEST를 보냈어요');
    assert.match(paid.body, /최종 확정까지는/);
    assert.equal(stageLine(roots.stageRoot), includedText, 'strip binds the same receipt');
    assert.equal(roots.payoutRoot.children.length, 0, 'still no paid summary without FINALIZED');
    const sent = ui.sent.map(input => input.action + (input.action === 'consent' ? ':' + input.value : ''));
    assert.deepEqual(sent, ['read-session', 'create-application', 'bind-source-session', 'read-session', 'read-application',
        'read-session', 'read-application', 'read-registration', 'approve-registration', 'read-session', 'read-application',
        'read-registration', 'consent:AGREE', 'read-session', 'read-application', 'read-session', 'read-application',
        'payment-receipt', 'read-application']);
    assert.ok(sent.indexOf('consent:AGREE') > sent.indexOf('approve-registration'), 'consent only after the signed registration');
    ui.mounted.destroy();
    delete globalThis.document;
});

test('guide shows a definite 409 rejection as a manual re-read, and the toggle restores every technical section', async () => {
    const {Node} = installCardDom();
    const guideRoot = new Node('div');
    let reject = true;
    const view = realView('app-one', null);
    view.consent = {...view.consent, bothCurrent: false, records: []};
    const ui = fixture(({action}) => {
        if (action === 'read-session') { return session('app-one'); }
        if (action === 'read-application') { return view; }
        if (action === 'read-registration') {
            return {version: 'clear-bootcamp-recipient-registration.1', applicationId: 'app-one', role: 'PARTICIPANT',
                purpose: 'REGISTER_FIXED_RECIPIENT', calldataPublic: true, status: 'SIGNED', payload: null};
        }
        if (action === 'consent' && reject) { reject = false; throw notAccepted('MOODLE_CONSENT_REVIEW_CHANGED'); }
        throw Error('unexpected ' + action);
    }, {guideRoot});
    await press(guideRoot);
    await press(guideRoot);
    await press(guideRoot);
    assert.equal(guideOf(guideRoot).key, 'consent');
    const before = ui.sent.length;
    await press(guideRoot);
    const rejected = guideOf(guideRoot);
    assert.equal(rejected.key, 'notaccepted');
    assert.match(rejected.body, /기록되지 않았어요/);
    assert.equal(rejected.go.attributes['data-guide-action'], 'read-session', 'only a manual re-read is offered');
    assert.deepEqual(ui.sent.slice(before).map(input => input.action), ['consent'], 'no automatic resend');
    assert.equal(ui.state && ui.mounted ? 'mounted' : 'gone', 'mounted', 'login kept');
    guideOf(guideRoot).toggle.handlers.click();
    assert.equal(guideOf(guideRoot).toggle.textContent, '간단히 보기');
    ui.mounted.destroy();
    delete globalThis.document;
});
