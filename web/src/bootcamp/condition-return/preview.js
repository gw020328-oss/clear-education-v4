// 조건 카드 독립 프리뷰 (web/condition-cards.html)
//
// 기존 학생 화면(team-entry.js · student-view.js)을 건드리지 않고, 새 카드가
// 「원래 화면으로 가기 → 돌아오기 → 서버 판정 다시 읽기」 를 어떻게 보이는지
// 시연 데이터로 확인하는 자리다. 서버·Moodle·HackerRank 는 전부 대역이다.
//
//   ?mode=ACTUAL 을 붙이면 실서버 미연결 상태 — 판정 없음 · 주소 미제공 — 를 그린다.
//   시연 데이터로 떨어지지 않는다.

import { el, clear } from '../../ui/dom.js';
import { evidenceDetail } from '../live-evidence.js';
import { createConditionCards } from './controller.js';
import { createDemoServer, demoStore, DEMO_APPLICATION, DEMO_KEY } from './demo-server.js';
import { TARGETS_VERSION, LINK } from './targets.js';
import { RETURN } from './tracker.js';

const STANDIN = './condition-cards-moodle.html';
const LABEL = Object.freeze({
  'activity-complete': '강의 수강', 'assignment-submitted': '과제 제출',
  'reflection-topics': '회고', 'python-basic-certificate': 'HackerRank 인증서',
});

export function mountConditionCardsPreview(root, { mode = null, win = globalThis } = {}) {
  const actual = mode === 'ACTUAL';
  const server = createDemoServer({ store: demoStore(win) });
  const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // 화면은 **마지막으로 읽은 것**만 그린다. 서버 대역이 바뀌어도 읽기 전에는 모른다.
  let last = actual ? null : { view: server.view(), session: server.session(), approval: server.approval() };
  let busy = false;
  let selected = null;
  let evidence = null;
  let reads = 0;
  const log = [];
  const note = (text) => {
    log.unshift(`${new Date().toLocaleTimeString('ko-KR', { hour12: false })} ${text}`);
    log.length = Math.min(log.length, 8);
  };

  async function read() {
    if (actual) throw Object.assign(new Error('NOT_CONNECTED'), { code: 'NOT_CONNECTED' });
    await sleep(350); // 실제 조회처럼 잠깐 걸린다
    last = { view: server.view(), session: server.session(), approval: server.approval() };
    reads += 1;
    const met = last.view.criteria.filter((r) => r.state === 'MET').map((r) => LABEL[r.criterionId]);
    note(`조회 #${reads} · 판정 rev ${last.view.decision.revision} · 충족 ${met.length ? met.join('·') : '없음'}`);
    return { view: last.view, operations: null };
  }

  const refreshNow = async () => { busy = true; render(); try { await read(); } finally { busy = false; render(); } };

  const cards = createConditionCards({
    getState: () => (last ? { view: last.view, operations: null, session: last.session, approval: last.approval, busy } : { busy }),
    read,
    loadEvidence: async () => { await sleep(150); return server.decisionEvidence(); },
    targets: () => (actual ? null : {
      version: TARGETS_VERSION,
      applicationId: DEMO_APPLICATION,
      moodleOrigin: win.location?.origin ?? 'http://127.0.0.1',
      courseId: 7,
      targets: [
        { criterionId: 'activity-complete', cmId: 2101, module: 'page', name: '1주차 · 파이썬 시작하기' },
        { criterionId: 'assignment-submitted', cmId: 2105, module: 'assign', name: '실습 과제 · 반복문 구현' },
        { criterionId: 'reflection-topics', cmId: 2107, module: 'forum', instanceId: 31, name: '회고 게시판' },
      ],
    }),
    // 원천 재확인 요청의 대역. 실제라면 A 의 source-refresh 를 부르는 자리다.
    // 응답은 기록만 하고(접수·제한·기록·불가), 판정이 바뀌었는지는 그 뒤 read 가 정한다.
    // 시연 대역은 회고 재검증도 흉내 낸다 — **합성 검증 범위**다. 실제 연결의 기본은 강의·과제뿐.
    ...(actual ? {} : { refreshFor: (id) => id !== 'python-basic-certificate' }),
    refresh: actual ? null : async ({ criterionId, expectedRevision }) => {
      await sleep(200);
      const r = server.refresh(criterionId, expectedRevision);
      note(r === null
        ? `재확인 요청 · ${LABEL[criterionId]} — 이 빌드엔 경로 없음(지금 develop)`
        : `재확인 요청 · ${LABEL[criterionId]} → ${r.status}${r.operationId ? ` (${r.operationId})` : ''}${r.retryAfterSeconds ? ` · ${r.retryAfterSeconds}초 뒤` : ''}`);
      return r;
    },
    // 검사를 통과한 실제 모양의 주소(/mod/...)를 시연 대역 탭으로 돌린다. 원래 주소는 이름에 남긴다.
    adaptLinks: (links) => Object.freeze(Object.fromEntries(Object.entries(links).map(([id, link]) => [id,
      link.status === LINK.LINKED
        ? Object.freeze({ ...link, href: `${STANDIN}?c=${encodeURIComponent(id)}`,
          name: `${link.name} — 시연 대역 (실서버라면 ${new URL(link.href).pathname}${new URL(link.href).search})` })
        : link]))),
    certificate: actual ? null : {
      // 기존 driver.bind · driver.approval · driver.sign 의 대역
      start: async () => { server.startHr(); note('인증 시작 (bind 대역)'); await refreshNow(); },
      read: async () => { server.readHrMessage(); note('인증서 확인 메시지 읽음'); await refreshNow(); },
      sign: async () => {
        // 실제 흐름에서는 호스트가 HackerRank 로그인 창을 연다. 여기서는 대역 탭을 연다.
        win.open?.(`${STANDIN}?c=python-basic-certificate`, '_blank', 'noopener');
        server.signHr(); cards.markSigned(); note('표시한 메시지에 서명 (시연)');
        await refreshNow();
      },
      // 로그인 창을 닫았거나 동의를 취소한 뒤 「다시 진행」. 서명은 다시 하지 않고 창만 다시 연다.
      // 실제라면 호스트의 "로그인 창 다시 열기" 동작이다 — A 에 요청(필요 항목).
      resume: async () => {
        win.open?.(`${STANDIN}?c=python-basic-certificate`, '_blank', 'noopener');
        note('HackerRank 창 다시 열기 (다시 진행 · 서명 없음)');
      },
    },
    onOpen: (id) => {
      selected = id; evidence = null; render();
      void (async () => { await sleep(150); evidence = actual ? null : server.decisionEvidence(); render(); })();
    },
    onChange: () => render(),
    sourceText: () => (actual ? null : server.reflectionText()),
    demo: !actual,
    followUpMs: [2000, 4000, 6000, 10000, 15000],
  });

  // 대역 탭이 기록을 남기면 알려 준다. **판정은 바꾸지 않는다** — 서버가 다시 읽어야 바뀐다.
  win.addEventListener?.('storage', (e) => {
    if (e.key !== DEMO_KEY) return;
    note('Moodle·HackerRank 대역에 기록이 생겼어요 (CLEAR 판정은 아직 그대로)');
    render();
  });

  function controls() {
    if (actual) return null;
    const s = server.settings();
    return el('div.crc-demo-controls', {}, [
      el('strong', { text: '시연 조작' }),
      ...[
        ['ON_REQUEST', '돌아오면 재확인 요청 → 접수 → 지연 뒤 새 판정 확정 (A 의 source-refresh)'],
        ['DELAYED', '요청 없이도 서버가 스스로 다시 읽음 (Moodle 이벤트 방식)'],
        ['NEVER', '재확인 경로 없음 · 저장된 판정만 읽음 (지금 develop)'],
        ['UNAVAILABLE', '재확인 경로는 있지만 이 조건은 미지원이라 답함'],
      ].map(([mode, label]) => el('label', {}, [
        el('input', { type: 'radio', name: 'crc-mode', checked: s.mode === mode, onChange: () => { server.setMode(mode); render(); } }),
        el('span', { text: label }),
      ])),
      el('label', {}, [
        el('span', { text: '반영 지연' }),
        el('select', { onChange: (e) => { server.setLag(Number(e.target.value)); render(); } },
          [3000, 5000, 10000].map((ms) => el('option', { value: String(ms), selected: s.lagMs === ms, text: `${ms / 1000}초` }))),
      ]),
      el('button.crc-sub-btn', { type: 'button', onClick: () => { void cards.arrive(); } }, [el('span', { text: '이 탭으로 돌아온 것처럼' })]),
      el('button.crc-sub-btn', { type: 'button', disabled: busy, onClick: () => { void refreshNow(); } }, [el('span', { text: '최신 상태 읽기' })]),
      el('button.crc-sub-btn', {
        type: 'button',
        onClick: () => {
          server.reset();
          try {
            win.sessionStorage?.removeItem(`clear.condition-return.v1:${DEMO_APPLICATION}`);
            win.sessionStorage?.removeItem(`clear.condition-return.signed.v1:${DEMO_APPLICATION}`);
          } catch { /* 없음 */ }
          win.location?.reload?.();
        },
      }, [el('span', { text: '시연 초기화' })]),
    ]);
  }

  function detail() {
    if (!selected || !last?.view) return null;
    return el('section.band.band--card', {}, [el('div.band-inner', {}, [
      el('h2', { text: '확인한 근거 (기존 「자세히」 화면)' }),
      evidenceDetail({ view: last.view, criterionId: selected, evidence }),
    ])]);
  }

  function render() {
    clear(root);
    root.append(el('div.crc-preview', {}, [
      el('header.crc-preview-top', {}, [
        el('h1', { text: actual ? '환급 조건 카드 — 실제 모드(미연결)' : '환급 조건 카드 미리보기 (시연 데이터)' }),
        el('p', {
          text: '카드의 버튼으로 원래 화면(Moodle 강의·과제·회고, HackerRank 인증)에 가서 마치고 이 탭으로 돌아오면, '
            + '카드가 서버 판정을 다시 읽습니다. 돌아왔다는 사실만으로 충족이 되지 않습니다.',
        }),
        actual
          ? el('p', { text: '실서버에 연결하지 않았습니다. 판정·이동 주소·인증 단계가 없다는 표시만 나와야 합니다.' })
          : el('p', {
            text: '돌아오면 카드가 서버에 원천 재확인을 요청하고(접수), 서버가 다시 읽어 새 판정을 확정해야 충족으로 바뀝니다. '
              + '접수와 확정은 다른 상태로 보입니다. 재확인 경로가 없는 지금 develop 은 「저장된 판정만 읽음」 입니다.',
          }),
        controls(),
      ]),
      cards.render(),
      detail(),
      !actual && log.length ? el('pre.crc-demo-log', { text: log.join('\n') }) : null,
    ].filter(Boolean)));
  }

  render();
  return { render, cards, server, status: (id) => cards.status(id) ?? { state: RETURN.IDLE } };
}
