// 운영자 검토 화면 (F3)
//
// 안내문을 넣으면 AI 가 조건과 금액을 뽑는다. 이 화면이 하는 일은 그 결과를
// 사람이 확인하게 만드는 것이다.
//
// 보여줘야 하는 것은 '뽑은 값' 이 아니라 **빈칸** 이다.
//
//   - AI 가 못 뽑았거나 확신하지 못한 값은 비어 있다
//   - 왜 비었는지(질문·충돌)가 옆에 붙는다
//   - AI 가 본 값은 버리지 않고 따로 적는다 — 운영자가 판단할 재료다
//   - 채워진 값은 안내문 어느 줄에서 나왔는지 가리킨다
//
// 마지막 줄이 멘토가 평가지표로 꼽은 '원문 인용 위치 매핑' 이다. 값과 원문이
// 이어지지 않으면 운영자는 대조할 방법이 없고, 결국 AI 를 그냥 믿게 된다.
//
// 승인 버튼은 두지 않는다. 승인은 정책을 고정하는 행위이고 서버가 있어야
// 한다(PR #59·#61). 지금 두면 눌러도 아무 일이 안 나거나, 더 나쁘게는
// 고정된 것처럼 보인다.

import { el, clear } from './dom.js';

/** 값이 지금 어떤 상태인가 */
const STATE = Object.freeze({
  OBSERVED: { label: '확인됨', tone: 'ok', mark: '✓' },
  HELD: { label: '보류', tone: 'held', mark: '!' },
  UNOBSERVED: { label: '안내문에 없음', tone: 'none', mark: '—' },
});

/** 보류 사유를 사람 말로. 'QUESTION:0' 은 questions[0] 을 가리킨다 */
export function reasonText(reason, view) {
  if (reason === 'NO_VALUE') return '안내문에서 이 값을 찾지 못했습니다.';
  const [kind, index] = reason.split(':');
  const at = Number(index);
  if (kind === 'QUESTION') return view.questions[at]?.text ?? '확인이 필요합니다.';
  if (kind === 'FLAG') {
    const code = view.flags[at]?.code;
    return code === 'CONFLICT' ? '안내문 안에서 값이 서로 어긋납니다.'
      : code === 'UNCERTAIN' ? '안내문이 정확한 기준을 밝히지 않았습니다.'
        : '확인이 필요합니다.';
  }
  return '확인이 필요합니다.';
}

/** 보류·미관측인 값의 수. 운영자가 할 일이 몇 개인지 */
export const heldCount = (view) =>
  view.fields.filter((field) => field.state !== 'OBSERVED').length;

/** 그 줄을 근거로 쓰는 값들. 안내문에서 값으로 거꾸로 짚을 때 쓴다 */
export const fieldsAt = (view, locator) =>
  view.fields.filter((field) => field.value !== null && field.location === locator);

/** 안내문 한 덩이 */
function sourceBlock(view, block, onPick, picked) {
  const used = fieldsAt(view, block.locator);
  return el('button.src-block', {
    type: 'button',
    'data-used': used.length ? 'yes' : 'no',
    'data-picked': picked === block.locator ? 'yes' : 'no',
    title: used.length ? `이 줄에서 ${used.map((f) => f.label).join(', ')} 을 뽑았습니다` : '뽑은 값이 없습니다',
    onClick: () => onPick(block.locator),
  }, [
    el('span.src-loc', { text: block.locator }),
    el('span.src-text', { text: block.text }),
    used.length ? el('span.src-used', { text: used.map((f) => f.label).join(' · ') }) : null,
  ]);
}

/** 운영자가 확인할 값 하나 */
function fieldRow(view, field, onPick, picked) {
  const state = STATE[field.state] ?? STATE.UNOBSERVED;
  const seen = view.provenance.find((row) => row.fieldId === field.fieldId);
  return el('div.rv-field', {
    'data-tone': state.tone,
    'data-picked': picked && picked === field.location ? 'yes' : 'no',
  }, [
    el('div.rv-top', {}, [
      el('span.rv-label', { text: field.label }),
      el('span.rv-state', {}, [
        el('span.rv-mark', { 'aria-hidden': 'true', text: state.mark }),
        el('span', { text: state.label }),
      ]),
      // 값이 안내문 어디서 왔는지. 누르면 그 줄로 이어진다.
      field.location ? el('button.rv-loc', {
        type: 'button',
        title: '안내문에서 이 값이 나온 자리',
        onClick: () => onPick(field.location),
      }, [el('span', { text: field.location })]) : null,
    ]),

    field.value !== null
      ? el('strong.rv-value', {}, [
        el('em', { text: field.value }),
        field.unit ? ` ${field.unit}` : null,
      ])
      : el('strong.rv-value.rv-empty', { text: '비어 있음' }),

    // 왜 비었는지. 사유 없이 비워 두면 운영자가 넘어가 버린다.
    ...(field.reasons ?? []).map((reason) => el('p.rv-why', {}, [
      el('span.rv-why-tag', { text: '확인 필요' }),
      el('span', { text: reasonText(reason, view) }),
    ])),

    // AI 가 본 값은 보류되어도 버리지 않는다. 다만 '확정된 값' 과 섞지 않는다.
    seen && seen.observedValue !== null && field.value === null
      ? el('p.rv-seen', { text: `AI가 본 값: ${seen.observedValue}` })
      : null,
  ]);
}

/**
 * 검토 한 건.
 *
 * 왼쪽에 안내문, 오른쪽에 값. 한쪽을 누르면 다른 쪽이 같이 표시된다.
 * 둘을 따로 보여주면 운영자가 대조할 수 없고, 대조가 이 화면의 전부다.
 */
export function reviewSection(view) {
  let picked = null;
  const section = el('section.rv', {});

  const render = () => {
    const held = heldCount(view);
    const pick = (locator) => { picked = picked === locator ? null : locator; render(); };

    clear(section);
    section.append(...[
      el('div.sec-head', {}, [
        el('h3', { text: view.title }),
        el('span.rv-status', { 'data-held': held ? 'yes' : 'no' }, [
          el('span', { text: held ? `확인 필요 ${held}개` : '값은 모두 확인됨' }),
        ]),
      ]),
      el('p.muted', {
        text: `${view.source} 에서 AI가 뽑은 결과입니다. 아래 값을 확인하고 승인하면 조건이 고정됩니다.`,
      }),

      // 승인 가능 여부는 데이터가 말한다. 버튼을 두지 않는 대신 무엇이
      // 막고 있는지는 분명히 적는다.
      el('p.rv-gate', { 'data-open': 'no' }, [
        el('span.rv-gate-tag', { text: '승인 불가' }),
        el('span', {
          text: held
            ? `비어 있는 값 ${held}개를 먼저 채워야 합니다.`
            : '값은 모두 확인됐습니다. 승인은 정책을 고정하는 절차라 서버 연결 뒤에 열립니다.',
        }),
      ]),

      el('div.rv-cols', {}, [
        el('div.rv-col', {}, [
          el('h4.rv-col-head', { text: '안내문' }),
          el('div.rv-src', {},
            view.blocks.map((block) => sourceBlock(view, block, pick, picked))),
        ]),
        el('div.rv-col', {}, [
          el('h4.rv-col-head', { text: 'AI가 뽑은 값' }),
          el('div.rv-fields', {},
            view.fields.map((field) => fieldRow(view, field, pick, picked))),
        ]),
      ]),

      view.questions.length
        ? el('div.rv-asks', {}, [
          el('h4.rv-col-head', { text: '사람에게 묻는 것' }),
          ...view.questions.map((question) => el('p.rv-ask', {}, [
            el('span.rv-ask-tag', {
              text: question.fieldIds
                .map((id) => view.fields.find((f) => f.fieldId === id)?.label ?? id)
                .join(' · '),
            }),
            el('span', { text: question.text }),
          ])),
        ])
        : null,

      el('p.cond-foot', {
        text: 'AI는 안내문에서 값을 옮기기만 합니다. 판단하지 않고, 찾지 못한 값을 지어내지 않습니다.',
      }),
    ].filter(Boolean));
  };

  render();
  return section;
}
