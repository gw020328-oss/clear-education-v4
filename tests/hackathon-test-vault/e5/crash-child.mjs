// Explicit TEST subprocess only. CLI contains environment ID/action/cut, never secret bytes.
import {join} from 'node:path';
import {environmentRecord} from '../../../src/hackathon-test-vault/e5/environment.mjs';
import {readPrivate,atomicPrivate} from '../../../src/hackathon-test-vault/e5/private-storage.mjs';
import {OwnedExecutionService} from '../../../src/hackathon-test-vault/e5/envelope-service.mjs';
import {testController} from './controller-fixture.mjs';
import {childDiagnostic} from './child-diagnostics.mjs';
const [environmentId,action,point,slot='default',mode='plain']=process.argv.slice(2);
const started=Date.now();let service,request,phase='INIT',buildMs=0;
const diagnostic=(code,nativeCode)=>childDiagnostic({code,nativeCode,phase,cut:point,metrics:service?.metrics,buildMs,elapsedMs:Date.now()-started,leaseRemainingSeconds:request?request.binding.expiresAt-Math.floor(Date.now()/1000):undefined});
const emit=(event,code='OK',nativeCode)=>{const data={event,diagnostic:diagnostic(code,nativeCode)};if(process.send)process.send(data);else process.stderr.write('E5_CHILD_DIAGNOSTIC '+JSON.stringify(data)+'\n');};
// This IPC gate exists only in the subprocess TEST fixture. No production hook/lease override.
async function gate(name){phase=name;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{process.off('message',onMessage);reject(Error('E5_TEST_GATE_TIMEOUT'));},45000);const onMessage=m=>{if(m?.release===name){clearTimeout(timer);process.off('message',onMessage);resolve();}};process.on('message',onMessage);emit(name);});}
try{
 if(!['default','a','b'].includes(slot)||!['plain','nonce','checkpoint'].includes(mode)||!['seal','dispatch'].includes(action))throw Error('E5_TEST_ARGUMENT');
 const {dir}=environmentRecord(environmentId),controller=testController(environmentId);
 const read=()=>JSON.parse(readPrivate(join(dir,(slot==='default'?'crash':'race-'+slot)+'-request.json')));
 if(mode==='plain'){request=read();controller.state.fence=request.binding.workerFence;if(action==='dispatch')controller.commit(request);}
 controller.state.beforeCurrent=p=>{phase=p;};
 const buildStart=Date.now();service=new OwnedExecutionService({environmentId,controller,cut:p=>{if(p===point){emit('CUT');process.exit(86);}}});buildMs=Date.now()-buildStart;
 if(mode!=='plain'){
  await gate('READY');request=read();controller.state.fence=request.binding.workerFence;
  const rpc=service.reader.rpc;service.reader.rpc=async(method,args)=>{if(method==='eth_getTransactionCount'&&args?.[1]==='pending')await gate('NONCE_READY');return rpc(method,args);};
  if(mode==='checkpoint'&&slot==='a'){const compare=service.reader.compare.bind(service.reader);service.reader.compare=async(...args)=>{const result=await compare(...args);await gate('CHECKPOINT_READY');return result;};}
 }
 phase='START';const result=await service[action](request);atomicPrivate(join(dir,(slot==='default'?'crash':'race-'+slot)+'-result.json'),result);phase='DONE';emit('RESULT');process.exitCode=0;
}catch(error){emit('RESULT',error.message,error.code);process.exitCode=87;}
finally{service?.close();if(process.connected)process.disconnect();}
