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
import { proposeReading, applyOverrides, emptyProposal, MANUAL_CHOICES } from './normalize.js';

/**
 * 제안자 — 원문을 읽어 "이렇게 읽었습니다" 를 만드는 쪽.
 *
 * 지금은 규칙이다. B 가 Gemini 호스트 포트를 열면 같은 모양의 제안자를
 * 끼운다 — `{ id, label, propose(text) }`. `propose` 는 값이든 Promise 든
 * 된다. 확인 화면은 바뀌지 않고 **출처 표시(label)만** 바뀐다.
 * 오규원: "시연에서도 제안 출처를 표시하자."
 */
export const RULES_PROPOSER = Object.freeze({
  id: 'rules',
  label: '프론트 규칙 기반 · 모델 아님',
  propose: proposeReading,
});

/** 운영자가 직접 고를 때 보이는 이름 */
const MANUAL_LABEL = Object.freeze({
  'MOODLE_ACTIVITY_COMPLETION.1': '강의 활동 완료',
  'MOODLE_ASSIGNMENT_SUBMISSION.1': '과제 제출',
  'REFLECTION_REQUIRED_TOPICS.1': '회고 세 항목',
  'HACKERRANK_CERTIFICATE_HOLDING.1': 'HackerRank 인증서 보유',
  NOT_A_CONDITION: '조건 아님 (보류)',
});

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
export function aiComparePanel({
  adapter, source = '', onSource = () => {}, presets = [], proposer = RULES_PROPOSER,
}) {
  const box = el('section.fp', {});
  let text = source;
  // 제안자가 읽은 원본. 운영자 지정을 얹기 전이다.
  let base = emptyProposal();
  // 운영자가 못 읽은 조항에 직접 붙인 것. 키는 "번호:원문" — 원문이 바뀌면 버려진다.
  const overrides = new Map();
  // 화면이 쓰는 최종 제안 = 제안자 원본 + 운영자 지정.
  let proposal = base;
  // 제안이 비동기(Gemini)일 때 늦게 온 답을 버리려고 번호를 매긴다.
  let proposeStamp = 0;
  let proposing = false;
  // 지금 제안(base)이 **어느 원문**에서 나왔나. 화면의 원문(text)과 다르면
  // 제안은 이전 입력의 것이다 — 실행하면 안 된다(PR #164 리뷰 1).
  let proposedFor = text.trim() === '' ? text : null;
  // 예문 칩을 눌렀는데 제안이 비동기라 아직이면, 준비되는 대로 그 원문으로 실행한다.
  let runWhenReady = null;
  // 마지막으로 모듈에 넘긴 제안. ① 절에서 학원 원문과 정규 문장을 짝짓는 데 쓴다.
  // 그 뒤 원문이 바뀌어도 이 짝은 **보낸 당시** 기준이어야 한다.
  let lastSent = null;

  // 서버(Gemini) 제안은 운영자 지정으로 덮지 않는다 — 서버가 보류한 조항을 프론트가
  // 실행 가능하게 바꾸면 안 된다(오규원 11/5). 규칙 제안만 지정을 얹는다.
  const recompute = () => { proposal = base.serverBinding ? base : applyOverrides(base, overrides); };

  /** 명시적 제안자(Gemini): 입력마다 부르지 않고 「제안 생성」 을 눌러야 한 번 돈다 */
  const explicit = proposer.explicit === true;

  /** 제안자를 돌린다. 값이든 Promise 든 받고, 늦게 온 답은 버린다 */
  const propose = (next) => {
    const stamp = (proposeStamp += 1);
    const got = proposer.propose(next);
    if (typeof got?.then !== 'function') { base = got; proposedFor = next; proposing = false; recompute(); return; }
    proposing = true; render();
    const settleProposal = (value) => {
      if (stamp !== proposeStamp) return;         // 그새 원문이 바뀌었다
      base = value; proposedFor = next; proposing = false; recompute();
      if (runWhenReady !== null && runWhenReady === text) { runWhenReady = null; run(); }
      render();
    };
    got.then(settleProposal, () => settleProposal(emptyProposal()));
  };

  /** 화면의 원문과 같은 원문으로 만든 제안이 준비됐나. 아니면 실행하지 않는다 */
  const proposalReady = () => !proposing && proposedFor === text && editTimer === null && !composing;

  const run = () => {
    // 서버 제안은 표시 전용이다. canonicalText 는 호환용 원문일 뿐, 규칙·fixture 실행기에
    // 넘기지 않는다. 실행은 CLEAR 서버 중계 경로가 붙은 뒤의 일이다.
    if (!proposalReady() || proposal.readable === 0 || proposal.serverBinding) return;
    lastSent = proposal;
    // 모듈에는 **정규 문장**을 넘긴다. 원문은 그대로 두고 화면에 나란히 보인다.
    void adapter.request(proposal.canonicalText);
  };

  const edit = (next) => {
    text = next;
    if (explicit) {
      // 입력마다 유료 모델을 부르지 않는다. 이전 제안은 이 원문의 것이 아니니 비우고,
      // 늦게 오는 답도 버린다. 다시 보려면 「제안 생성」 을 눌러야 한다.
      proposeStamp += 1; proposing = false; runWhenReady = null;
      base = emptyProposal(); proposedFor = null; overrides.clear(); recompute();
    } else {
      propose(next);
    }
    onSource(next);
    // 입력이 바뀌면 이전 결과는 이 입력의 것이 아니다.
    adapter.markStale(proposal.canonicalText);
  };

  /** 운영자가 못 읽은 조항을 직접 지정하거나 지운다 */
  const override = (clause, choice) => {
    const key = `${clause.index}:${clause.original}`;
    if (!choice) overrides.delete(key); else overrides.set(key, choice);
    recompute();
    adapter.markStale(proposal.canonicalText);
    render();
  };

  const pick = (preset) => {
    stopEditTimer();
    edit(preset.source);
    // 명시적 제안자면 예문을 넣기만 한다. 생성은 버튼으로.
    if (explicit) { render(); return; }
    // 제안이 비동기면 아직 이전 원문의 제안이다. 준비되면 그때 실행한다.
    if (proposalReady()) run(); else { runWhenReady = preset.source; render(); }
  };

  /** 「제안 생성」 — 지금 원문으로 제안자를 한 번 부른다 */
  const generate = () => {
    if (proposing || typing() || text.trim() === '') return;
    stopEditTimer();
    propose(text);
    render();
  };

  /**
   * 출처 배지. 셋을 섞지 않는다 — 규칙 / Gemini 실제 호출 / Gemini 오프라인 대역.
   * 실제 호출 여부는 제안자 이름이 아니라 **응답의 provenance** 가 말한다.
   */
  const sourceBadge = () => {
    const kind = proposer.kind ?? (proposer.id === 'rules' ? 'rules' : 'model');
    if (kind === 'rules') return el('span.fp-mode', { 'data-mode': 'rules', text: proposer.label });
    const prov = proposal.provenance ?? null;
    if (!prov) return el('span.fp-mode', { 'data-mode': 'model-idle', text: proposer.idleLabel ?? proposer.label });
    return prov.actualModelCall === true
      ? el('span.fp-mode', { 'data-mode': 'model', text: 'Gemini 실제 호출 · 서버 검토 거침' })
      : el('span.fp-mode', { 'data-mode': 'model-fixture', text: 'Gemini 오프라인 응답 대역 · 실제 호출 아님' });
  };

  // ── 원문 칸 — 글자마다 다시 그리지 않는다 ──────────────────────────
  //
  // 전에는 글자 하나마다 제안을 다시 만들고 화면 전체를 다시 그렸다. 그러면
  // textarea 가 새 요소로 바뀌는데, **한글은 조합 중**이라 글자가 깨지거나
  // 안 쳐졌다. 이제 조합 중에는 손대지 않고, 손을 뗀 뒤 잠깐 있다가 한 번만
  // 제안을 갱신한다. 서준형: "원문에 직접 타이핑이 안 된다."
  //
  // 다만 **무효화는 미루지 않는다**(PR #164 리뷰 1). 갱신을 기다리는 250ms 동안
  // 화면의 원문은 새 글인데 제안·진행 중 요청은 이전 원문 그대로라, 그 사이
  // 「이대로 구조화」 를 누르면 이전 조건이 나갔다. 그래서 글자가 바뀌는 순간
  //   - 진행 중이던 비동기 제안을 버리고(늦게 와도 반영 안 됨)
  //   - 어댑터의 진행 중 요청을 무효화하고 이전 결과를 stale 로 돌리고
  //   - 실행 버튼만 그 자리에서 잠근다 — textarea 는 다시 그리지 않는다
  // 실행은 지금 원문으로 만든 제안이 준비된 뒤에만 된다(proposalReady).
  let composing = false;
  let editTimer = null;
  // 실행 버튼. 치는 동안에는 화면을 다시 그리지 않고 이것만 잠근다.
  let runButton = null;
  const typing = () => composing || editTimer !== null;
  const stopEditTimer = () => { if (editTimer !== null) { clearTimeout(editTimer); editTimer = null; } };

  /** 다시 그리지 않고 실행 버튼만 잠근다. 원문 칸(조합 중일 수 있다)은 그대로 둔다 */
  const lockRun = () => {
    if (!runButton) return;
    runButton.setAttribute('disabled', 'disabled');
    runButton.disabled = true;
    const label = runButton.firstChild;
    if (label) label.textContent = '원문 반영 중…';
  };

  /** 원문이 바뀌었다 — 이전 제안과 진행 중 요청은 이 원문의 것이 아니다 */
  const invalidate = () => {
    runWhenReady = null;
    if (proposedFor === null && !proposing) { lockRun(); return; } // 이미 무효화했다
    proposeStamp += 1;      // 진행 중 비동기 제안의 늦은 답을 버린다
    proposing = false;
    proposedFor = null;
    adapter.markStale(null); // 진행 중 요청의 늦은 응답을 버리고 이전 결과를 stale 로
    lockRun();
  };

  const queueEdit = () => {
    stopEditTimer();
    // 조합 중이면 예약하지 않는다. compositionend 가 다시 예약한다.
    if (composing) return;
    editTimer = setTimeout(() => {
      editTimer = null;
      // 예약한 뒤 조합이 시작됐으면 그리지 않는다(compositionstart 가 타이머를
      // 지우지만, 이미 꺼낸 콜백이 늦게 도는 경우까지 막는다).
      if (composing) return;
      edit(text);
      render();
    }, 250);
  };
  const sourceInput = () => {
    const input = el('textarea.fp-input', {
      rows: '3',
      value: text,
      'aria-label': '환급 안내문 원문',
      onInput: (e) => {
        if (e.target.value === text) return;
        // 타이머를 먼저 건다. 그래야 무효화가 부르는 다시 그리기가 미뤄진다.
        text = e.target.value; onSource(text); queueEdit(); invalidate();
      },
    });
    // 조합이 시작되면 이미 예약된 갱신을 거둔다 — 조합 중에 textarea 를 다시 그리면 글자가 깨진다.
    input.addEventListener('compositionstart', () => { composing = true; stopEditTimer(); });
    input.addEventListener('compositionend', () => { composing = false; queueEdit(); });
    return input;
  };

  /**
   * 운영자 직접 보완 상자.
   *
   * 우리 조건이 아닌 조항(출석률 등)은 '조건 아님' 만 고를 수 있다 — 출석률을
   * 활동 완료로 바꿔 넣는 길을 열어 주면 안 된다. 운영자가 이미 붙인 것은
   * 같은 상자로 되돌린다.
   */
  const pickBox = (c) => {
    const key = `${c.index}:${c.original}`;
    return el('label.fp-proposal-pick', {}, [
      el('span.fp-proposal-pick-label', { text: '직접 지정' }),
      el('select', {
        'aria-label': `"${c.original}" 조항을 직접 지정`,
        onChange: (e) => override(c, e.target.value || null),
      }, [
        el('option', { value: '', text: '— 선택 —' }),
        ...MANUAL_CHOICES
          .filter((choice) => !c.notOurs || choice === 'NOT_A_CONDITION')
          .map((choice) => el('option', {
            value: choice,
            selected: overrides.get(key) === choice ? 'selected' : null,
            text: MANUAL_LABEL[choice] ?? choice,
          })),
      ]),
    ]);
  };

  const render = () => {
    // 치는 중(조합 중이거나 갱신 대기 중)에는 다시 그리지 않는다. 어댑터 상태
    // 변화나 늦게 온 응답이 부르는 다시 그리기도 여기서 미룬다 — 갱신 타이머가
    // 돌 때 한 번에 그린다. 대신 실행 버튼은 잠가 둔다.
    if (typing()) { lockRun(); return; }
    // 글자를 칠 때마다 다시 그리는데, 그러면 원문 칸이 새 요소로 바뀌어
    // 커서가 날아간다. 치던 중이면 자리와 커서를 기억했다가 되돌려 준다.
    const prevInput = typeof box.querySelector === 'function' ? box.querySelector('.fp-input') : null;
    const keepCaret = prevInput && typeof document !== 'undefined' && document.activeElement === prevInput
      ? { start: prevInput.selectionStart, end: prevInput.selectionEnd, top: prevInput.scrollTop }
      : null;
    clear(box);
    const s = adapter.current;
    const banner = BANNER[s.state] ?? BANNER[STATE.ERROR];
    const draft = s.payload?.draft ?? null;
    const plan = s.payload?.plan ?? null;
    const check = s.payload?.check ?? null;
    const result = s.payload?.result ?? null;
    // stale 이면 값은 그리되 **지금 입력의 결과가 아니라고** 못 박는다.
    const stale = s.state === STATE.STALE;
    // 넘긴 제안에 자동 검증 미지원 조항이 있었나. 있으면 결과가 성공이어도
    // **전체 환급 정책을 실행 가능으로 보지 않는다** — 본부 결정(11/4).
    const sentUnsupported = (lastSent?.clauses ?? [])
      .filter((c) => c.notOurs && c.source !== 'operator').length;
    // 대안·대체 관계 때문에 보류한 조항도 같다. 나머지를 읽었어도 전체는 아니다(PR #164 리뷰 2).
    const sentHeld = (lastSent?.clauses ?? []).filter((c) => c.held).length;
    const policyBlocked = s.payload !== null && sentUnsupported + sentHeld > 0;

    // 제안을 넷으로 가른다 — 찾은 것 / 조건 관계 때문에 보류한 것 / 조건처럼
    // 썼지만 우리가 못 하는 것 / 그 밖의 읽지 않은 문장. 운영자가 '조건 아님' 으로
    // 표시한 것은 마지막에 둔다 — 자기가 한 표시를 보고 되돌릴 수 있어야 한다.
    const found = proposal.clauses.filter((c) => c.canonical);
    const held = proposal.clauses.filter((c) => c.held);
    const notOurs = proposal.clauses.filter((c) => c.notOurs && c.source !== 'operator');
    const unread = proposal.clauses.filter((c) => !c.canonical && !c.held && !(c.notOurs && c.source !== 'operator'));

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
        sourceInput(),
      ]),

      // ── 읽기 제안 — 모듈에 넘기기 전에 사람이 본다 ─────────────────
      //
      // 조항마다 "이렇게 읽었습니다" 를 보여주고, 못 읽은 것은 못 읽었다고
      // 둔다. 지어내지 않는다. 제안자는 지금 규칙이고 Gemini 포트가 열리면
      // 이 자리만 바뀐다 — 확인 화면은 그대로다.
      text.trim() !== ''
        ? el('section.fp-proposal', { 'aria-label': '읽기 제안' }, [
          el('header.fp-proposal-head', {}, [
            el('span.fp-label', { text: '읽기 제안' }),
            // 출처는 제안자와 응답이 말한다. 규칙 / Gemini 실제 호출 / Gemini 오프라인 대역.
            sourceBadge(),
            proposing ? el('span.fp-proposal-note', { text: '제안을 만드는 중…' }) : null,
          ].filter(Boolean)),
          // ── 찾은 조건 — 이게 본문이다. "N개 찾았습니다, 맞나요?" ───────
          //
          // 실제 안내문은 대부분 조건이 아닌 글이다. 문장마다 "못 읽음" 을 붙여
          // 두면 화면이 심문처럼 보인다. 찾은 것만 보이고, 나머지는 접는다.
          el('p.fp-proposal-ask', {
            text: found.length > 0
              ? `${found.length}개 조건을 찾았습니다 — 맞나요?`
              : held.length > 0
                ? '조건 사이의 관계를 확인해야 해서 자동으로 읽지 않았습니다. 아래 보류한 조항을 봐 주세요.'
                : '조건을 찾지 못했습니다. 아래 "읽지 않은 문장" 에서 직접 지정하실 수 있습니다.',
          }),
          found.length > 0
            ? el('ul.fp-proposal-list', {}, found.map((c) => el('li.fp-proposal-row', {
              'data-read': 'yes', 'data-source': c.source ?? 'none',
            }, [
              el('span.fp-proposal-dst', {}, [
                el('span', { text: CAPABILITY_LABEL[c.capability] ?? c.capability }),
                el('span.fp-proposal-tag', {
                  'data-source': c.source,
                  text: c.source === 'operator' ? '운영자 지정' : c.source === 'rules' ? '규칙' : c.source,
                }),
              ]),
              el('span.fp-proposal-arrow', { 'aria-hidden': 'true', text: '←' }),
              el('span.fp-proposal-src', { text: `"${c.original}"` }),
              c.note ? el('span.fp-proposal-note', { text: c.note }) : null,
              // 운영자가 붙인 것은 되돌릴 수 있어야 한다
              c.source === 'operator' ? pickBox(c) : null,
            ].filter(Boolean))))
            : null,

          // ── 조건 관계(또는·대신) 때문에 보류한 것 — 숨기지 않는다 ──────
          //
          // 지금 형식은 "모두 필요" 만 표현한다. 대안·대체를 그 꼴로 옮기면 조건이
          // 바뀐 채 전부 읽은 것처럼 보인다. 원문과 이유, 문장에 보인 조건을 남기고
          // 직접 지정 상자는 두지 않는다 — 원문을 고쳐 다시 읽게 한다.
          held.length > 0
            ? el('div.fp-proposal-warn', { 'data-role': 'relation-held' }, [
              el('p.fp-proposal-ask', {
                text: `자동 변환 보류 — 조건 관계 확인 필요 · ${held.length}개`,
              }),
              el('ul.fp-proposal-list', {}, held.map((c) => el('li.fp-proposal-row', { 'data-read': 'held' }, [
                el('span.fp-proposal-src', { text: `"${c.original}"` }),
                (c.mentions ?? []).length > 0
                  ? el('span.fp-proposal-dst', {}, [
                    el('span', { text: `문장에 보인 조건: ${c.mentions.map((m) => CAPABILITY_LABEL[m] ?? m).join(' · ')}` }),
                  ])
                  : null,
                // 서버가 보류한 이유. 운영자 지정으로 풀 수 없다 — 원문을 고쳐 다시 생성한다.
                c.serverGuard
                  ? el('span.fp-proposal-dst', {}, [
                    el('span', {
                      text: `서버 보류 사유: ${(c.serverGuard.kinds ?? []).join(' · ')}`
                        + (c.serverGuard.modelCapability ? ` · 모델이 본 조건: ${CAPABILITY_LABEL[c.serverGuard.modelCapability] ?? c.serverGuard.modelCapability}` : ''),
                    }),
                  ])
                  : null,
                el('span.fp-proposal-note', { text: c.note ?? '' }),
              ].filter(Boolean)))),
            ])
            : null,

          // ── 조건처럼 썼지만 우리가 못 하는 것 — 숨기지 않는다 ─────────
          notOurs.length > 0
            ? el('div.fp-proposal-warn', {}, [
              el('p.fp-proposal-ask', {
                // 본부 결정(11/4): '확인 안 하는 것' 이 아니라 **자동 검증 미지원**.
                // 조건이 아닌 게 아니라, 정책 확정 전에 사람이 처리해야 하는 것이다.
                text: `자동 검증 미지원 — 정책 확정 전 처리 필요 · ${notOurs.length}개`,
              }),
              el('ul.fp-proposal-list', {}, notOurs.map((c) => el('li.fp-proposal-row', { 'data-read': 'no' }, [
                el('span.fp-proposal-src', { text: `"${c.original}"` }),
                el('span.fp-proposal-note', { text: c.note ?? '' }),
              ]))),
            ])
            : null,

          // ── 읽지 않은 문장 — 접어 둔다. 빠진 게 있다고 느끼면 펴서 지정 ──
          unread.length > 0
            ? el('details.fp-proposal-rest', {}, [
              el('summary', { text: `조건으로 읽지 않은 문장 ${unread.length}개 보기 · 빠진 조건이 있으면 여기서 직접 지정` }),
              el('ul.fp-proposal-list', {}, unread.map((c) => el('li.fp-proposal-row', {
                'data-read': c.capability ? 'dup' : 'no', 'data-source': c.source ?? 'none',
              }, [
                el('span.fp-proposal-src', { text: `"${c.original}"` }),
                c.capability || c.source === 'operator'
                  ? el('span.fp-proposal-dst', {}, [
                    el('span', { text: c.capability ? '중복' : '조건 아님' }),
                    c.source ? el('span.fp-proposal-tag', { 'data-source': c.source, text: c.source === 'operator' ? '운영자 지정' : '규칙' }) : null,
                  ].filter(Boolean))
                  : null,
                c.note ? el('span.fp-proposal-note', { text: c.note }) : null,
                pickBox(c),
              ].filter(Boolean)))),
            ])
            : null,

          el('p.fp-note', {
            text: found.length > 0
              ? '아래 버튼을 누르면 찾은 조건만 구조화합니다. 읽지 않은 문장은 넘기지 않습니다.'
              : '4가지 조건(강의 활동 완료 · 과제 제출 · 회고 세 항목 · HackerRank 인증서)만 읽을 수 있습니다.',
          }),
        ])
        : null,

      el('div.fp-actions', {}, [
        // 명시적 제안자(Gemini)만 보인다. 입력마다 부르지 않고 이걸 눌러야 한 번 돈다.
        explicit
          ? el('button.fp-btn.fp-btn--primary', {
            type: 'button',
            'data-role': 'generate',
            disabled: proposing || typing() || text.trim() === '' ? 'disabled' : null,
            onClick: generate,
          }, [el('span', { text: proposing ? 'Gemini 에 보내는 중…' : proposal.provenance ? '제안 다시 생성' : '제안 생성 (Gemini)' })])
          : null,
        (runButton = el('button.fp-btn', {
          type: 'button',
          // 지금 원문으로 만든 제안이 아니면 누를 수 없다(PR #164 리뷰 1).
          // 서버 제안은 표시 전용이라 여기서는 실행하지 않는다.
          disabled: s.busy || !proposalReady() || proposal.readable === 0 || proposal.serverBinding ? 'disabled' : null,
          onClick: run,
        }, [el('span', {
          text: proposal.serverBinding ? '표시 전용 · 실행은 서버 중계 연결 뒤'
            : s.busy ? '구조화 중…'
              : !proposalReady() ? (proposing ? '제안을 만드는 중…' : explicit ? '제안 생성 전' : '원문 반영 중…')
                : proposal.complete ? '이대로 구조화'
                  : proposal.readable > 0 ? '읽은 것만 구조화' : '조건 구조화',
        })])),
      ].filter(Boolean)),

      explicit
        ? el('p.fp-note', {
          text: proposal.serverBinding
            ? 'Gemini 제안은 표시 전용입니다. 실행은 CLEAR 서버가 중계하는 경로가 붙은 뒤에 됩니다(계약 미확정). '
              + '서버가 보류한 조항은 직접 지정으로 풀 수 없고, 원문을 고쳐 다시 생성해야 합니다.'
            : '입력할 때마다 부르지 않습니다. 「제안 생성」 을 누를 때 한 번 호출합니다(실제 연결 시 유료). '
              + '원문을 고치면 이전 제안은 비워집니다.',
        })
        : null,

      el('p', {
        class: banner.tone ? `fp-note fp-note--${banner.tone}` : 'fp-note',
        // 미지원이 남은 채 성공했으면 "모두 쪼갰다" 가 아니다. 지원 조건만이다.
        text: policyBlocked && s.state === STATE.SUCCESS
          ? (sentUnsupported > 0 ? '지원 조건만 쪼갰습니다.' : '읽은 조건만 쪼갰습니다. 보류한 조항은 넘기지 않았습니다.')
          : banner.text,
      }),

      // ── 전체 정책 실행 가능 표시 차단 ────────────────────────────
      //
      // 미지원 조항은 구조화에 넘기지 않으므로 아래 ①~④ 는 지원 조건에 대한
      // 것이다. 그걸 "환급 정책 전체가 돌아간다" 로 읽히게 두면 안 된다.
      policyBlocked
        ? el('p.fp-note.fp-note--warn', {
          'data-role': 'policy-blocked',
          text: `${[
            sentUnsupported > 0 ? `자동 검증 미지원 조건 ${sentUnsupported}개` : null,
            sentHeld > 0 ? `조건 관계(또는·대신) 확인이 필요한 조항 ${sentHeld}개` : null,
          ].filter(Boolean).join('와 ')}가 남아 있어 전체 환급 정책을 실행 가능으로 보지 않습니다. `
            + '아래 결과는 읽은 조건에 대한 것이며, 남은 조항은 정책 확정 전 운영자 처리가 필요합니다.',
        })
        : null,

      s.actualUnavailable
        ? el('p.fp-note.fp-note--warn', { text: ERROR_TEXT.ACTUAL_NOT_CONNECTED })
        : null,
      s.error ? el('p.fp-note.fp-note--warn', { text: ERROR_TEXT[s.error.code] ?? s.error.code }) : null,

      // ── ① 조항과 ② 조건 ─────────────────────────────────────────
      ...(draft ? section('① 쪼갠 조항과 ② 매핑한 조건', [
        stale ? el('p.fp-note.fp-note--wait', { text: '아래는 바뀌기 전 원문 기준입니다.' }) : null,
        el('ul.fp-list', {}, (draft.conditions ?? []).map((c, i) => {
          const clause = (draft.clauses ?? []).find((x) => x.id === c.clauseId) ?? null;
          // 모듈이 받은 정규 문장은 보낸 당시 제안의 i 번째 읽힌 조항이다.
          // 학원이 쓴 말과 다르면 **둘 다** 보여준다 — 바꿔치기가 아니라 대응이다.
          const sent = lastSent?.clauses.filter((x) => x.canonical)[i] ?? null;
          const reworded = sent && clause && sent.original !== clause.text;
          return el('li.fp-row', {}, [
            el('p.fp-row-title', { text: CAPABILITY_LABEL[c.capability] ?? c.capability }),
            // 원문 근거. 학원이 쓴 그대로를 먼저, 어느 글자에서 나왔는지 그대로.
            el('blockquote.fp-quote', {
              text: `"${reworded ? sent.original : (clause?.text ?? '')}"`,
            }),
            el('dl.fp-pairs', {}, [
              reworded ? pair('정규 문장으로', clause.text) : null,
              // 운영자가 손으로 붙인 조건은 그렇다고 남긴다. 규칙이 읽은 것과 다르다.
              sent?.source === 'operator' ? pair('누가 읽었나', '운영자가 직접 지정') : null,
              pair('읽는 곳', CAPABILITY_SOURCE[c.capability] ?? '미지정'),
              pair('대상', c.target ?? '미지정'),
              clause ? pair('정규 문장 위치', `${clause.start}–${clause.end}`) : null,
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
        el('ul.fp-list', {}, (plan.steps ?? []).map((st) => {
          const cond = (draft?.conditions ?? []).find((c) => c.id === st.conditionId) ?? null;
          return el('li.fp-row', {}, [
            el('p.fp-row-title', { text: TOOL_LABEL[st.tool] ?? st.tool }),
            el('dl.fp-pairs', {}, [
              pair('읽는 조건', CAPABILITY_LABEL[cond?.capability] ?? cond?.capability ?? '—'),
              // **왜 이 도구인가.** 조건 종류마다 도구가 하나로 정해져 있다.
              // 모델이 고른 것이 아니다 — 오규원: "AI 의 도구 선택과 실제 도구 실행을 구분"
              pair('선택 근거', '조건 종류에 대응하는 읽기 전용 도구입니다. 모델이 고른 것이 아닙니다.'),
              pair('도구 식별자', `${st.tool} · v${st.version}`),
              pair('선행 단계', (st.dependsOn ?? []).length ? st.dependsOn.join(', ') : '없음'),
              pair('실패 시', st.onFailure === 'STOP' ? '중단' : String(st.onFailure)),
            ]),
          ]);
        })),
        check
          ? el('p', {
            class: check.ok ? 'fp-note fp-note--ok' : 'fp-note fp-note--warn',
            text: check.ok
              ? '계획 검사를 통과했습니다. 읽기 전용 도구만, 조건 하나당 한 단계입니다.'
              : `계획 검사에서 보류했습니다 — ${(check.errors ?? []).join(', ')}`,
          })
          : null,
      ]) : []),

      // ── ③½ 도구별 실행 상태 ───────────────────────────────────────
      //
      // 선택(③)과 실행(④)은 다른 단계다. 그 사이에 "지금 어느 도구가 어디까지
      // 갔나" 를 둔다. 합성 모드는 한 번에 끝나 전부 '완료' 로 보이지만, 실제
      // 경로가 붙으면 도구마다 실행 중·실패가 따로 보여야 한다.
      ...(plan ? section('도구별 실행 상태', [
        el('ul.fp-runs', {}, (plan.steps ?? []).map((st) => {
          const obs = (result?.observations ?? []).find((o) => o.stepId === st.id) ?? null;
          const run = runStateOf({ state: s.state, check, obs, stale });
          return el('li.fp-run', { 'data-run': run.key }, [
            el('span.fp-run-tool', { text: TOOL_LABEL[st.tool] ?? st.tool }),
            el('span.fp-run-state', { text: run.label }),
            obs ? el('span.fp-run-note', { text: OBSERVATION_LABEL[obs.state] ?? obs.state }) : null,
          ].filter(Boolean));
        })),
        el('p.fp-note', {
          text: '도구 선택(③)과 실행은 다른 단계입니다. 실행은 공개 합성자료를 로컬에서 읽은 것이며, '
            + '실제 Moodle·Reclaim 조회가 아닙니다.',
        }),
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

    if (keepCaret) {
      const nextInput = box.querySelector('.fp-input');
      if (nextInput) {
        nextInput.focus();
        try { nextInput.setSelectionRange(keepCaret.start, keepCaret.end); } catch { /* 일부 브라우저 */ }
        nextInput.scrollTop = keepCaret.top;
      }
    }
  };

  adapter.subscribe?.(render);
  // 첫 제안은 **render 가 정의된 뒤에** 부른다. 제안자가 비동기(Gemini)면
  // propose 가 곧바로 render() 를 부르는데, 위에 두면 아직 없는 함수를
  // 불러 첫 화면이 깨진다 — 오규원 PR #160 리뷰 1번.
  // 명시적 제안자는 첫 화면에서도 부르지 않는다 — 버튼을 눌러야 한다.
  if (text.trim() !== '' && !explicit) propose(text);
  render();
  return { node: box, render, generate };
}

/**
 * 도구 하나의 실행 상태. 관측 결과가 있으면 완료, 없으면 왜 없는지로 나눈다.
 * 계획 검사에서 막혔으면 실행 자체를 안 한 것이다 — '실패' 가 아니라 '실행 안 함'.
 */
export function runStateOf({ state, check, obs, stale }) {
  if (obs) return stale ? { key: 'stale', label: '완료 · 이전 입력' } : { key: 'done', label: '완료' };
  if (check && check.ok === false) return { key: 'blocked', label: '실행 안 함 · 계획 보류' };
  if (state === STATE.LOADING) return { key: 'running', label: '실행 중' };
  if (state === STATE.ERROR) return { key: 'failed', label: '실패' };
  if (state === STATE.EXPIRED) return { key: 'expired', label: '만료' };
  return { key: 'pending', label: '실행 전' };
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
