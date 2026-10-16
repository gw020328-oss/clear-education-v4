import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SigningKey,computeAddress,getBytes,hashMessage,id} from 'ethers';
import {canonical,exactKeys} from '../../../src/ybm-collector/values.mjs';
import {historyParams} from '../../../src/ybm-collector/history-policy.mjs';
import {core} from '../model.mjs';
import {parsePrivateTable} from './parser.mjs';
const fail=c=>{throw Error(c);};
export const sourceParams=canonical(historyParams());
export const sourceHash=id(sourceParams);
export const programProfile='clear-private-table-v2-adapter-only';
const snapshot=JSON.parse(await readFile(new URL('./registry-snapshot.json',import.meta.url),'utf8'));
export const registryDigest=createHash('sha256').update(canonical(snapshot)).digest('hex');
const officialAddresses=Object.freeze([...snapshot.addresses]);
export const observedRegistry=Object.freeze({digest:registryDigest,addresses:officialAddresses,retrievedAt:snapshot.retrievedAt,epoch:1,epochIsTimeWindow:false});
export const bindingDigest=r=>id(canonical(r));
export function requestFor(record){validateRecord(record);if(record.registryDigest!==registryDigest)fail('REGISTRY_PIN');return {params:historyParams(),owner:record.owner,context:{clearBinding:bindingDigest(record)}};}
export function assessRegistryTime(now){
 const start=Math.floor(Date.parse(snapshot.retrievedAt)/1000);
 if(!Number.isSafeInteger(now)||now<start||now>=start+86400)fail('REGISTRY_SNAPSHOT_EXPIRED');
 return {valid:true,epochIsTimeWindow:false,refreshRequiresReview:true};
}
export const makeContext=(r,html)=>canonical({clearBinding:bindingDigest(r),extractedParameters:{history_html:html},providerHash:core.hashProviderParams(historyParams())});
function validateRecord(r){
  exactKeys(r,['version','application','reuseScope','recipient','owner','chainId','verifyingContract','threshold','periodFrom','periodUntil','sourceHash','programProfile','registryDigest','createdAt','expiresAt']);
  if(r.version!=='PRIVATE_WRAPPER_V2_RESEARCH'||r.sourceHash!==sourceHash||r.programProfile!==programProfile)fail('REGISTRATION_POLICY');
  for(const k of ['application','reuseScope'])if(!/^0x[0-9a-f]{64}$/.test(r[k]))fail('REGISTRATION_ID');
  for(const k of ['recipient','owner','verifyingContract'])if(!/^0x[0-9a-f]{40}$/.test(r[k])||/^0x0{40}$/.test(r[k]))fail('REGISTRATION_ADDRESS');
  for(const k of ['chainId','threshold','periodFrom','periodUntil','createdAt','expiresAt'])if(!Number.isSafeInteger(r[k]))fail('REGISTRATION_NUMBER');
  if(r.chainId<=0||r.threshold<10||r.threshold>990||r.threshold%5||r.periodFrom>r.periodUntil||r.createdAt>=r.expiresAt)fail('REGISTRATION_POLICY');
}
// Factory record/trust/clock are verifier-owned. Claim fields never supply them.
function verifier({record,addresses,digest,clock,notBefore,notAfter,mode}) {
  validateRecord(record);if(record.registryDigest!==digest)fail('REGISTRY_PIN');
  const r=Object.freeze(structuredClone(record)),trusted=new Set(addresses),expectedBinding=bindingDigest(r);
  return async proof=>{
    const now=clock();if(!Number.isSafeInteger(now)||now<notBefore||now>=notAfter)fail('REGISTRY_SNAPSHOT_EXPIRED');
    if(now<r.createdAt||now>=r.expiresAt)fail('REGISTRATION_EXPIRED');
    if(Buffer.byteLength(JSON.stringify(proof))>65536)fail('CLAIM_SIZE');
    exactKeys(proof,['claim','signature','attestor']);const c=proof.claim;
    exactKeys(c,['provider','parameters','owner','timestampS','context','identifier','epoch']);
    if(!trusted.has(proof.attestor)||c.epoch!==1)fail('SIGNER_EPOCH');
    if(c.provider!=='http'||c.parameters!==sourceParams||c.owner!==r.owner)fail('SOURCE_OWNER');
    if(!Number.isSafeInteger(c.timestampS)||c.timestampS<r.createdAt||c.timestampS>now||c.timestampS<now-1800)fail('PROOF_TIME');
    if(typeof c.context!=='string'||c.context!==canonical(JSON.parse(c.context)))fail('CONTEXT_ENCODING');
    const ctx=JSON.parse(c.context);exactKeys(ctx,['clearBinding','extractedParameters','providerHash']);exactKeys(ctx.extractedParameters,['history_html']);
    if(ctx.clearBinding!==expectedBinding||ctx.providerHash!==core.hashProviderParams(historyParams()))fail('CONTEXT_BINDING');
    if(core.getIdentifierFromClaimInfo({...c})!==c.identifier)fail('IDENTIFIER');
    if(typeof proof.signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(proof.signature))fail('SIGNATURE');
    const publicKey=SigningKey.recoverPublicKey(hashMessage(core.createSignDataForClaim({...c})),proof.signature);
    if(!trusted.has(computeAddress(publicKey).toLowerCase())||computeAddress(publicKey).toLowerCase()!==proof.attestor)fail('SIGNATURE');
    await core.assertValidClaimSignatures({claim:c,signatures:{claimSignature:getBytes(proof.signature),attestorAddress:proof.attestor}});
    if(typeof ctx.extractedParameters.history_html!=='string')fail('HTML_TYPE');
    const html=Buffer.from(ctx.extractedParameters.history_html),rows=parsePrivateTable(html);
    const matching=rows.filter(({fields:f})=>{const day=Number(f.exam_date.replaceAll('-',''));return day>=r.periodFrom&&day<=r.periodUntil&&Date.parse(f.exam_date+'T00:00:00+09:00')/1000<=now&&Number(f.total_score)>=r.threshold;});
    if(!matching.length)fail('NO_QUALIFYING_ROW');
    // These facts remain PRIVATE to this local process; caller must never publish them.
    return {private:{html,rows,matching,publicKey},public:{scope:mode,claimSignatureVerified:true,sourcePolicyPinned:true,
      wholeTableIntegrity:true,sourceCoverageConfirmed:false,zkParserIntegrated:false,independentClaim:'NO_GO',paymentAllowed:false}};
  };
}
export function officialVerifier(record){
  const observed=Math.floor(Date.parse(snapshot.retrievedAt)/1000);
  return verifier({record,addresses:officialAddresses,digest:registryDigest,clock:()=>Math.floor(Date.now()/1000),notBefore:observed,notAfter:observed+86400,mode:'OFFICIAL_REGISTRY_PINNED_ADAPTER_ONLY'});
}
// Explicit test factory cannot masquerade as official trust or a production capability.
export function syntheticVerifier({record,signer,clock}){
  if(!record.application.startsWith('0x'))fail('SYNTHETIC_RECORD');
  return verifier({record,addresses:[signer],digest:record.registryDigest,clock,notBefore:record.createdAt,notAfter:record.expiresAt,mode:'PUBLIC_SYNTHETIC_ONLY'});
}
export function assertRegistryUnchanged(raw){
  const value=JSON.parse(raw);exactKeys(value,['data']);
  const addresses=value.data.map(x=>{exactKeys(x,['address']);if(!/^0x[0-9a-fA-F]{40}$/.test(x.address))fail('REGISTRY_SCHEMA');return x.address.toLowerCase();}).sort();
  if(canonical(addresses)!==canonical(officialAddresses))fail('REGISTRY_CHANGED_REVIEW_REQUIRED');
  return {unchanged:true,digest:registryDigest,epochWindowAvailable:false};
}
