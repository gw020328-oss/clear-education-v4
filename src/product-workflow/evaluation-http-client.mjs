// Browser-only C3 client; no Evidence/Context construction or persistence.
export const EVALUATION_HTTP_VERSION='clear-mvp-evidence-http.1';
export function createEvaluationWorkflowClient({request}){
 if(typeof request!=='function')throw Error('EVAL_CLIENT_CONFIG');
 const id=v=>{if(typeof v!=='string'||!/^[a-z][a-z0-9.-]{0,63}$/.test(v))throw Error('EVAL_CLIENT_ID');return v;};
 const app=v=>{if(typeof v!=='string'||!/^0x[0-9a-f]{64}$/.test(v))throw Error('EVAL_CLIENT_ID');return '/mvp/applications/'+v;};
 const check=v=>{if(!v||v.version!==EVALUATION_HTTP_VERSION||v.dataMode!=='SYNTHETIC'||v.realDataAllowed!==false||v.evidenceAcceptanceReady!==false||v.identityVerified!==false||v.sourceVerified!==false||v.policyPublished!==false||v.userConsentVerified!==false||v.productEligible!==false||v.paymentAllowed!==false||v.claimAuthority!==false||v.grant!=='HOLD'||v.outbox!=='HOLD'||v.independentClaim!=='NO_GO')throw Error('EVAL_CLIENT_RESPONSE');return v;};
 const call=async(path,options)=>check(await request(path,options));
 const list=async(path,options)=>{const r=await request(path,options);if(!Array.isArray(r))throw Error('EVAL_CLIENT_RESPONSE');return r.map(check);};
 const post=(path,body,{idempotencyKey,signal}={})=>call(path,{method:'POST',body,idempotencyKey:id(idempotencyKey),signal});
 return Object.freeze({preview:(a,options)=>call(app(a)+'/evaluation-preview',options),
  accept:(a,body,options)=>post(app(a)+'/evidence-receipts',body,options),receipts:(a,options)=>list(app(a)+'/evidence-receipts',options),receipt:(a,r,options)=>call(app(a)+'/evidence-receipts/'+id(r),options),
  select:(a,body,options)=>post(app(a)+'/evaluation-selection',body,options),finalize:(a,body,options)=>post(app(a)+'/evaluation-finalization',body,options),
  evaluate:(a,body,options)=>post(app(a)+'/evaluations',body,options),decisions:(a,options)=>list(app(a)+'/evaluations',options),decision:(a,r,options)=>call(app(a)+'/evaluations/'+id(r),options),
  operation:(a,r,options)=>call(app(a)+'/evaluation-operations/'+id(r),options),recover:(a,kind,key,options)=>{if(!['evidence-receipts','evaluation-selection','evaluation-finalization','evaluations'].includes(kind))throw Error('EVAL_CLIENT_ID');return call(app(a)+'/evaluation-operations/'+kind+'/'+id(key),options);},
 });
}
