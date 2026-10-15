import { readCatalogueSummary } from './catalogue.mjs';
import { selfCheck } from './self-check.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--self-check')) {
  process.stderr.write('PREPARATION_ARGUMENT_REJECTED\n');
  process.exitCode = 2;
} else {
  const catalogue = readCatalogueSummary();
  const result = args.length ? { catalogue, selfCheck: await selfCheck() } : { catalogue };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.selfCheck?.status === 'FAIL') process.exitCode = 1;
}
