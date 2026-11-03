import {strictJson} from '../hackerrank-evidence/values.mjs';
import {buildPlan, hash, reviewModelProposal, TOOL_MANIFEST} from './index.mjs';
import {prepareGeminiStructureRequest} from './gemini-preparation.mjs';
import {executeExistingModuleDemo} from './existing-module-demo.mjs';

// Host hands this adapter the reply from its separately authorized dispatch.
// Fixture entry and host response entry have distinct provenance labels.
function decode({sourceText, bodyHash, reply}, provenance, reviewedHash) {
  const prepared = prepareGeminiStructureRequest(sourceText);
  if (bodyHash !== prepared.bodyHash) throw Error('GEMINI_REQUEST_BINDING');
  hash(reply);
  const candidates = reply?.candidates;
  if (reply?.promptFeedback?.blockReason || !Array.isArray(candidates) || candidates.length !== 1) {
    throw Error('GEMINI_CANDIDATES');
  }
  const {finishReason, content} = candidates[0] ?? {};
  const parts = content?.parts;
  if (finishReason !== 'STOP' || ![undefined, '', 'model'].includes(content?.role)
      || !Array.isArray(parts) || parts.length !== 1) {
    throw Error('GEMINI_RESPONSE_PARTS');
  }
  const part = parts[0];
  // generateContent permits a signature alongside final text. It is opaque
  // provider metadata and is neither interpreted nor carried into the draft.
  if (typeof part?.text !== 'string'
      || Object.keys(part).some(key => !['text', 'thought', 'thoughtSignature'].includes(key))
      || (Object.hasOwn(part, 'thought') && part.thought !== false)
      || (Object.hasOwn(part, 'thoughtSignature')
        && (typeof part.thoughtSignature !== 'string' || !part.thoughtSignature.length))) {
    throw Error('GEMINI_RESPONSE_PARTS');
  }
  const parsed = strictJson(part.text, 16384);
  if (!parsed || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.clauses)) {
    throw Error('GEMINI_RESPONSE_SCHEMA');
  }
  return {draft: reviewModelProposal(sourceText, parsed.clauses, reviewedHash), provenance};
}

export function inspectFixtureReply(packet) {
  return decode(packet, 'OFFLINE_RESPONSE_FIXTURE');
}

export function inspectHostGeminiReply(packet) {
  return decode(packet, 'HOST_SUPPLIED_PROVIDER_RESPONSE');
}

export async function executeReviewedGeminiPreview(packet, reviewedHash, {fixture = false} = {}) {
  const {draft, provenance} = decode(packet, fixture ? 'OFFLINE_RESPONSE_FIXTURE' : 'HOST_SUPPLIED_PROVIDER_RESPONSE', reviewedHash);
  if (draft.status !== 'READY') return {draft, provenance, plan: null, execution: null};
  const plan = buildPlan(draft);
  const execution = await executeExistingModuleDemo(plan, draft);
  const certificateTool = TOOL_MANIFEST.find(entry => entry.capability === 'HACKERRANK_CERTIFICATE_HOLDING.1').tool;
  for (const [index, step] of plan.steps.entries()) {
    if (step.tool !== certificateTool) continue;
    const {runCertificateDemo} = await import('./packaged-modules.mjs');
    execution.modules[index] = {
      conditionId: step.conditionId,
      module: 'hackerrank-evidence/verifier',
      executionMode: 'PUBLIC_SYNTHETIC',
      ...await runCertificateDemo()
    };
  }
  execution.existingModuleCoverage = 'SELECTED_MODULES_EXECUTED';
  return {draft, provenance, plan, execution};
}

// Server-only integration seam. The host owns authentication, exact-body
// approval and atomic consumption before dispatch. No default network client.
export async function requestGeminiPreview(sourceText, {approvalRef, claimAndDispatch, signal} = {}) {
  const prepared = prepareGeminiStructureRequest(sourceText);
  if (typeof approvalRef !== 'string' || !approvalRef.trim() || typeof claimAndDispatch !== 'function') {
    throw Error('GEMINI_HOST_APPROVAL_REQUIRED');
  }
  signal?.throwIfAborted();
  const {model, bodyHash, body} = prepared;
  const reply = await claimAndDispatch({approvalRef, model, bodyHash, body, method: 'generateContent', signal});
  signal?.throwIfAborted();
  const packet = {sourceText, bodyHash, reply};
  return {packet, ...inspectHostGeminiReply(packet)};
}
