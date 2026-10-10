import { Contract, getAddress, keccak256 } from 'ethers';
import { AMOUNT, need, validateAcceptance, validateEvidence, validateTrust } from './evidence.mjs';

// Fixed application ABI, never loaded from the evidence file.
export const vaultAbi = [
  'function token() view returns (address)', 'function sponsor() view returns (address)',
  'function verifier() view returns (address)', 'function termsHash() view returns (bytes32)',
  'function start() view returns (uint256)', 'function due() view returns (uint256)',
  'function claimUntil() view returns (uint256)', 'function amount() view returns (uint256)',
  'function totalReserved() view returns (uint256)', 'function enrolled(address) view returns (bool)',
  'function settled(address) view returns (bool)', 'function acceptedAt(address) view returns (uint64)',
  'function consentDigest(address) view returns (bytes32)',
  'function enroll(address learner,uint64 time,bytes consent)',
  'function claim(address learner,(bytes32 termsHash,address learner,uint32 session,uint64 completedAt)[] receipts,bytes[] signatures)',
  'event Paid(address indexed learner,address indexed submitter,uint256 amount)'
];
export const tokenAbi = ['function balanceOf(address) view returns (uint256)'];
export async function chainTime(provider) {
  return Number((await provider.send('eth_getBlockByNumber', ['latest', false])).timestamp);
}
export async function verifyDeployment(provider, trusted) {
  validateTrust(trusted);
  const chainId = Number(await provider.send('eth_chainId', []));
  need(chainId === 31337 && chainId === trusted.domain.chainId, 'CHAIN_MISMATCH');
  const genesis = await provider.send('eth_getBlockByNumber', ['0x0', false]);
  const deployment = await provider.send('eth_getBlockByNumber', ['0x' + trusted.deployment.blockNumber.toString(16), false]);
  need(genesis?.hash === trusted.deployment.genesisHash && deployment?.hash === trusted.deployment.blockHash, 'DEPLOYMENT_MISMATCH');
  const vaultCode = await provider.send('eth_getCode', [trusted.domain.verifyingContract, 'latest']);
  const tokenCode = await provider.send('eth_getCode', [trusted.terms.token, 'latest']);
  need(vaultCode !== '0x' && keccak256(vaultCode) === trusted.deployment.vaultCodeHash, 'VAULT_CODE_MISMATCH');
  need(tokenCode !== '0x' && keccak256(tokenCode) === trusted.deployment.tokenCodeHash, 'TOKEN_CODE_MISMATCH');
  const vault = new Contract(trusted.domain.verifyingContract, vaultAbi, provider);
  for (const [method, expected] of Object.entries({ token: trusted.terms.token, sponsor: trusted.terms.sponsor, verifier: trusted.terms.issuer })) {
    need(getAddress(await vault[method]()) === getAddress(expected), 'CONTRACT_CONFIG_MISMATCH');
  }
  need(await vault.termsHash() === trusted.termsHash, 'CONTRACT_CONFIG_MISMATCH');
  for (const k of ['start', 'due', 'claimUntil', 'amount']) need(await vault[k]() === BigInt(trusted.terms[k]), 'CONTRACT_CONFIG_MISMATCH');
  return { vault, token: new Contract(trusted.terms.token, tokenAbi, provider) };
}
export async function enrollFunded(provider, trusted, sponsor, acceptance, recipient) {
  const digest = validateAcceptance(acceptance, trusted, recipient, await chainTime(provider), { registration: true });
  const { vault, token } = await verifyDeployment(provider, trusted);
  need(getAddress(await sponsor.getAddress()) === getAddress(trusted.terms.sponsor), 'SPONSOR');
  const before = await token.balanceOf(vault.target);
  const receipt = await (await vault.connect(sponsor).enroll(recipient, acceptance.acceptedAt, acceptance.signature)).wait();
  need(receipt.status === 1 && await vault.enrolled(recipient), 'ENROLLMENT_NOT_CONFIRMED');
  need(await vault.consentDigest(recipient) === digest, 'CONSENT_NOT_RECORDED');
  const after = await token.balanceOf(vault.target);
  need(after >= before + AMOUNT && after >= await vault.totalReserved(), 'RESERVE_NOT_CONFIRMED');
  return { transactionHash: receipt.hash, consentDigest: digest, depositUnits: AMOUNT.toString() };
}
export async function inspectClaim(provider, trusted, packet, recipient) {
  const result = validateEvidence(packet, trusted, recipient, await chainTime(provider));
  const { vault, token } = await verifyDeployment(provider, trusted);
  need(await vault.enrolled(recipient) && !await vault.settled(recipient), 'NOT_CLAIMABLE');
  need(await vault.consentDigest(recipient) === result.consentDigest && await vault.acceptedAt(recipient) === BigInt(packet.acceptance.acceptedAt), 'CONSENT_NOT_RECORDED');
  const reserve = await vault.totalReserved();
  const balance = await token.balanceOf(vault.target);
  need(reserve >= AMOUNT && balance >= reserve, 'RESERVE_NOT_CONFIRMED');
  return { ...result, vault, token, reserveUnits: reserve.toString(), balanceUnits: balance.toString() };
}
export async function claimRefund(provider, trusted, submitter, packet, recipient) {
  const { vault, token } = await inspectClaim(provider, trusted, packet, recipient);
  const before = await token.balanceOf(recipient);
  const transaction = await vault.connect(submitter).claim(recipient, packet.submissions.map(s => s.receipt), packet.submissions.map(s => s.signature));
  const receipt = await transaction.wait();
  need(receipt.status === 1 && await vault.settled(recipient), 'PAYMENT_NOT_CONFIRMED');
  const paid = receipt.logs.filter(l => getAddress(l.address) === getAddress(vault.target)).map(l => {
    try { return vault.interface.parseLog(l); } catch { return null; }
  }).find(l => l?.name === 'Paid');
  need(paid && getAddress(paid.args.learner) === getAddress(recipient) && paid.args.amount === AMOUNT, 'PAYMENT_EVENT');
  const after = await token.balanceOf(recipient);
  need(after - before === AMOUNT, 'PAYMENT_BALANCE');
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber, recipient: getAddress(recipient),
    submitter: getAddress(await submitter.getAddress()), paidUnits: AMOUNT.toString(), beforeUnits: before.toString(), afterUnits: after.toString() };
}
