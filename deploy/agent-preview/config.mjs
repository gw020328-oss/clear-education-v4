import {readFileSync, statSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {hash} from '../../src/agent-preview/index.mjs';
import {previewModel,previewMethods,limits} from './limits.mjs';

export function check(ok, code) { if (!ok) throw Error(code); }
export function exact(value, keys) {
  check(value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), 'INVALID_FIELDS');
}
export function validateConfig(raw) {
  const c = structuredClone(raw);
  exact(c, ['version', 'publicOrigin', 'port', 'institutionId', 'courseId', 'operatorId',
    'dataMode', 'databasePath', 'sharedSecretFile', 'artifactHash', 'deploymentEpoch']);
  check(c.version === 'clear-external-preview-config.1' && c.dataMode === 'DEMO_ACCOUNTS_ONLY', 'CONFIG_MODE');
  check(typeof c.artifactHash==='string' && /^[a-f0-9]{64}$/.test(c.artifactHash)
    && typeof c.deploymentEpoch==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(c.deploymentEpoch),'CONFIG_DEPLOYMENT');
  const origin = new URL(c.publicOrigin);
  check(origin.protocol === 'https:' && origin.origin === c.publicOrigin && !origin.username && !origin.password, 'CONFIG_PUBLIC_ORIGIN');
  check(Number.isSafeInteger(c.port) && c.port >= 1024 && c.port <= 65535, 'CONFIG_PORT');
  check(/^[a-zA-Z0-9_-]{1,64}$/.test(c.institutionId), 'CONFIG_INSTITUTION');
  for (const k of ['courseId', 'operatorId']) check(typeof c[k] === 'string' && /^[1-9][0-9]{0,9}$/.test(c[k]), 'CONFIG_ID');
  for (const k of ['databasePath', 'sharedSecretFile']) check(typeof c[k] === 'string' && isAbsolute(c[k]), 'CONFIG_PATH');
  return Object.freeze(c);
}
export function bindingHash(c) {
  return hash({version:c.version, publicOrigin:c.publicOrigin, institutionId:c.institutionId,
    courseId:c.courseId, operatorId:c.operatorId, dataMode:c.dataMode,artifactHash:c.artifactHash,
    deploymentEpoch:c.deploymentEpoch,model:previewModel,methods:previewMethods,limits});
}
export function readSecret(path, pattern) {
  const stat = statSync(path);
  check(stat.isFile() && stat.size <= 4096 && (stat.mode & 0o077) === 0, 'SECRET_FILE_PERMISSIONS');
  const value = readFileSync(path, 'utf8').trim();
  check(pattern.test(value), 'SECRET_FORMAT');
  return value;
}
