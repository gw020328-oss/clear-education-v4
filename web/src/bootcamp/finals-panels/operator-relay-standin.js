// 서버 중계 **녹화 재생 대역** — 미리보기 페이지 전용.
//
// 별도 환경(기존 운영자 인증 + B 중계 + D, 오프라인 모델 전송)에서 녹화한 실제 HTTP
// 응답을 fetch 자리에서 돌려준다. 그 위의 transport.js · operator-proposer.js ·
// E 변환기(operator-proposal.js → condition-proposal-v21.js)는 **실제 코드 그대로** 돈다.
//
// 이것은 중계가 아니다. 로그인·강좌 범위·승인을 확인하지 않고, 녹화에 없는 원문은
// 답하지 않는다. 화면에 '녹화 재생 대역' 이라고 같이 적는다.

import { createBootcampTransport } from '../transport.js';
import { createOperatorProposer } from './operator-proposer.js';
import { OPERATOR_RELAY_REPLAY } from './operator-relay-replay.js';

const ORIGIN = 'https://replay.clear.invalid';

/** 녹화 시각 기준 만료를 지금 기준으로 옮긴다. 지문에 들어가지 않는 칸만 */
function shift(body, delta) {
  const copy = structuredClone(body);
  if (Number.isSafeInteger(copy?.expiresAt)) copy.expiresAt += delta;
  if (Number.isSafeInteger(copy?.generated?.expiresAt)) copy.generated.expiresAt += delta;
  return copy;
}

export function createReplayFetch(replay = OPERATOR_RELAY_REPLAY, { now = () => Date.now() } = {}) {
  const byContext = new Map();
  return async (url, init) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body);
    const delta = now() - replay.recordedAt;
    let recorded = null;
    if (path === '/bootcamp/preview/prepare') {
      const entry = replay.entries[body.sourceText];
      // 녹화에 없는 원문. 중계 코드를 지어내지 않고 평범한 404 로 답한다.
      if (!entry) {
        return new Response('{"error":"REPLAY_NOT_RECORDED"}', { status: 404, headers: { 'content-type': 'application/json' } });
      }
      byContext.set(entry.prepare.body.contextRef, entry);
      recorded = entry.prepare;
    } else if (path === '/bootcamp/preview/generate') {
      const entry = byContext.get(body.contextRef);
      if (!entry?.generate) throw new TypeError('REPLAY_NOT_RECORDED');
      // 응답 유실 시연: 보냈지만 답을 못 받은 것처럼 끊는다.
      if (entry.generate.lost) throw new TypeError('REPLAY_RESPONSE_LOST');
      recorded = entry.generate;
    } else {
      throw new TypeError('REPLAY_ROUTE');
    }
    return new Response(JSON.stringify(shift(recorded.body, delta)), {
      status: recorded.status, headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  };
}

/** 미리보기용 운영자 제안자 — 실제 제안자 + 녹화 재생 fetch */
export function createReplayOperatorProposer(options = {}) {
  const request = createBootcampTransport({ origin: ORIGIN, fetchImpl: createReplayFetch(options.replay, options) });
  return createOperatorProposer({
    request,
    appContextRef: () => 'preview-replay',
    label: 'Gemini 제안 · 서버 중계 녹화 재생(대역)',
  });
}

export const REPLAY_TEXTS = Object.freeze(Object.keys(OPERATOR_RELAY_REPLAY.entries));
