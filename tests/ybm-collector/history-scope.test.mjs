import test from 'node:test';
import assert from 'node:assert/strict';
import { historyWindowCandidates, inspectHistoryScope, unresolvedHistoryCoverage } from '../../src/ybm-collector/history-scope.mjs';
import { scoreHtml } from './source-fixture.mjs';
const at = s => Date.parse(s) / 1000;
const options = { registeredAt: at('2026-03-01T00:00:00+09:00'), collectedAt: at('2026-03-01T00:00:01+09:00') };
test('calendar years differ from 730 days across leap years; KST and instant retained', () => {
  const r = historyWindowCandidates(at('2025-03-01T00:00:00+09:00'));
  assert.equal(r.calendarFrom, at('2023-03-01T00:00:00+09:00'));
  assert.equal(r.seconds730From - r.calendarFrom, 86400);
  assert.equal(r.boundaryStatus, 'OPEN');
});
test('Feb 29 clamp is only a candidate and preserves local time', () => {
  const r = historyWindowCandidates(at('2024-02-29T23:59:59+09:00'));
  assert.equal(r.calendarFrom, at('2022-02-28T23:59:59+09:00'));
  assert.equal(r.registrationEventStatus, 'OPEN');
});
for (const [html, flag] of [
  ['<a href="?page=2">2</a>', 'paginationObserved'],
  ['<button>더 보기</button>', 'paginationObserved'],
  ['<div class="pagination"></div>', 'paginationObserved'],
  ['<input name="startDate">', 'filterControlObserved'],
  ['<select name="sort"></select>', 'sortControlObserved'],
  ['<script>fetch("/scores")</script>', 'dynamicLoadingObserved'],
  ['<script src="/scores.js"></script>', 'externalScriptsUninspected'],
]) test(`detects ${flag} without claiming completeness`, () => {
  const r = inspectHistoryScope(scoreHtml().replace('</body>', html + '</body>'), options);
  assert.equal(r[flag], true); assert.equal(r.fullHistoryProven, false);
});
test('plain table, empty response and logged-out HTML never establish coverage/absence', () => {
  for (const html of [scoreHtml(), '<table><tr><td>조회 내역 없음</td></tr></table>', '<html>로그인</html>']) {
    const r = inspectHistoryScope(html, options);
    assert.equal(r.sourceCoverageConfirmed, false); assert.equal(r.emptyMeaning, 'UNKNOWN');
    assert.equal(r.totalCountAuthority, 'UNKNOWN');
    for (const secret of ['SYNTHETIC_PRIVATE_NAME', '123456', '850']) assert.ok(!JSON.stringify(r).includes(secret));
  }
});
test('query filters, alternate URL, method cannot be pinned; timestamps fail closed', () => {
  for (const extra of [{requestUrl:'https://exam.toeic.co.kr/result/scoreList.php?page=1'}, {method:'POST'}])
    assert.equal(inspectHistoryScope(scoreHtml(), {...options,...extra}).requestPinned, false);
  assert.throws(() => inspectHistoryScope(scoreHtml(), {...options, collectedAt: options.registeredAt - 1}));
});
test('no caller supplied observation can promote live coverage', () => {
  const r = unresolvedHistoryCoverage({fullHistoryProven:true, rowCount:0, pagination:false});
  for (const key of ['fullHistoryProven','absenceEstablished','baselineBelowThreshold','productEligible','paymentAllowed']) assert.equal(r[key], false);
});
