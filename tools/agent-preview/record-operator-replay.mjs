// Records real HTTP replies of the separate-environment stack (existing auth +
// B relay + D) for the browser preview's relay replay. Run with the
// loopback-only preload. CLEAR_D_PREVIEW_ROOT selects the real D snapshot.
//
//   ./tools/node --import ./tests/agent-preview-loopback/loopback-only.mjs tools/agent-preview/record-operator-replay.mjs
//
// The replay is display material: replies from an OFFLINE model transport,
// recorded once. It is not a relay and it does not authenticate anyone.
import {writeFileSync} from 'node:fs';
import {operatorConnectFixture} from '../../tests/agent-preview-loopback/operator-connect-fixture.mjs';
import {OPERATOR_PREVIEW_VERSION as version} from '../../src/agent-preview/operator-relay.mjs';
import {PRESETS, REAL_NOTICE} from '../../web/src/bootcamp/finals-panels/fixtures.js';

export const REPLAY_TEXTS = Object.freeze({
  approvalRequired: '과제를 제출하세요 (승인 전 시연)',
  dFailure: '강의를 완료하세요 (D 오류 시연)',
  expired: '과제를 제출하세요 (만료 시연)',
  unknown: '강의를 완료하세요 (응답 유실 시연)',
});
const PROPOSED = [...PRESETS.map(p => p.source), '강의 수강 또는 과제 제출', '강의수강 후기적기 과제제출', REAL_NOTICE];

async function scope(options, fn) {
  const cleanups = [];
  const t = {after: f => cleanups.push(f), diagnostic() {}};
  try { return await fn(await operatorConnectFixture(t, options)); }
  finally { for (const f of cleanups.reverse()) await f(); }
}
const post = (f, op, path, body) => f.raw('/bootcamp/preview/' + path, {context: op, body: {version, ...body}});
const pick = r => ({status: r.status, body: r.body});

const entries = {};
let mode;
await scope({}, async f => {
  mode = f.mode;
  const op = await f.login(f.operator);
  for (const text of PROPOSED) {
    f.approve(text);
    const prepare = await post(f, op, 'prepare', {sourceText: text});
    const p = prepare.body;
    const generate = await post(f, op, 'generate', {contextRef: p.contextRef, revision: p.revision, bodyHash: p.bodyHash});
    if (generate.status !== 200) throw Error('RECORD_GENERATE ' + text + ' ' + JSON.stringify(generate.body));
    entries[text] = {prepare: pick(prepare), generate: pick(generate)};
  }
  entries[REPLAY_TEXTS.approvalRequired] = {prepare: pick(await post(f, op, 'prepare', {sourceText: REPLAY_TEXTS.approvalRequired}))};
  // Same transport/status path as the real fetch, but the replay never reaches a server.
  const u = REPLAY_TEXTS.unknown;
  f.approve(u);
  entries[u] = {prepare: pick(await post(f, op, 'prepare', {sourceText: u})), generate: {lost: true}};
});
await scope({transport: {execution: 'OFFLINE', async request(model, method) {
  if (method === 'countTokens') return {totalTokens: 10};
  throw Object.assign(Error('GEMINI_HTTP_FAILURE'), {code: 'GEMINI_HTTP_FAILURE'});
}}}, async f => {
  const op = await f.login(f.operator), text = REPLAY_TEXTS.dFailure;
  f.approve(text);
  const prepare = await post(f, op, 'prepare', {sourceText: text}), p = prepare.body;
  entries[text] = {prepare: pick(prepare), generate: pick(await post(f, op, 'generate', {contextRef: p.contextRef, revision: p.revision, bodyHash: p.bodyHash}))};
});
await scope({ttlMs: 800}, async f => {
  const op = await f.login(f.operator), text = REPLAY_TEXTS.expired;
  f.approve(text);
  const prepare = await post(f, op, 'prepare', {sourceText: text}), p = prepare.body;
  await new Promise(r => setTimeout(r, 1000));
  entries[text] = {prepare: pick(prepare), generate: pick(await post(f, op, 'generate', {contextRef: p.contextRef, revision: p.revision, bodyHash: p.bodyHash}))};
});

const replay = {version: 'clear-operator-relay-replay.1', recordedAt: Date.now(), dSide: mode, modelTransport: 'OFFLINE',
  note: 'Recorded HTTP replies of the separate-environment stack. Display material only; not a relay, no authentication, no model call.',
  entries};
const out = new URL('../../web/src/bootcamp/finals-panels/operator-relay-replay.js', import.meta.url);
writeFileSync(out, '// 생성 파일 — tools/agent-preview/record-operator-replay.mjs. 손으로 고치지 않는다.\n'
  + '// 별도 환경(기존 인증 + B 중계 + D, 오프라인 모델 전송)의 실제 HTTP 응답 녹화. 표시용 대역이며\n'
  + '// 중계·인증·모델 호출이 아니다.\n'
  + `export const OPERATOR_RELAY_REPLAY = ${JSON.stringify(replay, null, 1)};\n`);
console.log(JSON.stringify({entries: Object.keys(entries).length, dSide: mode, file: out.pathname}));
