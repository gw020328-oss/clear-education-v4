// Independent literal field order. Does not import the production type schema.
import {AbiCoder,keccak256,toUtf8Bytes,concat} from 'ethers';
const abi=AbiCoder.defaultAbiCoder();
export const typeText='BootcampPaymentAuthorizationV2(bytes32 applicationId,bytes32 policyHash,bytes32 runtimeMappingHash,bytes32 decisionId,uint64 decisionRevision,bytes32 decisionHash,address recipient,address token,uint256 amountAtoms,bytes32 allocationId,bytes32 consentSetHash,bytes32 deadlinePolicyHash,uint8 eligibilityRoute,bytes32 nonce,uint64 issuedAt,uint64 expiresAt,bytes32 signerKeyId,uint64 authorizationEpoch)';
const fields=typeText.slice(typeText.indexOf('(')+1,-1).split(',').map(x=>x.split(' '));
const h=x=>keccak256(toUtf8Bytes(x));
export function manualHashes({domain:d,message:m}){
 const domainSeparator=keccak256(abi.encode(['bytes32','bytes32','bytes32','uint256','address','bytes32'],[h('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)'),h(d.name),h(d.version),d.chainId,d.verifyingContract,d.salt]));
 const structHash=keccak256(abi.encode(['bytes32',...fields.map(x=>x[0])],[h(typeText),...fields.map(x=>m[x[1]])]));
 return {domainSeparator,structHash,digest:keccak256(concat(['0x1901',domainSeparator,structHash]))};
}
