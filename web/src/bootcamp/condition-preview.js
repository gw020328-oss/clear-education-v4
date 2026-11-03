import {el} from '../ui/dom.js';

export function conditionPreview(load = () => import('/assets/condition-preview.js')) {
  const source = el('textarea', {rows: 4, maxlength: 4096});
  source.value = 'Moodle 과제 제출\nHackerRank Python (Basic) 인증서 보유';
  const output = el('div', {'aria-live': 'polite'});
  let revision = 0;
  source.addEventListener('input', () => {
    revision++;
    output.replaceChildren();
  });
  const run = el('button', {type: 'button', text: '합성 미리보기 실행'});
  run.addEventListener('click', async () => {
    const current = ++revision;
    const input = source.value;
    output.textContent = '미리보기 준비 중';
    try {
      const {structureSynthetic, buildPlan, validatePlan, executePublicDemo} = await load();
      if (current !== revision) return;
      const draft = structureSynthetic(input);
      const clauses = new Map(draft.clauses.map(clause => [clause.id, clause]));
      const list = (title, entries) => [
        el('h3', {text: title}),
        el('ul', {}, entries.map(text => el('li', {text}))),
      ];
      output.replaceChildren(...list('구조화한 조건과 원문 근거', draft.conditions.map(condition =>
        `${condition.capability} · ${clauses.get(condition.clauseId).text}`)));
      if (draft.status !== 'READY') {
        output.append(...list('확인이 필요한 문구', draft.questions.map(question =>
          `${clauses.get(question.clauseId).text} · ${question.reason}`)));
        return;
      }
      const plan = buildPlan(draft);
      if (!validatePlan(plan, draft).ok) throw Error('PREVIEW_PLAN_INVALID');
      const result = executePublicDemo(plan, draft);
      output.append(...list('선택 도구', plan.steps.map(step => step.tool)),
        ...list('공개 합성 자료 실행 결과', result.observations.map(item =>
          `${item.tool} · ${item.state === 'MET_IN_PUBLIC_FIXTURE' ? '합성 자료에서 충족' : '확인 불가'}`)));
    } catch {
      if (current === revision) output.textContent = '미리보기를 완료하지 못했습니다. 공개 예문과 화면 연결을 확인하세요.';
    }
  });
  return el('details.bcx-block.panel', {}, [
    el('summary', {text: '조건 변경 미리보기'}),
    el('p', {text: '공개 예문과 합성 자료로 조건·도구를 확인합니다. 실제 AI 호출이나 지급 정책 확정은 이 화면에 포함되지 않습니다.'}),
    el('label', {}, [el('span', {text: '조건 원문'}), source]), run, output,
  ]);
}
