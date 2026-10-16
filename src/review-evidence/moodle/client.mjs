// Laboratory-only, read-only standard Moodle forum transport. No product imports.
const methods=new Set(['core_webservice_get_site_info','mod_forum_get_forums_by_courses','mod_forum_get_forum_discussions','mod_forum_get_discussion_post']);
export function createReviewClient({tokenProvider,fetchImpl=fetch,timeoutMs=5000}){
 if(typeof tokenProvider!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('REVIEW_CONFIG');
 const controller=new AbortController();let closed=false;
 async function call(method,params={},signal){
  if(!methods.has(method))throw Error('REVIEW_READ_ONLY');
  const keys={core_webservice_get_site_info:[],mod_forum_get_forums_by_courses:['courseids[0]'],
   mod_forum_get_forum_discussions:['forumid','page','perpage'],mod_forum_get_discussion_post:['postid']}[method];
  if(!params||Object.keys(params).length!==keys.length||!keys.every(k=>Object.hasOwn(params,k)
   &&/^[0-9]{1,10}$/.test(String(params[k]))))throw Error('REVIEW_PARAMETERS');
  const capturedArgs=Object.fromEntries(keys.map(k=>[k,String(params[k])]));
  if(closed||signal?.aborted)throw Error('REVIEW_CANCELLED');
  const combined=AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]);let reader;
  try{
   const token=await new Promise((resolve,reject)=>{
    const abort=()=>reject(Error('ABORT'));combined.addEventListener('abort',abort,{once:true});
    if(combined.aborted){abort();return;}
    Promise.resolve().then(tokenProvider).then(resolve,reject).finally(()=>combined.removeEventListener('abort',abort));
   });
   if(combined.aborted)throw Error('ABORT');
   if(typeof token!=='string'||!/^[a-f0-9]{32}$/.test(token))throw Error('REVIEW_AUTH');
   const r=await fetchImpl('http://127.0.0.1:18766/webservice/rest/server.php',{method:'POST',
    body:new URLSearchParams({wstoken:token,wsfunction:method,moodlewsrestformat:'json',...capturedArgs}),
    redirect:'error',credentials:'omit',cache:'no-store',signal:combined});
   if(r.status===401)throw Error('REVIEW_AUTH');if(r.status===403)throw Error('REVIEW_ACCESS');if(!r.ok)throw Error('REVIEW_UNAVAILABLE');
   reader=r.body.getReader();let n=0;const chunks=[];
   for(;;){const x=await reader.read();if(x.done)break;n+=x.value.length;if(n>262144)throw Error('REVIEW_RESPONSE_LIMIT');chunks.push(x.value);}
   if(combined.aborted)throw Error('ABORT');
   const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(v?.exception){
    if(v.errorcode==='invalidtoken')throw Error('REVIEW_AUTH');
    // Even invalidpostid is not proof of deletion or non-publication.
    if(v.errorcode==='invalidpostid')throw Error('REVIEW_NOT_FOUND_OR_UNAVAILABLE');
    throw Error('REVIEW_ACCESS');
   }
   return v;
  }catch(e){
   if(closed||signal?.aborted)throw Error('REVIEW_CANCELLED');
   if(combined.aborted)throw Error('REVIEW_TIMEOUT');
   if(['REVIEW_AUTH','REVIEW_ACCESS','REVIEW_UNAVAILABLE','REVIEW_RESPONSE_LIMIT','REVIEW_NOT_FOUND_OR_UNAVAILABLE'].includes(e?.message))throw Error(e.message);
   throw Error('REVIEW_UNAVAILABLE');
  }finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
 return Object.freeze({call,close(){closed=true;controller.abort();}});
}
