// Test-host operating budget, not a source TTL, payment term or human time limit.
export const REVIEW_WINDOW = Object.freeze({
  minimumHumanReviewSeconds:120,
  settlementReserveSeconds:30,
  firstDisplaySeconds:150,
  openingSeconds:155,
  beforeModelSeconds:185,
  readersFreshSeconds:5,
  pollMs:1000,
});

export function displayedReviewWindow(view,{nowMs,readStartedAtMs}={}){
  const dates=[view?.procedure?.reviewCapAt,view?.sourceValidUntilExclusive];
  if(!dates.every(Number.isSafeInteger)||!Number.isSafeInteger(view?.observedAt)
    ||!Number.isFinite(nowMs)||!Number.isFinite(readStartedAtMs)||nowMs<readStartedAtMs)return null;
  // Charge the entire read round trip. A timer never creates a new observation.
  const deadline=Math.min(...dates),remainingMs=(deadline-view.observedAt)*1000-(nowMs-readStartedAtMs);
  return {deadline,remainingMs,reviewMs:Math.max(0,remainingMs-REVIEW_WINDOW.settlementReserveSeconds*1000)};
}
