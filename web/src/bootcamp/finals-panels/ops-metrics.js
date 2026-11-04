// 운영효과 패널 — 무엇을 셌고 무엇을 안 쟀는지
//
// "자동화로 몇 % 줄었다" 를 말하고 싶은 화면이다. 그런데 **그 말을 하려면
// 같은 사례를 사람이 처리한 시간이 있어야 한다.** 없으면 비교 대상이 없고,
// 그때 비율을 적으면 그건 측정이 아니라 계산이다.
//
// 그래서 이 패널의 규칙은 하나다.
//
//   baselineComparable 이 false 거나 없으면 → 절감률은 **N/A**
//
// 멘토 예시의 150건·70% 같은 숫자도 실적으로 쓰지 않는다.
//
// ── 또 하나. 사람이 꼭 해야 하는 일은 자동이 아니다 ─────────────────────
//
// 로그인·서명·지급 동의는 **의무 확인**이라 사람이 반드시 한다. 예외 검토도
// 사람이 한다. 이걸 자동 처리 건수에 섞으면 무인으로 읽힌다. 따로 센다.
//
// 사람의 **실작업 시간**과 **전체 경과 시간**도 다르다. 기다린 시간을
// 일한 시간으로 적으면 안 된다.

import { el, clear } from '../../ui/dom.js';
import { STATE, DATA_MODE } from './adapter.js';

const NA = 'N/A';

/** 측정 전이거나 안 준 값. 0 으로 채우지 않는다 */
const num = (v) => (Number.isFinite(v) ? v.toLocaleString('ko-KR') : '확인 전');
/** 단위가 붙는 수. **없는 값에는 단위도 안 붙인다** — '확인 전건' 이 나왔었다 */
const count = (v, unit) => (Number.isFinite(v) ? `${v.toLocaleString('ko-KR')}${unit}` : '확인 전');

const ms = (v) => {
  if (!Number.isFinite(v)) return '확인 전';
  if (v < 1000) return `${v}ms`;
  const s = v / 1000;
  return s < 60 ? `${s.toFixed(1)}초` : `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`;
};

const COVERAGE_LABEL = Object.freeze({
  verification: '조건 확인',
  attempts: '시도 기록',
  mandatory: '의무 확인',
  exceptions: '예외 개입',
  human: '사람 작업',
  caseCompletion: '완료 창',
});

const BANNER = Object.freeze({
  [STATE.IDLE]: '아직 불러오지 않았습니다.',
  [STATE.LOADING]: '불러오는 중…',
  [STATE.SUCCESS]: null,
  [STATE.ERROR]: '계측 자료를 불러오지 못했습니다.',
  [STATE.EXPIRED]: '자료가 만료됐습니다. 다시 불러와 주세요.',
  [STATE.STALE]: '범위가 바뀌었습니다. 아래는 바뀌기 전 자료입니다.',
});

/**
 * @param {object} options
 * @param {object} options.adapter
 */
export function opsMetricsPanel({ adapter }) {
  const box = el('section.fp', {});

  const render = () => {
    clear(box);
    const s = adapter.current;
    const d = s.payload ?? null;
    const banner = BANNER[s.state] ?? null;

    // **절감률은 비교 기준이 있을 때만.** 없으면 N/A 다.
    const comparable = d?.baselineComparable === true;
    const reduction = comparable && Number.isFinite(d?.humanWorkReductionPercent)
      ? `${d.humanWorkReductionPercent}%`
      : NA;

    const partial = d?.coverage
      ? Object.entries(d.coverage).filter(([, v]) => v !== true).map(([k]) => COVERAGE_LABEL[k] ?? k)
      : [];

    box.append(...[
      el('header.fp-head', {}, [
        el('h2', { text: '운영 효과 계측' }),
        el('span.fp-mode', {
          'data-mode': s.dataMode === DATA_MODE.SYNTHETIC ? 'synthetic' : 'actual',
          text: s.dataMode === DATA_MODE.SYNTHETIC ? '합성 자료'
            : s.actualUnavailable ? '실제 — 미연결' : '실제 자료',
        }),
      ]),

      el('p.fp-sub', {
        text: '기록된 이벤트만 셉니다. 기관 전체나 기수 전체로 늘려 잡지 않습니다.',
      }),

      el('div.fp-actions', {}, [
        el('button.fp-btn', {
          type: 'button',
          disabled: s.busy ? 'disabled' : null,
          onClick: () => { void adapter.request(); },
        }, [el('span', { text: s.busy ? '불러오는 중…' : '계측 불러오기' })]),
      ]),

      banner ? el('p.fp-note', { text: banner }) : null,
      s.actualUnavailable
        ? el('p.fp-note.fp-note--warn', {
          text: '실제 계측 경로가 아직 연결되지 않았습니다. 합성으로 대신하지 않습니다.',
        })
        : null,

      // ── 절감률 — 제일 위에, 제일 크게, 그리고 대개 N/A ─────────────
      ...(d ? [el('div.fp-headline', { 'data-na': reduction === NA ? 'yes' : null }, [
        el('span.fp-headline-label', { text: '사람 작업 절감률' }),
        el('strong.fp-headline-value', { text: reduction }),
        el('span.fp-headline-note', {
          text: comparable
            ? '동일 사례 수작업 비교 기준입니다.'
            : '같은 사례를 사람이 처리한 비교 기록이 없어 계산하지 않습니다. '
              + '자동 처리 건수에 분당 단가를 곱하는 것은 측정이 아닙니다.',
        }),
      ])] : []),

      // ── 범위와 완전성 ────────────────────────────────────────────
      ...(d ? sec('무엇을 쟀나', [
        el('dl.fp-pairs', {}, [
          pair('범위', `${d.scope?.type ?? '확인 전'} · 신청 ${d.scope?.applicationRef ?? '확인 전'}`),
          pair('자료 성격', d.scope?.mode === 'SYNTHETIC' ? '합성' : '실측'),
          pair('출처', d.scope?.source ?? '확인 전'),
          pair('이벤트 수', num(d.eventCount)),
        ]),
        partial.length > 0
          ? el('p.fp-note.fp-note--warn', {
            text: `아래 수치는 기록된 이벤트 기준입니다. 완전성이 확인되지 않은 범위: ${partial.join(' · ')}`,
          })
          : el('p.fp-note.fp-note--ok', { text: '모든 범위의 완전성이 확인됐습니다.' }),
      ]) : []),

      // ── 자동 / 사람 ──────────────────────────────────────────────
      ...(d ? sec('자동 처리와 사람 개입', [
        el('dl.fp-pairs', {}, [
          pair('확인한 조건', count(d.verification?.verifiedConditions, '개')),
          pair('그중 자동 확인', count(d.verification?.automatedVerifiedConditions, '개')),
          pair('논리 작업', count(d.operations?.logical, '건')),
          pair('자동 완료', count(d.operations?.automatedCompleted, '건')),
          pair('시도', count(d.operations?.attempts, '회')),
          pair('재시도', count(d.operations?.retries, '회')),
          pair('실패 시도', count(d.operations?.failedAttempts, '회')),
        ]),
        // **의무 확인은 자동이 아니다.** 따로 적는다.
        el('dl.fp-pairs', {}, [
          pair('의무 확인 (로그인·서명·지급 동의)', count(d.interventions?.mandatory, '건')),
          pair('예외 검토', count(d.interventions?.exceptions, '건')),
        ]),
        el('p.fp-note', {
          text: '의무 확인과 예외 검토는 사람이 반드시 하는 일입니다. 자동 처리로 세지 않습니다.',
        }),
      ]) : []),

      // ── 시간 ─────────────────────────────────────────────────────
      ...(d ? sec('시간', [
        el('dl.fp-pairs', {}, [
          pair('전체 경과', ms(d.time?.overallElapsedMs)),
          pair('사람 실작업', ms(d.time?.recordedPersonMs)),
          pair('확인 구간', ms(d.time?.recordedVerificationWallMs)),
          pair('대기 구간', ms(d.time?.recordedWaitingWallMs)),
        ]),
        el('p.fp-note', {
          text: '전체 경과에는 기다린 시간이 들어 있습니다. 사람 실작업과 같은 값이 아닙니다.',
        }),
      ]) : []),
    ].filter(Boolean));
  };

  adapter.subscribe?.(render);
  render();
  return { node: box, render };
}

const sec = (title, children) => [
  el('section.fp-sec', {}, [el('h3.fp-sec-title', { text: title }), ...children.filter(Boolean)]),
];

const pair = (k, v) => el('div.fp-pair', {}, [
  el('dt', { text: k }), el('dd', { text: String(v) }),
]);
