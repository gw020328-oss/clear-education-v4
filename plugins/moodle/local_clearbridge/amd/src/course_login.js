/** Moodle tab controller for the same-origin CLEAR login actions. */
define([], function() {
    'use strict';

    const isHex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const exact = (value, keys) => value !== null && typeof value === 'object'
        && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

    const init = (course, origin, sesskey) => {
        const root = document.querySelector('[data-clear-login]');
        if (!root || new URL(origin).origin !== origin || !origin.startsWith('https://')) {
            return;
        }
        const start = root.querySelector('[data-clear-start]');
        const finish = root.querySelector('[data-clear-finish]');
        const end = root.querySelector('[data-clear-end]');
        const label = root.querySelector('[data-clear-status]');
        let popup = null;
        let finishProof = null;
        let intentTarget = null;
        let phase = 'idle';
        let busy = false;
        let active = false;
        let pollUntil = 0;
        let timer;
        let handshakeTimer;
        let generation = 0;

        const render = (status) => {
            phase = status;
            const message = root.querySelector('[data-clear-message="' + status + '"]');
            label.textContent = message.textContent;
            start.hidden = !['idle', 'expired', 'restart', 'unavailable'].includes(status);
            finish.hidden = status !== 'return';
            end.hidden = !active;
            [start, finish, end].forEach(button => {
                button.disabled = busy;
            });
        };
        const action = async(operation, fields = {}) => {
            if (operation === 'status' || operation === 'end') {
                if (!isHex(intentTarget)) {
                    throw new Error('Unavailable');
                }
                fields = {...fields, intentTarget};
            }
            const body = new URLSearchParams({id: String(course), sesskey, operation, ...fields});
            const response = await fetch('/local/clearbridge/login_action.php', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                redirect: 'error',
                signal: AbortSignal.timeout(13000),
                body,
            });
            if (!response.ok) {
                throw new Error('Unavailable');
            }
            return response.json();
        };
        const reset = () => {
            generation++;
            clearTimeout(timer);
            clearTimeout(handshakeTimer);
            finishProof = null;
            pollUntil = 0;
            // Drop our window reference after handoff; only an unused waiting popup is closed here.
            popup?.close();
            popup = null;
        };
        const statusView = ({status}) => {
            if (status === 'CONNECTED') {
                reset();
                active = true;
                render('connected');
            } else if (status === 'RETURN_REQUIRED') {
                active = true;
                render(finishProof ? 'return' : 'restart');
            } else if (status === 'WAITING') {
                active = true;
                render(finishProof ? 'waiting' : 'restart');
            } else if (status === 'EXPIRED') {
                reset();
                active = false;
                render('expired');
            } else {
                reset();
                render('unavailable');
            }
        };
        const refresh = async() => {
            if (busy || !isHex(intentTarget)) {
                return;
            }
            busy = true;
            render(phase);
            try {
                const reply = await action('status');
                if (!exact(reply, ['status'])) {
                    throw new Error('Unavailable');
                }
                statusView(reply);
            } catch {
                reset();
                render('unavailable');
            } finally {
                busy = false;
                render(phase);
            }
            if (phase === 'waiting') {
                if (performance.now() < pollUntil) {
                    timer = setTimeout(refresh, 2500);
                } else {
                    reset();
                    render('expired');
                }
            }
        };
        start.addEventListener('click', () => {
            if (busy) {
                return;
            }
            reset();
            intentTarget = null;
            active = false;
            popup = window.open(origin + '/moodle/connect', '_blank', 'popup');
            if (!popup) {
                render('blocked');
                // Allow the user to retry after changing the browser's popup permission.
                start.hidden = false;
                return;
            }
            render('opening');
            handshakeTimer = setTimeout(() => {
                reset();
                render('unavailable');
            }, 10000);
        });
        window.addEventListener('message', async(event) => {
            if (phase !== 'opening' || busy || event.origin !== origin || event.source !== popup
                    || !exact(event.data, ['type', 'challenge']) || event.data.type !== 'clear-moodle-login-ready'
                    || !isHex(event.data.challenge)) {
                return;
            }
            clearTimeout(handshakeTimer);
            const expectedPopup = popup;
            const expectedGeneration = generation;
            const {challenge} = event.data;
            busy = true;
            render('opening');
            try {
                const reply = await action('start', {challenge});
                if (!exact(reply, ['status', 'expiresAtExclusive', 'launchCode', 'browserProof', 'finishProof', 'intentTarget'])
                        || reply.status !== 'WAITING' || !Number.isSafeInteger(reply.expiresAtExclusive)
                        || ![reply.launchCode, reply.browserProof, reply.finishProof, reply.intentTarget].every(isHex)
                        || expectedPopup.closed || expectedPopup !== popup || expectedGeneration !== generation) {
                    throw new Error('Unavailable');
                }
                finishProof = reply.finishProof;
                intentTarget = reply.intentTarget;
                active = true;
                expectedPopup.postMessage({type: 'clear-moodle-login-launch', challenge,
                    launchCode: reply.launchCode, browserProof: reply.browserProof}, origin);
                popup = null;
                pollUntil = performance.now() + 300000;
                render('waiting');
                timer = setTimeout(refresh, 2500);
            } catch {
                reset();
                render('unavailable');
            } finally {
                busy = false;
                render(phase);
            }
        });
        finish.addEventListener('click', async() => {
            if (busy || phase !== 'return' || !finishProof) {
                return;
            }
            busy = true;
            render(phase);
            try {
                const reply = await action('finish', {finishProof});
                if (!exact(reply, ['status']) || reply.status !== 'CONNECTED') {
                    throw new Error('Unavailable');
                }
                statusView(reply);
            } catch {
                // The response may have been lost after the owner completed the operation.
                // Recover by reading the current server status, never by replaying finish.
                reset();
                render('unavailable');
            } finally {
                busy = false;
                render(phase);
            }
            if (phase === 'unavailable') {
                await refresh();
            }
        });
        end.addEventListener('click', async() => {
            if (busy) {
                return;
            }
            reset();
            busy = true;
            render('opening');
            try {
                const reply = await action('end');
                if (!exact(reply, ['status']) || !['UNAVAILABLE', 'EXPIRED'].includes(reply.status)) {
                    throw new Error('Unavailable');
                }
                active = false;
                intentTarget = null;
                render('idle');
            } catch {
                render('unavailable');
            } finally {
                busy = false;
                render(phase);
            }
        });
        // On reload, status may be read, but the original tab proof is gone.
        window.addEventListener('pagehide', () => {
            reset();
            intentTarget = null;
            active = false;
            render('idle');
        });
        window.addEventListener('pageshow', event => {
            if (event.persisted) {
                void refresh();
            }
        });
        render('idle');
        void refresh();
    };

    return {init};
});
