// Synthetic display-only adapter. No provider, auth request, signature, consent or server action.
export function mountCourseWallet({element, config, onState}) {
    const keys = ['appId','origin','redirectUri','phase','chainId','rpcUrl','instanceId','surface','role','courseId','sesskey'];
    if (Object.keys(config).length !== keys.length || !keys.every(k => Object.hasOwn(config, k))
        || config.origin !== location.origin || config.surface !== 'MOODLE_NATIVE'
        || config.role !== element.dataset.clearWalletRole || config.courseId !== 2
        || !/^[A-Za-z0-9]{10,64}$/.test(config.sesskey)) throw Error('Synthetic mount config mismatch');
    const view = {version: 'clear-moodle-wallet-view.1', role: config.role, phase: 'IDLE', busy: false,
        providers: config.role === 'operator' ? [{providerId:'provider-synthetic'}] : [], choices: [],
        selectedChoiceId: null, networkReady: false, authenticated: false,
        allowedActions: [config.role === 'operator' ? 'connect-metamask' : 'connect-google'], error: null};
    const evidence = {actions: [], mounted: true, destroyed: false};
    window.__nativeFixture = evidence; // No config, sesskey, wallet handle or proof is exposed.
    let closed = false;
    const emit = () => onState(structuredClone(view));
    emit();
    return {
        async dispatch(command) {
            if (closed || !view.allowedActions.includes(command.action)) throw Error('Synthetic action unavailable');
            evidence.actions.push(command.action);
            if (['connect-google','connect-metamask'].includes(command.action)) {
                view.choices = [{choiceId:'wallet-synthetic', address:'0x'+'a'.repeat(40)}];
                view.phase = 'CHOOSING'; view.allowedActions = ['select-wallet'];
            } else if (command.action === 'select-wallet') {
                view.selectedChoiceId = command.choiceId; view.phase = 'SELECTED'; view.allowedActions = ['check-network'];
            } else if (command.action === 'check-network') {
                view.networkReady = true; view.phase = 'NETWORK_READY'; view.allowedActions = ['sign-in'];
            } else if (command.action === 'sign-in') {
                view.authenticated = true; view.phase = 'CONNECTION_PENDING'; view.allowedActions = ['finish-connection'];
            } else if (command.action === 'finish-connection') {
                view.phase = 'CONNECTED'; view.allowedActions = ['sign-out'];
            } else {
                view.phase = 'CLOSED'; view.allowedActions = []; view.authenticated = false;
            }
            emit();
        },
        destroy() { closed = true; evidence.destroyed = true; },
    };
}
