// Child process touches only the synthetic temporary DB supplied over IPC.
import {createBootcampStore} from '../../src/bootcamp/store.mjs';
import {syntheticAuthority,START} from './fixture.mjs';
let store;
process.on('message',async message=>{
  if(message.action==='prepare'){
    const authority=syntheticAuthority();
    store=createBootcampStore({directory:message.directory,authentication:{origin:'https://clear.example.invalid',
      authorizeWorkflow:context=>({wallet:context.wallet,role:'participant'})},instanceId:'bootcamp-fixture',demoStartedAt:START,mode:'SYNTHETIC_FIXTURE',
      ...authority,now:()=>START,fault:stage=>{if(message.crashStage===stage)process.kill(process.pid,'SIGKILL');}});
    process.send({ready:true});
  }else if(message.action==='collect'){
    try{const value=await store.collect(message.context,message.applicationId,message.body,message.key);process.send({ok:true,target:value.record.target});}
    catch(error){process.send({ok:false,code:error.message});}
    finally{store.close();process.disconnect();}
  }
});
