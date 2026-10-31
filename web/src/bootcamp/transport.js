// 부트캠프 HTTP transport
//
// 왜 adapter/contract.js 의 AdapterError 를 쓰지 않는가.
//
// 그쪽은 오류를 AUTH_REQUIRED 와 API_REQUEST_FAILED 둘로 **축약한다**. F0 합성
// 화면에는 그 둘이면 충분했다. 그런데 부트캠프 경로는 서버가 보내는 코드 자체가
// 화면이 해야 할 일을 가리킨다 —
//
//   NORMAL_HOST_NOT_ACTIVATED      준비 중. 버튼을 막고 기다린다
//   BC_NORMAL_PROCEDURE_NOT_READY  아직 체인 결합 전. v2 로 조건만 보여준다
//   BC_VIEW_STALE / BC_DECISION_TARGET  판정이 바뀌었다. 다시 조회하고 사용자에게 재확인
//   BC_IDEMPOTENCY_CONFLICT        같은 키로 다른 본문을 보냈다
//
// 이것들을 API_REQUEST_FAILED 하나로 뭉개면 화면이 "실패했습니다" 밖에 못 한다.
// 그래서 코드를 **보존하는** 별도 transport 를 둔다.
//
// 또 하나. 응답 본문의 코드 자리가 다르다 — 기존 API 는 {code}, 부트캠프는 {error} 다.
// 양쪽을 다 읽되 허용 목록에 있는 것만 그 이름으로 넘긴다.
//
// 이 파일이 지키는 경계
//
//   같은 출처만        origin 이 다르면 보내지 않는다
//   쿠키는 브라우저가   credentials:'same-origin'. 토큰을 저장소에 쓰지 않는다
//   쓰기는 자동 재시도 없음   POST 응답이 유실되면 사용자가 같은 키로 다시 확인한다
//   본문 크기 제한      성공 512KiB / 오류 4KiB
//   JSON 만            content-type 이 아니면 거부한다
//   리다이렉트 금지     redirect:'error'

/** 서버가 보내는 코드 중 화면이 뜻을 아는 것. 나머지는 BC_TRANSPORT 로 묶는다 */
export const BOOTCAMP_CODES = Object.freeze(new Set([
  // 인증·권한
  'AUTH_REQUIRED', 'AUTH_CHALLENGE', 'SIGNATURE', 'FORBIDDEN', 'CSRF', 'ORIGIN',
  'AUTH_RATE_LIMIT', 'WALLET_CONTEXT_CHANGED',
  // 호스트 단계
  'NORMAL_HOST_NOT_ACTIVATED', 'BC_NORMAL_PROCEDURE_NOT_READY',
  // 판정 대상
  'BC_VIEW_STALE', 'BC_DECISION_TARGET', 'BC_NOT_FOUND', 'BC_IDEMPOTENCY_CONFLICT',
  // 신청 결합
  'BC_UI_ALREADY_BOUND', 'BC_LIVE_SINGLE_APPLICATION',
  'BC_UI_CONTEXT_CHANGED', 'BC_UI_CONTEXT_UNAVAILABLE',
  // 원천 서명
  'BC_UI_SIGNATURE_NOT_PENDING', 'BC_UI_SIGNATURE_EXPIRED',
  'BC_UI_SIGNATURE_CANCELLED', 'BC_UI_SIGNATURE_REQUEST_USED',
  'BC_UI_PARTICIPANT_REQUIRED',
  // 절차
  'BC_E3_REGISTERED_SNAPSHOT_EXPIRED', 'BC_E3_REVIEW_CLOSED',
]));

/**
 * 요청이 서버에 닿았는지.
 *
 * POST 가 실패했을 때 이것을 모르면 화면이 "다시 보내기" 를 권할 수 없다.
 * 이미 처리됐는데 다시 보내면 중복이고, 안 갔는데 안 보내면 사용자가 멈춘다.
 *
 *   NOT_SENT     보내지 않았다. 그대로 다시 시도해도 된다
 *   HTTP_ERROR   서버가 오류로 답했다. 처리되지 않았다
 *   READ_FAILED  보냈고 응답을 읽다 끊겼다
 *   UNKNOWN      보냈는데 결과를 모른다 — **같은 멱등 키로 조회해 확인한다**
 */
export class BootcampError extends Error {
  /**
   * @param {string} code
   * @param {object} [options]
   * @param {string} [options.outcome]  NOT_SENT / HTTP_ERROR / READ_FAILED / UNKNOWN
   * @param {number|null} [options.status]
   * @param {string|null} [options.detail]  사람이 읽을 추가 설명. 연결 단계에서
   *   "기대한 내보내기 이름과 실제 받은 이름" 같은 것을 담는다. 코드만으로는
   *   무엇이 어긋났는지 알 수 없어 붙인다. 서버 본문을 그대로 넣지 않는다.
   */
  constructor(code, { outcome = 'NOT_SENT', status = null, detail = null } = {}) {
    super(code);
    this.name = 'BootcampError';
    this.code = code;
    this.outcome = outcome;
    this.status = status;
    this.detail = detail;
  }
}

const fail = (code, outcome, status) => new BootcampError(code, { outcome, status });

/** 응답 본문에서 코드를 꺼낸다. 기존 API 는 {code}, 부트캠프는 {error} */
const codeOf = (body) => {
  const raw = body?.error ?? body?.code;
  return typeof raw === 'string' && BOOTCAMP_CODES.has(raw) ? raw : null;
};

/**
 * 같은 출처 JSON transport.
 *
 * @param {object} options
 * @param {string} options.origin        이 출처로만 보낸다
 * @param {() => object} options.headers 지갑·체인·CSRF 헤더. 세션이 준다
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 */
export function createBootcampTransport({
  origin, headers = () => ({}), fetchImpl = globalThis.fetch, timeoutMs = 30000,
}) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1' && base.hostname !== 'localhost') {
    // 로컬 개발 외에는 HTTPS 만. 쿠키가 Secure 라 http 로는 어차피 안 붙는다.
    throw fail('BC_TRANSPORT_ORIGIN');
  }
  if (base.origin !== origin) throw fail('BC_TRANSPORT_ORIGIN');
  if (typeof fetchImpl !== 'function') throw fail('BC_TRANSPORT_CONFIG');

  /**
   * @param {string} path
   * @param {object} [options]
   * @param {'GET'|'POST'} [options.method]
   * @param {object} [options.body]            POST 본문. GET 에 주면 거부한다
   * @param {string} [options.idempotencyKey]  쓰기에만. 같은 키 = 같은 요청
   * @param {AbortSignal} [options.signal]
   */
  return async function request(path, { method = 'GET', body, idempotencyKey, signal } = {}) {
    const url = new URL(path, origin);
    // 경로를 그대로 썼는지 확인한다. query·hash·다른 출처는 보내지 않는다.
    if (url.origin !== origin || url.pathname !== path || url.search || url.hash) {
      throw fail('BC_TRANSPORT_ROUTE');
    }
    if (method === 'GET' && body !== undefined) throw fail('BC_TRANSPORT_ROUTE');

    const deadline = new AbortController();
    const scope = AbortSignal.any([signal, deadline.signal].filter(Boolean));
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    let sent = false;
    let response = null;

    try {
      scope.throwIfAborted();
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const sendHeaders = {
        ...headers(),
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      };
      sent = true;
      response = await fetchImpl(url.href, {
        method,
        body: payload,
        headers: sendHeaders,
        // 쿠키는 브라우저가 붙인다. 우리가 토큰을 들고 있지 않는다.
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: scope,
      });

      const type = response.headers.get('content-type') ?? '';
      if (response.redirected || !/^application\/json(?:;|$)/i.test(type)) {
        throw fail('BC_TRANSPORT_RESPONSE', sent ? 'READ_FAILED' : 'NOT_SENT', response.status);
      }

      // 본문 크기를 제한한다. 오류 본문이 커질 이유가 없다.
      const cap = response.ok ? 512 * 1024 : 4096;
      const text = await readCapped(response, cap, scope);
      const value = JSON.parse(text);
      scope.throwIfAborted();

      if (!response.ok) {
        const code = codeOf(value);
        throw fail(
          code ?? 'BC_TRANSPORT_HTTP',
          // 5xx 는 처리됐는지 알 수 없다. 쓰기였다면 멱등 키로 확인해야 한다.
          method === 'GET' || response.status < 500 ? 'HTTP_ERROR' : 'UNKNOWN',
          response.status,
        );
      }
      return value;
    } catch (error) {
      if (error instanceof BootcampError) throw error;
      const aborted = scope.aborted;
      const cancelled = signal?.aborted;
      throw fail(
        aborted ? (cancelled ? 'BC_TRANSPORT_CANCELLED' : 'BC_TRANSPORT_TIMEOUT') : 'BC_TRANSPORT_FAILED',
        // 보냈는데 결과를 모르는 POST 가 가장 위험하다. 자동 재시도 금지.
        sent && method === 'POST' ? 'UNKNOWN' : sent ? 'READ_FAILED' : 'NOT_SENT',
        response?.status ?? null,
      );
    } finally {
      clearTimeout(timer);
      try { response?.body?.cancel?.().catch?.(() => {}); } catch { /* 이미 닫힘 */ }
    }
  };
}

/** 상한을 넘기면 읽기를 멈춘다. 서버가 큰 본문을 보내도 브라우저가 버티게 */
async function readCapped(response, cap, scope) {
  if (!response.body) return await response.text();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap) throw fail('BC_TRANSPORT_RESPONSE', 'READ_FAILED', response.status);
      chunks.push(value);
      scope.throwIfAborted();
    }
  } finally {
    try { reader.releaseLock(); } catch { /* 이미 해제됨 */ }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
