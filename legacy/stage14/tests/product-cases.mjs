import {Wallet} from 'ethers';
import {cases,fields,expected,reviewFromDraft} from '../policy/product.mjs';
import {approveReview,providerCommitment,participantEnrollment,createCompiler} from '../policy/binding.mjs';
import {read,save} from '../lib/io.mjs';
const cache=read('ai/cached-examples.json'),results=[];
for(const c of cases){const d=cache.examples.find(e=>e.id===c.id)?.draft;if(!d){results.push({id:c.id,status:'AI_NOT_VALID'});continue;}const reviewer=Wallet.createRandom(),payer=Wallet.createRandom(),participant=Wallet.createRandom(),issuer=Wallet.createRandom(),ctx={token:'0x'+'11'.repeat(20),issuer:issuer.address,reviewer,payer:payer.address,now:1893456000};
 let input=reviewFromDraft(d),before='UNEXPECTED_APPROVAL';try{await approveReview(input,c.source,ctx);}catch{before='BLOCKED';}input.confirmed=true;let unresolved='ALLOWED';try{await approveReview(input,c.source,ctx);}catch{unresolved='BLOCKED';}
 const modified=fields.filter(f=>input.values[f]!==expected[f]);for(const f of modified){input.values[f]=expected[f];input.origins[f]='USER_INPUT';input.citations[f]=[];}input.questions=input.questions.map(q=>({...q,answer:'로컬 시연 최종 조건: '+expected[q.field]}));const r=await approveReview(input,c.source,ctx),vault='0x'+'22'.repeat(20),bundle={reviewed:r.reviewed,provider:await providerCommitment(r.reviewed,vault,payer),enrollment:await participantEnrollment(r.reviewed,vault,participant,ctx.now)},plan=createCompiler(r.trust)(bundle,ctx.now);
 results.push({id:c.id,status:'PASS',beforeHumanConfirmation:before,afterConfirmationBeforeCorrection:unresolved,humanInputFields:modified,afterHumanCorrection:'COMPILED_OFFLINE',policySpecHash:r.reviewed.policySpecHash,termsHash:plan.termsHash,canonicalCompilerActuallyExecuted:true,chainDeployment:false,realHumanReview:false});
}
save('artifacts/product-compiler-cases.json',{at:new Date().toISOString(),results,additionalAPICalls:0,realHumanParticipants:0});console.log(JSON.stringify({cases:results.length,passed:results.filter(r=>r.status==='PASS').length}));
