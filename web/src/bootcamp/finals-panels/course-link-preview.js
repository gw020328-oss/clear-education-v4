// 운영자 강좌 연결 화면 독립 preview (`web/operator-link.html`)
//
// A 의 core 파일(main/router/operator-view)을 건드리지 않는다. 통합 때는
// 운영자 화면의 한 절로 붙이고, 두 어댑터의 `run` 에 서버 계약을 끼운다.

import { el, clear } from '../../ui/dom.js';
import { createAdapter, DATA_MODE } from './adapter.js';
import { courseLinkPanel } from './course-link.js';
import { LINK_SCENARIOS, linkFixture, saveFixture } from './course-link-fixtures.js';

export function mountCourseLinkPreview(root, { mode = DATA_MODE.SYNTHETIC } = {}) {
  clear(root);
  const load = createAdapter({ mode, fixture: linkFixture, run: null });
  const save = createAdapter({ mode, fixture: saveFixture, run: null });
  const first = LINK_SCENARIOS[0].id;
  const panel = courseLinkPanel({
    load,
    save,
    scenario: first,
    scenarios: mode === DATA_MODE.SYNTHETIC ? LINK_SCENARIOS.map(({ id, label }) => ({ id, label })) : [],
  });

  root.append(
    el('header.fp-top', {}, [
      el('h1', { text: 'CLEAR 운영자 강좌 연결 미리보기' }),
      el('p', { text: '운영자가 Moodle 강좌의 항목 중 CLEAR 가 읽을 셋(수강 활동·과제·회고)을 골라 저장하는 화면.' }),
      el('p', {
        text: mode === DATA_MODE.SYNTHETIC
          ? '합성 시나리오로 그립니다. 항목 목록도 합성입니다. 실제 모드는 주소에 ?mode=ACTUAL 을 붙여 보세요 — '
            + '연결되지 않았다는 표시가 그대로 나와야 합니다.'
          : '실제 모드입니다. 강좌 연결 계약이 아직 없어 미연결로 표시됩니다. 합성으로 자동 전환하지 않습니다.',
      }),
    ]),
    panel.node,
  );

  if (mode === DATA_MODE.SYNTHETIC) void load.request(first);
  return { load, save, panel };
}

if (typeof window !== 'undefined' && document.querySelector('#operator-link-root')) {
  const picked = new URL(window.location.href).searchParams.get('mode');
  mountCourseLinkPreview(document.querySelector('#operator-link-root'), {
    mode: picked === 'ACTUAL' ? DATA_MODE.ACTUAL : DATA_MODE.SYNTHETIC,
  });
}
