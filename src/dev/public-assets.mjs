import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { check } from './files.mjs';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const landing = Buffer.from('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CLEAR 합성 개발 환경</title><h1>CLEAR 합성 개발 환경</h1><p>HTTPS API와 TEST RPC가 준비됐습니다. 참가자 화면은 web/dist 빌드 후 서버를 다시 시작하면 표시됩니다.</p><p>무가치 TEST 전용이며 실제 자격·지급을 제공하지 않습니다.</p><a href="/__dev/config">공개 개발 설정</a></html>');

// Snapshot only compiled public assets, never a repository/file-system server.
export function loadPublicAssets(webRoot) {
  const result = new Map();
  if (!existsSync(webRoot)) { result.set('/', { body: landing, type: types['.html'] }); return result; }
  const root = resolve(webRoot);
  check(realpathSync(root) === root && lstatSync(root).isDirectory(), 'DEV_WEB_ROOT');
  let total = 0, count = 0;
  function walk(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      check(!entry.isSymbolicLink(), 'DEV_WEB_SYMLINK');
      if (entry.name.startsWith('.')) continue;
      const file = join(directory, entry.name), path = prefix + '/' + entry.name;
      if (entry.isDirectory()) { check(path.split('/').length <= 8, 'DEV_WEB_SIZE'); walk(file, path); }
      else if (entry.isFile() && types[extname(entry.name)]) {
        const size = lstatSync(file).size;
        total += size; count++;
        check(size <= 8 * 1024 * 1024 && total <= 32 * 1024 * 1024 && count <= 512, 'DEV_WEB_SIZE');
        result.set(path, { body: readFileSync(file), type: types[extname(entry.name)] });
      }
    }
  }
  walk(root); check(result.has('/index.html'), 'DEV_WEB_INDEX');
  result.set('/', result.get('/index.html'));
  return result;
}
