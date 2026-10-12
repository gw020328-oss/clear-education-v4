import { keccak256, toUtf8Bytes } from 'ethers';

export class RuleError extends Error {
  constructor(code) { super(code); this.name = 'RuleError'; }
}
export function requireRule(condition, code) {
  if (!condition) throw new RuleError(code);
}
export function exactKeys(value, keys, code) {
  requireRule(value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key)), code);
}
export function identifier(value, code) {
  requireRule(typeof value === 'string', code);
  const normalized = value.normalize('NFC');
  requireRule(/^[\p{L}\p{N}_.-]{1,64}$/u.test(normalized), code);
  return normalized;
}
export function decimal(value, code, max = (1n << 256n) - 1n) {
  requireRule(typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value), code);
  requireRule(BigInt(value) <= max, code);
  return value;
}
export const timestamp = (value, code) => decimal(value, code, 253402300799n);
export function calendarDate(value, code) {
  requireRule(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), code);
  const time = Date.parse(value + 'T00:00:00Z');
  requireRule(Number.isFinite(time) && time >= 0
    && new Date(time).toISOString().slice(0, 10) === value, code);
  return value;
}
export function hash32(value, code) {
  requireRule(typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value), code);
  return value;
}
export function array(value, max, code) {
  requireRule(Array.isArray(value) && value.length <= max
    && Object.keys(value).length === value.length
    && Array.from({ length: value.length }, (_, i) => Object.hasOwn(value, i)).every(Boolean), code);
}

// For schema-validated values only: UTF-16 key order, preserved array order,
// NFC strings normalized by their field validators, safe integer JSON numbers.
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isSafeInteger(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  requireRule(value && Object.getPrototypeOf(value) === Object.prototype, 'CANONICAL_VALUE');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
export const hash = value => keccak256(toUtf8Bytes(canonical(value)));
export function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
