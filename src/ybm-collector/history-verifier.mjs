import {canonical,requireValue,exactKeys} from './values.mjs';
import {historyParams,historyPolicyHash,inspectHistory} from './history-policy.mjs';
import {validateTrust} from './trust.mjs';
export async function verifyHistory(input,now=Math.floor(Date.now()/1000)){
 requireValue(Buffer.byteLength(JSON.stringify(input))<=2*1024*1024,'HISTORY_SIZE');
 const {proof,expected,trust}=input;
 const trusted=validateTrust(trust),c=proof.claim;
 requireValue(trusted.includes(proof.attestor.toLowerCase()),'UNTRUSTED_ATTESTOR');
 requireValue(c.provider==='http'&&c.owner.toLowerCase()===expected.owner.toLowerCase(),'CLAIM_OWNER');
 requireValue(c.timestampS>=expected.createdAt&&c.timestampS<=now+60&&c.timestampS>=now-1800,'PROOF_TIME');
 const core=await import('@reclaimprotocol/attestor-core');
 requireValue(core.getIdentifierFromClaimInfo(c)===c.identifier,'CLAIM_IDENTIFIER');
 await core.assertValidClaimSignatures({claim:c,signatures:{claimSignature:Buffer.from(proof.signature.slice(2),'hex'),attestorAddress:proof.attestor}});
 const params=JSON.parse(c.parameters),context=JSON.parse(c.context);
 requireValue(canonical(params)===canonical(historyParams()),'SOURCE_POLICY');
 requireValue(context.historyNonce===expected.nonce&&context.historyPolicyHash===historyPolicyHash&&context.purpose==='YBM_HISTORY_SPIKE_NO_PAYMENT','PROOF_CONTEXT');
 if(context.providerHash)requireValue(context.providerHash===core.hashProviderParams(params),'PROVIDER_HASH');
 exactKeys(context.extractedParameters,['history_html']);
 const html=context.extractedParameters.history_html;
 requireValue(/^<table\b[^*>]*>[^*]*<\/table>$/is.test(html),'HISTORY_TABLE');
 const summary=inspectHistory(html,now*1000);
 requireValue(summary.layoutSupported&&summary.tableCount===1&&!summary.duplicateRows&&!summary.redactionInScoreTable,'HISTORY_TABLE');
 // Signed whole table != proof of the service's complete historical database.
 // Source pagination, account identity and a closed date window remain gates.
 return {...summary,proofVerified:true,sourcePolicyPinned:true,completeResponseClaim:false,wholeHistoryTableClaim:true,provedTableRowIntegrity:true,attestorCount:1};
}
