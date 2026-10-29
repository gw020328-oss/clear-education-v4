const check = (ok, code) => { if (!ok) throw Error(code); };
export function validateConfig(input) {
  const c = structuredClone(input), u = new URL(c.origin);
  check(u.protocol === 'https:' && u.hostname === '127.0.0.1' && u.origin === c.origin
    && Number(u.port) >= 1024 && Number(u.port) <= 65535, 'EMBEDDED_ORIGIN');
  check(c.appId === null || typeof c.appId === 'string' && /^[a-z0-9]{10,80}$/.test(c.appId), 'EMBEDDED_APP_ID');
  check(c.redirectUri === c.origin + '/onboarding', 'EMBEDDED_REDIRECT');
  check(['ONBOARDING_ONLY', 'ACTIVE_LOCAL_TEST'].includes(c.phase), 'EMBEDDED_PHASE');
  check(Number.isSafeInteger(c.chainId) && c.chainId > 0, 'EMBEDDED_CHAIN');
  const rpc = new URL(c.rpcUrl);
  check(rpc.hostname === '127.0.0.1' && rpc.protocol === 'http:' && Number(rpc.port) >= 1024
    && rpc.pathname === '/' && !rpc.search && !rpc.hash && !rpc.username && !rpc.password, 'EMBEDDED_RPC');
  check(typeof c.instanceId === 'string' && /^0x[0-9a-f]{64}$/.test(c.instanceId), 'EMBEDDED_INSTANCE');
  return Object.freeze({appId: c.appId, origin: c.origin, redirectUri: c.redirectUri, phase: c.phase,
    chainId: c.chainId, rpcUrl: rpc.origin, instanceId: c.instanceId});
}
export function privyConfig(config, scriptNonce) {
  const c = validateConfig(config);
  const chain = {id: c.chainId, name: 'CLEAR Local TEST', nativeCurrency: {name: 'Local test Ether', symbol: 'ETH', decimals: 18},
    rpcUrls: {default: {http: [c.rpcUrl]}}, testnet: true};
  return {loginMethods: ['google'], defaultChain: chain, supportedChains: [chain], scriptNonce,
    appearance: {walletChainType: 'ethereum-only'}, externalWallets: {disableAllExternalWallets: true},
    embeddedWallets: {ethereum: {createOnLogin: 'off'}, solana: {createOnLogin: 'off'},
      disableAutomaticMigration: true, showWalletUIs: true}};
}
export function embeddedCsp(nonce, rpcUrl) {
  check(/^[A-Za-z0-9+/=]{24,64}$/.test(nonce), 'EMBEDDED_CSP_NONCE');
  const rpc = new URL(rpcUrl);
  check(rpc.protocol === 'http:' && rpc.hostname === '127.0.0.1' && rpc.port && rpc.href === rpc.origin + '/', 'EMBEDDED_RPC');
  // Embedded EOA + Google only. No WalletConnect, public RPC, telemetry,
  // funding, wildcard, unsafe-eval or global inline-style/script allowance.
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'self' 'nonce-${nonce}'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://auth.privy.io ${rpc.origin}; frame-src https://auth.privy.io https://challenges.cloudflare.com; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
}
