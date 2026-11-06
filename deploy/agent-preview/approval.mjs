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
  const {limits}=await import('./limits.mjs');
  const config=validateConfig(raw);
  const sourceText=readFileSync(sourceFile,'utf8').trim(),p=prepareGeminiStructureRequest(sourceText);
  const prepared={sourceText,model:p.model,bodyHash:p.bodyHash,bindingHash:bindingHash(config),limits};
  if(command==='record-approved-input') {
    // These exact hashes must come from a reviewed, direct user authorization.
    check(process.env.CLEAR_APPROVED_BODY_HASH===p.bodyHash
      && process.env.CLEAR_APPROVED_BINDING_HASH===prepared.bindingHash,'EXACT_APPROVAL_REQUIRED');
    const store=openStore(config.databasePath);
    try {store.register({ref,bodyHash:p.bodyHash,bindingHash:prepared.bindingHash,expires:Date.now()+3600000});}
    finally {store.close();}
  }
  console.log(JSON.stringify({...prepared,approvalRecorded:command==='record-approved-input',approvalRef:ref??null},null,2));
} catch {console.error('PREVIEW_APPROVAL_FAILED');process.exitCode=1;}
