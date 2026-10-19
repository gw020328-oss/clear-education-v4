import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {syntheticAuthority,START} from '../bootcamp-store/fixture.mjs';
import {H,bindObservation} from './fixture.mjs';
const serviceContext=Object.freeze({});
process.on('message',async message=>{
 let store,authentication;
 try{
  authentication=createApplicationService({...message.authentication,now:()=>message.time});
  const executionServices={version:'clear-bootcamp-test-execution-port.1',runtimeId:'e5-offline-runtime',runtimePinHash:H('runtime-pin'),
   authorizeService:context=>{if(context!==serviceContext)throw Error('SERVICE_FORBIDDEN');return {serviceId:message.owner??'worker-one',runtimeId:'e5-offline-runtime',expiresAt:message.time+120};},
   reader:{snapshot:async request=>bindObservation(message.observation,request)},envelope:{lookup:async()=>message.manifest}};
  store=createBootcampStore({directory:message.directory,authentication,instanceId:'bootcamp-fixture',demoStartedAt:START,mode:'SYNTHETIC_FIXTURE',
   ...syntheticAuthority({now:()=>message.time}),now:()=>message.time,operatorBindings:message.bindings,executionServices,
   fault:stage=>{if(stage===message.crashStage)process.kill(process.pid,'SIGKILL');}});
  let result;
  if(message.action==='acquire')result=store.execution.acquire(serviceContext,message.intentId,{owner:message.owner,generation:1});
  if(message.action==='enqueue')store.execution.enqueue(message.context,message.applicationId,message.body,message.key);
  if(message.action==='attempt')store.execution.beginAttempt(serviceContext,message.handle,store.execution.inspect(serviceContext,message.handle));
  if(message.action==='observe')await store.execution.observe(serviceContext,message.handle,store.execution.inspect(serviceContext,message.handle));
  if(message.action==='envelope')await store.execution.attachEnvelope(serviceContext,message.handle,store.execution.inspect(serviceContext,message.handle),message.manifest.envelopeRef);
  process.send({finished:true,result});
 }catch(error){process.send({error:error.message});}
 finally{store?.close();authentication?.close();process.disconnect();}
});
process.send({ready:true});
