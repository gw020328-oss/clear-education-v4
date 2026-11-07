// Moodle 운영자 조건 초안 패널 — 마운트·연결·무효화·상태 줄
//
// previewRequest 자리는 시험에서만 녹화 재생 fetch(operator-relay-standin)로 채운다.
// 마운트 모듈 자체는 녹화·합성으로 대체하지 않는다 — 포트가 없으면 미연결이다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mountOperatorConditionPanel, MOUNT_PHASE } from '../src/bootcamp/finals-panels/operator-condition-mount.js';
import { createBootcampTransport } from '../src/bootcamp/transport.js';
import { createReplayFetch } from '../src/bootcamp/finals-panels/operator-relay-standin.js';
import { PRESETS } from '../src/bootcamp/finals-panels/fixtures.js';

function installDom() {
  class Node {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.attributes = {}; this.className = ''; this.handlers = {}; this._text = ''; }
    get firstChild() { return this.children[0] ?? null; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent ?? '').join(' '); }
    setAttribute(n, v) { this.attributes[n] = String(v); }
    addEventListener(t, f) { (this.handlers[t] ??= []).push(f); }
    append(...n) { this.children.push(...n); }
    removeChild(n) { this.children = this.children.filter((c) => c !== n); }
  }
  globalThis.document = {
    createElement: (t) => new Node(t), createElementNS: (_n, t) => new Node(t),
    createTextNode: (t) => ({ textContent: String(t), children: [] }),
  };
  return { root: () => new Node('div'), restore: () => { delete globalThis.document; } };
}
function* walk(node) { yield node; for (const c of node.children ?? []) yield* walk(c); }
const settle = async () => { for (let i = 0; i < 40; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const byRole = (node, role) => [...walk(node)].find((n) => n.attributes?.['data-role'] === role);
const clickOn = (btn) => { for (const fn of btn.handlers.click ?? []) fn({}); };
const type = async (root, value) => {
  const ta = [...walk(root)].find((n) => n.tagName === 'TEXTAREA');
  for (const fn of ta.handlers.input ?? []) fn({ target: { value } });
  await new Promise((r) => setTimeout(r, 300)); await settle();
};

const COURSE = 2;
const connected = (over = {}) => ({ status: 'CONNECTED', authenticated: true, role: 'operator', courseId: COURSE, sessionRef: 'session-1', ...over });

/** 연결 상태를 바꿀 수 있는 바깥(A 핸들 대역)과 녹화 재생 previewRequest */
function world({ connection = connected(), withPort = true, gateGenerate = false } = {}) {
  const listeners = new Set();
  const calls = [];
  const gates = [];
  const replay = createReplayFetch();
  const fetchImpl = async (url, init) => {
    calls.push(new URL(url).pathname);
    if (gateGenerate && url.endsWith('/generate')) await new Promise((r) => gates.push(r));
    return replay(url, init);
  };
  const transport = createBootcampTransport({ origin: 'https://replay.clear.invalid', fetchImpl });
  const state = { connection };
  return {
    calls, gates, state,
    ports: {
      courseId: COURSE,
      readConnection: () => state.connection,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      previewRequest: withPort ? (path, options) => transport(path, options) : null,
    },
    change(next) { state.connection = next; for (const fn of listeners) fn(); },
    release() { gates.splice(0).forEach((r) => r()); },
  };
}

test('포트가 없거나 CLEAR 운영자 연결이 아니면 미연결로 닫고 아무것도 보내지 않는다', async () => {
  const dom = installDom();
  try {
    const cases = [
      [world({ withPort: false }), 'NO_PREVIEW_PORT'],
      [world({ connection: null }), 'NOT_SIGNED_IN'],
      // Moodle 로그인만 됐고 CLEAR 지갑 인증은 아직
      [world({ connection: connected({ authenticated: false }) }), 'NOT_SIGNED_IN'],
      [world({ connection: connected({ role: 'participant' }) }), 'NOT_SIGNED_IN'],
      [world({ connection: connected({ courseId: 9 }) }), 'OTHER_COURSE'],
    ];
    for (const [w, reason] of cases) {
      const root = dom.root();
      const m = mountOperatorConditionPanel(root, w.ports);
      const box = byRole(root, 'operator-conditions-unconnected');
      assert.equal(box?.attributes['data-reason'], reason);
      assert.equal(m.phase(), MOUNT_PHASE.UNCONNECTED);
      assert.ok(root.textContent.includes('상태: 미연결'));
      assert.equal([...walk(root)].filter((n) => n.tagName === 'TEXTAREA').length, 0, `${reason}: 입력 칸이 열렸다`);
      assert.equal(byRole(root, 'generate'), undefined);
      assert.deepEqual(w.calls, []);
      assert.ok(!root.textContent.includes('개 조건을 찾았습니다'));
    }
  } finally { dom.restore(); }
});

test('연결되면 한 줄 안내와 패널이 보이고, 「제안 생성」 으로 성공·서버 보류 상태가 된다', async () => {
  const dom = installDom();
  try {
    const w = world(); const root = dom.root();
    const phases = [];
    const m = mountOperatorConditionPanel(root, { ...w.ports, onPhase: (p) => phases.push(p) });
    assert.ok(byRole(root, 'operator-conditions-one-line').textContent.includes('조건 하나당 한 줄'));
    assert.equal(m.phase(), MOUNT_PHASE.IDLE);
    await type(root, PRESETS[0].source);
    assert.deepEqual(w.calls, [], '입력만으로 보냈다');
    clickOn(byRole(root, 'generate')); await settle();
    assert.deepEqual(w.calls, ['/bootcamp/preview/prepare', '/bootcamp/preview/generate']);
    assert.equal(m.phase(), MOUNT_PHASE.SUCCESS);
    assert.ok(phases.includes(MOUNT_PHASE.GENERATING));
    const text = root.textContent;
    assert.ok(text.includes('2개 조건을 찾았습니다'));
    assert.ok(text.includes('Moodle 활동 읽기') || text.includes('강의 활동 완료'));
    assert.ok(byRole(root, 'proposal-facts'), '출처·호출 여부가 없다');
    const run = [...walk(root)].find((n) => n.tagName === 'BUTTON' && n.textContent.includes('표시 전용'));
    assert.equal(run?.attributes.disabled, 'disabled', '표시 전용 잠금이 없다');
    // 서버 보류
    await type(root, '강의 수강 또는 과제 제출');
    clickOn(byRole(root, 'generate')); await settle();
    assert.equal(m.phase(), MOUNT_PHASE.SERVER_HELD);
    assert.ok(root.textContent.includes('서버 보류 사유: ALTERNATIVE'));
    m.destroy();
  } finally { dom.restore(); }
});

test('승인 필요·생성 실패·만료·결과 미확인이 상태 줄과 결과 상자로 구분된다', async () => {
  const dom = installDom();
  try {
    const cases = [
      ['과제를 제출하세요 (승인 전 시연)', MOUNT_PHASE.APPROVAL_REQUIRED, 'relay-outcome'],
      ['강의를 완료하세요 (D 오류 시연)', MOUNT_PHASE.FAILED, 'relay-outcome'],
      ['과제를 제출하세요 (만료 시연)', MOUNT_PHASE.EXPIRED, 'relay-outcome'],
      ['강의를 완료하세요 (응답 유실 시연)', MOUNT_PHASE.UNKNOWN, 'relay-outcome'],
    ];
    for (const [source, phase, role] of cases) {
      const w = world(); const root = dom.root();
      const m = mountOperatorConditionPanel(root, w.ports);
      await type(root, source);
      clickOn(byRole(root, 'generate')); await settle();
      assert.equal(m.phase(), phase, source);
      assert.ok(byRole(root, role), `${source}: 결과 상자가 없다`);
      assert.equal(byRole(root, 'proposal-failed'), undefined, `${source}: 상자가 겹쳤다`);
      m.destroy();
    }
    // 제안자 예외(포트가 계약 밖 값을 던짐) → 일반 생성 실패 상자
    const w = world(); const root = dom.root();
    const m = mountOperatorConditionPanel(root, { ...w.ports, previewRequest: () => { throw new Error('raw sk-live-1 secret'); } });
    await type(root, PRESETS[0].source);
    clickOn(byRole(root, 'generate')); await settle();
    assert.ok(byRole(root, 'relay-outcome') || byRole(root, 'proposal-failed'));
    assert.equal(m.phase(), MOUNT_PHASE.FAILED);
    assert.ok(!root.textContent.includes('sk-live') && !root.textContent.includes('secret'));
    m.destroy();
  } finally { dom.restore(); }
});

test('생성 중 로그아웃하면 미연결로 바뀌고 늦은 응답은 버린다', async () => {
  const dom = installDom();
  try {
    const w = world({ gateGenerate: true }); const root = dom.root();
    const m = mountOperatorConditionPanel(root, w.ports);
    await type(root, PRESETS[0].source);
    clickOn(byRole(root, 'generate')); await settle();
    assert.equal(m.phase(), MOUNT_PHASE.GENERATING);
    w.change(null);                 // 로그아웃
    assert.equal(m.phase(), MOUNT_PHASE.UNCONNECTED);
    w.release(); await settle();
    assert.equal(m.phase(), MOUNT_PHASE.UNCONNECTED, '늦은 응답이 상태를 바꿨다');
    assert.ok(!root.textContent.includes('개 조건을 찾았습니다'), '늦은 응답이 화면에 나왔다');
    m.destroy();
  } finally { dom.restore(); }
});

test('세션·지갑이나 강좌가 바뀌면 이전 결과를 버리고 새로 연다. 준비 응답 뒤 생성 요청도 보내지 않는다', async () => {
  const dom = installDom();
  try {
    const w = world(); const root = dom.root();
    const m = mountOperatorConditionPanel(root, w.ports);
    await type(root, PRESETS[0].source);
    clickOn(byRole(root, 'generate')); await settle();
    assert.equal(m.phase(), MOUNT_PHASE.SUCCESS);
    w.change(connected({ sessionRef: 'session-2' }));
    assert.equal(m.phase(), MOUNT_PHASE.IDLE, '새 세션인데 이전 결과가 남았다');
    assert.ok(!root.textContent.includes('개 조건을 찾았습니다'));
    w.change(connected({ sessionRef: 'session-2', courseId: 7 }));
    assert.equal(m.phase(), MOUNT_PHASE.UNCONNECTED);
    m.destroy();

    // prepare 응답을 기다리는 동안 세션이 바뀌면 generate 는 나가지 않는다
    let releasePrepare;
    const w2 = world(); const root2 = dom.root();
    const gatedPrepare = (path, options) => (path.endsWith('/prepare')
      ? new Promise((r) => { releasePrepare = () => r(w2.ports.previewRequest(path, options)); })
      : w2.ports.previewRequest(path, options));
    const m2 = mountOperatorConditionPanel(root2, { ...w2.ports, previewRequest: gatedPrepare });
    await type(root2, PRESETS[0].source);
    clickOn(byRole(root2, 'generate')); await settle();
    w2.change(connected({ sessionRef: 'session-9' }));
    releasePrepare(); await settle();
    // 끊긴 요청(abort)은 transport 가 보내지 않는다. 어떤 경우든 generate 는 없어야 한다.
    assert.ok(!w2.calls.includes('/bootcamp/preview/generate'), '바뀐 세션으로 generate 가 나갔다');
    assert.equal(m2.phase(), MOUNT_PHASE.IDLE);
    m2.destroy();
  } finally { dom.restore(); }
});

test('화면 종료 뒤에는 요청을 보내지 않고 상태도 바꾸지 않는다', async () => {
  const dom = installDom();
  try {
    const w = world({ gateGenerate: true }); const root = dom.root();
    const m = mountOperatorConditionPanel(root, w.ports);
    await type(root, PRESETS[0].source);
    clickOn(byRole(root, 'generate')); await settle();
    m.destroy();
    w.release(); await settle();
    w.change(connected({ sessionRef: 'session-3' }));
    assert.equal(w.calls.length, 2);
    assert.ok(root.textContent.includes('화면이 닫혔습니다'));
    assert.ok(!root.textContent.includes('개 조건을 찾았습니다'));
  } finally { dom.restore(); }
});

for (const mode of ['silent-logout', 'reader-throws', 'other-course', 'other-session', 'async-reader']) {
  test(`현재 연결 재검사: ${mode} 뒤에는 이전 패널이 요청하지 않는다`, async () => {
    const dom=installDom(), w=world(), root=dom.root();let broken=false;
    const m=mountOperatorConditionPanel(root,{...w.ports,subscribe:null,readConnection:()=>{
      if(broken){if(mode==='async-reader')return Promise.reject(Error('unavailable'));throw Error('unavailable');}
      return w.state.connection;
    }});
    try {
      await type(root,PRESETS[0].source);
      if(mode==='reader-throws'||mode==='async-reader')broken=true;
      else w.state.connection=mode==='other-course'?connected({courseId:7}):mode==='other-session'?connected({sessionRef:'session-2'}):null;
      clickOn(byRole(root,'generate'));await settle();
      assert.deepEqual(w.calls,[]);assert.notEqual(m.phase(),MOUNT_PHASE.SUCCESS);
      assert.ok(!root.textContent.includes('개 조건을 찾았습니다'));
    }finally{m.destroy();dom.restore();}
  });
}
test('알림 없는 로그아웃 뒤 늦은 generate 응답은 표시하지 않는다',async()=>{
  const dom=installDom(),w=world({gateGenerate:true}),root=dom.root();const m=mountOperatorConditionPanel(root,w.ports);
  try{await type(root,PRESETS[0].source);clickOn(byRole(root,'generate'));await settle();
    w.state.connection=null;w.release();await settle();
    assert.equal(m.phase(),MOUNT_PHASE.UNCONNECTED);assert.ok(!root.textContent.includes('개 조건을 찾았습니다'));
  }finally{m.destroy();dom.restore();}
});
test('crypto 변환 중 알림 없는 연결 변경도 결과 채택 전에 폐기한다',async()=>{
  const dom=installDom(),w=world(),root=dom.root();let converting=false,digests=0;
  const original=crypto.subtle.digest;
  crypto.subtle.digest=function(...args){
    if(converting){digests++;queueMicrotask(()=>{w.state.connection=null;});}
    return original.apply(this,args);
  };
  const m=mountOperatorConditionPanel(root,{...w.ports,previewRequest:async(path,options)=>{
    const reply=await w.ports.previewRequest(path,options);
    if(path.endsWith('/generate'))converting=true;
    return reply;
  }});
  try{await type(root,PRESETS[0].source);clickOn(byRole(root,'generate'));await settle();
    assert.ok(digests>0);assert.equal(m.phase(),MOUNT_PHASE.UNCONNECTED);
    assert.ok(!root.textContent.includes('개 조건을 찾았습니다'));
  }finally{crypto.subtle.digest=original;m.destroy();dom.restore();}
});
