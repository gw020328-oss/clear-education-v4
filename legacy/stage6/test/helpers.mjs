import { acceptTerms,issueReceipt,makeEvidence } from '../lib/evidence.mjs';
import { enrollFunded } from '../lib/chain.mjs';

export async function fundedEvidence(fx){
  await fx.setTime(fx.trusted.terms.start);const acceptance=await acceptTerms(fx.trusted,fx.learner,fx.trusted.terms.start,fx.trusted.termsHash);
  await enrollFunded(fx.provider,fx.trusted,fx.sponsor,acceptance,fx.learner.address);const submissions=[];
  for(const session of [0,1,2,3])submissions.push(await issueReceipt(fx.trusted,fx.issuer,fx.learner.address,session,fx.trusted.terms.start,fx.trusted.terms.start));
  return makeEvidence(fx.trusted,acceptance,submissions);
}
export async function code(fn){try{await fn();return 'ACCEPT'}catch(e){return e.code||e.message}}
