import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

export const project = fileURLToPath(new URL('../../', import.meta.url));
export const stage = resolve(project, 'stage13d');
export const encode = value => JSON.stringify(value, null, 2) + '\n';
export const read = path => JSON.parse(fs.readFileSync(resolve(project, path), 'utf8'));
export const text = path => fs.readFileSync(resolve(project, path), 'utf8');
export const sha = value => createHash('sha256').update(value).digest('hex');
export const fileSha = path => sha(fs.readFileSync(resolve(project, path)));
export const need = (ok, code) => {if (!ok) throw new Error(code);};
export function outputPath(path) {
  const target = resolve(stage, path);
  need(target.startsWith(stage + '/'), 'OUTPUT_SCOPE');
  return target;
}
// Immutable runtime artifacts (including byte-exact response bodies), not source edits.
export function save(path, value) {
  const target = outputPath(path);
  fs.mkdirSync(dirname(target), {recursive: true});
  const bytes = Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : encode(value);
  fs.writeFileSync(target, bytes, {flag: 'wx', mode: 0o600});
}
export const exists = path => fs.existsSync(outputPath(path));
export function listFiles(dir = project) {
  const result = [];
  function walk(p) {for (const entry of fs.readdirSync(p, {withFileTypes: true})) {
    const target = resolve(p, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile() || entry.isSymbolicLink() && fs.statSync(target).isFile()) result.push(target.slice(project.length));
  }}
  walk(dir); return result.sort();
}
export function priorIntegrity() {
  const prior = read('stage13d/artifacts/prior-files.json');
  const changed = Object.entries(prior.files).filter(([path, hash]) => !fs.existsSync(resolve(project, path)) || fileSha(path) !== hash).map(([path]) => path);
  const symlinksChanged = Object.entries(prior.symlinks).filter(([path, target]) => !fs.lstatSync(resolve(project, path)).isSymbolicLink() || fs.readlinkSync(resolve(project, path)) !== target).map(([path]) => path);
  const extras = listFiles().filter(path => !path.startsWith('stage13d/') && !Object.hasOwn(prior.files, path));
  return {passed: !changed.length && !symlinksChanged.length && !extras.length, checked: Object.keys(prior.files).length, changed, symlinksChanged, newFilesOutsideStage13d: extras};
}
export function checkManifest(path) {
  const entries = text(path).trim().split('\n').map(line => {const n = line.indexOf('  '); return {sha256: line.slice(0,n), path: line.slice(n+2)};});
  need(entries.every(entry => fileSha(entry.path) === entry.sha256), 'LOCK_HASH_MISMATCH');
  return entries;
}
