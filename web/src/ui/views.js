// 화면 — 신청 목록과 상세, 그리고 로딩·빈 목록·오류
//
// 어댑터를 직접 부르지 않는다. main.js 가 받은 결과만 그린다.

import { el, clear, field, shortHex, boolText } from './dom.js';
import {
  stateLabel, TOTAL_STEPS, SYNTHETIC_NOTICE, NOT_CLAIMED_HERE, errorText,
} from './state-labels.js';

// ── 공통 조각 ────────────────────────────────────────────────────────────────

export const syntheticBanner = () => el('div.banner', { role: 'note' }, [
  el('strong', { text: SYNTHETIC_NOTICE.title }),
  ' ',
  el('span', { text: SYNTHETIC_NOTICE.body }),
]);

const stateChip = (state) => {
  const label = stateLabel(state);
  return el('span.chip', {
    'data-state': state,
    title: label.fact,
  }, [
    el('span.chip-step', { text: label.step ? `${label.step}/${TOTAL_STEPS}` : '?' }),
    el('span.chip-code', { text: state }),
  ]);
};

export const loadingView = (what) => el('div.card.center', { 'aria-busy': 'true', role: 'status' }, [
  el('p.spinner', { 'aria-hidden': 'true', text: '…' }),
  el('p', { text: `${what}을 불러오는 중입니다.` }),
]);

export const emptyView = () => el('div.card.center', {}, [
  el('h2', { text: '신청이 없습니다' }),
  el('p.muted', { text: '이 합성 시나리오에는 신청이 하나도 없습니다. 아래에서 다른 시나리오를 골라 보세요.' }),
]);

export function errorView(code, onRetry) {
  const text = errorText(code);
  return el('div.card.error', { role: 'alert' }, [
    el('h2', { text: text.title }),
    el('p', { text: text.body }),
    el('p.muted', { text: `코드 ${code}` }),
    onRetry ? el('button.btn', { type: 'button', onClick: onRetry, text: '다시 시도' }) : null,
  ]);
}

// ── 목록 ────────────────────────────────────────────────────────────────────

export function listView(items) {
  return el('section', {}, [
    el('h2', { id: 'list-heading', text: `내 신청 ${items.length}건` }),
    el('p.muted', {
      text: '목록은 최대 100건이며 페이지네이션이 없습니다. 현재 구현 기준입니다.',
    }),
    el('ul.list', { 'aria-labelledby': 'list-heading' }, items.map((view) => {
      const label = stateLabel(view.state);
      return el('li', {}, [
        el('a.row', { href: `#/applications/${view.applicationId}` }, [
          el('span.row-main', {}, [
            el('span.row-title', { text: label.title }),
            el('code.row-id', { text: shortHex(view.applicationId), title: view.applicationId }),
          ]),
          stateChip(view.state),
        ]),
      ]);
    })),
  ]);
}

// ── 상세 ────────────────────────────────────────────────────────────────────

export function detailView(view) {
  const label = stateLabel(view.state);
  const hasContractScope = view.consentScope === 'CONTRACT';

  return el('section', {}, [
    el('p', {}, [el('a.back', { href: '#/applications', text: '← 신청 목록' })]),
    el('h2', { text: label.title }),
    el('div.state-box', {}, [
      stateChip(view.state),
      el('p.fact', { text: label.fact }),
      el('p.forbidden', {}, [
        el('strong', { text: '이 화면이 말하지 않는 것 — ' }),
        el('span', { text: label.forbidden }),
      ]),
    ]),

    el('h3', { text: '신청' }),
    el('dl.fields', {}, [
      field('신청 ID', view.applicationId),
      field('참가자 지갑', view.learner, '합성 주소입니다.'),
      field('정책 해시', view.policyHash),
      field('상태', view.state),
      field('생성 시각', view.createdAt, '문자열로 전달되는 값입니다.'),
    ]),

    el('h3', { text: '동의' }),
    el('dl.fields', {}, [
      field('동의 범위', view.consentScope,
        hasContractScope ? '최종 계약 동의까지 저장된 범위입니다.' : '신청 조건 동의까지의 범위입니다.'),
      field('계약 동의 필요', boolText(view.contractConsentRequired)),
      field('신청 동의 지문', view.consentDigest),
      field('동의 시각', view.consentedAt),
      hasContractScope ? field('최종 동의 지문', view.finalConsentDigest) : null,
      hasContractScope ? field('배포 설정 해시', view.runtimeConfigHash,
        '최종 동의 전에 사용자에게 보여준 배포 설정의 해시입니다.') : null,
    ]),

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
    ]),

    el('h3', { text: '지급' }),
    el('dl.fields', {}, [
      field('지급 허용', boolText(view.paymentAllowed),
        '현재 구현에서 항상 아니오입니다. 자격 판정과 권한 발급은 후속 작업입니다.'),
      field('데이터 모드', view.dataMode, '합성 데이터입니다.'),
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
    el('p', { text: '이 합성 시나리오에 해당 신청이 없습니다.' }),
    el('p', {}, [el('a', { href: '#/applications', text: '신청 목록으로' })]),
  ]);
}

export { clear };
