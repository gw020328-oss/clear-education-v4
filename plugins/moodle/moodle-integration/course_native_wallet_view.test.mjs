import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

let create;
runInNewContext(readFileSync(new URL('../local_clearbridge/amd/build/course_native_wallet_view.min.js', import.meta.url), 'utf8'),
    {define(_deps, factory) { ({create} = factory()); }});

function fixture(role, dispatch) {
    const actions = role === 'PARTICIPANT'
        ? ['connect-google', 'select-wallet', 'check-network', 'sign-in', 'cancel', 'sign-out']
        : ['connect-metamask', 'select-wallet', 'check-network', 'sign-in', 'cancel', 'sign-out'];
    const buttons = Object.fromEntries(actions.map(action => [action, {dataset: {walletAction: action}, hidden: true}]));
    const summary = {textContent: 'unavailable'};
    const stages = ['wallet', 'network', 'login'].map(stage => ({dataset: {walletStage: stage}, textContent: 'unknown'}));
    const messages = ['choose', 'metamask', 'idle', 'busy', 'error', 'walletselected', 'networkready', 'loginready', 'authenticated']
        .map(message => ({dataset: {walletMessage: message}, textContent: message}));
    const kinds = role === 'PARTICIPANT' ? ['wallet'] : ['provider', 'wallet'];
    const groups = kinds.map(kind => ({dataset: {walletOptions: kind}, hidden: true}));
    const selects = Object.fromEntries(kinds.map(kind => [kind, {
        dataset: {walletSelect: kind}, value: '', ownerDocument: {createElement() { return {}; }},
        replaceChildren(...options) { this.options = options; },
    }]));
    const listeners = new Map();
    const elements = {
        '[data-wallet-message]': messages,
        '[data-wallet-stage]': stages,
        '[data-wallet-action]': Object.values(buttons),
        '[data-wallet-options]': groups,
        '[data-wallet-select]': Object.values(selects),
    };
    const element = {
        querySelectorAll(selector) { return elements[selector]; },
        querySelector() { return summary; },
        contains(node) { return Object.values(buttons).includes(node); },
        addEventListener(name, listener) { listeners.set(name, listener); },
        removeEventListener(name) { listeners.delete(name); },
    };
    const renderer = create({element, role, dispatch});
    return {...renderer, buttons, selects, summary,
        click(action) { return listeners.get('click')?.({target: {closest: () => buttons[action]}}); },
        choose(kind, id) { selects[kind].value = id; listeners.get('change')(); },
    };
}

const base = role => ({
    role, busy: false, providers: [], choices: [], selectedChoiceId: null,
    networkReady: false, authenticated: false, error: null,
});
const address = '0x' + 'a'.repeat(40);

test('student wallet selection and login require explicit, current, role-appropriate clicks', async () => {
    const commands = [];
    const ui = fixture('PARTICIPANT', async command => commands.push(JSON.stringify(command)));
    const view = base('PARTICIPANT');
    ui.render(view, ['connect-google', 'connect-metamask', 'sign-in']);
    assert.equal(ui.buttons['sign-in'].disabled, true);
    assert.deepEqual(commands, []);
    await ui.click('connect-google');
    assert.deepEqual(commands, ['{"action":"connect-google"}']);

    view.choices = [{choiceId: 'first', address}, {choiceId: 'second', address}];
    ui.render(view, ['select-wallet', 'check-network', 'sign-in']);
    assert.equal(ui.selects.wallet.value, '');
    assert.equal(ui.buttons['select-wallet'].disabled, true);
    assert.equal(ui.buttons['check-network'].disabled, true);
    assert.ok(ui.selects.wallet.options.every(option => !option.textContent.includes(address)));
    ui.choose('wallet', 'first');
    await ui.click('select-wallet');
    assert.equal(commands.at(-1), '{"action":"select-wallet","choiceId":"first"}');
    view.selectedChoiceId = 'first';
    ui.render(view, ['check-network', 'sign-in']);
    await ui.click('check-network');
    await ui.click('sign-in');
    assert.equal(commands.at(-1), '{"action":"check-network"}');
    ui.render({...view, networkReady: true}, ['sign-in']);
    await ui.click('sign-in');
    assert.equal(commands.at(-1), '{"action":"sign-in"}');
    ui.render({...view, role: 'COURSE_OPERATOR'}, ['connect-google']);
    assert.equal(ui.buttons['connect-google'].hidden, true);
});

test('operator provider stays unselected, revoked options and repeated clicks cannot dispatch', async () => {
    const commands = [];
    let finish;
    const ui = fixture('COURSE_OPERATOR', command => {
        commands.push(JSON.stringify(command));
        return new Promise(resolve => { finish = resolve; });
    });
    const view = {...base('COURSE_OPERATOR'), providers: [{providerId: 'p1'}]};
    ui.render(view, ['connect-google', 'connect-metamask']);
    assert.equal(ui.selects.provider.value, '');
    await ui.click('connect-metamask');
    ui.choose('provider', 'missing');
    await ui.click('connect-metamask');
    assert.deepEqual(commands, []);
    ui.choose('provider', 'p1');
    const running = ui.click('connect-metamask');
    await ui.click('connect-metamask');
    assert.deepEqual(commands, ['{"action":"connect-metamask","providerId":"p1"}']);
    finish();
    await running;
    ui.render({...view, providers: [{providerId: 'p2'}], error: {code: 'fixture'}}, ['connect-metamask']);
    assert.equal(ui.summary.textContent, 'error');
    assert.equal(ui.selects.provider.value, '');
    ui.destroy();
    assert.equal(ui.buttons['connect-metamask'].hidden, true);
});
