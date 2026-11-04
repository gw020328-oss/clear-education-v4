// 본선 패널 독립 preview
//
// **A 의 core 파일(main/router/student-view/operator-view)을 건드리지 않는다.**
// 이 진입점은 자기 페이지(`web/finals.html`)에서만 돌고, 통합은 A 에게
// 파일별로 인계한 뒤 한다.
//
// 지금은 합성 모드다. 본부가 DTO 를 확정하면 `run` 만 끼우면 된다 —
// 패널은 어댑터만 알지 어디서 오는지 모른다.

import { el, clear } from '../../ui/dom.js';
import { createAdapter, DATA_MODE } from './adapter.js';
import { aiComparePanel } from './ai-compare.js';
import { opsMetricsPanel } from './ops-metrics.js';
import { courseLinkPanel } from './course-link.js';
import { linkFixture, saveFixture } from './course-link-fixtures.js';
import { PRESETS, COMBOS, METRICS_SUMMARY, REAL_NOTICE } from './fixtures.js';

// ④ 는 **실제 공개 안내문**이다. 우리 조건 넷 중 셋만 있고 HackerRank 는
// 없다 — 그래서 셋만 찾는 것이 맞는 동작이다. 합성 결과는 그 셋의 조합
// fixture 에서 나온다.
const DEMO_PRESETS = [
  ...PRESETS.map(({ id, label, source }) => ({ id, label, source })),
  { id: 'real-notice', label: '④ 메타코드 실제 안내문', source: REAL_NOTICE },
];

/**
 * @param {HTMLElement} root
 * @param {object} [options]
 * @param {string} [options.mode]  SYNTHETIC | ACTUAL — 주소의 ?mode= 로도 바꾼다
 */
export function mountFinalsPreview(root, { mode = DATA_MODE.SYNTHETIC } = {}) {
  clear(root);

  // 실제 모드는 **일부러 비워 둔다.** run 이 없으니 어댑터가 '미연결' 로
  // 남고, 합성으로 떨어지지 않는다. 그게 보여야 하는 동작이다.
  // 합성 fixture 는 4조건의 **15가지 조합 전부**에 있다. 읽기 제안이 정규
  // 순서로 만든 문장이면 무엇이든 실제 모듈 결과가 나온다. 읽히지 않은
  // 조항은 애초에 문장에 안 들어가므로 지어낼 일이 없다.
  const ai = createAdapter({
    mode,
    fixture: (input) => COMBOS[input]?.payload ?? null,
    run: null,
  });
  const ops = createAdapter({
    mode,
    fixture: METRICS_SUMMARY,
    run: null,
  });

  // ① 에서 시작한다. 발표자가 ②③ 을 눌러 조건이 느는 것을 보여준다.
  const first = PRESETS[0].source;
  const aiPanel = aiComparePanel({
    adapter: ai,
    source: first,
    presets: DEMO_PRESETS,
  });
  const opsPanel = opsMetricsPanel({ adapter: ops });

  // ── A 운영자 강좌 연결 — B 다음에 온다 ─────────────────────────────
  //
  // 시연 순서: 운영자 로그인 → B 조건 구조화 → A 조건마다 읽을 Moodle 항목
  // 지정 → 저장. 그래서 A 의 칸은 **B 가 찾은 조건**을 따라간다. ① 예문이면
  // 활동·과제 두 칸, ③ 이면 세 칸(HackerRank 는 Moodle 칸이 없다).
  // 여기서는 '아직 미설정' 강좌에서 시작한다 — 운영자가 고르는 장면이다.
  const linkLoad = createAdapter({ mode, fixture: linkFixture, run: null });
  const linkSave = createAdapter({ mode, fixture: saveFixture, run: null });
  const linkPanel = courseLinkPanel({ load: linkLoad, save: linkSave, scenario: 'unset', conditions: [] });
  const followConditions = (snap) => {
    if (snap.state !== 'success' || !snap.payload?.draft?.conditions) return;
    linkPanel.setConditions(snap.payload.draft.conditions.map((c) => c.capability));
  };
  ai.subscribe(followConditions);

  root.append(
    el('header.fp-top', {}, [
      el('h1', { text: 'CLEAR 본선 패널 미리보기' }),
      el('p', {
        text: mode === DATA_MODE.SYNTHETIC
          ? '합성 자료로 그립니다. 실제 모드는 주소에 ?mode=ACTUAL 을 붙여 보세요 — '
            + '연결되지 않았다는 표시가 그대로 나와야 합니다.'
          : '실제 모드입니다. 아직 연결된 경로가 없어 미연결로 표시됩니다. '
            + '합성 자료로 자동 전환하지 않습니다.',
      }),
    ]),
    aiPanel.node,
    el('p.fp-flow', { text: '↓ 조건이 정해지면, 조건마다 Moodle 의 어느 항목을 읽을지 운영자가 지정합니다.' }),
    linkPanel.node,
    opsPanel.node,
  );

  // 합성 모드에서는 바로 한 번 그려 둔다. 심사위원 앞에서 버튼부터 찾지
  // 않도록. 실제 모드는 사람이 눌러야 돈다.
  if (mode === DATA_MODE.SYNTHETIC) {
    void ai.request(first);
    void ops.request();
    void linkLoad.request('unset');
  }

  return { ai, ops, link: linkPanel };
}

if (typeof window !== 'undefined' && document.querySelector('#finals-root')) {
  const picked = new URL(window.location.href).searchParams.get('mode');
  mountFinalsPreview(document.querySelector('#finals-root'), {
    mode: picked === 'ACTUAL' ? DATA_MODE.ACTUAL : DATA_MODE.SYNTHETIC,
  });
}
