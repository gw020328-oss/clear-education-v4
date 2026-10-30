// 화면을 실제로 그려 보는 시험
//
// 왜 필요한가. 앞서 `pair` 를 `item` 으로 바꾸다가 하나를 빠뜨렸는데,
// **import 만 해보는 확인은 그걸 못 잡았다.** 모듈은 멀쩡히 읽히고, 그 함수를
// 부르는 순간에야 ReferenceError 가 났다. 화면은 통째로 안 그려졌고 브라우저를
// 열어 보고서야 알았다.
//
// 그래서 여기서는 두 화면을 **두 상황 × 두 역할로 전부 그려 본다.** 생김새를
// 보는 게 아니라 "던지지 않고 끝까지 그려지는가"만 본다. 그것만으로도 위와
// 같은 사고는 다시 안 난다.
//
// jsdom 같은 의존성은 쓰지 않는다. web/ 은 npm 없는 트리다. 대신 el() 이
// 쓰는 document API 만 아주 작게 흉내 낸다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BOOTCAMP_CASES, bootcampView } from '../src/fixtures/bootcamp.js';

/** el() 과 clear() 가 건드리는 것만 있는 최소 DOM */
function installDom() {
  class Node {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.attributes = {};
      this.className = '';
      this._text = '';
    }

    get firstChild() { return this.children[0] ?? null; }

    set textContent(value) { this._text = String(value); this.children = []; }

    get textContent() {
      return this._text + this.children.map((c) => c.textContent ?? '').join('');
    }

    setAttribute(name, value) { this.attributes[name] = String(value); }

    addEventListener() { /* 버튼을 누르지는 않는다 */ }

    append(...nodes) { for (const n of nodes) this.children.push(n); }

    removeChild(node) { this.children = this.children.filter((c) => c !== node); }
  }

  globalThis.document = {
    createElement: (tag) => new Node(tag),
    // 로고와 아이콘이 SVG 라 이게 필요하다. 없으면 화면이 통째로 안 그려진다.
    createElementNS: (_ns, tag) => new Node(tag),
    createTextNode: (text) => ({ textContent: String(text), children: [] }),
  };
  globalThis.crypto ??= { getRandomValues: (a) => a.fill(7) };
  return () => { delete globalThis.document; };
}

const CASES = Object.keys(BOOTCAMP_CASES);

test('학생 화면이 모든 상황에서 끝까지 그려진다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    for (const id of CASES) {
      for (const conn of [null, { state: 'OFFLINE' }, { state: 'SIGNED_OUT' },
        { state: 'LIVE', address: '0xabc', role: 'PARTICIPANT' }]) {
        const node = studentSection({ view: bootcampView(id, 'participant'), conn });
        const text = node.textContent;
        assert.ok(text.includes('환급 조건'), `${id} / ${conn?.state}`);
        // 조건 네 개가 카드로 다 있어야 한다
        for (const name of ['강의 수강', '과제 제출', '회고', 'HackerRank 인증서']) {
          assert.ok(text.includes(name), `${id} / ${conn?.state} 에 ${name} 이 없다`);
        }
      }
    }
  } finally { restore(); }
});

test('운영자 화면이 모든 상황에서 끝까지 그려진다', async () => {
  const restore = installDom();
  try {
    const { operatorSection } = await import('../src/bootcamp/operator-view.js');
    for (const id of CASES) {
      for (const conn of [null, { state: 'OFFLINE' }, { state: 'SIGNED_OUT' },
        { state: 'LIVE', address: '0xabc', role: 'COURSE_OPERATOR' }]) {
        const node = operatorSection({ view: bootcampView(id, 'operator'), conn });
        const text = node.textContent;
        // §9.2 의 다섯 영역이 다 있는지도 같이 고정한다
        for (const area of ['기수 현황', '검증 현황', '재원 현황', '이의·정정', '운영 효과']) {
          assert.ok(text.includes(area), `${id} / ${conn?.state} 에 ${area} 가 없다`);
        }
      }
    }
  } finally { restore(); }
});

test('로그인 전에는 학생 화면이 로그인을 할 일로 제시한다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const out = studentSection({
      view: bootcampView('missing', 'participant'),
      conn: { state: 'SIGNED_OUT' },
    }).textContent;
    assert.ok(out.includes('로그인하기'), '맨 위 제목이 로그인이 아니다');

    // 서버가 없을 때는 로그인 얘기를 꺼내지 않는다 — 눌러도 안 되니까
    const offline = studentSection({
      view: bootcampView('missing', 'participant'),
      conn: { state: 'OFFLINE' },
    }).textContent;
    assert.ok(!offline.includes('로그인하기'), '서버도 없는데 로그인을 시키고 있다');
  } finally { restore(); }
});

test('빈 값은 줄로 그리지 않고 한 줄로 모은다', async () => {
  const restore = installDom();
  try {
    const { item, pairBlock } = await import('../src/bootcamp/pairs.js');
    const block = pairBlock([
      item('있는 값', '100 TEST'),
      item('없는 값 하나', null),
      item('없는 값 둘', null),
      item('비워 두기로 한 값', null, '일부러 비움', { always: true }),
    ]);
    const text = block.map((n) => n.textContent).join(' ');

    assert.ok(text.includes('100 TEST'));
    // 빈 값 두 개가 '아직 몰라요' 두 줄이 되지 않고 한 줄로 모인다
    assert.ok(text.includes('아직 못 받은 값 — 없는 값 하나 · 없는 값 둘'));
    // always 는 남는다
    assert.ok(text.includes('비워 두기로 한 값'));
    assert.equal((text.match(/아직 몰라요/g) ?? []).length, 1);
  } finally { restore(); }
});

// ── 시연 두 상황 ───────────────────────────────────────────────────────
//
// 조건은 둘 다 전부 충족이고 **재원만 다르다.** 변수를 하나만 두어야
// 멈춘 이유가 돈 때문이라는 게 화면에서 보인다.

test('두 상황은 조건이 같고 재원만 다르다', async () => {
  const { bootcampView, BOOTCAMP_CASES } = await import('../src/fixtures/bootcamp.js');
  // inProgress 는 축이 다르다 — 조건이 아직 안 끝난 화면이고, 학생이 직접
  // 인증을 눌러야 하는 자리를 보여주려고 둔다. paid·shortfall 둘만 비교한다.
  assert.deepEqual(Object.keys(BOOTCAMP_CASES), ['inProgress', 'paid', 'shortfall', 'unresolved']);

  const paid = bootcampView('paid', 'participant');
  const short = bootcampView('shortfall', 'participant');

  const met = (v) => v.criteria.filter((r) => r.state === 'MET' && r.current !== false).length;
  assert.equal(met(paid), 4);
  assert.equal(met(short), 4, '두 상황의 조건이 다르면 비교가 안 된다');

  assert.equal(paid.funding.status, 'FULLY_ALLOCATED');
  assert.equal(short.funding.status, 'WAITING_FUNDS');
  assert.equal(short.funding.queue.shortfallAtoms, '50000000');

  // 지급까지 끝난 쪽만 최종 확정이다
  assert.equal(paid.payment.claimState, 'FINALIZED');
  assert.equal(short.payment.claimState, null);
});

test('재원 부족이면 확인 기간을 열지 않는다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');

    const short = studentSection({ view: bootcampView('shortfall', 'participant') }).textContent;
    // §8.3 — 전액 배정 전에는 확인 기간이 시작도 안 한다.
    assert.ok(!short.includes('운영자 확인'), '시작도 안 한 확인을 띄우고 있다');
    assert.ok(short.includes('아직 시작하지 않았습니다'));
    // 멈춘 이유를 맨 위에서 말한다 — 조건은 됐고 돈이 모자라다는 것
    assert.ok(short.includes('조건 충족'), short.slice(0, 200));
    assert.ok(short.includes('재원'), short.slice(0, 200));
    assert.ok(short.includes('50 TEST'));

    const paid = studentSection({ view: bootcampView('paid', 'participant') }).textContent;
    assert.ok(paid.includes('100 TEST'));
    assert.ok(paid.includes('환급 완료'));
    // 끝난 화면에서 '지급이 끝났다는 뜻은 아니에요' 라고 하면 거짓이다
    assert.ok(!paid.includes('지급이 끝났다는 뜻은 아니에요'));
  } finally { restore(); }
});

test('조건 목록을 두 번 그리지 않는다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const node = studentSection({ view: bootcampView('paid', 'participant') });

    // 접어 둔 '판정 상세' 에도 조건 이름이 나온다. 거기는 참고용이라 센다고
    // 중복이 아니다. 펼쳐져 보이는 부분만 본다.
    const visible = (n) => {
      if (n.tagName === 'DETAILS') return '';
      return (n._text ?? '') + (n.children ?? []).map(visible).join('');
    };
    const text = visible(node);

    // 전에는 '내 진행 현황' 과 '증거 연결' 이 같은 조건 네 개를 각각 그렸다.
    assert.ok(!text.includes('증거 연결'), '증거 연결 구역이 아직 따로 있다');

    // 글자 포함으로 세면 'Moodle 과제 제출 기록' 같은 원천 이름까지 걸린다.
    // 줄 제목만 모아 센다.
    const names = [];
    const walk = (n) => {
      if (n.tagName === 'DETAILS') return;
      if (n.className === 'bcx-task-name') names.push(n.textContent);
      for (const c of n.children ?? []) walk(c);
    };
    walk(node);
    assert.deepEqual(names, ['강의 수강', '과제 제출', '회고', 'HackerRank 인증서']);
  } finally { restore(); }
});

// ── 버튼 ───────────────────────────────────────────────────────────────
//
// §9.1 이 꼽은 사용자 행동이 화면에 다 있나. 서버가 그 경로를 아직 안 주는
// 것(오류 제기·재검증)은 **이유를 적는다** — 조용히 빼면 설계가 사라진다.

const BUTTONS = (node) => {
  const out = [];
  const walk = (n) => {
    if (n.tagName === 'BUTTON') out.push(n.textContent);
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
};

const FULL_API = Object.fromEntries([
  'view', 'consent', 'operation', 'paymentReceipt', 'bindSourceSession',
  'pendingSourceSignature', 'submitSourceSignature', 'objection', 'revalidation',
].map((k) => [k, () => {}]));

/** 지갑 서명. 이게 없으면 원천 확인을 끝낼 수 없으므로 버튼도 안 뜬다 */
const SIGN = () => '0xsig';

test('버튼은 자기 차례인 상태에서만 나온다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const live = { state: 'LIVE', address: '0xabc' };
    const draw = (caseId) => BUTTONS(studentSection({
      view: bootcampView(caseId, 'participant'), conn: live, api: FULL_API,
    })).join(' | ');

    // 확인 절차가 열린 상태 — 재검증이 여기 있다.
    // (BOOTCAMP_CASES 에는 없지만 백엔드 원본 fixture 로 남아 있다)
    //
    // 오류 신고는 **여기 없다.** 다툴 수 있는 건 AI 가 해석한 회고뿐이라
    // 그 조건 상세로 옮겼다. 아래 '오류 신고는 회고에만 있다' 가 지킨다.
    const during = draw('waitingForOperatorConsent');
    assert.ok(!during.includes('오류 알리기'), `메인에 오류 신고가 남아 있다: ${during}`);
    assert.ok(during.includes('재검증 요청'), during);
    // 이 fixture 에서 참가자는 **이미 확인했다.** 같은 판정을 두 번 확인시키지
    // 않으므로 버튼이 없는 게 맞다. 아직 안 한 운영자 쪽에는 있어야 한다.
    assert.ok(!during.includes('바로 받기'), `이미 한 확인을 또 시킨다: ${during}`);

    // 운영자 화면은 기수 대시보드다. 확인은 **큐에서** 누른다 —
    // 신청 한 건에 매달린 '바로 받기' 버튼이 아니다.
    const { operatorSection } = await import('../src/bootcamp/operator-view.js');
    const asOperator = BUTTONS(operatorSection({
      view: bootcampView('waitingForOperatorConsent', 'operator'), conn: live, api: FULL_API,
    })).join(' | ');
    assert.ok(asOperator.includes('확인'), asOperator);
    assert.ok(!asOperator.includes('바로 받기'), `운영자에 학생용 버튼이 있다: ${asOperator}`);

    // 재원이 모자라면 확인 기간이 시작도 안 한다(§8.3) — 버튼이 없어야 맞다
    const short = draw('shortfall');
    assert.ok(!short.includes('바로 받기'), `시작도 안 한 확인에 버튼이 있다: ${short}`);

    // 다 끝난 뒤에는 누를 것이 없다
    const paid = draw('paid');
    assert.ok(!paid.includes('바로 받기'), paid);
  } finally { restore(); }
});

test('아직 충족 못 한 조건에만 서명 버튼이 붙는다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const live = { state: 'LIVE', address: '0xabc' };

    // 네 조건이 다 충족이면 서명을 또 받지 않는다
    const done = BUTTONS(studentSection({
      view: bootcampView('paid', 'participant'), conn: live, api: FULL_API,
    })).join(' | ');
    assert.ok(!done.includes('서명'), done);

    // 인증서가 아직이면 카드 버튼이 '인증하러 가기' 로 바뀐다
    const pending = BUTTONS(studentSection({
      view: bootcampView('missing', 'participant'), conn: live, api: FULL_API,
    })).join(' | ');
    assert.ok(pending.includes('인증하기'), pending);
    // 인증이 필요한 조건은 하나뿐이다. 넷 다 '인증하기' 면 뭔가 잘못됐다.
    assert.equal(pending.split('인증하기').length - 1, 1, pending);

    // 서명은 그 조건 상세로 들어가야 받는다
    const { conditionDetail } = await import('../src/bootcamp/student-view.js');
    const detail = BUTTONS(conditionDetail({
      view: bootcampView('missing', 'participant'),
      criterionId: 'python-basic-certificate',
      api: FULL_API,
      sign: SIGN,
    })).join(' | ');
    assert.ok(detail.includes('서명 문구 받기'), detail);

    // 서명할 수단이 없으면 버튼을 띄우지 않는다. 받아 봐야 서명을 못 한다.
    const noSigner = BUTTONS(conditionDetail({
      view: bootcampView('missing', 'participant'),
      criterionId: 'python-basic-certificate',
      api: FULL_API,
    })).join(' | ');
    assert.ok(!noSigner.includes('서명 문구 받기'), noSigner);

    // 이미 충족한 조건의 상세에는 서명 버튼이 없다
    const doneDetail = BUTTONS(conditionDetail({
      view: bootcampView('paid', 'participant'),
      criterionId: 'python-basic-certificate',
      api: FULL_API,
    })).join(' | ');
    assert.ok(!doneDetail.includes('서명'), doneDetail);
  } finally { restore(); }
});

test('서버가 안 주는 경로는 버튼 대신 이유를 적는다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const api = { ...FULL_API, objection: undefined, revalidation: undefined };
    const node = studentSection({
      view: bootcampView('waitingForOperatorConsent', 'participant'),
      conn: { state: 'LIVE', address: '0xabc' },
      api,
    });
    const labels = BUTTONS(node).join(' | ');
    assert.ok(!labels.includes('재검증 요청'), '없는 경로에 버튼을 띄웠다');
    // 조용히 빼지 않는다 — 왜 못 하는지 적는다.
    //
    // 다만 **참가자 화면이라 사람 말로** 적는다. 오규원 지침(10-28):
    // "'경로 없음' 은 개발 진단으로 유지하되 참가자 화면에는 이해하기
    // 쉬운 안내를 사용하는 게 좋아."
    assert.ok(node.textContent.includes('아직 열리지 않았습니다'), node.textContent.slice(0, 200));
    assert.ok(!node.textContent.includes('경로가 아직 없습니다'), '참가자에게 개발 말투를 썼다');

    // 오류 신고는 회고 상세에 있다. 거기서도 경로가 없으면 이유를 적는다.
    const { conditionDetail } = await import('../src/bootcamp/student-view.js');
    const detail = conditionDetail({
      view: bootcampView('waitingForOperatorConsent', 'participant'),
      criterionId: 'reflection-topics',
      api,
    });
    assert.ok(!BUTTONS(detail).join(' | ').includes('오류 알리기'), '없는 경로에 버튼을 띄웠다');
    assert.ok(detail.textContent.includes('아직 열리지 않았습니다'), detail.textContent.slice(0, 200));
    assert.ok(!detail.textContent.includes('경로가 아직 없'), '참가자에게 개발 말투를 썼다');
  } finally { restore(); }
});

test('로그인 전에는 쓰기 버튼을 띄우지 않는다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const node = studentSection({
      view: bootcampView('shortfall', 'participant'),
      conn: { state: 'SIGNED_OUT' },
    });
    // 막으려는 것은 **쓰기**다. 조건 상세로 가는 이동 버튼은 로그인 전에도
    // 괜찮다 — 읽기만 하고 서버에 아무것도 보내지 않는다.
    const out = BUTTONS(node);
    const WRITES = ['바로 받기', '서명', '오류 보내기', '재검증 요청', '결과 확인'];
    const writes = out.filter((label) => WRITES.some((w) => label.includes(w)));
    assert.deepEqual(writes, [], `로그인 전에 쓰기 버튼이 있다: ${out.join(' | ')}`);
    assert.ok(out.some((label) => label.includes('로그인')), out.join(' | '));
  } finally { restore(); }
});

test('조건이 남아 있으면 학생이 직접 인증할 자리가 있다', async () => {
  const restore = installDom();
  try {
    const { studentSection, conditionDetail } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const live = { state: 'LIVE', address: '0xabc' };

    // 카드 버튼이 '인증하기' 로 바뀐다
    const cards = BUTTONS(studentSection({
      view: bootcampView('inProgress', 'participant'), conn: live, api: FULL_API,
    })).join(' | ');
    assert.ok(cards.includes('인증하기'), cards);

    // 상세로 들어가면 실제로 서명을 받는 버튼이 있다
    const detail = BUTTONS(conditionDetail({
      view: bootcampView('inProgress', 'participant'),
      criterionId: 'python-basic-certificate',
      api: FULL_API,
      sign: SIGN,
    })).join(' | ');
    assert.ok(detail.includes('서명 문구 받기'), detail);

    // 조건이 안 끝났으니 확인 기간은 열리지 않는다
    const text = studentSection({
      view: bootcampView('inProgress', 'participant'), conn: live, api: FULL_API,
    }).textContent;
    assert.ok(text.includes('아직 시작하지 않았습니다'), '확인 기간이 열려 있다');
  } finally { restore(); }
});

// ── 미해결 종료 ────────────────────────────────────────────────────────
//
// 멘토 §3 — "미해결로 종료" 를 "조건 미충족" 과 같게 보이면 안 된다.
// 학생은 할 걸 다 했는데 절차가 안 끝난 것이다.

test('미해결 종료를 조건 미충족처럼 보여주지 않는다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const text = studentSection({ view: bootcampView('unresolved', 'participant') }).textContent;

    // 조건은 다 채웠다는 사실을 먼저 말한다
    assert.ok(text.includes('조건은 모두 충족했습니다'), text.slice(0, 260));
    // 왜 멈췄는지 이유를 말한다
    assert.ok(text.includes('오류 신고가 정해진 시간 안에 해결되지 않았습니다'));
    // 조건 탓이 아니라고 못 박는다.
    // 문구는 2026-10-29 백엔드가 준 것으로 바꿨다. 뜻은 같다.
    assert.ok(text.includes('조건 미충족으로 확정된 것은 아닙니다'));
    // 예약이 풀렸다는 것도 숨기지 않는다
    assert.ok(text.includes('해제됨'));

    // 지급으로 끝난 화면과 섞이지 않는다
    assert.ok(!text.includes('환급 완료'), '종료인데 완료로 보인다');

    // 끝난 절차에 '2분 남음' 이 떠 있으면 거짓이다
    assert.ok(text.includes('종료됐습니다. 더 확인할 것이 없습니다'), '확인 기간이 아직 열려 있다');
    assert.ok(!/\d+분 \d+초 남음/.test(text), `끝났는데 남은 시간이 보인다: ${text.slice(0, 400)}`);

    // 큰 숫자 밑 문구도 종료에 맞아야 한다
    assert.ok(text.includes('지급되지 않음'));
    assert.ok(!text.includes('조건을 모두 충족하면 지급합니다'), '종료인데 지급 예정으로 보인다');
  } finally { restore(); }
});

test('남은 시간 문구가 겹치지 않는다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const text = studentSection({ view: bootcampView('paid', 'participant') }).textContent;
    // '2분 0초 남음 뒤 자동 진행' 처럼 '남음' 과 '뒤' 가 겹치면 안 된다
    assert.ok(!text.includes('남음 뒤'), text.slice(0, 400));
  } finally { restore(); }
});

// ── 기수 집계 산수 ─────────────────────────────────────────────────────
//
// 운영자가 제일 먼저 알아채는 게 집계가 안 맞는 것이다. 특히 **가용이
// 남았는데 대기자가 있는 상태**는 존재할 수 없다 — §8.2 가 "먼저 수락된
// A에게 배정한다" 라서 가용이 있으면 즉시 배정된다. 처음에 그렇게 썼다가
// 틀린 걸 알고 고쳤고, 다시 어긋나지 않게 여기서 잡는다.

test('기수 집계의 앞뒤가 맞는다', async () => {
  const { COHORT, stageTotal } = await import('../src/fixtures/cohort.js');
  const f = COHORT.funding;
  const n = (x) => Number(x) / 1e6;
  const stage = (k) => COHORT.stages.find((s) => s.key === k)?.count ?? 0;

  assert.equal(stageTotal(), COHORT.participants, '단계 합이 참여자 수와 다르다');
  assert.equal(n(f.depositedAtoms) - stage('PAID') * 100, n(f.balanceAtoms), '입금 − 지급 ≠ 잔액');
  assert.equal(n(f.balanceAtoms) - n(f.reservedAtoms), n(f.availableAtoms), '잔액 − 예약 ≠ 가용');
  assert.equal(n(f.reservedAtoms), stage('CONFIRMING') * 100, '예약이 확인 기간 인원과 안 맞는다');
  assert.equal(n(f.shortfallAtoms), stage('FUNDING_WAIT') * 100 - n(f.availableAtoms), '부족액이 안 맞는다');
  assert.equal(n(f.maxExposureAtoms), COHORT.participants * 100, '최대 노출이 참여자 수와 안 맞는다');

  // 가용이 남은 채로 대기자가 있을 수 없다
  assert.ok(!(n(f.availableAtoms) > 0 && stage('FUNDING_WAIT') > 0),
    `가용 ${n(f.availableAtoms)} 이 남았는데 ${stage('FUNDING_WAIT')}명이 대기 중이다`);

  // 도구 집계도 성공 + 실패 = 실행
  for (const t of COHORT.tools) {
    assert.equal(t.ok + t.failed, t.ran, `${t.label}: ${t.ok} + ${t.failed} ≠ ${t.ran}`);
    if (t.failed > 0) assert.ok(t.reason, `${t.label}: 실패했는데 사유가 없다`);
  }

  // §14.1 — 사람 시간은 baseline 이 없으면 null 이다. 0 으로 채우면 안 된다.
  assert.equal(COHORT.metrics.humanWorkMs, null);
  assert.equal(COHORT.metrics.humanWorkReductionPercent, null);
});

// ── 신청 목록 ──────────────────────────────────────────────────────────
//
// 목록과 집계가 어긋나면 운영자가 둘 중 뭘 믿어야 할지 모른다.

test('신청 목록이 기수 집계와 맞는다', async () => {
  const { COHORT, byStage } = await import('../src/fixtures/cohort.js');

  assert.equal(COHORT.applicants.length, COHORT.participants, '명단 수가 참여자 수와 다르다');
  for (const st of COHORT.stages) {
    assert.equal(byStage(st.key).length, st.count, `${st.label}: 집계 ${st.count} ≠ 명단 ${byStage(st.key).length}`);
  }

  // 지급까지 간 사람은 네 조건을 다 채웠어야 한다
  for (const a of byStage('PAID')) assert.equal(a.met, 4, `${a.name} 은 지급됐는데 ${a.met}/4 다`);

  // 확인 기간 인원과 대기 큐가 같은 사람이어야 한다
  const confirming = byStage('CONFIRMING').map((a) => a.name).sort();
  const queue = COHORT.pending.map((q) => q.who).sort();
  assert.deepEqual(queue, confirming, '확인 대기 큐와 확인 기간 명단이 다르다');

  // 이름이 겹치면 목록에서 사람을 구분할 수 없다
  assert.equal(new Set(COHORT.applicants.map((a) => a.name)).size, COHORT.participants);
});

test('운영자 화면에 개개인이 보인다', async () => {
  const restore = installDom();
  try {
    const { operatorSection } = await import('../src/bootcamp/operator-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const { COHORT } = await import('../src/fixtures/cohort.js');
    const text = operatorSection({
      view: bootcampView('paid', 'operator'),
      conn: { state: 'LIVE', address: '0xa' },
      api: FULL_API,
    }).textContent;

    for (const a of COHORT.applicants) {
      assert.ok(text.includes(a.name), `명단에 ${a.name} 이 없다`);
    }
    assert.ok(text.includes('신청 목록'));
    assert.ok(text.includes(`전체 ${COHORT.participants}`));
  } finally { restore(); }
});

// ── 라이브 월드의 손잡이 ───────────────────────────────────────────────
//
// 조건 카드를 눌러 바꾸는 것과 명단을 펴 보는 것은 **라이브 월드에서만**
// 생긴다. fixture 화면에 이게 새어 나가면, 서버가 준 판정을 손으로 고칠 수
// 있는 것처럼 보인다.

test('조건 카드 토글은 라이브에서만 생긴다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const view = bootcampView('inProgress', 'participant');

    const plain = studentSection({ view, conn: { state: 'LIVE' }, api: FULL_API });
    assert.ok(!plain.textContent.includes('충족으로'), 'fixture 화면에 토글이 있다');
    assert.ok(!plain.textContent.includes('충족 해제'));

    const touched = [];
    const live = studentSection({
      view, conn: { state: 'LIVE' }, api: FULL_API, onToggle: (id) => touched.push(id),
    });
    // 네 조건마다 하나씩
    const toggles = (live.textContent.match(/충족으로|충족 해제/g) ?? []).length;
    assert.equal(toggles, 4, `토글이 ${toggles}개다`);
  } finally { restore(); }
});

test('명단을 펴면 조건 네 개가 보인다', async () => {
  const restore = installDom();
  try {
    const { operatorSection } = await import('../src/bootcamp/operator-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const { initialState, derive, CRITERION_LABEL, CRITERIA } = await import('../src/demo/world.js');
    const { cohortOf } = await import('../src/demo/view.js');

    const d = derive(initialState());
    const cohort = cohortOf(d);
    const view = bootcampView('paid', 'operator');

    // 접혀 있을 때는 상세가 없다
    const closed = operatorSection({ view, conn: { state: 'LIVE' }, api: FULL_API, cohort });
    assert.ok(!closed.textContent.includes('화면으로 보기'));

    // 펴 보는 건 화면 안에서 일어나므로, 모양만 확인한다 —
    // 집계가 들고 있는 조건 목록이 네 개이고 이름이 맞는지.
    for (const a of cohort.applicants) {
      assert.equal(a.criteria.length, CRITERIA.length, `${a.name}: 조건이 ${a.criteria.length}개`);
      assert.equal(a.criteria.filter((c) => c.met).length, a.met, `${a.name}: 충족 수가 안 맞는다`);
      for (const c of a.criteria) assert.equal(c.label, CRITERION_LABEL[c.id]);
    }
  } finally { restore(); }
});

test('해당 없는 칸을 "아직 못 받은 값" 으로 내리지 않는다', async () => {
  const { initialState, derive } = await import('../src/demo/world.js');
  const { cohortOf } = await import('../src/demo/view.js');
  const cohort = cohortOf(derive(initialState()));

  // 조건을 아직 못 채운 사람에게는 확인·지급 관련 값이 아예 없어야 한다.
  // null 로 두면 화면이 "서버가 값을 안 줬다" 로 적는다.
  const early = cohort.applicants.find((a) => a.stage === 'IN_PROGRESS');
  assert.equal(early.acceptedAt, null);
  assert.equal(early.confirmAt, null);
  assert.equal(early.paidAt, null);
  assert.equal(early.queue, null);

  const paid = cohort.applicants.find((a) => a.stage === 'PAID');
  assert.ok(paid.acceptedAt && paid.paidAt);
  assert.equal(paid.confirm.participant, true);
  assert.equal(paid.confirm.operator, true);
});

test('오류 신고는 회고에만 있다', async () => {
  const restore = installDom();
  try {
    const { studentSection, conditionDetail } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const view = bootcampView('waitingForOperatorConsent', 'participant');
    const open = (id) => conditionDetail({ view, criterionId: id, api: FULL_API, sign: SIGN });

    // 회고에만 있다 — AI 가 글을 읽고 해석한 유일한 조건이다
    const 회고 = open('reflection-topics');
    assert.ok(BUTTONS(회고).join(' | ').includes('오류 알리기'), BUTTONS(회고).join(' | '));

    // 나머지 셋은 기계가 읽은 기록이라 학생이 할 일이 없다.
    // 충족이든 아니든 똑같다 — 다툴 판단도, 다시 읽을 단추도 없다.
    const 미충족 = bootcampView('missing', 'participant');
    for (const id of ['activity-complete', 'assignment-submitted', 'python-basic-certificate']) {
      for (const v of [view, 미충족]) {
        const node = conditionDetail({ view: v, criterionId: id, api: FULL_API, sign: SIGN });
        const labels = BUTTONS(node).join(' | ');
        assert.ok(!labels.includes('오류 알리기'), `${id}: 오류 신고가 있다`);
        assert.ok(!labels.includes('다시 확인'), `${id}: 다시 확인 단추가 있다`);
        assert.ok(node.textContent.includes('따로 하실 일은 없습니다'), id);
      }
    }

    // 메인 화면에도 없다. 들어가는 길은 회고 상세 하나뿐이다.
    const main = studentSection({ view, conn: { state: 'LIVE' }, api: FULL_API });
    assert.ok(!BUTTONS(main).join(' | ').includes('오류 알리기'));
    assert.ok(main.textContent.includes('회고 · 자세히'), '어디서 신고하는지 안 알려준다');
  } finally { restore(); }
});

test('오류 신고가 열려 있으면 지급이 멈춘다', async () => {
  const { initialState, derive, raiseObjection, tick, confirm, CLOCK_BASE } =
    await import('../src/demo/world.js');
  const { viewFor, cohortOf } = await import('../src/demo/view.js');
  const NOW = CLOCK_BASE;
  const at = (s, id, now = NOW) => derive(s, now).byId.get(id);

  let s = raiseObjection(initialState(), 'a-05', '인용문을 배운 점으로 봤습니다', NOW);
  const row = at(s, 'a-05');
  assert.equal(row.blocked, true);
  assert.equal(row.stage, 'CONFIRMING', '단계까지 바꾸지는 않는다');

  // 화면이 왜 멈췄는지 말한다
  const v = viewFor(row, 'participant', NOW);
  assert.equal(v.procedure.status, 'OBJECTION_BLOCKED');
  assert.equal(v.objection.blocked, true);

  // 기한이 지나도 안 나간다 (§8.3 — 오류 신고를 다시 검사한다)
  assert.equal(tick(s, row.confirmAt), s, '신고가 열렸는데 지급됐다');
  // 양측이 확인해도 안 나간다
  const both = confirm(confirm(s, 'a-05', 'participant', NOW), 'a-05', 'operator', NOW);
  assert.equal(at(both, 'a-05').stage, 'CONFIRMING', '신고가 열렸는데 조기 경로로 나갔다');

  // 운영자 화면에 올라온다
  const obj = cohortOf(derive(s, NOW)).objections.find((o) => o.note.includes('정우진'));
  assert.ok(obj, '운영자 화면에 안 보인다');
  // 막 접수된 건은 '접수됨' 이다. 바로 '재검증 중' 이라고 하면 사용자가
  // 재검증을 돌린 것처럼 읽힌다 — 서버가 하는 일과 구분한다.
  assert.equal(obj.state, 'RECEIVED');

  // 재검증이 끝나면 **판정이 그대로일 때 기각되고 원래대로 간다.**
  // 아무도 안 풀면 종료가 아니다 — 그러면 신고가 거부권이 된다.
  const after = tick(s, row.revalidationAt);
  const done = at(after, 'a-05', row.revalidationAt);
  assert.equal(done.objection, null);
  assert.equal(done.objectionLog.at(-1).outcome, 'DISMISSED');

  // 기각된 뒤의 화면 — 학생이 결과를 알 수 있어야 한다
  const v2 = viewFor(done, 'participant', row.revalidationAt);
  assert.equal(v2.objection.blocked, false);
  assert.equal(v2.objection.last.outcome, 'DISMISSED');
  assert.equal(v2.procedure.revalidationCount, 1);

  // 운영자 목록에도 결과가 남는다
  const log = cohortOf(derive(after, row.revalidationAt)).objections
    .find((o) => o.note.includes('정우진'));
  assert.equal(log.state, 'DISMISSED');
  assert.ok(log.outcome.includes('기각'));
});

test('회고 판정이 바뀌면 오류 신고가 풀린다', async () => {
  const { initialState, derive, raiseObjection, toggleCriterion, CLOCK_BASE } =
    await import('../src/demo/world.js');
  const NOW = CLOCK_BASE;
  let s = raiseObjection(initialState(), 'a-05', '인용문을 배운 점으로 봤습니다', NOW);
  assert.ok(derive(s, NOW).byId.get('a-05').blocked);

  // 다툰 그 조건의 판정이 바뀌면 다툴 것이 없어진다
  s = toggleCriterion(s, 'a-05', 'reflection-topics', NOW);
  const row = derive(s, NOW).byId.get('a-05');
  assert.equal(row.objection, null);
  assert.equal(row.blocked, false);
});


test('학생과 운영자의 지갑 안내가 서로 반대다', async () => {
  const restore = installDom();
  try {
    const { onboardingView } = await import('../src/bootcamp/onboarding.js');
    const conn = { state: 'SIGNED_OUT', walletKind: 'NONE' };

    // 학생은 내장 지갑이라 설치가 필요 없다
    const 학생 = onboardingView({ conn, role: 'participant' }).textContent;
    assert.ok(학생.includes('따로 설치할 것은 없습니다'), 학생.slice(0, 200));
    assert.ok(!학생.includes('MetaMask'), '학생에게 설치를 요구한다');
    assert.ok(!학생.includes('지갑 확장을 설치'), '학생에게 설치를 요구한다');

    // 운영자는 브라우저 지갑이라 설치가 필요하다 — 둘을 같은 문구로 쓰면
    // 둘 중 하나는 거짓말이 된다.
    const 운영자 = onboardingView({ conn, role: 'operator' }).textContent;
    assert.ok(운영자.includes('MetaMask'), 운영자.slice(0, 200));
    assert.ok(!운영자.includes('따로 설치할 것은 없습니다'));

    // 걸음 수도 다르다. 운영자는 돈을 받는 쪽이 아니라 수령 계정이 없다.
    assert.equal((학생.match(/연결됨|확인됨|등록됨|지금/g) ?? []).length >= 1, true);
    assert.ok(학생.includes('수령 계정 등록'));
    assert.ok(!운영자.includes('수령 계정 등록'));
  } finally { restore(); }
});

test('잠긴 재원은 학원이 못 가져간다고 말한다', async () => {
  const restore = installDom();
  try {
    const { studentSection } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const live = { state: 'LIVE', address: '0xabc' };

    // **자동 지급이 왜 보장되는지는 여기서 나온다.** 학원이 미리 넣었고
    // 꺼낼 수 없으므로 조건만 채우면 반드시 나간다. 학생에게 제일 중요한
    // 사실이라 화면이 반드시 말해야 한다.
    const 확보 = studentSection({
      view: bootcampView('paid', 'participant'), conn: live, api: FULL_API,
    }).textContent;
    assert.ok(확보.includes('학원이 도로 가져갈 수 없습니다'), '잠김을 말하지 않는다');

    // 재원이 모자란 사람에게 "잠겼다" 고 하면 거짓말이다
    const 부족 = studentSection({
      view: bootcampView('shortfall', 'participant'), conn: live, api: FULL_API,
    }).textContent;
    assert.ok(!부족.includes('이미 잠겨 있습니다'), '확보 안 됐는데 잠겼다고 한다');
  } finally { restore(); }
});

test('인증서 조건은 증명이 둘이라고 말한다', async () => {
  const restore = installDom();
  try {
    const { conditionDetail } = await import('../src/bootcamp/student-view.js');
    const { bootcampView } = await import('../src/fixtures/bootcamp.js');
    const node = conditionDetail({
      view: bootcampView('paid', 'participant'),
      criterionId: 'python-basic-certificate',
      api: FULL_API,
    });
    const t = node.textContent;

    // P0 문서 설계 — 공개 인증서 하나로는 신청자 소유를 확정하지 않는다.
    // 계정 통제 증명과 인증서 증명을 같은 계정으로 묶는다.
    assert.ok(t.includes('계정 통제 증명'), '계정 통제 증명이 없다');
    assert.ok(t.includes('인증서 증명'), '인증서 증명이 없다');
    assert.ok(t.includes('두 증명 결합'), '둘을 묶는다는 말이 없다');
    // 증명이 둘인데 하나처럼 적으면 설계를 잘못 전한다
    assert.ok(!t.includes('증명 식별값'), '증명을 하나로 적고 있다');
  } finally { restore(); }
});
