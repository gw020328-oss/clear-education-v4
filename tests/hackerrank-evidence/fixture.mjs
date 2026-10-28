// Invented account/records and ephemeral random keys. No actual claim material.
import {Wallet} from 'ethers';
import {createRequire} from 'node:module';
import {canonical,hash} from '../../src/hackerrank-evidence/values.mjs';
import {syntheticRecipe,parametersFor} from '../../src/hackerrank-evidence/recipes.mjs';
import {requestHash,requestMessage,POLICY_HASH,CRITERION} from '../../src/hackerrank-evidence/request.mjs';
import {createHackerRankVerifier} from '../../src/hackerrank-evidence/verifier.mjs';
const require=createRequire(new URL('../../src/hackerrank-evidence/package.json',import.meta.url));
export const sdk=await import(require.resolve('@reclaimprotocol/attestor-core'));
export const actors={participant:Wallet.createRandom(),owner:Wallet.createRandom(),attestor:Wallet.createRandom(),other:Wallet.createRandom()};
export const NOW=1900000000,USERNAME='synthetic_learner_orchid';
export const rows=[{username:USERNAME,certificate_id:'synthetic-python-rose',certificate_name:'Python (Basic)',status:'test_passed'}];
const quiet=Object.fromEntries(['trace','debug','info','warn','error','fatal'].map(x=>[x,()=>{}]));quiet.child=()=>quiet;
export function extract(params,body){
 const http=sdk.providers.http,version=sdk.proto.AttestorVersion.ATTESTOR_VERSION_3_2_0,ctx={version};
 const request=http.createRequest({cookieStr:'SYNTHETIC_COOKIE_ONLY'},structuredClone(params),quiet);
 const req=Buffer.from(request.data);for(const r of request.redactions)req.fill('*',r.fromIndex,r.toIndex);
 const raw=Buffer.from(body),response=Buffer.concat([Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${raw.length}\r\n\r\n`),raw]);
 return http.assertValidProviderReceipt({clientVersion:version,receipt:[{sender:'client',message:req},{sender:'server',message:response}],params,logger:quiet,ctx}).extractedParameters;
}
export async function signProof(claim,signer=actors.attestor){
 claim=structuredClone(claim);claim.identifier=sdk.getIdentifierFromClaimInfo({...claim});
 return {claim,attestor:signer.address.toLowerCase(),signature:await signer.signMessage(sdk.createSignDataForClaim(claim))};
}
export async function resign(proof,change,signer=actors.attestor){const c=structuredClone(proof.claim);await change(c);return signProof(c,signer);}
export async function fixture({certificates=rows,username=USERNAME,selectedCertificateId=null,clock=()=>NOW,requestPatch={},trustPatch={}}={}){
 const recipe=syntheticRecipe(),config={version:'clear-hackerrank-trust.1',status:'REVIEWED',dataMode:'SYNTHETIC_FIXTURE',approvalRef:'synthetic-review-only',sourceReview:'SYNTHETIC_ONLY',contextReview:'SYNTHETIC_ONLY',audience:'synthetic-bootcamp-verifier',notBefore:NOW-3600,expiresAt:NOW+3600,signers:[actors.attestor.address.toLowerCase()],epochs:[1],recipe,privacyKeyId:'synthetic-key.1',...trustPatch};
 const key=Buffer.alloc(32,71);
 const request={version:'clear-hackerrank-request.1',audience:config.audience,participantId:'participant-orchid',participantWallet:actors.participant.address.toLowerCase(),applicationId:'application-orchid',criterionId:CRITERION,policyHash:POLICY_HASH,runtimeMappingHash:hash('SYNTHETIC_MAPPING','bootcamp'),recipeHash:hash('RECIPE',recipe),trustConfigHash:hash('TRUST',config),expectedClaimOwner:actors.owner.address.toLowerCase(),nonce:'0x'+'a1'.repeat(32),issuedAt:NOW-10,expiresAt:NOW+890,selectedCertificateId,...requestPatch};
 const envelope={request,signature:await actors.participant.signMessage(requestMessage(request))};
 const proofs={};for(const role of ['account','certificate']){
  const params=parametersFor(recipe,role,username),body=role==='account'?`<synthetic-account-control>${username}</synthetic-account-control>`:JSON.stringify({data:certificates});
  const context={clearSchema:'clear-hackerrank-context.1',clearRequestHash:requestHash(request),clearSourceRole:role,clearRecipeHash:request.recipeHash,providerHash:sdk.hashProviderParams(params),extractedParameters:extract(params,body)};
  proofs[role]=await signProof({provider:'http',parameters:canonical(params),owner:request.expectedClaimOwner,timestampS:NOW-5,context:canonical(context),identifier:'',epoch:1});
 }
 return {config,key,request,input:{envelope,proofs},verifier:createHackerRankVerifier({trustConfig:config,commitmentKey:key,clock})};
}
export async function mutateContext(proof,fn){return resign(proof,c=>{const x=JSON.parse(c.context);fn(x);c.context=canonical(x);});}
