// 화면 — 신청 목록과 상세, 그리고 로딩·빈 목록·오류
//
// 어댑터를 직접 부르지 않는다. main.js 가 받은 결과만 그린다.

import { el, clear, field, shortHex, boolText } from './dom.js';
import { policySection } from './policy-view.js';
import {
  stateLabel, STEP_ORDER, TOTAL_STEPS,
  SYNTHETIC_NOTICE, NOT_CLAIMED_HERE, errorText,
} from './state-labels.js';

// ── 공통 조각 ────────────────────────────────────────────────────────────────

export const syntheticBanner = () => el('div.banner', { role: 'note' }, [
  el('span.banner-tag', { text: SYNTHETIC_NOTICE.title }),
  el('span', { text: SYNTHETIC_NOTICE.body }),
]);

const actorChip = (actor) => el('span.actor', { 'data-actor': actor.key, text: actor.label });

const stepBadge = (label) => el('span.stepbadge', {}, [
  el('b', { text: String(label.step) }),
  el('span', { text: `/${TOTAL_STEPS}` }),
]);

/** 다섯 단계 진행 막대. 지금 어디인지와 남은 단계를 한눈에 보인다 */
function stepper(currentState) {
  const current = stateLabel(currentState).step;
  return el('ol.stepper', { 'aria-label': `신청 절차 ${TOTAL_STEPS}단계 중 ${current}단계` },
    STEP_ORDER.map((state) => {
      const label = stateLabel(state);
      const status = label.step < current ? 'done' : label.step === current ? 'now' : 'todo';
      return el('li.step', { 'data-status': status, 'aria-current': status === 'now' ? 'step' : null }, [
        el('span.step-dot', { 'aria-hidden': 'true', text: status === 'done' ? '✓' : String(label.step) }),
        el('span.step-name', { text: label.short }),
      ]);
    }));
}

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

export function listView(items) {
  return el('section', {}, [
    el('h2', { id: 'list-heading', text: '내 신청' }),
    el('p.muted', { text: '한 반에 신청은 하나입니다. 아래에서 현재 단계를 확인하세요.' }),
    el('ul.list', { 'aria-labelledby': 'list-heading' }, items.map((view) => {
      const label = stateLabel(view.state);
      return el('li', {}, [
        el('a.row', { href: `#/applications/${view.applicationId}` }, [
          el('div.row-head', {}, [
            stepBadge(label),
            el('span.row-title', { text: label.title }),
            actorChip(label.actor),
          ]),
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

export function detailView(view, policy) {
  const label = stateLabel(view.state);
  const hasContractScope = view.consentScope === 'CONTRACT';

  return el('section', {}, [
    el('p', {}, [el('a.back', { href: '#/applications', text: '← 신청 목록' })]),

    el('div.hero', {}, [
      el('div.hero-top', {}, [stepBadge(label), actorChip(label.actor)]),
      el('h2', { text: label.title }),
      el('p.hero-fact', { text: label.fact }),
      el('p.hero-next', {}, [
        el('span.hero-next-tag', { text: '다음' }),
        el('span', { text: label.next }),
      ]),
      el('p.forbidden', {}, [
        el('strong', { text: '이 화면이 말하지 않는 것 — ' }),
        el('span', { text: label.forbidden }),
      ]),
    ]),

    stepper(view.state),

    policy ? policySection(policy) : el('p.muted', { text: '조건을 불러오지 못했습니다.' }),

    el('h3', { text: '예치' }),
    el('dl.fields', {}, [
      field('예치 확인', boolText(view.funded),
        view.funded
          ? '기록된 블록에서 확인된 값입니다. 현재 잔액이나 사용 가능한 권리가 아닙니다.'
          : '아직 확인된 예치가 없습니다.'),
      ...(hasContractScope && view.fundingEvidence
        ? [
          field('거래 해시', view.fundingEvidence.transactionHash),
          field('블록 번호', view.fundingEvidence.blockNumber),
          field('블록 해시', view.fundingEvidence.blockHash),
        ]
        : hasContractScope ? [field('예치 증거', null, '예치가 확인되면 거래·블록 정보가 들어갑니다.')] : []),
      field('지급 허용', boolText(view.paymentAllowed),
        '현재 구현에서 항상 아니오입니다. 자격 판정과 권한 발급은 후속 작업입니다.'),
    ]),

    el('details.tech', {}, [
      el('summary', { text: '기술 값 보기' }),
      el('dl.fields', {}, [
        field('신청 ID', view.applicationId),
        field('참가자 지갑', view.learner, '합성 주소입니다.'),
        field('정책 해시', view.policyHash),
        field('상태', view.state),
        field('생성 시각', view.createdAt, '문자열로 전달되는 값입니다.'),
        field('동의 범위', view.consentScope),
        field('계약 동의 필요', boolText(view.contractConsentRequired)),
        field('신청 동의 지문', view.consentDigest),
        field('동의 시각', view.consentedAt),
        hasContractScope ? field('최종 동의 지문', view.finalConsentDigest) : null,
        hasContractScope ? field('배포 설정 해시', view.runtimeConfigHash) : null,
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
