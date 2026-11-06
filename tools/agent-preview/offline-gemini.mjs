// OFFLINE model transport for the separate local environment. NOT Gemini.
//
// Shape-compatible with D's modelTransport ({execution, request(model, method,
// body, signal)}): countTokens → {totalTokens}, generateContent → a
// Gemini-style candidate whose text is the structured clause JSON.
//
// It behaves like a naive model on purpose: every clause with a recognisable
// condition word is reported SUPPORTED with the first hinted capability. The
// server review (core reviewModelProposal guards) is what holds alternatives,
// substitutions, negations, multiple conditions and unsupported measures.
// D marks the result OFFLINE_TEST_TRANSPORT / actualModelCall:false.
import {capabilityHints, sourceClauses} from '../../src/agent-preview/index.mjs';

export function offlineClauses(sourceText) {
  return sourceClauses(sourceText).map(c => {
    const capability = capabilityHints(c.text)[0] ?? null;
    return capability
      ? {quote: c.text, start: c.start, end: c.end, status: 'SUPPORTED', capability, question: null}
      : {quote: c.text, start: c.start, end: c.end, status: 'UNSUPPORTED', capability: null,
        question: '지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요.'};
  });
}

/** Exact source text from the prepared request body (user part is JSON {sourceText,...}). */
function sourceOf(request) {
  try {
    const value = JSON.parse(request?.contents?.at(-1)?.parts?.[0]?.text ?? '');
    return typeof value?.sourceText === 'string' ? value.sourceText : null;
  } catch { return null; }
}

export function createOfflineGeminiTransport({sourceFor = sourceOf, tokens = 500, onCall = () => {}} = {}) {
  return Object.freeze({
    execution: 'OFFLINE',
    async request(model, method, body, signal) {
      signal?.throwIfAborted?.();
      onCall(method);
      if (method === 'countTokens') return {totalTokens: tokens};
      const sourceText = sourceFor(body);
      if (typeof sourceText !== 'string') throw Object.assign(new Error('GEMINI_HTTP_FAILURE'), {code: 'GEMINI_HTTP_FAILURE'});
      return {candidates: [{finishReason: 'STOP', content: {role: 'model',
        parts: [{text: JSON.stringify({clauses: offlineClauses(sourceText)})}]}}]};
    },
  });
}
