// 운영자 화면 — 기획서 §9.2 의 다섯 영역
//
//   1 기수 현황    참여자 수 · 단계별 건수
//   2 검증 현황    도구별 실행 결과 · 실패 사유
//   3 재원 현황    잔액 · 예약 · 가용 · 부족액 · 가스 후원 예산(별도)
//   4 이의·정정    누가 무엇을 지적했고 판정이 어떻게 바뀌었나
//   5 운영 효과    처리 건수 · 사람 개입 · 실패·재시도 · 사람 시간 비교
//
// 여기에 양측 확인을 하나 더 둔다. §8.3 이 운영자 동의를 요구하는데 §9.2 의
// 다섯에는 없다. "최소 다섯"이지 "다섯만"이 아니다.
//
// ── 이 화면이 지금 보여줄 수 없는 것 ──────────────────────────────────
//
// 서버는 **신청 한 건**을 준다. 기수 전체가 아니다. fixture 두 상황의
// applicationId 가 같다 — 학생 두 명이 아니라 같은 신청의 두 시점이다.
//
// 그래서 "참여자 20명 중 12명 확인 중" 같은 집계를 만들 수 없다. 만들면
// 운영자가 없는 숫자를 보고 판단하게 된다. 영역은 다 두되 **안에는 비어 있다고
// 적는다.** 서버가 기수 조회를 주면 그 자리에 들어간다.
//
// ── 인건비 절감을 숫자로 적지 않는다 ──────────────────────────────────
//
// 멘토 전략 4 의 "AI가 150건을 자동 처리하여 인건비 00시간이 절약되었습니다"
// 가 이 화면의 출발점이었다. 그런데 §14.1 이 그걸 금지한다.
//
//   "자동 처리 N건에 임의의 분당 단가를 곱해 '실측 인건비 절감'이라고
//    표시하지 않는다"
//   "humanWorkReductionPercent — 비교 baseline 이 있을 때만 산출"
//
// 그리고 §16 이 "70% 비용 절감은 검증된 상수가 아니다" 라고 못 박았다.
// 우리 피벗 계획서 2-3 의 "440건 · 인건비 ○○시간" 도 같은 이유로 못 쓴다.
// 440 은 조건 22건 × 20명으로 **우리가 계산한 값**이고, §14.1 은 그것을
// '검증 완료 신청 수' 와 구분하라고 한다.
//
// 대신 측정 항목을 다 늘어놓고 **아직 재지 않았다고 적는다.** 발표에서는
// 가짜 숫자보다 이쪽이 낫다 — 심사위원이 묻는 것은 숫자의 크기가 아니라
// 그 숫자를 믿을 수 있느냐다.

import { el, clear } from '../ui/dom.js';
import { seoulText } from '../ui/policy-view.js';
import { CRITERIA, displayState, metCount, reasonText, collectionFrom } from './criteria.js';
import { objectionPanel, revalidationPanel } from './panels.js';
import { aiApprovalSection } from './ai-approval.js';
import { item, pairBlock } from './pairs.js';
import { sessionPanel } from './session-panel.js';
import { statusPill, ticker, icon, iconChip, heroRings, ghostWord, monoLabel } from '../ui/brand.js';
import { COHORT, stageTotal } from '../fixtures/cohort.js';

const PROCEDURE = Object.freeze({
  FUNDING_WAIT: '환급 재원 확보 대기',
  READY_TO_PUBLISH: '확인 절차 공개 준비',
  WAITING_CONFIRMATION: '확인 기간',
  OBJECTION_BLOCKED: '오류 신고 검토 대기',
  REVALIDATION_REQUIRED: '새 근거 재검증 필요',
  SOURCE_REVERIFICATION_REQUIRED: '근거 재확인 필요',
  CURRENT_DECISION_PUBLICATION_REQUIRED: '새 판정 공개 필요',
  FULL_ALLOCATION_REQUIRED: '전액 배정 확인 필요',
  FULL_120_ROUTE_UNAVAILABLE: '남은 상한 내 새 확인 경로 없음',
  EARLY_CONSENT_PREFLIGHT_CANDIDATE: '양측 동의 완료 · 지급 전 검사',
  DEADLINE_PREFLIGHT_CANDIDATE: '확인 기간 종료 · 지급 전 검사',
  INVALIDATED_WAIT_FOR_TERMINATION_CONDITION: '무효화 · 종료 조건 대기',
  UNRESOLVED_TERMINATION_REQUIRED: '미해결 종료 처리 필요',
  CONTRACT_TERMINATED: '지급 절차 종료',
  ACCEPTED_RIGHT_PRESERVED: '지급권리 보존 · 청구 가능',
});

/** 종료 사유. 학생 화면과 같은 말을 쓴다 */
const TERMINATION = Object.freeze({
  UNRESOLVED_OBJECTION: '오류 신고가 시간 안에 해결되지 않음',
  REVALIDATION_EXHAUSTED: '재검증 횟수 소진',
  EVIDENCE_INVALIDATED: '근거 무효화',
});

const STATE_TEXT = Object.freeze({
  MET: '충족', UNMET: '미충족', WAITING: '확인 전',
  NEEDS_CHECK: '확인 필요', IN_PROGRESS: '진행 중', UNAVAILABLE: '지원 안 됨',
});

const ROLE_TEXT = Object.freeze({ PARTICIPANT: '참가자', COURSE_OPERATOR: '운영자', OPERATOR: '운영자' });

function tokens(atoms, decimals, symbol) {
  if (atoms === null || atoms === undefined) return null;
  return `${(Number(atoms) / 10 ** decimals).toLocaleString('ko-KR')} ${symbol}`;
}



// ── 1. 기수 현황 ────────────────────────────────────────────────────────

function cohortSection(view, cohort) {
  const total = stageTotal(cohort);
  const paid = cohort.stages.find((x) => x.key === 'PAID')?.count ?? 0;

  return el('section.bcx-block.panel', {}, [
    iconChip('layers'),
    el('h2', { text: '기수 현황' }),
    el('p.sec-sub', {
      text: `${cohort.name} · 참여자 ${cohort.participants}명 · 지급 완료 ${paid}명`,
    }),

    // 단계별 건수. 막대로 비율을 함께 보인다 — 여기는 진짜 비율이다.
    el('ul.co-stages', {}, cohort.stages.map((st) => el('li', { 'data-key': st.key }, [
      el('span.co-label', { text: st.label }),
      el('span.co-bar', { 'aria-hidden': 'true' }, [
        el('i', { style: `width:${(st.count / Math.max(1, total)) * 100}%` }),
      ]),
      el('span.co-count', { text: `${st.count}명` }),
    ]))),

    total !== cohort.participants
      ? el('p.bcx-warn', {
        text: `단계 합(${total}명)이 참여자 수(${cohort.participants}명)와 다릅니다. 집계를 확인해 주세요.`,
      })
      : null,

  ].filter(Boolean));
}

// ── 2. 검증 현황 ────────────────────────────────────────────────────────

function verifyRow(row) {
  const meta = CRITERIA[row.criterionId];
  const c = collectionFrom(row);
  const { state } = displayState(row);
  const reason = reasonText(row.reasonCode);

  return el('li', {}, [
    el('div.bcx-task-main', {}, [
      el('p.bcx-task-name', { text: meta?.label ?? row.criterionId }),
      el('p.bcx-task-hint', { text: c.label ?? '원천 정보를 받지 못했습니다' }),
      el('p.bcx-task-hint', {
        text: [
          c.collected ? '근거 있음' : '근거 없음',
          reason,
          row.expiresAt ? `유효기한 ${seoulText(row.expiresAt)}` : null,
        ].filter(Boolean).join(' · '),
      }),
    ]),
    el(state === 'MET' ? 'span.bcx-state' : 'span.bcx-state.flag', {
      text: STATE_TEXT[state] ?? state,
    }),
  ]);
}

function verifySection(view, cohort) {
  return el('section.bcx-block.panel', {}, [
    iconChip('check'),
    el('h2', { text: '검증 현황' }),
    el('p.sec-sub', { text: '어떤 도구가 몇 건을 확인했고, 안 된 건은 왜 안 됐는지입니다.' }),

    // 기수 전체가 먼저다. 운영자가 보는 것은 한 사람이 아니라 반이다.
    el('ul.co-tools', {}, cohort.tools.map((t) => el('li', { 'data-bad': t.failed > 0 ? 'yes' : 'no' }, [
      el('div.co-tool-main', {}, [
        el('p.co-tool-name', { text: t.label }),
        t.reason ? el('p.co-tool-reason', { text: t.reason }) : null,
      ].filter(Boolean)),
      el('span.co-tool-num', { text: `${t.ok} / ${t.ran}` }),
    ]))),

  ].filter(Boolean));
}

// ── 3. 재원 현황 ────────────────────────────────────────────────────────
//
// §8.1 이 다섯을 구분하라고 했다. 서버는 그중 둘만 준다.
// 가스 후원 예산은 §7.5 에 따라 환급 재원과 **같은 칸에 넣지 않는다.**

function fundingSection(view, cohort, { onDeposit = null } = {}) {
  const d = view.agreedPayment.decimals;
  const sym = view.agreedPayment.symbol;
  const f = cohort.funding;
  const short = f.shortfallAtoms && Number(f.shortfallAtoms) > 0;

  return el('section.bcx-block.panel', {}, [
    iconChip('wallet'),
    el('h2', { text: '재원 현황' }),
    el('p.sec-sub', { text: `${cohort.name} 금고 기준입니다.` }),

    ...pairBlock([
      item('입금 확인 총액', tokens(f.depositedAtoms, d, sym)),
      item('현재 잔액', tokens(f.balanceAtoms, d, sym)),
      item('이미 예약한 금액', tokens(f.reservedAtoms, d, sym), '확인 기간에 들어간 신청에 묶여 있습니다'),
      item('가용 금액', tokens(f.availableAtoms, d, sym), '새 신청에 배정할 수 있는 금액입니다'),
      // 0 을 '아직 못 받은 값' 으로 내리지 않는다. 모자라지 않는다는 것도
      // 아는 값이다 — 비워 두면 운영자가 "얼마 필요한지 모른다" 로 읽는다.
      item('추가로 필요한 금액', tokens(f.shortfallAtoms, d, sym),
        short ? '재원 대기 중인 신청을 덮으려면 이만큼 더 필요합니다' : '모자라는 신청이 없습니다'),
      item('잠재 최대 환급액', tokens(f.maxExposureAtoms, d, sym),
        `참여자 ${cohort.participants}명이 모두 충족할 경우입니다. 현재 의무와 다른 값입니다`),
      item('충전 거래', f.pendingTopUp),
    ]),

    short
      ? el('p.bcx-warn', {
        text: `${tokens(f.shortfallAtoms, d, sym)} 이 부족합니다. 충전하고 체인에서 입금이 `
          + '확인되면 자격을 다시 확인한 뒤 배정합니다.',
      })
      : null,

    // 충전은 운영자가 실제로 하는 일이라 **제품 버튼**이다. 조건을 켜고 끄는
    // 시연 조작판과 다른 자리에 있어야 한다 — 학원은 금고에 돈을 넣고, 조건은
    // 아무도 손으로 못 바꾼다.
    onDeposit
      ? el('div.co-topup', {}, [
        monoLabel('금고 충전'),
        el('div.co-topup-row', {}, [
          el('button.cc-btn', {
            type: 'button', onClick: () => onDeposit(100),
          }, [el('span', { text: '+100 TEST' })]),
          el('button.cc-btn', {
            type: 'button', onClick: () => onDeposit(500),
          }, [el('span', { text: '+500 TEST' })]),
        ]),
        // **넣은 돈은 못 뺀다.** 백엔드 문서가 그렇게 정했고, 그 사실을
        // 화면이 공개하라고 요구한다.
        //
        //   HACKATHON_TEST_OPERATIONS.ko.md: "token/기수 출금 기능은 없다"
        //   FUNDING_RELAYER.ko.md: "출금/회수 엔드포인트 없이 잠금·거부만
        //     시연하고, 이로 인한 자금 잠김을 공개해야 한다"
        //
        // 한때 여기 '-100 TEST' 단추가 있었다. 월드에서만 되는 일이라
        // 제품 단추 자리에 두면 "빼기도 되네" 로 읽힌다. 뺐다.
        el('p.bcx-warn', {
          text: '충전한 재원은 다시 빼낼 수 없습니다. 이 금고에는 출금 기능이 없고, '
            + '쓰이지 않은 금액도 기수 안에 남습니다. 넣을 금액을 먼저 정해 주세요.',
        }),
        el('p.bcx-note', {
          text: '충전은 운영자가 직접 보내는 온체인 거래라 수수료가 듭니다. '
            + '입금이 확인되면 대기 중인 신청부터 순서대로 배정합니다.',
        }),
      ])
      // 실서버에는 충전 단추가 없다.
      //
      // 전에는 여기에 "운영자 지갑에서 기수 금고로 직접 보내시면 입금이
      // 확인된 뒤 금액이 올라갑니다" 라고 적었다. 2026-10-29 백엔드 지적으로
      // 지웠다 — **틀린 안내였다.**
      //
      //   V2 계약은 지정 depositor 의 approve → fund(operationId, amount) 로
      //   내부 balance 를 갱신한다. 금고 주소로 그냥 ERC-20 transfer 를 하면
      //   surplus 로 잡히고 **예치 회계에 반영되지 않는다.**
      //   게다가 CLEAR 운영자 로그인 역할과 계약 depositor 권한은 별개다 —
      //   운영자 MetaMask 가 depositor 라고 가정할 수 없다.
      //
      // 그러니 "주소가 생기면 붙인다" 도 틀렸다. 주소만으로는 안 되고
      // chain/instance · vault · token · decimals · depositor 권한 · 호출
      // 방식 · 거래 확인까지 계약으로 정해진 뒤에 붙인다. 그때까지는
      // 없는 기능을 설명하지 않고 **없다고만** 적는다.
      : el('div.co-topup', {}, [
        monoLabel('금고 충전'),
        el('p.bcx-note', {
          text: '현재 화면에서는 재원 충전을 지원하지 않습니다.',
        }),
        // 잠금 공개는 그대로 둔다. FUNDING_RELAYER.ko.md 가 요구한다.
        el('p.bcx-warn', {
          text: '이 금고에는 출금 기능이 없어, 한 번 넣은 재원은 다시 빼낼 수 없습니다.',
        }),
      ]),

    // §7.5 — 가스 후원 예산은 환급 재원과 다른 돈이다. 같은 표에 넣으면
    // 환급액에서 가스비를 떼는 것처럼 읽힌다.
    monoLabel('가스 후원 예산 (환급 재원과 별도)'),
    ...pairBlock([item('잔액', f.gasBudgetAtoms ? tokens(f.gasBudgetAtoms, d, sym) : null)]),
  ].filter(Boolean));
}

// ── 4. 이의·정정 ────────────────────────────────────────────────────────

/**
 * 신고가 지금 어디 있나.
 *
 * 셋을 한 글자로 뭉치면 안 된다. 상한을 넘겨 끝난 건을 '재검증 중' 이라고
 * 적으면, 운영자는 아직 돌아가는 중인 줄 알고 결과를 기다린다.
 */
const OBJECTION_STATE = Object.freeze({
  // 사용자가 한 일(접수)과 서버가 하는 일(재검증)을 나눈다.
  // 둘을 뭉치면 "학생이 재검증을 돌렸다" 로 읽힌다.
  RECEIVED: '접수됨 · 처리 대기',
  REVALIDATING: '재검증 진행 중',
  RESOLVED: '정정 완료',
  DISMISSED: '기각',
  UNRESOLVED: '미해결 종료',
});

function objectionSection(view, cohort, { api, blocked, onChange, viewOf }) {
  const p = view.procedure;
  const list = cohort.objections ?? [];
  const open = list.filter((o) => o.state === 'REVALIDATING' || o.state === 'RECEIVED').length;

  return el('section.bcx-block.panel', {}, [
    iconChip('history'),
    el('h2', { text: '이의·정정' }),
    el('p.sec-sub', {
      text: open > 0
        ? `처리 중 ${open}건. 결과가 나올 때까지 해당 신청의 지급이 멈춰 있습니다.`
        : '처리 중인 오류 신고가 없습니다.',
    }),

    list.length > 0
      ? el('ul.co-objections', {}, list.map((o) => el('li', {
        'data-open': o.state === 'REVALIDATING' || o.state === 'RECEIVED' ? 'yes' : 'no',
      }, [
        el('div.co-obj-main', {}, [
          el('p.co-obj-head', { text: `${ROLE_TEXT[o.byRole] ?? o.byRole} · ${o.criterion}` }),
          el('p.co-obj-note', { text: o.note }),
          o.outcome ? el('p.co-obj-out', { text: o.outcome }) : null,
        ].filter(Boolean)),
        el('span.co-obj-state', { text: OBJECTION_STATE[o.state] ?? o.state }),
      ])))
      : null,

    // §9.2.4 — 반려 버튼을 두지 않는다. 빠뜨린 게 아니라 두지 않기로 한 것이다.
    el('p.bcx-note', {
      text: '이 화면에는 반려하거나 지급권리를 거둬들이는 버튼이 없습니다. '
        + '고정된 조건을 개별 학생에게 불리하게 바꾸지 않기 위해서입니다. '
        + '결과가 틀렸다면 근거를 들어 오류를 제기하는 쪽으로만 바꿀 수 있습니다.',
    }),
    // 신고 칸은 여기 두지 않는다. 이 구역은 기수 전체를 보는 자리라
    // 누구에 대한 신고인지 화면에 안 나온다. 신청 목록에서 그 사람을
    // 펴고 거기서 신고한다.
    viewOf ? el('p.bcx-note', {
      text: '오류를 신고하시려면 아래 신청 목록에서 그 학생을 펴 주세요. '
        + '다툴 수 있는 판정은 AI 가 해석한 회고뿐입니다.',
    }) : null,
    revalidationPanel({ view, api, blocked, onDone: onChange }),
  ].filter(Boolean));
}

// ── 5. 운영 효과 ────────────────────────────────────────────────────────

function effectSection(cohort) {
  const m = cohort.metrics ?? {};
  const n = (v, unit) => (v === null || v === undefined ? null : `${v}${unit}`);

  return el('section.bcx-block.panel', {}, [
    iconChip('key'),
    el('h2', { text: '운영 효과' }),
    el('p.sec-sub', { text: '센 것만 적습니다. 재지 않은 값은 비워 둡니다.' }),

    ...pairBlock([
      item('검증 완료 신청', n(m.verifiedApplications, '건'), '조건 도구 호출 수와 다른 값입니다'),
      item('무인 처리 신청', n(m.unattendedApplications, '건'),
        '직원 개입이 없었던 신청입니다. 학생의 로그인·확인은 개입이 아닙니다'),
      item('사람 개입', n(m.humanInterventions, '회')),
      item('실패·재시도', n(m.failuresRetried, '회')),
      item('사람 작업 시간', m.humanWorkMs),
      item('사람 시간 절감', m.humanWorkReductionPercent),
    ]),

    // §14.1 의 금지를 화면에 적는다. 안 적으면 "왜 숫자가 없냐" 로 읽힌다.
    el('p.bcx-note', {
      text: '자동 처리 건수에 분당 단가를 곱해 "인건비 ○○시간 절약"이라고 적지 않습니다 — '
        + '그건 측정이 아니라 계산입니다. 같은 사례를 사람이 처리한 시간과 나란히 재야 '
        + '절감을 말할 수 있고, 아직 재지 않았습니다.',
    }),
  ].filter(Boolean));
}

// ── 신청 목록 ───────────────────────────────────────────────────────────
//
// 집계만 보여주면 운영자가 "그래서 누가 막혀 있나" 를 못 본다. 단계를 눌러
// 걸러 보고, 사람마다 조건 몇 개를 채웠고 왜 멈췄는지 한 줄로 읽게 한다.
//
// 걸러내기는 화면 안에서만 돈다 — 서버를 다시 부르지 않는다.

const STAGE_LABEL = Object.freeze({
  IN_PROGRESS: '조건 진행 중',
  CONFIRMING: '확인 기간',
  FUNDING_WAIT: '재원 대기',
  PAID: '지급 완료',
  TERMINATED: '미해결 종료',
});

/**
 * 펼친 한 사람.
 *
 * 집계만 보고는 "그래서 이 사람이 왜 막혔나" 를 알 수 없다. 조건 네 개가
 * 각각 어떤지, 돈이 얼마나 묶였는지, 누가 확인했는지를 편다.
 */
function applicantDetail(a, { d, sym, onOpen, viewOf, api, blocked, onChange }) {
  const left = a.confirmAt && a.confirmAt > 0 ? a.confirmAt : null;

  return el('div.ap-detail', {}, [
    el('ul.ap-crit', {}, (a.criteria ?? []).map((c) => el('li', {
      'data-met': c.met ? 'yes' : 'no',
    }, [
      el('span.ap-crit-mark', { 'aria-hidden': 'true' }, c.met ? [icon('check')] : []),
      el('span.ap-crit-name', { text: c.label }),
      el('span.ap-crit-state', { text: c.met ? '충족' : '미충족' }),
    ]))),

    // **해당 없는 칸은 아예 빼고, 빈 값으로 두지 않는다.**
    //
    // 조건을 아직 못 채운 사람에게 '확인 기간 종료 — 아직 못 받은 값' 이
    // 뜨면, 서버가 값을 안 준 것처럼 읽힌다. 확인 절차가 시작도 안 한
    // 것뿐이다. 그 단계에 있는 사람에게만 그 줄을 보여 준다.
    ...pairBlock([
      item('단계', STAGE_LABEL[a.stage] ?? a.stage),
      item('지급액', a.amountAtoms ? tokens(a.amountAtoms, d, sym) : null),
      a.acceptedAt ? item('조건 충족 시각', seoulText(a.acceptedAt)) : null,
      left ? item('확인 기간 종료', seoulText(left)) : null,
      a.confirm && (a.stage === 'CONFIRMING' || a.stage === 'PAID')
        ? item('참가자 확인', a.confirm.participant ? '완료' : '대기') : null,
      a.confirm && (a.stage === 'CONFIRMING' || a.stage === 'PAID')
        ? item('운영자 확인', a.confirm.operator ? '완료' : '대기') : null,
      a.queue?.position ? item('대기 순서', `${a.queue.position}번`,
        '클릭 순서가 아니라 판정이 확정된 순서입니다') : null,
      a.paidAt ? item('지급 시각', seoulText(a.paidAt)) : null,
    ].filter(Boolean)),

    // ── 오류 신고는 여기서, 회고에 대해서만 ──────────────────────────
    //
    // 전에는 아래 '이의·정정' 구역에 신고 칸이 하나 있었다. 그런데 그 구역은
    // 기수 전체를 보는 자리라 **누구에 대한 신고인지 화면에 안 나왔다** —
    // 실제로는 그때 보고 있던 학생에게 걸렸다. 사람을 펴 놓고 그 안에서
    // 신고해야 누구 건지 분명하다.
    //
    // 조건은 회고뿐이다. 나머지 셋은 Moodle·Reclaim 이 읽은 기록이라
    // 다툴 판단이 없다.
    //
    // 지급이 끝났거나 절차가 종료된 건에는 단추를 띄우지 않는다. 눌러도
    // 서버가 거절한다 — 누를 수 없는 단추를 보여 주면 할 수 있는 일인 줄 안다.
    viewOf
      ? el('div.ap-object', {}, [
        monoLabel('회고 판정에 오류 신고'),
        a.stage === 'PAID' || a.stage === 'TERMINATED'
          ? el('p.bcx-note', {
            text: a.stage === 'PAID'
              ? '지급이 끝나 더 다툴 것이 없습니다.'
              : '확인 절차가 종료돼 더 다툴 것이 없습니다.',
          })
          : objectionPanel({ view: viewOf(a.id), api, blocked, onDone: onChange }),
      ])
      : null,

    onOpen
      ? el('button.cc-btn.cc-btn--ghost', {
        type: 'button',
        onClick: () => onOpen(a.id),
      }, [el('span', { text: `${a.name} 화면으로 보기` }), icon('arrowUpRight')])
      : null,
  ].filter(Boolean));
}

function applicantRow(a, { open, onToggle, ...rest }) {
  return el('li.ap', { 'data-stage': a.stage, 'data-open': open ? 'yes' : 'no' }, [
    // 줄 전체가 버튼이다. 이름만 누르게 하면 어디를 눌러야 하는지 알 수 없다.
    el('button.ap-main', {
      type: 'button',
      'aria-expanded': open ? 'true' : 'false',
      onClick: () => onToggle(a.id),
    }, [
      el('span.ap-name', { text: a.name }),
      el('span.ap-met', {}, [
        el('span.ap-dots', { 'aria-hidden': 'true' }, [0, 1, 2, 3].map((i) =>
          el(i < a.met ? 'i.on' : 'i', {}))),
        el('span.ap-num', { text: `${a.met}/4` }),
      ]),
      el('span.ap-stage', { text: STAGE_LABEL[a.stage] ?? a.stage }),
      // 막힌 이유가 없으면 칸을 만들지 않는다. 좁은 화면에서 이 칸이 아래로
      // 내려가는데, 빈 칸이 내려가면 줄마다 빈 줄이 하나씩 생긴다.
      a.note ? el('span.ap-note', { text: a.note }) : null,
      el('span.ap-caret', { 'aria-hidden': 'true' }),
    ].filter(Boolean)),

    open ? applicantDetail(a, rest) : null,
  ].filter(Boolean));
}

// 고른 단계는 화면 밖에 둔다. 라이브 월드에서는 시계가 흐를 때마다 화면을
// 다시 그리는데, 이 값이 컴포넌트 안에 있으면 1초마다 '전체' 로 돌아간다.
let stageFilter = null;
// 펼쳐 둔 사람도 밖에 둔다. 시계가 흐를 때마다 다시 그리는데 안에 있으면
// 1초마다 접힌다.
let openApplicant = null;

function applicantsSection(cohort, view, { onOpen, viewOf, api, blocked, onChange }) {
  const list = cohort.applicants ?? [];
  if (list.length === 0) return null;

  const d = view.agreedPayment.decimals;
  const sym = view.agreedPayment.symbol;
  const box = el('section.bcx-block.panel', {});

  const render = () => {
    clear(box);
    const filter = stageFilter;
    const shown = filter ? list.filter((a) => a.stage === filter) : list;
    const toggle = (id) => { openApplicant = openApplicant === id ? null : id; render(); };

    box.append(...[
      iconChip('check'),
      el('h2', { text: '신청 목록' }),
      el('p.sec-sub', {
        text: filter
          ? `${STAGE_LABEL[filter]} ${shown.length}건. 이름을 누르면 펴 볼 수 있습니다.`
          : `${list.length}건. 단계를 눌러 거르고, 이름을 누르면 펴 볼 수 있습니다.`,
      }),

      el('div.ap-filters', {}, [
        el(filter === null ? 'button.ap-chip.on' : 'button.ap-chip', {
          type: 'button',
          onClick: () => { stageFilter = null; render(); },
        }, [el('span', { text: `전체 ${list.length}` })]),
        ...cohort.stages.map((st) => el(filter === st.key ? 'button.ap-chip.on' : 'button.ap-chip', {
          type: 'button',
          onClick: () => { stageFilter = stageFilter === st.key ? null : st.key; render(); },
        }, [el('span', { text: `${st.label} ${st.count}` })])),
      ]),

      el('ul.ap-list', {}, shown.map((a) => applicantRow(a, {
        open: openApplicant === a.id, onToggle: toggle,
        d, sym, onOpen, viewOf, api, blocked, onChange,
      }))),
    ]);
  };

  render();
  return box;
}

// ── 확인 기간 (운영자 쪽) ───────────────────────────────────────────────

/**
 * 확인 기간 — 운영자를 기다리는 신청 목록.
 *
 * 운영자 화면은 반 전체를 본다. 그런데 운영자가 실제로 누를 일은 여기 있다.
 *
 * **확인은 거부권이 아니다.** 안 눌러도 기간이 끝나면 자격·재원·오류 신고를
 * 다시 검사한 뒤 지급된다(§8.3 기한 경로). 막으려면 오류를 제기해야 한다.
 * 그래서 글자를 '동의' 가 아니라 '확인' 으로 쓰고, 자동 진행한다고 적는다.
 */
function consentSection(view, cohort, { api, blocked, onConfirm, live = false }) {
  const queue = cohort.pending ?? [];
  const d = view.agreedPayment.decimals;
  const sym = view.agreedPayment.symbol;
  const now = cohort.observedAt;

  const left = (at) => {
    const s = at - now;
    if (s <= 0) return '시간 경과';
    return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
  };

  return el('section.bcx-block.panel', {}, [
    iconChip('lock'),
    el('h2', { text: '확인 기간' }),
    el('p.sec-sub', {
      text: queue.length > 0
        ? `${queue.length}건이 확인을 기다립니다. 확인하면 바로 지급되고, `
          + '확인하지 않아도 기간이 끝나면 자동으로 진행됩니다.'
        : '확인을 기다리는 신청이 없습니다.',
    }),

    queue.length > 0
      ? el('ul.co-queue', {}, queue.map((q) => el('li', {}, [
        el('div.co-q-main', {}, [
          el('p.co-q-who', { text: `${q.who} · ${tokens(q.amountAtoms, d, sym)}` }),
          el('p.co-q-meta', {
            text: `${q.applicationId} · 참가자 확인 `
              + `${q.participantConfirmed ? '완료' : '대기'} · ${left(q.confirmAt)} 뒤 자동 진행`,
          }),
        ]),
        el('button.cc-btn.co-q-btn', {
          type: 'button',
          disabled: (live ? q.operatorConfirmed : (blocked || !api || q.operatorConfirmed))
            ? 'disabled' : null,
          onClick: () => onConfirm(q.applicationId),
        }, [el('span', { text: q.operatorConfirmed ? '확인 완료' : '확인' })]),
      ])))
      : null,

    blocked && !live ? el('p.bcx-note', { text: blocked }) : null,
  ].filter(Boolean));
}


// ── 전체 ────────────────────────────────────────────────────────────────

export function operatorSection({
  view, phase = null, procedureReady = true, api = null, onChange = () => {},
  conn = null, onSignIn = () => {}, onSignOut = () => {}, onConfirm = () => {},
  // 기수 집계. 서버에 조회가 생기면 그 값을 넘긴다.
  cohort = COHORT,
  // 라이브 월드일 때만 온다. 없으면 충전 버튼을 그리지 않는다.
  onDeposit = null,
  // 명단에서 한 사람을 골라 그 학생 화면으로 넘어간다
  onOpenApplicant = null,
  // 명단의 한 사람을 서버 응답 모양으로 돌려준다. 그 사람에게 오류를
  // 신고하려면 그 신청의 판정이 필요하다. 라이브 월드일 때만 온다.
  viewOf = null,
  // 이번 입력의 AI 승인. { data, remainingMs, send } — 서버가 주면 온다.
  aiApproval = null,
}) {
  // 여기는 **기수 대시보드**다. 한 신청의 사정으로 화면 전체를 막지 않는다.
  // 신청 하나에 오류 신고가 걸렸다고 운영자가 반 전체를 못 보면 안 된다 —
  // 그 신청의 사정은 이의·정정 구역이 말한다.
  const blocked = phase && phase !== 'ACTIVE_LOCAL_TEST'
    ? '서버가 아직 켜지지 않았습니다.'
    : !procedureReady
      ? '확인 절차가 아직 준비되지 않았습니다.'
      : !api
        ? '서버에 연결되지 않았습니다.'
        : null;

  const dec = view.agreedPayment.decimals;
  const sym = view.agreedPayment.symbol;
  const paidCount = cohort.stages.find((x) => x.key === 'PAID')?.count ?? 0;
  const waitCount = cohort.stages.find((x) => x.key === 'FUNDING_WAIT')?.count ?? 0;
  const shortfallAtoms = Number(cohort.funding.shortfallAtoms ?? 0) > 0
    ? cohort.funding.shortfallAtoms
    : null;

  const section = el('section.bcx', {});
  const render = () => {
    clear(section);
    section.append(...[
      // 운영자 히어로는 **기수 기준**이다. 운영자가 보는 것은 한 사람이 아니라 반이다.
      el('section.hero.grid-bg', {}, [
        heroRings(),
        ghostWord('CLEAR'),
        statusPill(
          shortfallAtoms ? '재원 충전 필요' : '정상 운영',
          shortfallAtoms ? 'wait' : 'ok',
        ),
        el('h1.hero-title', { text: cohort.name }),
        el('p.hero-sub', {
          text: `참여자 ${cohort.participants}명 중 ${paidCount}명 지급 완료. `
            + (shortfallAtoms
              ? `재원이 ${tokens(shortfallAtoms, dec, sym)} 부족해 ${waitCount}명이 대기 중입니다.`
              : '대기 중인 신청이 없습니다.'),
        }),
        ticker([
          { label: '참여자', value: `${cohort.participants}명` },
          { label: '지급 완료', value: `${paidCount}명` },
          { label: '금고 잔액', value: tokens(cohort.funding.balanceAtoms, dec, sym) },
          {
            label: '추가 필요',
            value: shortfallAtoms ? tokens(shortfallAtoms, dec, sym) : '없음',
            small: !shortfallAtoms,
          },
        ]),
      ]),
      conn && (conn.state === 'LIVE' || conn.error) ? sessionPanel({ conn, onSignIn, onSignOut }) : null,
      // fixture 를 그리는 중에는 '지금은 진행할 수 없음' 을 띄우지 않는다.
      // 백엔드가 아직 없다는 말은 위의 '백엔드 합성 예시' 배너가 이미 하고 있고,
      // 두 번 말하면 화면이 고장난 것처럼 보인다.
      // 로그인하면 되는 상태도 막힌 것이 아니라 할 일이 있는 것이다.
      blocked && (conn?.state === 'LIVE')
        ? el('p.bcx-blocked', {}, [
          el('span.bcx-blocked-tag', { text: '지금은 진행할 수 없음' }),
          el('span', { text: blocked }),
        ])
        : null,

      cohortSection(view, cohort),
      // 회고를 AI 가 읽기 전에 운영자가 이번 호출을 승인한다.
      // 검증 현황 **앞**에 둔다 — 승인이 있어야 그 검증이 돌기 때문이다.
      aiApproval
        ? aiApprovalSection({
          approval: aiApproval.data,
          remainingMs: aiApproval.remainingMs,
          applicationId: view.applicationId,
          wallet: conn?.address ?? null,
          send: aiApproval.send,
          onDone: onChange,
        })
        : null,
      verifySection(view, cohort),
      fundingSection(view, cohort, { onDeposit }),
      applicantsSection(cohort, view, {
        onOpen: onOpenApplicant, viewOf, api, blocked, onChange,
      }),
      consentSection(view, cohort, { api, blocked, onConfirm, live: Boolean(onDeposit) }),
      objectionSection(view, cohort, { api, blocked, onChange, viewOf }),
      effectSection(cohort),

      el('p.bcx-limits', {
        text: '여기 보이는 것은 이 신청 한 건입니다. 기수 전체 집계와 운영 효과 측정은 '
          + '서버 조회가 생긴 뒤에 들어갑니다.',
      }),
    ].filter(Boolean));
  };
  render();
  return section;
}
