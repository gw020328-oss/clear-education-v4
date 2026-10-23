// 화면 — 신청 목록과 상세, 그리고 로딩·빈 목록·오류
//
// 어댑터를 직접 부르지 않는다. main.js 가 받은 결과만 그린다.

import { el, clear, field, shortHex, boolText } from './dom.js';
import { policySection, policyDetailSection } from './policy-view.js';
import { stepList } from './timeline.js';
import {
  stateLabel, STEP_ORDER, TOTAL_STEPS, actorFor, nextFor,
  SYNTHETIC_NOTICE, NOT_CLAIMED_HERE, errorText,
} from './state-labels.js';

// ── 공통 조각 ────────────────────────────────────────────────────────────────

export const syntheticBanner = () => el('div.banner', { role: 'note' }, [
  el('span.banner-tag', { text: SYNTHETIC_NOTICE.title }),
  el('span', { text: SYNTHETIC_NOTICE.body }),
]);

const actorChip = (actor) => el('span.actor', { 'data-actor': actor.key, text: actor.label });

/**
 * 지금 상태의 단계 번호는 '거기까지 끝났다'는 뜻이다. 3단계에 있으면 3단계의
 * 일까지 끝난 것이고 진행 중인 것은 4단계다. 그래서 '3단계'가 아니라
 * '3 / 5 완료'로 적는다.
 */
const stepBadge = (label) => el('span.stepbadge', {}, [
  el('b', { text: String(label.step) }),
  el('span', { text: `/${TOTAL_STEPS} 완료` }),
]);

export const loadingView = (what) => el('div.card.center', { 'aria-busy': 'true', role: 'status' }, [
  el('p.spinner', { 'aria-hidden': 'true', text: '●  ●  ●' }),
  el('p.muted', { text: `${what}을 불러오는 중입니다.` }),
]);

export const emptyView = () => el('div.card.center', {}, [
  el('p.empty-mark', { 'aria-hidden': 'true', text: '—' }),
  el('h2', { text: '신청이 없습니다' }),
  el('p.muted', { text: '이 상황에는 신청이 하나도 없습니다. 위에서 다른 상황을 골라 보세요.' }),
]);

export function errorView(code, onRetry) {
  const text = errorText(code);
  return el('div.card.error', { role: 'alert' }, [
    el('h2', { text: text.title }),
    el('p', { text: text.body }),
    el('p.code', { text: code }),
    onRetry ? el('button.btn', { type: 'button', onClick: onRetry, text: '다시 시도' }) : null,
  ]);
}

// ── 목록 ────────────────────────────────────────────────────────────────────

export function listView(items, context = {}) {
  return el('section', {}, [
    el('h2', { id: 'list-heading', text: '내 신청' }),
    el('p.muted', { text: '한 반에 신청은 하나입니다. 눌러서 진행 상황을 확인하세요.' }),
    el('ul.list', { 'aria-labelledby': 'list-heading' }, items.map((view) => {
      const label = stateLabel(view.state);
      return el('li', {}, [
        el('a.row', { href: `#/applications/${view.applicationId}` }, [
          el('div.row-head', {}, [
            stepBadge(label),
            el('span.row-title', { text: label.title }),
            actorChip(actorFor(view.state, context)),
          ]),
          el('div.minibar', { 'aria-hidden': 'true' },
            STEP_ORDER.map((s) => el('span.minibar-seg', {
              'data-status': stateLabel(s).step <= label.step ? 'done' : 'todo',
            }))),
          el('p.row-fact', { text: label.fact }),
          el('div.row-foot', {}, [
            el('code.row-id', { text: shortHex(view.applicationId), title: view.applicationId }),
            el('span.row-go', { 'aria-hidden': 'true', text: '자세히 →' }),
          ]),
        ]),
      ]);
    })),
  ]);
}

// ── 상세 ────────────────────────────────────────────────────────────────────

/**
 * 신청 전체 화면 — 첫 화면.
 *
 * 동의한 조건과 기한은 신청 전체에 공통이므로 여기 한 번만 둔다.
 * 단계마다 반복하면 어느 단계를 열어도 같은 화면처럼 보인다.
 * 단계별로 달라지는 것은 타임라인에서 보고, 더 보려면 그 단계를 누른다.
 */
export function dashboardView(view, policy, context = {}) {
  const label = stateLabel(view.state);
  const actor = actorFor(view.state, context);

  return el('section', {}, [
    // 고정된 조건이 먼저다. 이 제품이 하는 일은 '조건을 못 바꾸게 만드는 것'이고,
    // 참가자가 몇 달 뒤 다시 들어왔을 때 확인하려는 것도 등록 절차가 아니라
    // '내가 뭘 받기로 했더라' 다. 등록 단계는 그 아래 줄 다섯 개면 된다.
    // 조건은 정책에서, 어디까지 왔는지는 신청에서 온다. 둘을 조건 id 로 맞춘다.
    policy
      ? policySection(policy, {
        progress: view.conditionProgress ?? null,
        // 최종 동의 전에는 고정된 것이 아니다. consentScope 가 CONTRACT 로
        // 바뀌는 자리가 그 경계다(3단계).
        fixed: view.consentScope === 'CONTRACT',
      })
      : el('p.muted', { text: '조건을 불러오지 못했습니다.' }),

    // 지금 무슨 일을 기다리는지 한 문장. 단계 이름이 아니라 할 일로 적는다.
    el('div.now', { 'data-actor': actor.key }, [
      el('div.now-top', {}, [
        el('span.now-tag', { text: '지금' }),
        stepBadge(label),
        actorChip(actor),
      ]),
      el('p.now-line', { text: nextFor(view.state, context) }),
      el('p.now-fact', { text: label.fact }),
      el('p.forbidden', {}, [
        el('strong', { text: '이 화면이 말하지 않는 것 — ' }),
        el('span', { text: label.forbidden }),
      ]),
    ]),

    stepList(view, context),

    policy ? policyDetailSection(policy) : null,

    el('details.tech', {}, [
      el('summary', { text: '식별자 보기' }),
      el('dl.fields', {}, [
        field('신청 ID', view.applicationId),
        field('참가자 지갑', view.learner, '합성 주소입니다.'),
        field('정책 해시', view.policyHash),
        field('상태', view.state),
        field('동의 범위', view.consentScope),
        field('지급 허용', boolText(view.paymentAllowed),
          '현재 구현에서 항상 아니오입니다. 자격 판정과 권한 발급은 후속 작업입니다.'),
        field('데이터 모드', view.dataMode),
      ]),
    ]),

    el('div.card.limits', {}, [
      el('h3', { text: '이 단계에서 확인되지 않는 것' }),
      el('ul', {}, NOT_CLAIMED_HERE.map((line) => el('li', { text: line }))),
    ]),
  ]);
}

export function notFoundView() {
  return el('div.card.error', { role: 'alert' }, [
    el('h2', { text: '찾을 수 없습니다' }),
    el('p', { text: '이 상황에 해당 신청이 없습니다.' }),
    el('p', {}, [el('a', { href: '#/applications', text: '신청 목록으로' })]),
  ]);
}

export { clear };
