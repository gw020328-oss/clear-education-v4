import { freeze } from '../policy/values.mjs';

export const proofBindingTypes = freeze({ ProofSessionBindingV4: [
  { name: 'applicationId', type: 'bytes32' }, { name: 'learner', type: 'address' },
  { name: 'policyHash', type: 'bytes32' }, { name: 'runtimeConfigHash', type: 'bytes32' },
  { name: 'proofSessionId', type: 'bytes32' }, { name: 'requestNonce', type: 'bytes32' },
  { name: 'ownerPublicKey', type: 'bytes' }, { name: 'expiresAt', type: 'uint256' },
] });
