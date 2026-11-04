import {createNormalBootcampClient} from '../bootcamp/normal-client.mjs';
import {createProductSession} from './product-session.mjs';
import {canonical,exactKeys} from '../policy/values.mjs';
const check=(ok,code='MOODLE_WORKFLOW_COMMAND')=>{if(!ok)throw Error(code);};
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9.-]{0,63}$/.test(v);
const same=(a,b)=>canonical(a)===canonical(b);
const fields={
 'read-session':[], 'create-application':['idempotencyKey'], 'read-application':['applicationId'],
 'bind-source-session':['applicationId'], 'read-source-signature':['applicationId'],
 'approve-source-signature':['reviewed'], 'read-registration':[], 'approve-registration':['reviewed'],
 'approve-reflection':['reviewed','idempotencyKey'], 'consent':['reviewed','value','idempotencyKey'],
 'payment-receipt':['applicationId'], 'decision-evidence':['applicationId'],
 'read-operation':['applicationId','operationId','kind'],
};
const reads=new Set(['read-session','read-application','read-source-signature','read-registration','payment-receipt','decision-evidence','read-operation']);
export function validateNativeWorkflowCommand(input) {
 check(input&&Object.hasOwn(fields,input.action));exactKeys(input,['action',...fields[input.action]],'MOODLE_WORKFLOW_COMMAND');
 if(Object.hasOwn(input,'applicationId'))check(id(input.applicationId));
 if(input.action==='read-operation')check(id(input.operationId)&&['application','procedure'].includes(input.kind));
 if(Object.hasOwn(input,'idempotencyKey'))check(typeof input.idempotencyKey==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(input.idempotencyKey));
 if(Object.hasOwn(input,'reviewed'))check(input.reviewed&&Object.getPrototypeOf(input.reviewed)===Object.prototype);
 if(input.action==='consent')check(['AGREE','WITHDRAW'].includes(input.value));
 return input;
}
export const nativeWorkflowIsRead=input=>reads.has(input.action);
const readable=path=>['/bootcamp/v4/session','/__dev/config'].includes(path)
 || /^\/bootcamp\/v1\/applications\/[a-z][a-z0-9.-]{0,63}\/operations\/[a-z][a-z0-9.-]{0,63}$/.test(path)
 || /^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/procedure-operations\/[a-z][a-z0-9.-]{0,63}$/.test(path)
 || /^\/bootcamp\/v2\/applications\/[a-z][a-z0-9.-]{0,63}\/operations$/.test(path)
 || /^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/(procedure|decision-evidence)$/.test(path)
 || /^\/bootcamp\/v4\/applications\/[a-z][a-z0-9.-]{0,63}\/(source-signature|payment-receipt)$/.test(path)
 || /^\/bootcamp\/v3\/applications\/[a-z][a-z0-9.-]{0,63}\/recipient-registration(?:\?checkpoint=[A-Za-z0-9%._~-]{1,768})?$/.test(path);
const aiBody=v=>({version:'clear-normal-ai-approval-action.1',applicationId:v.applicationId,bodySha256:v.bodySha256,
 planHash:v.planHash,contextHash:v.contextHash,runBindingHash:v.runBindingHash,codeHead:v.codeHead,model:v.model,
 action:'APPROVE_THIS_INPUT_ONCE',costAcknowledgment:v.costAcknowledgment});

// Private adapter: C gets fixed actions and DTOs, never request/session/wallet/signature ports.
export function createNativeWorkflow({session,wallet,config,command,guard}) {
 const request=async(path,options={})=>{
  await guard(options.signal);
  const method=options.method??'GET';
  if(method==='POST')return command({method,path,body:options.body,idempotencyKey:options.idempotencyKey??null},options.signal);
  check(method==='GET'&&readable(path),'MOODLE_WORKFLOW_ROUTE');
  const result=await session.request(path,options);await guard(options.signal);return result;
 };
 const safeSession={request,assertSession:signal=>session.assertSession(signal)};
 const normal=createNormalBootcampClient({request}),product=createProductSession({session:safeSession,wallet,config});
 let application=null,source=null,reflection=null;
 return Object.freeze({async run(input,{signal}={}) {
  input=validateNativeWorkflowCommand(structuredClone(input));await guard(signal);
  let result;
  switch(input.action) {
   case 'read-session': result=await normal.session({signal});reflection=structuredClone(result.aiApproval??null);break;
   case 'create-application':
    result=await request('/bootcamp/v1/applications',{method:'POST',body:{},idempotencyKey:input.idempotencyKey,signal});
    check(id(result?.record?.applicationId)&&id(result?.record?.operationId),'MOODLE_WORKFLOW_RESPONSE');break;
   case 'read-application': result=await normal.view(input.applicationId,{signal});application=structuredClone(result);break;
   case 'bind-source-session': result=await normal.bindSourceSession(input.applicationId,{signal});break;
   case 'read-source-signature': result=await normal.pendingSourceSignature(input.applicationId,{signal});source=structuredClone(result);break;
   case 'approve-source-signature': {
    check(source&&same(source,input.reviewed),'SOURCE_REVIEW_REQUIRED');const reviewed=source;source=null;
    result=await product.submitSource(reviewed,{signal});break;
   }
   case 'read-registration': result=await product.readRegistration({signal});break;
   case 'approve-registration': result=await product.submitRegistration(input.reviewed,{signal});break;
   case 'approve-reflection': {
    check(reflection&&same(reflection,input.reviewed)&&reflection.permitted===true,'AI_REVIEW_REQUIRED');
    const reviewed=reflection;reflection=null;
    const latest=(await normal.session({signal})).aiApproval;
    check(latest?.permitted===true&&same(aiBody(latest),aiBody(reviewed)),'AI_REVIEW_CHANGED');
    result=await request('/bootcamp/v4/applications/'+reviewed.applicationId+'/reflection-approval',
     {method:'POST',body:aiBody(reviewed),idempotencyKey:input.idempotencyKey,signal});break;
   }
   case 'consent': {
    check(application&&same(application,input.reviewed),'CONSENT_REVIEW_REQUIRED');const reviewed=application;application=null;
    const latest=await normal.view(reviewed.applicationId,{signal});
    check(same(latest.target,reviewed.target)&&same(latest.agreedPayment,reviewed.agreedPayment),'CONSENT_REVIEW_CHANGED');
    result=await normal.consent(reviewed.applicationId,reviewed,input.value,{idempotencyKey:input.idempotencyKey,signal});break;
   }
   case 'payment-receipt': result=await normal.paymentReceipt(input.applicationId,{signal});break;
   case 'decision-evidence': result=await normal.decisionEvidence(input.applicationId,{signal});break;
   case 'read-operation':
    result=input.kind==='procedure'?await normal.operation(input.applicationId,input.operationId,{signal})
     :await request('/bootcamp/v1/applications/'+input.applicationId+'/operations/'+input.operationId,{signal});
    check(result?.record?.applicationId===input.applicationId&&result.record.operationId===input.operationId
      &&typeof result.current==='boolean','MOODLE_WORKFLOW_RESPONSE');break;
  }
  await guard(signal);return structuredClone(result);
 }});
}
