import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

let contract;
runInNewContext(readFileSync(new URL('../local_clearbridge/amd/build/course_native_wallet_contract.min.js', import.meta.url), 'utf8'),
    {structuredClone, define(_deps, factory) { contract = factory(); }});
const base = () => ({version: 'clear-moodle-wallet-view.1', role: 'participant', phase: 'IDLE', busy: false,
    providers: [], choices: [], selectedChoiceId: null, networkReady: false, authenticated: false,
    allowedActions: ['connect-google'], error: null});
const mountConfig = () => ({appId:'syntheticfixture123',origin:'https://127.0.0.1:19474',
    redirectUri:'https://127.0.0.1:19474/local/clearbridge/wallet-return',phase:'ACTIVE_LOCAL_TEST',
    chainId:31337,rpcUrl:'http://127.0.0.1:19475',instanceId:'0x'+'a'.repeat(64),surface:'MOODLE_NATIVE',
    role:'participant',courseId:2,sesskey:'synthetic01'});

test('exact A view contract rejects extra, missing, mixed-role, stale selection and invalid fields', () => {
    assert.deepEqual(contract.validateCourseWalletView(base()), base());
    const invalid = [
        {...base(), extra: true}, {...base(), version: 'other'}, {...base(), phase: 'SUCCESS'},
        {...base(), busy: 1}, {...base(), providers: [{providerId: 'provider-1'}]},
        {...base(), selectedChoiceId: 'missing'}, {...base(), networkReady: true}, {...base(), authenticated: true},
        {...base(), allowedActions: ['connect-google', 'connect-google']}, {...base(), allowedActions: ['connect-metamask']},
        {...base(), error: {code: 'UNAVAILABLE', outcome: 'raw-provider-error'}},
        {...base(), error: {code: 'UNAVAILABLE', outcome: 'UNKNOWN', message: 'raw-provider-error'}},
        {...base(), choices: [{choiceId: 'wallet-one', address: 'not-an-address'}]},
    ];
    const missing = base(); delete missing.error; invalid.push(missing);
    for (const value of invalid) assert.throws(() => contract.validateCourseWalletView(value));
    const selected = {...base(), choices: [{choiceId: 'wallet-one', address: '0x' + 'a'.repeat(40)}],
        selectedChoiceId: 'wallet-one', networkReady: true, authenticated: true, phase: 'CONNECTION_PENDING',
        allowedActions: ['finish-connection'], error: null};
    assert.deepEqual(contract.validateCourseWalletView(selected), selected);
});

test('eight exact commands exclude extra data and provider/choice confusion', () => {
    assert.equal(contract.validateCourseWalletMountConfig(mountConfig()).courseId, 2);
    assert.throws(() => contract.validateCourseWalletMountConfig({...mountConfig(), extra:true}));
    assert.throws(() => contract.validateCourseWalletMountConfig({...mountConfig(), sesskey:null}));
    for (const action of ['connect-google', 'check-network', 'sign-in', 'finish-connection', 'cancel', 'sign-out']) {
        assert.equal(contract.validateCourseWalletCommand({action}).action, action);
        assert.throws(() => contract.validateCourseWalletCommand({action, role: 'participant'}));
    }
    assert.equal(contract.validateCourseWalletCommand({action: 'connect-metamask', providerId: 'provider-one'}).providerId, 'provider-one');
    assert.equal(contract.validateCourseWalletCommand({action: 'select-wallet', choiceId: 'wallet-one'}).choiceId, 'wallet-one');
    assert.throws(() => contract.validateCourseWalletCommand({action: 'select-wallet', providerId: 'provider-one'}));
});

function composition(mount) {
    const rendered = [], sent = [];
    let dispatch, disposed = 0, compose;
    runInNewContext(readFileSync(new URL('../local_clearbridge/amd/build/course_native_wallet.min.js', import.meta.url), 'utf8'), {
        define(_deps, factory) { ({compose} = factory(contract, {create(args) {
            dispatch = args.dispatch;
            return {render(...args) { rendered.push(args); }, destroy() { disposed++; }};
        }})); },
    });
    let onState;
    const mounted = compose({element: {dataset: {clearWalletRole: 'participant'}}, config: mountConfig(),
        mountCourseWallet(args) { onState = args.onState; mount?.(args); return {
            dispatch(command) { sent.push(JSON.stringify(command)); }, destroy() { sent.push('destroy'); },
        }; }});
    return {mounted, rendered, sent, onState, dispatch, disposed: () => disposed};
}

test('invalid state clears controls and permanently closes this mount, including synchronous mount callback', async () => {
    const c = composition();
    c.onState(base());
    assert.equal(c.rendered[0][0].role, 'PARTICIPANT');
    assert.equal(c.sent.length, 0);
    await c.dispatch({action: 'connect-google'});
    c.onState({...base(), extra: 'untrusted'});
    c.onState(base());
    assert.equal(c.disposed(), 1);
    assert.equal(c.rendered.length, 1);
    await assert.rejects(c.dispatch({action: 'connect-google'}));
    assert.deepEqual(c.sent, ['{"action":"connect-google"}', 'destroy']);
    const sync = composition(({onState}) => onState({...base(), role: 'operator'}));
    await Promise.resolve(); await Promise.resolve();
    assert.equal(sync.disposed(), 1);
    assert.deepEqual(sync.sent, ['destroy']);
});
