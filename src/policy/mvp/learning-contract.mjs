import learningSchema from '../../../specs/m1/learning.schema.json' with { type: 'json' };
import { validateShape } from './contract.mjs';
export { learningSchema };
// Shape compatibility only: no source signature, coverage or identity validation.
export function validateLearningFactsShape(value) {
  const { type, properties, required, additionalProperties } = learningSchema;
  return validateShape(value, { type, properties, required, additionalProperties }, learningSchema);
}
