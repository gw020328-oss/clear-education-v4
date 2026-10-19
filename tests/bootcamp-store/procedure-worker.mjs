// Own synthetic DB + real synthetic authentication service only; no external IO.
import {createApplicationService} from '../../src/application/service.mjs';
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {syntheticAuthority,START} from './fixture.mjs';
let store,authentication;
process.on('message',message=>{
 if(message.action==='prepare'){
  authentication=createApplicationService({...message.authentication,now:()=>message.time});
  const authority=syntheticAuthority({now:()=>message.time});
  store=createBootcampStore({directory:message.directory,authentication,instanceId:'bootcamp-fixture',demoStartedAt:START,mode:'SYNTHETIC_FIXTURE',
   ...authority,now:()=>message.time,operatorBindings:message.bindings,procedurePorts:{execution:'SYNTHETIC_PORT_FIXTURE',funding:()=>message.funding,chain:()=>message.chain,
    authorization:()=>message.authorization,revalidationAssessment:()=>message.assessment},fault:stage=>{if(stage===message.crashStage)process.kill(process.pid,'SIGKILL');}});
  process.send({ready:true});
 }else if(message.action==='command'){
  try{const value=store[message.method](message.context,message.applicationId,message.body,message.key);process.send({ok:true,target:value.record.target});}
  catch(error){process.send({ok:false,code:error.message});}
  finally{store.close();authentication.close();process.disconnect();}
 }
});
