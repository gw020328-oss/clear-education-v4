// 시연 조작판
//
// 발표에서 상황을 만들어 보이는 손잡이다. 조건을 채우고, 학생을 바꾸고,
// 시계를 건너뛴다.
//
// ── 제품 버튼과 섞지 않는다 ────────────────────────────────────────────
//
// 실제 제품에서 **학생은 자기 조건을 스스로 충족 처리할 수 없다.** 그게
// 가능하면 환급 조건이 아무 의미가 없다. 조건은 Moodle 과 HackerRank 기록을
// 읽어서 서버가 판정한다.
//
// 그래서 조건 토글을 학생 화면 안에 제품 버튼처럼 두지 않는다. 화면 아래
// 검은 띠에 모아 두고, 생긴 것부터 제품과 다르게 한다. 심사위원이 "학생이
// 스스로 체크하는 서비스" 로 오해하면 안 된다.
//
// 반대로 **금고 충전은 운영자가 실제로 하는 일**이라 운영자 화면 안의 제품
// 버튼이다. 여기 있지 않다.
//
// ── 서버가 켜지면 사라진다 ─────────────────────────────────────────────
//
// main.js 가 라이브 월드일 때만 이것을 그린다. 진짜 판정 위에 조작판을
// 얹으면 그건 시연이 아니라 기록을 갈아끼우는 것이다.

import { el, clear } from '../ui/dom.js';
import {
  CRITERIA, CRITERION_LABEL, STAGE_LABEL,
  toggleCriterion, skip, skipToNext, nextDeadline,
} from './world.js';

const KEY_OPEN = 'clear.demo.panel.open';

/** 2020 시계의 시:분:초. 날짜는 적지 않는다 — 연도가 보이면 진짜처럼 읽힌다 */
const hhmmss = (at) => new Date(at * 1000).toLocaleTimeString('en-GB', {
  hour12: false, timeZone: 'Asia/Seoul',
});

const left = (s) => (s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`);

/**
 * 처음에는 펼쳐 둔다 — 조작판이 있는 줄 모르면 아무것도 못 한다.
 *
 * 다만 좁은 화면에서는 접어 둔다. 펼치면 줄이 여럿으로 접혀 화면의 절반을
 * 먹는다. 한 번이라도 직접 접거나 편 적이 있으면 그 선택을 따른다.
 */
function readOpen() {
  try {
    const saved = localStorage.getItem(KEY_OPEN);
    if (saved !== null) return saved !== 'no';
  } catch { /* 저장은 편의다 */ }
  return typeof window === 'undefined' || window.innerWidth > 720;
}
function writeOpen(v) {
  try { localStorage.setItem(KEY_OPEN, v ? 'yes' : 'no'); } catch { /* 편의다 */ }
}

/**
 * @param {object} options
 * @param {object} options.world     store.js 의 world
 * @param {'participant'|'operator'} options.role
 * @param {Function} options.onRole  역할을 바꾼다
 */
export function demoPanel({ world, role, onRole }) {
  const box = el('div.dp', {});
  let open = readOpen();

  const render = () => {
    const d = world.derive();
    const me = d.byId.get(world.state.me) ?? d.rows[0];
    const due = nextDeadline(world.state, d.now);
    clear(box);

    box.setAttribute('data-open', open ? 'yes' : 'no');
    box.append(...[
      el('button.dp-toggle', {
        type: 'button',
        'aria-expanded': open ? 'true' : 'false',
        onClick: () => { open = !open; writeOpen(open); render(); measure(); },
      }, [
        el('span.dp-dot', { 'aria-hidden': 'true' }),
        el('span', { text: '시연 조작판' }),
        el('span.dp-caret', { 'aria-hidden': 'true' }),
      ]),

      open ? el('div.dp-body', {}, [
        // 학생 고르기와 역할 바꾸기는 화면 맨 위에 있다. 여기 또 두면
        // 같은 손잡이가 두 개라 어느 쪽이 진짜인지 헷갈린다.
        //
        // 지금 누구를 보고 있는지는 적어 둔다 — 운영자 화면에서 조건을
        // 켜면 누구 조건이 켜지는지 알아야 한다.
        el('div.dp-group', {}, [
          el('span.dp-label', { text: '지금' }),
          el('span.dp-who', { text: `${me.name} · ${STAGE_LABEL[me.stage]} ${me.metCount}/4` }),
          el('button.dp-btn', {
            type: 'button',
            onClick: () => onRole(role === 'participant' ? 'operator' : 'participant'),
          }, [el('span', { text: role === 'participant' ? '운영자 화면' : '참가자 화면' })]),
        ]),

        // ── 조건 ──────────────────────────────────────────────────
        el('div.dp-group', {}, [
          el('span.dp-label', { text: '조건' }),
          ...CRITERIA.map((cid) => el(me.met.includes(cid) ? 'button.dp-chip.on' : 'button.dp-chip', {
            type: 'button',
            // 지급이 끝난 사람의 조건은 되돌리지 않는다. 체인에 나간 거래다.
            disabled: me.stage === 'PAID' ? 'disabled' : null,
            onClick: () => world.apply((s) => toggleCriterion(s, me.id, cid)),
          }, [el('span', { text: CRITERION_LABEL[cid] })])),
        ]),

        // ── 시계 ──────────────────────────────────────────────────
        //
        // 무엇을 건너뛰는지 단추에 적는다. '다음 기한까지' 만 적어 두면
        // 누를 때마다 무슨 일이 일어날지 몰라서 안 누르게 된다.
        el('div.dp-group', {}, [
          el('span.dp-label', { text: '시계' }),
          el('span.dp-clock', { 'data-clock': 'yes', text: hhmmss(d.now) }),
          // +2분 하나면 된다. 이 월드의 기한은 셋뿐이고 —
          // 재검증 60초 · 확인 기간 120초 · 전체 상한 600초 — 앞의 둘은
          // 한 번에 넘고, 상한은 「다음 기한까지」가 한 번에 간다.
          // 30초 단추는 어느 쪽도 못 넘겨서 누를 이유가 없었다.
          el('button.dp-btn', {
            type: 'button',
            onClick: () => world.apply((s) => skip(s, 120)),
          }, [el('span', { text: '+2분' })]),
          el('button.dp-btn', {
            type: 'button',
            disabled: due ? null : 'disabled',
            onClick: () => world.apply((s) => skipToNext(s)),
          }, [el('span', {
            'data-due': 'yes',
            text: due
              ? `${due.who} ${due.what}까지 (${left(due.at - d.now)})`
              : '기다리는 기한 없음',
          })]),
        ]),

        // ── 되돌리기 ──────────────────────────────────────────────
        el('div.dp-group', {}, [
          el('span.dp-label', { text: '되돌리기' }),
          el('button.dp-btn.dp-btn--ghost', {
            type: 'button',
            onClick: () => world.reset('empty'),
          }, [el('span', { text: '기수 시작 (금고 0)' })]),
          el('button.dp-btn.dp-btn--ghost', {
            type: 'button',
            onClick: () => world.reset('cohort'),
          }, [el('span', { text: '10기 중간' })]),
        ]),

        el('p.dp-note', {
          text: '화면을 움직여 보려고 둔 조작판입니다. 실제 서비스에서 조건은 '
            + 'Moodle·HackerRank 기록을 읽어 서버가 판정합니다. '
            + '학생이 스스로 충족 처리할 수 없습니다.',
        }),
      ]) : null,
    ].filter(Boolean));
  };

  // 띠가 바닥 내용을 가린다. 높이를 재서 알려 주면 바닥이 그만큼 비켜선다.
  // 접었다 폈다 할 때마다 높이가 달라지므로 그릴 때마다 다시 잰다.
  //
  // requestAnimationFrame 은 쓰지 않는다. 창이 숨겨져 있으면 아예 안 불리는데,
  // 그러면 다시 보일 때 바닥이 띠에 가린 채로 남는다. 붙어 있으면 그 자리에서
  // 재고, 아직 안 붙었으면 다음 차례에 다시 본다.
  const measure = () => {
    const apply = () => {
      if (!box.isConnected) return;
      document.documentElement.style.setProperty('--dp-h', `${box.offsetHeight}px`);
    };
    apply();
    setTimeout(apply, 0);
  };

  // 창 너비가 바뀌면 띠가 몇 줄로 접히느냐에 따라 높이가 달라진다.
  // ResizeObserver 는 노드와 함께 사라지지만 창이 숨겨져 있으면 안 불린다.
  // resize 이벤트는 그래도 오므로 둘 다 건다.
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(box);
  if (typeof window !== 'undefined') window.addEventListener('resize', measure);

  const draw = () => { render(); measure(); };

  /**
   * 시계만 흘렀을 때. **띠를 다시 그리지 않고 글자만 갈아끼운다.**
   *
   * 매초 다시 그리면 누르려던 단추가 손가락 밑에서 새 노드로 바뀌어
   * 클릭이 먹지 않는 일이 생긴다. 바뀌는 건 두 글자뿐이다.
   */
  const tick = () => {
    const d = world.derive();
    const due = nextDeadline(world.state, d.now);
    const clock = box.querySelector('[data-clock]');
    if (clock) clock.textContent = hhmmss(d.now);
    const dueText = box.querySelector('[data-due]');
    if (dueText) {
      dueText.textContent = due
        ? `${due.who} ${due.what}까지 (${left(due.at - d.now)})`
        : '기다리는 기한 없음';
    }
  };

  draw();
  return {
    node: box,
    render: draw,
    tick,
    // 역할을 바꾸면 조작판을 새로 만든다. 떼어낸 쪽의 resize 청취를 끊지
    // 않으면 죽은 노드를 붙든 채로 쌓인다.
    dispose() {
      if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
      box.remove();
    },
  };
}
