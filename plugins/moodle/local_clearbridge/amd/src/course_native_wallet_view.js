/** Render already validated adapter state. The eventual mount owns the wire validator and the SDK. */
define([], function() {
    'use strict';

    const commandActions = new Set([
        'connect-google', 'connect-metamask', 'select-wallet', 'check-network', 'sign-in', 'finish-connection', 'cancel', 'sign-out',
    ]);
    const shortAddress = address => address.slice(0, 6) + '…' + address.slice(-4);

    const create = ({element, role, dispatch}) => {
        if (role !== 'PARTICIPANT' && role !== 'COURSE_OPERATOR') {
            throw new Error('Unknown course wallet role');
        }
        const messages = Object.fromEntries(Array.from(element.querySelectorAll('[data-wallet-message]'),
            node => [node.dataset.walletMessage, node.textContent.trim()]));
        const summary = element.querySelector('[data-wallet-summary]');
        const stages = Object.fromEntries(Array.from(element.querySelectorAll('[data-wallet-stage]'),
            node => [node.dataset.walletStage, node]));
        const defaultText = Object.fromEntries(Object.entries(stages).map(([stage, node]) => [stage, node.textContent.trim()]));
        const defaultSummary = summary.textContent.trim();
        const buttons = Array.from(element.querySelectorAll('[data-wallet-action]'));
        const groups = Object.fromEntries(Array.from(element.querySelectorAll('[data-wallet-options]'),
            node => [node.dataset.walletOptions, node]));
        const selects = Object.fromEntries(Array.from(element.querySelectorAll('[data-wallet-select]'),
            node => [node.dataset.walletSelect, node]));
        const pending = new Set();
        let state = null;
        let allowed = new Set();
        let failed = false;
        let destroyed = false;

        const hasWallet = () => state?.choices.some(choice => choice.choiceId === state.selectedChoiceId);
        const mayDispatch = action => {
            if (!state || !allowed.has(action) || !commandActions.has(action)) {
                return false;
            }
            if (action === 'cancel') {
                return !pending.has(action);
            }
            if (state.busy || pending.size !== 0) {
                return false;
            }
            if (action === 'connect-google') {
                return role === 'PARTICIPANT';
            }
            if (action === 'connect-metamask') {
                return role === 'COURSE_OPERATOR' && state.providers.length > 0;
            }
            if (action === 'select-wallet') {
                return state.choices.length > 0;
            }
            if (action === 'check-network') {
                return hasWallet();
            }
            if (action === 'sign-in') {
                return hasWallet() && state.networkReady === true && state.authenticated !== true;
            }
            if (action === 'finish-connection') {
                return state.phase === 'CONNECTION_PENDING' && state.authenticated === true;
            }
            return action === 'sign-out';
        };

        const renderControls = () => {
            if (groups.provider) {
                groups.provider.hidden = !allowed.has('connect-metamask') || role !== 'COURSE_OPERATOR'
                    || !state?.providers.length;
            }
            groups.wallet.hidden = !allowed.has('select-wallet') || !state?.choices.length;
            for (const button of buttons) {
                const action = button.dataset.walletAction;
                button.hidden = !allowed.has(action) || (action === 'connect-google' && role !== 'PARTICIPANT')
                    || (action === 'connect-metamask' && role !== 'COURSE_OPERATOR');
                const missingChoice = (action === 'connect-metamask' && !selects.provider?.value)
                    || (action === 'select-wallet' && !selects.wallet.value);
                button.disabled = !mayDispatch(action) || missingChoice;
            }
        };

        const repaint = () => {
            const waiting = state?.busy === true || pending.size > 0;
            summary.textContent = failed || state?.error ? messages.error
                : waiting ? messages.busy : state && allowed.size ? messages.idle : defaultSummary;
            stages.wallet.textContent = hasWallet() ? messages.walletselected : defaultText.wallet;
            stages.network.textContent = state?.networkReady === true ? messages.networkready : defaultText.network;
            stages.login.textContent = state?.phase === 'CONNECTED' && state.authenticated === true ? messages.connected
                : state?.phase === 'CONNECTION_PENDING' && state.authenticated === true ? messages.connectionpending
                : state?.authenticated === true ? messages.authenticated
                : mayDispatch('sign-in') ? messages.loginready : defaultText.login;
            renderControls();
        };

        const fillSelect = (select, values) => {
            if (!select) {
                return;
            }
            const previous = select.value;
            const option = (value, label) => {
                const node = select.ownerDocument.createElement('option');
                node.value = value;
                node.textContent = label;
                return node;
            };
            select.replaceChildren(option('', messages.choose), ...values.map(({value, label}) => option(value, label)));
            select.value = values.some(item => item.value === previous) ? previous : '';
        };

        const render = (view, validatedActions) => {
            if (destroyed) {
                return;
            }
            // The final composition maps the exact A contract to this presentation input.
            state = view?.role === role ? {
                busy: view.busy,
                phase: view.phase,
                providers: view.providers.map(({providerId}) => ({providerId})),
                choices: view.choices.map(({choiceId, address}) => ({choiceId, address})),
                selectedChoiceId: view.selectedChoiceId,
                networkReady: view.networkReady,
                authenticated: view.authenticated,
                error: Boolean(view.error),
            } : null;
            allowed = new Set(state ? validatedActions : []);
            failed = false;
            fillSelect(selects.provider, (state?.providers ?? []).map(({providerId}, i) => ({
                value: providerId, label: messages.metamask + ' ' + (i + 1),
            })));
            fillSelect(selects.wallet, (state?.choices ?? []).map(({choiceId, address}) => ({
                value: choiceId, label: shortAddress(address),
            })));
            repaint();
        };

        const click = async event => {
            const button = event.target?.closest?.('[data-wallet-action]');
            if (!button || !element.contains(button) || button.hidden || button.disabled) {
                return;
            }
            const action = button.dataset.walletAction;
            if (!mayDispatch(action)) {
                return;
            }
            const command = {action};
            if (action === 'connect-metamask') {
                const providerId = selects.provider.value;
                if (!state.providers.some(provider => provider.providerId === providerId)) {
                    return;
                }
                command.providerId = providerId;
            } else if (action === 'select-wallet') {
                const choiceId = selects.wallet.value;
                if (!state.choices.some(choice => choice.choiceId === choiceId)) {
                    return;
                }
                command.choiceId = choiceId;
            }
            pending.add(action);
            failed = false;
            repaint();
            try {
                await dispatch(command);
            } catch {
                failed = true;
            } finally {
                pending.delete(action);
                if (!destroyed) {
                    repaint();
                }
            }
        };

        element.addEventListener('click', click);
        element.addEventListener('change', renderControls);
        return {
            render,
            destroy() {
                destroyed = true;
                state = null;
                allowed.clear();
                pending.clear();
                element.removeEventListener('click', click);
                element.removeEventListener('change', renderControls);
                fillSelect(selects.provider, []);
                fillSelect(selects.wallet, []);
                repaint();
            },
        };
    };

    return {create};
});
