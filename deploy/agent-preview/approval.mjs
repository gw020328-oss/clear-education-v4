import {readFileSync} from 'node:fs';
import {verifyArtifact,check} from './artifact.mjs';

// Local administration only. Never mounted as an HTTP route. The CLI cannot infer user approval.
process.umask(0o077);
const [command,sourceFile,ref]=process.argv.slice(2);
try {
  check(process.version==='v24.21.0','RUNTIME_VERSION');
  check(['prepare','record-approved-input'].includes(command),'COMMAND');
  const raw=JSON.parse(readFileSync(process.env.CLEAR_PREVIEW_CONFIG,'utf8'));
  verifyArtifact(raw.artifactHash,process.env.CLEAR_PREVIEW_BUILD_MANIFEST);
  const {validateConfig,bindingHash}=await import('./config.mjs');
  const {openStore}=await import('./store.mjs');
  const {prepareGeminiStructureRequest}=await import('../../src/agent-preview/gemini-preparation.mjs');
  const {hash}=await import('../../src/agent-preview/index.mjs');
  const {limits,previewModel}=await import('./limits.mjs');
  const config=validateConfig(raw);
  const sourceText=readFileSync(sourceFile,'utf8').trim(),p=prepareGeminiStructureRequest(sourceText);
  check(p.model===previewModel,'MODEL_PROFILE_CHANGED');
  const prepared={sourceText,model:p.model,bodyHash:p.bodyHash,bindingHash:bindingHash(config),limits};
  // Non-secret values the CLEAR server owner copies into clear-operator-preview-scope.1.
  // Computed here, after artifact verification, from the same validated profile the server uses.
  const scopeValues={publicOrigin:config.publicOrigin,
    dActor:{institutionId:config.institutionId,courseId:config.courseId,operatorId:config.operatorId},
    deployment:{artifactHash:config.artifactHash,deploymentEpoch:config.deploymentEpoch,
      bindingHash:prepared.bindingHash,model:previewModel,limitsHash:hash(limits)}};
  let expires=null;
  if(command==='record-approved-input') {
    // These exact hashes must come from a reviewed, direct user authorization.
    check(process.env.CLEAR_APPROVED_BODY_HASH===p.bodyHash
      && process.env.CLEAR_APPROVED_BINDING_HASH===prepared.bindingHash,'EXACT_APPROVAL_REQUIRED');
    expires=Date.now()+3600000;
    const store=openStore(config.databasePath);
    try {store.register({ref,bodyHash:p.bodyHash,bindingHash:prepared.bindingHash,expires});}
    finally {store.close();}
  }
  // approvalExpiresAt (ms) is the exact D expiry; the CLEAR owner registry must use it or an earlier time.
  console.log(JSON.stringify({...prepared,scopeValues,approvalRecorded:expires!==null,
    approvalRef:expires!==null?ref:null,approvalExpiresAt:expires},null,2));
} catch {console.error('PREVIEW_APPROVAL_FAILED');process.exitCode=1;}
