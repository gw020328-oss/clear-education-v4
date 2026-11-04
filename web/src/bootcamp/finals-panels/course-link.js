// 운영자 강좌 연결 화면 (A) — 어느 Moodle 항목을 검증 대상으로 볼지 고른다
//
// 시연 순서 (2026-11-04 결정):
//
//   운영자 CLEAR 로그인 → B 조건 구조화 → **이 화면** (조건마다 읽을 항목 지정) → 저장
//
// 그래서 **칸은 B 가 찾은 조건을 따라간다.** 활동·과제만 찾았으면 두 칸만 뜬다.
// 독립 미리보기는 세 칸 기본값이다.
//
// 운영자가 하는 일은 셋이다.
//
//   1  연결된 Moodle 강좌를 확인한다
//   2  서버가 준 항목 목록에서 조건마다 읽을 항목을 고른다
//      수강 활동은 **여러 개**(모두 완료), 과제·회고는 하나
//   3  저장한다
//
// ── 이 화면이 **주장하지 않는** 것 ──────────────────────────────────────
//
//   · 저장 = 지급 정책 확정·환급 승인      아니다. 강좌 설정일 뿐이다
//   · 목록의 항목 = 프론트가 아는 것       아니다. 서버가 준 것만 보여준다
//   · HackerRank 도 여기서 고른다          아니다. Moodle 항목이 아니다
//   · 활동 여러 개가 서버에 바로 반영      아니다. 지금 모듈은 하나만 받는다 — 백엔드 요청
//
// 어댑터가 둘이다. `load` 는 강좌·목록·저장된 매핑을 읽고, `save` 는 저장한다.
// 둘 다 실제 계약이 없어 합성 시나리오로 돈다. 실제 모드는 미연결로 남는다.

import { el, clear } from '../../ui/dom.js';
import { STATE, DATA_MODE } from './adapter.js';

/** 고를 칸. 조건 종류 하나에 칸 하나. 모듈 종류로 후보를 거른다 — 회고 칸에 퀴즈가 뜨면 안 된다 */
export const SLOTS = Object.freeze([
  {
    key: 'activity',
    capability: 'MOODLE_ACTIVITY_COMPLETION.1',
    label: '수강 활동',
    hint: '완료 기록을 읽을 강의 페이지. 여러 개 고르면 모두 완료해야 합니다',
    modules: ['page', 'url', 'lesson', 'scorm', 'resource'],
    multiple: true,
  },
  {
    key: 'assignment',
    capability: 'MOODLE_ASSIGNMENT_SUBMISSION.1',
    label: '과제',
    hint: '제출 기록을 읽을 과제',
    modules: ['assign'],
    multiple: false,
  },
  {
    key: 'reflection',
    capability: 'REFLECTION_REQUIRED_TOPICS.1',
    label: '회고',
    hint: '회고 글을 읽을 게시판',
    modules: ['forum'],
    multiple: false,
  },
]);

/** B 가 찾은 조건 목록 → 보일 칸. null 이면 전부. HackerRank 처럼 Moodle 칸이 없는 조건은 걸러진다 */
export const slotsFor = (capabilities) => (
  capabilities == null ? SLOTS : SLOTS.filter((s) => capabilities.includes(s.capability))
);

const MODULE_LABEL = Object.freeze({
  page: '페이지', url: '링크', lesson: '레슨', scorm: 'SCORM', resource: '자료',
  assign: '과제', forum: '게시판', quiz: '퀴즈',
});

const CONNECTION_LABEL = Object.freeze({
  CONNECTED: '연결됨', NOT_CONNECTED: '연결 안 됨', PENDING: '확인 중',
});
const CONNECTION_TONE = Object.freeze({ CONNECTED: 'ok', NOT_CONNECTED: 'warn', PENDING: 'wait' });

const LOAD_BANNER = Object.freeze({
  [STATE.IDLE]: { tone: null, text: '강좌 정보를 아직 불러오지 않았습니다.' },
  [STATE.LOADING]: { tone: 'wait', text: '강좌와 항목 목록을 불러오고 있습니다…' },
  [STATE.SUCCESS]: null,
  [STATE.ERROR]: { tone: 'warn', text: '강좌 정보를 불러오지 못했습니다.' },
  [STATE.EXPIRED]: { tone: 'warn', text: '세션이 만료됐습니다. 다시 로그인해 주세요.' },
  [STATE.STALE]: { tone: 'wait', text: '강좌가 바뀌었습니다. 아래는 바뀌기 전 정보입니다.' },
});

const ERROR_TEXT = Object.freeze({
  ACTUAL_NOT_CONNECTED: '실제 강좌 연결 경로가 아직 없습니다. 합성으로 대신하지 않습니다.',
  NO_FIXTURE: '이 시나리오의 합성 자료가 없습니다.',
  RUN_FAILED: '처리 중 오류가 났습니다.',
});

const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 저장된 매핑 중 지금 목록에 없는 칸. 목록이 바뀌면 생긴다 */
export function missingSlots(d) {
  if (!d?.mapping) return [];
  const have = new Set((d.items ?? []).map((i) => i.cmId));
  return SLOTS
    .filter((s) => list(d.mapping[s.key]).some((id) => !have.has(id)))
    .map((s) => s.key);
}

/** 서버 목록에 있는 번호만 받는다. 없는 번호는 **버린다** — 지어낸 항목이 저장되면 안 된다 */
export function draftFrom(d) {
  const have = new Set((d?.items ?? []).map((i) => i.cmId));
  const out = {};
  for (const s of SLOTS) {
    const kept = list(d?.mapping?.[s.key]).filter((id) => have.has(id)).sort((a, b) => a - b);
    out[s.key] = s.multiple ? kept : (kept[0] ?? null);
  }
  return out;
}

const sameDraft = (a, b, slots) => slots.every((s) => (
  s.multiple ? sameList(a[s.key], b[s.key]) : (a[s.key] ?? null) === (b[s.key] ?? null)
));

/**
 * @param {object} options
 * @param {object} options.load     강좌·목록·저장된 매핑 어댑터
 * @param {object} options.save     저장 어댑터
 * @param {Array<{id:string,label:string}>} [options.scenarios]
 * @param {string} [options.scenario]
 * @param {string[]|null} [options.conditions]  B 가 찾은 조건(capability) 목록. null 이면 세 칸 전부
 */
export function courseLinkPanel({
  load, save, scenarios = [], scenario = null, conditions = null,
}) {
  const box = el('section.fp.fp--link', {});
  let picked = scenario;
  let active = slotsFor(conditions);
  // 운영자가 고르고 있는 것. 서버가 준 매핑에서 시작한다.
  let draft = draftFrom(null);
  // 마지막으로 읽거나 저장한 매핑. 바뀌었는지 비교하는 기준이다.
  let saved = draftFrom(null);
  let seededFrom = null;

  const pick = (id) => {
    if (id === picked) return;
    picked = id;
    seededFrom = null;
    save.reset();
    load.markStale(id);
    void load.request(id);
  };

  const seed = (d) => {
    // 새 payload 가 오면 한 번만 초안을 맞춘다. 운영자가 고치는 중에 다시
    // 그려도 고른 것이 날아가면 안 된다.
    if (!d || seededFrom === d) return;
    seededFrom = d;
    saved = draftFrom(d);
    draft = { ...saved };
  };

  const chooseOne = (key, value) => {
    draft = { ...draft, [key]: value === '' ? null : Number(value) };
    save.reset();
    render();
  };

  const toggle = (key, cmId, on) => {
    const next = new Set(draft[key]);
    if (on) next.add(cmId); else next.delete(cmId);
    draft = { ...draft, [key]: [...next].sort((a, b) => a - b) };
    save.reset();
    render();
  };

  const submit = () => {
    const s = save.current;
    const d = load.current.payload;
    if (s.busy || !d?.course) return;
    const mapping = Object.fromEntries(active.map((sl) => [sl.key, sl.multiple ? [...draft[sl.key]] : draft[sl.key]]));
    void save.request({
      scenario: picked,
      courseId: d.course.id,
      conditions: active.map((sl) => sl.capability),
      mapping,
      basedOnItemsRevision: d.itemsRevision ?? null,
    }).then((result) => {
      if (result.state === STATE.SUCCESS && result.payload?.result === 'SAVED') {
        saved = draftFrom({ items: d.items, mapping: result.payload.mapping ?? mapping });
        draft = { ...saved };
        render();
      }
    });
  };

  const render = () => {
    clear(box);
    const L = load.current;
    const d = L.payload ?? null;
    seed(d);
    const S = save.current;
    const banner = LOAD_BANNER[L.state] ?? null;
    const connected = d?.connection?.status === 'CONNECTED';
    const items = d?.items ?? [];
    const missing = missingSlots(d).filter((k) => active.some((s) => s.key === k));
    const dirty = !sameDraft(draft, saved, active);
    const complete = active.every((s) => (s.multiple ? draft[s.key].length > 0 : draft[s.key] != null));
    const manyActivities = active.some((s) => s.multiple && draft[s.key].length > 1);
    const canSave = Boolean(d?.course) && connected && items.length > 0 && active.length > 0
      && complete && dirty && !S.busy && L.state === STATE.SUCCESS;
    const whyNot = !d?.course ? null
      : !connected ? '플러그인 연결이 확인돼야 저장할 수 있습니다.'
        : items.length === 0 ? '고를 항목이 없습니다.'
          : active.length === 0 ? '이 조건 초안에는 Moodle 에서 읽을 항목이 없습니다.'
            : !complete ? `${active.length}칸을 모두 골라야 저장할 수 있습니다.`
              : !dirty ? '저장된 설정과 같습니다.'
                : null;

    box.append(...[
      el('header.fp-head', {}, [
        el('h2', { text: '운영자 · 강좌 연결' }),
        el('span.fp-mode', {
          'data-mode': L.dataMode === DATA_MODE.SYNTHETIC ? 'synthetic' : 'actual',
          text: L.dataMode === DATA_MODE.SYNTHETIC ? '합성 시나리오'
            : L.actualUnavailable ? '실제 — 미연결' : '실제 자료',
        }),
      ]),
      el('p.fp-sub', {
        text: '조건마다 연결된 Moodle 강좌의 어느 항목을 읽을지 고릅니다. '
          + '목록은 서버가 준 것만 보여주고, 저장은 강좌 설정이지 지급 정책 확정이 아닙니다.',
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
      L.error && L.state !== STATE.STALE
        ? el('p.fp-note.fp-note--warn', { text: ERROR_TEXT[L.error.code] ?? ERROR_TEXT.RUN_FAILED })
        : null,

      // ── 연결된 강좌 ───────────────────────────────────────────────
      ...(d ? sec('연결된 Moodle 강좌', [
        el('ul.fp-links', {}, [
          el('li.fp-link', { 'data-tone': CONNECTION_TONE[d.connection?.status] ?? 'warn' }, [
            el('span.fp-link-name', { text: '플러그인' }),
            el('span.fp-link-what', { text: `${d.site ?? '확인 전'} ↔ CLEAR 서버` }),
            el('span.fp-link-badge', { text: CONNECTION_LABEL[d.connection?.status] ?? '확인 전' }),
            d.connection?.note ? el('span.fp-link-note', { text: d.connection.note }) : null,
          ].filter(Boolean)),
        ]),
        d.course
          ? el('dl.fp-pairs', {}, [
            pair('강좌', `${d.course.title} · ${d.course.cohort ?? ''}`.trim()),
            pair('Moodle 강좌 번호', d.course.id),
            pair('항목 목록', items.length > 0 ? `${items.length}개 · 목록 ${d.itemsRevision ?? '—'} · ${fmtTime(d.fetchedAt)}` : '없음'),
          ])
          : el('p.fp-note.fp-note--warn', {
            text: '연결된 강좌가 없습니다. Moodle 관리자가 CLEAR 플러그인을 설치하고 연결을 마쳐야 강좌와 항목 목록이 옵니다.',
          }),
      ]) : []),

      // ── 검증 대상 선택 ────────────────────────────────────────────
      ...(d?.course && connected ? sec(
        conditions == null ? '검증 대상 선택' : `검증 대상 선택 · 조건 ${active.length}개`,
        [
          conditions != null && active.length < conditions.length
            ? el('p.fp-note', {
              text: 'Moodle 에서 읽지 않는 조건(HackerRank 인증 등)은 여기서 고르지 않습니다. 참가자가 Reclaim 공증으로 직접 제출합니다.',
            })
            : null,
          active.length === 0
            ? el('p.fp-note.fp-note--warn', { text: '이 조건 초안에는 Moodle 에서 읽을 항목이 없습니다.' })
            : null,
          items.length === 0 && active.length > 0
            ? el('p.fp-note.fp-note--warn', {
              text: '이 강좌에 항목이 없습니다. Moodle 에서 강의 페이지·과제·회고 게시판을 만든 뒤 「다시 불러오기」를 눌러 주세요.',
            })
            : null,
          missing.length > 0
            ? el('p.fp-note.fp-note--warn', {
              text: `저장된 설정의 ${missing.map((k) => SLOTS.find((s) => s.key === k).label).join('·')} 항목이 지금 목록에 없습니다. `
                + '다시 골라 저장해 주세요. 그 전까지 저장된 설정은 그대로입니다.',
            })
            : null,
          el('div.fp-slots', {}, active.map((slot) => slotBox(slot, items, draft, saved, S.busy))),
          conditions == null
            ? el('p.fp-note', {
              text: 'HackerRank 인증은 Moodle 항목이 아니라 여기서 고르지 않습니다. 참가자가 Reclaim 공증으로 직접 제출합니다.',
            })
            : null,
        ],
      ) : []),

      // ── 저장 ──────────────────────────────────────────────────────
      ...(d?.course ? sec('저장', [
        el('div.fp-actions', {}, [
          el('button.fp-btn.fp-btn--primary', {
            type: 'button',
            'data-role': 'save',
            disabled: canSave ? null : 'disabled',
            onClick: submit,
          }, [el('span', { text: S.busy ? '저장 중…' : '설정 저장' })]),
          el('button.fp-btn', {
            type: 'button',
            disabled: L.busy || S.busy ? 'disabled' : null,
            onClick: () => { if (!L.busy) { seededFrom = null; void load.request(picked); } },
          }, [el('span', { text: L.busy ? '불러오는 중…' : '다시 불러오기' })]),
        ]),
        whyNot && !S.busy ? el('p.fp-note', { text: whyNot }) : null,
        saveLine(S, d),
        manyActivities
          ? el('p.fp-note.fp-note--wait', {
            text: '수강 활동을 여러 개 고르면 "모두 완료" 로 봅니다. 본부 결정(11/4): 실제 연결은 먼저 활동 하나로 '
              + '정상 흐름을 완성하고, 전체 완료 검증은 그 다음에 붙입니다. 그 전까지 여러 개 선택은 화면에만 남습니다.',
          })
          : null,
        el('p.fp-note', {
          text: '저장은 이 강좌의 읽기 설정입니다. 지급 정책 확정이나 환급 승인이 아니며, 진행 중인 참가자의 판정을 바꾸지 않습니다.',
        }),
      ]) : []),

      el('p.fp-note', {
        text: '이 화면은 강좌 설정 표시입니다. 자격 판정이나 지급 허용이 아닙니다.',
      }),
    ].filter(Boolean));
  };

  /** 칸 하나. 여러 개 칸은 체크박스, 하나 칸은 선택 상자 */
  function slotBox(slot, items, draftNow, savedNow, busy) {
    const candidates = items.filter((i) => slot.modules.includes(i.module));
    const label = (i) => `${i.name} · ${MODULE_LABEL[i.module] ?? i.module} · cm ${i.cmId}`;
    const current = draftNow[slot.key];
    const before = savedNow[slot.key];
    const changed = slot.multiple ? !sameList(current, before) : current !== before;
    const changedNote = !changed ? null
      : slot.multiple
        ? (before.length === 0 ? '저장 전' : `저장된 값 cm ${before.join(', ')} 에서 바뀜`)
        : (before == null ? '저장 전' : `저장된 값 cm ${before} 에서 바뀜`);

    return el('div.fp-slot', { 'data-changed': changed ? 'yes' : null }, [
      el('div.fp-slot-label', { id: `slot-${slot.key}-label` }, [
        el('span', { text: slot.label }),
        el('span.fp-slot-hint', { text: slot.hint }),
      ]),
      slot.multiple
        ? el('div.fp-checks', { role: 'group', 'aria-labelledby': `slot-${slot.key}-label` }, candidates.map((i) => (
          el('label.fp-check', {}, [
            el('input', {
              type: 'checkbox',
              value: String(i.cmId),
              checked: current.includes(i.cmId) ? 'checked' : null,
              disabled: items.length === 0 || busy ? 'disabled' : null,
              onChange: (e) => toggle(slot.key, i.cmId, Boolean(e.target.checked)),
            }),
            el('span', { text: label(i) }),
          ])
        )))
        : el('select.fp-slot-select', {
          'aria-labelledby': `slot-${slot.key}-label`,
          disabled: items.length === 0 || busy ? 'disabled' : null,
          onChange: (e) => chooseOne(slot.key, e.target.value),
        }, [
          el('option', { value: '', selected: current == null ? 'selected' : null, text: '선택 안 함' }),
          ...candidates.map((i) => el('option', {
            value: String(i.cmId),
            selected: i.cmId === current ? 'selected' : null,
            text: label(i),
          })),
        ]),
      slot.multiple && current.length > 1
        ? el('span.fp-slot-note', { text: `고른 ${current.length}개를 모두 완료해야 합니다.` })
        : null,
      candidates.length === 0 && items.length > 0
        ? el('span.fp-slot-note', { text: '이 종류의 항목이 강좌에 없습니다.' })
        : null,
      changedNote ? el('span.fp-slot-note.fp-slot-note--changed', { text: changedNote }) : null,
    ].filter(Boolean));
  }

  load.subscribe?.(render);
  save.subscribe?.(render);
  render();
  return {
    node: box,
    render,
    /** B 의 결과가 바뀌면 칸을 다시 맞춘다. 운영자가 고른 것은 남긴다 */
    setConditions(capabilities) {
      active = slotsFor(capabilities);
      conditions = capabilities;
      save.reset();
      render();
    },
    get picked() { return picked; },
    get draft() { return { ...draft, activity: [...draft.activity] }; },
    get activeSlots() { return active.map((s) => s.key); },
  };
}

/** 저장 어댑터 상태를 한 줄로 */
function saveLine(S, d) {
  if (S.state === STATE.LOADING) return el('p.fp-note.fp-note--wait', { text: '저장하고 있습니다…' });
  if (S.state === STATE.SUCCESS && S.payload?.result === 'SAVED') {
    const m = S.payload.mapping ?? {};
    return el('p.fp-note.fp-note--ok', {
      text: `저장됐습니다 · 설정 ${m.revision ?? '—'} · ${fmtTime(m.savedAt)}`,
    });
  }
  if (S.state === STATE.ERROR) {
    const reason = S.payload?.reason ?? ERROR_TEXT[S.error?.code] ?? ERROR_TEXT.RUN_FAILED;
    return el('p.fp-note.fp-note--warn', { text: `저장 실패 · ${reason} 고른 것은 그대로 있으니 다시 저장해 보세요.` });
  }
  if (S.state === STATE.EXPIRED) {
    return el('p.fp-note.fp-note--warn', { text: '세션이 만료돼 저장하지 못했습니다. 다시 로그인한 뒤 저장해 주세요.' });
  }
  if (d?.mapping && S.state === STATE.IDLE) {
    return el('p.fp-note', { text: `저장된 설정 ${d.mapping.revision ?? '—'} · ${fmtTime(d.mapping.savedAt)}` });
  }
  return null;
}

const sec = (title, children) => [
  el('section.fp-sec', {}, [el('h3.fp-sec-title', { text: title }), ...children.filter(Boolean)]),
];

const pair = (k, v) => el('div.fp-pair', {}, [el('dt', { text: k }), el('dd', { text: String(v) })]);

function fmtTime(iso) {
  if (!iso) return '확인 전';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '확인 전';
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
}
