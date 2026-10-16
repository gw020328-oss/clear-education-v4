// Browser-safe adapter. Inject walletClient.request.bind(walletClient).
// No Node imports, credentials, storage, automatic POST retry or F0 DTO changes.
export const SOURCE_HTTP_VERSION='clear-mvp-source-http.1';
export function createWorkflowSourceClient({request}) {
  if(typeof request!=='function')throw Error('MVP_CLIENT_CONFIG');
  const id=value=>{if(typeof value!=='string'||!/^[a-z][a-z0-9.-]{0,63}$/.test(value))throw Error('MVP_CLIENT_ID');return value;};
  const checked=value=>{
    if(!value||value.version!==SOURCE_HTTP_VERSION||value.paymentAllowed!==false||value.policyPublished!==false||value.userConsentVerified!==false
      ||value.sourceVerified!==false||value.identityVerified!==false||value.grant!=='HOLD'||value.outbox!=='HOLD'||value.independentClaim!=='NO_GO')throw Error('MVP_CLIENT_RESPONSE');
    return value;
  };
  const call=async(path,options)=>checked(await request(path,options));
  const path=bundleId=>'/mvp/source-bundles/'+id(bundleId);
  const post=(url,body,{idempotencyKey,signal}={})=>{id(idempotencyKey);return call(url,{method:'POST',body,idempotencyKey,signal});};
  return Object.freeze({
    catalogue:options=>call('/mvp/source-bundles',options),
    preview:(bundleId,options)=>call(path(bundleId),options),
    capture:(bundleId,body,options)=>post(path(bundleId)+'/snapshots',body,options),
    propose:(bundleId,body,options)=>post(path(bundleId)+'/drafts',body,options),
    review:(bundleId,body,options)=>post(path(bundleId)+'/reviews',body,options),
    async reviews(bundleId,options){const result=await request(path(bundleId)+'/reviews',options);if(!Array.isArray(result))throw Error('MVP_CLIENT_RESPONSE');return result.map(checked);},
    operation:(operationId,options)=>call('/mvp/operations/'+id(operationId),options),
    recover:(bundleId,kind,key,options)=>{if(!['snapshots','drafts'].includes(kind))throw Error('MVP_CLIENT_ID');return call(path(bundleId)+'/operations/'+kind+'/'+id(key),options);},
    cancel:(operationId,{signal}={})=>call('/mvp/operations/'+id(operationId)+'/cancel',{method:'POST',body:{},signal}),
    describe:()=>({label:'개발용 원문 검토',note:'기관 승인·학생 동의·지급을 확정하지 않습니다.'}),
  });
}
