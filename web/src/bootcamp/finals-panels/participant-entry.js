// 참가자 연결 상태 화면 — Moodle 「환급 확인」 버튼 → CLEAR 로그인 **뒤**
//
// 순서는 이렇다 (2026-11-04 결정).
//
//   Moodle 버튼 → 기존 구글 소셜 로그인 → **이 화면** → 수령인 등록부터 기존 흐름
//
// 로그인 뒤에 두는 이유 — '본인 연결(Moodle 학생 ↔ CLEAR 참가자)' 은 누가
// 로그인했는지 알아야 서버가 대조할 수 있다. 로그인 전에 "본인 연결됨" 을
// 보여주면 서버가 모르는 것을 보여주는 셈이다.
//
// 이 화면이 하는 일은 하나다. **로그인한 본인·강좌·신청이 연결됐는지 서버
// 결과로 보여주고, 이상 없으면 기존 흐름(수령인 등록부터)으로 보낸다.**
// 지갑·수령인 등록·조건 확인·동의·지급은 여기서 대신하지 않는다.
//
// ── 이 화면이 **주장하지 않는** 것 ──────────────────────────────────────
//
//   · Moodle 로그인 = CLEAR 로그인              아니다. CLEAR 로그인은 방금 따로 했다
//   · 로그인했으니 수령인 등록도 끝              아니다. 서명은 본인이 한다
//   · 주소의 강좌/학생 번호 = 본인 확인          아니다. 표시만 한다
//
// 연결 여부는 **서버가 검증한 결과만** 쓴다. 그 계약은 아직 없고, 지금은
// 명시적 합성 시나리오다. 화면이 매번 그렇게 적는다.

import { el, clear } from '../../ui/dom.js';
import { STATE, DATA_MODE } from './adapter.js';

const LINK_LABEL = Object.freeze({
  LINKED: '연결됨',
  PENDING: '확인 중',
  FAILED: '실패',
  NOT_LINKED: '연결 안 됨',
  WRONG_COURSE: '다른 강좌',
  FOUND: '있음',
  NONE: '없음',
});

/** 배지 색. 상태 이름이 아니라 **뜻**으로 고른다 */
const LINK_TONE = Object.freeze({
  LINKED: 'ok',
  FOUND: 'ok',
  PENDING: 'wait',
  FAILED: 'warn',
  WRONG_COURSE: 'warn',
  NOT_LINKED: 'warn',
  NONE: 'warn',
});

/** 기존 CLEAR 흐름. 순서가 곧 안내다 */
const STEPS = Object.freeze([
  { key: 'signedIn', label: 'CLEAR 로그인 (소셜)', note: 'Moodle 로그인과 별개로 한 것입니다.' },
  { key: 'wallet', label: '내장 지갑 준비', note: null },
  { key: 'recipient', label: '수령인 등록 (본인 서명)', note: '서명은 본인이 직접 합니다.' },
  { key: 'conditions', label: '조건 확인', note: null },
  { key: 'consent', label: '지급 동의', note: null },
  { key: 'payout', label: '지급', note: null },
]);

const STEP_LABEL = Object.freeze({ true: '완료', false: '아직', null: '확인 전' });

const BANNER = Object.freeze({
  [STATE.IDLE]: { tone: null, text: '연결 상태를 아직 불러오지 않았습니다.' },
  [STATE.LOADING]: { tone: 'wait', text: '연결 상태를 확인하고 있습니다…' },
  [STATE.SUCCESS]: null,
  [STATE.ERROR]: { tone: 'warn', text: '연결 상태를 불러오지 못했습니다.' },
  [STATE.EXPIRED]: { tone: 'warn', text: '세션이 만료됐습니다.' },
  [STATE.STALE]: { tone: 'wait', text: '진입 정보가 바뀌었습니다. 아래는 바뀌기 전 결과입니다.' },
});

const ERROR_TEXT = Object.freeze({
  ACTUAL_NOT_CONNECTED: '실제 연결 확인 경로가 아직 없습니다. 합성으로 대신하지 않습니다.',
  NO_FIXTURE: '이 시나리오의 합성 자료가 없습니다.',
  RUN_FAILED: '확인 중 오류가 났습니다.',
});

/**
 * 지금 무엇이 막고 있는지 한 줄. **가장 먼저 풀어야 할 것 하나만** 말한다 —
 * 세 줄을 다 적으면 참가자는 어느 것부터 할지 모른다.
 */
export function entryGuide(d) {
  if (!d) return null;
  if (d.session?.status === 'EXPIRED') {
    return {
      tone: 'warn',
      title: '세션이 만료됐습니다',
      text: 'Moodle 강좌 페이지에서 「환급 확인」을 다시 눌러 들어와 주세요. '
        + '이 화면의 「다시 확인」으로는 세션이 되살아나지 않습니다.',
      retry: false,
    };
  }
  const { self, course, application } = d.links ?? {};
  if (course?.status === 'WRONG_COURSE') {
    return {
      tone: 'warn',
      title: '이 강좌는 CLEAR 에 연결돼 있지 않습니다',
      text: '버튼이 가리키는 강좌가 CLEAR 에 연결된 강좌가 아니거나 본인 신청과 다른 강좌입니다. '
        + '강좌 페이지를 확인하고 운영자에게 알려 주세요.',
      retry: true,
    };
  }
  if (self?.status === 'FAILED') {
    return {
      tone: 'warn',
      title: '본인 연결에 실패했습니다',
      text: 'Moodle 학생과 로그인한 CLEAR 계정이 같은 사람으로 확인되지 않았습니다. '
        + '신청할 때 쓴 계정으로 다시 로그인하거나, 운영자에게 알려 주세요.',
      retry: true,
    };
  }
  if (self?.status === 'PENDING' || application?.status === 'PENDING' || course?.status === 'PENDING') {
    return {
      tone: 'wait',
      title: '서버가 연결을 확인하고 있습니다',
      text: '잠시 뒤 「다시 확인」을 눌러 주세요.',
      retry: true,
    };
  }
  if (application?.status === 'NONE') {
    return {
      tone: 'warn',
      title: '이 강좌에 본인 CLEAR 신청이 없습니다',
      text: '기수가 아직 열리지 않았거나 신청 전입니다. 운영자에게 확인해 주세요.',
      retry: true,
    };
  }
  if (self?.status === 'LINKED' && course?.status === 'LINKED' && application?.status === 'FOUND') {
    return {
      tone: 'ok',
      title: '연결이 확인됐습니다',
      text: '다음은 수령인 등록입니다. 기존 CLEAR 화면에서 이어서 진행합니다.',
      retry: false,
    };
  }
  return {
    tone: 'warn',
    title: '연결 상태를 판단할 수 없습니다',
    text: '「다시 확인」을 눌러 주세요. 계속 안 되면 운영자에게 알려 주세요.',
    retry: true,
  };
}

/** 기존 화면으로 넘어가도 되는가. 셋 다 연결되고 세션이 살아 있을 때만 */
export const canProceed = (d) => Boolean(d)
  && d.session?.status === 'VALID'
  && d.links?.self?.status === 'LINKED'
  && d.links?.course?.status === 'LINKED'
  && d.links?.application?.status === 'FOUND';

/**
 * @param {object} options
 * @param {object} options.adapter
 * @param {Array<{id:string,label:string}>} [options.scenarios]  합성 시나리오 선택지
 * @param {string} [options.scenario]   처음 고른 시나리오 id
 * @param {string} [options.continueHref]  기존 CLEAR 참가자 화면 주소
 */
export function participantEntryPanel({
  adapter, scenarios = [], scenario = null, continueHref = './index.html',
}) {
  const box = el('section.fp.fp--entry', {});
  let picked = scenario;

  const pick = (id) => {
    if (id === picked) return;
    picked = id;
    adapter.markStale(id);
    void adapter.request(id);
  };

  const render = () => {
    clear(box);
    const s = adapter.current;
    const d = s.payload ?? null;
    const banner = BANNER[s.state] ?? null;
    const guide = entryGuide(d);
    const ok = canProceed(d) && s.state === STATE.SUCCESS;

    box.append(...[
      el('header.fp-head', {}, [
        el('h2', { text: '참가자 진입 · 연결 상태' }),
        el('span.fp-mode', {
          'data-mode': s.dataMode === DATA_MODE.SYNTHETIC ? 'synthetic' : 'actual',
          text: s.dataMode === DATA_MODE.SYNTHETIC ? '합성 시나리오'
            : s.actualUnavailable ? '실제 — 미연결' : '실제 자료',
        }),
      ]),
      el('p.fp-sub', {
        text: 'Moodle 의 「환급 확인」 버튼으로 들어와 CLEAR 로그인을 마친 뒤 뜨는 화면입니다. '
          + '로그인한 본인과 강좌·신청이 연결됐는지 서버 결과로 보여주고, '
          + '수령인 등록·조건 확인·동의·지급은 기존 CLEAR 화면에서 그대로 진행합니다.',
      }),

      scenarios.length > 0
        ? el('div.fp-presets', {}, [
          el('span.fp-label', { text: '시나리오' }),
          ...scenarios.map((sc) => el('button.fp-chip', {
            type: 'button',
            'aria-pressed': sc.id === picked ? 'true' : 'false',
            onClick: () => pick(sc.id),
          }, [el('span', { text: sc.label })])),
        ])
        : null,

      banner ? el(banner.tone ? `p.fp-note.fp-note--${banner.tone}` : 'p.fp-note', { text: banner.text }) : null,
      s.error && s.state !== STATE.STALE
        ? el('p.fp-note.fp-note--warn', { text: ERROR_TEXT[s.error.code] ?? ERROR_TEXT.RUN_FAILED })
        : null,

      // ── 어디서 왔나 — 주소 번호는 표시만 ─────────────────────────
      ...(d ? sec('어디서 왔나', [
        el('dl.fp-pairs', {}, [
          pair('진입 경로', d.origin?.via === 'MOODLE_REFUND_BUTTON' ? 'Moodle 「환급 확인」 버튼' : '확인 전'),
          pair('Moodle 사이트', d.origin?.site ?? '확인 전'),
          pair('주소에 적힌 강좌 / 학생 번호',
            `${d.origin?.displayedCourseId ?? '—'} / ${d.origin?.displayedUserId ?? '—'}`),
        ]),
        el('p.fp-note', {
          text: '주소의 번호는 표시용입니다. 인증 근거로 쓰지 않습니다. 아래 연결 상태는 서버가 검증한 결과만 씁니다.',
        }),
      ]) : []),

      // ── 연결된 강좌 ───────────────────────────────────────────────
      ...(d ? sec('연결된 강좌', [
        d.course
          ? el('dl.fp-pairs', {}, [
            pair('강좌', d.course.title),
            pair('기수', d.course.cohort),
            pair('연결 시각', fmtTime(d.course.linkedAt)),
          ])
          : el('p.fp-note.fp-note--warn', { text: 'CLEAR 에 연결된 강좌 정보가 없습니다.' }),
      ]) : []),

      // ── 본인 · 강좌 · 신청 ────────────────────────────────────────
      ...(d ? sec('연결 상태', [
        el('ul.fp-links', {}, [
          linkRow('본인', 'Moodle 학생 ↔ 로그인한 CLEAR 계정', d.links?.self),
          linkRow('강좌', 'Moodle 강좌 ↔ CLEAR 강좌 설정', d.links?.course),
          linkRow('신청',
            d.links?.application?.ref ? `신청 ${d.links.application.ref}` : '이 강좌·기수의 본인 신청',
            d.links?.application),
        ]),
      ]) : []),

      // ── 지금 뭘 해야 하나 ─────────────────────────────────────────
      ...(guide ? [el('section.fp-sec.fp-guide', { 'data-tone': guide.tone }, [
        el('h3.fp-sec-title', { text: guide.title }),
        el('p', { text: guide.text }),
        el('div.fp-actions', {}, [
          guide.retry
            ? el('button.fp-btn', {
              type: 'button',
              disabled: s.busy ? 'disabled' : null,
              onClick: () => { if (!s.busy) void adapter.request(picked); },
            }, [el('span', { text: s.busy ? '확인 중…' : '다시 확인' })])
            : null,
          ok
            ? el('a.fp-btn.fp-btn--primary', { href: continueHref }, [
              el('span', { text: '수령인 등록으로 · 기존 CLEAR 화면' }),
            ])
            : el('span.fp-btn', { 'aria-disabled': 'true' }, [
              el('span', { text: '수령인 등록으로 · 연결 확인 뒤 열립니다' }),
            ]),
        ].filter(Boolean)),
        ok
          ? el('p.fp-note', {
            text: '연결 정보는 아직 기존 화면에 넘기지 않습니다 (계약 미확정). 기존 화면이 서버에서 다시 읽습니다.',
          })
          : null,
      ])] : []),

      // ── 기존 흐름 — 어디까지 됐나. 서버가 말한 것만 ───────────────
      ...(d ? sec('기존 CLEAR 흐름 — 어디까지 왔나', [
        el('ol.fp-steps', {}, STEPS.map((st) => {
          const v = d.clear && st.key in d.clear ? d.clear[st.key] : null;
          const state = v === true ? 'done' : v === false ? 'todo' : 'unknown';
          return el('li.fp-step', { 'data-state': state }, [
            el('span.fp-step-label', { text: st.label }),
            el('span.fp-step-state', { text: STEP_LABEL[String(v)] ?? '확인 전' }),
            st.note ? el('span.fp-step-note', { text: st.note }) : null,
          ].filter(Boolean));
        })),
        el('p.fp-note', {
          text: '「완료」는 서버가 그렇다고 말한 것만 적습니다. 로그인했다고 수령인 등록이 끝난 것으로 표시하지 않습니다. '
            + '「확인 전」은 서버가 아직 말하지 않은 것입니다.',
        }),
      ]) : []),

      el('p.fp-note', {
        text: '이 화면은 연결 상태 표시입니다. 자격 판정이나 지급 허용이 아닙니다.',
      }),
    ].filter(Boolean));
  };

  adapter.subscribe?.(render);
  render();
  return { node: box, render, get picked() { return picked; } };
}

const sec = (title, children) => [
  el('section.fp-sec', {}, [el('h3.fp-sec-title', { text: title }), ...children.filter(Boolean)]),
];

const pair = (k, v) => el('div.fp-pair', {}, [el('dt', { text: k }), el('dd', { text: String(v) })]);

function linkRow(name, what, link) {
  const status = link?.status ?? null;
  return el('li.fp-link', { 'data-tone': LINK_TONE[status] ?? 'warn' }, [
    el('span.fp-link-name', { text: name }),
    el('span.fp-link-what', { text: what }),
    el('span.fp-link-badge', { text: status ? (LINK_LABEL[status] ?? status) : '확인 전' }),
    link?.note ? el('span.fp-link-note', { text: link.note }) : null,
  ].filter(Boolean));
}

function fmtTime(iso) {
  if (!iso) return '확인 전';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '확인 전';
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
}
