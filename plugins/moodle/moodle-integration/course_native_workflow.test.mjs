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
const actions = ['read-session', 'create-application', 'read-application', 'bind-source-session',
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
const fixture = (reply, {role = 'participant', port = true, cardRoot} = {}) => {
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
            '[data-native-condition-cards]': cardRoot, '[data-native-activity-status]': activityStatus, '[data-native-panel-status]': panelStatus,
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
        clickLink: link => listeners.click?.({target: {closest: selector => selector === 'a.crc-go' ? link : null}})};
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
