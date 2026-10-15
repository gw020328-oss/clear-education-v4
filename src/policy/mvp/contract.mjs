import { createHash } from 'node:crypto';
import { canonical, requireRule as check, array } from '../values.mjs';
import { schema } from './schema.mjs';
export { CONTRACT_VERSION, DOCUMENT_LIMITS, schema } from './schema.mjs';
export const digest = (domain, value) => '0x' + createHash('sha256').update(domain + '\n' + canonical(value)).digest('hex');
const keywords = new Set(['$ref', 'anyOf', 'oneOf', 'type', 'const', 'enum', 'properties', 'required', 'additionalProperties',
  'items', 'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'title', 'description']);
export function validateShape(value, spec, root = schema) {
  check(Object.keys(spec).every(k => keywords.has(k)), 'MVP_SCHEMA_KEYWORD');
  if (spec.$ref) {
    const target = root.$defs[spec.$ref.replace('#/$defs/', '')]; check(target, 'MVP_SCHEMA_REF');
    return validateShape(value, target, root);
  }
  if (spec.anyOf || spec.oneOf) {
    const matches = (spec.anyOf ?? spec.oneOf).filter(s => { try { validateShape(value, s, root); return true; } catch (e) { if (e.message !== 'MVP_SCHEMA') throw e; return false; } }).length;
    check(spec.oneOf ? matches === 1 : matches > 0, 'MVP_SCHEMA');
    return value;
  }
  if ('const' in spec) check(value === spec.const, 'MVP_SCHEMA');
  if (spec.enum) check(spec.enum.includes(value), 'MVP_SCHEMA');
  if (spec.type) {
    const matches = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value)
      : type === 'object' ? value && Object.getPrototypeOf(value) === Object.prototype
      : type === 'integer' ? Number.isSafeInteger(value) : typeof value === type;
    check((Array.isArray(spec.type) ? spec.type : [spec.type]).some(matches), 'MVP_SCHEMA');
  }
  if (typeof value === 'number') check(value >= (spec.minimum ?? -Infinity) && value <= (spec.maximum ?? Infinity), 'MVP_SCHEMA');
  if (typeof value === 'string') check(value.length >= (spec.minLength ?? 0) && value.length <= (spec.maxLength ?? Infinity)
    && (!spec.pattern || new RegExp(spec.pattern, 'u').test(value)), 'MVP_SCHEMA');
  if (Array.isArray(value)) {
    array(value, spec.maxItems ?? 10000, 'MVP_SCHEMA'); check(value.length >= (spec.minItems ?? 0), 'MVP_SCHEMA');
    if (spec.uniqueItems) unique(value.map(v => canonical(v)), 'MVP_SCHEMA');
    for (const item of value) validateShape(item, spec.items, root);
  }
  if (spec.properties) {
    check(Object.keys(value).length === spec.required.length && spec.required.every(k => Object.hasOwn(value, k)), 'MVP_SCHEMA');
    for (const [key, child] of Object.entries(spec.properties)) validateShape(value[key], child, root);
  }
  return value;
}
export const validateContract = (name, value) => { check(schema.$defs[name], 'MVP_SCHEMA_REF'); return validateShape(value, schema.$defs[name]); };
export const unique = (values, code = 'MVP_DUPLICATE') => check(new Set(values).size === values.length, code);
export const validPeriod = p => { if (p !== null) check(p.from < p.until, 'MVP_PERIOD'); };
export const same = (a, b) => canonical(a) === canonical(b);
