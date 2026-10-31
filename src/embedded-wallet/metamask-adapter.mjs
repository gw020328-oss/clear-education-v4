import {getAddress} from 'ethers';
import {bounded, pinnedWallet} from './provider-boundary.mjs';
import {validateConfig} from './config.mjs';
const check = (ok, code) => { if (!ok) throw Error(code); };

// EIP-6963 metadata is a discovery label, never a source of server authority.
// Do not use window.ethereum or choose the first provider/account implicitly.
export function discoverMetaMask(target, onChange) {
  const providers = new Map();
  const announce = event => {
    const {info, provider} = event.detail ?? {};
    if (info?.rdns !== 'io.metamask' || typeof info.uuid !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(info.uuid) || typeof provider?.request !== 'function'
      || typeof provider.on !== 'function' || typeof provider.removeListener !== 'function') return;
    if (providers.has(info.uuid)) return; // Never replace a selected provider.
    providers.set(info.uuid, Object.freeze({id: info.uuid, provider}));
    onChange([...providers.values()]);
  };
  target.addEventListener('eip6963:announceProvider', announce);
  target.dispatchEvent(new Event('eip6963:requestProvider'));
  return () => target.removeEventListener('eip6963:announceProvider', announce);
}

export async function requestMetaMaskAddress(provider, signal) {
  const accounts = await bounded(() => provider.request({method: 'eth_requestAccounts'}), {signal, timeoutMs: 120000});
  check(Array.isArray(accounts) && accounts.length === 1, 'METAMASK_ONE_ACCOUNT_REQUIRED');
  return getAddress(accounts[0]);
}

export async function connectMetaMask({choice, address, readChoice, config, signal, onInvalidate}) {
  const c = validateConfig(config), provider = choice.provider;
  const selected = getAddress(address), chainId = '0x' + c.chainId.toString(16);
  const checkChoice = () => {
    const current = readChoice();
    check(current?.id === choice.id && current.provider === provider && getAddress(current.address) === selected, 'METAMASK_SELECTION_CHANGED');
    return {sdkUserId: 'external:eip6963:' + choice.id, walletId: 'external:' + selected, address: selected, chainId: c.chainId};
  };
  checkChoice();
  const request = (method, params) => bounded(() => provider.request({method, params}), {signal, timeoutMs: 120000});
  try { await request('wallet_switchEthereumChain', [{chainId}]); }
  catch (error) {
    if (error?.code !== 4902) throw error;
    signal?.throwIfAborted(); checkChoice();
    await request('wallet_addEthereumChain', [{chainId, chainName: 'CLEAR Local TEST',
      nativeCurrency: {name: 'Local test Ether', symbol: 'ETH', decimals: 18}, rpcUrls: [c.rpcUrl]}]);
    signal?.throwIfAborted(); checkChoice();
    await request('wallet_switchEthereumChain', [{chainId}]);
  }
  signal?.throwIfAborted();
  const boundary = pinnedWallet({provider, identity: checkChoice(), readIdentity: checkChoice, onInvalidate, timeoutMs: 120000});
  try { await boundary.guard(signal); return boundary; }
  catch (error) { boundary.dispose(); throw error; }
}
