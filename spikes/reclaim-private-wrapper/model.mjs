// Public synthetic inputs ONLY. This module neither reads stored proofs nor opens a network.
import { Wallet, id, getBytes, hashMessage, Signature, verifyMessage } from 'ethers';
import { historyParams } from '../../src/ybm-collector/history-policy.mjs';
import { canonical, examFields, examKey } from '../../src/ybm-collector/values.mjs';
process.env.LOG_LEVEL='silent';
const core=await import('../../src/ybm-collector/node_modules/@reclaimprotocol/attestor-core/lib/index.js');

export const fixtureSigner = () => new Wallet(id('PUBLIC SYNTHETIC CLEAR WRAPPER SIGNER - NEVER FUND'));
export const fixtureOwner = () => new Wallet(id('PUBLIC SYNTHETIC CLEAR WRAPPER OWNER - NEVER FUND'));
export const PARAMS = core.canonicalStringify(historyParams());
export const PROVIDER_HASH = core.hashProviderParams(historyParams());
export const NOW = 1792108800;
export const FIELDS = Object.freeze({exam_type:'TOEIC', exam_date:'2026.10.10', registration_number:'123456', total_score:'850'});
export const SECOND = Object.freeze({...FIELDS,exam_date:'2026.09.20',registration_number:'654321',total_score:'700'});
export const rowHtml=f=>`<tr class="trSB" name="TOE"><td>TOEIC</td><td>${f.exam_date}(일)</td><td>${f.registration_number}</td><td>Total ${f.total_score} (LC 400, RC 450)</td></tr>`;
export const tableHtml=(f=FIELDS,second=SECOND)=>'<table>'+rowHtml(f)+rowHtml(second)+'</table>';
export const REGISTRATION = Object.freeze({
  version:'PUBLIC_SYNTHETIC_REGISTRATION_ONLY', application:id('synthetic application A'),
  // Product-owned reuse scope, intentionally distinct from recipient/owner/policy revision.
  reuseScope:id('synthetic institution/product/award-cycle A'),
  recipient:'0x1111111111111111111111111111111111111111', owner:fixtureOwner().address.toLowerCase(),
  chainId:431798, verifyingContract:'0x2222222222222222222222222222222222222222',
  threshold:750, periodFrom:20261001, periodUntil:20261031,
  sourcePolicyHash:id(PARAMS), programProfile:'reclaim-wrapper-whole-table-two-rows-six-digit-v1',
});
const requireValue=(x,c)=>{if(!x)throw Error(c);};
export const registrationDigest = r => id(canonical(r));
export const contextFor = (r, fields, second=SECOND) => core.canonicalStringify({
  clearBinding: registrationDigest(r), extractedParameters:{history_html:tableHtml(fields,second)}, providerHash:PROVIDER_HASH,
});
export function parseTable(context) {
  const html=JSON.parse(context).extractedParameters.history_html;
  const pattern=/<tr class="trSB" name="TOE"><td>TOEIC<\/td><td>(\d{4}\.\d{2}\.\d{2})\(일\)<\/td><td>(\d{6})<\/td><td>Total (\d{3}) \(LC 400, RC 450\)<\/td><\/tr>/g;
  const rows=Array.from(html.matchAll(pattern),m=>({exam_type:'TOEIC',exam_date:m[1],registration_number:m[2],total_score:m[3]}));
  requireValue(rows.length===2 && html===tableHtml(...rows),'TABLE_GRAMMAR');return rows;
}

// This replaces a per-session CLEAR instruction with an already registered,
// verifier-owned public record. A real registry enrollment is not implemented.
export function requestFor(r=REGISTRATION) {
  requireValue(r.version===REGISTRATION.version && r.sourcePolicyHash===id(PARAMS), 'REGISTRATION_POLICY');
  return {name:'http', params:JSON.parse(PARAMS), owner:r.owner,
    context:{clearBinding:registrationDigest(r)}, requiresClearSession:false};
}
export async function signedFixture({r=REGISTRATION, fields=FIELDS, second=SECOND, timestampS=NOW-10, epoch=1, params=PARAMS, context}={}) {
  const claim={provider:'http', parameters:params, context:context??contextFor(r,fields,second), owner:r.owner, timestampS, epoch};
  claim.identifier=core.getIdentifierFromClaimInfo({...claim});
  const signature=await fixtureSigner().signMessage(core.createSignDataForClaim({...claim}));
  return {claim,signature,attestor:fixtureSigner().address.toLowerCase()};
}
export async function verifyFixture(p,r=REGISTRATION,now=NOW) {
  const c=p.claim;
  requireValue(p.attestor===fixtureSigner().address.toLowerCase(),'TRUST');
  requireValue(c.identifier===core.getIdentifierFromClaimInfo({...c}),'IDENTIFIER');
  await core.assertValidClaimSignatures({claim:c,signatures:{claimSignature:getBytes(p.signature),attestorAddress:p.attestor}});
  requireValue(c.provider==='http'&&c.parameters===PARAMS,'SOURCE');
  requireValue(c.owner===r.owner&&c.epoch===1,'OWNER_EPOCH');
  requireValue(Number.isSafeInteger(c.timestampS)&&c.timestampS<=now&&c.timestampS>=now-1800,'TIME');
  const [f,second]=parseTable(c.context);
  requireValue(c.context===contextFor(r,f,second),'CONTEXT');
  const normalized=examFields(f,'score');
  requireValue(f.registration_number.length===6&&f.total_score.length===3&&f.exam_date===normalized.exam_date.replaceAll('-','.'),'BOUNDED_PROFILE');
  const day=Number(normalized.exam_date.replaceAll('-',''));
  requireValue(day>=r.periodFrom&&day<=r.periodUntil&&Date.parse(normalized.exam_date+'T00:00:00+09:00')/1000<=now&&Number(f.total_score)>=r.threshold,'PREDICATE');
  return {predicate:true, binding:registrationDigest(r), sourceReuse:'UNRESOLVED', paymentAllowed:false};
}
export function witnessFor(p,r=REGISTRATION,now=NOW) {
  const [f,second]=parseTable(p.claim.context);
  return { binding:Array.from(getBytes(registrationDigest(r))), owner:Array.from(getBytes(r.owner)),
    threshold:r.threshold, period_from:r.periodFrom, period_until:r.periodUntil, now,
    exam_date:Array.from(Buffer.from(f.exam_date)), registration_number:Array.from(Buffer.from(f.registration_number)),
    second_date:Array.from(Buffer.from(second.exam_date)),second_number:Array.from(Buffer.from(second.registration_number)),second_score:Array.from(Buffer.from(second.total_score)),
    score:Array.from(Buffer.from(f.total_score)), timestamp:Array.from(Buffer.from(String(p.claim.timestampS))),
    signature:[...getBytes(Signature.from(p.signature).r),...getBytes(Signature.from(p.signature).s)],
  };
}
export const privateSourceKey = f => examKey(examFields(f,'score'));
// Rejected candidates exposed only for counterexample tests; NOT claim API.
export const unsafePublicHash = (f,scope)=>id(canonical([scope,privateSourceKey(f)]));
export const unsafeSaltHash = (f,scope,salt)=>id(canonical([scope,privateSourceKey(f),salt]));
export function requireSourceNullifier() { throw Error('BLOCKED_NO_VERIFIED_STABLE_HIGH_ENTROPY_SOURCE_SECRET_OR_OBLIVIOUS_SERVICE'); }
export { core, hashMessage, verifyMessage };
