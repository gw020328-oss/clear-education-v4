// 시연용 Moodle·HackerRank 대역 탭 (web/condition-cards-moodle.html)
//
// 카드의 「강의 열기」 등이 여는 탭이다. 실서버라면 Moodle 의 /mod/... 화면이다.
// 여기서 누른 것은 **원천 기록만** 바꾼다. CLEAR 판정은 서버 대역이 다시 읽어야 바뀐다.

import { el, clear } from '../../ui/dom.js';
import { createDemoServer, demoStore, DEMO_REFLECTION, DEMO_REFLECTION_TEXT } from './demo-server.js';

const pill = (label, onClick) => el('button.pill-btn', { type: 'button', onClick }, [el('span', { text: label })]);

export function mountStandin(root, { criterionId, win = globalThis } = {}) {
  const server = createDemoServer({ store: demoStore(win) });
  let done = null;

  const finish = (text) => { done = text; render(); };

  function body() {
    switch (criterionId) {
      case 'activity-complete':
        return [
          el('h1', { text: '1주차 · 파이썬 시작하기' }),
          el('p', { text: '(시연용 Moodle 강의 페이지 대역) 변수와 자료형, 출력 함수를 소개합니다.' }),
          el('div.pill-row', {}, [pill('끝까지 읽음 — 완료로 표시', () => { server.completeActivity(); finish('Moodle 이 이 강의를 완료로 기록했어요.'); })]),
        ];
      case 'assignment-submitted':
        return [
          el('h1', { text: '실습 과제 · 반복문 구현' }),
          el('p', { text: '(시연용 Moodle 과제 페이지 대역) 파일 없이 제출 버튼만 둡니다.' }),
          el('div.pill-row', {}, [pill('과제 제출', () => { server.submitAssignment(); finish('Moodle 이 제출을 기록했어요.'); })]),
        ];
      case 'reflection-topics': {
        const box = el('textarea', { 'aria-label': '회고', value: DEMO_REFLECTION_TEXT });
        const without = Object.entries(DEMO_REFLECTION).filter(([k]) => k !== 'learning-takeaway').map(([, v]) => v).join('\n');
        return [
          el('h1', { text: '회고 게시판 · 새 글' }),
          el('p', { text: '(시연용 Moodle 회고 작성 화면 대역) 수행 내용 · 문제 해결 과정 · 배운 점을 적습니다.' }),
          box,
          el('div.pill-row', {}, [
            pill('회고 제출', () => { server.submitReflection(box.value); finish('Moodle 게시판에 회고가 올라갔어요.'); }),
            pill('배운 점 빼고 제출 (미충족 시연)', () => { server.submitReflection(without); finish('Moodle 게시판에 회고가 올라갔어요.'); }),
          ]),
        ];
      }
      case 'python-basic-certificate':
        return [
          el('h1', { text: 'HackerRank 로그인 · 증명 동의' }),
          el('p', { text: '(시연용 대역) 실제 흐름에서는 호스트가 연 HackerRank 창에서 로그인하고 Reclaim 증명 생성에 동의합니다.' }),
          el('div.pill-row', {}, [pill('로그인하고 증명에 동의', () => {
            server.consentHr();
            finish('증명 동의를 마쳤어요. 서버가 증명을 검증하면 CLEAR 탭에 결과가 나와요.');
          })]),
        ];
      default:
        return [el('h1', { text: '알 수 없는 항목' })];
    }
  }

  function render() {
    clear(root);
    root.append(el('div.crc-standin', {}, [
      el('p.bcx-warn', { text: '시연 대역 · 실제 Moodle·HackerRank 가 아니에요.' }),
      ...(done
        ? [el('h1', { text: '완료' }), el('p', { text: done }),
          el('p', { text: '이 탭을 닫고 CLEAR 탭으로 돌아가세요. 돌아가면 카드가 서버 판정을 다시 읽어요.' })]
        : body()),
    ]));
  }
  render();
}
