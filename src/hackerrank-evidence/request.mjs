import {verifyMessage} from 'ethers';
import {P0_POLICY,p0PolicyHash} from '../../specs/bootcamp/p0-contract.mjs';
import {check,keys,canonical,hash,isHash,isId,isAddress,isSourceId,epoch} from './values.mjs';
export const CAPABILITY='HACKERRANK_CERTIFICATE_HOLDING.1';
export const CRITERION='python-basic-certificate';
export const POLICY_HASH=p0PolicyHash(P0_POLICY);
export const requestHash=request=>hash('REQUEST',request);
export const requestMessage=request=>'CLEAR HackerRank evidence observation approval; not a payment authorization.\n'+canonical(request);
export function validateRequest(r,config,now){
 keys(r,['version','audience','participantId','participantWallet','applicationId','criterionId','policyHash','runtimeMappingHash','trustConfigHash','recipeHash','expectedClaimOwner','nonce','issuedAt','expiresAt','selectedCertificateId'],'REQUEST_SHAPE');
 check(r.version==='clear-hackerrank-request.1'&&r.audience===config.audience,'REQUEST_DOMAIN');
 check(isId(r.participantId)&&isId(r.applicationId)&&isAddress(r.participantWallet)&&isAddress(r.expectedClaimOwner),'REQUEST_IDENTITY');
 check(r.criterionId===CRITERION&&r.policyHash===POLICY_HASH,'REQUEST_POLICY');
 check(isHash(r.runtimeMappingHash)&&isHash(r.recipeHash)&&isHash(r.trustConfigHash)&&isHash(r.nonce)&&r.nonce!=='0x'+'0'.repeat(64),'REQUEST_HASH');
 check(r.recipeHash===hash('RECIPE',config.recipe),'REQUEST_RECIPE');
 check(r.trustConfigHash===hash('TRUST',config),'REQUEST_TRUST');
 check(r.selectedCertificateId===null||isSourceId(r.selectedCertificateId),'REQUEST_SELECTION');
 check(epoch(r.issuedAt)&&epoch(r.expiresAt)&&r.expiresAt>r.issuedAt&&r.expiresAt-r.issuedAt<=900,'REQUEST_WINDOW');
 check(r.issuedAt<=now&&now<r.expiresAt,'REQUEST_EXPIRED');
 return r;
}
export function verifyParticipant(envelope,expectedRequest,config,now){
 keys(envelope,['request','signature'],'APPROVAL_SHAPE');validateRequest(envelope.request,config,now);
 // expectedRequest is obtained by the server from its authenticated enrollment
 // and issued nonce record, never taken from the same browser request body.
 check(canonical(envelope.request)===canonical(expectedRequest),'EXPECTED_REQUEST_MISMATCH');
 check(typeof envelope.signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(envelope.signature),'PARTICIPANT_SIGNATURE');
 let signer;try{signer=verifyMessage(requestMessage(envelope.request),envelope.signature).toLowerCase();}catch{check(false,'PARTICIPANT_SIGNATURE');}
 check(signer===envelope.request.participantWallet,'PARTICIPANT_SIGNATURE');return envelope.request;
}
