import {getAddress} from 'ethers';
import {bounded, pinnedWallet} from './provider-boundary.mjs';
const check = (ok, code) => { if (!ok) throw Error(code); };
const embedded = w => ['privy', 'privy-v2'].includes(w.walletClientType) && w.connectorType === 'embedded';

// SDK v3 legacy wallets may have no server wallet ID. Keep a named, stable
// local locator (user + HD index + address), never invent a server ID.
export function walletChoices(user, wallets) {
  if (!user?.id || !Array.isArray(user.linkedAccounts)) return [];
  return user.linkedAccounts.filter(a => a.type === 'wallet' && a.chainType === 'ethereum' && embedded(a)
    && a.imported === false && a.delegated === false && a.userCanSign === true).flatMap(account => {
    const matches = wallets.filter(w => w.type === 'ethereum' && embedded(w) && w.linked === true
      && w.imported === false && getAddress(w.address) === getAddress(account.address)
      && (account.walletIndex === null || w.walletIndex === account.walletIndex));
    if (matches.length !== 1) return [];
    const address = getAddress(account.address), wallet = matches[0];
    const walletId = account.id || `legacy:${user.id}:${account.walletIndex ?? 'single'}:${address}`;
    return [{sdkUserId: user.id, walletId, address, wallet, walletIdKind: account.id ? 'sdk' : 'local-locator'}];
  });
}

export function selectedIdentity(snapshot, selection, chainId) {
  check(snapshot?.ready && snapshot.authenticated && snapshot.walletsReady, 'PRIVY_NOT_READY');
  const candidates = walletChoices(snapshot.user, snapshot.wallets).filter(c => c.sdkUserId === selection.sdkUserId
    && c.walletId === selection.walletId && c.address === getAddress(selection.address));
  check(candidates.length === 1, 'PRIVY_SELECTION_CHANGED');
  const c = candidates[0];
  check(c.wallet.chainId === `eip155:${chainId}`, 'PRIVY_CHAIN_CHANGED');
  return {sdkUserId: c.sdkUserId, walletId: c.walletId, address: c.address, chainId};
}

// Caller invokes after a displayed choice and explicit network confirmation.
// Never select wallets[0], create an extra wallet, or switch networks implicitly.
export async function connectSelectedWallet({readSnapshot, selection, chainId, signal, onInvalidate, timeoutMs}) {
  const identity = selectedIdentity(readSnapshot(), selection, chainId);
  const choice = walletChoices(readSnapshot().user, readSnapshot().wallets).find(c => c.walletId === selection.walletId && c.address === identity.address);
  const provider = await bounded(() => choice.wallet.getEthereumProvider(), {signal, timeoutMs});
  selectedIdentity(readSnapshot(), selection, chainId);
  const boundary = pinnedWallet({provider, identity, timeoutMs, onInvalidate,
    readIdentity: () => selectedIdentity(readSnapshot(), selection, chainId)});
  try { await boundary.guard(); return boundary; } catch (error) { boundary.dispose(); throw error; }
}
