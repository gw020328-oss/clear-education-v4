// 월드를 서버인 척 감싼다
//
// 화면의 패널들은 `api` 라는 물건에 대고 말한다 — `api.view()`, `api.consent()`.
// 월드에 같은 이름의 함수를 달아 주면 **패널을 한 줄도 안 고치고** 라이브로
// 돈다. 패널은 이게 서버인지 월드인지 모른다.
//
// ── 없는 것은 달지 않는다 ───────────────────────────────────────────────
//
// `revalidation` 은 일부러 비워 둔다. 재검증은 AI 가 회고를 다시 읽는 일인데
// 월드에는 AI 가 없다. 결과를 지어내서 "다시 봤더니 충족입니다" 라고 하면
// 그건 시연이 아니라 거짓말이다. 패널이 `typeof api.revalidation === 'function'`
// 로 묻고, 없으면 "이 서버에는 재검증 요청 경로가 아직 없습니다" 라고 적는다.
//
// 시연에서 이의를 푸는 길은 **판정을 바꾸는 것**이다 — 회고 조건을 다시
// 충족으로 돌리면 다툴 것이 없어져 이의가 풀린다. 아무도 안 바꾸면 전체
// 상한(600초)이 지나 미해결 종료가 된다(멘토 §3).
//
// `registerRecipient` 도 비워 둔다. 수령 계정 등록은 체인에 올라가야 의미가
// 있고(멘토 §2), 월드에는 체인이 없다. 온보딩의 시연용 등록이 따로 있다.

import { viewFor } from './view.js';
import { confirm, raiseObjection } from './world.js';

const idOf = (applicationId) => String(applicationId).replace(/^application-/, '');

/**
 * @param {object} world  store.js 의 world
 * @param {'participant'|'operator'} role  이 화면이 누구인가
 */
export function worldApi(world, role) {
  const read = (applicationId) => {
    const d = world.derive();
    const row = d.byId.get(idOf(applicationId));
    return row ? viewFor(row, role, d.now) : null;
  };

  return {
    /** 서버처럼 비동기다. 패널이 await 한다 */
    async view(applicationId) {
      const v = read(applicationId);
      if (!v) throw Object.assign(new Error('없는 신청'), { code: 'NOT_FOUND' });
      return v;
    },

    /**
     * 확인을 보낸다. 누가 보냈는지는 판정에 적힌 역할로 안다.
     *
     * 거절은 받지 않는다. §8.3 에서 확인은 빨리 가는 길이지 거부권이 아니다 —
     * 'AGREE' 가 아닌 값이 오면 아무 일도 하지 않는다.
     */
    async consent(applicationId, fresh, value) {
      if (value !== 'AGREE') return;
      const who = fresh?.role === 'COURSE_OPERATOR' ? 'operator' : 'participant';
      world.apply((s) => confirm(s, idOf(applicationId), who));
    },

    /**
     * 오류 신고. **회고에만 있다.**
     *
     * 출석·과제·인증서는 기계가 읽은 기록이라 틀렸다면 동기화 문제지
     * 다툴 판단이 아니다. 화면이 회고 상세에서만 이 경로를 쓴다.
     */
    async objection(applicationId, fresh, reason) {
      const id = idOf(applicationId);
      // **받을 수 없으면 받을 수 없다고 말한다.** 조용히 아무 일도 안
      // 일어나면 사용자는 접수된 줄 안다.
      const row = world.derive().byId.get(id);
      if (!row) throw Object.assign(new Error('없는 신청'), { code: 'NOT_FOUND' });
      if (row.paidAt) throw Object.assign(new Error(''), { code: 'BC_UI_OBJECTION_TOO_LATE' });
      if (row.terminated) throw Object.assign(new Error(''), { code: 'BC_UI_PROCEDURE_ENDED' });
      if (row.objection) throw Object.assign(new Error(''), { code: 'BC_UI_OBJECTION_EXISTS' });
      if (row.revalidationUsed >= 1) throw Object.assign(new Error(''), { code: 'BC_UI_REVALIDATION_EXHAUSTED' });
      const by = role === 'operator' ? 'COURSE_OPERATOR' : 'PARTICIPANT';
      world.apply((s) => raiseObjection(s, id, String(reason).trim(), undefined, by));
    },

    /** 멱등 재조회. 월드는 즉시 처리하므로 다시 읽기만 한다 */
    async operation(applicationId) {
      return read(applicationId);
    },
  };
}
