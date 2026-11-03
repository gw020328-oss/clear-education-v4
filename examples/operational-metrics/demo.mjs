import { compareReviewWork, summarizeOperationalMetrics } from '../../src/operational-metrics/index.mjs';
import { operationalInput, reviewPairs } from './fixture.mjs';

process.stdout.write(JSON.stringify({
  mode: 'SYNTHETIC',
  summary: summarizeOperationalMetrics(operationalInput),
  comparisons: reviewPairs.map(({ caseRef, ...pair }) => ({ caseRef, ...compareReviewWork(pair) })),
}, null, 2) + '\n');
