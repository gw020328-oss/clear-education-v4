import { constants, closeSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function check(condition, code) { if (!condition) throw new Error(code); }
export function privateDirectory(directory) {
  const root = resolve(directory), stat = lstatSync(root);
  check(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(root) === root
    && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700, 'DEV_DIRECTORY');
  return root;
}
export function privateRead(path) {
  const stat = lstatSync(path);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1
    && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o600, 'DEV_FILE');
  return readFileSync(path);
}
export function writeNew(path, value) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, value); } finally { closeSync(fd); }
}
export function writeJson(path, value) { writeNew(path, JSON.stringify(value, null, 2) + '\n'); }
export function readJson(path) { return JSON.parse(privateRead(path)); }

// Fail closed on stale locks; recovery is an explicit command, never a kill.
export function lock(directory) {
  const path = join(directory, 'run.lock');
  try { writeJson(path, { pid: process.pid }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('DEV_LOCKED'); throw error; }
  let released = false;
  return () => { if (!released) { unlinkSync(path); released = true; } };
}
export function unlock(directory) {
  const path = join(privateDirectory(directory), 'run.lock'), owner = readJson(path);
  check(Number.isSafeInteger(owner.pid) && owner.pid > 0, 'DEV_LOCK_INVALID');
  let dead = false;
  try { process.kill(owner.pid, 0); } catch (error) { dead = error.code === 'ESRCH'; }
  check(dead, 'DEV_PROCESS_MAY_BE_RUNNING');
  // A live/reused PID, malformed record, or permission error requires inspection.
  unlinkSync(path);
}
