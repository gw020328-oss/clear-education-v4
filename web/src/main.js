// 참가자 신청 화면 — 진입점
//
// 해시 라우팅을 쓴다. 정적 파일만으로 돌아가므로 서버 rewrite 설정이 필요 없고,
// 후속 C1 의 동일 origin 서버에 그대로 올릴 수 있다.
//
//   #/applications            목록
//   #/applications/<id>       상세
//   ?scenario=empty 등        합성 시나리오 선택 (fixtures/applications.js)

import { createSyntheticAdapter, SCENARIO_KEYS } from './adapter/synthetic.js';
import { SCENARIOS } from './fixtures/applications.js';
import { el, clear } from './ui/dom.js';
import {
  syntheticBanner, listView, detailView, loadingView, emptyView, errorView, notFoundView,
} from './ui/views.js';

const chrome = document.querySelector('#chrome');
const main = document.querySelector('#main');

function currentScenario() {
  const value = new URL(window.location.href).searchParams.get('scenario');
  return SCENARIO_KEYS.includes(value) ? value : 'default';
}

let adapter = createSyntheticAdapter({ scenario: currentScenario() });

/** 주소창의 해시를 라우트로 바꾼다 */
function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] !== 'applications') return { name: 'list' };
  return parts[1] ? { name: 'detail', id: parts[1] } : { name: 'list' };
}

function scenarioPicker() {
  const scenario = currentScenario();
  const select = el('select', {
    id: 'scenario',
    onChange: (event) => {
      const url = new URL(window.location.href);
      url.searchParams.set('scenario', event.target.value);
      url.hash = '#/applications';
      window.location.href = url.href;
    },
  }, SCENARIO_KEYS.map((key) => el('option', {
    value: key,
    selected: key === scenario,
    text: SCENARIOS[key].label,
  })));

  return el('div.picker', {}, [
    el('label', { for: 'scenario', text: '합성 시나리오' }),
    select,
    el('p.muted', { text: adapter.describe().note }),
  ]);
}

function shell(content) {
  clear(main);
  main.append(content);
}

async function renderList() {
  shell(loadingView('신청 목록'));
  try {
    const items = await adapter.listApplications();
    shell(items.length === 0 ? emptyView() : listView(items));
  } catch (error) {
    shell(errorView(error.code ?? 'API_REQUEST_FAILED', () => renderList()));
  }
}

async function renderDetail(id) {
  shell(loadingView('신청 상세'));
  try {
    const view = await adapter.getApplication(id);
    shell(detailView(view));
  } catch (error) {
    const known = SCENARIOS[currentScenario()].failWith;
    shell(known ? errorView(known, () => renderDetail(id)) : notFoundView());
  }
  // 라우트가 바뀌면 본문 처음으로 초점을 옮긴다 (키보드 사용)
  main.focus({ preventScroll: true });
}

function render() {
  const route = parseRoute();
  if (route.name === 'detail') return renderDetail(route.id);
  return renderList();
}

function boot() {
  adapter = createSyntheticAdapter({ scenario: currentScenario() });
  clear(chrome);
  chrome.append(
    syntheticBanner(),
    el('header.head', {}, [
      el('h1', { text: 'CLEAR 참가자 신청' }),
      el('p.muted', { text: '신청 상태를 확인하는 화면입니다. 로그인·서명·거래는 후속 작업에서 붙습니다.' }),
    ]),
    scenarioPicker(),
  );
  if (!window.location.hash) window.location.hash = '#/applications';
  render();
}

window.addEventListener('hashchange', render);
boot();
