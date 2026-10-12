import {computeAddress} from 'ethers';
import {verifyInstruction} from './binding.mjs';
import {policyFor,MAX_ROWS,sourcePolicyHash} from './source-policy.mjs';
import {canonical,digest,exactKeys,requireValue,examFields,examKey} from './values.mjs';
import {validateTrust} from './trust.mjs';
import {bindingTypes} from './binding.mjs';
import {TypedDataEncoder} from 'ethers';

function signedJson(text){
  requireValue(typeof text==='string','SIGNED_JSON');
  const value=JSON.parse(text);requireValue(canonical(value)===text,'SIGNED_JSON');return value;
}
// No owner private key, browser, cookie, source HTML or collector-extracted
// expected fields enter this verifier. All facts come from signed claims.
export async function verifyProofPair(input,now=Math.floor(Date.now()/1000)){
  requireValue(Buffer.byteLength(JSON.stringify(input))<=128*1024,'PROOF_SIZE');
  const {envelope,expectedRecord,trustedConfig,proofs}=structuredClone(input);
  const trust=validateTrust(trustedConfig.runtime.attestorTrust);
  requireValue(digest(trustedConfig.runtime)===trustedConfig.runtimeConfigHash,'RUNTIME');
  const record=verifyInstruction(envelope,{expectedRecord,trustedConfig,ownerPublicKey:expectedRecord.binding.ownerPublicKey,now});
  requireValue(Array.isArray(proofs)&&proofs.length===2,'EXACT_PAIR_REQUIRED');
  process.env.LOG_LEVEL='silent';
  const {assertValidClaimSignatures,getIdentifierFromClaimInfo,hashProviderParams}=await import('@reclaimprotocol/attestor-core');
  const owner=computeAddress(record.binding.ownerPublicKey).toLowerCase(),fields=[];
  const bindingHash=TypedDataEncoder.hash(record.domain,bindingTypes,record.binding);
  for(const [i,role] of ['registration','score'].entries()){
    const p=proofs[i];exactKeys(p,['claim','signature','attestor']);
    requireValue(typeof p.attestor==='string'&&trust.includes(p.attestor.toLowerCase()),'UNTRUSTED_ATTESTOR');
    requireValue(typeof p.signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(p.signature),'CLAIM_SIGNATURE');
    const claim=p.claim;exactKeys(claim,['provider','parameters','owner','timestampS','context','identifier','epoch']);
    requireValue(claim.provider==='http'&&typeof claim.owner==='string'&&claim.owner.toLowerCase()===owner,'CLAIM_OWNER');
    requireValue(Number.isSafeInteger(claim.epoch)&&claim.epoch>=0,'CLAIM_EPOCH');
    const t=claim.timestampS;
    requireValue(Number.isSafeInteger(t)&&t>=record.createdAt&&t>=now-1800&&t<=now+60&&t<record.binding.expiresAt,'PROOF_TIME');
    const params=signedJson(claim.parameters),ctx=signedJson(claim.context);
    requireValue(getIdentifierFromClaimInfo({...claim})===claim.identifier,'CLAIM_IDENTIFIER');
    try{await assertValidClaimSignatures({claim,signatures:{claimSignature:Buffer.from(p.signature.slice(2),'hex'),attestorAddress:p.attestor}});}catch{throw new Error('CLAIM_SIGNATURE');}
    const index=Array.from({length:role==='score'?MAX_ROWS:1},(_,n)=>n).find(n=>canonical(params)===canonical(policyFor(role,n)));
    requireValue(index!==undefined,'SOURCE_POLICY');
    const expected={clearSchemaVersion:4,clearRoute:'DIRECT_ATTESTOR',clearBindingHash:bindingHash,clearSourceRole:role,clearSourceRequestId:record.sourceRequestIds[role][index],clearSourcePolicyHash:sourcePolicyHash};
    exactKeys(ctx,[...Object.keys(expected),'extractedParameters',...(Object.hasOwn(ctx,'providerHash')?['providerHash']:[])]);
    for(const [key,value] of Object.entries(expected))requireValue(ctx[key]===value,'PROOF_CONTEXT');
    if(Object.hasOwn(ctx,'providerHash'))requireValue(ctx.providerHash===hashProviderParams(params),'PROVIDER_HASH');
    fields.push(examFields(ctx.extractedParameters,role));
  }
  requireValue(examKey(fields[0])===examKey(fields[1]),'EXAM_JOIN');
  return {complete:true,proofVerified:true,applicationBound:true,recipientAuthorized:true,sourcePairMatched:true,sourcePolicyPinned:true,independentProcess:false,listComplete:false,highestScoreAssessed:false,eligibilityAssessed:false,paymentAllowed:false};
}
