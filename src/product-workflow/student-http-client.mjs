// Browser-only C1 namespace. Inject an authenticated walletClient.request.
export const STUDENT_HTTP_VERSION='clear-mvp-student-http.1';
export function createStudentWorkflowClient({request}){
 if(typeof request!=='function')throw Error('MVP_CLIENT_CONFIG');
 const key=v=>{if(typeof v!=='string'||!/^[a-z][a-z0-9.-]{0,63}$/.test(v))throw Error('MVP_CLIENT_ID');return v;};
 const hash=v=>{if(typeof v!=='string'||!/^0x[0-9a-f]{64}$/.test(v))throw Error('MVP_CLIENT_ID');return v;};
 const check=v=>{if(!v||v.version!==STUDENT_HTTP_VERSION||v.userConsentVerified!==false||v.identityVerified!==false||v.policyPublished!==false
  ||v.productEligible!==false||v.paymentAllowed!==false||v.documentSubmissionReady!==false||v.grant!=='HOLD'||v.outbox!=='HOLD'||v.independentClaim!=='NO_GO')throw Error('MVP_CLIENT_RESPONSE');return v;};
 const call=async(path,options)=>check(await request(path,options));
 const list=async(path,options)=>{const v=await request(path,options);if(!Array.isArray(v))throw Error('MVP_CLIENT_RESPONSE');return v.map(check);};
 const post=(path,body,{idempotencyKey,signal}={})=>call(path,{method:'POST',body,idempotencyKey:key(idempotencyKey),signal});
 const path=id=>'/mvp/applications/'+hash(id);
 return Object.freeze({
  policies:options=>call('/mvp/policies',options),policy:(id,options)=>call('/mvp/policies/'+hash(id),options),
  list:options=>list('/mvp/applications',options),get:(id,options)=>call(path(id),options),
  create:(body,options)=>post('/mvp/applications',body,options),preview:(id,options)=>call(path(id)+'/agreement-preview',options),
  acknowledge:(id,body,options)=>post(path(id)+'/agreement',body,options),selectPolicy:(id,body,options)=>post(path(id)+'/policy-selection',body,options),
  acknowledgments:(id,options)=>list(path(id)+'/agreements',options),operation:(id,options)=>call('/mvp/student-operations/'+key(id),options),
  recoverCreate:(idempotencyKey,options)=>call('/mvp/applications/operations/'+key(idempotencyKey),options),
  recover:(id,kind,idempotencyKey,options)=>{if(!['agreement','policy-selection'].includes(kind))throw Error('MVP_CLIENT_ID');return call(path(id)+'/operations/'+kind+'/'+key(idempotencyKey),options);},
 });
}
