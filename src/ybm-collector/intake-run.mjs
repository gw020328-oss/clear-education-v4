import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Wallet } from 'ethers';
import { openHistoryIntake } from '../exam-evidence/intake.mjs';
import { defaultRoot } from '../mac-collector/storage.mjs';
import { startChrome } from '../mac-collector/chrome.mjs';
import { openOfficialClient, quiet } from './client.mjs';
import { createRoute } from './route.mjs';
import { probeYbmHome } from './probe.mjs';
import { createCapture } from './history-capture.mjs';
import { createProofSecrets } from './proof-secrets.mjs';
import { minimalClaim } from './proof.mjs';
import { loadAttestorTrust } from './trust.mjs';
import { inspectHistory } from './history-policy.mjs';
import { inspectHistoryScope, unresolvedHistoryCoverage } from './history-scope.mjs';
import { createIntakeVerifier, INTAKE_VERIFIER, intakeTrustDigest, intakeClaimContext, intakeClaimParams } from './intake-verifier.mjs';
import { snarkHistoryOperators, releaseSnarkOperators } from './history-snarkjs-operators.mjs';
import { endpoints, extractSource } from './source-policy.mjs';
import { requireValue as check } from './values.mjs';
import { proofSteps } from './proof-diagnostics.mjs';

// Callable by the trusted registration service for either H1 purpose. It does
// not manufacture enrollment, choose a benefit tier, or accept caller flags.
export async function collectIntakeHistory(managedSession, { intake, applicationId, purpose, scoreIndex = null, signal,
  input = process.stdin, output = console.log, openClient = openOfficialClient, routeFactory = createRoute,
  probe = probeYbmHome, launchBrowser = startChrome, captureFactory = createCapture,
  secretsFactory = createProofSecrets, operatorsFactory = snarkHistoryOperators, releaseOperators = releaseSnarkOperators,
  createClaim, clock = () => Math.floor(Date.now() / 1000) }) {
  const registration = intake.registration(applicationId);
  check(purpose !== 'BASELINE_HISTORY' || registration.policy.baselineRequired, 'INTAKE_BASELINE_NOT_REQUIRED');
  check(['BASELINE_HISTORY', 'ACHIEVEMENT'].includes(purpose), 'INTAKE_PURPOSE');
  const cancel = new AbortController(), scope = AbortSignal.any([signal, cancel.signal, AbortSignal.timeout(1800000)].filter(Boolean));
  let owner = Wallet.createRandom(), connection, route, browser, capture, secrets, operators, lines, raw, active = false, completed = false, removeAbort;
  let intakeSession, observation, layoutSupported = false;
  const collection = { start() { active = true; }, assertActive() { check(active, 'COLLECTION_STATE'); scope.throwIfAborted(); } };
  const stop = () => { if (!completed) cancel.abort(); };
  try {
    connection = await openClient({ signal: scope, proofMode: true });
    route = await routeFactory({ client: connection.client, signal: scope });
    const live = AbortSignal.any([scope, route.signal]);
    await probe(route, { signal: live }); live.throwIfAborted();
    browser = await launchBrowser(managedSession, { synthetic: false, proxyUrl: route.proxyUrl, headless: false, signal: live });
    browser.closed?.then(stop, stop);
    const { targetInfos } = await browser.send('Target.getTargets');
    const page = targetInfos.find(t => t.type === 'page'); check(page, 'BROWSER_PAGE_MISSING');
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    secrets = secretsFactory(browser);
    capture = captureFactory({ browser, collection, signal: live, onSourceRequest: (...args) => secrets.capture(...args),
      extractionFactory: () => ({ accept(role, bytes) {
        check(role === 'score' && intakeSession, 'INTAKE_CAPTURE_CONTEXT');
        let html = bytes.toString('utf8');
        observation = inspectHistoryScope(html, { registeredAt: registration.registeredAt, collectedAt: clock() });
        if (purpose === 'BASELINE_HISTORY') layoutSupported = inspectHistory(html).layoutSupported;
        else { const rows = extractSource('score', bytes); layoutSupported = Boolean(rows[scoreIndex]); }
        html = undefined;
        return { complete: true };
      }, close() {} }) });
    const navigation = await browser.send('Page.navigate', { url: 'https://exam.toeic.co.kr/' }, sessionId);
    check(!navigation.errorText, 'PUBLIC_ROUTE_NOT_READY');
    lines = createInterface({ input, terminal: false }); lines.once('close', stop);
    output('CLEAR INTAKE: 전용 Chrome에서 직접 로그인한 뒤 ready를 입력하세요. close로 중단합니다. 이력 접수는 자격·지급 승인이 아닙니다.');
    await new Promise((resolve, reject) => {
      let armed = false;
      const abort = () => reject(new Error('INTAKE_CANCELLED'));
      live.addEventListener('abort', abort, { once: true }); removeAbort = () => live.removeEventListener('abort', abort);
      capture.done.then(resolve, reject);
      lines.on('line', line => {
        if (line.trim() === 'close') stop();
        if (line.trim() !== 'ready' || armed) return; armed = true;
        void (async () => {
          intakeSession = intake.openSession(applicationId, purpose, owner.address.toLowerCase(), scoreIndex);
          await capture.arm();
          const result = await browser.send('Page.navigate', { url: endpoints.score }, sessionId);
          check(!result.errorText, 'SOURCE_NAVIGATION_FAILED');
        })().catch(reject);
      });
      if (live.aborted) abort();
    });
    removeAbort(); live.throwIfAborted();
    output(JSON.stringify({ scope: 'INTAKE_SOURCE_OBSERVATION', ...observation }));
    if (!layoutSupported) {
      intake.cancel(intakeSession.sessionId); completed = true;
      return { state: 'SOURCE_LAYOUT_UNSUPPORTED', proofVerified: false, ...unresolvedHistoryCoverage() };
    }
    check(connection.client === route.client && connection.client.isOpen && connection.client.isInitialised, 'SAME_CLIENT_REQUIRED');
    operators = operatorsFactory({ signal: live });
    if (!createClaim) ({ createClaimOnAttestor: createClaim } = await import('@reclaimprotocol/attestor-core'));
    raw = secrets.take('score'); let lastStep;
    const result = await createClaim({ name: 'http', params: intakeClaimParams(intakeSession), context: intakeClaimContext(intakeSession),
      ownerPrivateKey: owner.privateKey, secretParams: raw, client: connection.client,
      zkEngine: 'snarkjs', zkOperators: operators, zkProofConcurrency: 1, maxRetries: 1, logger: quiet,
      onStep: s => { if (proofSteps.has(s.name) && s.name !== lastStep) { lastStep = s.name; output(JSON.stringify({ scope: 'INTAKE_PROOF_PROGRESS', step: s.name })); } } });
    raw = undefined; secrets.close(); live.throwIfAborted();
    // The intake service, not the collector, runs the offline verifier.
    const receipt = await intake.accept(intakeSession.sessionId, minimalClaim(result), { signal: live });
    completed = true; return { receipt, observation };
  } catch {
    if (intakeSession) { try { intake.cancel(intakeSession.sessionId); } catch { /* accepted result remains recoverable */ } }
    throw new Error('INTAKE_COLLECTION_FAILED');
  } finally {
    active = false; completed = true; removeAbort?.(); lines?.removeListener('close', stop); lines?.close(); raw = owner = undefined;
    try { await releaseOperators(operators); }
    finally { try { await capture?.close(); } finally { secrets?.close();
      try { await browser?.close(); } finally { try { await route?.close(); } finally { await connection?.close(); } } } }
  }
}

// Explicit CLI rehearsal of the local registration boundary, not an institution
// enrollment or production wallet consent. Raw material uses the managed root.
export async function runYbmRoute(session, { signal, input = process.stdin, output = console.log } = {}) {
  const trust = await loadAttestorTrust({ signal });
  const config = { directory: join(defaultRoot(), 'history-intake-v1'), instanceId: 'local-intake-preview', mode: 'LIVE_SOURCE',
    verifierProfile: INTAKE_VERIFIER, verifierConfigDigest: intakeTrustDigest(trust), verify: createIntakeVerifier(trust) };
  let intake = openHistoryIntake(config);
  try {
    const applicationId = 'local-' + randomUUID();
    intake.register({ binding: { applicationId, participantRef: 'unverified-local-subject', recipientRef: 'unverified-local-recipient', bindingRevision: 1 },
      policy: { policyVersion: 'history-intake-preview.1', consentVersion: 'local-preview-consent.1', baselineRequired: true,
        baselineWindow: 'CALENDAR_TWO_YEARS_CANDIDATE', baselineLagSeconds: 1800, achievementFromSeconds: 0,
        achievementUntilSeconds: 1800, acceptanceMaxAgeSeconds: 300, sessionSeconds: 600, retentionSeconds: 86400 } });
    output('로컬 등록 접수 시험: 공식 수강신청·실명·지갑 동의가 아닙니다. 최소 접수 메타데이터는 24시간 후 다음 실행 때 삭제하며, 비공개 재사용 방지 값은 유지합니다.');
    const result = await collectIntakeHistory(session, { intake, applicationId, purpose: 'BASELINE_HISTORY', signal, input, output });
    if (!result.receipt) return result;
    const receipt = result.receipt;
    intake.close(); intake = openHistoryIntake(config);
    const recovered = intake.receipt(receipt.sessionId);
    check(recovered?.contextDigest === receipt.contextDigest, 'INTAKE_RECOVERY_FAILED');
    return { scope: 'LOCAL_REGISTRATION_INTAKE', state: recovered.state, proofVerified: recovered.proofVerified,
      wholeHistoryTableClaim: recovered.wholeHistoryTableClaim, durableReceiptRecovered: true,
      ...unresolvedHistoryCoverage() };
  } finally { intake.close(); }
}
