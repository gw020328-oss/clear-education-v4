// Capability discovery only. No model inference, secret values, or auth-file reads.
import { spawnSync } from 'node:child_process';
const names = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];
const environmentCredentialPresence = Object.fromEntries(names.map(n => [n, Boolean(process.env[n])]));
const executables = Object.fromEntries(['codex', 'ollama'].map(n => [n, spawnSync('/usr/bin/which', [n], { stdio: 'ignore' }).status === 0]));
let localModelEndpoint;
try {
  const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
  const body = await r.json();
  localModelEndpoint = { url: 'http://127.0.0.1:11434/api/tags', httpStatus: r.status, accessible: r.ok, models: (body.models ?? []).map(m => ({ name: m.name, size: m.size })) };
} catch {
  localModelEndpoint = { url: 'http://127.0.0.1:11434/api/tags', accessible: false, code: 'LOCAL_MODEL_LIST_UNREACHABLE' };
}
process.stdout.write(JSON.stringify({ checkedAt: new Date().toISOString(), environmentCredentialPresence, executables, localModelEndpoint,
  scope: 'Only environment name presence, executable discovery and local read-only model listing; credential values/auth files not accessed',
  inferenceCalls: 0, replayResponses: 0, realHumanParticipants: 0,
  limitations: ['No generation smoke test or measured latency/quality', 'CLI presence does not establish authenticated or licensed product API access', 'Absent environment variables do not prove absence of credentials elsewhere', 'This coding/research assistant session is not a controlled product AI evaluation'],
  next: 'Stage9 freezes public source dataset/evaluation first. Stage10 can test accessible local inference, separately labeling real calls and any replays.'
}, null, 2) + '\n');
