// 본선 패널 어댑터 — 화면과 모듈 사이
//
// 패널은 `@clear/preview-core` 나 `operational-metrics` 를 **직접 부르지
// 않는다.** 둘 다 아직 HTTP 계약이 없고, 본부가 DTO 를 확정하기 전이다.
// 엔드포인트를 가정하면 확정 뒤에 화면을 다시 써야 한다.
//
// 그래서 이 파일이 경계다. 패널은 어댑터만 알고, 어댑터가 자료를 어디서
// 가져올지 정한다.
//
// ── 두 가지 모드 ────────────────────────────────────────────────────────
//
//   SYNTHETIC  명시적 합성 fixture. 화면에 **항상 눈에 띄게 표시한다**
//   ACTUAL     본부가 확정한 DTO 를 주입받는다. 아직 미연결이다
//
// **실제 모드에서 합성으로 자동 전환하지 않는다.** 이게 제일 중요하다 —
// 실제 자료가 없으면 빈 상태·오류·로딩을 그대로 보여준다. 가짜로 메우면
// 보는 사람이 그걸 실적으로 읽는다. 지난주 학생 화면에서 같은 실수를 했다.
//
// ── 늦게 온 응답 ────────────────────────────────────────────────────────
//
// 입력이 바뀌면 이전 결과는 stale 이고, **취소되거나 늦게 도착한 응답이
// 최신 입력의 결과를 덮으면 안 된다.** 요청마다 번호를 매겨 자기 번호가
// 아직 최신일 때만 반영한다.

/** 패널이 그릴 수 있는 상태. 본부 지침의 여덟 가지 그대로 */
export const STATE = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  SUCCESS: 'success',
  NEEDS_CLARIFICATION: 'needs_clarification',
  UNSUPPORTED: 'unsupported',
  ERROR: 'error',
  EXPIRED: 'expired',
  STALE: 'stale',
});

export const DATA_MODE = Object.freeze({
  SYNTHETIC: 'SYNTHETIC',
  ACTUAL: 'ACTUAL',
});

/** draft.status → 패널 상태. 모르는 값은 오류로 떨어뜨린다 */
const DRAFT_STATE = Object.freeze({
  READY: STATE.SUCCESS,
  UNSUPPORTED: STATE.UNSUPPORTED,
  NEEDS_CLARIFICATION: STATE.NEEDS_CLARIFICATION,
});

/**
 * 어댑터 하나.
 *
 * @param {object} options
 * @param {string} options.mode              SYNTHETIC | ACTUAL
 * @param {Function|null} options.run        (input, {signal}) => Promise<payload>
 * @param {object|null} options.fixture      합성 모드에서 돌려줄 값
 * @param {Function} options.onChange        상태가 바뀔 때마다
 */
export function createAdapter({
  mode = DATA_MODE.SYNTHETIC, run = null, fixture = null, onChange = () => {},
}) {
  let state = STATE.IDLE;
  let payload = null;
  let error = null;
  let input = null;
  // 요청 번호. 늦게 온 응답을 버리는 데 쓴다.
  let issued = 0;
  let settled = 0;
  // 패널이 여럿 붙을 수 있다. onChange 하나로는 모자란다.
  const listeners = new Set();

  const snapshot = () => Object.freeze({
    state,
    dataMode: mode,
    payload,
    error,
    input,
    // 실제 모드인데 부를 것이 없다 — 화면이 "미연결" 이라고 적는다.
    actualUnavailable: mode === DATA_MODE.ACTUAL && typeof run !== 'function',
    busy: state === STATE.LOADING,
  });

  const settle = (next) => {
    state = next;
    const now = snapshot();
    onChange(now);
    for (const fn of listeners) { try { fn(now); } catch { /* 한쪽이 깨져도 나머지는 그린다 */ } }
  };

  return Object.freeze({
    get current() { return snapshot(); },

    /** 상태가 바뀌면 다시 그린다. 떼어내는 함수를 돌려준다 */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** 입력이 바뀌었다. 이전 결과는 더 이상 이 입력의 것이 아니다 */
    markStale(nextInput) {
      input = nextInput;
      // 아직 아무것도 못 받았으면 stale 이 아니라 그냥 idle 이다.
      if (payload === null && error === null) { settle(STATE.IDLE); return; }
      settle(STATE.STALE);
    },

    reset() {
      payload = null; error = null; issued += 1;
      settle(STATE.IDLE);
    },

    /**
     * 한 번 돌린다.
     *
     * 합성 모드면 fixture 를 그대로 쓴다. 실제 모드인데 `run` 이 없으면
     * **fixture 로 대신하지 않고** 미연결로 남는다.
     */
    async request(nextInput) {
      input = nextInput ?? input;
      const stamp = (issued += 1);

      if (mode === DATA_MODE.SYNTHETIC) {
        // fixture 가 함수면 입력으로 고른다. 예문 세 개처럼 입력마다 답이
        // 다를 때 쓴다. 맞는 것이 없으면 **지어내지 않고** 없다고 한다.
        const picked = typeof fixture === 'function' ? fixture(input) : fixture;
        if (!picked) {
          payload = null; error = { code: 'NO_FIXTURE' };
          settle(STATE.ERROR);
          return snapshot();
        }
        payload = picked; error = null; settled = stamp;
        settle(stateOf(picked));
        return snapshot();
      }

      if (typeof run !== 'function') {
        // **합성으로 떨어지지 않는다.** 연결되지 않았다고 적는다.
        payload = null; error = { code: 'ACTUAL_NOT_CONNECTED' };
        settle(STATE.ERROR);
        return snapshot();
      }

      settle(STATE.LOADING);
      try {
        const got = await run(input);
        // 내가 떠난 사이에 더 새 요청이 나갔으면 **이 결과는 버린다.**
        if (stamp !== issued) return snapshot();
        payload = got; error = null; settled = stamp;
        settle(stateOf(got));
      } catch (caught) {
        if (stamp !== issued) return snapshot();
        payload = null;
        error = { code: caught?.code ?? 'RUN_FAILED', message: caught?.message ?? null };
        settle(caught?.code === 'EXPIRED' ? STATE.EXPIRED : STATE.ERROR);
      }
      return snapshot();
    },

    /** 마지막으로 반영된 요청 번호. 시험이 늦은 응답을 확인하는 데 쓴다 */
    get settledStamp() { return settled; },
  });
}

/** 받은 값에서 상태를 읽는다. draft 가 있으면 그 status 를 따른다 */
function stateOf(value) {
  const status = value?.draft?.status ?? value?.status ?? null;
  if (status === null) return STATE.SUCCESS;
  return DRAFT_STATE[status] ?? STATE.ERROR;
}
