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
        const stageRoot = root.querySelector('[data-native-stage-strip]');
        const payoutRoot = root.querySelector('[data-native-payout-summary]');
        const guideRoot = root.querySelector('[data-native-guide]');
        const lockRoot = root.querySelector('[data-native-lock-notice]');
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
        let receipt = null;
        let session, application, registration, source, reflection;
        let decisionSnapshot = null;
        let displayed = {};
        let cards;
        let cardsQueued = false;
        let certificateRevision = null;
        let certificateRevisionFloor = null;
        const certificateCasRevision = () => certificateRevision?.applicationId === applicationId
            ? certificateRevision.revision : null;
        const retainViewRevision = (view, boundSession) => {
            certificateRevision = null;
            const revision = view?.target?.expectedRevision;
            if (!ready || closed || walletBusy || !participant || !sourceBound || !boundSession
                    || session !== boundSession || session.applicationId !== applicationId || session.failure
                    || view?.version !== 'clear-bootcamp-normal-view.1' || view.displayOnly !== true
                    || view.role !== 'PARTICIPANT' || view.applicationId !== applicationId
                    || view.decision?.current !== true || !Number.isSafeInteger(revision) || revision <= 0
                    || (certificateRevisionFloor?.applicationId === applicationId
                        && revision < certificateRevisionFloor.revision)) {
                return;
            }
            certificateRevision = {applicationId, revision};
            certificateRevisionFloor = certificateRevision;
        };
        let certificateAttempted = false;
        // The reviewed decision of a consent the server definitely did not accept; compared with the next fresh view.
        let consentChangedFrom = null;
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
                // A failed read (e.g. a transient 5xx) keeps polling within the same 6-poll limit; no writes here.
                if (!result || ['START_ACCEPTED', 'SIGNATURE_ACCEPTED'].includes(certificate()?.state)) {
                    scheduleCertificateRead();
                }
            }, 1000);
        };
        const certificateStates = ['NOT_READY', 'READY_TO_START', 'START_ACCEPTED', 'AWAITING_SIGNATURE',
            'SIGNATURE_ACCEPTED', 'VERIFIED', 'UNAVAILABLE'];
        const certificate = () => {
            const value = session?.certificate;
            return participant && sourceBound && (session.phase === 'SOURCE_python-basic-certificate'
                    || session.phase === 'CERTIFICATE_ONLY_RECORDED' && value?.state === 'VERIFIED')
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
                    || !Array.isArray(targets.targets) || ![1, 3].includes(targets.targets.length)) {
                return null;
            }
            const expected = {'activity-complete': [3, 'page'], 'assignment-submitted': [4, 'assign'],
                'reflection-topics': [5, 'forum']};
            const seen = new Set();
            for (const target of targets.targets) {
                const pin = expected[target?.criterionId];
                if (!pin || seen.has(target.criterionId) || target.cmId !== pin[0] || target.module !== pin[1]
                        || Object.keys(target).some(key => !['criterionId', 'cmId', 'module', 'instanceId', 'name'].includes(key))
                        || (target.module === 'forum' ? target.instanceId != null && target.instanceId !== 3
                            : target.instanceId != null && target.instanceId !== 1)) { return null; }
                seen.add(target.criterionId);
            }
            // The fixed forum link opens its existing container, never an unbound new-post form.
            return seen.has('activity-complete') ? {...targets, targets: targets.targets.map(target => {
                if (target.module !== 'forum') { return target; }
                const {instanceId, ...container} = target;
                return container;
            })} : null;
        };
        const moodleMode = () => activityTargets()?.targets.length === 3;
        const pairedMode = () => certificateCompleted() || moodleMode();
        const certificateCompleted = () => certificate()?.state === 'VERIFIED'
            && session.phase === 'CERTIFICATE_ONLY_RECORDED';
        const onlyActivity = rows => activityMode && !certificateCompleted()
            ? rows?.filter(row => row.criterionId === 'activity-complete') : rows;
        const activityView = () => pairedMode()
            ? decisionSnapshot?.session === session ? decisionSnapshot.view : null
            : application && activityMode ? {...application, criteria: onlyActivity(application.criteria)} : application;
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
        // #173 participant UX: stage strip and payout summary. Read-only views of values this page
        // already holds (current application view, signed registration, payment receipt). The
        // stage strip says "paid" only for a FINALIZED claim with a received amount (#173 rule).
        const criterionLabels = {'activity-complete': '지정 활동', 'assignment-submitted': '과제 제출',
            'reflection-topics': '회고', 'python-basic-certificate': 'HackerRank 인증서'};
        // The real view reports the accepted right only as CLAIMED/UNCLAIMED. The claim transfer's
        // INCLUDED state (finalized=false) comes from the receipt already read for this same application.
        const sameReceipt = view => ready && view?.applicationId === applicationId
            && receipt?.applicationId === applicationId ? receipt : null;
        const includedClaim = view => {
            const held = sameReceipt(view);
            const claim = held?.claim;
            return !!held && held.version === 'clear-bootcamp-normal-payment-receipt.1' && held.role === 'PARTICIPANT'
                && !!view.payment?.acceptedRight && view.payment.claimState === 'CLAIMED'
                && claim?.state === 'INCLUDED' && claim.canonical === true && claim.finalized === false
                && claim.transferAmountAtoms === '100000000' && held.balance?.receivedAtoms === '100000000'
                && held.balance.exactExpectedAmountVerified === true;
        };
        const paintUx = () => {
            if (!participant || !panels) {
                return;
            }
            const current = ready && application ? {...application, criteria: (application.criteria || [])
                .map(row => ({...row, label: row.label ?? criterionLabels[row.criterionId] ?? row.criterionId}))} : null;
            const included = includedClaim(current);
            // Only this display copy carries INCLUDED; nothing here produces FINALIZED, so "paid" stays closed.
            // A's procedure.terminationReason is time-only (review cap) even after its own
            // ACCEPTED_RIGHT_PRESERVED status; with the INCLUDED claim bound, the copy follows that status.
            const view = included ? {...current, payment: {...current.payment, claimState: 'INCLUDED'},
                procedure: current.procedure?.status === 'ACCEPTED_RIGHT_PRESERVED'
                    ? {...current.procedure, terminationReason: null} : current.procedure} : current;
            if (stageRoot && typeof panels.stageStrip === 'function') {
                try {
                    stageRoot.replaceChildren(panels.stageStrip(panels.participantStage({view,
                        conn: {state: ready ? 'LIVE' : 'NOT_CONNECTED'}})));
                } catch {
                    stageRoot.replaceChildren();
                }
            }
            if (payoutRoot && typeof panels.payoutSummary === 'function') {
                try {
                    const recipient = registration?.payload?.message?.recipient ?? null;
                    const node = view ? panels.payoutSummary({view, recipient, receipt: sameReceipt(view)}) : null;
                    payoutRoot.replaceChildren(...(node ? [node] : []));
                } catch {
                    payoutRoot.replaceChildren();
                }
            }
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
            if (!block) {
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
            if (!button) {
                return;
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

        let lastStatus = null;
        const show = message => {
            lastStatus = unknown ? 'unknown' : message;
            status.textContent = messages[lastStatus];
        };
        const clear = () => {
            decisionSnapshot = null;
            session = application = registration = source = reflection = receipt = null;
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
                    && Number.isSafeInteger(certificateCasRevision()) && certificateCasRevision() > 0;
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
        const consentLabel = (view, role) => label(view?.consent?.records?.some(row => row.actorRole === role) ? 'AGREE' : 'UNKNOWN');
        // Shows what changed between the decision a rejected consent reviewed and the fresh view. Display only.
        const noteConsentChanges = view => {
            const before = consentChangedFrom;
            consentChangedFrom = null;
            if (!before || before.applicationId !== view?.applicationId) {
                return;
            }
            const changes = [];
            const pair = (key, from, to) => {
                if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) {
                    changes.push(label(key) + ': ' + (from ?? label('unconfirmed')) + ' → ' + (to ?? label('unconfirmed')));
                }
            };
            pair('decisiontarget', before.target?.targetDecisionId, view.target?.targetDecisionId);
            pair('revision', before.target?.targetDecisionRevision, view.target?.targetDecisionRevision);
            pair('fingerprint', before.target?.targetDecisionHash, view.target?.targetDecisionHash);
            pair('ledgersequence', before.target?.expectedLedgerSequence, view.target?.expectedLedgerSequence);
            pair('amount', amount(before.agreedPayment), amount(view.agreedPayment));
            pair('participantconsent', consentLabel(before, 'PARTICIPANT'), consentLabel(view, 'PARTICIPANT'));
            pair('operatorconsent', consentLabel(before, 'COURSE_OPERATOR'), consentLabel(view, 'COURSE_OPERATOR'));
            for (const row of view.criteria ?? []) {
                const old = (before.criteria ?? []).find(item => item.criterionId === row.criterionId);
                pair(row.criterionId, old ? label(old.state) : null, label(row.state));
            }
            displayed.changes = changes.length ? changes : [label('changesnone')];
        };
        const format = (key, value) => {
            switch (key) {
                case 'changes':
                    return lines(label('changes'), ...value);
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
        // Student "one thing to do now" guide. Display and routing only: every guide button runs the same
        // run(action) path as the existing controls, is disabled exactly when enabled(action) is false, and
        // never offers an action the page would refuse. Technical sections stay in the page behind a toggle.
        let simple = true;
        let aiApprovedFor = null;
        let boundOnce = null;
        let signedRegistrationFor = null;
        let guideSignature = null;
        let guideButton = null;
        let guideAck = null;
        let guideStepNow = null;
        const metAll = view => view?.decision?.conditionsStatus === 'MET' || (Array.isArray(view?.criteria)
            && view.criteria.length >= 4 && view.criteria.every(row => row.state === 'MET'));
        const agreedBy = (view, role) => !!view?.consent?.records?.some(row => row.actorRole === role);
        const refreshActions = () => pairedMode() ? ['read-session'] : ['read-session', 'read-application'];
        const guideStep = () => {
            if (sourceBound && applicationId) {
                boundOnce = applicationId;
            }
            if (!ready) {
                // After the application is bound, only the original login can continue it (A pins the session).
                return boundOnce ? {key: 'lost', actions: []} : {key: 'connect', actions: []};
            }
            if (pending || walletBusy) {
                return {key: 'busy', busy: pending?.action ?? 'wallet', actions: []};
            }
            if (unknown) {
                return {key: 'unknown', actions: ['read-session']};
            }
            if (lastStatus === 'notaccepted' || lastStatus === 'failure') {
                return {key: lastStatus, actions: ['read-session']};
            }
            if (!session) {
                return {key: 'load', actions: ['read-session']};
            }
            if (!applicationId) {
                return enabled('create-application') ? {key: 'apply', actions: ['create-application']}
                    : {key: 'load', actions: ['read-session']};
            }
            // A created application is not yet bound to the evidence session (r45): bind it first.
            if (!sourceBound && enabled('bind-source-session')) {
                return {key: 'bind', actions: ['bind-source-session']};
            }
            const cert = certificate();
            if (cert?.state === 'READY_TO_START' && enabled('start-certificate')) {
                return {key: 'cert-start', actions: ['start-certificate']};
            }
            if (cert?.state === 'AWAITING_SIGNATURE') {
                return source ? {key: 'cert-sign', actions: ['approve-source-signature']}
                    : {key: 'cert-read', actions: ['read-source-signature']};
            }
            if (cert?.state === 'START_ACCEPTED') {
                return {key: 'cert-prep', actions: ['read-session']};
            }
            if (cert?.state === 'SIGNATURE_ACCEPTED') {
                return {key: 'cert-wait', actions: ['read-session']};
            }
            const view = application;
            if (!view || view.applicationId !== applicationId) {
                return {key: 'refresh', actions: refreshActions()};
            }
            if (!metAll(view)) {
                return {key: 'conditions', actions: refreshActions()};
            }
            if (view.payment?.acceptedRight || (agreedBy(view, 'PARTICIPANT') && agreedBy(view, 'COURSE_OPERATOR'))) {
                return {key: includedClaim(view) ? 'paid' : receipt ? 'receipt-wait' : 'receipt',
                    actions: ['payment-receipt', 'read-application']};
            }
            if (agreedBy(view, 'PARTICIPANT')) {
                return {key: 'wait-operator', actions: refreshActions()};
            }
            if (registration?.status === 'AWAITING_SIGNATURE') {
                return {key: 'register-sign', actions: ['approve-registration']};
            }
            if (registration?.status === 'SIGNED') {
                return {key: 'consent', actions: ['consent'], choice: 'AGREE'};
            }
            if (!registration && signedRegistrationFor === applicationId) {
                return {key: 'register-confirm', actions: ['read-registration']};
            }
            return {key: registration ? 'register-check' : 'register-read', actions: ['read-registration']};
        };
        // Operator (teacher) guide: connect → student application → reflection AI approval → consent → payment check.
        // Same rules as the student guide: every button runs the existing run(action) and is disabled when enabled() is false.
        const receiptIncluded = role => receipt?.applicationId === applicationId && receipt.role === role
            && receipt.claim?.state === 'INCLUDED' && receipt.claim.canonical === true
            && receipt.claim.transferAmountAtoms === '100000000' && receipt.balance?.receivedAtoms === '100000000'
            && receipt.balance.exactExpectedAmountVerified === true;
        const operatorStep = () => {
            if (!ready) {
                return {key: 'connect', actions: []};
            }
            if (pending || walletBusy) {
                return {key: 'busy', busy: pending?.action ?? 'wallet', actions: []};
            }
            if (unknown) {
                return {key: 'unknown', actions: ['read-session']};
            }
            if (lastStatus === 'notaccepted' || lastStatus === 'failure') {
                return {key: lastStatus, actions: ['read-session']};
            }
            if (!session) {
                return {key: 'load', actions: ['read-session']};
            }
            if (reflection?.permitted === true && aiApprovedFor !== applicationId) {
                return Number(reflection.approvalWindowEndsAtMs) > Date.now()
                    ? {key: 'op-ai', actions: ['approve-reflection']} : {key: 'op-ai-late', actions: ['read-session']};
            }
            if (!applicationId) {
                return {key: 'op-wait-apply', actions: ['read-session']};
            }
            const both = ['read-session', 'read-application'];
            const view = application;
            if (!view || view.applicationId !== applicationId) {
                return {key: 'refresh', actions: both};
            }
            if (!metAll(view)) {
                return {key: 'op-conditions', actions: both};
            }
            if (view.payment?.acceptedRight || (agreedBy(view, 'PARTICIPANT') && agreedBy(view, 'COURSE_OPERATOR'))) {
                return {key: receiptIncluded('OPERATOR') ? 'paid' : receipt ? 'receipt-wait' : 'receipt',
                    actions: ['payment-receipt', 'read-application']};
            }
            // Offer the teacher's consent only after the student's (the student registers first; earlier is a 409).
            if (agreedBy(view, 'COURSE_OPERATOR') || !agreedBy(view, 'PARTICIPANT')) {
                return {key: 'op-wait-student', actions: both};
            }
            return {key: 'op-consent', actions: ['consent'], choice: 'AGREE'};
        };
        const operatorSteps = () => {
            const view = application?.applicationId === applicationId ? application : null;
            const reflectionMet = !!view?.criteria?.some(row => row.criterionId === 'reflection-topics' && row.state === 'MET');
            const done = [ready, ready && !!applicationId, ready && (reflectionMet || aiApprovedFor === applicationId && !!applicationId),
                ready && !!view && (!!view.payment?.acceptedRight || agreedBy(view, 'PARTICIPANT') && agreedBy(view, 'COURSE_OPERATOR')),
                ready && receiptIncluded('OPERATOR')];
            const now = done.indexOf(false);
            return ['지갑 연결', '학생 신청', '회고 AI 승인', '양측 동의', '지급 확인']
                .map((name, i) => [name, done[i] ? 'done' : i === now ? 'now' : 'todo']);
        };
        const operatorText = {
            connect: ['MetaMask로 시작해요', '아래 버튼을 위에서부터 하나씩 누르세요. MetaMask 창이 뜨면 「네트워크 추가」, 「연결」, '
                + '「서명」을 차례로 승인해 주세요. 진행하는 동안에는 MetaMask 설정을 바꾸지 마세요.', null],
            load: ['학생 진행 상황을 불러올게요', '버튼을 누르면 지금 선생님이 할 일을 알려 드려요.', '불러오기'],
            'op-wait-apply': ['학생의 환급 신청을 기다리고 있어요', '학생이 신청하면 조건 확인이 시작돼요. 학생이 신청했다고 하면 '
                + '아래 버튼을 눌러 주세요.', '최신 상태 확인하기'],
            refresh: ['최신 상태를 불러올게요', '학생 신청과 조건 판정을 새로 가져와요.', '불러오기'],
            'op-ai': ['회고 AI 검토를 승인해 주세요', '학생 회고 글 1개를 AI가 세 항목(수행 내용·문제 해결 과정·배운 점)이 있는지 '
                + '확인해요. 아래 내용을 보고 체크한 뒤 서명해 주세요. 승인 창이 열린 뒤 5분 안에 해야 해요.', '승인하고 서명하기'],
            'op-ai-late': ['승인 가능 시간이 지났어요', '회고 AI 검토 승인 시간이 지났어요. 같은 버튼을 다시 누르지 말고 진행 담당자에게 '
                + '알려 주세요.', '최신 상태 불러오기'],
            'op-wait-student': ['학생의 확인을 기다리고 있어요', '네 가지 조건이 모두 충족됐어요. 학생이 받을 지갑을 확인하고 동의하면 '
                + '선생님 동의 차례가 와요. 학생이 마쳤다고 하면 아래 버튼을 눌러 주세요.', '최신 상태 확인하기'],
            'op-consent': ['결과를 확인하고 동의해 주세요', '학생이 동의했어요. 선생님이 동의하면 금고에 묶여 있던 100 TEST가 '
                + '학생 지갑으로 지급돼요.', '동의하고 서명하기'],
            receipt: ['지급을 확인해요', '학생과 선생님 모두 동의했어요. 학생 지갑에 100 TEST가 들어갔는지 블록체인 기록으로 '
                + '확인해 볼게요.', '지급 확인하기'],
            'receipt-wait': ['지급을 처리하고 있어요', '조금 뒤에 다시 확인해 주세요.', '다시 확인하기'],
            paid: ['학생에게 100 TEST를 보냈어요', '금고에서 학생 지갑으로 100 TEST가 간 것을 블록체인 기록으로 확인했어요. '
                + '기록이 완전히 확정되기까지는 조금 더 걸릴 수 있어요.', '다시 확인하기'],
        };
        const guideText = {
            connect: ['Google 계정으로 시작해요', '아래 버튼을 위에서부터 하나씩 누르세요. 환급금을 받을 내 지갑이 자동으로 '
                + '만들어져요. 따로 설치할 것은 없어요.', null],
            unknown: ['결과를 확인하지 못했어요', '방금 요청이 처리됐는지 알 수 없어요. 같은 버튼을 다시 누르지 말고 진행 담당자에게 '
                + '알려 주세요. 지금 상태는 아래 버튼으로 볼 수 있어요.', '최신 상태 불러오기'],
            lost: ['연결이 끊겼어요', '이 환급 신청은 처음 연결한 화면에서만 이어 갈 수 있어요. 다시 로그인하거나 새로고침하지 '
                + '말고 진행 담당자에게 알려 주세요.', null],
            notaccepted: ['다시 확인이 필요해요',
                '방금 요청은 기록되지 않았어요. 최신 상태를 불러온 뒤 다시 진행해 주세요.', '최신 상태 불러오기'],
            failure: ['잠깐 문제가 있었어요', '최신 상태를 다시 불러와 주세요.', '최신 상태 불러오기'],
            load: ['내 진행 상황을 불러올게요', '버튼을 누르면 지금 해야 할 일을 알려 드려요.', '불러오기'],
            apply: ['환급을 신청해요', '신청하면 CLEAR가 Moodle과 HackerRank 기록을 보고 네 가지 조건을 대신 확인해요. '
                + '신청한다고 돈이 나가지는 않아요.', '환급 신청하기'],
            bind: ['조건 확인을 시작해요',
                '버튼을 누르면 CLEAR가 Moodle과 HackerRank 기록을 읽기 시작해요. 이 단계에서는 돈이 나가지 않아요.',
                '조건 확인 시작하기'],
            refresh: ['최신 상태를 불러올게요', '방금 한 일이 반영됐는지 확인해요.', '불러오기'],
            'cert-start': ['HackerRank 인증서를 확인해요', 'Python 인증서를 받은 내 HackerRank 계정을 CLEAR가 확인해요. '
                + '버튼을 누르면 확인용 서명 → HackerRank 로그인 순서로 진행돼요.', 'HackerRank 인증 시작하기'],
            'cert-read': ['서명할 내용을 확인해요', '이 서명은 "인증서 확인에 동의해요"라는 표시예요. 돈이 나가지 않아요.',
                '서명할 내용 보기'],
            'cert-sign': ['확인했으면 서명해요', '서명은 확인 도장을 찍는 것과 같아요. 돈이 나가지 않아요.', '서명하기'],
            'cert-prep': ['서명할 내용을 준비하고 있어요', 'HackerRank 인증을 시작했어요. 곧 확인용 서명 단계가 나와요. '
                + '자동으로 확인하고 있으니 잠시만 기다려 주세요.', '확인하기'],
            'cert-wait': ['새 창에서 HackerRank에 로그인해 주세요', '로그인하면 CLEAR가 인증서를 가져와 확인해요. 보통 1~2분 '
                + '걸려요. 끝났으면 아래 버튼을 눌러 보세요.', '확인됐는지 보기'],
            'register-read': ['네 가지 조건을 모두 마쳤어요', '이제 환급금 100 TEST를 받을 내 지갑을 확인할 차례예요.',
                '받을 지갑 확인하기'],
            'register-confirm': ['받을 지갑 서명을 마쳤어요', '동의 단계로 넘어가기 전에 서명이 잘 기록됐는지 확인할게요.',
                '서명 기록 확인하기'],
            'register-check': ['받을 지갑을 다시 확인해요', '지갑 확인 상태를 새로 불러와요.', '받을 지갑 확인하기'],
            'register-sign': ['환급금을 받을 곳을 확인해요', '아래 내용이 맞으면 서명하세요. 서명은 "이 지갑으로 받을게요"라는 '
                + '확인 도장이에요. 돈이 나가지 않아요.', '확인하고 서명하기'],
            consent: ['결과에 동의해요', '네 가지 조건을 모두 충족했어요. 학생과 선생님이 둘 다 동의하면 100 TEST가 지급돼요.',
                '동의하기'],
            'wait-operator': ['선생님 확인을 기다리고 있어요', '학생 동의는 끝났어요. 선생님이 동의하면 바로 지급이 시작돼요.',
                '최신 상태 확인하기'],
            receipt: ['지급을 확인해요', '학생과 선생님 모두 동의했어요. 내 지갑에 100 TEST가 들어왔는지 확인해 볼게요.',
                '지급 확인하기'],
            'receipt-wait': ['지급을 처리하고 있어요', '조금 뒤에 다시 확인해 주세요.', '다시 확인하기'],
            paid: ['100 TEST를 보냈어요', '내 지갑에 100 TEST가 들어온 것을 블록체인 기록으로 확인했어요. 기록이 완전히 '
                + '확정되기까지는 조금 더 걸릴 수 있어요.', '다시 확인하기'],
        };
        // Loading cards: what is happening right now, how long, and whether the student must act.
        const reading = ['내 진행 상황을 불러오는 중이에요', 'Moodle과 CLEAR 서버에서 최신 기록을 가져오고 있어요. 보통 몇 초면 끝나요.', null];
        const signing = (what) => ['서명 창을 확인해 주세요', '화면에 뜬 서명 창에서 내용을 보고 「서명」을 눌러 주세요. ' + what,
            '돈은 나가지 않아요. 확인 도장만 찍는 거예요.'];
        const operatorReading = ['학생 진행 상황을 불러오는 중이에요', 'Moodle과 CLEAR 서버에서 최신 기록을 가져오고 있어요. '
            + '보통 몇 초면 끝나요.', null];
        const operatorBusy = {
            'read-session': operatorReading, 'read-application': operatorReading, 'decision-evidence': operatorReading,
            'read-operation': operatorReading,
            'approve-reflection': ['MetaMask 서명 창을 확인해 주세요', 'MetaMask 창에서 내용을 보고 「서명」을 눌러 주세요. "학생 회고 글 '
                + '1개를 AI로 검토하는 비용을 승인해요"라는 확인이에요.', 'TEST 지급과는 별개예요. 승인하면 AI 검토가 1회 실행돼요.'],
            consent: ['MetaMask 서명 창을 확인해 주세요', 'MetaMask 창에서 「서명」을 눌러 주세요. "이 결과대로 지급하는 데 동의해요"라는 '
                + '확인이에요.', '이 동의가 마지막 단계예요. 동의하면 금고에 묶인 100 TEST가 학생 지갑으로 지급돼요.'],
            'payment-receipt': ['블록체인에서 지급을 확인하는 중이에요', '공용 기록장(블록체인)에서 100 TEST가 금고에서 학생 지갑으로 '
                + '갔는지 직접 확인하고 있어요.', null],
            wallet: ['지갑을 준비하는 중이에요', 'MetaMask 연결을 처리하고 있어요. MetaMask 창이 뜨면 안내를 따라 승인해 주세요.', null],
        };
        const busyText = {
            'read-session': reading, 'read-application': reading, 'decision-evidence': reading, 'read-operation': reading,
            'create-application': ['환급 신청서를 만드는 중이에요', '신청 기록을 안전하게 남기고 있어요. 잠시만 기다려 주세요.', null],
            'bind-source-session': ['조건 확인을 준비하는 중이에요', '내 신청과 Moodle 기록을 연결하고 있어요.', null],
            'start-certificate': ['HackerRank 인증을 준비하는 중이에요', '잠시 뒤 확인용 서명 단계가 나와요.', null],
            'read-source-signature': ['서명할 내용을 불러오는 중이에요', '곧 서명할 내용을 보여 드릴게요.', null],
            'read-registration': ['받을 지갑 정보를 불러오는 중이에요', '환급금을 받을 내 지갑 정보를 확인하고 있어요.', null],
            'approve-source-signature': signing('"인증서 확인에 동의해요"라는 표시예요.'),
            'approve-registration': signing('"이 지갑으로 받을게요"라는 확인이에요.'),
            consent: signing('"결과에 동의해요"라는 확인이에요.'),
            'payment-receipt': ['블록체인에서 지급을 확인하는 중이에요',
                '누구도 고칠 수 없는 공용 기록장(블록체인)에서 100 TEST가 내 지갑에 들어왔는지 직접 확인하고 있어요.', null],
            wallet: ['지갑을 준비하는 중이에요', '로그인과 지갑 연결을 처리하고 있어요. 새 창이 열리면 안내를 따라 주세요.', null],
        };
        const glossary = {
            wallet: ['지갑이 뭔가요?', '디지털 돈을 받는 내 계좌 같은 거예요. Google로 로그인할 때 자동으로 만들어져서 '
                + '따로 설치하거나 외울 것이 없어요.'],
            address: ['0x로 시작하는 긴 글자는 뭔가요?', '지갑마다 붙는 계좌번호 같은 번호예요. 너무 길어서 끝 네 자리만 '
                + '보여 드려요. 끝자리가 같으면 내 지갑이 맞아요.'],
            signature: ['서명은 뭔가요?', '"제가 확인했어요"라고 도장을 찍는 것과 같아요. 서명한다고 돈이 빠져나가지 않아요.'],
            test: ['TEST는 뭔가요?', '이 시연에서 쓰는 디지털 포인트예요. 실제 돈이 아니에요.'],
            blockchain: ['블록체인은 뭔가요?', '누구도 몰래 고칠 수 없는 공용 기록장이에요. 지급했다는 기록이 여기에 남아서 '
                + '나중에도 누구나 확인할 수 있어요.'],
            final: ['"확정까지 조금 더"는 무슨 뜻인가요?', '기록이 완전히 굳어지는 데 시간이 조금 더 걸린다는 뜻이에요. '
                + '금액은 이미 내 지갑에 들어와 있어요.'],
            consent: ['왜 둘 다 동의해야 하나요?', '학생과 선생님이 같은 결과를 보고 둘 다 "맞아요"라고 해야 지급돼요. '
                + '한쪽이 마음대로 지급하거나 막을 수 없어요.'],
            hackerrank: ['HackerRank 인증은 어떻게 확인하나요?', 'HackerRank 사이트에 직접 로그인하면 CLEAR가 그곳의 '
                + '인증서 정보를 가져와 확인해요. 사진이나 파일을 올릴 필요가 없어요.'],
            ai: ['회고는 누가 확인하나요?', 'AI가 회고 글에 수행 내용·문제 해결 과정·배운 점이 있는지만 확인해요. '
                + '선생님이 승인해야 AI 확인이 시작돼요.'],
            conditions: ['CLEAR는 무엇을 확인하나요?', '강의 수강, 과제 제출, 회고 작성, HackerRank Python 인증 네 가지예요. '
                + 'Moodle과 HackerRank 기록으로 확인해서 따로 올릴 서류는 없어요.'],
        };
        Object.assign(glossary, {
            metamask: ['MetaMask는 뭔가요?', '선생님(운영자)용 지갑 앱이에요. 이 강좌의 시연용 네트워크를 추가하고, 확인이 필요할 때 '
                + '서명 창을 띄워요.'],
            aiOp: ['회고 AI는 무엇을 하나요?', '학생 회고 글에 수행 내용·문제 해결 과정·배운 점이 있는지만 확인해요. 점수를 매기거나 '
                + '지급을 결정하지 않고, 지급 키도 없어요.'],
            aiCost: ['왜 선생님이 승인하나요?', '학생 글을 외부 AI로 보내고 비용이 드는 일이라, 정확한 입력·모델·비용을 선생님이 '
                + '확인하고 1회만 승인해요.'],
            signatureOp: ['서명은 뭔가요?', 'MetaMask로 "제가 확인했어요"라고 도장을 찍는 거예요. 무엇에 동의하는지는 서명 창과 '
                + '원본 기록에서 확인할 수 있어요.'],
            escrow: ['금고(에스크로)는 뭔가요?', '교육기관이 미리 넣어 둔 환급금이 잠겨 있는 곳이에요. 시연 컨트랙트에서는 조건을 채운 '
                + '학생에게 지급하는 것 말고는 꺼낼 수 없어요.'],
        });
        const operatorHelp = {connect: ['metamask'], load: ['metamask'], 'op-wait-apply': ['conditions'],
            'op-conditions': ['aiOp', 'conditions'], 'op-ai': ['aiCost', 'aiOp'], 'op-wait-student': ['consent'],
            'op-consent': ['consent', 'escrow', 'signatureOp'], receipt: ['blockchain', 'escrow'], 'receipt-wait': ['blockchain'],
            paid: ['blockchain', 'test']};
        const helpFor = {connect: ['wallet'], apply: ['conditions', 'test'], bind: ['conditions'], conditions: ['ai', 'conditions'],
            'cert-start': ['hackerrank', 'signature'], 'cert-read': ['signature'], 'cert-sign': ['signature'],
            'cert-prep': ['hackerrank'], 'cert-wait': ['hackerrank'], 'register-confirm': ['signature'], 'register-read': ['wallet', 'test'], 'register-sign': ['wallet', 'address', 'signature', 'test'],
            consent: ['consent', 'signature'], 'wait-operator': ['consent'], receipt: ['blockchain'], 'receipt-wait': ['blockchain'],
            paid: ['blockchain', 'final', 'test']};
        const waiting = new Set(['busy', 'cert-prep', 'cert-wait', 'wait-operator', 'receipt-wait', 'op-wait-apply',
            'op-wait-student']);
        const tail = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) ? value.slice(-4) : null;
        const guideContent = step => {
            const steps = participant ? null : operatorSteps();
            const help = ((participant ? helpFor : operatorHelp)[step.key] ?? []).map(key => glossary[key]);
            if (step.key === 'busy') {
                const [title, body, hint] = (participant ? busyText : {...busyText, ...operatorBusy})[step.busy]
                    ?? (participant ? reading : operatorReading);
                return {kicker: hint ? '지금 할 일' : '진행 중', title, body, hint, button: null, facts: [], raw: null,
                    help: [], track: null, spin: true, steps, ack: false};
            }
            if (step.key === 'op-conditions') {
                const rows = application.criteria;
                const left = rows.filter(row => row.state !== 'MET');
                const names = left.map(row => criterionLabels[row.criterionId] ?? row.criterionId).join(', ');
                return {kicker: '지금 할 일', title: '학생 조건을 확인하고 있어요 (' + (rows.length - left.length) + '/' + rows.length + ')',
                    body: '남은 조건: ' + names + '. 학생이 HackerRank 확인까지 마치면 선생님의 회고 AI 검토 승인 차례가 와요. '
                        + '학생이 마쳤다고 하면 아래 버튼을 눌러 주세요.',
                    hint: null, button: '최신 상태 확인하기', facts: [], raw: null, help, spin: false, steps, ack: false,
                    track: rows.map(row => [criterionLabels[row.criterionId] ?? row.criterionId, row.state === 'MET'])};
            }
            if (step.key === 'conditions') {
                const rows = application.criteria;
                const left = rows.filter(row => row.state !== 'MET');
                const names = left.map(row => criterionLabels[row.criterionId] ?? row.criterionId).join(', ');
                const reflectionLeft = left.some(row => row.criterionId === 'reflection-topics');
                return {kicker: '지금 할 일', title: '조건을 확인하고 있어요 (' + (rows.length - left.length) + '/' + rows.length + ')',
                    body: '남은 조건: ' + names + '. 아래 목록에서 할 일을 확인하세요.'
                        + (reflectionLeft ? ' 회고는 선생님이 AI 확인을 승인하면 검토돼요.' : ''),
                    hint: null, button: '최신 상태 확인하기', facts: [], raw: null, help, spin: false, steps, ack: false,
                    track: rows.map(row => [criterionLabels[row.criterionId] ?? row.criterionId, row.state === 'MET'])};
            }
            const [title, body, button] = (participant ? guideText : {...guideText, ...operatorText})[step.key];
            const facts = [];
            let raw = null;
            if (step.key === 'op-ai') {
                const ends = new Date(Number(reflection.approvalWindowEndsAtMs));
                facts.push(['검토할 글', '학생 회고 글 1개']);
                facts.push(['AI 모델', String(reflection.model ?? label('unconfirmed'))]);
                facts.push(['비용 상한(예상)', reflection.scenarioUsd == null ? label('unconfirmed') : reflection.scenarioUsd + ' USD']);
                facts.push(['승인 마감', Number.isNaN(ends.getTime()) ? label('unconfirmed') : ends.toLocaleTimeString('ko-KR')]);
                raw = format('reflection', reflection);
            }
            if (step.key === 'op-consent') {
                facts.push(['조건', '네 가지 모두 충족']);
                facts.push(['지급 금액', amount(application?.agreedPayment) + ' (시연용 포인트)']);
                facts.push(['받는 곳', '학생이 직접 서명해 등록한 지갑']);
                raw = displayed.application ? format('application', displayed.application) : null;
            }
            if (step.key === 'register-sign') {
                const end = tail(registration?.payload?.message?.recipient);
                facts.push(['받는 곳', '내 CLEAR 지갑 (Google 로그인으로 만든 지갑)']);
                facts.push(['지갑 번호 끝자리', end ?? label('unconfirmed')]);
                facts.push(['받는 금액', amount(application?.agreedPayment) + ' (시연용 포인트, 실제 돈 아님)']);
                raw = displayed.registration ? format('registration', displayed.registration) : null;
            }
            if (step.key === 'cert-sign') {
                raw = typeof source?.message === 'string' ? source.message : null;
            }
            if (step.key === 'paid') {
                const end = tail(receipt?.expectedPayment?.recipient);
                facts.push([participant ? '받은 곳' : '보낸 곳', (participant ? '내 CLEAR 지갑' : '학생 지갑')
                    + (end ? ' (번호 끝자리 ' + end + ')' : '')]);
                facts.push(['받은 금액', amount(receipt?.expectedPayment)]);
                if (typeof receipt?.claim?.transactionHash === 'string') {
                    raw = '블록체인 기록 번호(거래 해시): ' + receipt.claim.transactionHash;
                }
            }
            return {kicker: '지금 할 일', title, body, hint: null, button, facts, raw, help, track: null,
                spin: waiting.has(step.key), steps, ack: step.key === 'op-ai'};
        };
        const runGuide = async step => {
            const go = async actions => {
                for (const action of actions) {
                    if (!await run(action, step.choice)) {
                        return false;
                    }
                }
                return true;
            };
            if (await go(step.actions) || step.actions.some(action => writes.has(action))) {
                return;
            }
            // Read-only steps get ONE automatic retry after a short pause (never writes). A failed read
            // clears the page state, so the retry starts again from read-session. A disconnect (401/403)
            // leaves ready=false and stops here.
            await new Promise(resolve => setTimeout(resolve, 1500));
            if (closed || !ready || unknown || pending || walletBusy || lastStatus !== 'failure') {
                return;
            }
            await go(step.actions[0] === 'read-session' ? step.actions : ['read-session', ...step.actions]);
        };
        const paintGuide = () => {
            if (!guideRoot) {
                return;
            }
            const step = participant ? guideStep() : operatorStep();
            guideStepNow = step;
            root.classList?.toggle('clear-simple', simple);
            if (root.dataset) {
                root.dataset.guideStep = step.key;
            }
            const content = guideContent(step);
            const signature = JSON.stringify([step.key, step.actions, content, simple]);
            if (signature !== guideSignature) {
                guideSignature = signature;
                const doc = guideRoot.ownerDocument;
                const node = (tag, className, text) => {
                    const element = doc.createElement(tag);
                    element.className = className;
                    if (text != null) {
                        element.textContent = text;
                    }
                    return element;
                };
                const box = node('div', 'clear-guide');
                box.setAttribute('data-guide-key', step.key);
                const head = node('div', 'clear-guide-head');
                if (content.spin) {
                    const spinner = node('span', 'clear-guide-spinner');
                    spinner.setAttribute('aria-hidden', 'true');
                    head.append(spinner);
                }
                const heading = node('div', 'clear-guide-heading');
                heading.append(node('p', 'clear-guide-kicker', content.kicker), node('h2', 'clear-guide-title', content.title));
                head.append(heading);
                if (content.steps) {
                    const steps = node('ol', 'clear-guide-steps');
                    steps.setAttribute('aria-label', '선생님 진행 단계');
                    steps.append(...content.steps.map(([name, state]) => {
                        const item = node('li', 'clear-guide-step', name);
                        item.setAttribute('data-state', state);
                        if (state === 'now') {
                            item.setAttribute('aria-current', 'step');
                        }
                        return item;
                    }));
                    box.append(steps);
                }
                box.append(head, node('p', 'clear-guide-body', content.body));
                if (content.hint) {
                    box.append(node('p', 'clear-guide-hint', content.hint));
                }
                if (content.track) {
                    const track = node('ol', 'clear-guide-track');
                    track.append(...content.track.map(([name, done]) => {
                        const item = node('li', 'clear-guide-track-item', (done ? '✓ ' : '') + name);
                        item.setAttribute('data-done', done ? 'yes' : 'no');
                        return item;
                    }));
                    box.append(track);
                }
                if (content.facts.length) {
                    const list = node('dl', 'clear-guide-facts');
                    for (const [name, value] of content.facts) {
                        const row = node('div', 'clear-guide-fact');
                        row.append(node('dt', 'clear-guide-fact-name', name), node('dd', 'clear-guide-fact-value', value));
                        list.append(row);
                    }
                    box.append(list);
                }
                if (content.help.length) {
                    const [first, ...rest] = content.help;
                    const tip = node('div', 'clear-guide-tip');
                    tip.append(node('p', 'clear-guide-tip-q', first[0]), node('p', 'clear-guide-tip-a', first[1]));
                    box.append(tip);
                    if (rest.length) {
                        const more = node('details', 'clear-guide-help');
                        more.append(node('summary', 'clear-guide-help-title', '쉬운 설명 더 보기'));
                        for (const [question, answer] of rest) {
                            more.append(node('p', 'clear-guide-tip-q', question), node('p', 'clear-guide-tip-a', answer));
                        }
                        box.append(more);
                    }
                }
                if (content.raw) {
                    const more = node('details', 'clear-guide-raw');
                    more.append(node('summary', 'clear-guide-raw-title', '원본 기록 보기 (전문가용)'),
                        node('pre', 'clear-guide-raw-text', content.raw));
                    box.append(more);
                }
                guideAck = null;
                if (content.ack) {
                    // Mirrors the page's own reviewed-cost acknowledgment checkbox (the only input approve-reflection needs).
                    const label = node('label', 'clear-guide-ack');
                    guideAck = node('input', 'clear-guide-ack-box');
                    guideAck.type = 'checkbox';
                    guideAck.checked = acknowledgment.checked === true;
                    guideAck.addEventListener('change', () => {
                        acknowledgment.checked = guideAck.checked === true;
                        render();
                    });
                    label.append(guideAck, node('span', 'clear-guide-ack-text', '검토할 글·AI 모델·비용을 확인했고, 이 1회 검토를 승인해요'));
                    box.append(label);
                }
                guideButton = null;
                if (content.button && step.actions.length) {
                    guideButton = node('button', 'clear-guide-go', content.button);
                    guideButton.type = 'button';
                    guideButton.setAttribute('data-guide-action', step.actions[0]);
                    guideButton.addEventListener('click', () => {
                        const current = guideStepNow;
                        if (current?.key === step.key && current.actions.length && enabled(current.actions[0])) {
                            void runGuide(current);
                        }
                    });
                    box.append(guideButton);
                }
                const toggle = node('button', 'clear-guide-toggle', simple ? '모든 단계와 기술 정보 보기' : '간단히 보기');
                toggle.type = 'button';
                toggle.setAttribute('aria-pressed', simple ? 'false' : 'true');
                toggle.addEventListener('click', () => {
                    simple = !simple;
                    render();
                });
                box.append(toggle);
                guideRoot.replaceChildren(box);
            }
            if (guideAck) {
                guideAck.checked = acknowledgment.checked === true;
                guideAck.disabled = closed || !ready || walletBusy || !!pending || unknown || reflection?.permitted !== true;
            }
            if (guideButton) {
                guideButton.disabled = !step.actions.length || !enabled(step.actions[0]);
            }
        };
        // Operator-only notice: once the right is accepted on chain (or both sides agreed, which makes the
        // server ACCEPT), amount, recipient and decision are fixed. Display only: no server or chain calls.
        let lockSignature = null;
        const paintLockNotice = () => {
            if (!lockRoot || participant) {
                return;
            }
            const view = application?.applicationId === applicationId ? application : null;
            const agreed = role => !!view?.consent?.records?.some(row => row.actorRole === role && row.value === 'AGREE');
            const locked = !closed && ready && !unknown && !!applicationId && !!view
                && (!!view.payment?.acceptedRight || agreed('PARTICIPANT') && agreed('COURSE_OPERATOR'));
            lockRoot.hidden = !locked;
            const text = locked ? amount(view.agreedPayment) : null;
            if (text === lockSignature) {
                return;
            }
            lockSignature = text;
            if (!locked) {
                lockRoot.replaceChildren();
                return;
            }
            const doc = lockRoot.ownerDocument;
            const node = (tag, className, value) => {
                const element = doc.createElement(tag);
                element.className = className;
                if (value != null) {
                    element.textContent = value;
                }
                return element;
            };
            const box = node('div', 'clear-lock');
            const link = node('a', 'clear-lock-link', '블록체인에서 직접 확인');
            link.setAttribute('href', 'http://127.0.0.1:9480/#attempts');
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            box.append(node('p', 'clear-lock-title', '🔒 이 환급은 블록체인에 확정됐어요'),
                node('p', 'clear-lock-body', '학생과 선생님이 모두 동의해 지급 권리가 블록체인에 기록됐어요. 금액(' + text
                    + ')·받는 사람(학생이 서명한 지갑)·판정은 이제 누구도 바꿀 수 없어요. 이 화면에서 고치는 조건은 다음 개설용 초안이에요.'),
                link);
            lockRoot.replaceChildren(box);
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
            paintUx();
            paintGuide();
            paintLockNotice();
            paintCards();
        };
        const disconnect = () => {
            consentChangedFrom = null;
            if (pending?.write) {
                unknown = true;
            }
            pending = null;
            ready = false;
            certificateRevision = null;
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
        const retainCertificateRevision = result => {
            const row = result?.record;
            certificateRevision = null;
            if (row?.applicationId !== applicationId || result.current !== true
                    || !Number.isSafeInteger(row.applicationRevision) || row.applicationRevision <= 0) {
                return;
            }
            if (certificateRevisionFloor?.applicationId === applicationId
                    && row.applicationRevision < certificateRevisionFloor.revision) {
                return;
            }
            certificateRevision = {applicationId, revision: row.applicationRevision};
            certificateRevisionFloor = certificateRevision;
        };
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
                    if (certificateRevision?.applicationId !== applicationId) {
                        certificateRevision = null;
                    }
                    if (certificateRevisionFloor?.applicationId !== applicationId) {
                        certificateRevisionFloor = null;
                    }
                    activityMode = activityTargets()?.targets.length === 1;
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
                    retainCertificateRevision(result);
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
                    if (input.action === 'approve-registration') {
                        signedRegistrationFor = applicationId;
                    }
                    break;
                case 'approve-reflection':
                    exactApp(result);
                    require(result.version === 'clear-normal-ai-approval-receipt.1'
                        && result.runBindingHash === input.reviewed.runBindingHash && result.status === 'RECORDED'
                        && result.paymentConsentIncluded === false);
                    displayed.reflection = result;
                    aiApprovedFor = applicationId;
                    break;
                case 'payment-receipt':
                    exactApp(result);
                    require(result.version === 'clear-bootcamp-normal-payment-receipt.1'
                        && result.role === (participant ? 'PARTICIPANT' : 'OPERATOR'));
                    displayed.receipt = {state: result.claim?.state, finalized: result.claim?.finalized};
                    receipt = result;
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
                    if (operation.kind === 'application') {
                        retainCertificateRevision(result);
                    }
                    displayed.operation = {...operation, current: result.current};
                    break;
            }
        };

        const command = (action, choice) => {
            switch (action) {
                case 'create-application': return {action, idempotencyKey: newKey()};
                case 'refresh-activity': return {action, applicationId, expectedRevision: choice.revision, idempotencyKey: newKey(),
                    ...(choice.criterionId === 'assignment-submitted' ? {criterionId: choice.criterionId} : {})};
                case 'start-certificate': return {action, applicationId, expectedRevision: certificateCasRevision(), idempotencyKey: newKey()};
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
            const task = {write: writes.has(action), session, action};
            pending = task;
            if (['read-session', 'read-application', 'decision-evidence'].includes(action)) {
                decisionSnapshot = null;
            }
            if (action === 'start-certificate') {
                certificateAttempted = true;
            }
            if (action === 'create-application') {
                createAttempted = true;
            }
            if (task.write) {
                decisionSnapshot = null;
                if (action !== 'bind-source-session') {
                    certificateRevision = null;
                }
                // A write can invalidate every earlier review packet and receipt observation.
                application = registration = source = reflection = receipt = null;
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
                if (action === 'read-application') {
                    retainViewRevision(result, task.session);
                    noteConsentChanges(result);
                }
                if (action === 'read-session' && pairedMode()) {
                    const boundSession = session;
                    const app = applicationId;
                    const current = () => pending === task && ready && !closed && !walletBusy
                        && session === boundSession && applicationId === app && pairedMode();
                    const view = await invoke({action: 'read-application', applicationId: app});
                    if (!current()) { return; }
                    const decision = view?.decision;
                    require(view?.version === 'clear-bootcamp-normal-view.1' && view.displayOnly === true
                        && view.applicationId === app && view.role === 'PARTICIPANT' && view.target
                        && view.agreedPayment && Array.isArray(view.criteria)
                        && id(decision?.id) && Number.isSafeInteger(decision.revision) && decision.revision > 0
                        && typeof decision.hash === 'string' && decision.hash !== '' && decision.current === true);
                    const evidence = await invoke({action: 'decision-evidence', applicationId: app});
                    if (!current()) { return; }
                    const target = evidence?.manifest?.decision;
                    require(evidence?.version === 'clear-bootcamp-decision-evidence.1'
                        && evidence.applicationId === app && evidence.role === 'PARTICIPANT'
                        && evidence.manifest.version === 'clear-bootcamp-evidence-manifest.1'
                        && evidence.manifest.applicationId === app
                        && target?.decisionId === decision.id && target.decisionRevision === decision.revision
                        && target.decisionHash === decision.hash
                        && evidence.currentDecision?.decisionId === decision.id
                        && evidence.currentDecision.applicationActive === true
                        && evidence.currentDecision.matchesRequestedDecision === true
                        && Array.isArray(evidence.manifest.criteria) && Array.isArray(evidence.availability));
                    const criteria = certificateCompleted() ? ['python-basic-certificate']
                        : ['activity-complete', 'assignment-submitted', 'reflection-topics'];
                    for (const criterionId of criteria) {
                        const rows = view.criteria.filter(item => item.criterionId === criterionId);
                        const records = evidence.manifest.criteria.filter(item => item.criterionId === criterionId);
                        const availability = evidence.availability.filter(item => item.criterionId === criterionId);
                        require(rows.length === 1 && records.length === 1 && availability.length === 1);
                        const [row] = rows, [recorded] = records, [available] = availability;
                        require(['MET', 'NOT_MET', 'MISSING', 'UNKNOWN'].includes(row.state)
                            && typeof row.current === 'boolean' && recorded.state === row.state
                            && recorded.evidenceId === row.evidenceId && available.evidenceId === row.evidenceId
                            && recorded.evidenceRevision === row.evidenceRevision);
                        if (row.state === 'MET' || certificateCompleted()) {
                            require(row.state === 'MET' && row.current === true && id(row.evidenceId)
                                && Number.isSafeInteger(row.evidenceRevision) && row.evidenceRevision > 0
                                && recorded.metadataStatus === 'RECORDED' && available.status === 'VALID_AS_RECORDED');
                        }
                    }
                    application = view;
                    displayed.application = view;
                    noteConsentChanges(view);
                    displayed.evidence = evidence;
                    decisionSnapshot = {session: boundSession, view, evidence};
                    retainViewRevision(view, boundSession);
                }
                succeeded = true;
                show('success');
                return result;
            } catch (error) {
                if (pending !== task) {
                    return;
                }
                const reviewChanged = input.action === 'approve-reflection'
                    && error?.code === 'MOODLE_AI_REVIEW_CHANGED' && error?.outcome === 'NOT_SENT';
                // Only a definite server rejection (nothing recorded) unlocks a manual re-read and retry.
                const notAccepted = error?.serverEffect === 'NOT_ACCEPTED'
                    && (input.action === 'start-certificate' && error?.code === 'MOODLE_CERTIFICATE_REVIEW_CHANGED'
                        || input.action === 'consent' && error?.code === 'MOODLE_CONSENT_REVIEW_CHANGED');
                clear();
                certificateRevision = null;
                unknown ||= task.write && !reviewChanged && !notAccepted;
                if (notAccepted && input.action === 'start-certificate') {
                    certificateAttempted = false;
                }
                if (notAccepted && input.action === 'consent') {
                    consentChangedFrom = input.reviewed;
                }
                show(notAccepted ? 'notaccepted' : 'failure');
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
            if (certificateCompleted()) {
                await cardRead('read-session');
                return {view: activityView()};
            }
            if (activityVisit) {
                const visit = activityVisit;
                if (!enabled('refresh-activity')) {
                    throw new Error('TEST_BUSY_OR_ENDED');
                }
                activityVisit = null;
                if (visit.applicationId === applicationId) {
                    if (visit.session !== session) { throw new Error('CLEAR_WORKFLOW_UNAVAILABLE'); }
                    const result = await run('refresh-activity', visit);
                    if (!result) {
                        throw new Error('CLEAR_WORKFLOW_UNAVAILABLE');
                    }
                }
            }
            await cardRead(moodleMode() ? 'read-session' : 'read-application');
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
                loadEvidence: snapshot => pairedMode()
                    ? decisionSnapshot?.session === session && snapshot.applicationId === applicationId
                        ? Promise.resolve(decisionSnapshot.evidence) : Promise.reject(new Error('CLEAR_WORKFLOW_UNAVAILABLE'))
                    : cardRead('decision-evidence', snapshot.applicationId),
                targets: () => canVisit() ? activityTargets() : null,
                // The original page stays mounted while a reviewed link opens a new tab.
                storage: panels.memoryStore(),
                onOpen: () => root.querySelector('#clearbridge-decision-heading')?.scrollIntoView(),
                onChange: paintCards,
            });
        };
        // Capture before the target tracker queues a card replacement between event listeners.
        const captureVisit = event => {
            const link = event.target.closest?.('a.crc-go');
            if (link && cardRoot?.contains(link) && ready && canVisit() && !unknown) {
                const target = activityTargets().targets.find(item => link.href === origin
                    + '/mod/' + item.module + '/view.php?id=' + item.cmId);
                if (target) {
                    activityVisit = null;
                }
                if (target && target.criterionId !== 'reflection-topics') {
                    activityVisit = {session, applicationId, revision: revision(), criterionId: target.criterionId};
                    activityResult = null;
                }
            }
        };
        const click = event => {
            const button = event.target.closest?.('[data-workflow-action]');
            if (buttons.includes(button)) {
                return run(button.dataset.workflowAction, button.dataset.workflowChoice);
            }
        };
        root.addEventListener('click', captureVisit, true);
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
                root.removeEventListener('click', captureVisit, true);
                root.removeEventListener('click', click);
                acknowledgment.removeEventListener('change', render);
            },
        };
    };
    return {create};
});
