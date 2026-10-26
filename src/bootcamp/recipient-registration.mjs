import {AbiCoder, TypedDataEncoder, getAddress, id, keccak256, verifyTypedData} from 'ethers';

export const REGISTRATION_TYPES = Object.freeze({RecipientRegistration: Object.freeze([
  {name:'applicationId',type:'bytes32'}, {name:'applicationSalt',type:'bytes32'},
  {name:'policyHash',type:'bytes32'}, {name:'runtimeMappingHash',type:'bytes32'},
  {name:'participant',type:'address'}, {name:'recipient',type:'address'},
  {name:'nonce',type:'bytes32'}, {name:'deadline',type:'uint64'},
].map(Object.freeze))});
const bytes32 = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value) && BigInt(value) !== 0n;
const requireValue = (valid, code) => { if (!valid) throw new Error(code); };

// Pure codec. No wallet, transport, signing capability, clock or persistence.
export function recipientRegistration({chainId, verifyingContract, instanceId, policyHash, runtimeMappingHash,
  participant, applicationSalt, nonce, deadline}) {
  requireValue([instanceId,policyHash,runtimeMappingHash,applicationSalt,nonce].every(bytes32), 'REGISTRATION_FIELDS');
  requireValue(/^[1-9][0-9]*$/.test(String(chainId)) && BigInt(chainId)<2n**256n, 'REGISTRATION_CHAIN');
  requireValue(/^[1-9][0-9]*$/.test(String(deadline)) && BigInt(deadline)<2n**64n, 'REGISTRATION_DEADLINE');
  participant=getAddress(participant); verifyingContract=getAddress(verifyingContract);
  requireValue(BigInt(participant)!==0n && BigInt(verifyingContract)!==0n, 'REGISTRATION_ADDRESS');
  const domain={name:'ClearBootcampRecipientRegistration',version:'1',chainId:String(chainId),verifyingContract,salt:instanceId};
  const applicationId=keccak256(AbiCoder.defaultAbiCoder().encode(
    ['bytes32','bytes32','bytes32','bytes32','address','bytes32'],
    [id('CLEAR_PARTICIPANT_APPLICATION_V2'),TypedDataEncoder.hashDomain(domain),policyHash,runtimeMappingHash,participant,applicationSalt]));
  const message={applicationId,applicationSalt,policyHash,runtimeMappingHash,participant,recipient:participant,nonce,deadline:String(deadline)};
  return {domain,types:REGISTRATION_TYPES,primaryType:'RecipientRegistration',message};
}

// The caller supplies a freshly inspected, authenticated fixed application owner.
// Never use the participant from an untrusted submitted message as this anchor.
export function verifyRecipientRegistration(expected, signature, {applicationOwner, nowSeconds, sourceValidUntilExclusive}) {
  const rebuilt=recipientRegistration({...expected.domain,...expected.message,instanceId:expected.domain.salt});
  requireValue(TypedDataEncoder.hash(expected.domain,REGISTRATION_TYPES,expected.message)===
    TypedDataEncoder.hash(rebuilt.domain,REGISTRATION_TYPES,rebuilt.message), 'REGISTRATION_CONTEXT');
  requireValue(getAddress(applicationOwner)===rebuilt.message.participant, 'REGISTRATION_APPLICATION_OWNER');
  requireValue(BigInt(nowSeconds)>=0n && BigInt(nowSeconds)<BigInt(rebuilt.message.deadline) &&
    BigInt(rebuilt.message.deadline)<=BigInt(sourceValidUntilExclusive), 'REGISTRATION_TIME');
  requireValue(verifyTypedData(rebuilt.domain,REGISTRATION_TYPES,rebuilt.message,signature)===rebuilt.message.participant,
    'REGISTRATION_SIGNER');
  return {applicationId:rebuilt.message.applicationId,digest:TypedDataEncoder.hash(rebuilt.domain,REGISTRATION_TYPES,rebuilt.message)};
}
