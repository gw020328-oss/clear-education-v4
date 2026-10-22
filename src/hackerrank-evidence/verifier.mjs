import {assertValidClaimSignatures,getIdentifierFromClaimInfo,hashProviderParams} from '@reclaimprotocol/attestor-core';
import {check,keys,canonical,freeze,hash,privateHash,isAddress,isId,isHash,isSourceId,epoch,strictJson,EvidenceError} from './values.mjs';
import {CAPABILITY,CRITERION,verifyParticipant,validateRequest,requestHash} from './request.mjs';
import {validateRecipe,parametersFor,syntheticRecipe,usesWorkerSource} from './recipes.mjs';
import {NESTED_RECORD_SHAPE,readNestedCertificateRecords} from './source-records.mjs';
import {readWorkerSource} from './worker-source.mjs';
const GATES=freeze({productEligible:false,paymentAllowed:false,grant:'HOLD',outbox:'HOLD',independentClaim:'NO_GO',productionEnabled:false});
const blocked=()=>freeze({version:'clear-hackerrank-candidate.1',status:'BLOCKED',code:'TRUST_NOT_CONFIGURED',condition:'UNKNOWN',gates:GATES});
export function createHackerRankVerifier({trustConfig,commitmentKey,clock}={}){
 if(!trustConfig||trustConfig.status!=='REVIEWED')return {verify:async()=>blocked(),recheck:()=>{throw new EvidenceError('TRUST_NOT_CONFIGURED');}};
 const config=freeze(structuredClone(trustConfig));
 keys(config,['version','status','dataMode','approvalRef','sourceReview','contextReview','audience','notBefore','expiresAt','signers','epochs','recipe','privacyKeyId'],'TRUST_SHAPE');
 check(config.version==='clear-hackerrank-trust.1'&&isId(config.audience)&&isId(config.approvalRef)&&isId(config.privacyKeyId),'TRUST_VERSION');
 const synthetic=config.dataMode==='SYNTHETIC_FIXTURE';
 const worker=usesWorkerSource(config.recipe);
 check(synthetic||config.dataMode==='RECLAIM_SIGNED_RECORD','TRUST_MODE');
 check(config.sourceReview===(synthetic?'SYNTHETIC_ONLY':worker?'TRUSTED_WORKER_TRANSCRIPT_REVIEWED':'AUTHENTICATED_SOURCE_REVIEWED')
  &&config.contextReview===(synthetic?'SYNTHETIC_ONLY':worker?'SIGNED_REQUEST_CONTEXT_REQUIRED':'SIGNED_REQUEST_CONTEXT_CONFIRMED'),'TRUST_SOURCE_REVIEW');
 check(clock===undefined||synthetic,'REAL_CLOCK_REQUIRED');
 check(epoch(config.notBefore)&&epoch(config.expiresAt)&&config.expiresAt>config.notBefore,'TRUST_WINDOW');
 check(Array.isArray(config.signers)&&config.signers.length>0&&config.signers.length<=16&&config.signers.every(isAddress)&&new Set(config.signers).size===config.signers.length,'TRUST_SIGNERS');
 check(Array.isArray(config.epochs)&&config.epochs.length>0&&config.epochs.every(epoch),'TRUST_EPOCHS');validateRecipe(config.recipe);
 const example=syntheticRecipe();
 check(synthetic||['account','certificate'].some(role=>canonical(config.recipe[role])!==canonical(example[role])),'SYNTHETIC_RECIPE_IN_LIVE_MODE');
 check(Buffer.isBuffer(commitmentKey)&&commitmentKey.length===32,'COMMITMENT_KEY');const key=Buffer.from(commitmentKey);
 const configHash=hash('TRUST',config),issued=new WeakMap(),now=()=>{const n=clock?clock():Math.floor(Date.now()/1000);check(epoch(n),'CLOCK');return n;};
 function active(t){check(t>=config.notBefore&&t<config.expiresAt,'TRUST_EXPIRED');}
 const commitment=(domain,v)=>privateHash(key,domain,{audience:config.audience,keyId:config.privacyKeyId,value:v});
 async function signedProof(proof,role,r,username,t){
  keys(proof,['claim','signature','attestor'],'PROOF_SHAPE');const c=proof.claim;
  keys(c,['provider','parameters','owner','timestampS','context','identifier','epoch'],'CLAIM_SHAPE');
  check(config.signers.includes(proof.attestor),'UNTRUSTED_SIGNER');
  check(typeof proof.signature==='string'&&/^0x[0-9a-fA-F]{130}$/.test(proof.signature),'CLAIM_SIGNATURE');
  check(c.provider==='http'&&c.owner===r.expectedClaimOwner,'CLAIM_OWNER_OR_PROVIDER');
  check(config.epochs.includes(c.epoch),'CLAIM_EPOCH');
  check(epoch(c.timestampS)&&c.timestampS>=r.issuedAt&&c.timestampS>=config.notBefore&&c.timestampS<=t&&t-c.timestampS<=900&&c.timestampS<r.expiresAt,'PROOF_TIME');
  const params=strictJson(c.parameters),ctx=strictJson(c.context);
  check(canonical(params)===canonical(parametersFor(config.recipe,role,username,r.selectedCertificateId)),'SOURCE_RECIPE');
  check(isHash(c.identifier)&&getIdentifierFromClaimInfo({...c})===c.identifier,'CLAIM_IDENTIFIER');
  try{await assertValidClaimSignatures({claim:c,signatures:{attestorAddress:proof.attestor,claimSignature:Buffer.from(proof.signature.slice(2),'hex')}});}catch{throw new EvidenceError('CLAIM_SIGNATURE');}
  keys(ctx,['clearSchema','clearRequestHash','clearSourceRole','clearRecipeHash','providerHash','extractedParameters'],'SIGNED_CONTEXT_REQUIRED');
  check(ctx.clearSchema==='clear-hackerrank-context.1'&&ctx.clearRequestHash===requestHash(r)&&ctx.clearSourceRole===role&&ctx.clearRecipeHash===r.recipeHash,'SIGNED_REQUEST_BINDING');
  check(ctx.providerHash===hashProviderParams(params),'PROVIDER_HASH');
  const fields=ctx.extractedParameters;
  keys(fields,role==='account'?['username']:worker?['username','certificate_id','status','certificate_label','certificate_level','certificate_slug']:['records'],'EXTRACTED_FIELDS');
  const proofHash=hash('SIGNED_CLAIM',{identifier:c.identifier,owner:c.owner,timestampS:c.timestampS,epoch:c.epoch});
  return {fields,timestampS:c.timestampS,proofHash};
 }
 async function verify(input,expectedRequest,{workerSources}={}){
  try{
   check(Buffer.byteLength(JSON.stringify(input))<=128*1024,'INPUT_LIMIT');
   const snapshot=structuredClone(input),expected=structuredClone(expectedRequest);keys(snapshot,['envelope','proofs'],'INPUT_SHAPE');
   const acquiredAt=now();active(acquiredAt);const r=verifyParticipant(snapshot.envelope,expected,config,acquiredAt);
   keys(snapshot.proofs,['account','certificate'],'PROOF_PAIR');
   const account=await signedProof(snapshot.proofs.account,'account',r,undefined,acquiredAt);
   const username=account.fields.username;check(isSourceId(username),'SOURCE_USERNAME');
   const certificate=await signedProof(snapshot.proofs.certificate,'certificate',r,username,acquiredAt);
   let records;
   if(worker){
    const observedAccount=readWorkerSource(workerSources?.account,{config,request:r,role:'account',proof:snapshot.proofs.account});
    const observedCertificate=readWorkerSource(workerSources?.certificate,{config,request:r,role:'certificate',proof:snapshot.proofs.certificate});
    check(canonical(observedAccount)===canonical(account.fields)&&canonical(observedCertificate)===canonical(certificate.fields),'WORKER_SIGNED_FIELDS');
    const f=certificate.fields;check(f.certificate_label==='Python'&&f.certificate_level==='Basic'&&f.certificate_slug==='python_basic','CERTIFICATE_CLASS_OR_SELECTION');
    records=[{username:f.username,certificate_id:f.certificate_id,certificate_name:'Python (Basic)',status:f.status}];
   }else records=config.recipe.recordShape===NESTED_RECORD_SHAPE?readNestedCertificateRecords(certificate.fields.records):strictJson(certificate.fields.records);
   check(Array.isArray(records)&&records.length<=32,'CERTIFICATE_RECORDS');
   const ids=new Set();for(const row of records){
    keys(row,['username','certificate_id','certificate_name','status'],'CERTIFICATE_RECORD_SHAPE');
    check(row.username===username,'ACCOUNT_JOIN');check(isSourceId(row.certificate_id)&&!ids.has(row.certificate_id),'CERTIFICATE_ID');ids.add(row.certificate_id);
    check(typeof row.certificate_name==='string'&&row.certificate_name.length<=100&&typeof row.status==='string'&&row.status.length<=32,'CERTIFICATE_FIELDS');
   }
   const candidates=records.filter(x=>x.certificate_name==='Python (Basic)');
   if(r.selectedCertificateId===null&&candidates.length>1)throw new EvidenceError('AMBIGUOUS_CERTIFICATE');
   const row=r.selectedCertificateId===null?candidates[0]:records.find(x=>x.certificate_id===r.selectedCertificateId);
   check(row&&row.certificate_name==='Python (Basic)','CERTIFICATE_CLASS_OR_SELECTION');
   check(['test_passed','test_failed'].includes(row.status),'UNKNOWN_ISSUER_STATUS');
   const verifiedAt=now();active(verifiedAt);validateRequest(r,config,verifiedAt);
   check(verifiedAt>=acquiredAt&&[account,certificate].every(p=>verifiedAt-p.timestampS<=900),'PROOF_TIME');
   const facts={capability:CAPABILITY,targetLogicalId:CRITERION,certificateName:row.certificate_name,issuerStatus:row.status,
    accountProofHash:account.proofHash,certificateProofHash:certificate.proofHash,sourceUsernameHash:commitment('USERNAME',username),certificateIdHash:commitment('CERTIFICATE_ID',row.certificate_id),claimOwnerHash:commitment('CLAIM_OWNER',r.expectedClaimOwner),
    accountProofIssuedAt:account.timestampS,certificateProofIssuedAt:certificate.timestampS,achievementAt:null};
   const binding={participantId:r.participantId,participantWallet:r.participantWallet,applicationId:r.applicationId,criterionId:r.criterionId,policyHash:r.policyHash,runtimeMappingHash:r.runtimeMappingHash,
    requestHash:requestHash(r),nonceHash:hash('NONCE',r.nonce),expectedClaimOwnerHash:facts.claimOwnerHash,requestIssuedAt:r.issuedAt,requestExpiresAt:r.expiresAt};
   const body={version:'clear-hackerrank-candidate.1',status:'VERIFIED_CANDIDATE',dataMode:config.dataMode,producer:'hackerrank-adapter.1',trustConfigHash:configHash,recipeHash:r.recipeHash,privacyKeyId:config.privacyKeyId,
    binding,acquiredAt,verifiedAt,validUntilExclusive:Math.min(r.expiresAt,config.expiresAt,account.timestampS+901,certificate.timestampS+901),
    source:{provider:'reclaim-hackerrank',instanceRef:config.audience,recordRef:'hr-cert-'+facts.certificateIdHash.slice(2,42),accountBindingRef:'hr-account-'+facts.sourceUsernameHash.slice(2,42)},
    sourceVersion:config.recipe.version,sourceHash:hash('SOURCE_FACTS',facts),proofBundleHash:hash('PROOF_BUNDLE',[account.proofHash,certificate.proofHash]),
    facts,verification:{sourceStatus:synthetic?'MOCK_VERIFIED':'VERIFIED_ATTESTOR_SIGNATURES',participantBinding:'VERIFIED',requestBinding:'VERIFIED',integrity:'VERIFIED',freshness:'VERIFIED',
     ...(worker?{structureValidation:'TRUSTED_WORKER',disclosedFieldValidation:'ATTESTOR',independentStructureProof:false}:{})},
    cryptography:{bothAttestorSignaturesVerified:true,participantSignatureVerified:true,productionTrustActivated:false},
    condition:row.status==='test_passed'?'MET':'NOT_MET',durableAcceptance:'REQUIRED_EXTERNAL_TRANSACTION',gates:GATES};
   const receipt=freeze({...body,receiptHash:hash('CANDIDATE',body)});issued.set(receipt,requestHash(r));return receipt;
  }catch(error){const code=error instanceof EvidenceError?error.code:'INVALID_INPUT';return freeze({version:'clear-hackerrank-candidate.1',status:code==='AMBIGUOUS_CERTIFICATE'?'AMBIGUOUS':code==='SIGNED_CONTEXT_REQUIRED'?'UNKNOWN':'REJECTED',code,condition:'UNKNOWN',gates:GATES});}
 }
 // Object provenance is process-local only. This is not a durable spent cache.
 function recheck(receipt,expectedRequest){
  const t=now();active(t);check(issued.has(receipt),'UNTRUSTED_CANDIDATE');validateRequest(expectedRequest,config,t);
  check(issued.get(receipt)===requestHash(expectedRequest),'EXPECTED_REQUEST_MISMATCH');
  check(t>=receipt.verifiedAt&&t<receipt.validUntilExclusive,'CANDIDATE_EXPIRED');
  return freeze({...receipt.binding,proofBundleHash:receipt.proofBundleHash,receiptHash:receipt.receiptHash,trustConfigHash:configHash,validUntilExclusive:receipt.validUntilExclusive,durableConsumptionPerformed:false});
 }
 return {verify,recheck};
}
