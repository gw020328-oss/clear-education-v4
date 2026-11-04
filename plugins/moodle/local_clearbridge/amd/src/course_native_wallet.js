/** Fixed same-origin A module; C retains every workflow control and validates each view. */
define(['local_clearbridge/course_native_wallet_contract', 'local_clearbridge/course_native_wallet_view'],
function(contract, view) {
    'use strict';
    const compose = ({element, config, mountCourseWallet}) => {
        config = contract.validateCourseWalletMountConfig(config);
        const role = config.role;
        if (!['participant', 'operator'].includes(role) || element.dataset.clearWalletRole !== role) {
            throw new Error('CLEAR_NATIVE_ROLE');
        }
        let handle = null;
        let closed = false;
        const renderer = view.create({element, role: role === 'participant' ? 'PARTICIPANT' : 'COURSE_OPERATOR',
            dispatch: async input => {
                if (closed || !handle) {
                    throw new Error('CLEAR_NATIVE_UNAVAILABLE');
                }
                try {
                    await handle.dispatch(contract.validateCourseWalletCommand(input));
                } catch {
                    renderer.render(null, []);
                    throw new Error('CLEAR_NATIVE_UNAVAILABLE');
                }
            }});
        const destroy = () => {
            if (closed) {
                return;
            }
            closed = true;
            renderer.destroy();
            void Promise.resolve().then(() => handle?.destroy()).catch(() => {});
        };
        const onState = input => {
            if (closed) {
                return;
            }
            try {
                const state = contract.validateCourseWalletView(input);
                if (state.role !== role) {
                    throw new Error('CLEAR_NATIVE_ROLE');
                }
                renderer.render({...state, role: role === 'participant' ? 'PARTICIPANT' : 'COURSE_OPERATOR'}, state.allowedActions);
            } catch {
                destroy();
            }
        };
        try {
            handle = mountCourseWallet({element, config, onState});
            if (!handle || typeof handle.dispatch !== 'function' || typeof handle.destroy !== 'function') {
                throw new Error('CLEAR_NATIVE_HANDLE');
            }
        } catch {
            destroy();
        }
        return {destroy};
    };
    const init = async config => {
        const element = document.querySelector('[data-clear-wallet-ui]');
        if (!element || window !== window.top || location.protocol !== 'https:' || config.origin !== location.origin) {
            return;
        }
        try {
            const module = await import('/clear-assets/moodle-native.js');
            const mounted = compose({element, config, mountCourseWallet: module.mountCourseWallet});
            window.addEventListener('pagehide', mounted.destroy, {once: true});
        } catch {
            // The unavailable server-rendered state remains. No speculative success or automatic retry.
        }
    };
    return {init, compose};
});
