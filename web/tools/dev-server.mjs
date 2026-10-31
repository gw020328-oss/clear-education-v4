// 개발용 정적 파일 서버 — web/ 만 서비스한다
//
// 이 파일은 브라우저 번들에 들어가지 않는다. 개발 중 화면을 열어 보기 위한 Node
// 스크립트이며 제품 경로가 아니다.
//
// 제품은 동일 origin HTTPS 를 쓰고 Host·Origin 검증과 Secure 쿠키를 요구한다
// (docs/current/API_CONTRACT.ko.md). 그 서버는 계획 C1 에서 추가한다. 이 서버는
// API 를 전혀 제공하지 않고, 인증이나 쿠키를 다루지 않으며, 그래서 어떤 검증도
// 약화하지 않는다. loopback 전용이고 바깥 주소에 바인딩하지 않는다.
//
//   ./tools/node web/tools/dev-server.mjs
//   ./tools/node web/tools/dev-server.mjs --port 5050

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}));

function portFromArgv(argv) {
  const index = argv.indexOf('--port');
  if (index === -1) return 5173;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error('--port 는 1024~65535 사이 정수여야 한다');
  }
  return value;
}

/** web/ 밖으로 나가는 경로를 막는다 */
function resolveWithin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  const target = join(WEB_ROOT, relative === sep || relative === '.' ? 'index.html' : relative);
  if (target !== WEB_ROOT && !target.startsWith(WEB_ROOT + sep)) return null;
  return target;
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('GET 만 지원합니다');
    return;
  }

  let target = resolveWithin(request.url ?? '/');
  if (target === null) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('web/ 밖의 경로입니다');
    return;
  }

  try {
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, 'index.html');
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': TYPES.get(extname(target)) ?? 'application/octet-stream',
      'cache-control': 'no-store',
      // 개발 중에도 기본 보호 헤더는 켜 둔다
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('없는 파일입니다');
  }
});

// 직접 실행했을 때만 듣는다. 시험에서 import 해도 서버가 뜨지 않게 한다.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = portFromArgv(process.argv);
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write('web/ 정적 서버: http://127.0.0.1:' + port + '/' + String.fromCharCode(10));
    process.stdout.write('개발용이며 API·인증·쿠키를 제공하지 않습니다. Ctrl+C 로 종료합니다.' + String.fromCharCode(10));
  });
}

export { resolveWithin, portFromArgv, WEB_ROOT };
