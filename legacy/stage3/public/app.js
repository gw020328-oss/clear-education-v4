const $ = id => document.getElementById(id);
let state;
let toastTimer;

const errors = {
  ALREADY_ACCEPTED: '이미 조건 동의가 기록되었습니다.', CONSENT_REQUIRED: '먼저 조건에 동의해 주세요.',
  ALREADY_ISSUED: '증빙 4개가 이미 발급되었습니다.', EVIDENCE_NOT_READY: '아직 내려받을 증빙이 없습니다.',
  FILE_TOO_LARGE: '파일이 너무 큽니다. 64KB 이하의 증빙 파일을 선택해 주세요.', INVALID_JSON: '올바른 JSON 증빙 파일이 아닙니다.',
  IMPORT_REQUIRED: '먼저 증빙 파일을 선택하고 검증해 주세요.', CLAIM_ALREADY_STARTED: '이미 청구를 처리하고 있습니다.',
  TERMS_MISMATCH: '이 강좌의 조건과 다른 증빙입니다.', DOMAIN_MISMATCH: '다른 체인이나 계약에서 만든 증빙입니다.',
  RECIPIENT_MISMATCH: '현재 참가자의 수령 주소와 다른 증빙입니다.', ISSUER_SIGNATURE: '발급자 서명을 확인할 수 없습니다.',
  EXPIRED: '청구 기한이 지났습니다.', NOT_CLAIMABLE: '현재 청구할 수 없는 상태입니다.',
  LOCAL_OPERATION_FAILED: '로컬 처리 중 오류가 발생했습니다. 서버를 다시 시작해 주세요.'
};
function showToast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }); }
  catch { throw new Error('LOCAL_OPERATION_FAILED'); }
  const value = await response.json();
  if (!response.ok) throw new Error(value.code ?? 'LOCAL_OPERATION_FAILED');
  return value;
}
const formatDate = seconds => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(seconds * 1000)) + ' UTC';
const shortHash = value => value ? `${value.slice(0, 10)}…${value.slice(-8)}` : '';

function nextAction(s) {
  if (s.payment.state === 'completed') return ['지급이 완료되었습니다', '거래 영수증과 수령자 잔액까지 확인했습니다.'];
  if (['submitted', 'confirming'].includes(s.payment.state)) return ['청구를 처리하고 있습니다', '거래가 확정되고 잔액이 늘어날 때까지 확인합니다.'];
  if (!s.consent.recorded) return ['조건을 확인해 주세요', '동의하면 참가자 몫의 준비금이 금고에 예치됩니다.'];
  if (s.course.completed < s.course.required) return ['제출 증빙 4개를 받아 주세요', `현재 ${s.course.completed}개, 앞으로 ${s.course.required - s.course.completed}개가 필요합니다.`];
  if (!s.evidence.imported) return ['증빙 파일을 보관하고 검증해 주세요', '다운로드한 파일을 선택하거나 방금 만든 증빙을 검증하세요.'];
  return ['환급을 청구할 수 있습니다', '검증된 증빙으로 50 TEST 지급을 요청하세요.'];
}
function render(s) {
  state = s;
  $('amount').textContent = s.course.amount;
  $('claim-deadline').textContent = formatDate(s.course.claimUntil);
  $('terms-deadline').textContent = formatDate(s.course.claimUntil);
  $('submission-period').textContent = `${formatDate(s.course.due - 86400)}부터 ${formatDate(s.course.due)}까지`;
  $('remaining').textContent = s.course.completed === 4 ? '모두 충족' : `증빙 ${4 - s.course.completed}개`;
  $('reserve-summary').textContent = s.reserve.secured ? '50 TEST 확보' : '확인 전';
  const [title, detail] = nextAction(s); $('next-title').textContent = title; $('next-detail').textContent = detail;

  $('consent-dot').classList.toggle('done', s.consent.recorded);
  $('reserve-dot').classList.toggle('done', s.reserve.secured);
  $('consent-label').textContent = s.consent.recorded ? '조건 동의 기록 완료' : '조건 동의 전';
  $('consent-help').textContent = s.consent.recorded ? '참가자 주소의 서명과 동의 시각이 금고에 기록되었습니다.' : '위 조건을 확인하고 동의 기록을 남겨야 합니다.';
  $('reserve-label').textContent = s.reserve.secured ? '준비금 50 TEST 확보' : '준비금 확인 전';
  $('reserve-help').textContent = s.reserve.secured ? '금고 잔액과 미지급 준비금을 대조했습니다.' : '동의가 기록될 때 참가자 몫 50 TEST를 함께 예치합니다.';
  $('terms-check').disabled = s.consent.recorded;
  $('terms-check').checked = s.consent.recorded || $('terms-check').checked;
  $('consent-button').disabled = s.consent.recorded || !$('terms-check').checked;
  $('consent-button').textContent = s.consent.recorded ? '동의 및 예치 완료' : '동의하고 준비금 확인';

  $('evidence-count').textContent = `${s.course.completed} / 4 확보`;
  $('progress-fill').style.width = `${s.course.completed * 25}%`;
  $('evidence-list').replaceChildren(...s.submissions.map(item => {
    const li = document.createElement('li'); li.className = item.issued ? 'done' : '';
    li.innerHTML = `<span>제출 ${item.index}</span><strong>${item.issued ? '증빙 확보' : '대기 중'}</strong><small>${item.issued ? '서명 확인 가능' : '아직 발급되지 않음'}</small>`;
    return li;
  }));
  $('issue-button').disabled = !s.consent.recorded || s.evidence.ready;
  $('issue-button').textContent = s.evidence.ready ? '증빙 4개 확보 완료' : '모의 제출 증빙 4개 받기';

  const download = $('download-button');
  download.href = s.evidence.ready ? '/api/evidence' : '';
  download.classList.toggle('disabled', !s.evidence.ready);
  download.setAttribute('aria-disabled', String(!s.evidence.ready));
  $('use-current-button').disabled = !s.evidence.ready || s.evidence.imported;
  $('use-current-button').textContent = s.evidence.imported ? '증빙 검증 완료' : '방금 만든 증빙을 검증해 사용';
  $('file-status').textContent = s.evidence.imported ? '증빙 파일 검증 완료 · 청구에 사용할 수 있습니다.' : s.evidence.ready ? '개인키 없이 생성됨 · 지금 내려받을 수 있습니다.' : '증빙 4개를 모두 확보하면 내려받을 수 있습니다.';

  $('recipient').textContent = s.learner;
  $('claim-button').disabled = !s.evidence.imported || ['submitted', 'confirming', 'completed'].includes(s.payment.state);
  $('claim-button').textContent = s.payment.state === 'completed' ? '지급 완료' : ['submitted', 'confirming'].includes(s.payment.state) ? '처리 중…' : '환급 청구하기';
  $('claim-help').textContent = s.evidence.imported ? '증빙 검증 완료 · 지급 전 금고 상태를 한 번 더 확인합니다.' : '먼저 증빙 파일을 선택하고 검증해 주세요.';
  renderResult(s.payment);
}
function renderResult(payment) {
  const icon = $('result-icon'); icon.className = 'result-icon'; $('receipt-details').hidden = true;
  if (payment.state === 'submitted') {
    icon.textContent = '↗'; icon.classList.add('processing'); $('result-kicker').textContent = '청구 접수'; $('result-title').textContent = '청구가 접수되었습니다';
    $('result-detail').textContent = '아직 지급 완료가 아닙니다. 거래 제출을 준비하고 있습니다.';
  } else if (payment.state === 'confirming') {
    icon.textContent = '↻'; icon.classList.add('processing'); $('result-kicker').textContent = '거래 확인 중'; $('result-title').textContent = '거래 영수증을 기다리고 있습니다';
    $('result-detail').textContent = '거래 확정과 수령자 잔액 증가를 모두 확인해야 완료됩니다.';
  } else if (payment.state === 'completed') {
    icon.textContent = '✓'; icon.classList.add('done'); $('result-kicker').textContent = '실제 지급 완료'; $('result-title').textContent = '50 TEST 지급을 확인했습니다';
    $('result-detail').textContent = '거래 영수증이 확정됐고 수령자 잔액이 정확히 50 TEST 늘었습니다.';
    $('tx-hash').textContent = shortHash(payment.transactionHash); $('tx-hash').title = payment.transactionHash;
    $('confirmed-balance').textContent = `${Number(payment.balanceUnits) / 1_000_000} TEST`; $('receipt-details').hidden = false;
  } else if (payment.state === 'failed') {
    icon.textContent = '!'; icon.classList.add('error'); $('result-kicker').textContent = '처리 실패'; $('result-title').textContent = '지급을 완료하지 못했습니다';
    $('result-detail').textContent = errors[payment.code] ?? `오류 코드: ${payment.code}`;
  } else {
    icon.textContent = '…'; $('result-kicker').textContent = '처리 결과'; $('result-title').textContent = '아직 청구하지 않았습니다';
    $('result-detail').textContent = '청구 뒤 거래 영수증과 수령자 잔액을 확인해 지급 완료를 표시합니다.';
  }
}
async function refresh() { render(await api('/api/state')); }
async function action(button, task) {
  const old = button.textContent; button.disabled = true; button.textContent = '처리 중…';
  try { await task(); await refresh(); }
  catch (error) { showToast(errors[error.message] ?? `처리할 수 없습니다. 오류 코드: ${error.message}`); button.disabled = false; button.textContent = old; }
}
$('terms-check').addEventListener('change', () => { $('consent-button').disabled = !$('terms-check').checked; });
$('consent-button').addEventListener('click', () => action($('consent-button'), () => api('/api/consent', { method: 'POST' })));
$('issue-button').addEventListener('click', () => action($('issue-button'), () => api('/api/submissions/issue', { method: 'POST' })));
$('use-current-button').addEventListener('click', () => action($('use-current-button'), async () => {
  const response = await fetch('/api/evidence'); if (!response.ok) throw new Error('EVIDENCE_NOT_READY');
  await api('/api/evidence/import', { method: 'POST', body: JSON.stringify(await response.json()) });
}));
$('file-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (file.size > 64 * 1024) return showToast(errors.FILE_TOO_LARGE);
  try { await api('/api/evidence/import', { method: 'POST', body: await file.text() }); await refresh(); }
  catch (error) { showToast(errors[error.message] ?? `검증할 수 없습니다. 오류 코드: ${error.message}`); }
  finally { event.target.value = ''; }
});
$('claim-button').addEventListener('click', () => action($('claim-button'), async () => {
  const response = await api('/api/claim', { method: 'POST' }); renderResult(response.claim);
  const timer = setInterval(async () => {
    try { const current = await api('/api/state'); render(current); if (['completed', 'failed'].includes(current.payment.state)) clearInterval(timer); }
    catch { clearInterval(timer); showToast('처리 상태를 확인하지 못했습니다. 서버 연결을 확인해 주세요.'); }
  }, 250);
}));

refresh().catch(() => showToast('로컬 서버에 연결하지 못했습니다. 서버를 다시 시작해 주세요.'));
