/** Fixed same-origin A module; C retains every workflow control and validates each view. */
define(['local_clearbridge/course_native_wallet_contract', 'local_clearbridge/course_native_wallet_view',
    'local_clearbridge/course_native_workflow', 'local_clearbridge/course_native_panels'],
function(contract, view, workflowView, panels) {
    'use strict';
    const compose = ({element, config, mountCourseWallet, validateNativeWorkflowCommand}) => {
        config = contract.validateCourseWalletMountConfig(config);
        const role = config.role;
        if (!['participant', 'operator'].includes(role) || element.dataset.clearWalletRole !== role) {
            throw new Error('CLEAR_NATIVE_ROLE');
        }
        let handle = null;
        let closed = false;
        let currentState;
        // Operator condition draft panel (display only). The CLEAR operator connection is the
        // validated wallet view, not the Moodle login. sessionRef changes on sign-out / wallet change.
        const conditionsRoot = role === 'operator'
            ? element.ownerDocument?.querySelector?.('[data-clear-operator-conditions]') ?? null : null;
        const conditionListeners = new Set();
        let conditions = null;
        let sessionEpoch = 0;
        let sessionKey = null;
        const conditionConnection = () => {
            const s = currentState;
            if (!s || s.phase !== 'CONNECTED' || s.authenticated !== true || s.role !== 'operator') {
                return null;
            }
            return {status: 'CONNECTED', authenticated: true, role: 'operator', courseId: config.courseId,
                sessionRef: 'operator-' + sessionEpoch};
        };
        const notifyConditions = () => {
            const s = currentState;
            const key = s && s.phase === 'CONNECTED' && s.authenticated === true ? String(s.selectedChoiceId) : null;
            if (key !== sessionKey) {
                sessionKey = key;
                sessionEpoch += 1;
            }
            conditionListeners.forEach(listener => listener());
        };
        const workflowRoot = element.closest?.('[data-clear-workflow]');
        const workflow = workflowRoot && workflowView.create({
            root: workflowRoot,
            role,
            panels,
            courseId: config.courseId,
            origin: config.origin,
            newKey: () => 'moodle-' + crypto.randomUUID(),
            invoke: input => {
                if (closed || currentState?.phase !== 'CONNECTED' || currentState.authenticated !== true
                        || currentState.busy || typeof handle?.runWorkflow !== 'function'
                        || typeof validateNativeWorkflowCommand !== 'function') {
                    throw new Error('CLEAR_WORKFLOW_UNAVAILABLE');
                }
                return handle.runWorkflow(validateNativeWorkflowCommand(input));
            },
        });
        const updateWorkflow = () => workflow?.update(currentState, typeof handle?.runWorkflow === 'function'
            && typeof validateNativeWorkflowCommand === 'function');
        const renderer = view.create({element, role: role === 'participant' ? 'PARTICIPANT' : 'COURSE_OPERATOR',
            dispatch: async input => {
                if (closed || !handle) {
                    throw new Error('CLEAR_NATIVE_UNAVAILABLE');
                }
                try {
                    const command = contract.validateCourseWalletCommand(input);
                    if (['cancel', 'sign-out'].includes(command.action)) {
                        workflow?.disconnect();
                    }
                    await handle.dispatch(command);
                } catch {
                    workflow?.disconnect();
                    renderer.render(null, []);
                    throw new Error('CLEAR_NATIVE_UNAVAILABLE');
                }
            }});
        const destroy = () => {
            if (closed) {
                return;
            }
            closed = true;
            conditions?.destroy();
            conditionListeners.clear();
            workflow?.destroy();
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
                currentState = state;
                updateWorkflow();
                notifyConditions();
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
            updateWorkflow();
            if (conditionsRoot && typeof panels.mountOperatorConditionPanel === 'function'
                    && Number(conditionsRoot.dataset.courseId) === config.courseId) {
                conditionsRoot.replaceChildren();
                // previewRequest is A's port: CLEAR operator session + CSRF + course scope + native
                // command fence for /bootcamp/preview/{prepare,generate}. Absent -> 'unconnected'.
                conditions = panels.mountOperatorConditionPanel(conditionsRoot, {
                    courseId: config.courseId,
                    readConnection: conditionConnection,
                    subscribe: listener => {
                        conditionListeners.add(listener);
                        return () => conditionListeners.delete(listener);
                    },
                    previewRequest: typeof handle.previewRequest === 'function'
                        ? (path, options) => handle.previewRequest(path, options) : null,
                });
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
            const mounted = compose({element, config, mountCourseWallet: module.mountCourseWallet,
                validateNativeWorkflowCommand: module.validateNativeWorkflowCommand});
            window.addEventListener('pagehide', mounted.destroy, {once: true});
        } catch {
            // The unavailable server-rendered state remains. No speculative success or automatic retry.
        }
    };
    return {init, compose};
});
