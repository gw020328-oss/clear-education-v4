// Opt-in operator condition preview on the Moodle-native normal host.
//
//   Moodle operator panel ── A previewRequest (Moodle command grant) ──▶ front door
//     ──▶ /bootcamp/preview/{prepare,generate,execute}   B createOperatorPreviewHandler
//          runCommand = createNativePreviewCommand        A native commandScope reservation
//          relay      = B createOperatorPreviewRelay       DISPLAY_ONLY
//            scope    = createOperatorScopeResolver        operator wallet → course → D actor
//            dPort    = D HMAC server-to-server request    D runs as its own process
//          owner approvals: bound inside prepare from an owner-written 0600 file
//
// Nothing here changes the fixed four-condition payment policy. D holds the model
// key; this process only holds D's HMAC secret. No key reaches the browser.
import {readFileSync, writeFileSync, statSync, existsSync, renameSync} from 'node:fs';
import {isAbsolute, dirname, join} from 'node:path';
import {createOperatorDPort, createOperatorPreviewRelay} from '../../src/agent-preview/operator-relay.mjs';
import {createOperatorPreviewHandler} from '../../src/agent-preview/operator-http.mjs';
import {createOperatorScopeResolver, validateOperatorScopeConfig} from '../../src/agent-preview/operator-scope.mjs';
import {createDPreviewRequest} from '../../src/agent-preview/d-preview-transport.mjs';
import {createOwnerApprovalRegistry, withOwnerApprovals} from '../../src/agent-preview/operator-owner-approval.mjs';
import {createNativePreviewCommand} from '../../src/agent-preview/operator-native-command.mjs';

export const NORMAL_OPERATOR_PREVIEW_VERSION = 'clear-normal-operator-preview.1';
const fail = code => { throw Object.assign(new Error(code), {code}); };
const check = (ok, code = 'NORMAL_OPERATOR_PREVIEW_CONFIG') => { if (!ok) fail(code); };
const privateFile = path => {
  check(typeof path === 'string' && isAbsolute(path) && existsSync(path));
  const s = statSync(path); check(s.isFile() && (s.mode & 0o077) === 0, 'NORMAL_OPERATOR_PREVIEW_PERMISSIONS');
  return readFileSync(path, 'utf8');
};

/** Host config section. Paths are absolute; secrets are files (0600), never inline. */
export function validateOperatorPreviewConfig(c) {
  check(c && Object.getPrototypeOf(c) === Object.prototype && c.version === NORMAL_OPERATOR_PREVIEW_VERSION);
  check(Object.keys(c).sort().join(',') === 'approvalsFile,dConnectOrigin,dExecution,dPublicOrigin,scopeFile,sharedSecretFile,version');
  check(['ACTUAL', 'OFFLINE_TEST_TRANSPORT'].includes(c.dExecution));
  for (const k of ['scopeFile', 'sharedSecretFile', 'approvalsFile']) check(typeof c[k] === 'string' && isAbsolute(c[k]));
  const pub = new URL(c.dPublicOrigin), target = new URL(c.dConnectOrigin);
  check(pub.protocol === 'https:' && pub.origin === c.dPublicOrigin && target.origin === c.dConnectOrigin
    && (target.protocol === 'https:' || target.protocol === 'http:' && target.hostname === '127.0.0.1'));
  return Object.freeze({...c});
}

/**
 * Owner approvals recorded by the person running the host (the D administration
 * path registered the same ref in D's single-use store first). Entries are read
 * from a 0600 JSON file {version, approvals:[{bodyHash,bindingHash,approvalRef,expiresAt}]}
 * and each is consumed once: a taken entry is removed from the file and never restored.
 */
export function createFileOwnerApprovals({path, clock = Date.now}) {
  check(typeof path === 'string' && isAbsolute(path));
  const registry = createOwnerApprovalRegistry({clock}), seen = new Set();
  const load = () => {
    if (!existsSync(path)) return [];
    const raw = JSON.parse(privateFile(path));
    check(raw?.version === 'clear-normal-operator-preview-approvals.1' && Array.isArray(raw.approvals), 'OWNER_APPROVAL_FILE');
    return raw.approvals;
  };
  const save = list => {
    const tmp = join(dirname(path), '.approvals.tmp');
    writeFileSync(tmp, JSON.stringify({version: 'clear-normal-operator-preview-approvals.1', approvals: list}) + '\n', {mode: 0o600});
    renameSync(tmp, path);
  };
  return Object.freeze({
    take(bodyHash, bindingHash) {
      const list = load();
      for (const g of list) {
        const key = g?.bodyHash + ':' + g?.bindingHash + ':' + g?.approvalRef;
        if (seen.has(key)) continue; seen.add(key);
        try { registry.record(g); } catch { /* invalid or expired entries are ignored, never widened */ }
      }
      const grant = registry.take(bodyHash, bindingHash);
      if (grant) save(list.filter(g => !(g.bodyHash === grant.bodyHash && g.bindingHash === grant.bindingHash && g.approvalRef === grant.approvalRef)));
      return grant;
    },
    size: () => registry.size(),
  });
}

export function createNormalOperatorPreview({origin, authentication, commandScope, operatorBindings, config, clock = Date.now}) {
  const c = validateOperatorPreviewConfig(config);
  const scope = validateOperatorScopeConfig(JSON.parse(privateFile(c.scopeFile)));
  check(scope.bindings.length === 1, 'NORMAL_OPERATOR_PREVIEW_SCOPE');
  const secret = privateFile(c.sharedSecretFile).trim();
  check(/^[a-f0-9]{64,128}$/.test(secret), 'NORMAL_OPERATOR_PREVIEW_SECRET');
  const resolveOperatorPreviewScope = createOperatorScopeResolver({authentication, operatorBindings, previewBindings: () => scope, clock});
  const relay = createOperatorPreviewRelay({authentication, resolveOperatorPreviewScope, ttlMs: 60000, clock,
    dPort: createOperatorDPort({request: createDPreviewRequest({publicOrigin: c.dPublicOrigin, connectOrigin: c.dConnectOrigin, secret}),
      execution: c.dExecution}), executionContract: 'DISPLAY_ONLY'});
  const approvals = createFileOwnerApprovals({path: c.approvalsFile, clock});
  const handler = createOperatorPreviewHandler({enabled: true, origin, authentication,
    relay: withOwnerApprovals(relay, {registry: approvals, bindingHash: scope.bindings[0].deployment.bindingHash}),
    runCommand: createNativePreviewCommand({commandScope, authentication, clock})});
  return Object.freeze({handler, close: () => relay.close()});
}
