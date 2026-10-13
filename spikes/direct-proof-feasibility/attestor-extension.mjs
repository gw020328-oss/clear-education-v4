// Candidate SERVER extension for pinned attestor-core, not a hosted deployment.
// Only the patched assertValidClaimRequest calls complete() after the upstream
// handshake, transcript, request-signature and TLS authentication checks.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {inspectRecord,scopedOprfInput,OPRF_DOMAIN,policyHash} from './record-policy.mjs';
const require=createRequire(new URL('../../src/ybm-collector/package.json',import.meta.url));
process.env.LOG_LEVEL='silent';
const sdk=await import(require.resolve('@reclaimprotocol/attestor-core'));
const {getAddress}=require('ethers');
const {quiet}=await import('../../src/ybm-collector/client.mjs');
export const PROVIDER='clear-private-exam-v1';
const hex=/^[0-9a-f]{64}$/;
const fail=code=>{throw Error(code);};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
const canonical=sdk.canonicalStringify;
function binding(value){
 if(!exact(value,['application','recipient','chainId','consumer']))fail('BINDING_SCHEMA');
 if(!hex.test(value.application)||typeof value.application!=='string'||!Number.isSafeInteger(value.chainId)||value.chainId<1)fail('BINDING_VALUE');
 for(const field of ['recipient','consumer'])if(typeof value[field]!=='string'||getAddress(value[field]).toLowerCase()!==value[field]||/^0x0{40}$/.test(value[field]))fail('BINDING_ADDRESS');
 return {...value};
}
export function extensionConfiguration({sourceUrl,businessScope,keyFingerprint,evaluateOprf}){
 const url=new URL(sourceUrl);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||typeof businessScope!=='string'||!hex.test(businessScope)||typeof keyFingerprint!=='string'||!hex.test(keyFingerprint)||typeof evaluateOprf!=='function')fail('DEPLOYMENT_CONFIG');
 const params={url:sourceUrl,method:'GET',headers:{'Accept-Encoding':'identity','User-Agent':'reclaim/0.0.1'},responseMatches:[{type:'contains',value:'TOEIC'}],responseRedactions:[]};
 Object.freeze(params.headers);for(const m of params.responseMatches)Object.freeze(m);Object.freeze(params.responseMatches);Object.freeze(params.responseRedactions);
 const parameters=canonical(params);
 const extensionPolicy=createHash('sha256').update(canonical({provider:PROVIDER,recordPolicy:policyHash,parameters,oprfDomain:OPRF_DOMAIN,businessScope,keyFingerprint,fullServerReveal:true,revision:1})).digest('hex');
 return Object.freeze({params:Object.freeze(params),parameters,extensionPolicy,businessScope,keyFingerprint,evaluateOprf});
}

export function preflightExtension(request){
 if(request.data?.provider!==PROVIDER)return;
 // No caller-defined TOPRF/raw replacement or redaction is allowed on server
 // records. The extension computes its own OPRF AFTER authenticating full bytes.
 for(const p of request.transcript??[]){
  if(p.sender!==1&&p.sender!==2)fail('TRANSCRIPT_SENDER');
  if(p.sender===2&&p.reveal?.zkReveal)fail('SERVER_TRANSFORM_FORBIDDEN');
 }
}

export function makeExtension(config){
 return async function complete({request,metadata,receipt,applData,data}){
  try{
   preflightExtension(request);
   if(data.provider!==PROVIDER||data.parameters!==config.parameters)fail('PINNED_PROVIDER_PARAMS');
   const source=new URL(config.params.url);
   if(request.request?.host!==source.hostname||receipt.hostname!==source.hostname||request.request?.port!==Number(source.port||443))fail('TLS_SOURCE_ORIGIN');
   const requestBytes=Buffer.concat(applData.filter(p=>p.sender==='client').map(p=>Buffer.from(p.message)));
   const prefix=Buffer.from(`GET ${source.pathname} HTTP/1.1\r\nHost: ${source.host}\r\nConnection: close\r\n`);
   if(!requestBytes.subarray(0,prefix.length).equals(prefix))fail('UNREDACTED_SOURCE_PATH');
   const approvedBinding=binding(JSON.parse(data.context));
   if(metadata.clientVersion!==sdk.proto.AttestorVersion.ATTESTOR_VERSION_3_2_0)fail('CLIENT_VERSION');
   if(receipt.transcript.some(p=>p.sender==='server'&&p.redacted!==false)||receipt.oprfRawReplacements?.length)fail('FULL_AUTHENTICATED_SERVER_REQUIRED');
   await sdk.providers.http.assertValidProviderReceipt({clientVersion:metadata.clientVersion,receipt:applData,params:JSON.parse(config.parameters),logger:quiet,ctx:{version:metadata.clientVersion}});
   const parser=sdk.makeHttpResponseParser();
   for(const p of applData)if(p.sender==='server')parser.onChunk(p.message);
   parser.streamEnded();
   if(parser.res.statusCode!==200||!parser.res.complete)fail('HTTP_STATUS_OR_COMPLETENESS');
   const record=inspectRecord(Buffer.from(parser.res.body));
   const result=await config.evaluateOprf(scopedOprfInput(record.identity,config.businessScope),OPRF_DOMAIN);
   if(result.keyFingerprint!==config.keyFingerprint||!(result.output instanceof Uint8Array)||result.output.length!==32||result.output.every(x=>x===0))fail('OPRF_CONFIGURATION');
   const context=canonical({binding:approvedBinding,sourceBound:{revision:1,policy:config.extensionPolicy,scope:config.businessScope,key:config.keyFingerprint,nullifier:Buffer.from(result.output).toString('hex'),qualified:true}});
   // Build a new allowlisted claim. Never spread arbitrary caller context or
   // include full receipt, captures, errors, row offsets or identity prehash.
   return {provider:PROVIDER,parameters:config.parameters,context,owner:data.owner,timestampS:data.timestampS};
  }catch{fail('SOURCE_BOUND_EXTENSION_REJECTED');}
 };
}

export function projectPublicProof(response){
 if(!response.claim||response.error||!response.signatures?.claimSignature?.length)fail('NO_VALID_CLAIM');
 const c=response.claim;
 return {claim:{provider:c.provider,parameters:c.parameters,context:c.context,owner:c.owner,timestampS:c.timestampS,epoch:c.epoch,identifier:c.identifier},signer:response.signatures.attestorAddress,signature:Buffer.from(response.signatures.claimSignature).toString('hex')};
}

// `expected` is pinned from independently trusted enrollment/deployment state,
// never from the proof itself. Official hosted witness addresses are NOT here.
export async function verifyPublicProof(proof,{config,witness,owner,binding:expectedBinding,now,epoch=1,maxAge=300}){
 try{
  if(!exact(proof,['claim','signer','signature'])||!exact(proof.claim,['provider','parameters','context','owner','timestampS','epoch','identifier']))fail('PUBLIC_SCHEMA');
  const c=proof.claim;
  if(c.provider!==PROVIDER||c.parameters!==config.parameters||c.owner!==owner||c.epoch!==epoch||proof.signer.toLowerCase()!==witness.toLowerCase())fail('PUBLIC_POLICY');
  if(!Number.isSafeInteger(maxAge)||maxAge<1||!Number.isSafeInteger(now)||!Number.isSafeInteger(c.timestampS)||c.timestampS>now+30||c.timestampS<now-maxAge)fail('PUBLIC_TIME');
  const ctx=JSON.parse(c.context),fact=ctx.sourceBound;
  if(!exact(ctx,['binding','sourceBound'])||canonical(binding(ctx.binding))!==canonical(binding(expectedBinding)))fail('PUBLIC_BINDING');
  if(!exact(fact,['revision','policy','scope','key','nullifier','qualified'])||fact.revision!==1||fact.policy!==config.extensionPolicy||fact.scope!==config.businessScope||fact.key!==config.keyFingerprint||fact.qualified!==true||typeof fact.nullifier!=='string'||!hex.test(fact.nullifier)||/^0+$/.test(fact.nullifier))fail('PUBLIC_FACT');
  if(c.context!==canonical(ctx)||c.identifier!==sdk.getIdentifierFromClaimInfo({...c})||!/^([0-9a-f]{2}){65}$/.test(proof.signature))fail('PUBLIC_ENCODING');
  await sdk.assertValidClaimSignatures({claim:c,signatures:{attestorAddress:witness,claimSignature:Buffer.from(proof.signature,'hex')}});
  return {nullifier:fact.nullifier,businessScope:fact.scope};
 }catch{fail('PUBLIC_PROOF_REJECTED');}
}
