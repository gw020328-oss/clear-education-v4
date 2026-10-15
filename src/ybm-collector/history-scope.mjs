import { parse } from 'parse5';
import { MAX_HTML_BYTES, endpoints } from './source-policy.mjs';
import { requireValue } from './values.mjs';

export const HISTORY_SCOPE_VERSION = 'ybm-history-scope.1';
const attrs = n => Object.fromEntries((n.attrs ?? []).map(a => [a.name, a.value]));
const text = n => n.nodeName === '#text' ? n.value : (n.childNodes ?? []).map(text).join('');
function nodes(root) {
  const out = [], pending = [root];
  while (pending.length) { const n = pending.pop(); out.push(n); pending.push(...(n.childNodes ?? [])); }
  return out;
}
const validTime = t => Number.isSafeInteger(t) && t >= 0 && t <= 4102444800;

// Calendar arithmetic is diagnostic only. Feb 29 -> Feb 28 is an explicit
// candidate, NOT an interpretation of the institution's unsettled policy.
export function historyWindowCandidates(registeredAt) {
  requireValue(validTime(registeredAt), 'HISTORY_TIME');
  const local = new Date((registeredAt + 9 * 3600) * 1000);
  const year = local.getUTCFullYear() - 2, month = local.getUTCMonth();
  const day = Math.min(local.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  const calendarFrom = Date.UTC(year, month, day, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds()) / 1000 - 9 * 3600;
  return { timeZone: 'Asia/Seoul', until: registeredAt, calendarFrom,
    seconds730From: registeredAt - 730 * 86400, leapDayCandidate: 'CLAMP_TO_FEB28',
    boundaryStatus: 'OPEN', registrationEventStatus: 'OPEN' };
}

// These facts are observations of a browser response, not authenticated coverage.
// Do not persist HTML, URLs with query values, dates, counts, names or scores.
export function inspectHistoryScope(html, { registeredAt, collectedAt, requestUrl = endpoints.score, method = 'GET' }) {
  requireValue(typeof html === 'string' && Buffer.byteLength(html) <= MAX_HTML_BYTES && html.length > 0, 'HISTORY_SIZE');
  requireValue(validTime(collectedAt) && collectedAt >= registeredAt, 'HISTORY_TIME');
  const window = historyWindowCandidates(registeredAt), all = nodes(parse(html));
  const controls = all.filter(n => ['input', 'select', 'button', 'a', 'form'].includes(n.tagName));
  const descriptor = n => { const a = attrs(n); return [a.id, a.class, a.name, a.href, a.action, a.onclick, text(n)].join(' '); };
  const page = /paging|pagination|page[_-]?(?:no|num|index)|[?&]page=|더\s*보기|다음\s*페이지|next\s*page|load\s*more/i;
  const filter = /filter|search|start[_-]?date|end[_-]?date|date[_-]?(?:from|to)|기간|조회조건/i;
  const sort = /sort|order[_-]?by|정렬/i;
  const scripts = all.filter(n => n.tagName === 'script');
  return { version: HISTORY_SCOPE_VERSION, requestPinned: method === 'GET' && requestUrl === endpoints.score,
    paginationObserved: all.some(n => page.test(descriptor({ ...n, childNodes: ['a', 'button'].includes(n.tagName) ? n.childNodes : [] }))),
    filterControlObserved: controls.some(n => filter.test(descriptor(n))),
    sortControlObserved: controls.some(n => sort.test(descriptor(n))),
    dynamicLoadingObserved: scripts.some(n => /fetch\s*\(|ajax|XMLHttpRequest|loadMore/i.test(text(n))),
    externalScriptsUninspected: scripts.some(n => Boolean(attrs(n).src)),
    emptyToeicTableObserved: !all.some(n => n.tagName === 'tr' && attrs(n).name === 'TOE'),
    collectionAfterRegistration: collectedAt > registeredAt,
    calendarDiffersFrom730Days: window.calendarFrom !== window.seconds730From,
    assurance: 'UNTRUSTED_BROWSER_OBSERVATION', totalCountAuthority: 'UNKNOWN',
    filterSortCoverage: 'UNKNOWN', emptyMeaning: 'UNKNOWN', periodCoverage: 'UNKNOWN',
    fullHistoryProven: false, sourceCoverageConfirmed: false, accountIdentityBound: false,
    status: 'UNKNOWN', paymentAllowed: false };
}

// A signed table does not authenticate an inventory, absence, registration
// boundary, account-to-applicant binding, or server-side filtering behaviour.
export function unresolvedHistoryCoverage() {
  return { version: HISTORY_SCOPE_VERSION, status: 'UNKNOWN',
    reasons: ['SOURCE_COVERAGE_UNKNOWN', 'REGISTRATION_BOUNDARY_OPEN', 'ACCOUNT_IDENTITY_UNVERIFIED'],
    fullHistoryProven: false, sourceCoverageConfirmed: false, accountIdentityBound: false,
    absenceEstablished: false, baselineBelowThreshold: false, productEligible: false, paymentAllowed: false };
}
