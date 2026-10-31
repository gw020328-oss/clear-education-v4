// Only fixed vocabulary crosses this boundary. Never stringify SDK exceptions,
// causes, URLs, provider responses, tokens, accounts or browser storage contents.
const codes = new Set(['invalid_captcha','captcha_failure','captcha_timeout','captcha_disabled',
  'session_storage_unavailable','missing_or_invalid_privy_app_id','missing_or_invalid_token',
  'disallowed_login_method','allowlist_rejected','too_many_requests','max_accounts_reached',
  'oauth_user_denied','oauth_unexpected','unknown_auth_error','client_request_timeout',
  'invalid_credentials','invalid_data','exited_auth_flow']);
const stages = new Set(['OAUTH_START','OAUTH_RETURN','WALLET_ACTION']);
const types = new Set(['client_error','api_error','connector_error']);
export const diagnosticKey = 'clear.oauth.diagnostic.v1';
export function oauthDiagnostic(error, stage) {
  let code = 'UNCLASSIFIED', type = 'UNKNOWN', httpStatus = null;
  // SDK 3.51.0 has several plain Error branches without privyErrorCode.
  try {
    if (codes.has(error?.privyErrorCode)) code = error.privyErrorCode;
    else if (error?.message === "It looks like you're using an in-app browser.  To log in, please try again using an external browser.") code = 'EXTERNAL_BROWSER_REQUIRED';
    else if (error?.message === 'Method called before `ready`. Ensure you wait until `ready` is true before calling.') code = 'SDK_NOT_READY';
    else if (error?.message === 'WALLET_TIMEOUT') code = 'ACTION_TIMEOUT';
    else if (error?.message === 'WALLET_CONTEXT_CANCELLED') code = 'ACTION_CANCELLED';
    else if (error instanceof TypeError && error.message === 'Failed to fetch') code = 'FETCH_FAILED';
    if (types.has(error?.type)) type = error.type;
    if ([400,401,403,404,408,409,422,429,500,502,503,504].includes(error?.status)) httpStatus = error.status;
  } catch {} // Hostile getters cannot expose data or prevent safe reporting.
  return Object.freeze({version: 1, stage: stages.has(stage) ? stage : 'WALLET_ACTION', code, type, httpStatus});
}
const safeCodes = new Set([...codes,'UNCLASSIFIED','EXTERNAL_BROWSER_REQUIRED','SDK_NOT_READY','ACTION_TIMEOUT','ACTION_CANCELLED','FETCH_FAILED']);
export function readOAuthDiagnostic(storage) {
  try {
    const d = JSON.parse(storage.getItem(diagnosticKey));
    if (d?.version !== 1 || !stages.has(d.stage) || !safeCodes.has(d.code)
      || ![...types,'UNKNOWN'].includes(d.type) || !(d.httpStatus === null || [400,401,403,404,408,409,422,429,500,502,503,504].includes(d.httpStatus))) return null;
    return {version:1,stage:d.stage,code:d.code,type:d.type,httpStatus:d.httpStatus};
  } catch { return null; }
}
export function saveOAuthDiagnostic(storage, diagnostic) {
  // Round-trip through the same vocabulary filter; retain only the latest event
  // in this tab, including across OAuth navigation. Never send to a server.
  const safe = readOAuthDiagnostic({getItem:()=>JSON.stringify(diagnostic)});
  if (safe) try { storage.setItem(diagnosticKey, JSON.stringify(safe)); } catch {}
  return safe;
}
export function diagnosticLabel(d) {
  return `${d.stage} · ${d.code} · ${d.type}${d.httpStatus === null ? '' : ' · HTTP '+d.httpStatus}`;
}
