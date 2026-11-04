import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {exact,hash,hex,opaque,requireRule as check} from './vendor/b-peer/contract.mjs';
import {validatePeerPin} from './vendor/b-peer/peer-transport.mjs';
import {validateConfig} from './config.mjs';
import {limits,previewModel} from './limits.mjs';
export const preparePath='/v1/preview/prepare';
export const peerPaths=['/v1/preview/generate','/v1/preview/execute','/v1/preview/observation-result'];

export function readPrivateJson(path) {
  const stat=lstatSync(path);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink===1 && stat.uid===process.getuid()
    && (stat.mode&0o777)===0o600 && stat.size<=32768 && realpathSync(path)===resolve(path),'PRIVATE_PROFILE');
  return JSON.parse(readFileSync(path,'utf8'));
}
export function validateRelease(value) {
  exact(value,['version','mode','config','pin','targetRef','planTarget','maxObservationAgeSeconds','receiptContract']);
  check(value.version==='clear-peer-release.1' && ['OFFLINE_TEST','ACTUAL_GEMINI'].includes(value.mode),'RELEASE_MODE');
  validateConfig(value.config);
  exact(value.pin,['keyRef','sender','receiver','audience','deploymentEpoch','origin','maxClockSkewSeconds']);
  check(!value.config.databasePath.endsWith('/peer-replay.sqlite'),'STORE_COLLISION');
  const pin=validatePeerPin({...value.pin,path:peerPaths[0]});
  check(pin.origin===value.config.publicOrigin && pin.deploymentEpoch===value.config.deploymentEpoch
    && hex(value.config.artifactHash) && value.config.artifactHash!=='0'.repeat(64),'RELEASE_BINDING');
  check(value.targetRef==='core-page-manual-mark' && value.planTarget==='python-intro'
    && Number.isSafeInteger(value.maxObservationAgeSeconds) && value.maxObservationAgeSeconds>0
    && value.maxObservationAgeSeconds<=10 && opaque(value.receiptContract),'RELEASE_TARGET');
  return Object.freeze(structuredClone(value));
}
export function validateRegistration(value,release,now) {
  exact(value,['version','releaseHash','scopeHash','context','targetRef','planTarget','approvalRef']);
  const c=value.context;
  exact(c,['version','previewContextRef','sourceHash','bodyHash','model','approvalBindingHash',
    'expiresAtExclusive','automaticEligibility','paymentAllowed']);
  check(value.version==='clear-peer-registration.1' && value.releaseHash===hash(release)
    && hex(value.scopeHash) && value.scopeHash!=='0'.repeat(64)
    && value.targetRef===release.targetRef && value.planTarget===release.planTarget
    && /^[a-zA-Z0-9_-]{8,80}$/.test(value.approvalRef),'REGISTRATION_BINDING');
  check(c.version==='clear-self-preview-context.1' && opaque(c.previewContextRef)
    && [c.sourceHash,c.bodyHash,c.approvalBindingHash].every(v=>hex(v)&&v!=='0'.repeat(64))
    && c.model===previewModel && c.paymentAllowed===false && c.automaticEligibility===false
    && Number.isSafeInteger(c.expiresAtExclusive) && c.expiresAtExclusive*1000>now
    && c.expiresAtExclusive*1000<=now+120000,'REGISTRATION_CONTEXT');
  const binding=hash({domain:'CLEAR_SELF_PREVIEW_APPROVAL_1',contextRef:c.previewContextRef,scopeHash:value.scopeHash,
    sourceHash:c.sourceHash,bodyHash:c.bodyHash,model:c.model,limitsHash:hash(limits),
    artifactHash:release.config.artifactHash,deploymentEpoch:release.config.deploymentEpoch,
    expiresAtExclusive:c.expiresAtExclusive});
  check(binding===c.approvalBindingHash,'REGISTRATION_APPROVAL_BINDING');
  return Object.freeze(structuredClone(value));
}
