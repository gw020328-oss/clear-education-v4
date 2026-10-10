// Stage 13C is terminally blocked before transport activation.
// This offline guard has no network implementation and cannot make a billable call.
// It deliberately does not read a credential value or import a provider SDK.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { auditSchema } from './schema-audit.mjs';

export const intendedSettings = Object.freeze({
  provider: 'GOOGLE', api: 'Gemini Interactions API',
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
  model: 'gemini-3.8-flash', thinking_level: 'medium', max_output_tokens: 4096,
  parallel_calls: 1, minimum_interval_seconds: 15, retry_count: 0,
  json_repair: false, manual_correction: false, max_cost_usd: 0,
  temperature: 'provider_default', top_p: 'provider_default', top_k: 'provider_default',
  seed: 'not_sent_repeat_identifier_only', tools: 'none', conversation_state: 'none'
});

export function offlineGate() {
  const preflight = JSON.parse(readFileSync(new URL('../artifacts/precheck/summary.json', import.meta.url)));
  if (!preflight.passed) return 'BLOCKED_PRIOR_INTEGRITY';
  return auditSchema().report.status;
}

// Documentary request shape only. Schema failure always prevents construction.
// A future runnable adapter requires a separately approved compatible protocol.
export function buildRequest(input, approvedSchema) {
  const gate = offlineGate();
  if (gate !== 'PASS') throw new Error(gate);
  return {
    model: intendedSettings.model, input,
    response_format: {type: 'text', mime_type: 'application/json', schema: approvedSchema},
    generation_config: {thinking_level: intendedSettings.thinking_level, max_output_tokens: intendedSettings.max_output_tokens},
    stream: false, store: false, background: false
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify({status: offlineGate(), networkEnabled: false, smokeCalls: 0, semanticCalls: 0}));
  process.exitCode = 2;
}
