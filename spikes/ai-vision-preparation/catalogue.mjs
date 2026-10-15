import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// A case catalogue is not a product policy or an executable gold corpus.
export function summarizeCatalogue(bytes) {
  const value = JSON.parse(bytes.toString('utf8'));
  const groups = {
    historicalPolicy: value.historical.policyCases,
    historicalVision: value.historical.visionCases,
    historicalFlow: value.historical.deterministicAndFlowCases,
    blogPrecheck: value.blogCaseSpecs,
    generalization: value.generalizationCaseSpecs,
  };
  const ids = new Set();
  for (const cases of Object.values(groups)) {
    if (!Array.isArray(cases) || cases.length === 0) throw new Error('INVALID_CASE_CATALOGUE');
    for (const entry of cases) {
      if (!/^[A-Za-z][A-Za-z0-9.-]{0,63}$/.test(entry.id) || ids.has(entry.id)) throw new Error('INVALID_CASE_CATALOGUE');
      ids.add(entry.id);
    }
  }
  if (value.status !== 'SPEC_ONLY_NOT_MODEL_EVALUATED' || value.productContract !== 'NONE'
    || value.readiness.actualModelCall !== false || value.readiness.modelPerformanceMeasured !== false
    || value.readiness.goldLabelsFrozen !== false || value.readiness.fixtureImagesCreated !== false) {
    throw new Error('INVALID_PREPARATION_BOUNDARY');
  }
  return {
    catalogueVersion: value.catalogueVersion,
    catalogueSha256: createHash('sha256').update(bytes).digest('hex'),
    status: 'SPEC_ONLY_NOT_MODEL_EVALUATED',
    caseSpecCounts: Object.fromEntries(Object.entries(groups).map(([key, cases]) => [key, cases.length])),
    totalCaseSpecs: ids.size,
    executableGoldCases: 0,
    actualModelCalls: 0,
    modelPerformanceMeasured: false,
    productContract: 'NONE',
  };
}

export const readCatalogueSummary = () => summarizeCatalogue(readFileSync(new URL('./case-specs.json', import.meta.url)));
