// Composition for a SEPARATE local environment: existing CLEAR HTTPS front
// server (+ /auth wallet session) with B's operator relay mounted on
// POST /bootcamp/preview/{prepare,generate,execute}.
//
// No pinned file is modified. The existing frontend server's request listener
// is kept and only /bootcamp/preview/* is routed to B's handler.
//
//   browser ── CLEAR session cookie + x-wallet/x-chain-id/x-csrf-token ──▶
//     B createOperatorPreviewHandler (TLS/Host/Origin/CSRF/body checks)
//       runCommand  = createSessionCommandFence  (separate-env fence, not Moodle native)
//       relay       = B createOperatorPreviewRelay(DISPLAY_ONLY)
//         scope     = createOperatorScopeResolver(existing auth + operatorBindings + preview binding config)
//         dPort     = B createOperatorDPort(request = D HMAC client or test double)
//       owner approvals bound inside prepare (withOwnerApprovals)
import {createOperatorDPort, createOperatorPreviewRelay} from '../../src/agent-preview/operator-relay.mjs';
import {createOperatorPreviewHandler} from '../../src/agent-preview/operator-http.mjs';
import {createOperatorScopeResolver} from '../../src/agent-preview/operator-scope.mjs';
import {createSessionCommandFence} from '../../src/agent-preview/operator-session-fence.mjs';
import {createOwnerApprovalRegistry, withOwnerApprovals} from '../../src/agent-preview/operator-owner-approval.mjs';

const PREVIEW_ROUTE = /^\/bootcamp\/preview\//;

export function mountOperatorPreview({server, origin, authentication, operatorBindings, previewBindings,
  dRequest, dExecution = 'OFFLINE_TEST_TRANSPORT', bindingHash, ttlMs = 60000, clock = Date.now}) {
  const listeners = server.listeners('request');
  if (listeners.length !== 1) throw Error('OPERATOR_PREVIEW_MOUNT');
  const resolveOperatorPreviewScope = createOperatorScopeResolver({authentication, operatorBindings, previewBindings, clock});
  const relay = createOperatorPreviewRelay({authentication, resolveOperatorPreviewScope, ttlMs, clock,
    dPort: createOperatorDPort({request: dRequest, execution: dExecution}), executionContract: 'DISPLAY_ONLY'});
  const approvals = createOwnerApprovalRegistry({clock});
  const handler = createOperatorPreviewHandler({enabled: true, origin, authentication,
    relay: withOwnerApprovals(relay, {registry: approvals, bindingHash}),
    runCommand: createSessionCommandFence({authentication, clock})});
  const original = listeners[0];
  server.removeListener('request', original);
  server.on('request', (req, res) => PREVIEW_ROUTE.test(req.url ?? '') ? void handler(req, res) : original(req, res));
  server.once('close', () => relay.close());
  return Object.freeze({relay, approvals, close: () => relay.close()});
}

/**
 * D side for the separate environment, loaded from an exported exact D
 * snapshot (deploy/agent-preview at a pinned commit). Real D service, real
 * sqlite single-use approval store, real HMAC authentication; the model
 * transport is OFFLINE.
 */
export async function startDPreview({dRoot, databasePath, secret, publicOrigin = 'https://d-preview.clear.invalid',
  actor = {institutionId: 'clear-demo', courseId: '2', operatorId: '2'}, artifactHash, deploymentEpoch, modelTransport, clock = Date.now}) {
  const base = new URL('deploy/agent-preview/', new URL(dRoot.endsWith('/') ? dRoot : dRoot + '/', 'file:///'));
  const [{createService}, {createServer}, {openStore}, {validateConfig, bindingHash}, {limits}] = await Promise.all(
    ['service', 'http-server', 'store', 'config', 'limits'].map(n => import(new URL(n + '.mjs', base).href)));
  const config = validateConfig({version: 'clear-external-preview-config.1', publicOrigin, port: 18991, ...actor,
    dataMode: 'DEMO_ACCOUNTS_ONLY', databasePath, sharedSecretFile: databasePath + '.secret-not-read', artifactHash, deploymentEpoch});
  const store = openStore(databasePath), service = createService({config, store, modelTransport, clock});
  const server = createServer({config, secret, store, service, clock});
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return Object.freeze({config, limits, bindingHash: bindingHash(config), store,
    connectOrigin: `http://127.0.0.1:${server.address().port}`,
    async close() { service.close(); await new Promise(r => server.close(r)); server.closeAllConnections?.(); store.close(); }});
}
