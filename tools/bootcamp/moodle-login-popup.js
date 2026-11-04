const status = document.querySelector('main');
const {moodleOrigin, challenge} = status.dataset;
const opener = window.opener;
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

async function launch(event) {
  const data = event.data;
  if (event.origin !== moodleOrigin || event.source !== opener || !data
      || Object.keys(data).sort().join(',') !== 'browserProof,challenge,launchCode,type'
      || data.type !== 'clear-moodle-login-launch' || data.challenge !== challenge
      || !hex(data.launchCode) || !hex(data.browserProof)) return;
  window.removeEventListener('message', launch);
  window.opener = null;
  try {
    // Serialize cookie installation across CLEAR windows in this browser.
    await navigator.locks.request('clear-moodle-login-redeem', async () => {
      const response = await fetch('/moodle/connect/redeem', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({code: data.launchCode, challenge, browserProof: data.browserProof}),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok || !response.redirected
          || !['/onboarding', '/operator'].some(path => response.url === location.origin + path)) throw Error();
      location.replace(response.url);
    });
  } catch {
    status.textContent = '연결할 수 없습니다. Moodle 화면에서 다시 시작해 주세요.';
  }
}
if (opener && navigator.locks) {
  window.addEventListener('message', launch);
  opener.postMessage({type: 'clear-moodle-login-ready', challenge}, moodleOrigin);
} else {
  status.textContent = 'Moodle 화면에서 연결 창을 열어 주세요.';
}
