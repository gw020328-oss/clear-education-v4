// Gemini 조건 구조화 서버 연결 — 오프라인 시험
//
// 실제 Gemini 를 부르지 않는다. 기존 developerTransport 에 시험용 fetch 와 키 읽기만
// 주입하고(실제 키·네트워크 없음), 승인은 bodyHash 에 묶인 단회 소비 대역으로 둔다.
//   ./tools/node --import ./tests/agent-preview/network-block.mjs --test tests/agent-preview/condition-structuring.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceClauses, clauseGuardKinds, structureSynthetic} from '../../src/agent-preview/index.mjs';
import {prepareGeminiStructureRequest} from '../../src/agent-preview/gemini-preparation.mjs';
import {developerTransport} from '../../src/ai-policy/gemini-evaluation.mjs';
import {
  structureWithGemini, executeReviewedProposal, planReviewedProposal, rowsFromDraft, prepareStructuring, TOOL_SELECTION,
} from '../../src/agent-preview/condition-structuring.mjs';

const CAP = {
  activity: 'MOODLE_ACTIVITY_COMPLETION.1', assignment: 'MOODLE_ASSIGNMENT_SUBMISSION.1',
  reflection: 'REFLECTION_REQUIRED_TOPICS.1', hackerrank: 'HACKERRANK_CERTIFICATE_HOLDING.1',
};

/** 모델 답 행. 문자열이면 SUPPORTED + 그 조건, 객체면 그 상태와 질문 */
const rowsFor = (sourceText, labels) => sourceClauses(sourceText).map(({text, start, end}, i) => {
  const label = labels[i];
  return typeof label === 'string'
    ? {quote: text, start, end, status: 'SUPPORTED', capability: CAP[label], question: null}
    : {quote: text, start, end, status: label.status, capability: null, question: label.question};
});
const reply = rows => ({candidates: [{finishReason: 'STOP', content: {role: 'model', parts: [{text: JSON.stringify({clauses: rows})}]}}]});

/**
 * 시험용 호스트. 승인은 정확한 bodyHash 에 묶이고 한 번만 쓰인다. 전송은 기존
 * developerTransport 를 그대로 쓰되 fetch·키만 시험 대역이다.
 */
function offlineHost(answer, {fail = null} = {}) {
  const approvals = new Map();
  const sent = [];
  const transport = developerTransport({
    keyReader: () => 'offline-test-key',
    fetchImpl: async (url, init) => {
      sent.push({url, body: JSON.parse(init.body)});
      if (fail === 'network') throw new Error('offline network down');
      if (fail === 'http') return new Response('{"error":{"status":"UNAVAILABLE","message":"x"}}', {status: 503});
      const {sourceText} = JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
      return new Response(JSON.stringify(answer(sourceText)), {status: 200});
    },
  });
  return {
    sent,
    approve(ref, sourceText) { approvals.set(ref, {bodyHash: prepareGeminiStructureRequest(sourceText).bodyHash, used: false}); },
    async claimAndDispatch({approvalRef, model, bodyHash, body, method, signal}) {
      const grant = approvals.get(approvalRef);
      if (!grant || grant.used || grant.bodyHash !== bodyHash) {
        throw Object.assign(new Error('APPROVAL_REQUIRED_OR_SPENT'), {code: 'APPROVAL_REQUIRED_OR_SPENT'});
      }
      grant.used = true; // 보내기 전에 소비한다. 실패해도 되살리지 않는다
      return transport.request(model, method, body, signal);
    },
  };
}

async function propose(sourceText, labels, options = {}) {
  const host = offlineHost(src => reply(rowsFor(src, labels)), options);
  host.approve('approval-1', sourceText);
  const result = await structureWithGemini(sourceText, {approvalRef: 'approval-1', claimAndDispatch: host.claimAndDispatch,
    transportExecution: 'OFFLINE_TEST_TRANSPORT'});
  return {host, result};
}

const approveAndRun = (sourceText, result) => executeReviewedProposal({
  sourceText, rows: rowsFromDraft(result.draft), reviewedHash: result.proposal.proposalHash, actualModelCall: result.actualModelCall,
});

// ── 정규화 ─────────────────────────────────────────────────────────────

test('같은 뜻의 서로 다른 안내문을 같은 지원 조건·같은 도구로 정규화한다', async () => {
  const notices = [
    '지정 강의를 끝까지 들으세요; 실습 과제를 Moodle에 제출하세요',
    '강의 영상 시청을 완료해야 합니다\nMoodle 과제 업로드 필수',
  ];
  const tools = [];
  for (const notice of notices) {
    const {result} = await propose(notice, ['activity', 'assignment']);
    assert.equal(result.stage, 'PROPOSED');
    assert.equal(result.proposal.heldClauses, 0);
    assert.deepEqual(result.proposal.clauses.map(c => c.capability), [CAP.activity, CAP.assignment]);
    assert.equal(result.proposal.status, 'OPERATOR_REVIEW_REQUIRED', '운영자 확인 전에는 실행 준비가 아니다');
    const run = approveAndRun(notice, result);
    assert.equal(run.validation.ok, true);
    tools.push(run.steps.map(s => s.tool));
  }
  assert.deepEqual(tools[0], tools[1]);
  assert.deepEqual(tools[0], ['moodle.activity.public', 'moodle.assignment.public']);
});

test('강의·과제에 회고를 추가하면 검사를 통과한 계획의 도구 구성이 달라진다', async () => {
  const base = '지정 강의를 끝까지 들으세요; 실습 과제를 Moodle에 제출하세요';
  const more = `${base}; 수행 내용과 문제 해결 과정, 배운 점을 담은 회고를 작성하세요`;
  const a = approveAndRun(base, (await propose(base, ['activity', 'assignment'])).result);
  const b = approveAndRun(more, (await propose(more, ['activity', 'assignment', 'reflection'])).result);
  assert.equal(a.validation.ok && b.validation.ok, true);
  assert.deepEqual(a.steps.map(s => s.tool), ['moodle.activity.public', 'moodle.assignment.public']);
  assert.deepEqual(b.steps.map(s => s.tool), ['moodle.activity.public', 'moodle.assignment.public', 'reflection.topics.public']);
  assert.notEqual(a.planHash, b.planHash);
});

test('도구는 모델이 아니라 코드가 등록 명세에서 고르고, 실행 원천은 공개 합성 자료로 표시한다', async () => {
  const notice = '지정 강의를 끝까지 들으세요';
  const {host, result} = await propose(notice, ['activity']);
  // 모델에 보낸 본문은 준비한 본문 그대로다 — 프롬프트·스키마를 바꾸지 않았다
  assert.deepEqual(host.sent[0].body, prepareGeminiStructureRequest(notice).body);
  assert.match(host.sent[0].url, /gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(result.proposal.toolSelection, TOOL_SELECTION);
  assert.equal(result.proposal.clauses[0].tool, 'moodle.activity.public');
  const run = approveAndRun(notice, result);
  assert.deepEqual(run.steps.map(s => s.selectedBy), ['CODE_TOOL_MANIFEST']);
  assert.equal(run.execution.executionMode, 'PUBLIC_SYNTHETIC');
  assert.equal(run.execution.toolSource, 'PUBLIC_FIXTURE');
  assert.equal(run.execution.actualMoodleQuery, false);
  assert.equal(run.execution.actualReclaimVerification, false);
  assert.equal(run.paymentAllowed, false);
});

// ── 실행 준비로 통과하면 안 되는 것 ───────────────────────────────────────

test('원문 인용·문자 위치 오류와 조항 누락은 실행 준비로 통과하지 않는다', async () => {
  const notice = '지정 강의를 끝까지 들으세요; 실습 과제를 Moodle에 제출하세요';
  for (const [mutate, code] of [
    [rows => { rows[0].quote = '지정 강의를 들으세요'; }, 'MODEL_SOURCE_SPAN'],
    [rows => { rows[1].start += 1; }, 'MODEL_SOURCE_SPAN'],
    [rows => { rows.pop(); }, 'MODEL_CLAUSE_COVERAGE'],
  ]) {
    const host = offlineHost(src => { const rows = rowsFor(src, ['activity', 'assignment']); mutate(rows); return reply(rows); });
    host.approve('approval-1', notice);
    const result = await structureWithGemini(notice, {approvalRef: 'approval-1', claimAndDispatch: host.claimAndDispatch});
    assert.equal(result.stage, 'MODEL_RESPONSE_REJECTED', code);
    assert.equal(result.modelCall.errorCode, code);
    assert.equal(result.proposal, null);
  }
});

test('모델이 지원이라고 해도 대안·대체·부정·수치·기한·복수 조건·미지원 기준은 확인 필요로 남는다', async () => {
  for (const [notice, label, kind, reason] of [
    ['강의 수강 또는 과제 제출', 'activity', 'ALTERNATIVE', 'NEEDS_CLARIFICATION'],
    ['과제 제출 대신 후기 작성', 'assignment', 'SUBSTITUTE', 'NEEDS_CLARIFICATION'],
    ['과제 제출은 필요 없습니다', 'assignment', 'NEGATION', 'NEEDS_CLARIFICATION'],
    ['강의 3개 이상 수강', 'activity', 'THRESHOLD', 'NEEDS_CLARIFICATION'],
    ['11월 30일까지 과제 제출', 'assignment', 'DEADLINE', 'NEEDS_CLARIFICATION'],
    ['강의수강 후기적기 과제제출', 'activity', 'MULTIPLE_CONDITIONS', 'NEEDS_CLARIFICATION'],
    ['실습 과제를 Moodle에 제출하세요', 'activity', 'CAPABILITY_CONTRADICTION', 'NEEDS_CLARIFICATION'],
    ['출석률 90% 이상', 'activity', 'UNSUPPORTED_MEASURE', 'UNSUPPORTED'],
    ['(선택) 수료 후기 작성', 'reflection', 'OPTIONAL', 'NEEDS_CLARIFICATION'],
  ]) {
    const {result} = await propose(notice, [label]);
    assert.equal(result.stage, 'PROPOSED', notice);
    const [clause] = result.proposal.clauses;
    assert.equal(clause.status, reason, notice);
    assert.equal(clause.capability, null, `${notice} 이 필수 조건으로 바뀌었다`);
    assert.equal(clause.quote, notice, '원문을 유지해야 한다');
    assert.ok(clause.serverGuard.kinds.includes(kind), `${notice}: ${clause.serverGuard.kinds}`);
    assert.equal(clause.serverGuard.modelCapability, CAP[label], '모델이 고른 것은 기록만 한다');
    assert.ok(clause.question.length > 0);
    assert.equal(result.proposal.operatorCanApprove, false);
    // 같은 지문으로 승인해도 실행되지 않는다
    assert.throws(() => approveAndRun(notice, result), /DRAFT_NOT_READY/, notice);
  }
});

test('다른 조항을 읽었다고 대안 조항이 섞인 초안이 실행 준비가 되지 않는다', async () => {
  const notice = '지정 강의를 끝까지 들으세요; 강의 수강 또는 과제 제출';
  const {result} = await propose(notice, ['activity', 'activity']);
  assert.deepEqual(result.proposal.clauses.map(c => c.status), ['SUPPORTED', 'NEEDS_CLARIFICATION']);
  assert.equal(result.proposal.status, 'NEEDS_CLARIFICATION');
  assert.equal(result.proposal.heldClauses, 1);
  assert.throws(() => approveAndRun(notice, result), /DRAFT_NOT_READY/);
});

test('모델이 미지원으로 답한 조항은 그대로 미지원이고 실행되지 않는다', async () => {
  const notice = '취업 면접 1회 참여';
  const {result} = await propose(notice, [{status: 'UNSUPPORTED', question: '취업 면접 참여는 지원 조건이 아닙니다.'}]);
  assert.equal(result.proposal.status, 'UNSUPPORTED');
  assert.equal(result.proposal.clauses[0].serverGuard, null, '모델이 이미 보류한 것은 서버 보류로 적지 않는다');
  assert.throws(() => approveAndRun(notice, result), /DRAFT_NOT_READY/);
});

test('정규 문장과 평범한 지시문에는 서버 보류가 걸리지 않는다', () => {
  for (const text of ['Moodle 활동 완료', 'Moodle 과제 제출', '회고에 수행 내용, 문제해결 과정, 배운 점 포함',
    'HackerRank Python (Basic) 인증서 보유', '지정 강의를 끝까지 들으세요', '1주차 강의 완료', 'Moodle 과제 업로드 필수']) {
    assert.deepEqual(clauseGuardKinds(text, null), [], text);
  }
  // 규칙 기반 합성 초안은 이 검사를 거치지 않는다(닫힌 문법)
  assert.equal(structureSynthetic('Moodle 활동 완료; Moodle 과제 제출').status, 'READY');
});

// ── 입력이 바뀌면 재사용하지 않는다 ──────────────────────────────────────

test('입력을 바꾸면 이전 원문의 승인·제안·결과를 재사용하지 않는다', async () => {
  const a = '지정 강의를 끝까지 들으세요';
  const b = '지정 강의를 끝까지 들으세요; 실습 과제를 Moodle에 제출하세요';
  const host = offlineHost(src => reply(rowsFor(src, src === a ? ['activity'] : ['activity', 'assignment'])));
  host.approve('approval-a', a);
  // A 의 승인으로 B 를 보낼 수 없다 — 보내기 전에 막힌다
  const crossed = await structureWithGemini(b, {approvalRef: 'approval-a', claimAndDispatch: host.claimAndDispatch});
  assert.equal(crossed.stage, 'MODEL_CALL_FAILED');
  assert.equal(crossed.modelCall.errorCode, 'APPROVAL_REQUIRED_OR_SPENT');
  assert.equal(host.sent.length, 0);
  // A 는 한 번만
  const first = await structureWithGemini(a, {approvalRef: 'approval-a', claimAndDispatch: host.claimAndDispatch});
  assert.equal(first.stage, 'PROPOSED');
  const again = await structureWithGemini(a, {approvalRef: 'approval-a', claimAndDispatch: host.claimAndDispatch});
  assert.equal(again.stage, 'MODEL_CALL_FAILED');
  assert.equal(host.sent.length, 1);
  // A 의 제안·검토 지문으로 B 를 계획할 수 없다
  assert.throws(() => planReviewedProposal({sourceText: b, rows: rowsFromDraft(first.draft), reviewedHash: first.proposal.proposalHash}),
    /MODEL_CLAUSE_COVERAGE|MODEL_SOURCE_SPAN/);
  host.approve('approval-b', b);
  const fresh = await structureWithGemini(b, {approvalRef: 'approval-b', claimAndDispatch: host.claimAndDispatch});
  assert.throws(() => planReviewedProposal({sourceText: b, rows: rowsFromDraft(fresh.draft), reviewedHash: first.proposal.proposalHash}),
    /DRAFT_NOT_READY/, 'A 의 검토 지문이 B 를 승인했다');
  // 원문 끝에 한 글자만 바뀌어도 이전 행으로는 안 된다
  assert.throws(() => planReviewedProposal({sourceText: `${a}.`, rows: rowsFromDraft(first.draft), reviewedHash: first.proposal.proposalHash}),
    /MODEL_SOURCE_SPAN/);
});

// ── 모델 호출 실패 ────────────────────────────────────────────────────────

test('모델 호출 실패를 규칙 기반 결과로 바꾸지 않고 성공으로 표시하지 않는다', async () => {
  // 규칙이 읽을 수 있는 정규 문장이어도 대신 채우지 않는다
  const notice = 'Moodle 활동 완료';
  for (const [fail, code] of [['network', 'GEMINI_NETWORK_FAILURE'], ['http', 'GEMINI_HTTP_FAILURE']]) {
    const {host, result} = await propose(notice, ['activity'], {fail});
    assert.equal(host.sent.length, 1);
    assert.equal(result.stage, 'MODEL_CALL_FAILED');
    assert.equal(result.modelCall.attempted, true);
    assert.equal(result.modelCall.succeeded, false);
    assert.equal(result.modelCall.errorCode, code);
    assert.equal(result.fallback, 'NONE');
    assert.equal(result.proposal, null);
    assert.equal(result.draft, null);
  }
  const none = await structureWithGemini(notice, {});
  assert.equal(none.stage, 'APPROVAL_REQUIRED');
  assert.equal(none.modelCall.attempted, false);
  assert.equal(none.proposal, null);
  // 잘린 응답은 받은 응답이지만 거부한다
  const host = offlineHost(src => { const r = reply(rowsFor(src, ['activity'])); r.candidates[0].finishReason = 'MAX_TOKENS'; return r; });
  host.approve('approval-1', notice);
  const cut = await structureWithGemini(notice, {approvalRef: 'approval-1', claimAndDispatch: host.claimAndDispatch});
  assert.equal(cut.stage, 'MODEL_RESPONSE_REJECTED');
  assert.equal(cut.modelCall.errorCode, 'GEMINI_RESPONSE_PARTS');
});

test('실제 호출과 오프라인 시험을 구분해 기록한다', async () => {
  const notice = '지정 강의를 끝까지 들으세요';
  const prepared = prepareStructuring(notice);
  assert.equal(prepared.actualModelCall, false);
  assert.equal(prepared.bodyHash, prepareGeminiStructureRequest(notice).bodyHash);
  assert.deepEqual(prepared.limits, {maxGenerationCalls: 1, automaticRetries: 0, maxOutputTokens: 2048});
  const {result} = await propose(notice, ['activity']);
  assert.equal(result.actualModelCall, false);
  assert.equal(result.modelCall.execution, 'OFFLINE_TEST_TRANSPORT');
  assert.equal(result.modelCall.provenance, 'HOST_SUPPLIED_PROVIDER_RESPONSE');
  assert.equal(approveAndRun(notice, result).actualModelCall, false);
});
