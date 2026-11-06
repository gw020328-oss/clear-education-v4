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
                if (result && ['START_ACCEPTED', 'SIGNATURE_ACCEPTED'].includes(certificate()?.state)) {
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
        let simple = participant;
        let guideSignature = null;
        let guideButton = null;
        let guideStepNow = null;
        const metAll = view => view?.decision?.conditionsStatus === 'MET' || (Array.isArray(view?.criteria)
            && view.criteria.length >= 4 && view.criteria.every(row => row.state === 'MET'));
        const agreedBy = (view, role) => !!view?.consent?.records?.some(row => row.actorRole === role);
        const shortAddress = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
            ? value.slice(0, 6) + '…' + value.slice(-4) : null;
        const refreshActions = () => pairedMode() ? ['read-session'] : ['read-session', 'read-application'];
        const guideStep = () => {
            if (!ready) {
                return {key: 'connect', actions: []};
            }
            if (pending || walletBusy) {
                return {key: 'busy', actions: []};
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
            const cert = certificate();
            if (cert?.state === 'READY_TO_START' && enabled('start-certificate')) {
                return {key: 'cert-start', actions: ['start-certificate']};
            }
            if (cert?.state === 'AWAITING_SIGNATURE') {
                return source ? {key: 'cert-sign', actions: ['approve-source-signature']}
                    : {key: 'cert-read', actions: ['read-source-signature']};
            }
            if (cert && ['START_ACCEPTED', 'SIGNATURE_ACCEPTED'].includes(cert.state)) {
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
            return {key: registration ? 'register-check' : 'register-read', actions: ['read-registration']};
        };
        const guideText = {
            connect: ['Google 계정으로 시작해요',
                '아래 버튼을 위에서부터 하나씩 누르세요. 환급금을 받을 지갑이 자동으로 만들어져요.', null],
            busy: ['처리하고 있어요', '잠시만 기다려 주세요.', null],
            unknown: ['결과를 확인하지 못했어요',
                '요청이 처리됐는지 알 수 없어요. 같은 버튼을 다시 누르지 말고 진행 담당자에게 알려 주세요.', '최신 상태 불러오기'],
            notaccepted: ['다시 확인이 필요해요',
                '방금 요청은 기록되지 않았어요. 최신 상태를 불러온 뒤 다시 진행해 주세요.', '최신 상태 불러오기'],
            failure: ['잠깐 문제가 있었어요', '최신 상태를 다시 불러와 주세요.', '최신 상태 불러오기'],
            load: ['내 진행 상황을 불러올게요', '버튼을 누르면 지금 해야 할 일을 알려 드려요.', '불러오기'],
            apply: ['환급을 신청해요',
                '신청하면 CLEAR가 Moodle과 HackerRank 기록으로 네 가지 조건을 확인해요.', '환급 신청하기'],
            refresh: ['최신 상태를 불러올게요', '방금 한 일이 반영됐는지 확인해요.', '불러오기'],
            'cert-start': ['HackerRank 인증서를 가져와요',
                '버튼을 누르고 안내에 따라 서명하면, 새 창에서 HackerRank에 로그인하게 돼요.', 'HackerRank 인증 시작하기'],
            'cert-read': ['서명할 내용을 확인해요', '이 서명은 인증서를 확인하는 데만 쓰여요. 돈이 나가지 않아요.',
                '서명할 내용 보기'],
            'cert-sign': ['확인했으면 서명해요', '아래 내용이 맞으면 서명하세요. 돈이 나가지 않아요.', '서명하기'],
            'cert-wait': ['새 창에서 HackerRank에 로그인해 주세요',
                '로그인을 마치면 CLEAR가 인증서를 자동으로 확인해요. 끝났으면 아래 버튼을 눌러 보세요.', '확인됐는지 보기'],
            'register-read': ['네 가지 조건을 모두 마쳤어요', '이제 100 TEST를 받을 지갑을 확인할 차례예요.', '받을 지갑 확인하기'],
            'register-check': ['받을 지갑을 다시 확인해요', '지갑 확인 상태를 새로 불러와요.', '받을 지갑 확인하기'],
            'register-sign': ['이 지갑으로 받을게요',
                '아래 지갑과 금액이 맞으면 서명하세요. 이 서명은 "이 지갑으로 받겠다"는 확인이에요.', '확인하고 서명하기'],
            consent: ['결과에 동의해요',
                '네 가지 조건을 모두 충족했어요. 동의하면 선생님 확인 뒤 100 TEST가 지급돼요.', '동의하기'],
            'wait-operator': ['선생님 확인을 기다리고 있어요', '선생님이 동의하면 지급이 시작돼요.', '최신 상태 확인하기'],
            receipt: ['지급을 확인해요', '양쪽 모두 동의했어요. 지급 기록을 확인해 볼게요.', '지급 확인하기'],
            'receipt-wait': ['지급을 처리하고 있어요', '조금 뒤에 다시 확인해 주세요.', '다시 확인하기'],
            paid: ['100 TEST를 보냈어요',
                '블록체인에 지급 기록이 남았어요. 최종 확정까지는 조금 더 걸릴 수 있어요.', '다시 확인하기'],
        };
        const guideContent = step => {
            if (step.key === 'conditions') {
                const rows = application.criteria;
                const left = rows.filter(row => row.state !== 'MET');
                const names = left.map(row => criterionLabels[row.criterionId] ?? row.criterionId).join(', ');
                const reflectionLeft = left.some(row => row.criterionId === 'reflection-topics');
                return {title: '조건을 확인하고 있어요 (' + (rows.length - left.length) + '/' + rows.length + ')',
                    body: '남은 조건: ' + names + '. 아래 카드에서 할 일을 확인하세요.'
                        + (reflectionLeft ? ' 회고는 선생님이 AI 검토를 승인하면 확인돼요.' : ''),
                    button: '최신 상태 확인하기', facts: [], raw: null};
            }
            const [title, body, button] = guideText[step.key];
            const facts = [];
            let raw = null;
            if (step.key === 'register-sign') {
                facts.push('받는 지갑: ' + (shortAddress(registration?.payload?.message?.recipient) ?? label('unconfirmed')));
                facts.push('받는 금액: ' + amount(application?.agreedPayment));
                raw = displayed.registration ? format('registration', displayed.registration) : null;
            }
            if (step.key === 'cert-sign') {
                raw = typeof source?.message === 'string' ? source.message : null;
            }
            if (step.key === 'paid' && typeof receipt?.claim?.transactionHash === 'string') {
                raw = '지급 거래 번호: ' + receipt.claim.transactionHash;
            }
            return {title, body, button, facts, raw};
        };
        const runGuide = async step => {
            for (const action of step.actions) {
                const result = await run(action, step.choice);
                if (!result) {
                    return;
                }
            }
        };
        const paintGuide = () => {
            if (!participant || !guideRoot) {
                return;
            }
            const step = guideStep();
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
                box.append(node('p', 'clear-guide-kicker', '지금 할 일'), node('h2', 'clear-guide-title', content.title),
                    node('p', 'clear-guide-body', content.body));
                if (content.facts.length) {
                    const list = node('ul', 'clear-guide-facts');
                    list.append(...content.facts.map(fact => node('li', 'clear-guide-fact', fact)));
                    box.append(list);
                }
                if (content.raw) {
                    const more = node('details', 'clear-guide-raw');
                    more.append(node('summary', 'clear-guide-raw-title', '서명·기록 원본 내용 보기'),
                        node('pre', 'clear-guide-raw-text', content.raw));
                    box.append(more);
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
            if (guideButton) {
                guideButton.disabled = !step.actions.length || !enabled(step.actions[0]);
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
            paintUx();
            paintGuide();
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
            const task = {write: writes.has(action), session};
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
