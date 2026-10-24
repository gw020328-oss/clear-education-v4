// Dedicated local TEST lifecycle CLI; it exposes no signer activation or arbitrary RPC.
import {createEnvironment,startEnvironment,stopEnvironment,loadRuntime,environmentStatus} from './environment.mjs';
import {ExecutionReader} from './reader.mjs';
import {sha} from './private-storage.mjs';
const [action,id,...extra]=process.argv.slice(2);
try{
 if(extra.length)throw Error('E5_HOST_ARGUMENTS');let result;
 if(action==='create'&&!id){const created=await createEnvironment();result={environmentId:created.environmentId,runtimeHash:created.manifestHash,status:'TEST_RUNTIME_CREATED_API_BLOCKED'};}
 else if(action==='status'&&id)result=environmentStatus(id);
 else if(action==='stop'&&id){stopEnvironment(id);result={environmentId:id,status:'STOPPED'};}
 else if(action==='start'&&id){await startEnvironment(id);result={environmentId:id,status:'STARTED'};}
 else if(action==='probe'&&id){const manifest=loadRuntime(id),reader=new ExecutionReader(manifest);result={environmentId:id,runtimeHash:sha(manifest),capability:await reader.probe(),observation:await reader.observe()};}
 else throw Error('E5_HOST_USAGE_CREATE_STATUS_START_STOP_PROBE');
 console.log(JSON.stringify(result));
}catch(e){console.error(/^E5_[A-Z0-9_]+$/.test(e.message)?e.message:'E5_HOST_FAILED');process.exitCode=1;}
