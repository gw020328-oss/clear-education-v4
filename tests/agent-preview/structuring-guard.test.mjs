// Model reply guard: schema/instruction state the capability/question rule; post-reply rejections are public fixed codes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareGeminiStructureRequest} from '../../src/agent-preview/gemini-preparation.mjs';
import {TOOL_MANIFEST} from '../../src/agent-preview/index.mjs';

test('structuring request pins capability to the manifest and states the null rule', () => {
  const p = prepareGeminiStructureRequest('과제를 제출할 것');
  const row = p.body.generationConfig.responseSchema.properties.clauses.items.properties;
  assert.deepEqual(row.capability, {type: 'STRING', nullable: true, enum: TOOL_MANIFEST.map(m => m.capability)});
  const text = p.body.systemInstruction.parts[0].text;
  assert.match(text, /For SUPPORTED, capability is exactly one listed capability and question is null\./);
  assert.match(text, /For UNSUPPORTED or NEEDS_CLARIFICATION, capability is null/);
});

test('post-reply validation codes are public fixed codes, not REQUEST_REJECTED', () => {
  const src = readFileSync(new URL('../../deploy/agent-preview/http-server.mjs', import.meta.url), 'utf8');
  for (const code of ['MODEL_QUESTION', 'MODEL_CAPABILITY', 'MODEL_SOURCE_SPAN', 'MODEL_CLAUSE_COVERAGE', 'GEMINI_RESPONSE_PARTS', 'GEMINI_KEY_MISSING'])
    assert.ok(src.includes(`'${code}'`), code);
});
