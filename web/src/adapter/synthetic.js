// 합성 신청 어댑터
//
// contract.js 의 인터페이스를 합성 fixture 로 구현한다.
// 후속 F1 의 HTTP 어댑터는 같은 인터페이스를 createSameOriginApi 위에 구현하며,
// 그때 화면 코드는 고치지 않는다.
//
// 이 어댑터는 네트워크·쿠키·지갑을 전혀 쓰지 않는다. 그래서 인증·Secure cookie·
// origin 검증을 '우회'하는 것이 아니라 아직 '연결하지 않은' 상태다.

import { AdapterError, checkApplicationView, checkPolicyView } from './contract.js';
import { SCENARIOS, DEFAULT_SCENARIO } from '../fixtures/applications.js';
import { SYNTHETIC_POLICY } from '../fixtures/policy.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} [options]
 * @param {string} [options.scenario]  SCENARIOS 의 키
 * @param {boolean} [options.validate] view 계약 검사를 켤지 (기본 true)
 */
export function createSyntheticAdapter({ scenario = DEFAULT_SCENARIO, validate = true } = {}) {
  const chosen = SCENARIOS[scenario] ?? SCENARIOS[DEFAULT_SCENARIO];
  const name = SCENARIOS[scenario] ? scenario : DEFAULT_SCENARIO;

  function guard(items) {
    if (!validate) return items;
    for (const view of items) {
      const problems = checkApplicationView(view);
      if (problems.length > 0) {
        // fixture 가 계약을 어기면 화면에 그리지 않고 먼저 깨뜨린다.
        throw new Error(`fixture 가 API 계약과 다르다: ${problems.join(' / ')}`);
      }
    }
    return items;
  }

  async function settle() {
    await wait(chosen.delayMs ?? 0);
    if (chosen.failWith) throw new AdapterError(chosen.failWith);
  }

  return {
    describe() {
      return {
        mode: 'SYNTHETIC',
        label: chosen.label,
        scenario: name,
        note: '합성 fixture 입니다. 실행 중인 서버에 연결되어 있지 않습니다.',
      };
    },

    async listApplications() {
      await settle();
      return guard(chosen.items.map((view) => ({ ...view })));
    },

    async getApplication(id) {
      await settle();
      const found = chosen.items.find((view) => view.applicationId === id);
      if (!found) throw new AdapterError('API_REQUEST_FAILED');
      return guard([{ ...found }])[0];
    },

    // GET /policies/:policyHash 에 해당한다. 조건 '내용'만 돌려주며
    // 참가자가 그 조건을 충족했는지는 말하지 않는다 — 그 판정은 아직 제품에 없다.
    async getPolicy(policyHash) {
      await settle();
      if (policyHash !== SYNTHETIC_POLICY.policyHash) throw new AdapterError('API_REQUEST_FAILED');
      if (validate) {
        const problems = checkPolicyView(SYNTHETIC_POLICY);
        if (problems.length > 0) throw new Error(`정책 fixture 가 계약과 다르다: ${problems.join(' / ')}`);
      }
      return SYNTHETIC_POLICY;
    },
  };
}

export const SCENARIO_KEYS = Object.keys(SCENARIOS);
