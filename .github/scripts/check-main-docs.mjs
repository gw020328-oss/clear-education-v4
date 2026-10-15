import assert from 'node:assert/strict';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export function assertDocsOnly(paths) {
  assert.ok(paths.length, 'EMPTY_DOCUMENT_CHANGE');
  for (const path of paths) {
    assert.ok(path === 'README.md' || /^docs\/.+\.md$/.test(path), 'NON_DOCUMENT_CHANGE: ' + path);
    assert.ok(!/^docs\/(?:reference|w01|w02)\//.test(path), 'HISTORICAL_RECORD_CHANGE: ' + path);
  }
}

function withoutFences(text) {
  let fence = null;
  return text.split('\n').map(line => {
    const match = line.match(/^\s*(\x60{3,}|~{3,})/);
    if (match) {
      if (!fence) fence = match[1];
      else if (match[1][0] === fence[0] && match[1].length >= fence.length) fence = null;
      return '';
    }
    return fence ? '' : line;
  }).join('\n');
}

function anchors(text) {
  const found = new Set(), counts = new Map();
  for (const match of withoutFences(text).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1].replace(/<[^>]*>/g, '').toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(slug) || 0;
    counts.set(slug, count + 1);
    found.add(slug + (count ? '-' + count : ''));
  }
  for (const match of text.matchAll(/<(?:a|h[1-6])\b[^>]*\b(?:id|name)=["']([^"']+)["']/gi)) found.add(match[1]);
  return found;
}

export async function checkMarkdown(root, files) {
  root = await realpath(root);
  let checked = 0;
  for (const file of files) {
    const source = resolve(root, file);
    const text = withoutFences(await readFile(source, 'utf8'));
    for (const match of text.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\)/g)) {
      const link = match[1].replace(/^<|>$/g, '');
      assert.ok(!/^file:/i.test(link), 'PRIVATE_LINK: ' + file);
      if (/^(?:https?:|mailto:)/i.test(link)) continue;
      assert.ok(!/^[a-z][a-z\d+.-]*:/i.test(link), 'UNSUPPORTED_LINK_SCHEME: ' + file);
      const hash = link.indexOf('#');
      const targetPart = hash < 0 ? link : link.slice(0, hash);
      const fragment = hash < 0 ? '' : decodeURIComponent(link.slice(hash + 1));
      const target = targetPart ? resolve(dirname(source), decodeURIComponent(targetPart)) : source;
      const rel = relative(root, target);
      assert.ok(rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep), 'OUTSIDE_REPOSITORY_LINK: ' + file);
      const actual = await realpath(target).catch(() => { throw new Error('MISSING_LINK: ' + file + ' -> ' + targetPart); });
      const realRel = relative(root, actual);
      assert.ok(realRel !== '..' && !realRel.startsWith('..' + sep) && !realRel.startsWith(sep), 'SYMLINK_OUTSIDE_REPOSITORY: ' + file);
      if (fragment && /\.md$/i.test(target) && (await stat(target)).isFile()) {
        assert.ok(anchors(await readFile(target, 'utf8')).has(fragment), 'MISSING_ANCHOR: ' + file + ' -> ' + link);
      }
      checked++;
    }
  }
  return { files: files.length, localLinks: checked };
}

async function main() {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const root = git('rev-parse', '--show-toplevel');
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  const base = event.pull_request?.base.sha || 'origin/main';
  assert.match(base, /^[A-Za-z0-9_./-]+$/);
  assert.ok(!base.startsWith('-'));
  const changed = git('diff', '--name-only', '-z', base + '...HEAD').split('\0').filter(Boolean);
  const branch = event.pull_request?.head.ref || process.env.GITHUB_REF_NAME || git('branch', '--show-current');
  if (branch.startsWith('codex/public-progress-docs')) assertDocsOnly(changed);
  const files = new Set(['README.md', 'docs/README.md', 'docs/status.md']);
  for (const file of changed) {
    if (/\.md$/i.test(file) && await stat(resolve(root, file)).catch(() => null)) files.add(file);
  }
  console.log(JSON.stringify({ status: 'PASS', ...await checkMarkdown(root, [...files]), documentOnly: branch.startsWith('codex/public-progress-docs') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
