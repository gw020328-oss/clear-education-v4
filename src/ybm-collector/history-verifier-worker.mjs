import net from 'node:net';
import dns from 'node:dns';
import {syncBuiltinESMExports} from 'node:module';
net.Socket.prototype.connect=()=>{throw new Error('VERIFIER_OFFLINE');};
dns.lookup=()=>{throw new Error('VERIFIER_OFFLINE');};
globalThis.fetch=()=>{throw new Error('VERIFIER_OFFLINE');};
syncBuiltinESMExports();process.env.LOG_LEVEL='silent';
for(const k of ['log','warn','error','info','debug'])console[k]=()=>{};
let used=false;
process.on('message',async input=>{if(used)return;used=true;let result;
try{
 const {verifyHistory}=await import('./history-verifier.mjs');
 const verified=await verifyHistory(input);
 const {parse}=await import('parse5'),{canonical}=await import('./values.mjs');
 const changed=structuredClone(input),ctx=JSON.parse(changed.proof.claim.context),html=ctx.extractedParameters.history_html;
 const nodes=n=>[n,...(n.childNodes??[]).flatMap(nodes)];
 const row=nodes(parse(html,{sourceCodeLocationInfo:true})).find(n=>n.tagName==='tr'&&(n.attrs??[]).some(a=>a.name==='name'&&a.value==='TOE'));
 if(!row?.sourceCodeLocation)throw new Error('HISTORY_TABLE');
 const pos=row.sourceCodeLocation;ctx.extractedParameters.history_html=html.slice(0,pos.startOffset)+html.slice(pos.endOffset);
 changed.proof.claim.context=canonical(ctx);
 const core=await import('@reclaimprotocol/attestor-core');changed.proof.claim.identifier=core.getIdentifierFromClaimInfo(changed.proof.claim);
 let signedRowDeletionRejected=false;try{await verifyHistory(changed);}catch{signedRowDeletionRejected=true;}
 if(!signedRowDeletionRejected)throw new Error('HISTORY_TABLE');
 result={ok:true,result:{...verified,signedRowDeletionRejected,independentProcess:true}};
 }
catch(error){const codes=new Set(['HISTORY_SIZE','SOURCE_POLICY','PROOF_CONTEXT','CLAIM_OWNER','PROOF_TIME','CLAIM_IDENTIFIER','SCHEMA_KEYS','UNTRUSTED_ATTESTOR']);result={ok:false,reason:codes.has(error.message)?error.message:'HISTORY_VERIFIER_REJECTED'};}
process.send?.(result,()=>process.disconnect());});
process.on('disconnect',()=>process.exit(0));
