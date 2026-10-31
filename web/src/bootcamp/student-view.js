// 학생 화면 — 기획서 §9.1 의 여덟 화면
//
// 2026-10-23 통합기획서 검토안 §9.1 이 학생 화면을 여덟으로 나눠놨다.
// 어제까지의 화면은 그중 '내 진행 현황' 하나에 양측 확인·재원·지급을
// 밀어넣은 것이었다. 여기서 여덟을 다 만든다.
//
//   1 가입·반 연결      로그인 · 참여 반 · 수령 계정
//   2 내 진행 현황      조건별 상태 · 원천 · 갱신 시각 (3 증거 연결을 여기 합쳤다)
//   4 판정 상세         정책 · 사용 도구 · 원문 위치 · 부족 사유
//   5 확인 기간         금액 · 수령 계정 · 양쪽 확인 · 남은 시간
//   6 재원·지급         자격과 재원을 분리 · 거래 상태 · 비용 부담
//   7 판단 이력         이전 판정 · 정정 이유 · 재검증 횟수
//   8 복구·직접 청구    수락된 권리 · 대체 실행
//
// 여덟을 별도 라우트로 쪼개지 않고 한 화면에 구역으로 둔다. §9.1 이
// "주된 행동은 단순하게 유지"하라고 했고, 모바일에서 탭 여덟 개를 넘나들게
// 하면 지금 뭘 해야 하는지가 더 안 보인다. 대신 참고용 셋(4·7·8)은 접어 둔다.
//
// 배치는 web/mockup 시안을 그대로 쓴다 — 완료에 표식 없음, 카드 대신 구분선,
// 한 줄은 이름 + 설명 + 오른쪽 상태.
//
// 문체는 §9.1 권장 문구를 따라 해요체다. 어학원 화면(합니다체)과 다르지만
// 그쪽은 보존 대상이라 섞어 두고, 부트캠프 안에서는 해요체로 통일한다.
//
// 지키는 것
//
//   없는 필드를 0 이나 '정상'으로 채우지 않는다 — 미제공이라고 적는다
//   시험용 원천(SYNTHETIC_TEST_SOURCE)을 실제 학원 기록으로 보여주지 않는다
//   남은 시간은 observedAt 기준이다. fixture 시계는 2020 이라 Date.now() 를 쓰면 거짓이 된다
//   '다시 해도 안 돼요'를 화면이 추측하지 않는다 — 보완 가능성은 서버가 준다
//   비용을 모르는 직접 청구 버튼을 띄우지 않는다 (§7.5)

import { el, clear } from '../ui/dom.js';
import { seoulText } from '../ui/policy-view.js';
import {
  CRITERIA, displayState, metCount, reasonText, collectionFrom, recoverabilityFrom,
} from './criteria.js';
import {
  sourceSignaturePanel, consentPanel, paymentPanel, objectionPanel, revalidationPanel,
} from './panels.js';
import { sessionPanel } from './session-panel.js';
import {
  statusPill, pillButton, ticker, iconChip, icon, ghostWord, monoLabel,
} from '../ui/brand.js';
import { item, pairBlock } from './pairs.js';

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

const FUNDING = Object.freeze({
  WAITING_FUNDS: '환급 재원 확보 대기',
  FULLY_ALLOCATED: '내 지급액 전액 확보',
  PARTIALLY_ALLOCATED: '일부만 확보',
  RELEASED: '확보 해제됨',
});

/**
 * 절차가 끝난 이유.
 *
 * 멘토 §3 — "미해결로 종료" 와 "조건 미충족" 을 구분해 보여 달라.
 * 조건을 못 채운 것과, 조건은 채웠는데 확인이 안 끝난 것은 완전히 다른 일이다.
 */
/** 청구 상태. 영어 코드를 그대로 내보내지 않는다 */
const CLAIM_TEXT = Object.freeze({
  NOT_OBSERVED: '아직 관측되지 않음',
  READBACK_UNAVAILABLE: '체인에서 다시 읽지 못함',
  INCLUDED: '블록에 들어감 (확정 전)',
  FINALIZED: '최종 확정됨',
});

const TERMINATION = Object.freeze({
  UNRESOLVED_OBJECTION: '오류 신고가 정해진 시간 안에 해결되지 않았습니다',
  REVALIDATION_EXHAUSTED: '재검증 횟수를 다 썼는데 결론이 나지 않았습니다',
  EVIDENCE_INVALIDATED: '근거가 무효가 되었습니다',
});

const STATE_TEXT = Object.freeze({
  MET: '충족', UNMET: '미충족', WAITING: '확인 전',
  NEEDS_CHECK: '확인 필요', IN_PROGRESS: '진행 중', UNAVAILABLE: '지원 안 됨',
});

const ROLE_TEXT = Object.freeze({ PARTICIPANT: '참가자', COURSE_OPERATOR: '운영자', OPERATOR: '운영자' });

/**
 * 지급이 끝났나.
 *
 * 셋이 다 맞아야 한다 — 권리가 수락됐고, 청구가 **최종 확정**됐고, 받은 양이 있다.
 * INCLUDED 는 블록에 들어갔을 뿐 확정이 아니라 여기 넣지 않는다(§8.4).
 */
function isPaid(view) {
  const pay = view.payment ?? {};
  return Boolean(pay.acceptedRight) && pay.claimState === 'FINALIZED'
    && pay.receivedAtoms !== null && pay.receivedAtoms !== undefined;
}

function tokens(atoms, decimals, symbol) {
  if (atoms === null || atoms === undefined) return null;
  return `${(Number(atoms) / 10 ** decimals).toLocaleString('ko-KR')} ${symbol}`;
}



/**
 * 남은 시간. **서버가 본 시각(observedAt) 기준이다.**
 * 브라우저 시계로 재면 fixture(2020년)에서 "27만 시간 지났어요" 가 나온다.
 */
function remaining(view, at, { bare = false } = {}) {
  if (!at || !view.observedAt) return null;
  const left = at - view.observedAt;
  if (left <= 0) return bare ? '시간 경과' : '시간 경과';
  const text = left >= 60 ? `${Math.floor(left / 60)}분 ${left % 60}초` : `${left}초`;
  // bare 면 '남음' 을 안 붙인다. '2분 0초 남음 뒤 자동 진행' 처럼 겹치는 걸 막는다.
  return bare ? text : `${text} 남음`;
}
/**
 * AI 가 글을 읽고 해석하는 조건.
 *
 * 여기에 든 조건에만 오류 신고를 둔다. 나머지는 Moodle·Reclaim 이 가진
 * 기록을 그대로 읽으므로 다툴 판단이 없다 — 값이 다르면 동기화 문제다.
 *
 * 정책이 바뀌어 AI 가 보는 조건이 늘면 여기에 더한다.
 */
const AI_JUDGED = new Set(['reflection-topics']);

/**
 * '이' 와 '가' 를 고른다.
 *
 * 조건 이름이 데이터에서 오므로 조사를 글자로 박아둘 수 없다. 받침이 있으면
 * '이', 없으면 '가' 다 (강의 수강 → 수강이, 회고 → 회고가).
 * 한글이 아니면(예: HackerRank 로 끝나는 이름) '가' 로 둔다.
 */
function subjectJosa(word) {
  const last = String(word ?? '').trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '가';
  return (code - 0xac00) % 28 === 0 ? '가' : '이';
}

// ── 히어로 ──────────────────────────────────────────────────────────────
//
// 레퍼런스 맨 위 구조를 그대로 가져왔다 — 상태 알약 · 꽉 조인 큰 제목 ·
// 한 문단 설명 · 버튼 · 숫자 네 칸.
//
// 레퍼런스는 투자 유치 문구를 거기 넣었지만 우리는 **지금 이 신청이 어디까지
// 왔는지**를 넣는다. §9.1 의 "가장 필요한 행동 한 가지" 가 이 자리다.
//
// 제목을 우리가 지어내지 않는다. 연결 상태와 서버가 준 값에서만 나온다
// (오규원 Q3 — 브라우저가 조건 번호를 보고 환급 정책을 추측하지 않는다).

function heroLine(view, { conn, blocked }) {
  // 1. 로그인부터. **다른 무엇보다 먼저다.**
  //
  // 로그인하지 않았으면 지금 보이는 값은 내 기록이 아니다. 그 상태에서
  // "100 TEST 받으셨어요" 를 띄우면 남의 결과를 내 것처럼 읽게 된다.
  // (서버가 아예 없는 시연 모드는 state 가 OFFLINE 이라 여기 걸리지 않는다)
  if (conn?.state === 'SIGNED_OUT') {
    return {
      tone: null,
      pill: '로그인 필요',
      title: '로그인하기',
      sub: '로그인하시면 내 기록을 불러와 조건을 확인합니다.',
      action: true,
    };
  }

  // 1-2. 서버가 아직 안 켜졌다.
  //
  // 위와 같은 이유로 여기 있다. NOT_ACTIVE 면 지금 화면의 숫자는 서버가 준
  // 내 기록이 아니다. 그런데 2026-10-30 오프라인 검사에서 보니 이 가지가
  // **없어서** 학생 화면이 "조건 1개 남았습니다" 를 자기 기록처럼 띄웠다.
  // (운영자 화면은 막힌 이유를 적고 있었다 — 학생 쪽만 비어 있었다)
  //
  // 아래 sub 가 NOT_ACTIVE 에서 blocked 를 일부러 지우는 것도 이것 때문이다 —
  // 히어로가 말한다고 보고 지웠는데, 정작 말하는 자리가 없었다.
  if (conn?.state === 'NOT_ACTIVE') {
    return {
      tone: 'wait',
      pill: '준비 중',
      title: '아직 열리지 않았어요',
      sub: '서버가 아직 켜지지 않았어요. 내 기록을 불러오지 못했으니 아래 숫자는 '
        + '아직 내 것이 아닙니다. 열리면 바로 확인하실 수 있어요.',
    };
  }

  // 2. 미해결 종료. **조건 미충족과 다르다.**
  //
  // 학생은 할 걸 다 했는데 절차가 안 끝난 것이다. 이걸 그냥 '못 받음' 으로
  // 보여주면 "내가 조건을 못 채웠구나" 로 읽힌다 — 멘토 §3 이 막으라는 오해다.
  const ended = view.procedure?.terminationReason ?? null;
  if (ended) {
    const metAll = metCount(view) === 4;
    return {
      tone: 'wait',
      pill: '확인 절차 종료',
      title: metAll ? '조건은 모두 충족했습니다' : '확인 절차가 종료됐습니다',
      // 문구는 2026-10-29 백엔드가 준 것을 쓴다. 두 군데를 고쳤다.
      //
      //   1  "조건 미충족으로 확정된 것은 아닙니다" 를 **조건 수와 무관하게**
      //      적는다. 절차가 판단을 못 끝낸 것이지 미충족으로 확정된 게 아니다
      //   2  "예약했던 재원은 금고로 돌아갔습니다" 를 **지웠다.** 종료만으로
      //      예약이 풀린다고 확정된 바 없다. 서버가 안 알려 준 자금 상태를
      //      화면이 단정하면 안 된다
      sub: `${TERMINATION[ended] ?? ended}. 조건 미충족으로 확정된 것은 아닙니다. `
        + '후속 확인은 운영자에게 문의해 주세요.',
    };
  }

  // 3. 다 끝났다
  if (isPaid(view)) {
    const got = tokens(view.payment.receivedAtoms, view.agreedPayment.decimals, view.agreedPayment.symbol);
    return {
      tone: 'ok',
      pill: '환급 완료',
      title: got,
      sub: '네 조건을 모두 충족해 지급이 끝났습니다. 가스비는 서비스가 부담했습니다.',
    };
  }

  // 4. 오류 신고가 걸려 있다. **지금 이 신청이 멈춰 있는 이유다.**
  //
  // 학생이 방금 신고를 보냈는데 화면이 아무 말도 안 하면 접수됐는지 알 수
  // 없다. 재원이 모자란 것보다 이걸 먼저 말한다 — 결과를 가르는 쪽이다.
  if (view.objection?.blocked && !ended) {
    // 아직 조건을 다 못 채운 사람에게 "지급이 멈춥니다" 는 어긋난다.
    // 멈출 지급이 없다 — 그 사람에게 중요한 건 판정을 다시 본다는 것이다.
    const 자격 = metCount(view) === 4;
    const at = remaining(view, view.objection.resolvesAt, { bare: true });
    // 접수(내가 한 일)와 재검증(서버가 하는 일)을 나눠서 말한다.
    const 접수중 = view.objection.phase === 'RECEIVED';
    return {
      tone: 'wait',
      pill: 접수중 ? '신고 접수됨' : '다시 확인 중',
      title: 접수중 ? '신고를 접수했습니다' : 'CLEAR 가 다시 확인하고 있습니다',
      sub: (접수중 ? '곧 다시 확인합니다. ' : '')
        + (at && at !== '시간 경과' ? `${at} 뒤에 결과가 나옵니다. ` : '')
        + (자격 ? '그때까지 지급이 멈춥니다. ' : '')
        + '판정이 바뀌면 그대로 반영되고, 그대로면 원래 판정으로 진행됩니다.',
    };
  }

  // 재검증이 끝났다. **결과를 말한다.**
  //
  // 신고를 넣은 사람은 답을 기다리고 있다. 신고가 사라지고 화면이 원래대로
  // 돌아가면 접수가 안 된 줄 안다.
  const 지난신고 = view.objection?.last ?? null;
  if (지난신고?.outcome === 'DISMISSED' && !isPaid(view) && !ended) {
    return {
      tone: null,
      pill: '재검증 완료',
      title: '판정이 유지됐습니다',
      sub: '다시 확인했지만 판정이 같았습니다. 원래 판정으로 진행합니다. '
        + '이 지급 건은 이미 한 번 다시 확인했기 때문에 같은 건으로 또 신고하실 수는 없습니다.',
    };
  }

  // 5. 아직 조건을 다 못 채웠다. **이게 제일 흔한 상태다.**
  //
  // 전에는 여기를 서버의 절차 상태(`SOURCE_REVERIFICATION_REQUIRED` →
  // "근거 재확인 필요")로 적었다. 그건 시스템이 원천을 다시 읽어야 한다는
  // 말이지 **학생이 덜 했다는 말이 아니다.** 3/4 인 학생이 그 글자를 보면
  // 자기가 뭘 잘못한 줄 안다. 남은 조건을 그대로 적는다.
  const left = view.criteria.filter((c) => displayState(c).state !== 'MET');
  if (left.length > 0) {
    const names = left.map((c) => CRITERIA[c.criterionId]?.label ?? c.criterionId);
    return {
      tone: null,
      pill: '조건 진행 중',
      title: `${left.length}개 남았습니다`,
      // "기록이 올라오면 CLEAR 가 자동으로 확인합니다" 를 지웠다.
      //
      // 2026-10-29 백엔드 답변: `normal-source-sequence` 는 **한 번 수집하는
      // 흐름**이고, 화면의 GET 조회는 저장된 상태를 읽는 것이지 원천을 다시
      // 읽는 것이 아니다. Moodle 제한 재조회는 후속 작업이다.
      //
      // 그래서 자동 재확인은 **없는 기능**이었다. 그걸 약속해 두면 학생이
      // 과제를 낸 뒤 가만히 기다리고, 아무 일도 일어나지 않는다.
      sub: `${names.join(' · ')}${subjectJosa(names[names.length - 1])} 아직 확인되지 않았습니다. `
        + '원래 사이트에서 마치시면 그 기록으로 확인합니다. '
        + '자동으로 다시 읽는 기능은 아직 없습니다.',
    };
  }

  // 6. 조건은 다 됐는데 돈이 모자라 멈췄다. 이 제품이 숨기지 않기로 한 상황이다.
  const queue = view.funding?.queue ?? null;
  if (metCount(view) === 4 && queue?.shortfallAtoms) {
    const short = tokens(queue.shortfallAtoms, view.agreedPayment.decimals, view.agreedPayment.symbol);
    return {
      tone: 'wait',
      pill: '환급 재원 대기',
      title: '조건 충족 · 재원 대기',
      sub: `환급 재원이 ${short} 부족합니다.`
        + `${queue.position ? ` 대기 ${queue.position}번.` : ''}`
        + ' 충전이 확인되면 자격을 재확인한 뒤 지급합니다.',
    };
  }

  // 7. 확인 기간. **학생이 지금 누를 게 있는 유일한 자리다.**
  //
  // 여기를 비워 두면 히어로가 "하실 일은 없습니다" 라고 하는데 바로 아래
  // '바로 받기' 버튼이 있다 — 화면이 자기 말을 뒤집는다.
  //
  // §8.3 — 확인은 거부권이 아니다. 안 눌러도 기한이 지나면 지급된다.
  // 그래서 "확인해야 받는다" 가 아니라 "확인하면 바로 받는다" 로 적는다.
  if (view.procedure?.status === 'WAITING_CONFIRMATION') {
    const mine = (view.consent?.records ?? []).some((r) => r.actorRole === 'PARTICIPANT');
    const at = remaining(view, view.procedure.confirmAt, { bare: true });
    return {
      tone: 'ok',
      pill: '확인 기간',
      title: mine ? '확인 완료 · 지급 대기' : '확인하면 바로 받습니다',
      sub: (mine
        ? '확인하셨습니다. 학원 확인이 들어오면 즉시 지급되고, '
        : '아래에서 확인하시면 기다리지 않고 바로 지급됩니다. 누르지 않으셔도 ')
        + (at && at !== '시간 경과'
          ? `${at} 뒤 확인 기간이 끝나면 자동으로 진행됩니다.`
          : '확인 기간이 끝나 자동으로 진행됩니다.'),
    };
  }

  // 8. 서버가 다음 할 일을 줬다
  const next = view.nextAction ?? null;
  if (next) {
    return { tone: null, pill: '지금 할 일', title: next.label ?? next.type, sub: next.detail ?? null };
  }

  // 9. 기다리는 중. 무엇을 기다리는지만 적는다.
  const waiting = view.procedure?.status ? (PROCEDURE[view.procedure.status] ?? view.procedure.status) : null;
  return {
    tone: null,
    pill: waiting ?? '진행 중',
    title: '진행 중',
    sub: blocked && conn && conn.state !== 'OFFLINE' && conn.state !== 'NOT_ACTIVE'
      ? `${blocked} 할 일이 생기면 알려드립니다.`
      : 'CLEAR 가 기록을 확인하고 있습니다. 하실 일은 없습니다.',
  };
}

function heroSection(view, { conn, blocked, onSignIn }) {
  const line = heroLine(view, { conn, blocked });
  const d = view.agreedPayment.decimals;
  const sym = view.agreedPayment.symbol;
  const f = view.funding;

  // 한 단이다. 전에는 오른쪽에 그림 카드를 뒀는데, 그걸 빼면 오른쪽이 비어
  // 보인다 — 그래서 아예 제목이 폭을 다 쓰고 숫자 띠가 아래를 받친다.
  return el('section.hero', {}, [
    ghostWord('CLEAR'),
    statusPill(line.pill, line.tone),
    el('h1.hero-title', { text: line.title }),
    line.sub ? el('p.hero-sub', { text: line.sub }) : null,
    line.action
      ? el('div.hero-actions', {}, [
        pillButton({
          label: conn?.busy ? '여는 중…' : '로그인',
          onClick: onSignIn,
          disabled: conn?.busy,
          iconName: 'wallet',
        }),
      ])
      : null,
    ticker([
      { label: '환급 조건', value: `${metCount(view)} / 4` },
      { label: '약정 금액', value: tokens(view.agreedPayment.amountAtoms, d, sym) },
      { label: '확보된 금액', value: tokens(f?.reservedAtoms, d, sym) },
      { label: '상태', value: line.pill, small: true },
    ]),
  ].filter(Boolean));
}

// ── 1. 가입·반 연결 ─────────────────────────────────────────────────────
//
// §9.1 은 '수령 계정 연결 상태'를 요구한다. 서버가 수령 주소를 주지 않으므로
// 비워 둔다. **로그인한 지갑 주소를 수령 주소라고 적지 않는다** — §7.4.1 이
// 로그인 인증 계정과 실제 수령 주소를 구분하라고 했고, 둘을 같다고 적으면
// 나중에 내장 지갑이 들어올 때 틀린 주소를 보여주게 된다.

function joinSection(view, { conn }) {
  const live = conn?.state === 'LIVE' || conn?.demo;
  const recipient = conn?.recipient ?? null;

  return el('section.bcx-block.panel', {}, [
    iconChip('key'),
    el('h2', { text: '내 수령 계정' }),
    el('p.sec-sub', {
      // 멘토 §2 — 이 주소가 체인에 박혀 있어서, 서버가 다른 주소를 넣어도
      // 컨트랙트가 거부한다. 그게 이 칸이 존재하는 이유다.
      text: '환급금은 여기 등록된 주소로만 갑니다. 신청할 때 한 번 등록하고, '
        + '그 뒤에는 서버도 바꿀 수 없습니다.',
    }),
    ...pairBlock([
      item('수령 주소', recipient, recipient ? '체인에 등록돼 있습니다' : null,
        { always: true }),
      item('참여 반', 'Python 부트캠프'),
      item('로그인', live ? '완료' : null),
    ]),
    !recipient && live
      ? el('p.bcx-warn', { text: '아직 등록되지 않았습니다. 등록해야 지급이 진행됩니다.' })
      : null,
  ].filter(Boolean));
}

// ── 조건 4개 — 카드 격자 ────────────────────────────────────────────────
//
// 레퍼런스의 Tokenomics 카드(Vesting Schedule · Miner Incentives)를 그대로
// 입혔다. 그쪽 뼈대가 이것이다.
//
//   원형 아이콘 → 제목 → 한 줄 부제 → 구분선으로 나뉜 항목들 → 진행 막대 → 버튼
//
// 조건 하나하나가 "무엇을 어떻게 확인하는가" 를 가진 독립된 물건이라 카드가
// 맞다. 전에는 한 줄짜리 목록이었는데, 줄로 늘어놓으면 네 개가 다 같은 무게로
// 보이고 눌러서 들어갈 곳이 있다는 것도 안 보였다.
//
// 버튼은 상세로 간다. 할 일이 있는 조건(인증서)은 버튼 글자가 달라진다.

const CARD_ICON = Object.freeze({
  'activity-complete': 'layers',
  'assignment-submitted': 'check',
  'reflection-topics': 'history',
  'python-basic-certificate': 'key',
});

/** 카드 안의 한 줄. 왼쪽 이름, 오른쪽 값 */
function cardRow(label, value, { strong = false } = {}) {
  return el('li', {}, [
    el('span.cc-k', { text: label }),
    el(strong ? 'span.cc-v.on' : 'span.cc-v', { text: value }),
  ]);
}

/**
 * 조건 한 장.
 *
 * `onToggle` 이 오면 **눌러서 충족·미충족을 바꿀 수 있다.** 라이브 월드에서만
 * 들어온다.
 *
 * 실제 제품에는 이 손잡이가 없다 — 조건은 Moodle·HackerRank 기록을 읽어
 * 서버가 판정하고, 학생이 스스로 체크할 수 없다. 그래서 카드가 눌리는 동안은
 * 점선 테두리를 두르고 모서리에 '시연' 을 달아 제품 버튼과 구분한다.
 */
function conditionCard(row, { onOpen, onToggle = null }) {
  const meta = CRITERIA[row.criterionId];
  const { state, note } = displayState(row);
  const c = collectionFrom(row);
  const met = state === 'MET';
  // 지금 사용자가 움직여야 하는 조건. P0 에서는 인증서 하나뿐이다.
  const needsMe = row.criterionId === 'python-basic-certificate' && !met;

  return el('li.cc', {
    'data-state': met ? 'met' : 'open',
    'data-live': onToggle ? 'yes' : null,
    // 카드 어디를 눌러도 바뀐다. 다만 안에 있는 버튼(자세히)은 제 일을 한다.
    onClick: onToggle
      ? (e) => { if (!e.target.closest('button')) onToggle(row.criterionId); }
      : null,
  }, [
    el('span.cc-chip', { 'aria-hidden': 'true' }, [icon(CARD_ICON[row.criterionId] ?? 'check')]),
    onToggle
      ? el('button.cc-toggle', {
        type: 'button',
        'data-on': met ? 'yes' : 'no',
        onClick: () => onToggle(row.criterionId),
      }, [el('span', { text: met ? '충족 해제' : '충족으로' })])
      : null,
    el('h3.bcx-task-name', { text: meta?.label ?? row.criterionId }),
    el('p.cc-sub', { text: meta?.value ?? '' }),

    el('ul.cc-rows', {}, [
      cardRow('판정', STATE_TEXT[state] ?? state, { strong: met }),
      cardRow('원천', c.shortLabel ?? '미확인'),
      cardRow('근거', c.collected ? '확보' : '없음'),
    ]),

    note ? el('p.cc-note', { text: note }) : null,

    el('button.cc-btn', {
      type: 'button',
      onClick: () => onOpen(row.criterionId),
    }, [
      el('span', { text: needsMe ? '인증하기' : '자세히' }),
      icon('arrowUpRight'),
    ]),
  ].filter(Boolean));
}

/**
 * 네 줄이 똑같은 경고를 들고 있으면 구역 머리에서 한 번만 말한다.
 *
 * 카드마다 "시험용 원천이에요" 를 붙이면 네 번 나오고, 읽는 사람은 문제가
 * 네 개 있는 줄 안다.
 */
function sharedNotes(view) {
  const all = view.criteria.map(collectionFrom);
  const every = (fn) => all.length > 0 && all.every(fn);

  // 합성 여부는 바닥 한 줄이 말한다. 구역마다 또 적지 않는다.
  // 원문 만료는 다르다 — §10.1 이 요구하는 사실이고, 근거를 보려는
  // 사람에게 필요한 정보라 남긴다.
  const out = [];
  if (every((c) => c.originalReadable === false)) {
    out.push('원문 보관 기한 경과 · 판정과 해시는 보존');
  }
  return out;
}

function progressSection(view, { onOpen, onToggle = null }) {
  const met = metCount(view);
  const status = view.decision.conditionsStatus;

  return el('section.cc-section', {}, [
    el('div.sec-head', {}, [
      el('div', {}, [
        el('h2.sec-title', { text: '환급 조건' }),
        el('p.sec-sub', {
          text: '네 개를 모두 충족하면 100 TEST 를 지급합니다. '
            + '학습 기록은 CLEAR 가 Moodle 에서 가져옵니다.',
        }),
      ]),
      // 막대는 두지 않는다. 네 개 중 몇 개인지는 글자로 읽는 게 빠르고,
      // 막대를 그리면 그게 화면에서 제일 센 요소가 된다.
      el('p.sec-count', { text: `${met} / 4 충족` }),
    ]),

    el('ul.cc-grid', {}, view.criteria.map((row) => conditionCard(row, { onOpen, onToggle }))),

    status !== 'MET' && met === 4
      ? el('p.bcx-warn', {
        text: `네 조건이 모두 충족으로 보이나 서버의 전체 판정은 ${status} 입니다. `
          + '전체 판정이 바뀌기 전까지 충족으로 다루지 않습니다.',
      })
      : null,
    view.decision.evidenceCurrent === false
      ? el('p.bcx-warn', { text: '근거의 현재 유효성이 확인되지 않았습니다.' })
      : null,
    el('p.sec-foot', {
      text: [
        ...sharedNotes(view),
        view.observedAt ? `갱신 ${seoulText(view.observedAt)}` : null,
      ].filter(Boolean).join(' · '),
    }),
  ].filter(Boolean));
}


// ── 4. 판정 상세 — 접어 둔다 ────────────────────────────────────────────
//
// §9.1 "적용 정책, 확인한 사실, 원문 위치, 사용 도구, 부족 사유".
// 평소 볼 것이 아니라 결과를 따질 때 보는 값이라 기본은 접는다.

function detailRow(row) {
  const meta = CRITERIA[row.criterionId];
  const c = collectionFrom(row);
  const reason = reasonText(row.reasonCode);

  return el('div.bcx-detail-item', {}, [
    el('h3', { text: meta?.label ?? row.criterionId }),
    ...pairBlock([
      item('사용한 도구', c.label),
      item('부족 사유', reason),
      item('근거', row.evidenceId ? `${row.evidenceId} · rev ${row.evidenceRevision}` : null),
      item('근거 유효 기한', row.expiresAt ? seoulText(row.expiresAt) : null),
      item('원문 조회', c.originalReadable === null ? null
        // §10.1 — 해시만 남고 원문이 만료된 상태를 화면에서 말한다
        : c.originalReadable ? '가능' : '불가',
      c.originalReadable === false ? '보관 기한 경과. 판정과 해시는 보존됩니다' : null),
      item('내 열람 권한', c.originalAuthorized === null ? null
        : c.originalAuthorized ? '있음' : '없음'),
    ]),
  ]);
}

function decisionDetailSection(view) {
  return el('details.bcx-detail', {}, [
    el('summary', { text: '판정 상세 보기 — 어떤 근거로 이렇게 판정했나' }),
    ...pairBlock([
      item('적용 정책', view.policyHash),
      item('조건 매핑', view.runtimeMappingHash),
      item('판정', `${view.decision.id} · rev ${view.decision.revision}`),
      item('판정 해시', view.decision.hash),
      item('현재 판정인가', view.decision.current === true ? '예' : '아니오'),
    ]),
    ...view.criteria.map(detailRow),
  ]);
}

// ── 5. 확인 기간 ────────────────────────────────────────────────────────

function consentSection(view, { api, blocked, onChange, conn }) {
  const p = view.procedure;
  const c = view.consent;

  // §8.3 시작 조건 — 조건 충족 + **개별 지급액 전액 배정** + 판정 공개.
  // 배정이 안 됐으면 확인 절차는 시작도 안 한다. 그런데 블록을 다 펼쳐 두면
  // '참가자 동의 아직이에요 / 운영자 동의 아직이에요' 가 떠서, 사람이 안 눌러
  // 멈춘 것처럼 읽힌다. 멈춘 건 돈 때문이다.
  // 절차가 끝났으면 확인 기간은 닫혔다. 끝난 절차에 '2분 남음' 을 띄우면 거짓이다.
  if (p?.terminationReason) {
    return el('section.bcx-block.panel', {}, [
      iconChip('lock'),
      el('h2', { text: '확인 기간' }),
      el('p.bcx-note', { text: '종료됐습니다. 더 확인할 것이 없습니다.' }),
    ]);
  }
  if (!p?.publishedAt) {
    return el('section.bcx-block.panel', {}, [
      iconChip('lock'),
      el('h2', { text: '확인 기간' }),
      el('p.bcx-note', {
        text: '아직 시작하지 않았습니다. 환급 재원이 전액 확보돼야 확인 기간이 열립니다.',
      }),
    ]);
  }
  // 지급까지 끝났으면 확인 기간도 닫혔다. 그런데 서버가 보내 준 기한
  // (confirmAt·reviewCapAt)은 그대로 남아 있어서, 그냥 그리면 끝난 절차에
  // **'3분 남음' 이 돈다.** 지난 일로 적는다.
  if (isPaid(view)) {
    return el('section.bcx-block.panel', {}, [
      iconChip('lock'),
      el('h2', { text: '확인 기간' }),
      el('p.sec-sub', { text: '끝났습니다. 아래는 그때 남은 기록입니다.' }),
      ...pairBlock([
        item('지급 금액', tokens(view.agreedPayment.amountAtoms, view.agreedPayment.decimals, view.agreedPayment.symbol)),
        ...(c?.requiredRoles ?? []).map((role) => item(
          `${ROLE_TEXT[role] ?? role} 확인`,
          (c?.records ?? []).some((r) => r.actorRole === role && r.value === 'AGREE')
            ? '완료'
            : '없음 (기간 종료로 진행)',
        )),
        item('확인 기간 종료', p?.confirmAt ? seoulText(p.confirmAt) : null),
      ]),
    ]);
  }
  const agreed = new Set((c?.records ?? []).filter((r) => r.value === 'AGREE').map((r) => r.actorRole));
  const required = c?.requiredRoles ?? [];

  const left = p?.confirmAt ? remaining(view, p.confirmAt) : null;
  const bare = p?.confirmAt ? remaining(view, p.confirmAt, { bare: true }) : null;

  return el('section.bcx-block.panel', {}, [
    el('h2', { text: '확인 기간' }),
    // 글자가 동작과 같아야 한다. '동의' 라고 쓰면 안 누르면 못 받는 줄 알지만,
    // 실제로는 아무도 안 눌러도 확인 기간이 끝나면 진행된다(§8.3 기한 경로).
    // 그래서 '확인'이라 쓰고, 자동 진행한다는 사실을 바로 옆에 적는다.
    el('p.sec-sub', {
      text: left
        ? `${left}. 양쪽이 모두 확인하면 기다리지 않고 바로 지급합니다. `
          + '확인하지 않아도 기간이 끝나면 자격·재원·오류 신고를 다시 검사한 뒤 진행합니다.'
        : '양쪽이 모두 확인하면 바로 지급합니다.',
    }),
    ...pairBlock([
      item('지급 금액', tokens(view.agreedPayment.amountAtoms, view.agreedPayment.decimals, view.agreedPayment.symbol)),
      item('수령 주소', conn?.recipient ?? null),
      ...required.map((role) => item(
        `${ROLE_TEXT[role] ?? role} 확인`,
        agreed.has(role) ? '완료' : '대기',
        agreed.has(role) ? null : (bare ? `${bare} 뒤 자동 진행` : null),
      )),
      item('같은 판정 확인', c?.bothCurrent === true ? '양쪽 완료' : '아직'),
      item('남은 확인 기간', left, p?.confirmAt ? `${seoulText(p.confirmAt)} 까지` : null),
      item('전체 상한', p?.reviewCapAt ? remaining(view, p.reviewCapAt) : null,
        p?.reviewCapAt ? `${seoulText(p.reviewCapAt)} 까지` : null),
    ]),
    c?.onchainWalletSignaturesVerified === false
      ? el('p.bcx-note', {
        text: '이 확인은 앱 기록입니다. 컨트랙트가 양쪽 지갑 서명을 직접 검증한 것은 아닙니다.',
      })
      : null,
    consentPanel({ view, api, blocked, onDone: onChange, quiet: true }),
    // 오류 신고는 여기 두지 않는다. 다툴 수 있는 건 AI 가 해석한 회고뿐이고,
    // 그 판단의 근거를 보여 주는 자리가 회고 상세다. 거기서 신고한다.
    el('p.bcx-note', {
      text: 'AI 가 본 회고 판정이 틀렸다고 생각하시면 「환급 조건 · 회고 · 자세히」 에서 '
        + '근거 문장을 확인하고 알려 주실 수 있습니다.',
    }),
  ].filter(Boolean));
}

// ── 6. 재원·지급 ────────────────────────────────────────────────────────
//
// §9.1 "조건 충족과 재원 확보 분리". 자격이 되는 것과 돈이 있는 것은 다르다.
// §7.5 "화면에는 재원 부족과 거래 비용 후원 장애를 다르게 표시한다".

function fundingSection(view, { api, blocked }) {
  const f = view.funding;
  const d = view.agreedPayment.decimals;
  const s = view.agreedPayment.symbol;
  const shortfall = f?.queue?.shortfallAtoms ?? null;
  const paid = isPaid(view);

  // 레퍼런스의 7:5 분할 블록. 왼쪽은 설명과 값, 오른쪽은 색면에 큰 숫자.
  // 카드만 줄줄이 놓으면 페이지가 끝까지 평평해서 무게가 안 생긴다.
  return el('section.split', {}, [
    el('div.split-main', {}, [
      monoLabel('STEP 02'),
      el('h2', { text: '재원과 지급' }),
      el('p.sec-sub', {
        text: '조건 충족과 재원 확보는 다릅니다. 지급액이 전액 확보돼야 확인 절차가 열립니다. '
          + '확보된 금액은 금고에 잠겨 있어 학원이 도로 가져갈 수 없습니다.',
      }),
      ...pairBlock([
        item('내 자격', view.decision.conditionsStatus === 'MET' ? '조건 충족' : '미충족'),
        item('재원 상태', f?.status ? (FUNDING[f.status] ?? f.status) : null),
        item('약정 금액', tokens(view.agreedPayment.amountAtoms, d, s)),
        item('확보된 금액', tokens(f?.reservedAtoms, d, s),
          // **자동 지급이 왜 보장되는지는 여기서 나온다.** 학원이 미리 넣었고
          // 꺼낼 수 없으므로, 조건만 채우면 반드시 나간다. 학생에게 제일
          // 중요한 사실인데 화면이 말을 안 하고 있었다.
          Number(f?.reservedAtoms ?? 0) > 0
            ? '이미 금고에 잠긴 금액입니다. 학원이 도로 가져갈 수 없습니다'
            : null),
        shortfall ? item('부족액', tokens(shortfall, d, s), '충전되면 자격을 재확인합니다') : null,
        view.procedure?.reservationReleased
          ? item('예약', '해제됨', '절차가 끝나 예약했던 재원이 금고로 돌아갔습니다')
          : null,
        f?.queue?.position ? item('대기 순서', `${f.queue.position}번`,
          '클릭 순서가 아니라 판정이 확정된 순서입니다') : null,
      ]),
      paymentPanel({ view, api, blocked, quiet: true }),
    ]),

    el('div.split-side', {}, [
      monoLabel(paid ? '수령 완료'
        : view.procedure?.terminationReason ? '지급되지 않음'
          : shortfall ? '부족액' : '약정 금액'),
      el('p.bignum', {}, [
        el('span', {
          text: paid
            ? tokens(view.payment.receivedAtoms, d, s)
            : shortfall
              ? tokens(shortfall, d, s)
              : tokens(view.agreedPayment.amountAtoms, d, s),
        }),
        el('small', {
          text: paid
            ? '거래 최종 확정 · 가스비 0'
            : view.procedure?.terminationReason
              ? '확인 절차가 종료돼 지급되지 않았습니다'
              : shortfall
                ? '학원 충전 대기 중'
                : Number(f?.reservedAtoms ?? 0) > 0
                  ? '이미 잠겨 있습니다. 조건을 모두 충족하면 자동으로 지급됩니다'
                  : '조건을 모두 충족하고 재원이 확보되면 자동으로 지급됩니다',
        }),
      ]),
      el('p.bcx-note', { text: '가스비는 서비스가 부담합니다. 학생은 온체인 거래를 보내지 않습니다.' }),
    ]),
  ]);
}

// ── 7. 판단 이력 — 접어 둔다 ────────────────────────────────────────────

function historySection(view, { api, blocked, onChange }) {
  const p = view.procedure;
  const revision = view.decision.revision;

  return el('details.bcx-detail', {}, [
    el('summary', { text: '판단 이력 보기 — 판정이 바뀐 적이 있나' }),
    ...pairBlock([
      item('현재 판정 회차', revision === null || revision === undefined ? null : `${revision}차`),
      item('재검증 사용', p ? `${p.revalidationCount ?? 0}회 / 최대 ${p.revalidationLimit ?? '?'}회` : null),
      item('절차 시작', p?.firstStartedAt ? seoulText(p.firstStartedAt) : null),
      item('판정 공개', p?.publishedAt ? seoulText(p.publishedAt) : null),
      item('무효화 사유', p?.invalidationReason),
      item('종료 사유', p?.terminationReason ? (TERMINATION[p.terminationReason] ?? p.terminationReason) : null),
    ]),
    el('p.bcx-note', {
      text: revision > 1
        ? `지금 판정은 ${revision}차입니다. 이전 판정과 바뀐 이유는 서버가 목록으로 주지 않아 `
          + '여기 표시할 수 없습니다.'
        : '이전 판정 목록은 서버가 주지 않습니다.',
    }),
    revalidationPanel({ view, api, blocked, onDone: onChange }),
  ]);
}

// ── 8. 복구·직접 청구 — 접어 둔다 ──────────────────────────────────────
//
// §7.5 "학생이 직접 청구 경로를 선택함 → 예상 비용과 부담 주체를 먼저 표시.
// 조용히 학생 유료 거래로 전환하지 않음". 비용을 모르면 버튼을 띄우지 않는다.

function recoverySection(view) {
  const pay = view.payment ?? {};
  const accepted = pay.acceptedRight ?? null;

  return el('details.bcx-detail', {}, [
    el('summary', { text: '복구·직접 청구 보기 — 서버가 멈추면 어떻게 되나' }),
    ...pairBlock([
      item('수락된 지급권리', accepted ? '있음' : '없음'),
      item('청구 상태', pay.claimState ? (CLAIM_TEXT[pay.claimState] ?? pay.claimState) : null),
      item('예약 해제됨', view.procedure?.reservationReleased === true ? '예' : '아니오'),
    ]),
    el('p.bcx-note', {
      text: accepted
        ? '권리가 수락된 뒤에는 수령인과 금액이 고정됩니다. 서비스 서버가 멈춰도 '
          + '체인이 살아 있으면 다른 경로로 청구할 수 있습니다.'
        : '권리가 수락되기 전에는 서비스가 있어야 진행됩니다. 수락 뒤에는 서버가 멈춰도 권리가 남습니다.',
    }),
    // 직접 청구 버튼을 지금 띄우지 않는 이유를 적는다. 안 만든 것과 다르다.
    el('p.bcx-note', {
      text: '직접 청구는 가스비가 들 수 있어, 예상 비용과 부담 주체를 먼저 보여드린 뒤에만 '
        + '선택하실 수 있게 합니다. 서버가 그 비용을 아직 주지 않아 버튼을 띄우지 않았습니다.',
    }),
  ]);
}

// ── 전체 ────────────────────────────────────────────────────────────────

export function studentSection({
  view, phase = null, procedureReady = true, api = null, sign = null, onChange = () => {},
  conn = null, onSignIn = () => {}, onSignOut = () => {}, onOpen = () => {},
  // 라이브 월드에서만 온다. 조건 카드를 눌러 충족·미충족을 바꾼다.
  onToggle = null,
}) {
  // 막는 이유는 맨 위에서 한 번만 말한다. 패널마다 반복하면 읽는 사람이
  // 문제가 여럿 있는 줄 안다.
  const blocked = phase && phase !== 'ACTIVE_LOCAL_TEST'
    ? '서버가 아직 켜지지 않았어요.'
    : !procedureReady
      ? '확인 절차가 아직 준비되지 않았어요.'
      : !api
        ? '서버에 연결되지 않았어요.'
        : view.decision.current === false
          ? '지금 판정이 아니에요. 다시 불러와 주세요.'
          : view.objection?.blocked
            ? '아직 해결되지 않은 오류 신고가 있습니다.'
            : null;

  const section = el('section.bcx', {});
  const render = () => {
    clear(section);
    section.append(...[
      heroSection(view, { conn, blocked, onSignIn }),
      // 연결 줄은 로그인한 뒤에만 쓸모가 있다(주소·로그아웃). 로그인 전 상태는
      // 히어로가 이미 제목과 버튼으로 말하고 있어 두 번 말하지 않는다.
      conn && conn.state === 'LIVE'
        ? sessionPanel({ conn, onSignIn, onSignOut })
        : conn?.error ? sessionPanel({ conn, onSignIn, onSignOut }) : null,

      // 구역마다 띠를 두르고 배경을 번갈아 준다. 레퍼런스의 py-32 리듬.
      el('div.band.band--card', {}, [el('div.band-inner', {}, [progressSection(view, {
        onOpen,
        // 지급·종료된 뒤에는 조건을 바꿀 수 없다. 월드가 막고 있어 눌러도
        // 상태는 안 깨졌지만 **단추가 살아 있어 멈춘 것처럼 보였다.**
        // 조작판 칩은 PAID 에서 잠기는데 여기만 안 잠겨 있었다.
        onToggle: isPaid(view) || view.procedure?.terminationReason ? null : onToggle,
      })])]),

      el('div.band.band--soft', {}, [el('div.band-inner', {}, [fundingSection(view, { api, blocked })])]),
      el('div.band.band--card', {}, [el('div.band-inner', {}, [consentSection(view, { api, blocked, onChange, conn })])]),

      joinSection(view, { conn }),
      decisionDetailSection(view),
      historySection(view, { api, blocked, onChange }),
      recoverySection(view),

      el('p.bcx-limits', {
        // 끝난 화면에서 "지급이 끝났다는 뜻은 아니에요" 라고 하면 거짓이다.
        text: isPaid(view)
          ? '지급과 거래 확정까지 끝났습니다. 무가치 TEST 토큰이며 실제 환급금이 아닙니다.'
          : '여기 보이는 것은 지금까지 확인된 기록입니다. 자격이 확정됐거나, 지금 청구할 수 있거나, '
            + '지급이 끝났다는 뜻은 아닙니다.',
      }),
    ].filter(Boolean));
  };
  render();
  return section;
}

// ── 조건 상세 ───────────────────────────────────────────────────────────
//
// 카드의 버튼이 여기로 온다. 한 조건만 크게 놓고, 그 조건에 할 수 있는 일을
// 오른쪽에 모은다.
//
// 메인에 다 펼쳐 두지 않는 이유 — 조건마다 원천·도구·근거·기한·권한이 있는데
// 네 개를 다 펴면 메인이 다시 글자 벽이 된다. 레퍼런스가 카드에 요약만 놓고
// 자세한 건 따로 두는 것도 같은 이유다.

// ── 확인한 내용 ────────────────────────────────────────────────────────
//
// 상세 화면에 메타데이터(근거 ID·해시·기한)만 있으면 학생이 알고 싶은 것을
// 못 본다. "충족" 말고 **내가 뭘 했길래 충족인지** 가 필요하다.
//
// 서버가 주면 그리고, 안 주면 이 구역 자체를 그리지 않는다. 지어내지 않는다.

const ITEM_STATE = Object.freeze({
  DONE: '완료', SUBMITTED: '제출', MISSING: '없음', LATE: '지각',
});

function detailBlock(row) {
  const d = row.detail;
  if (!d) return null;
  const items = d.items ?? [];
  const facts = d.facts ?? [];
  if (items.length === 0 && facts.length === 0 && !d.progress) return null;

  return el('div.panel', {}, [
    iconChip('layers'),
    el('h2', { text: '확인한 내용' }),

    // §9.3 — 진척도는 서버가 줄 때만. 안 주면 0/4 를 지어내지 않는다.
    d.progress
      ? el('div.dt-progress', {}, [
        el('p.dt-count', {
          text: `${d.progress.done} / ${d.progress.total}${d.progress.unit ?? ''}`,
        }),
        el('div.meter', { 'aria-hidden': 'true' }, [
          el('i', { style: `width:${Math.min(100, (d.progress.done / Math.max(1, d.progress.total)) * 100)}%` }),
        ]),
      ])
      : null,

    items.length > 0
      ? el('ul.dt-items', {}, [
        ...items.map((it) => el('li', {}, [
          el('span.dt-label', { text: it.label }),
          el('span.dt-at', { text: it.at ? seoulText(it.at) : '' }),
          el('span.dt-state', { text: ITEM_STATE[it.state] ?? it.state ?? '' }),
        ])),
        d.more ? el('li.dt-more', {}, [el('span', { text: `외 ${d.more}건` })]) : null,
      ].filter(Boolean))
      : null,

    facts.length > 0
      ? el('dl.bcx-pairs', {}, facts.map((f) => el('div.bcx-pair', {}, [
        el('dt', { text: f.k }),
        el('dd', {}, [el('span', { text: f.v })]),
      ])))
      : null,
  ].filter(Boolean));
}

// ── AI 가 찾은 근거 ─────────────────────────────────────────────────────
//
// 멘토 §4 — "회고에서 어떤 근거 문장을 찾아 어떻게 판단했는지를 화면으로
// 보여 주면, 심사위원의 'AI가 무엇을 하느냐'는 질문에 바로 답할 수 있습니다."
//
// 원문을 통째로 놓고 AI 가 집은 문장에 표시를 한다. 요약하지 않는다 —
// 요약하면 'AI 가 뭘 보고 그랬는지' 가 다시 사라진다.

function highlighted(text, findings) {
  // offset 순으로 잘라 붙인다. 겹치거나 범위를 벗어난 것은 버린다.
  const marks = findings
    .filter((f) => Number.isInteger(f.offset) && f.offset >= 0 && f.quote
      && text.slice(f.offset, f.offset + f.quote.length) === f.quote)
    .sort((a, b) => a.offset - b.offset);

  const out = [];
  let at = 0;
  for (const m of marks) {
    if (m.offset < at) continue;
    if (m.offset > at) out.push(document.createTextNode(text.slice(at, m.offset)));
    out.push(el('mark.ai-hit', { 'data-topic': m.topic, text: m.quote }));
    at = m.offset + m.quote.length;
  }
  if (at < text.length) out.push(document.createTextNode(text.slice(at)));
  return out;
}

function aiEvidenceBlock(row) {
  const ai = row.aiEvidence;
  if (!ai) return null;

  return el('div.panel.ai', {}, [
    iconChip('history'),
    el('h2', { text: 'AI 가 무엇을 보고 판단했나' }),
    el('p.bcx-note', {
      text: '글을 평가하거나 점수를 매기지 않습니다. 루브릭 세 항목이 글에 있는지만 봅니다.',
    }),

    ai.sourceText
      ? el('div.ai-source', {}, [
        el('p.mono-label', { text: '제출한 회고' }),
        el('p.ai-text', {}, highlighted(ai.sourceText, ai.findings ?? [])),
      ])
      : null,

    el('ul.ai-list', {}, (ai.findings ?? []).map((f) => el('li', { 'data-met': f.met ? 'yes' : 'no' }, [
      el('span.ai-topic', { text: f.topic }),
      el('p.ai-quote', { text: f.quote ? `"${f.quote}"` : '근거 문장을 찾지 못했습니다' }),
    ]))),

    // 어느 모델이 어느 루브릭으로 봤는지. 멘토가 §2 에서 같이 요구한 것이다.
    ...pairBlock([
      item('모델', ai.model),
      item('루브릭 버전', ai.policyVersion),
      item('판단 시각', ai.checkedAt ? seoulText(ai.checkedAt) : null),
    ]),
    el('p.bcx-note', {
      // '사람이 다시 봅니다' 였다. 10-29 C1 답변이 "회고에 한정한 사람 확인도
      // 논의안이며 사람 검토자를 확정·구현한 것으로 표시하지 않는다" 라서 뺐다.
      // 바로 위 문단("CLEAR 가 기록을 다시 가져와")과도 어긋나 있었다.
      text: '판단이 틀렸다고 보시면 확인 기간에 오류를 알려 주세요. 접수되면 한 번 더 확인합니다.',
    }),
  ].filter(Boolean));
}

export function conditionDetail({
  view, criterionId, api = null, blocked = null, sign = null,
  onChange = () => {}, onBack = () => {},
}) {
  const row = view.criteria.find((r) => r.criterionId === criterionId);
  if (!row) {
    return el('section.bcx', {}, [
      el('h1.hero-title', { text: '없는 조건입니다' }),
      el('div.hero-actions', {}, [pillButton({ label: '돌아가기', onClick: onBack, ghost: true })]),
    ]);
  }

  const meta = CRITERIA[criterionId];
  const { state, note } = displayState(row);
  const c = collectionFrom(row);
  const met = state === 'MET';
  const needsMe = criterionId === 'python-basic-certificate' && !met;

  return el('section.bcx', {}, [
    el('button.backlink', { type: 'button', onClick: onBack }, [
      icon('arrowUpRight'), el('span', { text: '환급 조건으로' }),
    ]),

    el('section.hero', {}, [
      statusPill(STATE_TEXT[state] ?? state, met ? 'ok' : 'wait'),
      el('h1.hero-title', { text: meta?.label ?? criterionId }),
      el('p.hero-sub', { text: meta?.detail ?? '' }),
    ]),

    el('div.detail-grid', {}, [
      // 왼쪽 — 무엇을 어떻게 확인하나
      el('div.panel', {}, [
        iconChip(CARD_ICON[criterionId] ?? 'check'),
        el('h2', { text: '어떻게 확인하나요' }),
        ...pairBlock([
          item('충족 기준', [meta?.value, meta?.tail].filter(Boolean).join(' ') || null),
          item('원천', c.label),
          item('현재 판정', STATE_TEXT[state] ?? state),
          item('부족 사유', note),
          item('근거', row.evidenceId ? `${row.evidenceId} · rev ${row.evidenceRevision}` : null),
          item('근거 유효 기한', row.expiresAt ? seoulText(row.expiresAt) : null),
          item('원문 조회', c.originalReadable === null ? null
            : c.originalReadable ? '가능' : '불가',
          c.originalReadable === false ? '보관 기한 경과. 판정과 해시는 보존됩니다' : null),
          item('내 열람 권한', c.originalAuthorized === null ? null
            : c.originalAuthorized ? '있음' : '없음'),
        ]),

      ].filter(Boolean)),

      // 오른쪽 — 여기서 할 수 있는 일
      el('div.panel', {}, [
        iconChip(needsMe ? 'key' : 'lock'),
        el('h2', { text: '여기서 할 수 있는 일' }),
        needsMe
          ? sourceSignaturePanel({ view, api, blocked, sign, onDone: onChange, quiet: true, inline: true })
          : el('p.bcx-note', {
            text: met
              ? '이 조건은 충족됐습니다. 더 하실 일이 없습니다.'
              : 'CLEAR 가 원천에서 기록을 가져오는 중입니다. 따로 하실 일은 없습니다.',
          }),

        // ── 오류 신고는 **회고에만** 둔다 ─────────────────────────────
        //
        // 나머지 셋은 기계가 읽은 기록이다. 출석·과제는 Moodle 이 가진
        // 값이고 인증서는 Reclaim 이 공증한 값이라, 틀렸다면 그건 판단이
        // 아니라 동기화 문제다. 사람이 다퉈서 뒤집을 값이 아니다.
        //
        // 회고만 AI 가 글을 읽고 해석한다. 거기만 다툴 거리가 있고,
        // 그래서 AI 가 어느 문장을 근거로 봤는지도 아래에 펼쳐 둔다
        // (멘토 §4). 근거를 보여 준 자리에서 바로 반박할 수 있어야 한다.
        // 다툴 수 있는 건 AI 가 해석한 회고뿐이다.
        //
        // 나머지 셋에 '다시 확인 요청' 을 뒀다가 뺐다. 그건 원천을 못 읽는
        // 오류를 다루는 손잡이인데, **우리는 그 경우를 다루지 않기로 했다**
        // (같은 이유로 '보완 필요' 단계도 뺐다). 서버에 경로도 없고, 눌러도
        // 늘 "바뀐 내용이 없습니다" 만 나온다 — 살아 있는 척하는 죽은 단추다.
        // 끝난 절차에는 신고 단추를 띄우지 않는다. 눌러도 서버가 거절한다
        // ("이미 지급이 끝난 신청입니다"). 누를 수 없는 단추를 보여 주면
        // 사용자는 할 수 있는 일인 줄 알고 눌러 본다.
        AI_JUDGED.has(criterionId) && !isPaid(view) && !view.procedure?.terminationReason
          ? objectionPanel({ view, api, blocked, onDone: onChange })
          : AI_JUDGED.has(criterionId)
            ? el('p.bcx-note', {
              text: isPaid(view)
                ? '지급이 끝나 더 다툴 것이 없습니다.'
                : '확인 절차가 종료돼 더 다툴 것이 없습니다.',
            })
            : el('p.bcx-note', {
              text: '이 조건은 CLEAR 가 Moodle·HackerRank 기록을 읽어 판정합니다. '
                + '따로 하실 일은 없습니다.',
            }),
      ]),
    ]),

    // 서버가 내역을 준 조건에만 붙는다
    detailBlock(row),
    // 회고처럼 AI 가 판단한 조건에만 붙는다
    aiEvidenceBlock(row),
  ].filter(Boolean));
}
