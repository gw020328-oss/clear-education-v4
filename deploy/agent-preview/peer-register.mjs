import {readFileSync} from 'node:fs';
import {verifyArtifact,check} from './artifact.mjs';
process.umask(0o077);
try {
  check(process.version==='v24.21.0','RUNTIME_VERSION');
  const raw=JSON.parse(readFileSync(process.env.CLEAR_PEER_RELEASE,'utf8'));
  verifyArtifact(raw.config?.artifactHash);
  const {readPrivateJson,validateRelease,validateRegistration}=await import('./peer-release.mjs');
  const {hash}=await import('./vendor/b-peer/contract.mjs');
  const {openStore}=await import('./store.mjs');
  const release=validateRelease(readPrivateJson(process.env.CLEAR_PEER_RELEASE));
  const registration=validateRegistration(readPrivateJson(process.env.CLEAR_PEER_REGISTRATION),release,Date.now());
  const context=registration.context;
  check(process.env.CLEAR_APPROVED_BODY_HASH===context.bodyHash
    && process.env.CLEAR_APPROVED_BINDING_HASH===context.approvalBindingHash
    && process.env.CLEAR_APPROVED_RELEASE_HASH===hash(release),'EXACT_APPROVAL_REQUIRED');
  const store=openStore(release.config.databasePath);
  try {
    validateRegistration(registration,release,Date.now());
    store.register({ref:registration.approvalRef,bodyHash:context.bodyHash,bindingHash:context.approvalBindingHash,
      expires:context.expiresAtExclusive*1000});
  } finally {store.close();}
  console.log('PEER_APPROVAL_REGISTERED');
} catch {console.error('PEER_APPROVAL_FAILED');process.exitCode=1;}
