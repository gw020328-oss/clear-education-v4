// Deterministic inventory, not an execution/verification success attestation.
import {compileExample} from '../../specs/m1/examples.mjs';
import {describeClaimBoundary} from './capabilities.mjs';
const graphs=[['ybm',[100]],['siwon',[50,100,200,300,400]],['third',[75]]]
  .flatMap(([name,tiers])=>{const c=compileExample(name);return tiers.map(t=>({profile:name,...describeClaimBoundary(c,t)}));});
console.log(JSON.stringify({schemaVersion:'independent-claim-boundary-inventory.1',
  mode:'SYNTHETIC_RESEARCH_ONLY',officialTermsFixed:false,fundingPolicy:'OPEN',
  actualOfficialProofOnchain:'NOT_RUN',independentNewCollection:'NOT_IMPLEMENTED',
  sourcePrivacyCircuit:'NOT_IMPLEMENTED',grantOutbox:'HOLD',independentClaim:'NO_GO',
  productEligible:false,paymentAllowed:false,graphs},null,2));
