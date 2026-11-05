/** Moodle controls for the fixed A workflow port. */
define([], function() {
    'use strict';

    const writes = new Set(['create-application', 'bind-source-session', 'approve-source-signature',
        'approve-registration', 'approve-reflection', 'consent', 'refresh-activity', 'start-certificate']);
    const id = value => typeof value === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(value);

    const create = ({root, role, invoke, newKey, panels, courseId, origin}) => {
        const buttons = [...root.querySelectorAll('[data-workflow-action]')];
        const status = root.querySelector('[data-workflow-status]');
        const details = [...root.querySelectorAll('[data-workflow-details]')];
        const applicationStatus = root.querySelector('#clearbridge-application-status');
        const panelStatus = root.querySelector('[data-native-panel-status]');
        const activityStatus = root.querySelector('[data-native-activity-status]');
        const cardRoot = root.querySelector('[data-native-condition-cards]');
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
        let cards;
        let cardsQueued = false;
        let certificateAttempted = false;
        let certificateAccepted = false;
        let certificateTimer = null;
        let certificatePolls = 0;
        const stopCertificateReads = () => {
            clearTimeout(certificateTimer);
            certificateTimer = null;
        };
        const scheduleCertificateRead = () => {
            stopCertificateReads();
            if (!ready || closed || unknown || certificatePolls >= 6) {
                return;
            }
            certificateTimer = setTimeout(async () => {
                certificateTimer = null;
                if (!ready || closed || unknown) {
                    return;
                }
                if (pending || walletBusy) {
                    certificatePolls++;
                    scheduleCertificateRead();
                    return;
                }
                certificatePolls++;
                const result = await run('read-session');
                if (result && ['START_ACCEPTED', 'SIGNATURE_ACCEPTED'].includes(certificate()?.state)) {
                    scheduleCertificateRead();
                }
            }, 1000);
        };
        const certificateStates = ['NOT_READY', 'READY_TO_START', 'START_ACCEPTED', 'AWAITING_SIGNATURE',
            'SIGNATURE_ACCEPTED', 'VERIFIED', 'UNAVAILABLE'];
        const certificate = () => {
            const value = session?.certificate;
            return participant && sourceBound && session.phase === 'SOURCE_python-basic-certificate'
                && value?.version === 'clear-certificate-start.1' && value.applicationId === applicationId
                && value.criterionId === 'python-basic-certificate' && certificateStates.includes(value.state)
                && value.startAllowed === (value.state === 'READY_TO_START')
                && value.signatureReady === (value.state === 'AWAITING_SIGNATURE') ? value : null;
        };
        let activityMode = false;
        let activityVisit = null;
        let activityResult = null;
        const activityTargets = () => {
            const targets = session?.conditionTargets;
            if (!participant || courseId !== 2 || targets?.moodleOrigin !== origin || targets.courseId !== courseId
                    || targets.applicationId !== applicationId || targets.version !== 'clear-student-condition-targets.1'
                    || !Array.isArray(targets.targets) || targets.targets.length !== 1) {
                return null;
            }
            const [target] = targets.targets;
            return target?.criterionId === 'activity-complete' && target.cmId === 3 && target.module === 'page' ? targets : null;
        };
        const onlyActivity = rows => activityMode
            ? rows?.filter(row => row.criterionId === 'activity-complete') : rows;
        const activityView = () => application && activityMode
            ? {...application, criteria: onlyActivity(application.criteria)} : application;
        const revision = () => application?.target.expectedRevision;
        const canVisit = () => activityTargets() && Number.isSafeInteger(revision()) && revision() > 0;
        const hasActivityEvidence = () => {
            const evidence = displayed.evidence;
            return activityMode && ['activityqueued', 'activityrecorded'].includes(activityResult)
                && application?.decision?.id === evidence?.manifest?.decision?.decisionId
                && application?.decision?.hash === evidence?.manifest?.decision?.decisionHash
                && application?.criteria.some(row => row.criterionId === 'activity-complete'
                    && row.state === 'MET' && row.current === true && typeof row.evidenceId === 'string' && row.evidenceId !== ''
                    && evidence?.availability?.some(item => item.criterionId === row.criterionId
                        && item.evidenceId === row.evidenceId && item.status === 'VALID_AS_RECORDED'));
        };
        const updatePanel = connected => {
            if (!panelStatus || !panels) {
                return;
            }
            // The validated current mount is the only source of CONNECTED. All other
            // states, including an invalidated intent, clear the prior display.
            const reply = {status: connected ? 'CONNECTED' : 'UNAVAILABLE'};
            const visible = participant ? panels.toParticipantEntry(reply).clear.signedIn === true
                : panels.toOperatorCourseLink(reply).connection.status === 'CONNECTED';
            panelStatus.textContent = messages[visible ? 'panelconnected' : 'panelunknown'];
        };
        const paintCards = () => {
            if (!cards || cardsQueued) {
                return;
            }
            cardsQueued = true;
            queueMicrotask(() => {
                cardsQueued = false;
                if (cards && ready) {
                    cardRoot.replaceChildren(cards.render());
                    renderCertificateCard();
                }
            });
        };
        const renderCertificateCard = () => {
            const card = cardRoot.querySelector?.('[data-criterion="python-basic-certificate"]');
            const block = card?.querySelector('[data-cert]');
            const button = card?.querySelector('.crc-go');
            if (!block || !button) {
                return;
            }
            const value = certificate();
            const state = value?.state;
            const action = state === 'READY_TO_START' ? 'start-certificate'
                : state === 'AWAITING_SIGNATURE' ? source ? 'approve-source-signature' : 'read-source-signature' : null;
            const title = block.querySelector('.crc-title');
            const note = block.querySelector('.crc-muted');
            if (title) {
                title.textContent = label(value ? 'certificate' + state.toLowerCase()
                    : certificateAccepted ? 'certificatestartaccepted' : 'certificateunavailable');
            }
            if (note) {
                note.textContent = label('certificatenote');
            }
            // Replace the original inert primary control. The upstream pinned card
            // has no readiness-aware start contract, so C owns only this control.
            const replacement = button.ownerDocument.createElement('button');
            replacement.type = 'button';
            replacement.className = 'cc-btn crc-go';
            replacement.textContent = action ? label('certificate' + action) : label('certificatewait');
            replacement.disabled = !action || !enabled(action);
            replacement.addEventListener('click', () => {
                if (action && enabled(action)) {
                    void run(action);
                }
            });
            button.replaceWith(replacement);
        };
        const closeCards = () => {
            cards?.close();
            cards = null;
            cardRoot?.replaceChildren();
        };

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
                case 'refresh-activity': return !!activityTargets();
                case 'start-certificate': return !certificateAttempted && certificate()?.startAllowed === true
                    && Number.isSafeInteger(revision()) && revision() > 0;
                case 'read-operation': return operation !== null;
                case 'create-application': return participant && session && !session.failure && !applicationId && !createAttempted;
                case 'bind-source-session': return participant && !!applicationId && !sourceBound;
                case 'read-source-signature': return certificate()?.signatureReady === true;
                case 'read-registration': return participant && sourceBound;
                case 'approve-source-signature': return certificate()?.signatureReady === true && source
                    && source.applicationId === applicationId && source.expiresAt > Date.now() / 1000;
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
        const label = key => messages[key] ?? messages.unconfirmed;
        const line = (key, value) => value == null ? '' : label(key) + ': ' + value;
        const lines = (...items) => items.filter(Boolean).join('\n');
        const amount = value => {
            const atoms = value?.amountAtoms;
            if (typeof atoms !== 'string' || !/^\d+$/.test(atoms) || value.symbol !== 'TEST' || value.decimals !== 6) {
                return messages.unconfirmed;
            }
            const padded = atoms.padStart(7, '0');
            const fraction = padded.slice(-6).replace(/0+$/, '');
            return padded.slice(0, -6) + (fraction ? '.' + fraction : '') + ' TEST';
        };
        const criteria = (rows, availability = []) => (rows ?? []).map(row => {
            const evidence = availability.find(item => item.criterionId === row.criterionId);
            return lines(
                label(row.criterionId) + ' — ' + label(row.state),
                line('basis', label(evidence?.status ?? (row.current === true ? 'CURRENT' : 'UNKNOWN'))),
                line('original', label(evidence?.original?.status ??
                    (row.originalEvidence?.httpAvailable === true ? 'AVAILABLE' : 'UNAVAILABLE')))
            );
        }).join('\n\n');
        const format = (key, value) => {
            switch (key) {
                case 'session':
                    return label(value.sourceBound ? 'sourcebound' : 'sourcenotbound');
                case 'operation':
                    return label(value.current === false ? 'operationprevious' : 'operationsaved');
                case 'application':
                    return lines(line('decision', label(value.decision?.conditionsStatus)),
                        line('basis', label(value.decision?.evidenceCurrent === true ? 'CURRENT' : 'UNKNOWN')),
                        line('decisiontarget', value.target.targetDecisionId),
                        line('revision', value.target.targetDecisionRevision),
                        line('fingerprint', value.target.targetDecisionHash),
                        line('amount', amount(value.agreedPayment)),
                        line('participantconsent', label(value.consent?.records?.some(row => row.actorRole === 'PARTICIPANT')
                            ? 'AGREE' : 'UNKNOWN')),
                        line('operatorconsent', label(value.consent?.records?.some(row => row.actorRole === 'COURSE_OPERATOR')
                            ? 'AGREE' : 'UNKNOWN')),
                        criteria(value.criteria));
                case 'evidence':
                    return lines(line('decision', label(value.manifest?.decision?.conditionsStatus)),
                        criteria(value.manifest?.criteria, value.availability), label('evidencelimits'));
                case 'registration':
                    return lines(label(value.status), label('publicregistration'),
                        line('decisiontarget', value.decisionId),
                        line('registrationtarget', value.registrationTargetId),
                        value.payload == null ? '' : label('registrationpayload') + '\n' + JSON.stringify(value.payload, null, 2));
                case 'source':
                    return value.message == null ? label(value.status) :
                        lines(label('sourcereview'), line('expiry', new Date(value.expiresAt * 1000).toJSON() ?? value.expiresAt), value.message);
                case 'reflection':
                    if (value.version === 'clear-normal-ai-approval-receipt.1') {
                        return label('airecorded');
                    }
                    return lines(label(value.permitted === true ? 'aieligible' : 'aiineligible'), label('aicostnotice'),
                        line('input', value.sourceScope == null ? null : JSON.stringify(value.sourceScope)),
                        line('fingerprint', value.bodySha256), line('model', value.model),
                        line('estimatedcost', value.scenarioUsd == null ? null : value.scenarioUsd + ' USD'),
                        line('costack', value.costAcknowledgment),
                        line('reviewdetails', JSON.stringify(value, null, 2)));
                case 'receipt':
                    return lines(value.observation,
                        label(value.state === 'INCLUDED' ? 'receiptincluded' :
                            value.state === 'NOT_OBSERVED' ? 'receiptnotobserved' : 'receiptunavailable'),
                        value.state === 'INCLUDED' && typeof value.finalized === 'boolean'
                            ? label(value.finalized ? 'finalized' : 'notfinalized') : '');
                default:
                    return '';
            }
        };
        const render = () => {
            for (const button of buttons) {
                button.disabled = !enabled(button.dataset.workflowAction);
            }
            acknowledgment.disabled = closed || !ready || walletBusy || !!pending || unknown || reflection?.permitted !== true;
            if (activityStatus) {
                activityStatus.textContent = hasActivityEvidence() ? label('activityconfirmed') : activityResult ? label(activityResult)
                    : activityTargets() && !canVisit() ? label('activityreview') : '';
            }
            if (applicationStatus) {
                applicationStatus.textContent = label(unknown ? 'unknown' : applicationId ? 'applicationknown' :
                    ready && session ? 'applicationreviewed' : 'applicationpending');
            }
            for (const region of details) {
                const visible = region.dataset.workflowDetails.split(' ').filter(key => Object.hasOwn(displayed, key))
                    .map(key => format(key, displayed[key])).filter(Boolean).join('\n\n');
                region.hidden = !visible;
                region.textContent = visible;
            }
            paintCards();
        };
        const disconnect = () => {
            if (pending?.write) {
                unknown = true;
            }
            pending = null;
            ready = false;
            stopCertificateReads();
            activityVisit = activityResult = null;
            closeCards();
            updatePanel(false);
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
                    activityMode ||= Boolean(activityTargets());
                    if (operation && applicationId && operation.applicationId !== applicationId) {
                        operation = null;
                    }
                    if (sourceBound && createdApplicationId !== applicationId) {
                        createdApplicationId = null;
                    }
                    reflection = result.aiApproval?.version === 'clear-normal-exact-ai-approval-display.1'
                        && result.aiApproval.applicationId === applicationId ? result.aiApproval : null;
                    displayed.session = {sourceBound};
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
                    displayed.application = {decision: result.decision, target: result.target, criteria: onlyActivity(result.criteria),
                        agreedPayment: result.agreedPayment, funding: result.funding, consent: result.consent};
                    break;
                case 'start-certificate':
                    exactApp(result);
                    require(result.version === 'clear-certificate-start-receipt.1'
                        && result.criterionId === 'python-basic-certificate'
                        && result.status === 'START_ACCEPTED' && result.paymentAuthorization === false);
                    certificateAccepted = true;
                    displayed.source = {status: 'CERTIFICATE_START_ACCEPTED'};
                    break;
                case 'refresh-activity':
                    require(['QUEUED', 'RECORDED', 'UNAVAILABLE', 'RATE_LIMITED'].includes(result?.status)
                        && (result.status === 'RATE_LIMITED' ? Number.isSafeInteger(result.retryAfterSeconds)
                            && result.retryAfterSeconds > 0 : id(result.operationId)));
                    activityResult = {QUEUED: 'activityqueued', RECORDED: 'activityrecorded',
                        RATE_LIMITED: 'activitylimited', UNAVAILABLE: 'activityunavailable'}[result.status];
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
                    displayed.evidence = {manifest: result.manifest && {...result.manifest,
                        criteria: onlyActivity(result.manifest.criteria)}, availability: onlyActivity(result.availability)};
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
                case 'refresh-activity': return {action, applicationId, expectedRevision: choice, idempotencyKey: newKey()};
                case 'start-certificate': return {action, applicationId, expectedRevision: revision(), idempotencyKey: newKey()};
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

        const run = async (action, choice) => {
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
            if (action === 'start-certificate') {
                certificateAttempted = true;
            }
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
            let succeeded = false;
            try {
                const result = await invoke(input);
                if (pending !== task || !ready) {
                    return;
                }
                accept(input, result);
                succeeded = true;
                show('success');
                return result;
            } catch (error) {
                if (pending !== task) {
                    return;
                }
                const reviewChanged = input.action === 'approve-reflection'
                    && error?.code === 'MOODLE_AI_REVIEW_CHANGED' && error?.outcome === 'NOT_SENT';
                clear();
                unknown ||= task.write && !reviewChanged;
                show('failure');
            } finally {
                if (pending === task) {
                    pending = null;
                    render();
                    if (succeeded && ['start-certificate', 'approve-source-signature'].includes(action)) {
                        certificatePolls = 0;
                        scheduleCertificateRead();
                    }
                }
            }
        };
        const cardRead = async (action, expectedApplication = applicationId) => {
            if (!ready || !expectedApplication || expectedApplication !== applicationId || !enabled(action)) {
                throw new Error('TEST_BUSY_OR_ENDED');
            }
            const result = await run(action);
            if (!result || !ready || expectedApplication !== applicationId) {
                throw new Error('CLEAR_WORKFLOW_UNAVAILABLE');
            }
            return result;
        };
        const readOnReturn = async () => {
            if (activityVisit) {
                const visit = activityVisit;
                if (!enabled('refresh-activity')) {
                    throw new Error('TEST_BUSY_OR_ENDED');
                }
                activityVisit = null;
                if (visit.applicationId === applicationId) {
                    const result = await run('refresh-activity', visit.revision);
                    if (!result) {
                        throw new Error('CLEAR_WORKFLOW_UNAVAILABLE');
                    }
                }
            }
            await cardRead('read-application');
            return {view: activityView()};
        };
        const openCards = () => {
            if (!participant || !cardRoot || !panels || cards) {
                return;
            }
            cards = panels.createConditionCards({
                getState: () => ({
                    view: activityView(),
                    busy: !ready || walletBusy || Boolean(pending),
                    session: session && {applicationId, boundApplicationId: session.applicationId, failure: session.failure,
                        phase: session.phase, aiApproval: session.aiApproval},
                    approval: source,
                }),
                read: readOnReturn,
                loadEvidence: snapshot => cardRead('decision-evidence', snapshot.applicationId),
                targets: () => canVisit() ? activityTargets() : null,
                // The original page stays mounted while a reviewed link opens a new tab.
                storage: panels.memoryStore(),
                onOpen: () => root.querySelector('#clearbridge-decision-heading')?.scrollIntoView(),
                onChange: paintCards,
            });
        };
        const click = event => {
            const link = event.target.closest?.('a.crc-go');
            if (link && cardRoot?.contains(link) && link.href === origin + '/mod/page/view.php?id=3'
                    && ready && canVisit() && !unknown) {
                activityVisit = {applicationId, revision: revision()};
                activityResult = null;
            }
            const button = event.target.closest?.('[data-workflow-action]');
            if (buttons.includes(button)) {
                return run(button.dataset.workflowAction, button.dataset.workflowChoice);
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
                    updatePanel(state?.role === role && state.phase === 'CONNECTED' && state.authenticated === true);
                    return;
                }
                if (!ready) {
                    show('ready');
                }
                ready = true;
                updatePanel(true);
                openCards();
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
