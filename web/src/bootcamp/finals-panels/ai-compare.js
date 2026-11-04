// AI 비교 패널 — 조건 구조화에서 근거 대조까지
//
// 학원이 쓴 **환급 안내문 한 덩어리**를 넣으면, 그것이 어떤 조건으로 쪼개지고
// 어떤 도구로 확인되는지, 그리고 그 도구가 무엇을 봤는지를 한 화면에 편다.
//
//   원문 → ① 조항 쪼개기 → ② 조건 매핑 → ③ 계획 검사 → ④ 근거 대조
//
// ── 이 패널이 **주장하지 않는** 것 ──────────────────────────────────────
//
// 자연어를 범용 AI 가 이해한 결과가 아니다. 지원 문법 안에서만 쪼개고,
// 밖이면 **부분 실행하지 않고 질문으로 남긴다.** 실행 결과도 공개 합성자료에
// 대한 로컬 검증이지 실제 Moodle 조회나 Reclaim 서명 검증이 아니다.
//
// 그래서 화면이 매번 같이 적는다 — 자격 판정 아님, 지급 허용 아님.

import { el, clear } from '../../ui/dom.js';
import { STATE, DATA_MODE } from './adapter.js';

/** 네 기능의 사용자용 한글 라벨. 코드 이름을 그대로 내보내지 않는다 */
export const CAPABILITY_LABEL = Object.freeze({
  'MOODLE_ACTIVITY_COMPLETION.1': '강의 활동 완료',
  'MOODLE_ASSIGNMENT_SUBMISSION.1': '과제 제출',
  'REFLECTION_REQUIRED_TOPICS.1': '회고 세 항목',
  'HACKERRANK_CERTIFICATE_HOLDING.1': 'HackerRank 인증서 보유',
});

/** 어디서 읽는지. 조건 이름과 **원천**을 섞지 않는다 */
export const CAPABILITY_SOURCE = Object.freeze({
  'MOODLE_ACTIVITY_COMPLETION.1': 'Moodle 활동 완료 기록',
  'MOODLE_ASSIGNMENT_SUBMISSION.1': 'Moodle 과제 제출 기록',
  'REFLECTION_REQUIRED_TOPICS.1': 'Moodle 회고 글 + 텍스트 AI',
  'HACKERRANK_CERTIFICATE_HOLDING.1': 'HackerRank + Reclaim 공증',
});

const TOOL_LABEL = Object.freeze({
  'moodle.activity.public': 'Moodle 활동 읽기',
  'moodle.assignment.public': 'Moodle 과제 읽기',
  'reflection.topics.public': '회고 항목 검사',
  'hackerrank.certificate.public': 'HackerRank 인증서 검사',
});

/** 관측 결과. '충족' 과 '공개 합성자료에서 충족' 은 다른 말이다 */
const OBSERVATION_LABEL = Object.freeze({
  MET_IN_PUBLIC_FIXTURE: '공개 합성자료에서 충족',
  NOT_MET_IN_PUBLIC_FIXTURE: '공개 합성자료에서 미충족',
  INDETERMINATE: '판단 보류',
});

const AUTHENTICITY_LABEL = Object.freeze({
  SYNTHETIC_UNVERIFIED: '합성 · 서명 미검증',
  SIGNATURE_VERIFIED: '서명 검증됨',
});

/** 상태마다 화면 맨 위에 뭐라고 적을지 */
const BANNER = Object.freeze({
  [STATE.IDLE]: { tone: null, text: '안내문을 넣고 「조건 구조화」를 눌러 주세요.' },
  [STATE.LOADING]: { tone: 'wait', text: '구조화하고 있습니다…' },
  [STATE.SUCCESS]: { tone: 'ok', text: '지원 문법 안에서 모두 쪼갰습니다.' },
  [STATE.NEEDS_CLARIFICATION]: {
    tone: 'wait',
    text: '뜻이 한 가지로 좁혀지지 않는 문장이 있습니다. 아래 질문을 보고 원문을 고쳐 주세요.',
  },
  [STATE.UNSUPPORTED]: {
    tone: 'wait',
    text: '지원하지 않는 문장이 있습니다. 부분 실행하지 않습니다 — 전부 또는 아무것도입니다.',
  },
  [STATE.ERROR]: { tone: 'warn', text: '구조화하지 못했습니다.' },
  [STATE.EXPIRED]: { tone: 'warn', text: '결과가 만료됐습니다. 다시 돌려 주세요.' },
  [STATE.STALE]: {
    tone: 'wait',
    text: '원문이 바뀌었습니다. 아래는 바뀌기 전 결과입니다.',
  },
});

const ERROR_TEXT = Object.freeze({
  ACTUAL_NOT_CONNECTED: '실제 자료 경로가 아직 연결되지 않았습니다. 합성으로 대신하지 않습니다.',
  // 합성 모드는 예문에만 답이 있다. 직접 고친 문장을 지어내서 채우지 않는다.
  NO_FIXTURE: '이 문장의 합성 자료가 없습니다. 합성 모드는 위 예문 세 개만 답할 수 있고, '
    + '직접 쓴 문장은 실제 모듈이 연결돼야 돕니다.',
  RUN_FAILED: '실행 중 오류가 났습니다.',
});

const short = (v) => {
  const s = String(v ?? '');
  return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s;
};

/**
 * @param {object} options
 * @param {object} options.adapter      createAdapter 로 만든 것
 * @param {string} options.source       원문 초기값
 * @param {Function} options.onSource   원문이 바뀌면
 * @param {Array<{id:string,label:string,source:string}>} [options.presets]
 *   조건 변화 시연용 예문. ① 강의+과제 → ② 회고 추가 → ③ HackerRank 추가.
 *   누르면 원문 칸에 들어가고 바로 구조화한다. 원문 칸은 그대로 고칠 수 있다 —
 *   심사위원이 "그럼 이건요?" 하고 바꿔도 같은 길로 간다.
 */
export function aiComparePanel({ adapter, source = '', onSource = () => {}, presets = [] }) {
  const box = el('section.fp', {});
  let text = source;

  const run = () => { void adapter.request(text); };

  const edit = (next) => {
    text = next;
    onSource(next);
    // 입력이 바뀌면 이전 결과는 이 입력의 것이 아니다.
    adapter.markStale(next);
  };

  const pick = (preset) => { edit(preset.source); run(); };

  const render = () => {
    clear(box);
    const s = adapter.current;
    const banner = BANNER[s.state] ?? BANNER[STATE.ERROR];
    const draft = s.payload?.draft ?? null;
    const plan = s.payload?.plan ?? null;
    const check = s.payload?.check ?? null;
    const result = s.payload?.result ?? null;
    // stale 이면 값은 그리되 **지금 입력의 결과가 아니라고** 못 박는다.
    const stale = s.state === STATE.STALE;

    box.append(...[
      el('header.fp-head', {}, [
        el('h2', { text: 'AI 조건 구조화 · 근거 대조' }),
        modeChip(s),
      ]),

      el('p.fp-sub', {
        text: '학원 안내문을 조건으로 쪼개고, 각 조건을 어떤 도구로 확인하는지 보여줍니다. '
          + '이 화면은 자격을 판정하거나 지급을 허용하지 않습니다.',
      }),

      // ── 조건 변화 시연 ────────────────────────────────────────────
      //
      // 조건이 하나씩 늘 때 도구와 계획이 따라 느는 것을 보여준다.
      // 지금 원문과 같은 예문은 눌린 모양으로 표시한다.
      presets.length > 0
        ? el('div.fp-presets', { role: 'group', 'aria-label': '조건 변화 예문' }, [
          el('span.fp-label', { text: '조건 변화 예문' }),
          ...presets.map((p) => el('button.fp-chip', {
            type: 'button',
            'aria-pressed': text === p.source ? 'true' : 'false',
            disabled: s.busy ? 'disabled' : null,
            onClick: () => pick(p),
          }, [el('span', { text: p.label })])),
        ])
        : null,

      // ── 원문 ──────────────────────────────────────────────────────
      el('label.fp-field', {}, [
        el('span.fp-label', { text: '환급 안내문 원문' }),
        el('textarea.fp-input', {
          rows: '3',
          value: text,
          'aria-label': '환급 안내문 원문',
          onInput: (e) => { edit(e.target.value); render(); },
        }),
      ]),

      el('div.fp-actions', {}, [
        el('button.fp-btn', {
          type: 'button',
          disabled: s.busy || text.trim() === '' ? 'disabled' : null,
          onClick: run,
        }, [el('span', { text: s.busy ? '구조화 중…' : '조건 구조화' })]),
      ]),

      el('p', { class: banner.tone ? `fp-note fp-note--${banner.tone}` : 'fp-note', text: banner.text }),

      s.actualUnavailable
        ? el('p.fp-note.fp-note--warn', { text: ERROR_TEXT.ACTUAL_NOT_CONNECTED })
        : null,
      s.error ? el('p.fp-note.fp-note--warn', { text: ERROR_TEXT[s.error.code] ?? s.error.code }) : null,

      // ── ① 조항과 ② 조건 ─────────────────────────────────────────
      ...(draft ? section('① 쪼갠 조항과 ② 매핑한 조건', [
        stale ? el('p.fp-note.fp-note--wait', { text: '아래는 바뀌기 전 원문 기준입니다.' }) : null,
        el('ul.fp-list', {}, (draft.conditions ?? []).map((c) => {
          const clause = (draft.clauses ?? []).find((x) => x.id === c.clauseId) ?? null;
          return el('li.fp-row', {}, [
            el('p.fp-row-title', { text: CAPABILITY_LABEL[c.capability] ?? c.capability }),
            // 원문 근거. 어느 글자에서 나왔는지 그대로 보여준다.
            clause
              ? el('blockquote.fp-quote', { text: `"${clause.text}"` })
              : null,
            el('dl.fp-pairs', {}, [
              pair('읽는 곳', CAPABILITY_SOURCE[c.capability] ?? '미지정'),
              pair('대상', c.target ?? '미지정'),
              clause ? pair('원문 위치', `${clause.start}–${clause.end}`) : null,
            ].filter(Boolean)),
          ]);
        })),
        // 지원 밖 문장. **보류하고 부분 실행하지 않는다.**
        (draft.questions ?? []).length > 0
          ? el('div.fp-hold', {}, [
            el('p.fp-row-title', { text: '보류한 문장' }),
            el('ul.fp-list', {}, draft.questions.map((q) => {
              const clause = (draft.clauses ?? []).find((x) => x.id === q.clauseId) ?? null;
              return el('li.fp-row', {}, [
                clause ? el('blockquote.fp-quote', { text: `"${clause.text}"` }) : null,
                el('p.fp-note', {
                  text: q.reason === 'UNSUPPORTED'
                    ? '지원하는 조건 문법이 아닙니다. 사람이 읽고 정해야 합니다.'
                    : '뜻이 한 가지로 좁혀지지 않습니다.',
                }),
              ]);
            })),
          ])
          : null,
      ]) : []),

      // ── ③ 계획 ────────────────────────────────────────────────────
      ...(plan ? section('③ 선택한 도구와 계획 검사', [
        el('ul.fp-list', {}, (plan.steps ?? []).map((st) => el('li.fp-row', {}, [
          el('p.fp-row-title', { text: TOOL_LABEL[st.tool] ?? st.tool }),
          el('dl.fp-pairs', {}, [
            pair('도구 식별자', `${st.tool} · v${st.version}`),
            pair('선행 단계', (st.dependsOn ?? []).length ? st.dependsOn.join(', ') : '없음'),
            pair('실패 시', st.onFailure === 'STOP' ? '중단' : String(st.onFailure)),
          ]),
        ]))),
        check
          ? el('p', {
            class: check.ok ? 'fp-note fp-note--ok' : 'fp-note fp-note--warn',
            text: check.ok
              ? '계획 검사를 통과했습니다. 읽기 전용 도구만, 조건 하나당 한 단계입니다.'
              : `계획 검사에서 보류했습니다 — ${(check.errors ?? []).join(', ')}`,
          })
          : null,
      ]) : []),

      // ── ④ 근거 대조 ──────────────────────────────────────────────
      ...(result ? section('④ 도구가 본 것', [
        el('ul.fp-list', {}, (result.observations ?? []).map((o) => el('li.fp-row', {}, [
          el('p.fp-row-title', { text: TOOL_LABEL[o.tool] ?? o.tool }),
          el('dl.fp-pairs', {}, [
            pair('결과', OBSERVATION_LABEL[o.state] ?? o.state),
            pair('자료 성격', AUTHENTICITY_LABEL[o.authenticity] ?? o.authenticity),
            pair('서명 검증', o.signatureVerified === true ? '검증됨' : '하지 않음'),
            pair('기록 지문', short(o.recordHash)),
          ]),
        ]))),
        el('dl.fp-pairs', {}, [
          pair('원문 지문', short(result.sourceHash)),
          pair('계획 지문', short(result.planHash)),
          pair('지문 대조', result.hashStatus === 'VERIFIED' ? '일치' : String(result.hashStatus)),
          pair('실제 모델 호출', result.actualModelCall === true ? '있음' : '없음'),
        ]),
        // 이 패널이 무엇이 **아닌지**. 매번 같이 적는다.
        el('p.fp-note.fp-note--warn', {
          text: '공개 합성자료에 대한 로컬 검증입니다. 실제 Moodle 조회·Reclaim 서명 검증·'
            + '실제 모델 호출이 아니며, 자격 판정이나 지급 허용이 아닙니다.',
        }),
      ]) : []),
    ].filter(Boolean));
  };

  adapter.subscribe?.(render);
  render();
  return { node: box, render };
}

/** 모드 칩. 합성이면 **눈에 띄게** */
function modeChip(s) {
  const synthetic = s.dataMode === DATA_MODE.SYNTHETIC;
  return el('span.fp-mode', {
    'data-mode': synthetic ? 'synthetic' : 'actual',
    text: synthetic ? '합성 자료' : s.actualUnavailable ? '실제 — 미연결' : '실제 자료',
  });
}

const section = (title, children) => [
  el('section.fp-sec', {}, [el('h3.fp-sec-title', { text: title }), ...children.filter(Boolean)]),
];

const pair = (k, v) => el('div.fp-pair', {}, [
  el('dt', { text: k }), el('dd', { text: String(v) }),
]);
