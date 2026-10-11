export function parseOptions(args, testRoot) {
  const supported = new Set(['--show-browser', '--test-hold', '--test-browser-hold', '--ybm-route', '--public-route-check']);
  if (new Set(args).size !== args.length || args.some(arg => !supported.has(arg))) throw new Error('UNKNOWN_OPTION');
  const network = args.filter(arg => ['--ybm-route', '--public-route-check'].includes(arg));
  const test = args.filter(arg => arg.startsWith('--test-'));
  if (network.length > 1 || test.length > 1 || (network.length && (testRoot || test.length || args.includes('--show-browser')))) throw new Error('MIXED_EXECUTION_MODES');
  if (test.length && !testRoot) throw new Error('TEST_ONLY');
  return {network: network[0], interactive: network[0] === '--ybm-route'};
}
