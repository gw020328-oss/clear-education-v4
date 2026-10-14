// 참가자 신청 화면 — 진입점
//
// 해시 라우팅을 쓴다. 정적 파일만으로 돌아가므로 서버 rewrite 설정이 필요 없고,
// 후속 C1 의 동일 origin 서버에 그대로 올릴 수 있다.
//
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
import { brandHeader } from './ui/brand.js';
import { STEP_ORDER } from './ui/state-labels.js';

const chrome = document.querySelector('#chrome');
const main = document.querySelector('#main');

function currentScenario() {
  const value = new URL(window.location.href).searchParams.get('scenario');
  return SCENARIO_KEYS.includes(value) ? value : DEFAULT_SCENARIO;
}

let adapter = createSyntheticAdapter({ scenario: currentScenario() });

/** 주소창의 해시를 라우트로 바꾼다 */
function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] !== 'applications' || !parts[1]) return { name: 'list' };
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
const COMPARE = Object.freeze([
  { key: 'stage3', label: '반 A — 조건 둘, 단일 환급률' },
  { key: 'altPath', label: '반 B — 환급률 구간 다섯, 선택 경로' },
]);

function scenarioNote() {
  const info = adapter.describe();
  const current = currentScenario();
  const other = COMPARE.find((c) => c.key !== current);
  const known = COMPARE.some((c) => c.key === current);

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
      }, [el('span', { text: `${other.label} 로 바꿔 보기` })])
      : el('span.muted', { text: ' · 다른 상황은 주소에 ?scenario= 를 붙여 봅니다 (web/README.ko.md)' }),
  ]);
}

function shell(content) {
  clear(main);
  main.append(content);
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

function render() {
  const route = parseRoute();
  if (route.name === 'step') return renderStep(route.id, route.step);
  if (route.name === 'dashboard') return renderDashboard(route.id);
  return renderList();
}

function boot() {
  adapter = createSyntheticAdapter({ scenario: currentScenario() });
  clear(chrome);
  chrome.append(
    syntheticBanner(),
    brandHeader(),
    scenarioNote(),
  );
  if (!window.location.hash) window.location.hash = '#/applications';
  render();
}

window.addEventListener('hashchange', render);
boot();
