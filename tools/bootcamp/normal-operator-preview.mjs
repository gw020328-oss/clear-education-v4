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
import {readFileSync, writeFileSync, statSync, existsSync, renameSync, openSync, closeSync, fsyncSync, unlinkSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
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

const APPROVALS_VERSION = 'clear-normal-operator-preview-approvals.1';
const LOCK_WAIT_MS = 2000, LOCK_STEP_MS = 10;
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const sameGrant = (a, b) => a?.bodyHash === b.bodyHash && a?.bindingHash === b.bindingHash && a?.approvalRef === b.approvalRef;

/**
 * Owner approvals recorded by the person running the host (the D administration
 * path registered the same ref in D's single-use store first). Entries live in a
 * 0600 JSON file {version, approvals:[{bodyHash,bindingHash,approvalRef,expiresAt}]}
 * and each is consumed once: a taken entry is removed from the file and never restored.
 *
 * The file is the only authority. Every record/take holds one exclusive lock file
 * (`<file>.lock`, shared by every instance and process), re-reads the file, and writes
 * through a unique temporary file + rename. Nothing is cached in memory, so an entry
 * another instance consumed or the owner removed is never returned. A take returns a
 * grant only after its removal reached the file; a failed write returns nothing and
 * leaves the entry in place. A lock left by a crashed writer is not removed
 * automatically (OWNER_APPROVAL_LOCKED); the owner checks and removes it by hand.
 * Owners add entries with record() so that additions take the same lock.
 */
export function createFileOwnerApprovals({path, clock = Date.now}) {
  check(typeof path === 'string' && isAbsolute(path));
  const lockPath = path + '.lock';
  const load = () => {
    if (!existsSync(path)) return [];
    const raw = JSON.parse(privateFile(path));
    check(raw?.version === APPROVALS_VERSION && Array.isArray(raw.approvals), 'OWNER_APPROVAL_FILE');
    return raw.approvals;
  };
  const valid = list => {
    const registry = createOwnerApprovalRegistry({clock});
    for (const g of list) { try { registry.record(g); } catch { /* invalid, expired or duplicate entries are ignored, never widened */ } }
    return registry;
  };
  const save = list => {
    const tmp = join(dirname(path), `.approvals.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
    try {
      const fd = openSync(tmp, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify({version: APPROVALS_VERSION, approvals: list}) + '\n'); fsyncSync(fd); }
      finally { closeSync(fd); }
      renameSync(tmp, path);
    } catch {
      try { unlinkSync(tmp); } catch { /* never created, or already renamed */ }
      fail('OWNER_APPROVAL_STORE');
    }
  };
  const locked = work => {
    let fd;
    for (const deadline = Date.now() + LOCK_WAIT_MS; fd === undefined;) {
      try { fd = openSync(lockPath, 'wx', 0o600); }
      catch (error) {
        if (error?.code !== 'EEXIST') fail('OWNER_APPROVAL_STORE');
        if (Date.now() >= deadline) fail('OWNER_APPROVAL_LOCKED');
        pause(LOCK_STEP_MS);
      }
    }
    try { closeSync(fd); return work(); }
    finally { try { unlinkSync(lockPath); } catch { /* fail closed: a left lock blocks later takes */ } }
  };
  return Object.freeze({
    /** Owner process only (never an HTTP route). */
    record(approval) {
      locked(() => {
        const list = load();
        valid(list).record(approval);
        const {bodyHash, bindingHash, approvalRef, expiresAt} = approval;
        save([...list, {bodyHash, bindingHash, approvalRef, expiresAt}]);
      });
    },
    take(bodyHash, bindingHash) {
      return locked(() => {
        const list = load(), grant = valid(list).take(bodyHash, bindingHash);
        if (!grant) return null;
        save(list.filter(g => !sameGrant(g, grant)));
        return grant;
      });
    },
    size: () => valid(load()).size(),
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
