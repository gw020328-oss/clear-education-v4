import {Wallet,JsonRpcProvider,getCreateAddress} from 'ethers';
import fs from 'node:fs';
import {server,send,jsonBody,serve,staticFile} from './static.mjs';
import {approveReview,providerCommitment,participantEnrollment,createCompiler} from '../../stage15/policy/binding.mjs';
import {packet,statement,fields,expected,cachedDraft,emptyDraft,validateDraft} from '../policy/product.mjs';
import {callGemini,budget} from '../ai/client.mjs';
import {deployBound,enrollBound} from '../../stage15/lib/chain.mjs';
import {save,sha,read,root} from '../lib/io.mjs';
let config,provider,payer,participant,reviewer,service,source=packet(statement),draft=null,review=null,bundle=null,plan=null,anchor=null,acceptance=null,receipts=[],busy=false;
const ask=type=>new Promise((resolve,reject)=>{const listener=m=>{if(m.type===type+'Result'){process.off('message',listener);m.error?reject(Error(m.error)):resolve(m);}};process.on('message',listener);process.send({type,plan});});
const publicState=()=>({draft,source,review:review?{policySpecHash:review.reviewed.policySpecHash,values:review.humanReview.values}:null,providerSigned:Boolean(bundle?.provider),participantSigned:Boolean(bundle?.enrollment),deposited:Boolean(anchor),plan,anchor,receipts,acceptance,budget:budget(),recoveryURL:config.recoveryURL,mode:config.mode,localDemo:true});
process.on('message',async m=>{if(m.type!=='init')return;try{
 config=m;provider=new JsonRpcProvider(m.rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=50;payer=new Wallet(m.keys.payer,provider);participant=new Wallet(m.keys.participant,provider);reviewer=new Wallet(m.keys.reviewer);delete m.keys;
 service=await server(async(req,res)=>{const url=new URL(req.url,'http://local');
  if(url.pathname==='/health')return send(res,{ok:true});
  if(url.pathname==='/api/state')return send(res,publicState());
  if(req.method!=='POST')return serve(res,staticFile(url.pathname));
  if(busy)return send(res,{error:'BUSY'},409);busy=true;
  try{const input=await jsonBody(req);let output;
   if(url.pathname==='/api/draft'){
    if(review)throw Error('ALREADY_APPROVED');source=packet(input.text);let ai;
    if(input.mode==='live'){ai=await callGemini(source,{caseId:input.caseId??'complete'});if(ai.status!=='VALID')return send(res,{error:ai.status,ai},422);draft=ai.parsed;}
    else if(input.mode==='manual')draft=emptyDraft();
    else if(input.mode==='cached'){const cache=read('ai/cache-checksum.json');if(sha(fs.readFileSync(root+'/ai/cached-examples.json'))!==cache.sha256)throw Error('CACHE_CHECKSUM_MISMATCH');const example=read('ai/cached-examples.json').examples.find(e=>e.source.text===source.text);if(!example)throw Error('NO_CACHED_EXAMPLE');draft=structuredClone(example.draft);}
    else throw Error('UNKNOWN_MODE');
    if(validateDraft(draft,source).length)throw Error('DRAFT_INVALID');config.mode=input.mode;
    save(`${config.run}/draft-${Date.now()}.json`,{mode:input.mode,source,draft,ai:ai??null,cachedChecksum:input.mode==='cached'?sha(JSON.stringify(draft)):null});output=publicState();
   }else if(url.pathname==='/api/approve'){
    if(!draft||review)throw Error('REVIEW_STATE');
    if(!Array.isArray(input.questions)||draft.ambiguities.some(q=>!input.questions.some(a=>a.field===q.field&&a.question===q.question&&a.answer?.trim())))throw Error('UNRESOLVED_AMBIGUITY');
    review=await approveReview(input,source,{token:config.token,issuer:config.issuer,reviewer,payer:payer.address,now:1893456000});save(`${config.run}/review.json`,review);bundle={reviewed:review.reviewed};output=publicState();
   }else if(url.pathname==='/api/provider-sign'){
    if(!review||bundle.provider)throw Error('REVIEW_REQUIRED');const nonce=await provider.getTransactionCount(payer.address,'pending');config.vault=getCreateAddress({from:payer.address,nonce}).toLowerCase();bundle.provider=await providerCommitment(review.reviewed,config.vault,payer);save(`${config.run}/provider-commitment.json`,bundle.provider);output=publicState();
   }else if(url.pathname==='/api/participant-sign'){
    if(!bundle?.provider||bundle.enrollment)throw Error('PROVIDER_SIGNATURE_REQUIRED');bundle.enrollment=await participantEnrollment(review.reviewed,config.vault,participant,1893456000);plan=createCompiler(review.trust)(bundle,1893456000);save(`${config.run}/signed-bundle.json`,bundle);save(`${config.run}/runtime-plan.json`,plan);output=publicState();
   }else if(url.pathname==='/api/deposit'){
    if(!bundle?.enrollment||anchor)throw Error('BOTH_SIGNATURES_REQUIRED');const compiler=createCompiler(review.trust),deployed=await deployBound(compiler,bundle,provider,payer);anchor=deployed.anchor;acceptance=await enrollBound(compiler,bundle,provider,anchor,payer,participant);save(`${config.run}/deposit.json`,{anchor,acceptance,plan,trust:review.trust,bundle});process.send({type:'deposited',packet:{anchor,acceptance,plan,trust:review.trust,bundle}});output=publicState();
   }else if(url.pathname==='/api/issue'){
    if(!anchor||receipts.length)throw Error('DEPOSIT_REQUIRED');const result=await ask('issue');receipts=result.receipts;save(`${config.run}/evidence.json`,receipts);output=publicState();
   }else if(url.pathname==='/api/stop'){
    if(receipts.length!==4)throw Error('FOUR_RECEIPTS_REQUIRED');send(res,{stopping:true,recoveryURL:config.recoveryURL});process.send({type:'stopBusiness'});return;
   }else throw Error('NOT_FOUND');send(res,output);
  }finally{busy=false;}
 });process.send({type:'ready',port:service.address().port});
}catch{process.send({type:'error',code:'MAIN_INIT_FAILED'});}});
process.on('SIGTERM',()=>{provider?.destroy();service?.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref();});
