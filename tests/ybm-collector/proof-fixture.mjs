// Fresh fabricated signatures and exam records only; never a saved real proof.
import {createRequire} from 'node:module';
import {prepareLocalDiagnostic} from '../../src/ybm-collector/binding.mjs';
import {canonical} from '../../src/ybm-collector/values.mjs';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
export const {Wallet}=await import(require.resolve('ethers'));
process.env.LOG_LEVEL='silent';
export const core=await import(require.resolve('@reclaimprotocol/attestor-core'));
export async function fixture(){
 const attestor=Wallet.createRandom(),diagnostic=await prepareLocalDiagnostic({attestorTrust:[attestor.address]});
 diagnostic.collection.start();
 const input={...diagnostic.verificationInput(),proofs:[]};
 const sign=async p=>{p.claim.identifier=core.getIdentifierFromClaimInfo({...p.claim});p.signature=await attestor.signMessage(core.createSignDataForClaim({...p.claim}));};
 for(const role of ['registration','score']){
  const request=diagnostic.collection.request(role),fields={exam_type:'TOEIC',exam_date:'2026.09.20',registration_number:'123456',...(role==='score'?{total_score:'850'}:{})};
  const claim={provider:'http',parameters:canonical(request.params),owner:request.ownerAddress.toLowerCase(),timestampS:input.expectedRecord.createdAt,context:canonical({...request.context,extractedParameters:fields,providerHash:core.hashProviderParams(request.params)}),identifier:'',epoch:1};
  const p={claim,attestor:attestor.address,signature:''};await sign(p);input.proofs.push(p);
 }
 return {input,diagnostic,attestor,sign};
}
