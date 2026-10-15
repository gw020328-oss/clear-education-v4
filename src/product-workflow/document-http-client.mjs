// Browser-only C2 adapter. No file persistence, auth keys, Node or observer code.
export const DOCUMENT_HTTP_VERSION='clear-mvp-document-http.1';
export function createDocumentWorkflowClient({request}){
 if(typeof request!=='function')throw Error('DOC_CLIENT_CONFIG');
 const key=v=>{if(typeof v!=='string'||!/^[a-z][a-z0-9.-]{0,63}$/.test(v))throw Error('DOC_CLIENT_ID');return v;};
 const app=v=>{if(typeof v!=='string'||!/^0x[0-9a-f]{64}$/.test(v))throw Error('DOC_CLIENT_ID');return '/mvp/applications/'+v;};
 const check=v=>{if(!v||v.version!==DOCUMENT_HTTP_VERSION||v.dataMode!=='SYNTHETIC'||v.userConsentVerified!==false||v.identityVerified!==false||v.sourceVerified!==false||v.policyPublished!==false
  ||v.productEligible!==false||v.paymentAllowed!==false||v.documentSubmissionReady!==false||v.realDataAllowed!==false||v.imageDecodeReady!==false||v.grant!=='HOLD'||v.outbox!=='HOLD'||v.independentClaim!=='NO_GO')throw Error('DOC_CLIENT_RESPONSE');return v;};
 const call=async(path,options)=>check(await request(path,options));
 const post=(path,body,{idempotencyKey,signal}={})=>call(path,{method:'POST',body,idempotencyKey:key(idempotencyKey),signal});
 return Object.freeze({preview:(id,options)=>call(app(id)+'/document-preview',options),
  acknowledge:(id,body,options)=>post(app(id)+'/document-agreement',body,options),submit:(id,body,options)=>post(app(id)+'/submissions',body,options),
  submissions:async(id,options)=>{const rows=await request(app(id)+'/submissions',options);if(!Array.isArray(rows))throw Error('DOC_CLIENT_RESPONSE');return rows.map(check);},
  submission:(id,sub,options)=>call(app(id)+'/submissions/'+key(sub),options),startRun:(id,body,options)=>post(app(id)+'/review-runs',body,options),
  run:(id,run,options)=>call(app(id)+'/review-runs/'+key(run),options),cancel:(id,run,options)=>post(app(id)+'/review-runs/'+key(run)+'/cancel',{},options),
  deleteRaw:(id,sub,{idempotencyKey,signal}={})=>call(app(id)+'/submissions/'+key(sub)+'/raw',{method:'DELETE',idempotencyKey:key(idempotencyKey),signal}),
  operation:(id,operation,options)=>call(app(id)+'/document-operations/'+key(operation),options),
  recover:(id,kind,idempotencyKey,options)=>{if(!['document-agreement','submissions','review-runs','cancel','delete'].includes(kind))throw Error('DOC_CLIENT_ID');return call(app(id)+'/document-operations/'+kind+'/'+key(idempotencyKey),options);},
 });
}
