import {sha256, toUtf8Bytes} from 'ethers';
import {canonical, exactKeys, requireRule as check} from '../policy/values.mjs';

export const MOODLE_COMMAND_VERSION = 'clear-moodle-command.1';
// Only routes whose final durable commit is explicitly fenced are candidates.
export function moodleCommandDigest(input) {
  exactKeys(input, ['method','path','body','idempotencyKey'], 'MOODLE_COMMAND_SHAPE');
  const {method,path,body,idempotencyKey} = input;
  check(method === 'POST' && (path === '/bootcamp/v1/applications'
    || /^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/(recipient-registration|review-consents)$/.test(path)
    || /^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/(reflection-approval|source-session|source-signature|source-refresh)$/.test(path)), 'MOODLE_COMMAND_ROUTE');
  check(body && Object.getPrototypeOf(body) === Object.prototype
    && (typeof idempotencyKey === 'string' && /^[a-z][a-z0-9.-]{0,79}$/.test(idempotencyKey)
      || idempotencyKey === null && /\/(source-session|source-signature)$/.test(path)), 'MOODLE_COMMAND_SHAPE');
  const bytes = canonical({domain:MOODLE_COMMAND_VERSION,method,path,body,idempotencyKey});
  check(toUtf8Bytes(bytes).length <= 8192, 'MOODLE_COMMAND_SIZE');
  return sha256(toUtf8Bytes(bytes)).slice(2);
}
