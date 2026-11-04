// Native Moodle presentation contract. This view never grants server authority.
export const MOODLE_WALLET_VERSION = 'clear-moodle-wallet-view.1';
export const MOODLE_WALLET_ACTIONS = Object.freeze([
  'connect-google', 'connect-metamask', 'select-wallet', 'check-network', 'sign-in', 'finish-connection', 'cancel', 'sign-out',
]);
export const MOODLE_WALLET_PHASES = Object.freeze([
  'IDLE', 'CONNECTING', 'CHOOSING', 'SELECTED', 'CHECKING_NETWORK', 'NETWORK_READY',
  'SIGNING_IN', 'AUTHENTICATED', 'CONNECTION_PENDING', 'CONFIRMING_CONNECTION', 'CONNECTED',
  'REVOKING', 'CANCELLED', 'EXPIRED', 'ERROR', 'CLOSED',
]);
export const MOODLE_WALLET_ERRORS = Object.freeze([
  'UNAVAILABLE', 'BUSY', 'INVALID_COMMAND', 'STALE_SELECTION', 'WALLET_REJECTED',
  'WALLET_CHANGED', 'NETWORK_UNAVAILABLE', 'AUTH_REQUIRED', 'ROLE_CHANGED',
  'EXPIRED', 'CANCELLED', 'REVOCATION_UNKNOWN',
]);
const check = ok => { if (!ok) throw Error('MOODLE_WALLET_CONTRACT'); };
const exact = (value, keys) => {
  check(value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
};
const selector = value => typeof value === 'string' && /^[a-z][a-z0-9-]{1,79}$/.test(value);
export function validateCourseWalletMountConfig(value) {
  exact(value, ['appId','origin','redirectUri','phase','chainId','rpcUrl','instanceId','surface','role','courseId','sesskey']);
  check(value.surface === 'MOODLE_NATIVE' && value.phase === 'ACTIVE_LOCAL_TEST'
    && ['participant','operator'].includes(value.role) && Number.isSafeInteger(value.courseId) && value.courseId > 0
    && typeof value.sesskey === 'string' && /^[a-zA-Z0-9]{10,64}$/.test(value.sesskey)
    && (value.role !== 'participant' || typeof value.appId === 'string'));
  // Base wallet configuration is validated independently by validateConfig.
  return Object.freeze({...value});
}
export function validateCourseWalletCommand(value) {
  check(MOODLE_WALLET_ACTIONS.includes(value?.action));
  const field = value.action === 'connect-metamask' ? 'providerId' : value.action === 'select-wallet' ? 'choiceId' : null;
  exact(value, field ? ['action', field] : ['action']);
  if (field) check(selector(value[field]));
  return Object.freeze({...value});
}
export function validateCourseWalletView(value) {
  exact(value, ['version', 'role', 'phase', 'busy', 'providers', 'choices', 'selectedChoiceId',
    'networkReady', 'authenticated', 'allowedActions', 'error']);
  check(value.version === MOODLE_WALLET_VERSION && ['participant', 'operator'].includes(value.role)
    && MOODLE_WALLET_PHASES.includes(value.phase));
  for (const key of ['busy', 'networkReady', 'authenticated']) check(typeof value[key] === 'boolean');
  check(Array.isArray(value.providers) && value.providers.length <= 16 && Array.isArray(value.choices) && value.choices.length <= 32);
  for (const item of value.providers) { exact(item, ['providerId']); check(selector(item.providerId)); }
  for (const item of value.choices) {
    exact(item, ['choiceId', 'address']);
    check(selector(item.choiceId) && typeof item.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(item.address));
  }
  check(new Set(value.providers.map(p => p.providerId)).size === value.providers.length
    && new Set(value.choices.map(p => p.choiceId)).size === value.choices.length);
  check(value.role !== 'participant' || value.providers.length === 0);
  check(value.selectedChoiceId === null || value.choices.some(c => c.choiceId === value.selectedChoiceId));
  check(!value.authenticated || value.networkReady && value.selectedChoiceId !== null);
  check(!value.networkReady || value.selectedChoiceId !== null);
  check(Array.isArray(value.allowedActions) && new Set(value.allowedActions).size === value.allowedActions.length
    && value.allowedActions.every(action => MOODLE_WALLET_ACTIONS.includes(action)));
  check(!value.allowedActions.includes(value.role === 'participant' ? 'connect-metamask' : 'connect-google'));
  if (value.error !== null) {
    exact(value.error, ['code', 'outcome']);
    check(MOODLE_WALLET_ERRORS.includes(value.error.code)
      && ['NOT_SENT', 'REJECTED', 'UNKNOWN'].includes(value.error.outcome));
  }
  return structuredClone(value);
}
