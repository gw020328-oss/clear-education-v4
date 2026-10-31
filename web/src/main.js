// 참가자 신청 화면 — 진입점
//
// 해시 라우팅을 쓴다. 정적 파일만으로 돌아가므로 서버 rewrite 설정이 필요 없고,
// 후속 C1 의 동일 origin 서버에 그대로 올릴 수 있다.
//
//   #/reviews                        운영자 검토 목록 (F3)
//   #/reviews/<id>                   검토 한 건 — 안내문 ↔ AI가 뽑은 값
//   #/applications                   신청 목록 (보통 1건이면 바로 아래로 보낸다)
//   #/applications/<id>              신청 전체 — 상태 · 타임라인 · 조건 · 기한
//   #/applications/<id>/steps/<n>    단계 상세 — 그 단계만
//   ?scenario=stage3 등              합성 상황 선택 (fixtures/applications.js)

import { createSyntheticAdapter, SCENARIO_KEYS } from './adapter/synthetic.js';
import { SCENARIOS, DEFAULT_SCENARIO } from './fixtures/applications.js';
import { el, clear } from './ui/dom.js';
import {
  syntheticBanner, listView, dashboardView, loadingView, emptyView, errorView, notFoundView,
} from './ui/views.js';
import { stepDetailView } from './ui/step-detail.js';
import { reviewSection } from './ui/review-view.js';
import { REVIEWS } from './fixtures/review.js';
import { brandHeader, navBar, pillButton, siteFooter } from './ui/brand.js';
import { STEP_ORDER } from './ui/state-labels.js';
import { studentSection, conditionDetail } from './bootcamp/student-view.js';
import { onboardingView } from './bootcamp/onboarding.js';
import { operatorSection } from './bootcamp/operator-view.js';
import { bootcampView, BOOTCAMP_CASES } from './fixtures/bootcamp.js';
import { createConnection } from './bootcamp/connect.js';
import { world } from './demo/store.js';
import { viewFor, cohortOf, aiApprovalOf } from './demo/view.js';
import { worldApi } from './demo/api.js';
import { demoPanel } from './demo/panel.js';
import { approvalRemainingMs } from './bootcamp/ai-approval.js';
import {
  confirm as worldConfirm, deposit as worldDeposit, toggleCriterion as worldToggle,
  approveAi as worldApproveAi, lookAt, STAGE_LABEL,
} from './demo/world.js';

const chrome = document.querySelector('#chrome');
const main = document.querySelector('#main');

/**
 * 세로 스크롤바 너비를 재서 --sbw 에 넣는다.
 *
 * 풀폭 띠가 `calc(50% - 50vw)` 로 컨테이너를 뚫는데 **100vw 는 스크롤바를
 * 포함한다.** 빼 주지 않으면 띠가 좌우로 그만큼(보통 7px씩) 밀려서, 띠 안의
 * 카드가 히어로보다 왼쪽으로 어긋난다.
 *
 * **내용을 그린 뒤에 재야 한다.** 빈 화면에서 재면 스크롤바가 아직 없어 0 이
 * 나오고, 그 값으로 띠가 어긋난 채 남는다.
 */
function measureScrollbar() {
  const sbw = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--sbw', `${Math.max(0, sbw)}px`);
}

/**
 * 서버 연결. 앱 전체에 하나뿐이다.
 *
 * 라우트를 옮길 때마다 새로 만들면 그때마다 로그인이 풀린다. 상태가 바뀌면
 * 지금 화면만 다시 그린다.
 *
 * 서버가 준 실제 판정이 들어오면 liveView 에 담고, 그게 있으면 fixture 대신
 * 그것을 그린다. **둘을 섞지 않는다** — 섞으면 어느 줄이 진짜인지 알 수 없다.
 */
let liveView = null;
const connection = createConnection({
  onChange: () => { if (parseRoute().name === 'bootcamp') render(); },
});

function currentScenario() {
  const value = new URL(window.location.href).searchParams.get('scenario');
  return SCENARIO_KEYS.includes(value) ? value : DEFAULT_SCENARIO;
}

let adapter = createSyntheticAdapter({ scenario: currentScenario() });

/** 주소창의 해시를 라우트로 바꾼다 */
function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'reviews') return { name: 'review', id: parts[1] ?? null };
  // 부트캠프 — 이슈 #106. 아직 fixture 만 보므로 case/role 을 주소에서 고른다.
  if (parts[0] === 'bootcamp') {
    const base = { name: 'bootcamp', caseId: parts[1] ?? 'live', role: parts[2] ?? 'participant' };
    // 조건 카드의 버튼이 여기로 온다
    if (parts[3] === 'c' && parts[4]) return { ...base, criterionId: parts[4] };
    return base;
  }
  // 주시연은 Python 부트캠프다(이슈 #106). 모르는 주소도 전부 여기로 보낸다.
  //
  // 어학원 반(YBM·시원스쿨)은 **화면에서 완전히 뺀다.** 코드와 fixture 와 시험은
  // 그대로 남겨 보존하지만 화면 어디에서도 링크하지 않고, 주소를 잘못 쳐도
  // 그쪽으로 떨어지지 않는다. 주소를 정확히 아는 사람만 들어갈 수 있다.
  const bootcampHome = { name: 'bootcamp', caseId: 'live', role: 'participant' };
  if (parts.length === 0) return bootcampHome;
  if (parts[0] !== 'applications') return bootcampHome;
  if (!parts[1]) return { name: 'list' };
  if (parts[2] === 'steps' && parts[3]) return { name: 'step', id: parts[1], step: Number(parts[3]) };
  return { name: 'dashboard', id: parts[1] };
}

/**
 * 지금 어떤 합성 상황인지 알리고, 비교할 반을 바꾼다.
 *
 * 이 줄은 합성 데모 배너 영역에 있다. 참가자가 보는 제품에는 없을 자리다.
 * 참가자 화면 안에 반 고르는 칸을 두면, 제품이 반을 고르게 하는 것처럼
 * 보인다. 실제로 수강생은 자기가 신청한 반의 정책을 볼 뿐이다.
 *
 * 그래서 전환 장치는 배너에만 둔다. 같은 화면 코드가 다른 정책을 받아
 * 다르게 그려지는 것을 발표에서 클릭 한 번으로 보이기 위한 것이다.
 */
// 짝을 지어 둔다. 같은 상황에서 반만 바뀌어야 비교가 된다 — 수강 중 화면에서
// 계약 직후 화면으로 건너뛰면 무엇이 달라진 것인지 알 수 없다.
const COMPARE = Object.freeze([
  { key: 'ybm', label: 'YBM 750+ 환급코스', pair: 'altPath' },
  { key: 'altPath', label: '시원스쿨 시작이반 750점반', pair: 'ybm' },
  { key: 'ybmProgress', label: 'YBM 750+ 환급코스', pair: 'altProgress' },
  { key: 'altProgress', label: '시원스쿨 시작이반 750점반', pair: 'ybmProgress' },
]);

/**
 * '로' 와 '으로' 를 고른다.
 *
 * 반 이름이 데이터에서 오므로 조사를 글자로 박아둘 수 없다.
 * 받침이 없거나 ㄹ 받침이면 '로', 그 밖에는 '으로' 다
 * (코스 → 코스로, 750점반 → 750점반으로).
 */
function ro(word) {
  const last = word.codePointAt(word.length - 1);
  if (!Number.isInteger(last) || last < 0xac00 || last > 0xd7a3) return '로';
  const jong = (last - 0xac00) % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}

function scenarioNote() {
  const info = adapter.describe();
  const current = currentScenario();
  const here = COMPARE.find((c) => c.key === current);
  const other = here ? COMPARE.find((c) => c.key === here.pair) : null;
  const known = Boolean(here);

  const goTo = (key) => {
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', key);
    url.hash = '#/applications';
    window.location.href = url.href;
  };

  return el('p.scenario-note', {}, [
    el('span.scenario-tag', { text: '합성 상황' }),
    el('span', { text: info.label }),
    known && other
      ? el('button.scenario-swap', {
        type: 'button',
        title: '같은 화면에 다른 반의 정책을 넣어 봅니다',
        onClick: () => goTo(other.key),
      }, [el('span', { text: `${other.label}${ro(other.label)} 바꿔 보기` })])
      : el('span.muted', { text: ' · 다른 상황은 주소에 ?scenario= 를 붙여 봅니다 (web/README.ko.md)' }),
  ]);
}

function shell(content, { keepScroll = false } = {}) {
  const y = window.scrollY;
  clear(main);
  main.append(content);
  // 시계가 흘러서 다시 그린 것뿐이면 보던 자리에 그대로 둔다. 맨 위로
  // 튕기면 1초마다 화면이 멋대로 움직인다.
  if (keepScroll) { window.scrollTo(0, y); return; }
  // 타임라인 아래쪽 단계를 누르면 상세로 가도 스크롤이 그대로 남는다.
  // 그러면 화면이 안 바뀐 것처럼 보인다. 초점은 preventScroll 로 옮기므로
  // 창을 맨 위로 올리는 것은 여기서 따로 한다.
  window.scrollTo(0, 0);
}

async function renderList() {
  shell(loadingView('신청 목록'));
  try {
    const items = await adapter.listApplications();
    const runtimeReady = await adapter.isRuntimeReady().catch(() => false);
    // 한 반에 신청은 하나다. 1건이면 목록을 거치지 않고 바로 전체 화면으로 보낸다.
    if (items.length === 1) { window.location.hash = `#/applications/${items[0].applicationId}`; return; }
    shell(items.length === 0 ? emptyView() : listView(items, { runtimeReady }));
  } catch (error) {
    shell(errorView(error.code ?? 'API_REQUEST_FAILED', () => renderList()));
  }
}

/** 신청 하나와 그 정책·금고 상태를 함께 읽는다 */
async function loadApplication(id) {
  const view = await adapter.getApplication(id);
  const [policy, runtimeReady] = await Promise.all([
    adapter.getPolicy(view.policyHash).catch(() => null),
    adapter.isRuntimeReady().catch(() => false),
  ]);
  return { view, policy, context: { runtimeReady } };
}

function renderFailure(retry) {
  const known = SCENARIOS[currentScenario()]?.failWith;
  shell(known ? errorView(known, retry) : notFoundView());
}

const focusMain = () => main.focus({ preventScroll: true });

async function renderDashboard(id) {
  shell(loadingView('신청'));
  try {
    const { view, policy, context } = await loadApplication(id);
    shell(dashboardView(view, policy, context));
  } catch { renderFailure(() => renderDashboard(id)); }
  focusMain();
}

async function renderStep(id, step) {
  shell(loadingView('단계'));
  try {
    const { view, context } = await loadApplication(id);
    const state = STEP_ORDER[step - 1];
    if (!state) { shell(notFoundView()); focusMain(); return; }
    shell(stepDetailView(view, state, context));
  } catch { renderFailure(() => renderStep(id, step)); }
  focusMain();
}

/**
 * 운영자 검토 (F3).
 *
 * 참가자 화면과 같은 어댑터를 쓴다. 서버가 생기면 어댑터만 바뀌고 이
 * 화면은 그대로다.
 */
/**
 * 부트캠프 화면 (이슈 #106).
 *
 * 아직 서버에 붙지 않았다. 백엔드가 준 공개 합성 예시를 그린다 —
 * 그 사실을 화면 위에 적는다. fixture 를 연동 완료로 보이게 하지 않는다.
 */
/**
 * 온보딩을 끝냈나.
 *
 * 참가자는 수령 계정까지 등록해야 끝이다 — 멘토 §2 가 요구한 단계다.
 * 운영자는 로그인까지다. 돈을 받는 쪽이 아니라 수령 계정이 없다.
 */
function onboarded(conn, role) {
  const connected = conn.state === 'LIVE' || conn.demo;
  if (!connected) return false;
  return role === 'operator' ? true : Boolean(conn.recipient);
}

// ── 시연 조작판 ────────────────────────────────────────────────────────
//
// 화면 밖(body 바닥)에 붙여 둔다. 라우트마다 다시 그리는 main 안에 넣으면
// 열어 둔 선택 목록이 매번 닫힌다.

let panel = null;
let panelRole = null;

function syncPanel(sim, role, keepScroll) {
  if (!sim) {
    if (panel) { panel.dispose(); panel = null; panelRole = null; }
    document.body.removeAttribute('data-demo-panel');
    return;
  }
  document.body.setAttribute('data-demo-panel', 'yes');
  // 시계만 흐른 것이면 띠를 다시 그리지 않고 시계 글자만 갈아끼운다.
  if (panel && panelRole === role) {
    if (keepScroll) panel.tick(); else panel.render();
    return;
  }
  if (panel) panel.dispose();
  panelRole = role;
  panel = demoPanel({
    world,
    role,
    onRole: (next) => { window.location.hash = `#/bootcamp/live/${next}`; },
  });
  document.body.append(panel.node);
}

/**
 * 상황 목록. 맨 앞이 **라이브 월드**다.
 *
 * 나머지 넷은 고정된 fixture 라 눌러도 아무것도 안 움직인다. 한 장면씩
 * 보여 주기에는 좋지만 "학생이 조건을 채우면 운영자 화면이 바뀐다" 를 못
 * 보여 준다. 그래서 기본은 라이브고, 넷은 비교용으로 남긴다.
 */
const CASE_LABEL = Object.freeze({
  live: '라이브 — 조작판으로 상황을 만듭니다',
  ...BOOTCAMP_CASES,
});

const TESTS = (n) => n * 1_000_000;

/** 월드의 승인 창. 서버가 붙으면 서버 값이 쓰인다 */
const APPROVAL_WINDOW_MS = 120_000;
const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now() : Date.now());

function renderBootcamp(route, { keepScroll = false } = {}) {
  const { caseId, role } = route;
  const cases = Object.keys(CASE_LABEL);
  const pickedCase = cases.includes(caseId) ? caseId : cases[0];
  // 로그인하면 서버가 내 역할을 정한다. 주소로 역할을 고르는 건 fixture 때만이다.
  const before = connection.current;
  const pickedRole = before.state === 'LIVE' && before.role
    ? (before.role === 'PARTICIPANT' ? 'participant' : 'operator')
    : (role === 'operator' ? 'operator' : 'participant');
  // 역할마다 쓰는 지갑이 다르다 — 학생 내장, 운영자 브라우저 확장.
  // 바꾼 뒤에 **다시 읽는다.** 역할이 바뀌면 세션이 끊길 수 있다.
  connection.setRole(pickedRole);
  const conn = connection.current;

  // 서버가 준 판정이 있으면 그것을, 없으면 합성 예시를 그린다.
  const live = conn.state === 'LIVE' && liveView !== null;

  // ── 라이브 월드 ────────────────────────────────────────────────────
  //
  // **서버가 진짜 판정을 주면 쓰지 않는다.** 진짜 기록 위에 조작판을 얹으면
  // 그건 시연이 아니라 기록을 갈아끼우는 것이다.
  const sim = !live && pickedCase === 'live';
  const d = sim ? world.derive() : null;
  const me = sim ? (d.byId.get(world.state.me) ?? d.rows[0]) : null;
  const simApi = sim ? worldApi(world, pickedRole) : null;

  const view = live ? liveView
    : sim ? viewFor(me, pickedRole, d.now)
      : bootcampView(pickedCase, pickedRole);

  syncPanel(sim, pickedRole, keepScroll);

  // 상황이 넷이라 '다른 상황' 하나로는 다 못 본다. 차례로 돌린다.
  const next = cases[(cases.indexOf(pickedCase) + 1) % cases.length];
  const otherRole = pickedRole === 'participant' ? 'operator' : 'participant';

  // 서버가 있으면 진짜 로그인, 없으면 시연용. 둘을 섞지 않는다 —
  // 진짜 서버에 가짜 신원을 밀어 넣으면 시연이 아니라 속임수다.
  const signIn = async () => {
    if (connection.current.state === 'SIGNED_OUT') {
      await connection.signIn();
      liveView = await connection.refresh();
    } else {
      await connection.demoSignIn(pickedRole === 'operator' ? 'wallet' : 'embedded');
    }
    render();
  };
  // 멘토 §2 — 수령인을 체인에 등록한다. 서버에 경로가 생기면 켜진다.
  const registerRecipient = async () => {
    const conn2 = connection.current;
    if (conn2.demo) { await connection.demoRegister(); render(); return; }
    const api = conn2.api;
    if (typeof api?.registerRecipient !== 'function') return;
    try { await api.registerRecipient(conn2.applicationId); } catch { /* 화면이 오류를 띄운다 */ }
    liveView = await connection.refresh();
    render();
  };
  const signOut = async () => { liveView = null; await connection.signOut(); };
  // 라이브 월드에는 새로고침할 서버가 없다. 월드가 이미 바뀌어 있으므로
  // 다시 그리기만 한다 — 없는 서버에 물으러 가면 오류만 돌아온다.
  const onChange = async () => {
    if (sim) { render(); return; }
    liveView = await connection.refresh();
    render();
  };

  shell(el('div', {}, [
    // 합성 상황 전환 줄은 fixture 를 그릴 때만 띄운다. 실제 데이터 위에
    // '다른 상황' 버튼이 있으면 진짜 기록을 갈아끼울 수 있는 것처럼 보인다.
    live || route.criterionId ? null
      // 라이브 월드에는 '상황' 이 없다. 상황을 고르는 게 아니라 **사람을**
      // 고른다 — 고정된 장면 다섯 개를 돌려 보는 것과 다른 물건이다.
      : sim ? el('p.scenario-note', {}, [
        pickedRole === 'participant'
          ? el('span.scenario-tag', { text: '학생' })
          : el('span.scenario-tag', { text: '기수' }),
        pickedRole === 'participant'
          ? el('select.scenario-pick', {
            'aria-label': '볼 학생',
            onChange: (e) => world.apply((st) => lookAt(st, e.target.value)),
          }, d.rows.map((r) => el('option', {
            value: r.id,
            selected: r.id === me.id ? 'selected' : null,
            text: `${r.name} · ${STAGE_LABEL[r.stage]} ${r.metCount}/4`,
          })))
          : el('span', { text: ` ${cohortOf(d).name} · 참여자 ${d.rows.length}명` }),
        el('button.scenario-swap', {
          type: 'button',
          onClick: () => { window.location.hash = `#/bootcamp/${pickedCase}/${otherRole}`; },
        }, [el('span', { text: otherRole === 'operator' ? '운영자로 보기' : '참가자로 보기' })]),
      ])
      : el('p.scenario-note', {}, [
        el('span.scenario-tag', { text: '상황' }),
        el('span', {
          text: pickedRole === 'participant'
            ? ` ${CASE_LABEL[pickedCase]} · 참가자 화면`
            : ' 운영자 화면',
        }),
        // 상황 전환은 학생 화면에서만. 운영자 화면은 기수 하나를 보는 자리라
        // 눌러도 저 아래 두 줄만 바뀌어서 "아무것도 안 바뀌네" 로 읽혔다.
        pickedRole === 'participant'
          ? el('button.scenario-swap', {
            type: 'button',
            onClick: () => { window.location.hash = `#/bootcamp/${next}/${pickedRole}`; },
          }, [el('span', { text: `다음 상황 (${cases.indexOf(pickedCase) + 1}/${cases.length})` })])
          : null,
        el('button.scenario-swap', {
          type: 'button',
          onClick: () => { window.location.hash = `#/bootcamp/${pickedCase}/${otherRole}`; },
        }, [el('span', { text: otherRole === 'operator' ? '운영자로 보기' : '참가자로 보기' })]),
      ]),
    // 학생 화면은 §9.1 의 여덟 구역, 운영자 화면은 §9.2 의 다섯 영역이다.
    // 서로 다른 물건이라 한 컴포넌트에 role 만 바꿔 넣지 않는다.
    // 계정 연결을 아직 안 했으면 온보딩이 첫 화면이다. 역할 둘 다.
    //
    //   참가자  계정 연결 → 로그인 → 수령 계정 등록
    //   운영자  지갑 연결 → 로그인        (돈을 받는 쪽이 아니라 수령 계정 없음)
    //
    // 조건 상세로 바로 들어온 주소는 예외로 둔다 — 링크를 받아서 볼 수 있게.
    !route.criterionId && !onboarded(conn, pickedRole)
      ? onboardingView({
        conn,
        role: pickedRole,
        onStart: signIn,
        onRegister: registerRecipient,
        onTestWallet: () => { connection.useTestWallet(); },
      })
      // 조건 상세로 들어왔으면 그것만 그린다
      : route.criterionId && pickedRole === 'participant'
      ? conditionDetail({
        view,
        criterionId: route.criterionId,
        api: sim ? simApi : conn.api,
        sign: conn.sign,
        blocked: sim || conn.state === 'LIVE' ? null : '서버에 연결되지 않았어요.',
        onChange,
        onBack: () => { window.location.hash = `#/bootcamp/${pickedCase}/${pickedRole}`; },
      })
      : (pickedRole === 'participant' ? studentSection : operatorSection)({
        view,
      // phase 는 서버가 말해 준 것을 쓴다. 없으면 켜지지 않은 것으로 둔다.
      // 라이브 월드는 그 자리에서 처리하므로 막을 이유가 없다.
      phase: sim ? 'ACTIVE_LOCAL_TEST' : (conn.phase ?? 'PREPARED_NOT_ACTIVATED'),
      procedureReady: Boolean(view.procedure?.id),
      api: sim ? simApi : conn.api,
      sign: conn.sign,
      // 운영자 화면은 신청 하나가 아니라 기수를 본다
      cohort: sim ? cohortOf(d) : undefined,
      // 금고 충전은 운영자가 실제로 하는 일이라 제품 버튼이다
      onDeposit: sim && pickedRole === 'operator'
        ? (tests) => world.apply((st) => worldDeposit(st, TESTS(tests)))
        : null,
      // 이번 입력의 AI 승인.
      //
      //   라이브 월드 — 월드가 서버와 같은 모양을 만들고, 승인하면 월드에 적는다
      //   실서버     — 세션이 준 자료를 그대로 쓰고 POST 로 보낸다
      //
      // 남은 시간은 **서버가 준 창에서 조회 뒤 흐른 만큼을 뺀 값**이다.
      // 브라우저가 시작 시각을 정하면 탭을 열어 둔 만큼 창이 늘어난다.
      aiApproval: pickedRole !== 'operator' ? null
        : sim
          ? {
            data: aiApprovalOf(me, d.now, conn.address),
            remainingMs: APPROVAL_WINDOW_MS,
            send: async () => {
              world.apply((st) => worldApproveAi(st, me.id));
              return {
                version: 'clear-normal-ai-approval-receipt.1',
                applicationId: `application-${me.id}`,
                runBindingHash: aiApprovalOf(me, d.now, conn.address).runBindingHash,
                status: 'RECORDED',
                paymentConsentIncluded: false,
              };
            },
          }
          : conn.aiApproval
            ? {
              data: conn.aiApproval,
              remainingMs: approvalRemainingMs(conn.aiApproval, conn.sessionReadAtMs, nowMs()),
              send: (body, key) => connection.approveAi(view.applicationId, body, key),
            }
            : null,
      // 명단에서 그 사람의 판정을 꺼내 준다. 오류 신고가 그걸 쓴다.
      viewOf: sim && pickedRole === 'operator'
        ? (id) => {
          const fresh = world.derive();
          const row = fresh.byId.get(id);
          return row ? viewFor(row, 'operator', fresh.now) : null;
        }
        : null,
      // 명단에서 한 사람을 골라 그 학생 화면으로 넘어간다
      onOpenApplicant: sim && pickedRole === 'operator'
        ? (id) => {
          world.apply((st) => lookAt(st, id));
          window.location.hash = `#/bootcamp/${pickedCase}/participant`;
        }
        : null,
      // 조건 카드를 눌러 충족·미충족을 바꾼다. 라이브 월드에서만.
      onToggle: sim && pickedRole === 'participant'
        ? (criterionId) => world.apply((st) => worldToggle(st, me.id, criterionId))
        : null,
      conn,
        onSignIn: signIn,
        onSignOut: signOut,
        onChange,
        // 운영자가 큐에서 확인을 누른다. 서버가 붙으면 그 신청으로 보낸다.
        onConfirm: async (applicationId) => {
          if (sim) {
            const id = String(applicationId).replace(/^application-/, '');
            world.apply((st) => worldConfirm(st, id, 'operator'));
            return;
          }
          const api = connection.current.api;
          if (typeof api?.consent !== 'function') return;
          try {
            const fresh = await api.view(applicationId);
            await api.consent(applicationId, fresh, 'AGREE', { idempotencyKey: `op-${applicationId}` });
          } catch { /* 화면이 오류를 띄운다 */ }
          liveView = await connection.refresh();
          render();
        },
        onOpen: (id) => { window.location.hash = `#/bootcamp/${pickedCase}/${pickedRole}/c/${id}`; },
      }),
  ]), { keepScroll });
  // 시계가 흘러서 다시 그린 것뿐이면 초점을 뺏지 않는다. 매초 초점이
  // main 으로 끌려가면 아무 버튼도 누를 수 없다.
  if (!keepScroll) focusMain();
  return undefined;
}

async function renderReview(id) {
  shell(loadingView('검토'));
  try {
    if (!id) {
      const items = await adapter.listReviews();
      if (items.length === 0) return shell(el('p.muted', { text: '검토할 안내문이 없습니다.' }));
      window.location.hash = `#/reviews/${items[0].reviewId}`;
      return undefined;
    }
    const view = await adapter.getReview(id);
    shell(el('div', {}, [reviewSection(view), reviewSwitch(view)]));
  } catch { renderFailure(() => renderReview(id)); }
  focusMain();
  return undefined;
}

/** 검토끼리 오가는 줄. 합성 상황이라 참가자 제품에는 없을 자리다 */
function reviewSwitch(view) {
  return el('p.scenario-note', {}, [
    el('span.scenario-tag', { text: '합성 상황' }),
    el('span', { text: '다른 반의 안내문' }),
    ...Object.values(REVIEWS)
      .filter((other) => other.reviewId !== view.reviewId)
      .map((other) => el('button.scenario-swap', {
        type: 'button',
        onClick: () => { window.location.hash = `#/reviews/${other.reviewId}`; },
      }, [el('span', { text: other.title })])),
  ]);
}

/** 탭 제목. 운영자 화면에서 '참가자 신청' 이 떠 있으면 안 된다 */
function setTitle(route) {
  const name = route.name === 'bootcamp'
    ? (route.role === 'operator' ? 'Python 부트캠프 · 운영자' : 'Python 부트캠프')
    : route.name === 'review' ? '운영자 검토' : 'CLEAR';
  document.title = name;
}

function render(opts = {}) {
  const route = parseRoute();
  setTitle(route);
  // 그리고 난 뒤에 다시 잰다. 화면마다 길이가 달라 스크롤바가 생겼다 없어진다.
  requestAnimationFrame(measureScrollbar);
  // 참가자/운영자를 오가면 머리말도 바뀌어야 한다.
  renderChrome();
  if (route.name === 'bootcamp') return renderBootcamp(route, opts);
  if (route.name === 'review') return renderReview(route.id);
  if (route.name === 'step') return renderStep(route.id, route.step);
  if (route.name === 'dashboard') return renderDashboard(route.id);
  return renderList();
}

/** 머리말과 배너. 참가자 화면과 운영자 화면이 다르다 */
function renderChrome() {
  const route = parseRoute();
  const operator = route.name === 'review';
  // 부트캠프 화면은 자기 배너를 직접 그린다. 어학원 반 전환 줄을 여기 두면
  // 주시연 화면 위에 YBM·시원스쿨이 먼저 보인다 — 보존과 기본 노출은 다르다.
  const bootcamp = route.name === 'bootcamp';
  clear(chrome);
  chrome.append(...[
    syntheticBanner(),
    operator
      ? brandHeader({
        who: '운영자 검토',
        tagline: '안내문에서 AI가 뽑은 값을 사람이 확인하는 자리입니다.',
      })
      : bootcamp
        // 부트캠프 화면은 레퍼런스의 고정 상단 바를 쓴다. 로고 + 알약 버튼 하나.
        // 로고만 둔다. 옆에 반 이름을 붙이면 로고가 작아 보이고, 어차피
        // 바로 아래 히어로가 같은 말을 한다.
        ? navBar({
          who: route.role === 'operator' ? '운영자' : null,
          action: connection.current.state === 'LIVE'
            ? pillButton({ label: '로그아웃', ghost: true, onClick: () => { liveView = null; void connection.signOut(); } })
            : connection.current.state === 'SIGNED_OUT'
              ? pillButton({
                label: connection.current.busy ? '여는 중…' : '로그인',
                disabled: connection.current.busy,
                onClick: async () => { await connection.signIn(); liveView = await connection.refresh(); render(); },
              })
              : null,
        })
        : brandHeader(),
    // 반 전환은 어학원 화면의 장치다. 운영자·부트캠프 화면에는 두지 않는다.
    operator || bootcamp ? null : scenarioNote(),
  ].filter(Boolean));
}

function boot() {
  // 바탕 세로 격자는 쓰지 않는다.
  //
  // 레퍼런스에 있어서 가져왔는데, 1px 짜리 선이 화면을 세로로 가르면서
  // 제목과 카드를 관통해 보였다. 색을 중립 회색으로 낮춰도 계속 거슬렸다.
  // 내용에 보태는 게 없는 장식이라 뺀다 — gridLines() 는 남겨 두되 부르지 않는다.

  window.addEventListener('resize', measureScrollbar);
  // 바닥은 한 번만 그린다 — 라우트가 바뀌어도 같은 내용이다.
  const foot = document.querySelector('.foot');
  if (foot) { clear(foot); foot.append(siteFooter()); }
  adapter = createSyntheticAdapter({ scenario: currentScenario() });
  renderChrome();
  // 주시연은 부트캠프다. 어학원 반은 보존하되 첫 화면에 띄우지 않는다.
  if (!window.location.hash) window.location.hash = '#/bootcamp/live/participant';
  render();
  // 서버가 켜져 있는지만 본다. 읽기 한 번이고 지갑 창은 뜨지 않는다.
  // 결과가 오면 onChange 가 화면을 다시 그린다.
  void connection.probe();
}

window.addEventListener('hashchange', () => render());

// 월드가 바뀌면 다시 그린다. 다른 창에서 바뀐 것도 여기로 들어온다.
//
// 시계만 흐른 것이면 스크롤과 초점을 건드리지 않고, 조작판도 그대로 둔다 —
// 매초 전부 다시 그리면 열어 둔 선택 목록이 닫히고 화면이 맨 위로 튄다.
world.subscribe(({ clockOnly }) => {
  if (parseRoute().name !== 'bootcamp') return;
  // 시계만 흘렀다면 조작판 글자는 늘 갱신하되, 화면은 **셀 것이 있을 때만**
  // 다시 그린다. 확인 기간이 하나도 없는데 매초 전체를 다시 그릴 이유가 없다.
  if (clockOnly) {
    panel?.tick();
    if (!world.derive().rows.some((r) => r.stage === 'CONFIRMING')) return;
  }
  // 글을 쓰는 중이면 시계 때문에 다시 그리지 않는다. 다시 그리면 칸이
  // 새 노드로 바뀌면서 커서가 튕겨 나가 한 줄도 못 쓴다. 쓰던 사람이
  // 칸을 떠나면 다음 초에 알아서 따라잡는다.
  const typing = document.activeElement;
  if (clockOnly && typing && /^(TEXTAREA|INPUT)$/.test(typing.tagName)) return;
  render({ keepScroll: clockOnly });
});

boot();
