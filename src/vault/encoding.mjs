import { AbiCoder, keccak256, TypedDataEncoder } from 'ethers';
import { freeze } from '../policy/values.mjs';

export const runtimeFields = Object.freeze(['configVersion', 'instanceId', 'cohortId', 'policyHash', 'token', 'sponsor', 'issuer', 'outageSigner', 'amount',
  'enrollmentStart', 'enrollmentUntil', 'normalSubmitFrom', 'normalSubmitAt', 'supplementEndAt', 'claimUntil']);
export const runtimeTuple = 'tuple(uint256 configVersion,bytes32 instanceId,bytes32 cohortId,bytes32 policyHash,address token,address sponsor,address issuer,address outageSigner,uint256 amount,uint256 enrollmentStart,uint256 enrollmentUntil,uint256 normalSubmitFrom,uint256 normalSubmitAt,uint256 supplementEndAt,uint256 claimUntil)';
export const runtimeHash = config => keccak256(AbiCoder.defaultAbiCoder().encode([runtimeTuple], [config]));
export const finalTermsTypes = freeze({ TermsAcceptanceV4: [
  { name: 'applicationId', type: 'bytes32' }, { name: 'learner', type: 'address' }, { name: 'policyHash', type: 'bytes32' },
  { name: 'runtimeConfigHash', type: 'bytes32' }, { name: 'nonce', type: 'bytes32' },
  { name: 'signedAt', type: 'uint256' }, { name: 'expiresAt', type: 'uint256' },
] });
export const grantTypes = freeze({ EligibilityGrantV4: [
  { name: 'grantId', type: 'bytes32' }, ...finalTermsTypes.TermsAcceptanceV4.slice(0, 4),
  { name: 'examNullifier', type: 'bytes32' }, { name: 'amount', type: 'uint256' },
  { name: 'verifiedAt', type: 'uint256' }, { name: 'issueBy', type: 'uint256' }, { name: 'claimUntil', type: 'uint256' },
] });
export const supplementTypes = freeze({ SupplementV4: [
  { name: 'runtimeConfigHash', type: 'bytes32' }, { name: 'observedAt', type: 'uint256' },
] });
export const vaultDomain = record => ({ name: 'ClearRefund', version: '4', chainId: record.deployment.chainId,
  verifyingContract: record.deployment.vaultAddress, salt: record.config.instanceId });
export const finalTerms = (record, message) => ({ domain: vaultDomain(record), types: structuredClone(finalTermsTypes), primaryType: 'TermsAcceptanceV4', message });
export const finalDigest = typed => TypedDataEncoder.hash(typed.domain, typed.types, typed.message);
