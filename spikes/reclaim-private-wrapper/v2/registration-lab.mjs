// PUBLIC SYNTHETIC experiment: an extra trusted registration issuer, NOT an
// adopted product authority, on-chain contract, OPRF or CLEAR payout path.
import {Wallet,id,getBytes,verifyMessage} from 'ethers';
import {canonical,exactKeys} from '../../../src/ybm-collector/values.mjs';
import {bindingDigest} from './adapter.mjs';
import {privateRegistryLab} from './reuse-lab.mjs';
const issuer=new Wallet(id('PUBLIC_SYNTHETIC_V2_REGISTRATION_AUTHORITY_NOT_A_SECRET'));
export const labIssuer=issuer.address.toLowerCase();
export const ticketDigest=ticket=>id(canonical(ticket));
export const exerciseMessage=ticket=>getBytes(id(canonical(['SYNTHETIC_EXERCISE_V1',ticketDigest(ticket)])));
export function registrationAuthorityLab({key,registrations,signer,clock,state}){
 const registry=privateRegistryLab({key,registrations,signer,clock,state:state?.registry});
 const records=new Map(registrations.map(r=>[r.application,structuredClone(r)]));
 const receipts=new Map(state?.receipts??[]);let closed=false;
 return {
  async register({application,proof}){
   if(closed)throw Error('REGISTRY_OFFLINE');
   const r=records.get(application);if(!r)throw Error('REGISTRATION_NOT_APPROVED');
   const result=await registry.observe({application,proof});
   if(closed)throw Error('REGISTRY_OFFLINE');
   if(!result.firstSeen&&!result.sameApplication)throw Error('SOURCE_ALREADY_REGISTERED');
   if(receipts.has(application))return structuredClone(receipts.get(application));
   // No low-entropy source value is placed in the receipt. Application is already
   // a public unique identifier; deduplication was done in the private registry.
   const ticket={version:'SYNTHETIC_REGISTRATION_RECEIPT_V1',application,recipient:r.recipient,
    binding:bindingDigest(r),reuseScope:r.reuseScope,chainId:r.chainId,verifyingContract:r.verifyingContract};
   const signature=await issuer.signMessage(getBytes(ticketDigest(ticket)));
   if(closed)throw Error('REGISTRY_OFFLINE');
   const receipt={ticket,signature};receipts.set(application,receipt);return structuredClone(receipt);
  },
  privateCheckpoint(){if(closed)throw Error('REGISTRY_OFFLINE');return {registry:registry.privateCheckpoint(),receipts:structuredClone([...receipts])};},
  close(){closed=true;registry.close();receipts.clear();}
 };
}
// In-memory ledger simulates a final, durable claim ledger. It accepts a pinned
// issuer's already-issued receipt without calling that issuer at claim time.
// Persistence/rollback prevention, funds and actual EVM integration are absent.
export function offlineExerciseLab({registrations,spent=[]}){
 const approved=new Map(registrations.map(r=>[r.application,structuredClone(r)]));
 const used=new Set(spent);
 return {
  exercise({ticket,signature},recipientSignature){
   exactKeys(ticket,['version','application','recipient','binding','reuseScope','chainId','verifyingContract']);
   if(ticket.version!=='SYNTHETIC_REGISTRATION_RECEIPT_V1')throw Error('TICKET_VERSION');
   const r=approved.get(ticket.application);
   if(!r||ticket.binding!==bindingDigest(r)||ticket.recipient!==r.recipient||ticket.reuseScope!==r.reuseScope||ticket.chainId!==r.chainId||ticket.verifyingContract!==r.verifyingContract)throw Error('TICKET_BINDING');
   if(verifyMessage(getBytes(ticketDigest(ticket)),signature).toLowerCase()!==labIssuer)throw Error('REGISTRATION_SIGNATURE');
   if(verifyMessage(exerciseMessage(ticket),recipientSignature).toLowerCase()!==r.recipient)throw Error('RECIPIENT_SIGNATURE');
   if(used.has(ticket.application))throw Error('ALREADY_EXERCISED');
   used.add(ticket.application);
   return {scope:'SYNTHETIC_OFFLINE_EXERCISE_MODEL',issuerContacted:false,newIssuerSignatureRequired:false,
    reliesOnPriorRegistrationAuthority:true,paymentAllowed:false,independentClaim:'NO_GO'};
  },
  checkpoint(){return [...used];}
 };
}
