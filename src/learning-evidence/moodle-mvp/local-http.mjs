// Loopback laboratory only. A separate adapter/secret boundary is required for
// HTTPS/academy deployment. No product HTTP/DB route imports this module.
export function createLocalMoodleClient({ baseUrl, courseId, tokenProvider, fetchImpl = fetch, timeoutMs = 10000 }) {
  if (baseUrl !== 'http://127.0.0.1:18765' || !Number.isSafeInteger(courseId) || courseId < 1
    || typeof tokenProvider !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('LOCAL_CLIENT_CONFIG');
  const controller = new AbortController(); let closed = false;
  async function call(method, args, signal) {
    if (closed || signal?.aborted) throw Error('LOCAL_CANCELLED');
    const requestSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
    let response, reader;
    try {
      // Bound credential acquisition too. A late provider result is discarded;
      // provider-owned work cannot be forcibly stopped by this transport.
      const token = await new Promise((resolve, reject) => {
        const abort = () => reject(requestSignal.reason);
        if (requestSignal.aborted) { abort(); return; }
        requestSignal.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => tokenProvider()).then(resolve, () => reject(Error('LOCAL_AUTH_UNAVAILABLE')))
          .finally(() => requestSignal.removeEventListener('abort', abort));
      });
      if (requestSignal.aborted) throw requestSignal.reason;
      if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) throw Error('LOCAL_AUTH_UNAVAILABLE');
      response = await fetchImpl(baseUrl + '/webservice/rest/server.php', { method: 'POST',
        body: new URLSearchParams({ wstoken: token, wsfunction: 'local_clearapi_' + method, moodlewsrestformat: 'json', courseid: String(courseId), ...args }),
        redirect: 'error', credentials: 'omit', cache: 'no-store',
        signal: requestSignal });
      if (response.status === 401) throw Error('LOCAL_AUTH_REJECTED');
      if (response.status === 403) throw Error('LOCAL_ACCESS_REJECTED');
      if (!response.ok) throw Error('LOCAL_SOURCE_UNAVAILABLE');
      reader = response.body.getReader(); let length = 0; const chunks = [];
      for (;;) {
        const r = await reader.read(); if (r.done) break;
        length += r.value.byteLength; if (length > 262144) throw Error('LOCAL_RESPONSE_LIMIT'); chunks.push(r.value);
      }
      const outer = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (outer && typeof outer === 'object') {
        if (outer.errorcode === 'invalidtoken') throw Error('LOCAL_AUTH_REJECTED');
        if (outer.exception) throw Error('LOCAL_ACCESS_REJECTED');
        throw Error('LOCAL_RESPONSE_SHAPE');
      }
      if (typeof outer !== 'string') throw Error('LOCAL_RESPONSE_SHAPE');
      const value = JSON.parse(outer);
      if (value?.error === 'REVISION_CHANGED') throw Error('LOCAL_REVISION_CHANGED');
      return value;
    } catch (e) {
      const safe = new Set(['LOCAL_RESPONSE_LIMIT','LOCAL_RESPONSE_SHAPE','LOCAL_AUTH_REJECTED','LOCAL_ACCESS_REJECTED','LOCAL_REVISION_CHANGED','LOCAL_AUTH_UNAVAILABLE']);
      if (safe.has(e?.message)) throw Error(e.message);
      if (signal?.aborted || closed) throw Error('LOCAL_CANCELLED');
      if (e?.name === 'TimeoutError') throw Error('LOCAL_TIMEOUT');
      throw Error('LOCAL_SOURCE_UNAVAILABLE');
    } finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
  }
  const revision = r => { if (!/^r[1-9][0-9]{0,9}$/.test(r)) throw Error('LOCAL_REVISION'); return r; };
  return {
    profile: 'clear-local-moodle.1', transport: 'LOOPBACK_HTTP_ONLY',
    identity: signal => call('identity', {}, signal),
    readManifest: (r, signal) => call('manifest', { expectedrevision: revision(r) }, signal),
    readPage: (r, pageId, signal) => {
      if (!/^page-[0-9]{1,3}$/.test(pageId)) throw Error('LOCAL_PAGE');
      return call('page', { expectedrevision: revision(r), pageid: pageId }, signal);
    },
    close: async () => { closed = true; controller.abort(); },
  };
}
