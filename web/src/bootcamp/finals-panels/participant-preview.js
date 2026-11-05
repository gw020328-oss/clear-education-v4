// 참가자 진입 화면 독립 preview (`web/participant.html`)
//
// A 의 core 파일(main/router/student-view)을 건드리지 않는다. 통합 때는
// Moodle 버튼이 여는 주소를 이 패널로 보내고, 어댑터 `run` 에 서버 계약을
// 끼운다.

import { el, clear } from '../../ui/dom.js';
import { createAdapter, DATA_MODE } from './adapter.js';
import { participantEntryPanel } from './participant-entry.js';
import { ENTRY_SCENARIOS, entryFixture } from './entry-fixtures.js';

export function mountParticipantPreview(root, { mode = DATA_MODE.SYNTHETIC } = {}) {
  clear(root);
  const adapter = createAdapter({ mode, fixture: entryFixture, run: null });
  const first = ENTRY_SCENARIOS[0].id;
  const panel = participantEntryPanel({
    adapter,
    scenario: first,
    // 정상 연결 뒤 학생이 보는 다음 화면은 환급 조건 카드다(오규원 11/5). 독립 미리보기끼리 잇는다.
    continueHref: './condition-cards.html',
    // 시나리오 칩은 합성에서만. 실제 모드에 보이면 고를 수 있는 것처럼 읽힌다.
    scenarios: mode === DATA_MODE.SYNTHETIC ? ENTRY_SCENARIOS.map(({ id, label }) => ({ id, label })) : [],
  });

  root.append(
    el('header.fp-top', {}, [
      el('h1', { text: 'CLEAR 참가자 연결 상태 미리보기' }),
      el('p', { text: '순서: Moodle 「환급 확인」 → 기존 구글 로그인 → 이 화면 → 수령인 등록부터 기존 흐름.' }),
      el('p', {
        text: mode === DATA_MODE.SYNTHETIC
          ? '합성 시나리오로 그립니다. 실제 모드는 주소에 ?mode=ACTUAL 을 붙여 보세요 — '
            + '연결되지 않았다는 표시가 그대로 나와야 합니다.'
          : '실제 모드입니다. 연결 확인 계약이 아직 없어 미연결로 표시됩니다. 합성으로 자동 전환하지 않습니다.',
      }),
    ]),
    panel.node,
  );

  if (mode === DATA_MODE.SYNTHETIC) void adapter.request(first);
  return { adapter, panel };
}

if (typeof window !== 'undefined' && document.querySelector('#participant-root')) {
  const picked = new URL(window.location.href).searchParams.get('mode');
  mountParticipantPreview(document.querySelector('#participant-root'), {
    mode: picked === 'ACTUAL' ? DATA_MODE.ACTUAL : DATA_MODE.SYNTHETIC,
  });
}
