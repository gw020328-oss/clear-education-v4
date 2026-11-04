/** Moodle controls for the fixed A workflow port. */
define([], function() {
    'use strict';

    const writes = new Set(['create-application', 'bind-source-session', 'approve-source-signature',
        'approve-registration', 'approve-reflection', 'consent']);
    const id = value => typeof value === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(value);

    const create = ({root, role, invoke, newKey}) => {
        const buttons = [...root.querySelectorAll('[data-workflow-action]')];
        const status = root.querySelector('[data-workflow-status]');
        const details = [...root.querySelectorAll('[data-workflow-details]')];
        const acknowledgment = root.querySelector('[data-workflow-ack]');
        const messages = Object.fromEntries([...root.querySelectorAll('[data-workflow-message]')]
            .map(node => [node.dataset.workflowMessage, node.textContent]));
        const participant = role === 'participant';
        let ready = false;
        let walletBusy = false;
        let closed = false;
        let pending = null;
        let unknown = false;
        let createAttempted = false;
        let createdApplicationId = null;
        let sourceBound = false;
        let operation = null;
        let applicationId = null;
        let session, application, registration, source, reflection;
        let displayed = {};

        const show = message => {
            status.textContent = messages[unknown ? 'unknown' : message];
        };
        const clear = () => {
            session = application = registration = source = reflection = null;
            applicationId = null;
            sourceBound = false;
            acknowledgment.checked = false;
            displayed = {};
        };
        const enabled = action => {
            if (closed || !ready || walletBusy || pending || (unknown && writes.has(action))) {
                return false;
            }
            switch (action) {
                case 'read-session': return true;
                case 'read-operation': return operation !== null;
                case 'create-application': return participant && session && !session.failure && !applicationId && !createAttempted;
                case 'bind-source-session': return participant && !!applicationId && !sourceBound;
                case 'read-source-signature':
                case 'read-registration': return participant && sourceBound;
                case 'approve-source-signature': return participant && source && source.expiresAt > Date.now() / 1000;
                case 'approve-registration': return participant && registration?.status === 'AWAITING_SIGNATURE';
                case 'approve-reflection': return reflection?.permitted === true && acknowledgment.checked
                    && reflection.approvalWindowEndsAtMs > Date.now();
                case 'consent': return !!application;
                case 'read-application':
                case 'payment-receipt':
                case 'decision-evidence': return !!applicationId;
                default: return false;
            }
        };
        const render = () => {
            for (const button of buttons) {
                button.disabled = !enabled(button.dataset.workflowAction);
            }
            acknowledgment.disabled = closed || !ready || walletBusy || !!pending || unknown || reflection?.permitted !== true;
            for (const region of details) {
                const visible = Object.fromEntries(region.dataset.workflowDetails.split(' ')
                    .filter(key => Object.hasOwn(displayed, key)).map(key => [key, displayed[key]]));
                region.hidden = Object.keys(visible).length === 0;
                region.textContent = region.hidden ? '' : JSON.stringify(visible, null, 2);
            }
        };
        const disconnect = () => {
            if (pending?.write) {
                unknown = true;
            }
            pending = null;
            ready = false;
            clear();
            show('unavailable');
            render();
        };
        const require = condition => {
            if (!condition) {
                throw new Error('CLEAR_WORKFLOW_RESPONSE');
            }
        };
        const exactApp = result => require(result?.applicationId === applicationId && id(applicationId));
        const record = (result, kind) => {
            const row = result?.record;
            require(id(row?.applicationId) && id(row.operationId) && typeof result.current === 'boolean');
            if (kind === 'procedure' || applicationId) {
                exactApp(row);
            }
            operation = {applicationId: row.applicationId, operationId: row.operationId, kind};
            return operation;
        };

        const accept = (input, result) => {
            switch (input.action) {
                case 'read-session': {
                    require(result?.version === 'clear-bootcamp-normal-session.1'
                        && result.role === (participant ? 'PARTICIPANT' : 'OPERATOR')
                        && (result.applicationId === null || id(result.applicationId)));
                    clear();
                    session = result;
                    // A null source binding can coexist with the durable create receipt.
                    sourceBound = result.applicationId !== null;
                    applicationId = result.applicationId ?? createdApplicationId;
                    if (operation && applicationId && operation.applicationId !== applicationId) {
                        operation = null;
                    }
                    if (sourceBound && createdApplicationId !== applicationId) {
                        createdApplicationId = null;
                    }
                    reflection = result.aiApproval?.version === 'clear-normal-exact-ai-approval-display.1'
                        && result.aiApproval.applicationId === applicationId ? result.aiApproval : null;
                    displayed.session = {applicationId, phase: result.phase, sourceBound: result.applicationId !== null};
                    if (reflection) {
                        displayed.reflection = reflection;
                    }
                    break;
                }
                case 'create-application':
                    createdApplicationId = applicationId = record(result, 'application').applicationId;
                    displayed.operation = operation;
                    break;
                case 'read-application':
                    exactApp(result);
                    require(result.version === 'clear-bootcamp-normal-view.1' && result.displayOnly === true
                        && result.role === (participant ? 'PARTICIPANT' : 'COURSE_OPERATOR') && result.target
                        && result.agreedPayment && Array.isArray(result.criteria));
                    application = result;
                    displayed.application = {decision: result.decision, target: result.target, criteria: result.criteria,
                        agreedPayment: result.agreedPayment, funding: result.funding, consent: result.consent};
                    break;
                case 'bind-source-session':
                    exactApp(result);
                    require(result.status === 'AUTHENTICATED_SOURCE_SESSION_BOUND' && result.paymentAuthorization === false);
                    sourceBound = true;
                    displayed.source = {status: result.status};
                    break;
                case 'read-source-signature':
                    exactApp(result);
                    require(result.purpose === 'HACKERRANK_EVIDENCE_OBSERVATION_NOT_PAYMENT_AUTHORIZATION'
                        && id(result.approvalId) && /^0x[0-9a-f]{64}$/.test(result.requestHash)
                        && typeof result.message === 'string' && Number.isSafeInteger(result.expiresAt));
                    source = result;
                    displayed.source = {message: result.message, expiresAt: result.expiresAt, purpose: result.purpose};
                    break;
                case 'approve-source-signature':
                    require(result?.status === 'PARTICIPANT_SIGNATURE_ACCEPTED' && result.paymentAuthorization === false
                        && result.approvalId === input.reviewed.approvalId && result.requestHash === input.reviewed.requestHash);
                    displayed.source = {status: result.status};
                    break;
                case 'read-registration':
                    exactApp(result);
                    require(result.version === 'clear-bootcamp-recipient-registration.1' && result.role === 'PARTICIPANT'
                        && result.purpose === 'REGISTER_FIXED_RECIPIENT' && result.calldataPublic === true);
                    registration = result;
                    displayed.registration = {status: result.status, payload: result.payload, decisionId: result.decisionId,
                        registrationTargetId: result.registrationTargetId, calldataPublic: result.calldataPublic};
                    break;
                case 'approve-registration':
                case 'consent':
                    require(result?.version === 'clear-bootcamp-procedure-operation.1' && result.usableForPayment === false);
                    displayed.operation = record(result, 'procedure');
                    break;
                case 'approve-reflection':
                    exactApp(result);
                    require(result.version === 'clear-normal-ai-approval-receipt.1'
                        && result.runBindingHash === input.reviewed.runBindingHash && result.status === 'RECORDED'
                        && result.paymentConsentIncluded === false);
                    displayed.reflection = result;
                    break;
                case 'payment-receipt':
                    exactApp(result);
                    require(result.version === 'clear-bootcamp-normal-payment-receipt.1'
                        && result.role === (participant ? 'PARTICIPANT' : 'OPERATOR'));
                    displayed.receipt = {state: result.claim?.state, finalized: result.claim?.finalized};
                    if (result.claim?.state === 'INCLUDED' && result.claim.canonical === true
                            && result.claim.transferAmountAtoms === '100000000'
                            && result.balance?.receivedAtoms === '100000000'
                            && result.balance.exactExpectedAmountVerified === true) {
                        displayed.receipt.observation = messages.received;
                    } else {
                        displayed.receipt.observation = messages.unconfirmed;
                    }
                    break;
                case 'decision-evidence':
                    exactApp(result);
                    require(result.version === 'clear-bootcamp-decision-evidence.1'
                        && result.role === (participant ? 'PARTICIPANT' : 'COURSE_OPERATOR'));
                    displayed.evidence = {manifest: result.manifest, manifestHash: result.manifestHash, limitations: result.limitations};
                    break;
                case 'read-operation':
                    require(result?.record?.applicationId === operation?.applicationId
                        && result.record.operationId === operation.operationId && typeof result.current === 'boolean');
                    displayed.operation = {...operation, current: result.current};
                    break;
            }
        };

        const command = (action, choice) => {
            switch (action) {
                case 'create-application': return {action, idempotencyKey: newKey()};
                case 'approve-reflection': return {action, reviewed: reflection, idempotencyKey: newKey()};
                case 'consent': return {action, reviewed: application, value: choice, idempotencyKey: newKey()};
                case 'approve-source-signature': return {action, reviewed: source};
                case 'approve-registration': return {action, reviewed: registration};
                case 'read-operation': return {action, ...operation};
                case 'read-session':
                case 'read-registration': return {action};
                default: return {action, applicationId};
            }
        };

        const click = async event => {
            const button = event.target.closest?.('[data-workflow-action]');
            if (!buttons.includes(button)) {
                return;
            }
            const {workflowAction: action, workflowChoice: choice} = button.dataset;
            if (!enabled(action) || (action === 'consent' && !['AGREE', 'WITHDRAW'].includes(choice))) {
                return;
            }
            let input;
            try {
                input = command(action, choice);
            } catch {
                show('failure');
                return;
            }
            const task = {write: writes.has(action)};
            pending = task;
            if (action === 'create-application') {
                createAttempted = true;
            }
            if (task.write) {
                // A write can invalidate every earlier review packet and receipt observation.
                application = registration = source = reflection = null;
                acknowledgment.checked = false;
                displayed = {};
            }
            show('busy');
            render();
            try {
                const result = await invoke(input);
                if (pending !== task || !ready) {
                    return;
                }
                accept(input, result);
                show('success');
            } catch {
                if (pending !== task) {
                    return;
                }
                clear();
                unknown ||= task.write;
                show('failure');
            } finally {
                if (pending === task) {
                    pending = null;
                    render();
                }
            }
        };
        root.addEventListener('click', click);
        acknowledgment.addEventListener('change', render);
        render();
        return {
            disconnect,
            update(state, port) {
                const connected = port && state?.role === role && state.phase === 'CONNECTED' && state.authenticated === true;
                walletBusy = state?.busy === true;
                if (!connected) {
                    disconnect();
                    return;
                }
                if (!ready) {
                    show('ready');
                }
                ready = true;
                render();
            },
            destroy() {
                closed = true;
                disconnect();
                root.removeEventListener('click', click);
                acknowledgment.removeEventListener('change', render);
            },
        };
    };
    return {create};
});
